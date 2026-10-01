import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage
} from "pdf-lib";
import {
  getPageNumberLabel,
  normalizeBookStructure,
  toInches,
  type Artboard,
  type DesignObject,
  type ZaxisProject
} from "@zaxis-kdp/editor-core";
import { getStoredFont } from "../state/fontStore";

export type PdfExportTarget = "interior" | "cover" | "all";
export type PdfQualityPreset = "maximum" | "high" | "standard" | "small" | "custom";
export type PdfColorMode = "rgb" | "grayscale";

export interface PdfExportOptions {
  target: PdfExportTarget;
  quality: PdfQualityPreset;
  pageRange?: string;
  title?: string;
  author?: string;
  customDpi?: number;
  customJpegQuality?: number;
  colorMode?: PdfColorMode;
  cropMarks?: boolean;
}

export interface PdfExportResult {
  bytes: Uint8Array;
  pageCount: number;
  warnings: string[];
}

export async function renderProjectPdf(
  project: ZaxisProject,
  options: PdfExportOptions
): Promise<PdfExportResult> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const warnings: string[] = [];
  const embeddedFonts = new Map<string, PDFFont>();

  pdf.setTitle(options.title?.trim() || project.name);
  if (options.author?.trim()) pdf.setAuthor(options.author.trim());
  pdf.setSubject(project.mode === "kdp" ? "KDP print layout" : "Graphic design export");
  pdf.setCreator("Zaxis KDP");
  pdf.setProducer("Zaxis KDP PDF Export");
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const interior = project.artboards.filter((item) => (item.role ?? "page") === "page");
  const covers = project.artboards.filter((item) => item.role === "cover");

  let artboards: Artboard[] = [];

  if (options.target === "interior") {
    artboards = selectPageRange(interior, options.pageRange);
  } else if (options.target === "cover") {
    artboards = covers;
  } else {
    artboards = [...selectPageRange(interior, options.pageRange), ...covers];
  }

  if (artboards.length === 0) {
    throw new Error("No artboards match the selected PDF export target.");
  }

  for (const artboard of artboards) {
    const contentWidthPt = Math.max(1, toInches(artboard.width, artboard.unit) * 72);
    const contentHeightPt = Math.max(1, toInches(artboard.height, artboard.unit) * 72);
    const markMargin = options.cropMarks ? 18 : 0;
    const widthPt = contentWidthPt + markMargin * 2;
    const heightPt = contentHeightPt + markMargin * 2;
    const page = pdf.addPage([widthPt, heightPt]);

    const background = parseHexColor(artboard.background, options.colorMode);
    page.drawRectangle({
      x: markMargin,
      y: markMargin,
      width: contentWidthPt,
      height: contentHeightPt,
      color: background
    });

    if (options.cropMarks) {
      drawCropMarks(page, markMargin, contentWidthPt, contentHeightPt);
    }

    for (const object of artboard.objects) {
      if (!object.visible) continue;

      try {
        await renderObject(
          pdf,
          page,
          object,
          contentWidthPt,
          contentHeightPt,
          regularFont,
          boldFont,
          warnings,
          options,
          embeddedFonts,
          markMargin
        );
      } catch (error) {
        warnings.push(
          "Skipped " +
            object.name +
            ": " +
            (error instanceof Error ? error.message : "unknown rendering error")
        );
      }
    }

    if (project.mode === "kdp" && (artboard.role ?? "page") === "page") {
      const physicalPage = interior.findIndex((item) => item.id === artboard.id) + 1;

      if (physicalPage > 0) {
        renderAutomaticPageNumber(
          page,
          contentWidthPt,
          contentHeightPt,
          physicalPage,
          project,
          regularFont,
          markMargin
        );
      }
    }
  }

  const bytes = await pdf.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false
  });

  return {
    bytes,
    pageCount: artboards.length,
    warnings
  };
}

