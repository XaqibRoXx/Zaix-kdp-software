import type { Unit } from "@zaxis-kdp/shared";

export type KdpPaperType = "white" | "cream" | "groundwood" | "color";
export type KdpInkType = "black" | "standard-color" | "premium-color";

export interface KdpSettings {
  format: "paperback" | "hardcover";
  trimWidthIn: number;
  trimHeightIn: number;
  bleed: boolean;
  paperType: KdpPaperType;
  inkType: KdpInkType;
}

export interface KdpPreflightIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  page?: number;
}

export interface KdpPreflightResult {
  ready: boolean;
  pageCount: number;
  requiredInsideMarginIn: number;
  requiredOutsideMarginIn: number;
  spineWidthIn: number;
  coverWidthIn: number;
  coverHeightIn: number;
  spineTextAllowed: boolean;
  issues: KdpPreflightIssue[];
}

export interface KdpPaperbackCoverLayout {
  totalWidthIn: number;
  totalHeightIn: number;
  bleedIn: number;
  backCover: { xIn: number; widthIn: number };
  spine: { xIn: number; widthIn: number };
  frontCover: { xIn: number; widthIn: number };
  outerSafeMarginIn: number;
  spineSafeInsetIn: number;
  barcodeReservation: {
    xIn: number;
    yIn: number;
    widthIn: number;
    heightIn: number;
    clearanceIn: number;
  };
}

export const KDP_RULESET_VERSION = "2026-09-30";

export const KDP_RULES = {
  source: "Amazon KDP paperback submission guidance",
  rulesetVersion: KDP_RULESET_VERSION,
  bleedIn: 0.125,
  minimumFontPt: 7,
  spineTextMinimumPages: 80,
  coverOuterSafeMarginIn: 0.25,
  spineTextSafeInsetIn: 0.0625,
  barcodeSuggestedWidthIn: 2,
  barcodeSuggestedHeightIn: 1.2,
  barcodeClearanceIn: 0.25,
  paperbackCustomTrim: {
    minWidthIn: 4,
    maxWidthIn: 8.5,
    minHeightIn: 6,
    maxHeightIn: 11.69
  },
  hardcoverTrimSizes: [
    [5.5, 8.5],
    [6, 9],
    [6.14, 9.21],
    [7, 10],
    [8.25, 11]
  ] as const,
  hardcoverMinPages: 75,
  hardcoverMaxPages: 550,
  spineMultiplierIn: {
    white: 0.002252,
    cream: 0.0025,
    groundwood: 0.00235,
    standardColor: 0.002252,
    premiumColor: 0.002347
  }
} as const;

export function toInches(value: number, unit: Unit): number {
  if (!Number.isFinite(value)) return 0;

  switch (unit) {
    case "in":
      return value;
    case "cm":
      return value / 2.54;
    case "mm":
      return value / 25.4;
    case "pt":
      return value / 72;
    case "pc":
      return value / 6;
    case "px":
      return value / 96;
    default:
      return value;
  }
}

export function createDefaultKdpSettings(width: number, height: number, unit: Unit): KdpSettings {
  return {
    format: "paperback",
    trimWidthIn: round4(toInches(width, unit)),
    trimHeightIn: round4(toInches(height, unit)),
    bleed: false,
    paperType: "white",
    inkType: "black"
  };
}

