import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export async function savePdfToComputer(
  bytes: Uint8Array,
  suggestedName: string
): Promise<string | null> {
  const safeName = ensurePdfExtension(suggestedName);

  try {
    const path = await save({
      title: "Save Zaxis KDP PDF",
      defaultPath: safeName,
      filters: [
        {
          name: "PDF Document",
          extensions: ["pdf"]
        }
      ]
    });

    if (!path) return null;

    await invoke<number>("write_binary_file", {
      path,
      bytes: Array.from(bytes)
    });

    return path;
  } catch {
    const blob = new Blob(
      [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
      { type: "application/pdf" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeName;
    anchor.click();
    URL.revokeObjectURL(url);
    return "browser-download:" + safeName;
  }
}

export function ensurePdfExtension(name: string) {
  const trimmed = name.trim() || "zaxis-kdp-export";
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : trimmed + ".pdf";
}


export async function saveBinaryToComputer(
  bytes: Uint8Array,
  suggestedName: string,
  options: {
    title: string;
    mimeType: string;
    filterName: string;
    extensions: string[];
  }
): Promise<string | null> {
  const safeName = suggestedName.trim() || "zaxis-kdp-output";

  try {
    const path = await save({
      title: options.title,
      defaultPath: safeName,
      filters: [
        {
          name: options.filterName,
          extensions: options.extensions
        }
      ]
    });

    if (!path) return null;

    await invoke<number>("write_binary_file", {
      path,
      bytes: Array.from(bytes)
    });

    return path;
  } catch {
    const blob = new Blob(
      [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
      { type: options.mimeType }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeName;
    anchor.click();
    URL.revokeObjectURL(url);
    return "browser-download:" + safeName;
  }
}