function selectPageRange(artboards: Artboard[], range?: string): Artboard[] {
  const trimmed = range?.trim();
  if (!trimmed) return artboards;

  const selected = new Set<number>();

  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    const match = part.match(/^(\d+)\s*-\s*(\d+)$/);

    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      const from = Math.min(start, end);
      const to = Math.max(start, end);

      for (let page = from; page <= to; page += 1) {
        if (page >= 1 && page <= artboards.length) selected.add(page - 1);
      }

      continue;
    }

    const page = Number(part);
    if (Number.isInteger(page) && page >= 1 && page <= artboards.length) {
      selected.add(page - 1);
    }
  }

  return Array.from(selected)
    .sort((a, b) => a - b)
    .map((index) => artboards[index]);
}

function renderAutomaticPageNumber(
  page: PDFPage,
  pageWidth: number,
  pageHeight: number,
  physicalPage: number,
  project: ZaxisProject,
  font: PDFFont,
  offsetPt = 0
) {
  const structure = normalizeBookStructure(project.bookStructure);
  const label = getPageNumberLabel(physicalPage, structure);
  if (!label) return;

  const size = 9;
  const labelWidth = font.widthOfTextAtSize(label, size);
  const position = structure.pageNumbers.position;
  const outsideRight = physicalPage % 2 === 1;
  const edgeInset = 0.42 * 72;
  const verticalInset = 0.32 * 72;

  let x = Math.max(0, (pageWidth - labelWidth) / 2);
  let y = verticalInset;

  if (position.startsWith("top")) {
    y = Math.max(size, pageHeight - verticalInset - size);
  }

  if (position.endsWith("outside")) {
    x = outsideRight
      ? Math.max(0, pageWidth - edgeInset - labelWidth)
      : edgeInset;
  }

  page.drawText(label, {
    x: x + offsetPt,
    y: y + offsetPt,
    size,
    font,
    color: rgb(0.12, 0.12, 0.12)
  });
}

