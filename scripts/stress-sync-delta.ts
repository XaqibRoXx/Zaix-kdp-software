import {
  addArtboard,
  addTextObject,
  createBlankProject,
  type ZaxisProject
} from "../packages/editor-core/src/index.ts";
import { buildProjectDelta } from "../apps/desktop/src/cloud/syncQueue.ts";

const PAGE_COUNT = 400;
let base: ZaxisProject = createBlankProject({
  name: "Phase 4 Sync Delta Base",
  width: 6,
  height: 9,
  unit: "in",
  mode: "kdp"
});

for (let page = 1; page < PAGE_COUNT; page += 1) {
  base = addArtboard(base, { width: 6, height: 9, unit: "in", bleed: 0.125 });
  const artboardId = base.artboards[base.artboards.length - 1]!.id;
  base = addTextObject(base, artboardId).project;
}

const current = structuredClone(base);
current.name = "Phase 4 Sync Delta Current";
current.updatedAt = new Date(1_800_000_000_000).toISOString();

const removed = current.artboards.splice(20, 1)[0];
if (!removed) throw new Error("Failed to select an artboard for removal.");

for (const index of [5, 120, 250]) {
  const artboard = current.artboards[index];
  if (!artboard) throw new Error(`Missing artboard at index ${index}.`);
  artboard.background = index % 2 === 0 ? "#fafafa" : "#f0f0f0";
  if (artboard.objects[0] && artboard.objects[0].type === "text") {
    artboard.objects[0].text = `Sparse sync change on page ${index + 1}`;
  }
}

const source = current.artboards[current.artboards.length - 1]!;
current.artboards.push({
  ...structuredClone(source),
  id: "phase4-new-artboard",
  name: "New Sparse Delta Page",
  objects: source.objects.map((object, index) => ({
    ...structuredClone(object),
    id: `phase4-new-object-${index}`
  }))
});

const started = performance.now();
const delta = buildProjectDelta(base, current);
const elapsedMs = Math.round(performance.now() - started);
const fullBytes = Buffer.byteLength(JSON.stringify(current));
const deltaBytes = Buffer.byteLength(JSON.stringify(delta));
const ratio = deltaBytes / fullBytes;

if (!delta.removed_artboard_ids.includes(removed.id)) {
  throw new Error("Sparse delta did not include the removed artboard.");
}

if (!delta.changed_artboards.some((artboard) => artboard.id === "phase4-new-artboard")) {
  throw new Error("Sparse delta did not include the newly added artboard.");
}

if (delta.changed_artboards.length !== 4) {
  throw new Error(`Expected 4 changed/new artboards, got ${delta.changed_artboards.length}.`);
}

if (delta.artboard_order.length !== PAGE_COUNT) {
  throw new Error(`Expected ${PAGE_COUNT} ordered artboards after one removal + one add, got ${delta.artboard_order.length}.`);
}

if (ratio >= 0.8) {
  throw new Error(`Sparse delta is too large: ${(ratio * 100).toFixed(2)}% of full snapshot.`);
}

console.log(JSON.stringify({
  ok: true,
  pages: PAGE_COUNT,
  changedArtboards: delta.changed_artboards.length,
  removedArtboards: delta.removed_artboard_ids.length,
  fullBytes,
  deltaBytes,
  deltaPercentOfFull: Number((ratio * 100).toFixed(2)),
  elapsedMs
}, null, 2));