export function requiredInsideMarginIn(pageCount: number): number {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

export function requiredOutsideMarginIn(bleed: boolean): number {
  return bleed ? 0.375 : 0.25;
}

export function pageCountLimits(settings: KdpSettings): { min: number; max: number } {
  if (settings.format === "hardcover") {
    return { min: KDP_RULES.hardcoverMinPages, max: KDP_RULES.hardcoverMaxPages };
  }

  if (settings.inkType === "standard-color") {
    return { min: 72, max: 600 };
  }

  if (settings.inkType === "premium-color") {
    return { min: 24, max: 828 };
  }

  if (settings.paperType === "cream") return { min: 24, max: 776 };
  if (settings.paperType === "groundwood") return { min: 24, max: 812 };
  return { min: 24, max: 828 };
}

export function calculatePaperbackSpineWidthIn(pageCount: number, settings: KdpSettings): number {
  const multiplier =
    settings.inkType === "standard-color"
      ? KDP_RULES.spineMultiplierIn.standardColor
      : settings.inkType === "premium-color"
        ? KDP_RULES.spineMultiplierIn.premiumColor
        : KDP_RULES.spineMultiplierIn[
            settings.paperType === "cream"
              ? "cream"
              : settings.paperType === "groundwood"
                ? "groundwood"
                : "white"
          ];

  return round4(Math.max(0, pageCount) * multiplier);
}

export function calculatePaperbackCoverSize(
  pageCount: number,
  settings: KdpSettings
): { widthIn: number; heightIn: number; spineWidthIn: number } {
  const spineWidthIn = calculatePaperbackSpineWidthIn(pageCount, settings);
  const totalBleed = KDP_RULES.bleedIn * 2;

  return {
    widthIn: round4(settings.trimWidthIn * 2 + spineWidthIn + totalBleed),
    heightIn: round4(settings.trimHeightIn + totalBleed),
    spineWidthIn
  };
}

export function calculatePaperbackCoverLayout(
  pageCount: number,
  settings: KdpSettings
): KdpPaperbackCoverLayout {
  const size = calculatePaperbackCoverSize(pageCount, settings);
  const bleed = KDP_RULES.bleedIn;
  const backX = bleed;
  const spineX = backX + settings.trimWidthIn;
  const frontX = spineX + size.spineWidthIn;
  const barcodeWidth = KDP_RULES.barcodeSuggestedWidthIn;
  const barcodeHeight = KDP_RULES.barcodeSuggestedHeightIn;
  const clearance = KDP_RULES.barcodeClearanceIn;

  return {
    totalWidthIn: size.widthIn,
    totalHeightIn: size.heightIn,
    bleedIn: bleed,
    backCover: {
      xIn: backX,
      widthIn: settings.trimWidthIn
    },
    spine: {
      xIn: spineX,
      widthIn: size.spineWidthIn
    },
    frontCover: {
      xIn: frontX,
      widthIn: settings.trimWidthIn
    },
    outerSafeMarginIn: KDP_RULES.coverOuterSafeMarginIn,
    spineSafeInsetIn: KDP_RULES.spineTextSafeInsetIn,
    barcodeReservation: {
      xIn: Math.max(
        backX + clearance,
        spineX - clearance - barcodeWidth
      ),
      yIn: bleed + clearance,
      widthIn: barcodeWidth,
      heightIn: barcodeHeight,
      clearanceIn: clearance
    }
  };
}

interface PreflightObjectLike {
  type: string;
  fontSize?: number;
  src?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
}

interface PreflightArtboardLike {
  role?: "page" | "cover";
  width: number;
  height: number;
  unit: Unit;
  objects: PreflightObjectLike[];
}

export interface KdpPreflightProjectLike {
  artboards: PreflightArtboardLike[];
  kdpSettings?: KdpSettings;
}

export function analyzeKdpProject(project: KdpPreflightProjectLike): KdpPreflightResult {
  const pages = project.artboards.filter((artboard) => (artboard.role ?? "page") === "page");
  const fallbackArtboard = pages[0] ?? project.artboards[0];
  const settings =
    project.kdpSettings ??
    createDefaultKdpSettings(
      fallbackArtboard?.width ?? 6,
      fallbackArtboard?.height ?? 9,
      fallbackArtboard?.unit ?? "in"
    );

  const issues: KdpPreflightIssue[] = [];
  const pageCount = pages.length;
  const limits = pageCountLimits(settings);
  const insideMargin = requiredInsideMarginIn(pageCount);
  const outsideMargin = requiredOutsideMarginIn(settings.bleed);
  const cover = calculatePaperbackCoverSize(pageCount, settings);

  if (settings.format === "hardcover") {
    const supported = KDP_RULES.hardcoverTrimSizes.some(
      ([width, height]) =>
        Math.abs(width - settings.trimWidthIn) < 0.01 &&
        Math.abs(height - settings.trimHeightIn) < 0.01
    );

    if (!supported) {
      issues.push({
        severity: "error",
        code: "hardcover-trim",
        message: "Hardcover trim must use one of the current KDP hardcover trim presets."
      });
    }

    if (settings.inkType === "standard-color") {
      issues.push({
        severity: "error",
        code: "hardcover-standard-color",
        message: "Standard Color is not available for current KDP hardcover printing."
      });
    }

    if (settings.paperType === "groundwood") {
      issues.push({
        severity: "error",
        code: "hardcover-groundwood",
        message: "Groundwood paper is not available for current KDP hardcover printing."
      });
    }
  } else if (
    settings.trimWidthIn < KDP_RULES.paperbackCustomTrim.minWidthIn ||
    settings.trimWidthIn > KDP_RULES.paperbackCustomTrim.maxWidthIn ||
    settings.trimHeightIn < KDP_RULES.paperbackCustomTrim.minHeightIn ||
    settings.trimHeightIn > KDP_RULES.paperbackCustomTrim.maxHeightIn
  ) {
    issues.push({
      severity: "error",
      code: "trim-range",
      message: "Trim size is outside the current KDP paperback custom-size range."
    });
  }

  if (pageCount < limits.min) {
    issues.push({
      severity: "error",
      code: "page-count-min",
      message: "Book has " + pageCount + " pages; this print setup requires at least " + limits.min + "."
    });
  }

  if (pageCount > limits.max) {
    issues.push({
      severity: "error",
      code: "page-count-max",
      message: "Book has " + pageCount + " pages; this print setup allows at most " + limits.max + "."
    });
  }

  const expectedWidth = settings.trimWidthIn + (settings.bleed ? KDP_RULES.bleedIn : 0);
  const expectedHeight = settings.trimHeightIn + (settings.bleed ? KDP_RULES.bleedIn * 2 : 0);

  pages.forEach((artboard, index) => {
    const page = index + 1;
    const widthIn = toInches(artboard.width, artboard.unit);
    const heightIn = toInches(artboard.height, artboard.unit);

    if (Math.abs(widthIn - expectedWidth) > 0.01 || Math.abs(heightIn - expectedHeight) > 0.01) {
      issues.push({
        severity: "error",
        code: "page-size",
        page,
        message:
          "Page size is " +
          round4(widthIn) +
          " × " +
          round4(heightIn) +
          " in; expected " +
          round4(expectedWidth) +
          " × " +
          round4(expectedHeight) +
          " in for this trim/bleed setup."
      });
    }

    if (artboard.objects.length === 0) {
      issues.push({
        severity: "info",
        code: "blank-page",
        page,
        message: "Page is blank."
      });
    }

    artboard.objects.forEach((object) => {
      if (object.type === "text" && typeof object.fontSize === "number" && object.fontSize < KDP_RULES.minimumFontPt) {
        issues.push({
          severity: "error",
          code: "font-size",
          page,
          message: "Text below the KDP 7 pt minimum was found."
        });
      }

      if (object.type === "image" && (!object.src || object.src.trim() === "")) {
        issues.push({
          severity: "error",
          code: "missing-image",
          page,
          message: "An image object has no source."
        });
      }
    });
  });

  const coverArtboard = project.artboards.find((artboard) => artboard.role === "cover");
  const coverLayout = calculatePaperbackCoverLayout(pageCount, settings);

  if (settings.format === "hardcover") {
    if (!coverArtboard?.templateOverlay?.src) {
      issues.push({
        severity: "warning",
        code: "hardcover-template",
        message: "Import the official KDP hardcover cover template overlay before final cover export."
      });
    }
  } else if (!coverArtboard) {
    issues.push({
      severity: "warning",
      code: "cover-missing",
      message: "No paperback cover artboard exists yet."
    });
  } else {
    const coverWidthIn = toInches(coverArtboard.width, coverArtboard.unit);
    const coverHeightIn = toInches(coverArtboard.height, coverArtboard.unit);

    if (
      Math.abs(coverWidthIn - coverLayout.totalWidthIn) > 0.01 ||
      Math.abs(coverHeightIn - coverLayout.totalHeightIn) > 0.01
    ) {
      issues.push({
        severity: "error",
        code: "cover-size",
        message:
          "Paperback cover size is " +
          round4(coverWidthIn) +
          " × " +
          round4(coverHeightIn) +
          " in; expected " +
          coverLayout.totalWidthIn +
          " × " +
          coverLayout.totalHeightIn +
          " in."
      });
    }

    for (const object of coverArtboard.objects) {
      if (object.visible === false) continue;

      const x = ((object.x ?? 0) / 100) * coverLayout.totalWidthIn;
      const width = ((object.width ?? 0) / 100) * coverLayout.totalWidthIn;
      const top = ((object.y ?? 0) / 100) * coverLayout.totalHeightIn;
      const height = ((object.height ?? 0) / 100) * coverLayout.totalHeightIn;

      const barcodeTop =
        coverLayout.totalHeightIn -
        coverLayout.barcodeReservation.yIn -
        coverLayout.barcodeReservation.heightIn;

      const overlapsBarcode =
        x < coverLayout.barcodeReservation.xIn + coverLayout.barcodeReservation.widthIn &&
        x + width > coverLayout.barcodeReservation.xIn &&
        top < barcodeTop + coverLayout.barcodeReservation.heightIn &&
        top + height > barcodeTop;

      if (overlapsBarcode) {
        issues.push({
          severity: "warning",
          code: "barcode-overlap",
          message: object.type + " object overlaps the reserved Amazon barcode area on the back cover."
        });
      }

      if (
        pageCount < KDP_RULES.spineTextMinimumPages &&
        object.type === "text" &&
        x < coverLayout.spine.xIn + coverLayout.spine.widthIn &&
        x + width > coverLayout.spine.xIn
      ) {
        issues.push({
          severity: "error",
          code: "spine-text-not-allowed",
          message: "Text overlaps the spine area, but this book has fewer than 80 interior pages."
        });
      }
    }
  }

  if (pageCount < KDP_RULES.spineTextMinimumPages) {
    issues.push({
      severity: "info",
      code: "spine-text",
      message: "Spine text should not be used below 80 pages."
    });
  }

  return {
    ready: issues.every((issue) => issue.severity !== "error"),
    pageCount,
    requiredInsideMarginIn: insideMargin,
    requiredOutsideMarginIn: outsideMargin,
    spineWidthIn: settings.format === "paperback" ? cover.spineWidthIn : 0,
    coverWidthIn: settings.format === "paperback" ? cover.widthIn : 0,
    coverHeightIn: settings.format === "paperback" ? cover.heightIn : 0,
    spineTextAllowed: settings.format === "paperback" && pageCount >= KDP_RULES.spineTextMinimumPages,
    issues
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
