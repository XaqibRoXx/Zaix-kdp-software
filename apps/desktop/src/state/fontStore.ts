export interface StoredFont {
  family: string;
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
  addedAt: string;
}

const DB_NAME = "zaxis-kdp-fonts";
const STORE_NAME = "fonts";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "family" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open font database"));
  });
}

export async function saveCustomFont(file: File, family: string) {
  const db = await openDb();
  const data = await file.arrayBuffer();

  const record: StoredFont = {
    family,
    fileName: file.name,
    mimeType: file.type || "font/ttf",
    data,
    addedAt: new Date().toISOString()
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to save custom font"));
  });

  db.close();
}

export async function getStoredFont(family: string): Promise<StoredFont | null> {
  const db = await openDb();

  const font = await new Promise<StoredFont | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(family);
    request.onsuccess = () => resolve(request.result as StoredFont | undefined);
    request.onerror = () => reject(request.error ?? new Error("Failed to load custom font"));
  });

  db.close();
  return font ?? null;
}

export async function listStoredFonts(): Promise<StoredFont[]> {
  const db = await openDb();

  const fonts = await new Promise<StoredFont[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredFont[]);
    request.onerror = () => reject(request.error ?? new Error("Failed to load custom fonts"));
  });

  db.close();
  return fonts.sort((a, b) => a.family.localeCompare(b.family));
}

export async function deleteStoredFont(family: string) {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(family);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to delete custom font"));
  });

  db.close();
}

export async function registerStoredFonts(): Promise<string[]> {
  const fonts = await listStoredFonts();
  const loaded: string[] = [];

  for (const stored of fonts) {
    try {
      const font = new FontFace(stored.family, stored.data);
      await font.load();
      document.fonts.add(font);
      loaded.push(stored.family);
    } catch {
      // Keep one bad font from preventing other saved fonts from loading.
    }
  }

  return loaded;
}