async function renderObject(
  pdf: PDFDocument,
  page: PDFPage,
  object: DesignObject,
  pageWidth: number,
  pageHeight: number,
  regularFont: PDFFont,
  boldFont: PDFFont,
  warnings: string[],
  options: PdfExportOptions,
  embeddedFonts: Map<string, PDFFont>,
  offsetPt = 0
) {
  const baseFrame = objectFrame(object, pageWidth, pageHeight);
  const frame = {
    ...baseFrame,
    x: baseFrame.x + offsetPt,
    y: baseFrame.y + offsetPt
  };

  if (object.skewX || object.skewY || object.flipX || object.flipY) {
    warnings.push(object.name + ": skew/flip export is approximated in the current PDF renderer.");
  }

  if (object.type === "rectangle") {
    const fill = parseHexColor(object.fill, options.colorMode);
    const stroke = parseHexColor(object.stroke, options.colorMode);

    page.drawRectangle({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      color: fill,
      borderColor: stroke,
      borderWidth: object.strokeWidth,
      opacity: object.opacity,
      borderOpacity: object.opacity,
      rotate: degrees(-object.rotation)
    });
    return;
  }

  if (object.type === "ellipse") {
    page.drawEllipse({
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
      xScale: frame.width / 2,
      yScale: frame.height / 2,
      color: parseHexColor(object.fill, options.colorMode),
      borderColor: parseHexColor(object.stroke, options.colorMode),
      borderWidth: object.strokeWidth,
      opacity: object.opacity,
      borderOpacity: object.opacity,
      rotate: degrees(-object.rotation)
    });
    return;
  }

  if (object.type === "text") {
    const embedded = await resolveTextFont(
      pdf,
      object.fontFamily,
      object.fontWeight,
      regularFont,
      boldFont,
      embeddedFonts,
      warnings
    );
    const font = embedded.font;
    const fontSize = Math.max(1, object.fontSize);
    const maxWidth = Math.max(1, frame.width);
    const lineHeight = fontSize * Math.max(0.5, object.lineHeight);
    const text = embedded.custom ? object.text : sanitizeStandardFontText(object.text);
    const lines = wrapText(font, text, fontSize, maxWidth);
    let y = pageHeight - (object.y / 100) * pageHeight - fontSize;

    for (const line of lines) {
      if (y < frame.y - lineHeight) break;

      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      let x = frame.x;

      if (object.textAlign === "center") {
        x += Math.max(0, (frame.width - lineWidth) / 2);
      } else if (object.textAlign === "right") {
        x += Math.max(0, frame.width - lineWidth);
      }

      page.drawText(line, {
        x,
        y,
        size: fontSize,
        font,
        color: parseHexColor(object.color, options.colorMode),
        opacity: object.opacity,
        rotate: degrees(-object.rotation)
      });

      y -= lineHeight;
    }

    if (/[^ -ÿ]/.test(object.text)) {
      warnings.push(object.name + ": some Unicode text uses fallback characters until custom-font PDF embedding is added.");
    }

    return;
  }

  if (object.type === "image") {
    const source = await loadImageSource(object.src);

    if (!source) {
      warnings.push(object.name + ": image source could not be loaded.");
      return;
    }

    const prepared = await prepareImageForPdf(source, object, frame.width, frame.height, options);

    let embedded;

    if (prepared.mime === "image/png") {
      embedded = await pdf.embedPng(prepared.bytes);
    } else if (prepared.mime === "image/jpeg" || prepared.mime === "image/jpg") {
      embedded = await pdf.embedJpg(prepared.bytes);
    } else {
      warnings.push(object.name + ": PDF export currently embeds PNG/JPEG directly; " + prepared.mime + " was skipped.");
      return;
    }

    page.drawImage(embedded, {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      opacity: object.opacity,
      rotate: degrees(-object.rotation)
    });

    if (prepared.downsampled) {
      warnings.push(
        object.name +
          ": image downsampled for " +
          options.quality +
          " export (" +
          prepared.width +
          " × " +
          prepared.height +
          " px)."
      );
    }

    return;
  }

  if (object.type === "path") {
    if (object.points.length < 2) return;

    const path = buildSvgPath(object);
    const fillColor = object.closed && object.fill !== "transparent"
      ? parseHexColor(object.fill, options.colorMode)
      : undefined;

    page.drawSvgPath(path, {
      x: frame.x,
      y: frame.y,
      scale: Math.min(frame.width, frame.height) / 100,
      color: fillColor,
      borderColor: parseHexColor(object.stroke, options.colorMode),
      borderWidth: Math.max(0.1, object.strokeWidth),
      opacity: object.opacity,
      borderOpacity: object.opacity,
      rotate: degrees(-object.rotation)
    });
  }
}

async function resolveTextFont(
  pdf: PDFDocument,
  family: string,
  weight: number,
  regularFont: PDFFont,
  boldFont: PDFFont,
  cache: Map<string, PDFFont>,
  warnings: string[]
): Promise<{ font: PDFFont; custom: boolean }> {
  const key = family.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return { font: cached, custom: true };

  try {
    const stored = await getStoredFont(family);
    if (stored) {
      const font = await pdf.embedFont(new Uint8Array(stored.data), { subset: true });
      cache.set(key, font);
      return { font, custom: true };
    }
  } catch (error) {
    warnings.push(
      family + ": custom font could not be embedded (" +
      (error instanceof Error ? error.message : "unknown font error") +
      ")."
    );
  }

  return { font: weight >= 600 ? boldFont : regularFont, custom: false };
}

function buildSvgPath(object: Extract<DesignObject, { type: "path" }>): string {
  const points = object.points;
  if (points.length === 0) return "";

  const y = (value: number) => 100 - value;
  let path = "M " + points[0].x + " " + y(points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (previous.handleOut || current.handleIn) {
      const c1 = previous.handleOut ?? { x: previous.x, y: previous.y };
      const c2 = current.handleIn ?? { x: current.x, y: current.y };
      path +=
        " C " +
        c1.x + " " + y(c1.y) + " " +
        c2.x + " " + y(c2.y) + " " +
        current.x + " " + y(current.y);
    } else {
      path += " L " + current.x + " " + y(current.y);
    }
  }

  if (object.closed) {
    const last = points[points.length - 1];
    const first = points[0];

    if (last.handleOut || first.handleIn) {
      const c1 = last.handleOut ?? { x: last.x, y: last.y };
      const c2 = first.handleIn ?? { x: first.x, y: first.y };
      path +=
        " C " +
        c1.x + " " + y(c1.y) + " " +
        c2.x + " " + y(c2.y) + " " +
        first.x + " " + y(first.y);
    }
    path += " Z";
  }

  return path;
}

