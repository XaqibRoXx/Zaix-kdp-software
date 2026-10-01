import { PDFDocument, degrees } from "pdf-lib";
import JSZip from "jszip";

export interface PdfStructureInfo {
  name: string;
  sizeBytes: number;
  pageCount: number;
  pageSizes: Array<{ width: number; height: number; rotation: number }>;
}

export interface PdfCompareResult {
  left: PdfStructureInfo;
  right: PdfStructureInfo;
  samePageCount: boolean;
  samePageSizes: boolean;
  sizeDeltaBytes: number;
}

export interface PdfSplitBundleResult {
  bytes: Uint8Array;
  outputCount: number;
  fileNames: string[];
}

export interface PdfOptimizeResult {
  bytes: Uint8Array;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  savedBytes: number;
  savedPercent: number;
  changed: boolean;
}

export async function mergePdfFiles(files: File[]): Promise<Uint8Array> {
  if (files.length < 2) {
    throw new Error("Select at least two PDF files to merge.");
  }

  const output = await PDFDocument.create();

  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer(), {
      updateMetadata: false
    });
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }

  return output.save({
    useObjectStreams: true,
    addDefaultPage: false
  });
}

export async function extractPdfPages(file: File, range: string): Promise<Uint8Array> {
  const source = await PDFDocument.load(await file.arrayBuffer(), {
    updateMetadata: false
  });

  const indices = parsePdfPageRange(range, source.getPageCount());

  if (indices.length === 0) {
    throw new Error("The selected page range is empty or invalid.");
  }

  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indices);
  pages.forEach((page) => output.addPage(page));

  return output.save({
    useObjectStreams: true,
    addDefaultPage: false
  });
}

export async function rotatePdfPages(
  file: File,
  range: string,
  clockwiseDegrees: 90 | 180 | 270
): Promise<Uint8Array> {
  const document = await PDFDocument.load(await file.arrayBuffer(), {
    updateMetadata: false
  });

  const indices = parsePdfPageRange(range, document.getPageCount());

  if (indices.length === 0) {
    throw new Error("The selected page range is empty or invalid.");
  }

  for (const index of indices) {
    const page = document.getPage(index);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + clockwiseDegrees) % 360));
  }

  return document.save({ useObjectStreams: true });
}

export async function removePdfPages(file: File, range: string): Promise<Uint8Array> {
  const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const remove = new Set(parsePdfPageRange(range, source.getPageCount()));

  if (remove.size === 0) throw new Error("Select one or more pages to remove.");
  if (remove.size >= source.getPageCount()) throw new Error("At least one page must remain.");

  const output = await PDFDocument.create();
  const keepIndices = source.getPageIndices().filter((index) => !remove.has(index));
  const pages = await output.copyPages(source, keepIndices);
  pages.forEach((page) => output.addPage(page));

  return output.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function reorderPdfPages(file: File, order: string): Promise<Uint8Array> {
  const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const total = source.getPageCount();
  const values = order
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value))
    .map((value) => value - 1);

  if (values.length !== total) {
    throw new Error("Reorder list must contain every page exactly once.");
  }

  const unique = new Set(values);
  if (unique.size !== total || values.some((value) => value < 0 || value >= total)) {
    throw new Error("Reorder list contains duplicates or invalid page numbers.");
  }

  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, values);
  pages.forEach((page) => output.addPage(page));
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function cropPdfPages(
  file: File,
  range: string,
  marginsPt: { top: number; right: number; bottom: number; left: number }
): Promise<Uint8Array> {
  const document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const indices = parsePdfPageRange(range, document.getPageCount());

  if (indices.length === 0) throw new Error("Select one or more pages to crop.");

  for (const index of indices) {
    const page = document.getPage(index);
    const box = page.getCropBox();
    const left = Math.max(0, marginsPt.left);
    const right = Math.max(0, marginsPt.right);
    const top = Math.max(0, marginsPt.top);
    const bottom = Math.max(0, marginsPt.bottom);
    const width = box.width - left - right;
    const height = box.height - top - bottom;

    if (width <= 10 || height <= 10) {
      throw new Error("Crop margins are too large for page " + (index + 1) + ".");
    }

    page.setCropBox(box.x + left, box.y + bottom, width, height);
  }

  return document.save({ useObjectStreams: true });
}

