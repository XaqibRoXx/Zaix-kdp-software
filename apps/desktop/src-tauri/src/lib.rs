use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::SystemTime,
};

#[derive(Serialize)]
struct CacheStatus {
    path: String,
    size_bytes: u64,
    file_count: u64,
}

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    let mut fonts = BTreeSet::new();

    let windows_dir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let font_dir = PathBuf::from(windows_dir).join("Fonts");

    if let Ok(entries) = fs::read_dir(font_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();

            if !matches!(extension.as_str(), "ttf" | "otf" | "ttc") {
                continue;
            }

            if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
                let name = stem.replace('_', " ").trim().to_string();
                if !name.is_empty() {
                    fonts.insert(name);
                }
            }
        }
    }

    fonts.into_iter().collect()
}

fn resolve_cache_path(configured_path: &str) -> PathBuf {
    if !configured_path.trim().is_empty() && configured_path != "System Default" {
        return PathBuf::from(configured_path);
    }

    let base = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());

    base.join("Zaxis KDP").join("Cache")
}

fn collect_cache_files(path: &Path, files: &mut Vec<(PathBuf, u64, SystemTime)>) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();

        if entry_path.is_dir() {
            collect_cache_files(&entry_path, files);
            continue;
        }

        if let Ok(metadata) = entry.metadata() {
            files.push((
                entry_path,
                metadata.len(),
                metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
            ));
        }
    }
}

fn cache_status_for(path: &Path) -> CacheStatus {
    let mut files = Vec::new();
    collect_cache_files(path, &mut files);

    CacheStatus {
        path: path.to_string_lossy().to_string(),
        size_bytes: files.iter().map(|(_, size, _)| *size).sum(),
        file_count: files.len() as u64,
    }
}

fn trim_cache(path: &Path, max_bytes: u64) -> Result<(), String> {
    let mut files = Vec::new();
    collect_cache_files(path, &mut files);

    let mut current_size: u64 = files.iter().map(|(_, size, _)| *size).sum();
    if current_size <= max_bytes {
        return Ok(());
    }

    files.sort_by_key(|(_, _, modified)| *modified);

    for (file_path, size, _) in files {
        if current_size <= max_bytes {
            break;
        }

        fs::remove_file(&file_path)
            .map_err(|error| format!("Failed to trim cache file {}: {error}", file_path.display()))?;
        current_size = current_size.saturating_sub(size);
    }

    Ok(())
}

#[tauri::command]
fn ensure_native_cache(configured_path: String, max_mb: u64) -> Result<CacheStatus, String> {
    let path = resolve_cache_path(&configured_path);
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create cache directory {}: {error}", path.display()))?;

    let max_bytes = max_mb.saturating_mul(1024).saturating_mul(1024);
    trim_cache(&path, max_bytes)?;

    Ok(cache_status_for(&path))
}

#[tauri::command]
fn get_native_cache_status(configured_path: String) -> Result<CacheStatus, String> {
    let path = resolve_cache_path(&configured_path);
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create cache directory {}: {error}", path.display()))?;

    Ok(cache_status_for(&path))
}

#[tauri::command]
fn clear_native_cache(configured_path: String) -> Result<CacheStatus, String> {
    let path = resolve_cache_path(&configured_path);

    if path.exists() {
        fs::remove_dir_all(&path)
            .map_err(|error| format!("Failed to clear cache directory {}: {error}", path.display()))?;
    }

    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to recreate cache directory {}: {error}", path.display()))?;

    Ok(cache_status_for(&path))
}


fn credential_file_path() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .map_err(|_| "LOCALAPPDATA is not available.".to_string())?;

    let directory = base.join("Zaxis KDP").join("Credentials");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create credential directory: {error}"))?;

    Ok(directory.join("cloud-token.dpapi"))
}

#[tauri::command]
fn store_cloud_token(token: String) -> Result<(), String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("Token cannot be empty.".to_string());
    }

    let path = credential_file_path()?;
    let script = r#"
$secure = ConvertTo-SecureString -String $env:ZAXIS_KDP_TOKEN -AsPlainText -Force
$encrypted = ConvertFrom-SecureString -SecureString $secure
[System.IO.File]::WriteAllText($env:ZAXIS_KDP_TOKEN_PATH, $encrypted)
"#;

    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("ZAXIS_KDP_TOKEN", token)
        .env("ZAXIS_KDP_TOKEN_PATH", &path)
        .status()
        .map_err(|error| format!("Failed to start Windows credential encryption: {error}"))?;

    if !status.success() {
        return Err("Windows credential encryption failed.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn load_cloud_token() -> Result<Option<String>, String> {
    let path = credential_file_path()?;

    if !path.exists() {
        return Ok(None);
    }

    let script = r#"
$encrypted = [System.IO.File]::ReadAllText($env:ZAXIS_KDP_TOKEN_PATH)
if ([string]::IsNullOrWhiteSpace($encrypted)) { exit 0 }
$secure = ConvertTo-SecureString $encrypted
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr))
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
"#;

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("ZAXIS_KDP_TOKEN_PATH", &path)
        .output()
        .map_err(|error| format!("Failed to load Windows credential: {error}"))?;

    if !output.status.success() {
        return Err("Windows credential decryption failed.".to_string());
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!token.is_empty()).then_some(token))
}

#[tauri::command]
fn clear_cloud_token() -> Result<(), String> {
    let path = credential_file_path()?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Failed to remove stored cloud token: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<u64, String> {
    let target = PathBuf::from(path);

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create export directory: {error}"))?;
    }

    fs::write(&target, &bytes)
        .map_err(|error| format!("Failed to write exported file: {error}"))?;

    Ok(bytes.len() as u64)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_system_fonts,
            ensure_native_cache,
            get_native_cache_status,
            clear_native_cache,
            store_cloud_token,
            load_cloud_token,
            clear_cloud_token,
            write_binary_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Zaxis KDP");
}
