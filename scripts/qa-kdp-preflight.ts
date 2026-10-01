import {
  analyzeKdpProject,
  calculatePaperbackCoverLayout,
  requiredInsideMarginIn,
  requiredOutsideMarginIn,
  type KdpSettings
} from "../packages/editor-core/src/kdpRules.ts";

type Obj = {
  type: string;
  fontSize?: number;
  src?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
};

function text(fontSize = 12, extra: Partial<Obj> = {}): Obj {
  return { type: "text", fontSize, x: 10, y: 10, width: 30, height: 5, ...extra };
}

function image(src: string): Obj {
  return { type: "image", src, x: 10, y: 10, width: 30, height: 30 };
}

function page(width = 6, height = 9, objects: Obj[] = [text()]): any {
  return { role: "page", width, height, unit: "in", objects };
}

function pages(count: number, width = 6, height = 9, objectsFactory?: (index: number) => Obj[]): any[] {
  return Array.from({ length: count }, (_, index) =>
    page(width, height, objectsFactory ? objectsFactory(index) : [text()])
  );
}

function coverFor(count: number, settings: KdpSettings, objects: Obj[] = []): any {
  const layout = calculatePaperbackCoverLayout(count, settings);
  return {
    role: "cover",
    width: layout.totalWidthIn,
    height: layout.totalHeightIn,
    unit: "in",
    objects
  };
}

function codes(result: ReturnType<typeof analyzeKdpProject>): string[] {
  return result.issues.map((issue) => issue.code);
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const paperback: KdpSettings = {
  format: "paperback",
  trimWidthIn: 6,
  trimHeightIn: 9,
  bleed: false,
  paperType: "white",
  inkType: "black"
};

const valid = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [...pages(24), coverFor(24, paperback)]
});
expect(valid.ready, "Valid 24-page paperback should be preflight-ready.");
expect(!valid.issues.some((issue) => issue.severity === "error"), "Valid paperback produced an error.");
expect(valid.pageCount === 24, "Valid paperback page count changed.");
expect(valid.spineTextAllowed === false, "Spine text should not be allowed below 80 pages.");

const tooSmall = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [...pages(10), coverFor(10, paperback)]
});
expect(codes(tooSmall).includes("page-count-min"), "Minimum page-count rule was not enforced.");
expect(!tooSmall.ready, "Too-small book should not be ready.");

const wrongPageSize = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [
    ...pages(24).map((item, index) => index === 7 ? page(5.5, 8.5) : item),
    coverFor(24, paperback)
  ]
});
expect(codes(wrongPageSize).includes("page-size"), "Page-size mismatch was not detected.");

const invalidTrimSettings: KdpSettings = { ...paperback, trimWidthIn: 9, trimHeightIn: 12 };
const invalidTrim = analyzeKdpProject({
  kdpSettings: invalidTrimSettings,
  artboards: [...pages(24, 9, 12), coverFor(24, invalidTrimSettings)]
});
expect(codes(invalidTrim).includes("trim-range"), "Paperback custom trim limits were not enforced.");

const tinyFont = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [
    ...pages(24, 6, 9, (index) => index === 3 ? [text(6)] : [text(12)]),
    coverFor(24, paperback)
  ]
});
expect(codes(tinyFont).includes("font-size"), "Sub-7pt text was not detected.");

const missingImage = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [
    ...pages(24, 6, 9, (index) => index === 5 ? [image("")] : [text()]),
    coverFor(24, paperback)
  ]
});
expect(codes(missingImage).includes("missing-image"), "Missing image source was not detected.");

const wrongCover = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [
    ...pages(24),
    { role: "cover", width: 12, height: 9, unit: "in", objects: [] }
  ]
});
expect(codes(wrongCover).includes("cover-size"), "Invalid paperback cover geometry was not detected.");

const barcodeLayout = calculatePaperbackCoverLayout(80, paperback);
const barcodeObject: Obj = {
  type: "rectangle",
  x: (barcodeLayout.barcodeReservation.xIn / barcodeLayout.totalWidthIn) * 100,
  y:
    ((barcodeLayout.totalHeightIn -
      barcodeLayout.barcodeReservation.yIn -
      barcodeLayout.barcodeReservation.heightIn) /
      barcodeLayout.totalHeightIn) *
    100,
  width: (barcodeLayout.barcodeReservation.widthIn / barcodeLayout.totalWidthIn) * 100,
  height: (barcodeLayout.barcodeReservation.heightIn / barcodeLayout.totalHeightIn) * 100
};
const barcodeOverlap = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [...pages(80), coverFor(80, paperback, [barcodeObject])]
});
expect(codes(barcodeOverlap).includes("barcode-overlap"), "Barcode reservation overlap was not detected.");
expect(barcodeOverlap.spineTextAllowed, "Spine text should be allowed at 80 pages.");

const shortLayout = calculatePaperbackCoverLayout(24, paperback);
const spineText: Obj = {
  type: "text",
  fontSize: 12,
  x: ((shortLayout.spine.xIn - 0.01) / shortLayout.totalWidthIn) * 100,
  y: 20,
  width: Math.max(1, ((shortLayout.spine.widthIn + 0.02) / shortLayout.totalWidthIn) * 100),
  height: 5
};
const illegalSpineText = analyzeKdpProject({
  kdpSettings: paperback,
  artboards: [...pages(24), coverFor(24, paperback, [spineText])]
});
expect(codes(illegalSpineText).includes("spine-text-not-allowed"), "Short-book spine text was not rejected.");

const hardcoverInvalid: KdpSettings = {
  format: "hardcover",
  trimWidthIn: 6.5,
  trimHeightIn: 9.5,
  bleed: false,
  paperType: "groundwood",
  inkType: "standard-color"
};
const hardcover = analyzeKdpProject({
  kdpSettings: hardcoverInvalid,
  artboards: pages(80, 6.5, 9.5)
});
const hardcoverCodes = codes(hardcover);
for (const required of ["hardcover-trim", "hardcover-standard-color", "hardcover-groundwood", "hardcover-template"]) {
  expect(hardcoverCodes.includes(required), "Missing hardcover regression code: " + required);
}
expect(!hardcover.ready, "Invalid hardcover configuration should not be ready.");

expect(requiredInsideMarginIn(150) === 0.375, "Inside margin threshold <=150 regressed.");
expect(requiredInsideMarginIn(151) === 0.5, "Inside margin threshold 151-300 regressed.");
expect(requiredInsideMarginIn(301) === 0.625, "Inside margin threshold 301-500 regressed.");
expect(requiredInsideMarginIn(501) === 0.75, "Inside margin threshold 501-700 regressed.");
expect(requiredInsideMarginIn(701) === 0.875, "Inside margin threshold >700 regressed.");
expect(requiredOutsideMarginIn(false) === 0.25, "No-bleed outside margin regressed.");
expect(requiredOutsideMarginIn(true) === 0.375, "Bleed outside margin regressed.");

console.log(JSON.stringify({
  ok: true,
  cases: 12,
  validPaperbackReady: valid.ready,
  barcodeWarningDetected: codes(barcodeOverlap).includes("barcode-overlap"),
  hardcoverRulesDetected: hardcoverCodes.filter((code) => code.startsWith("hardcover"))
}, null, 2));