export async function inspectPdfStructure(file: File): Promise<PdfStructureInfo> {
  const document = await PDFDocument.load(await file.arrayBuffer(), {
    updateMetadata: false
  });

  return {
    name: file.name,
    sizeBytes: file.size,
    pageCount: document.getPageCount(),
    pageSizes: document.getPages().map((page) => ({
      width: round2(page.getWidth()),
      height: round2(page.getHeight()),
      rotation: page.getRotation().angle
    }))
  };
}

export async function comparePdfStructure(left: File, right: File): Promise<PdfCompareResult> {
  const [leftInfo, rightInfo] = await Promise.all([
    inspectPdfStructure(left),
    inspectPdfStructure(right)
  ]);

  const samePageSizes =
    leftInfo.pageSizes.length === rightInfo.pageSizes.length &&
    leftInfo.pageSizes.every((page, index) => {
      const other = rightInfo.pageSizes[index];
      return (
        other &&
        page.width === other.width &&
        page.height === other.height &&
        page.rotation === other.rotation
      );
    });

  return {
    left: leftInfo,
    right: rightInfo,
    samePageCount: leftInfo.pageCount === rightInfo.pageCount,
    samePageSizes,
    sizeDeltaBytes: rightInfo.sizeBytes - leftInfo.sizeBytes
  };
}

export async function splitPdfToZip(
  file: File,
  groups: string
): Promise<PdfSplitBundleResult> {
  const source = await PDFDocument.load(await file.arrayBuffer(), {
    updateMetadata: false
  });

  const totalPages = source.getPageCount();
  const normalizedGroups = groups
    .split(";")
    .map((group) => group.trim())
    .filter(Boolean);

  const requestedGroups =
    normalizedGroups.length > 0
      ? normalizedGroups
      : Array.from({ length: totalPages }, (_, index) => String(index + 1));

  const zip = new JSZip();
  const base = file.name.replace(/\.pdf$/i, "") || "split";
  const fileNames: string[] = [];

  for (let index = 0; index < requestedGroups.length; index += 1) {
    const group = requestedGroups[index];
    const indices = parsePdfPageRange(group, totalPages);

    if (indices.length === 0) {
      throw new Error("Split group '" + group + "' is empty or invalid.");
    }

    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, indices);
    pages.forEach((page) => output.addPage(page));

    const bytes = await output.save({
      useObjectStreams: true,
      addDefaultPage: false
    });

    const safeGroup = group.replace(/[^0-9,-]+/g, "-").replace(/^-+|-+$/g, "") || String(index + 1);
    const fileName = base + "-part-" + String(index + 1).padStart(2, "0") + "-" + safeGroup + ".pdf";
    zip.file(fileName, bytes);
    fileNames.push(fileName);
  }

  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  return {
    bytes: archive,
    outputCount: fileNames.length,
    fileNames
  };
}

export async function optimizePdfLossless(file: File): Promise<PdfOptimizeResult> {
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const document = await PDFDocument.load(originalBytes, {
    updateMetadata: false,
    ignoreEncryption: false
  });

  const optimized = await document.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
    objectsPerTick: 50
  });

  const optimizedSize = optimized.byteLength;
  const originalSize = originalBytes.byteLength;
  const changed = optimizedSize < originalSize;
  const chosen = changed ? optimized : originalBytes;
  const savedBytes = Math.max(0, originalSize - chosen.byteLength);
  const savedPercent = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

  return {
    bytes: chosen,
    originalSizeBytes: originalSize,
    optimizedSizeBytes: chosen.byteLength,
    savedBytes,
    savedPercent: Math.round(savedPercent * 100) / 100,
    changed
  };
}

export function parsePdfPageRange(range: string, totalPages: number): number[] {
  const trimmed = range.trim();

  if (!trimmed || trimmed.toLowerCase() === "all") {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const indices = new Set<number>();

  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    const match = part.match(/^(\d+)\s*-\s*(\d+)$/);

    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);

      for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) {
        if (page >= 1 && page <= totalPages) indices.add(page - 1);
      }

      continue;
    }

    const page = Number(part);

    if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
      indices.add(page - 1);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