function objectFrame(object: DesignObject, pageWidth: number, pageHeight: number) {
  const x = (object.x / 100) * pageWidth;
  const top = (object.y / 100) * pageHeight;
  const width = (object.width / 100) * pageWidth;
  const height = (object.height / 100) * pageHeight;
  const y = pageHeight - top - height;

  return { x, y, width, height };
}

function parseHexColor(value: string, mode: PdfColorMode = "rgb") {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : "000000";
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;

  if (mode === "grayscale") {
    const gray = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    return rgb(gray, gray, gray);
  }

  return rgb(red, green, blue);
}

function drawCropMarks(page: PDFPage, margin: number, width: number, height: number) {
  const color = rgb(0, 0, 0);
  const thickness = 0.5;
  const length = 12;
  const gap = 3;
  const left = margin;
  const right = margin + width;
  const bottom = margin;
  const top = margin + height;

  const segments = [
    [{ x: left - gap - length, y: bottom }, { x: left - gap, y: bottom }],
    [{ x: left, y: bottom - gap - length }, { x: left, y: bottom - gap }],
    [{ x: right + gap, y: bottom }, { x: right + gap + length, y: bottom }],
    [{ x: right, y: bottom - gap - length }, { x: right, y: bottom - gap }],
    [{ x: left - gap - length, y: top }, { x: left - gap, y: top }],
    [{ x: left, y: top + gap }, { x: left, y: top + gap + length }],
    [{ x: right + gap, y: top }, { x: right + gap + length, y: top }],
    [{ x: right, y: top + gap }, { x: right, y: top + gap + length }]
  ] as const;

  for (const [start, end] of segments) {
    page.drawLine({ start, end, thickness, color });
  }
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = words[0];

    for (const word of words.slice(1)) {
      const candidate = line + " " + word;

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }

    lines.push(line);
  }

  return lines;
}

function sanitizeStandardFontText(text: string): string {
  return text.replace(/[^ -ÿ\r\n\t]/g, "?");
}

