import type { Unit } from "@zaxis-kdp/shared";

export interface ProjectPreset {
  id: string;
  label: string;
  category: "kdp" | "graphic-design";
  width: number;
  height: number;
  unit: Unit;
  mode: "kdp" | "graphic-design";
}

export const projectPresets: ProjectPreset[] = [
  { id: "kdp-5x8", label: "KDP 5 × 8 in", category: "kdp", width: 5, height: 8, unit: "in", mode: "kdp" },
  { id: "kdp-5.25x8", label: "KDP 5.25 × 8 in", category: "kdp", width: 5.25, height: 8, unit: "in", mode: "kdp" },
  { id: "kdp-5.5x8.5", label: "KDP 5.5 × 8.5 in", category: "kdp", width: 5.5, height: 8.5, unit: "in", mode: "kdp" },
  { id: "kdp-6x9", label: "KDP 6 × 9 in", category: "kdp", width: 6, height: 9, unit: "in", mode: "kdp" },
  { id: "kdp-7x10", label: "KDP 7 × 10 in", category: "kdp", width: 7, height: 10, unit: "in", mode: "kdp" },
  { id: "kdp-8x10", label: "KDP 8 × 10 in", category: "kdp", width: 8, height: 10, unit: "in", mode: "kdp" },
  { id: "kdp-8.5x11", label: "KDP 8.5 × 11 in", category: "kdp", width: 8.5, height: 11, unit: "in", mode: "kdp" },
  { id: "a4", label: "A4", category: "graphic-design", width: 210, height: 297, unit: "mm", mode: "graphic-design" },
  { id: "a5", label: "A5", category: "graphic-design", width: 148, height: 210, unit: "mm", mode: "graphic-design" },
  { id: "instagram-square", label: "Instagram Square 1080", category: "graphic-design", width: 1080, height: 1080, unit: "px", mode: "graphic-design" },
  { id: "story", label: "Story / Reel 1080 × 1920", category: "graphic-design", width: 1080, height: 1920, unit: "px", mode: "graphic-design" },
  { id: "youtube-thumb", label: "YouTube Thumbnail 1280 × 720", category: "graphic-design", width: 1280, height: 720, unit: "px", mode: "graphic-design" },
  { id: "flyer-letter", label: "US Letter Flyer", category: "graphic-design", width: 8.5, height: 11, unit: "in", mode: "graphic-design" }
];
