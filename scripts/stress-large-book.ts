import {
  SnapshotHistory,
  addArtboard,
  addPathObject,
  addShapeObject,
  addTextObject,
  createBlankProject,
  createOrUpdateKdpCoverArtboard,
  normalizeProject,
  resizeAllArtboards,
  type ZaxisProject
} from "../packages/editor-core/src/index.ts";

const PAGE_COUNT = 400;
const started = performance.now();
let project: ZaxisProject = createBlankProject({
  name: "Phase 4 Large Book Stress",
  width: 6,
  height: 9,
  unit: "in",
  mode: "kdp"
});

for (let page = 1; page < PAGE_COUNT; page += 1) {
  project = addArtboard(project, { width: 6, height: 9, unit: "in", bleed: 0.125 });
  const artboardId = project.artboards[project.artboards.length - 1]!.id;

  project = addTextObject(project, artboardId).project;
  project = addShapeObject(project, artboardId, page % 2 === 0 ? "rectangle" : "ellipse").project;
  project = addPathObject(project, artboardId).project;
}

project = resizeAllArtboards(project, { width: 7, height: 10, unit: "in" });
project = normalizeProject(project);

const beforeCoverPages = project.artboards.filter((item) => (item.role ?? "page") === "page").length;
if (beforeCoverPages !== PAGE_COUNT) {
  throw new Error(`Expected ${PAGE_COUNT} page artboards, got ${beforeCoverPages}.`);
}

const coverResult = createOrUpdateKdpCoverArtboard(project);
project = coverResult.project;

const coverCount = project.artboards.filter((item) => item.role === "cover").length;
if (coverCount !== 1) {
  throw new Error(`Expected exactly one cover artboard, got ${coverCount}.`);
}

const pageObjects = project.artboards
  .filter((item) => (item.role ?? "page") === "page")
  .reduce((total, artboard) => total + artboard.objects.length, 0);

const expectedMinimumObjects = (PAGE_COUNT - 1) * 3;
if (pageObjects < expectedMinimumObjects) {
  throw new Error(`Expected at least ${expectedMinimumObjects} objects, got ${pageObjects}.`);
}

const history = new SnapshotHistory(project, 50);
for (let i = 0; i < 75; i += 1) {
  history.commit({
    ...history.current,
    name: `Phase 4 Large Book Stress ${i}`,
    updatedAt: new Date(1_700_000_000_000 + i * 1000).toISOString()
  });
}

for (let i = 0; i < 25; i += 1) {
  history.undo();
}
for (let i = 0; i < 25; i += 1) {
  history.redo();
}

if (!history.canUndo) {
  throw new Error("Snapshot history lost undo state during stress smoke test.");
}

const json = JSON.stringify(history.current);
const elapsedMs = Math.round(performance.now() - started);
const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

console.log(JSON.stringify({
  ok: true,
  pages: beforeCoverPages,
  artboardsWithCover: project.artboards.length,
  objects: pageObjects,
  serializedBytes: Buffer.byteLength(json),
  elapsedMs,
  heapMb
}, null, 2));
