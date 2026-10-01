export interface AppSettings {
  cacheLimitMb: number;
  cacheLocation: string;
  autosaveDelayMs: number;
  gridDefault: boolean;
  snapDefault: boolean;
  cloudApiUrl: string;
  shareDomain: string;
  storageProvider: "local-cpanel" | "s3" | "r2" | "b2" | "nas";
  workerUrl: string;
}

const SETTINGS_KEY = "zaxis-kdp:settings";

export const defaultSettings: AppSettings = {
  cacheLimitMb: 500,
  cacheLocation: "System Default",
  autosaveDelayMs: 450,
  gridDefault: true,
  snapDefault: true,
  cloudApiUrl: "",
  shareDomain: "",
  storageProvider: "local-cpanel",
  workerUrl: ""
};

export function loadAppSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaultSettings;
  }
}

export function saveAppSettings(settings: AppSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearLocalRecoveryCache() {
  const keys = Object.keys(window.localStorage);
  for (const key of keys) {
    if (key.startsWith("zaxis-kdp:project:")) {
      window.localStorage.removeItem(key);
    }
  }
  window.localStorage.removeItem("zaxis-kdp:projects:index");
  window.localStorage.removeItem("zaxis-kdp:projects:active");
}
