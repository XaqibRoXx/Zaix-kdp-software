import { File } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  comparePdfStructure,
  cropPdfPages,
  extractPdfPages,
  inspectPdfStructure,
  mergePdfFiles,
  optimizePdfLossless,
  parsePdfPageRange,
  removePdfPages,
  reorderPdfPages,
  rotatePdfPages,
  splitPdfToZip
} from "../apps/desktop/src/export/pdfTools.ts";

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function makeFixture(): Promise<File> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const sizes: Array<[number, number]> = [
    [612, 792],
    [500, 700],
    [400, 600]
  ];

  sizes.forEach(([width, height], index) => {
    const page = pdf.addPage([width, height]);
    page.drawText("Phase 4 PDF Regression Page " + (index + 1), {
      x: 36,
      y: height - 60,
      size: 18,
      font,
      color: rgb(0.1, 0.1, 0.1)
    });
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  return new File([bytes], "phase4-fixture.pdf", { type: "application/pdf" });
}

function asFile(bytes: Uint8Array, name: string): File {
  return new File([bytes], name, { type: "application/pdf" });
}

async function main(): Promise<void> {
  const source = await makeFixture();
  const sourceInfo = await inspectPdfStructure(source);
  expect(sourceInfo.pageCount === 3, "Fixture page count changed.");
  expect(sourceInfo.pageSizes[0]?.width === 612, "Fixture first page width changed.");
  
  const extractedBytes = await extractPdfPages(source, "1,3");
  const extracted = asFile(extractedBytes, "extracted.pdf");
  const extractedInfo = await inspectPdfStructure(extracted);
  expect(extractedInfo.pageCount === 2, "Extract should produce two pages.");
  expect(extractedInfo.pageSizes[1]?.width === 400, "Extracted page order is wrong.");
  
  const rotatedBytes = await rotatePdfPages(source, "2", 90);
  const rotated = asFile(rotatedBytes, "rotated.pdf");
  const rotatedInfo = await inspectPdfStructure(rotated);
  expect(rotatedInfo.pageSizes[1]?.rotation === 90, "Rotate did not persist 90 degrees.");
  
  const removedBytes = await removePdfPages(source, "2");
  const removedInfo = await inspectPdfStructure(asFile(removedBytes, "removed.pdf"));
  expect(removedInfo.pageCount === 2, "Remove should leave two pages.");
  expect(removedInfo.pageSizes[1]?.width === 400, "Wrong page survived removal.");
  
  const reorderedBytes = await reorderPdfPages(source, "3,2,1");
  const reorderedInfo = await inspectPdfStructure(asFile(reorderedBytes, "reordered.pdf"));
  expect(reorderedInfo.pageSizes[0]?.width === 400, "Reorder did not move page 3 to the front.");
  expect(reorderedInfo.pageSizes[2]?.width === 612, "Reorder did not move page 1 to the end.");
  
  const croppedBytes = await cropPdfPages(source, "1", {
    top: 10,
    right: 20,
    bottom: 30,
    left: 40
  });
  const croppedDoc = await PDFDocument.load(croppedBytes);
  const cropBox = croppedDoc.getPage(0).getCropBox();
  expect(Math.round(cropBox.width) === 552, "Crop width regression detected.");
  expect(Math.round(cropBox.height) === 752, "Crop height regression detected.");
  
  const mergedBytes = await mergePdfFiles([source, extracted]);
  const mergedInfo = await inspectPdfStructure(asFile(mergedBytes, "merged.pdf"));
  expect(mergedInfo.pageCount === 5, "Merge should produce five pages.");
  
  const comparison = await comparePdfStructure(source, rotated);
  expect(comparison.samePageCount, "Rotation changed page count.");
  expect(!comparison.samePageSizes, "Structural compare failed to detect rotation change.");
  
  const split = await splitPdfToZip(source, "1-2;3");
  expect(split.outputCount === 2, "Split should produce two outputs.");
  expect(split.bytes.byteLength > 0, "Split ZIP is empty.");
  expect(split.fileNames.length === 2, "Split filenames are incomplete.");
  
  const optimized = await optimizePdfLossless(source);
  expect(
    optimized.bytes.byteLength <= optimized.originalSizeBytes,
    "Lossless optimizer returned a larger chosen output."
  );
  const optimizedInfo = await inspectPdfStructure(asFile(optimized.bytes, "optimized.pdf"));
  expect(optimizedInfo.pageCount === 3, "Lossless optimization changed page count.");
  
  const range = parsePdfPageRange("3-1,2", 3);
  expect(JSON.stringify(range) === JSON.stringify([0, 1, 2]), "Page-range parser regression.");
  
  console.log(JSON.stringify({
    ok: true,
    sourceBytes: source.size,
    optimizedBytes: optimized.bytes.byteLength,
    optimizedChanged: optimized.changed,
    mergedPages: mergedInfo.pageCount,
    splitFiles: split.fileNames,
    rotatedPage2: rotatedInfo.pageSizes[1]?.rotation,
    cropBox: {
      width: cropBox.width,
      height: cropBox.height
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
