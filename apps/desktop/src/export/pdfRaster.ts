import { PDFDocument } from "pdf-lib";
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export interface VisualPdfPageDiff {
  page: number;
  differencePercent: number;
  changedPixelPercent: number;
  different: boolean;
}

export interface VisualPdfCompareResult {
  leftPages: number;
  rightPages: number;
  comparedPages: number;
  differentPages: number;
  meanDifferencePercent: number;
  maxDifferencePercent: number;
  pageDiffs: VisualPdfPageDiff[];
}

export interface PdfLossyRecompressResult {
  bytes: Uint8Array;
  originalSizeBytes: number;
  outputSizeBytes: number;
  savedBytes: number;
  savedPercent: number;
  dpi: number;
  jpegQuality: number;
  pageCount: number;
}

async function loadPdf(file: File): Promise<{ task: ReturnType<typeof getDocument>; doc: PDFDocumentProxy }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({
    data,
    isEvalSupported: false
  });
  const doc = await task.promise;
  return { task, doc };
}

async function renderPageCanvas(
  page: PDFPageProxy,
  options: { dpi?: number; maxDimension?: number }
): Promise<HTMLCanvasElement> {
  const baseViewport = page.getViewport({ scale: 1 });
  let scale = Math.max(0.1, (options.dpi ?? 72) / 72);

  if (options.maxDimension) {
    const longest = Math.max(baseViewport.width, baseViewport.height);
    scale = Math.min(scale, options.maxDimension / Math.max(1, longest));
  }

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("Canvas rendering is unavailable.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context,
    viewport,
    canvas
  }).promise;

  return canvas;
}

function drawCanvasToSize(source: HTMLCanvasElement, width: number, height: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("Canvas comparison is unavailable.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function compareImageData(left: ImageData, right: ImageData): {
  differencePercent: number;
  changedPixelPercent: number;
} {
  const length = Math.min(left.data.length, right.data.length);
  if (length === 0) return { differencePercent: 0, changedPixelPercent: 0 };

  let delta = 0;
  let changedPixels = 0;
  const pixels = Math.floor(length / 4);

  for (let i = 0; i < pixels * 4; i += 4) {
    const dr = Math.abs(left.data[i] - right.data[i]);
    const dg = Math.abs(left.data[i + 1] - right.data[i + 1]);
    const db = Math.abs(left.data[i + 2] - right.data[i + 2]);
    const pixelDelta = (dr + dg + db) / 3;
    delta += pixelDelta;

    if (pixelDelta >= 12) changedPixels += 1;
  }

  return {
    differencePercent: Math.round((delta / (pixels * 255)) * 10000) / 100,
    changedPixelPercent: Math.round((changedPixels / pixels) * 10000) / 100
  };
}

export async function comparePdfVisual(
  left: File,
  right: File,
  maxPages = 200
): Promise<VisualPdfCompareResult> {
  const [leftPdf, rightPdf] = await Promise.all([loadPdf(left), loadPdf(right)]);

  try {
    const comparedPages = Math.min(leftPdf.doc.numPages, rightPdf.doc.numPages, maxPages);
    const pageDiffs: VisualPdfPageDiff[] = [];
    let totalDifference = 0;
    let maxDifference = 0;

    for (let pageNumber = 1; pageNumber <= comparedPages; pageNumber += 1) {
      const [leftPage, rightPage] = await Promise.all([
        leftPdf.doc.getPage(pageNumber),
        rightPdf.doc.getPage(pageNumber)
      ]);

      const [leftCanvas, rightCanvas] = await Promise.all([
        renderPageCanvas(leftPage, { dpi: 72, maxDimension: 700 }),
        renderPageCanvas(rightPage, { dpi: 72, maxDimension: 700 })
      ]);

      const width = Math.max(64, Math.min(700, Math.max(leftCanvas.width, rightCanvas.width)));
      const height = Math.max(64, Math.min(700, Math.max(leftCanvas.height, rightCanvas.height)));
      const leftData = drawCanvasToSize(leftCanvas, width, height);
      const rightData = drawCanvasToSize(rightCanvas, width, height);
      const diff = compareImageData(leftData, rightData);
      const different = diff.changedPixelPercent >= 0.1 || diff.differencePercent >= 0.05;

      pageDiffs.push({
        page: pageNumber,
        differencePercent: diff.differencePercent,
        changedPixelPercent: diff.changedPixelPercent,
        different
      });

      totalDifference += diff.differencePercent;
      maxDifference = Math.max(maxDifference, diff.differencePercent);
      leftPage.cleanup();
      rightPage.cleanup();
    }

    const missingPages = Math.abs(leftPdf.doc.numPages - rightPdf.doc.numPages);
    const differentPages = pageDiffs.filter((item) => item.different).length + missingPages;

    return {
      leftPages: leftPdf.doc.numPages,
      rightPages: rightPdf.doc.numPages,
      comparedPages,
      differentPages,
      meanDifferencePercent:
        comparedPages > 0 ? Math.round((totalDifference / comparedPages) * 100) / 100 : 0,
      maxDifferencePercent: Math.round(maxDifference * 100) / 100,
      pageDiffs
    };
  } finally {
    await leftPdf.task.destroy();
    await rightPdf.task.destroy();
  }
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("JPEG compression failed."));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      quality
    );
  });
}

export async function recompressPdfLossy(
  file: File,
  options: { dpi: number; jpegQuality: number }
): Promise<PdfLossyRecompressResult> {
  const dpi = Math.max(72, Math.min(300, Math.round(options.dpi)));
  const jpegQuality = Math.max(0.35, Math.min(0.98, options.jpegQuality));
  const loaded = await loadPdf(file);
  const output = await PDFDocument.create();

  try {
    for (let pageNumber = 1; pageNumber <= loaded.doc.numPages; pageNumber += 1) {
      const sourcePage = await loaded.doc.getPage(pageNumber);
      const baseViewport = sourcePage.getViewport({ scale: 1 });
      const canvas = await renderPageCanvas(sourcePage, { dpi });
      const jpegBytes = await canvasToJpegBytes(canvas, jpegQuality);
      const image = await output.embedJpg(jpegBytes);
      const page = output.addPage([baseViewport.width, baseViewport.height]);

      page.drawImage(image, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height
      });

      sourcePage.cleanup();
    }

    const bytes = await output.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false
    });

    const originalSizeBytes = file.size;
    const outputSizeBytes = bytes.byteLength;
    const savedBytes = Math.max(0, originalSizeBytes - outputSizeBytes);
    const savedPercent =
      originalSizeBytes > 0
        ? Math.round((savedBytes / originalSizeBytes) * 10000) / 100
        : 0;

    return {
      bytes,
      originalSizeBytes,
      outputSizeBytes,
      savedBytes,
      savedPercent,
      dpi,
      jpegQuality,
      pageCount: loaded.doc.numPages
    };
  } finally {
    await loaded.task.destroy();
  }
}
