use std::{collections::BTreeSet, fs, path::PathBuf};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_system_fonts])
        .run(tauri::generate_context!())
        .expect("error while running Zaxis KDP");
}