async function prepareImageForPdf(
  source: { bytes: Uint8Array; mime: string },
  object: Extract<DesignObject, { type: "image" }>,
  frameWidthPt: number,
  frameHeightPt: number,
  options: PdfExportOptions
): Promise<{
  bytes: Uint8Array;
  mime: string;
  downsampled: boolean;
  width: number;
  height: number;
}> {
  const configuredDpi =
    options.quality === "high"
      ? 300
      : options.quality === "standard"
        ? 200
        : options.quality === "small"
          ? 144
          : options.quality === "custom"
            ? Math.max(72, Math.min(600, options.customDpi ?? 240))
            : 0;

  const needsTransform =
    object.fit !== "fill" ||
    object.cropX !== 50 ||
    object.cropY !== 50 ||
    object.scale !== 1 ||
    object.maskType !== "none" ||
    object.borderRadius !== 0;

  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined" ||
    (configuredDpi === 0 && !needsTransform)
  ) {
    return { ...source, downsampled: false, width: 0, height: 0 };
  }

  try {
    const blob = new Blob(
      [source.bytes.buffer.slice(
        source.bytes.byteOffset,
        source.bytes.byteOffset + source.bytes.byteLength
      ) as ArrayBuffer],
      { type: source.mime }
    );
    const bitmap = await createImageBitmap(blob);
    const dpi = configuredDpi || Math.max(
      144,
      Math.min(
        600,
        Math.round(Math.max(
          bitmap.width / Math.max(frameWidthPt / 72, 0.01),
          bitmap.height / Math.max(frameHeightPt / 72, 0.01)
        ))
      )
    );

    const targetWidth = Math.max(1, Math.round((frameWidthPt / 72) * dpi));
    const targetHeight = Math.max(1, Math.round((frameHeightPt / 72) * dpi));

    if (
      !needsTransform &&
      bitmap.width <= targetWidth &&
      bitmap.height <= targetHeight
    ) {
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      return { ...source, downsampled: false, width, height };
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const transparent =
      source.mime === "image/png" ||
      object.maskType !== "none" ||
      object.borderRadius > 0;
    const context = canvas.getContext("2d", { alpha: transparent });

    if (!context) {
      bitmap.close();
      return { ...source, downsampled: false, width: bitmap.width, height: bitmap.height };
    }

    if (!transparent) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
    }

    context.save();

    if (object.maskType === "ellipse") {
      context.beginPath();
      context.ellipse(
        targetWidth / 2,
        targetHeight / 2,
        targetWidth / 2,
        targetHeight / 2,
        0,
        0,
        Math.PI * 2
      );
      context.clip();
    } else if (object.maskType === "polygon" && object.maskPoints.length >= 3) {
      context.beginPath();
      object.maskPoints.forEach((point, index) => {
        const px = (point.x / 100) * targetWidth;
        const py = (point.y / 100) * targetHeight;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.closePath();
      context.clip();
    } else if (object.borderRadius > 0) {
      const radius = Math.min(
        targetWidth / 2,
        targetHeight / 2,
        (object.borderRadius / 100) * Math.min(targetWidth, targetHeight)
      );
      context.beginPath();
      context.roundRect(0, 0, targetWidth, targetHeight, radius);
      context.clip();
    }

    const fit = object.fit;
    const baseScale =
      fit === "contain"
        ? Math.min(targetWidth / bitmap.width, targetHeight / bitmap.height)
        : fit === "cover"
          ? Math.max(targetWidth / bitmap.width, targetHeight / bitmap.height)
          : 1;

    let drawWidth = fit === "fill" ? targetWidth : bitmap.width * baseScale;
    let drawHeight = fit === "fill" ? targetHeight : bitmap.height * baseScale;
    drawWidth *= object.scale;
    drawHeight *= object.scale;

    const availableX = targetWidth - drawWidth;
    const availableY = targetHeight - drawHeight;
    const drawX = availableX * (object.cropX / 100);
    const drawY = availableY * (object.cropY / 100);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);
    context.restore();
    bitmap.close();

    const outputMime = transparent ? "image/png" : "image/jpeg";
    const jpegQuality =
      options.quality === "high"
        ? 0.92
        : options.quality === "standard"
          ? 0.82
          : options.quality === "small"
            ? 0.7
            : options.quality === "custom"
              ? Math.max(0.35, Math.min(0.98, options.customJpegQuality ?? 0.85))
              : 0.95;

    const outputBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(
        resolve,
        outputMime,
        outputMime === "image/jpeg" ? jpegQuality : undefined
      )
    );

    if (!outputBlob) {
      return { ...source, downsampled: false, width: targetWidth, height: targetHeight };
    }

    return {
      bytes: new Uint8Array(await outputBlob.arrayBuffer()),
      mime: outputMime,
      downsampled:
        configuredDpi > 0 &&
        (targetWidth < bitmap.width || targetHeight < bitmap.height),
      width: targetWidth,
      height: targetHeight
    };
  } catch {
    return { ...source, downsampled: false, width: 0, height: 0 };
  }
}

async function loadImageSource(
  source: string
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!source) return null;

  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
    if (!match) return null;

    const mime = match[1].toLowerCase();
    const payload = match[3];

    if (match[2]) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return { bytes, mime };
    }

    return {
      bytes: new TextEncoder().encode(decodeURIComponent(payload)),
      mime
    };
  }

  const response = await fetch(source);
  if (!response.ok) return null;

  const mime = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mime
  };
}
