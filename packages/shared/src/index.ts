export type Unit = "px" | "in" | "cm" | "mm" | "pt" | "pc";

export type SaveState = "saved" | "saving" | "offline" | "error";

export interface Size {
  width: number;
  height: number;
  unit: Unit;
}

export interface CloudConnectionConfig {
  apiUrl: string;
  shareDomain?: string;
  workerUrl?: string;
  storageProvider: "server" | "s3-compatible" | "r2" | "b2";
}

export interface FeatureFlags {
  kdpMode: boolean;
  graphicDesignMode: boolean;
  backgroundRemoval: boolean;
  pdfTools: boolean;
}
