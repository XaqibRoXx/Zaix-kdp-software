export type PageNumberFormat = "arabic" | "roman-lower" | "roman-upper";
export type PageNumberPosition =
  | "bottom-center"
  | "bottom-outside"
  | "top-center"
  | "top-outside";

export interface BookChapter {
  id: string;
  title: string;
  startPage: number;
}

export interface PageNumberSettings {
  enabled: boolean;
  startPage: number;
  startNumber: number;
  format: PageNumberFormat;
  position: PageNumberPosition;
  skipChapterOpeners: boolean;
}

export interface BookStructure {
  chapters: BookChapter[];
  pageNumbers: PageNumberSettings;
  tocTitle: string;
}

export function createDefaultBookStructure(): BookStructure {
  return {
    chapters: [],
    pageNumbers: {
      enabled: false,
      startPage: 1,
      startNumber: 1,
      format: "arabic",
      position: "bottom-outside",
      skipChapterOpeners: false
    },
    tocTitle: "Table of Contents"
  };
}

export function normalizeBookStructure(input?: Partial<BookStructure>): BookStructure {
  const defaults = createDefaultBookStructure();

  return {
    chapters: Array.isArray(input?.chapters)
      ? input.chapters
          .filter((chapter) => chapter && typeof chapter.title === "string")
          .map((chapter) => ({
            id: chapter.id || makeBookId("chapter"),
            title: chapter.title.trim() || "Chapter",
            startPage: Math.max(1, Math.floor(chapter.startPage || 1))
          }))
          .sort((a, b) => a.startPage - b.startPage)
      : [],
    pageNumbers: {
      ...defaults.pageNumbers,
      ...(input?.pageNumbers ?? {}),
      startPage: Math.max(1, Math.floor(input?.pageNumbers?.startPage ?? 1)),
      startNumber: Math.max(1, Math.floor(input?.pageNumbers?.startNumber ?? 1))
    },
    tocTitle: input?.tocTitle?.trim() || defaults.tocTitle
  };
}

export function formatBookPageNumber(value: number, format: PageNumberFormat): string {
  if (format === "arabic") return String(value);

  const roman = toRoman(Math.max(1, Math.floor(value)));
  return format === "roman-lower" ? roman.toLowerCase() : roman;
}

export function getPageNumberLabel(
  physicalPage: number,
  structure: BookStructure
): string | null {
  const settings = structure.pageNumbers;

  if (!settings.enabled || physicalPage < settings.startPage) {
    return null;
  }

  if (
    settings.skipChapterOpeners &&
    structure.chapters.some((chapter) => chapter.startPage === physicalPage)
  ) {
    return null;
  }

  const logicalNumber = settings.startNumber + (physicalPage - settings.startPage);
  return formatBookPageNumber(logicalNumber, settings.format);
}

export function chapterForPage(
  physicalPage: number,
  structure: BookStructure
): BookChapter | null {
  let current: BookChapter | null = null;

  for (const chapter of structure.chapters) {
    if (chapter.startPage <= physicalPage) current = chapter;
    else break;
  }

  return current;
}

export function createChapter(title: string, startPage: number): BookChapter {
  return {
    id: makeBookId("chapter"),
    title: title.trim() || "Chapter",
    startPage: Math.max(1, Math.floor(startPage))
  };
}

function toRoman(value: number): string {
  const map: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];

  let remaining = value;
  let output = "";

  for (const [amount, symbol] of map) {
    while (remaining >= amount) {
      output += symbol;
      remaining -= amount;
    }
  }

  return output;
}

function makeBookId(prefix: string) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}
