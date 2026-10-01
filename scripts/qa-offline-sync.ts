import "fake-indexeddb/auto";
import { createBlankProject, addArtboard, type ZaxisProject } from "../packages/editor-core/src/index.ts";
import { CloudApiError, type ZaxisCloudApi } from "../apps/desktop/src/cloud/apiClient.ts";
import {
  flushPendingSnapshots,
  getPendingSnapshot,
  getSyncMeta,
  pendingSyncCount,
  queueProjectSnapshot,
  removePendingSnapshot,
  setSyncRevision
} from "../apps/desktop/src/cloud/syncQueue.ts";

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function fixture(name: string): ZaxisProject {
  let project = createBlankProject({
    name,
    width: 6,
    height: 9,
    unit: "in",
    mode: "kdp"
  });
  project = addArtboard(project, { width: 6, height: 9, unit: "in" });
  return project;
}

function changed(base: ZaxisProject, label: string): ZaxisProject {
  const next = structuredClone(base);
  next.name = label;
  next.updatedAt = new Date(Date.now() + Math.random() * 10000).toISOString();
  next.artboards[0]!.background = "#f5f5f5";
  return next;
}

async function main(): Promise<void> {
  // 1) Queue coalescing + reconnect delta sync.
  const base = fixture("Offline Base");
  await setSyncRevision(base.id, 3, base);

  const firstEdit = changed(base, "Offline Edit 1");
  const secondEdit = changed(firstEdit, "Offline Edit 2");

  const firstQueued = await queueProjectSnapshot(firstEdit);
  const secondQueued = await queueProjectSnapshot(secondEdit);

  expect(firstQueued.baseRevision === 3, "Initial queued base revision should be 3.");
  expect(secondQueued.baseRevision === 3, "Coalesced queue must preserve original base revision.");
  expect(secondQueued.snapshot.name === "Offline Edit 2", "Queue did not retain latest coalesced snapshot.");
  expect(await pendingSyncCount() === 1, "Coalescing should keep one pending item per project.");

  let pushedDelta = false;
  let deltaChangedArtboards = 0;
  const reconnectApi = {
    async getProject(projectId: string) {
      expect(projectId === base.id, "Reconnect API received wrong project ID.");
      return {
        ok: true,
        project: { current_revision: 3 },
        snapshot: base
      };
    },
    async pushDelta(
      projectId: string,
      baseRevision: number,
      _eventId: string,
      delta: { changed_artboards: unknown[] }
    ) {
      expect(projectId === base.id, "Delta push used wrong project ID.");
      expect(baseRevision === 3, "Delta push used wrong base revision.");
      pushedDelta = true;
      deltaChangedArtboards = delta.changed_artboards.length;
      return { ok: true, revision: 4, sync_mode: "delta" as const };
    },
    async pushSnapshot() {
      throw new Error("Sparse reconnect should not fall back to full snapshot.");
    }
  } as unknown as ZaxisCloudApi;

  const reconnect = await flushPendingSnapshots(reconnectApi);
  expect(reconnect.synced === 1, "Reconnect should sync one project.");
  expect(reconnect.deltaSynced === 1, "Reconnect should use sparse delta sync.");
  expect(reconnect.fullSynced === 0, "Reconnect unexpectedly used full snapshot.");
  expect(reconnect.remaining === 0, "Reconnect should empty the queue.");
  expect(pushedDelta, "Reconnect never called pushDelta.");
  expect(deltaChangedArtboards === 1, "Expected one changed artboard in sparse delta.");

  const syncedMeta = await getSyncMeta(base.id);
  expect(syncedMeta?.lastKnownRevision === 4, "Reconnect did not advance local revision metadata.");
  expect(syncedMeta?.lastSyncedSnapshot?.name === "Offline Edit 2", "Reconnect did not store synced snapshot.");

  // 2) Revision conflict is retained for explicit user resolution.
  const conflictBase = fixture("Conflict Base");
  await setSyncRevision(conflictBase.id, 5, conflictBase);
  await queueProjectSnapshot(changed(conflictBase, "Conflict Local"));

  const conflictApi = {
    async getProject() {
      return {
        ok: true,
        project: { current_revision: 6 },
        snapshot: conflictBase
      };
    }
  } as unknown as ZaxisCloudApi;

  const conflict = await flushPendingSnapshots(conflictApi);
  expect(conflict.conflicts === 1, "Revision mismatch was not reported as conflict.");
  expect(conflict.remaining === 1, "Conflict must remain queued.");
  const conflictPending = await getPendingSnapshot(conflictBase.id);
  expect((conflictPending?.attempts ?? 0) === 1, "Conflict attempt count did not increment.");
  expect(
    conflictPending?.lastError?.includes("Revision conflict") === true,
    "Conflict reason was not retained."
  );
  await removePendingSnapshot(conflictBase.id);

  // 3) Server lock is retained and classified separately.
  const lockBase = fixture("Lock Base");
  await setSyncRevision(lockBase.id, 2, lockBase);
  await queueProjectSnapshot(changed(lockBase, "Lock Local"));

  const lockApi = {
    async getProject() {
      return {
        ok: true,
        project: { current_revision: 2 },
        snapshot: lockBase
      };
    },
    async pushDelta() {
      throw new CloudApiError("Project locked by another editor", 423);
    },
    async pushSnapshot() {
      throw new Error("Lock scenario should not attempt full fallback.");
    }
  } as unknown as ZaxisCloudApi;

  const locked = await flushPendingSnapshots(lockApi);
  expect(locked.locked === 1, "HTTP 423 was not classified as a project lock.");
  expect(locked.remaining === 1, "Locked item must remain queued.");
  await removePendingSnapshot(lockBase.id);

  // 4) Offline failure stays queued, then successfully flushes on reconnect.
  const offlineBase = fixture("Network Base");
  await setSyncRevision(offlineBase.id, 8, offlineBase);
  await queueProjectSnapshot(changed(offlineBase, "Network Local"));

  const offlineApi = {
    async getProject() {
      throw new Error("Simulated offline network failure");
    }
  } as unknown as ZaxisCloudApi;

  const offline = await flushPendingSnapshots(offlineApi);
  expect(offline.failed === 1, "Offline failure was not counted.");
  expect(offline.remaining === 1, "Offline project must remain queued.");

  const offlinePending = await getPendingSnapshot(offlineBase.id);
  expect((offlinePending?.attempts ?? 0) === 1, "Offline attempt count did not increment.");
  expect(
    offlinePending?.lastError?.includes("Simulated offline") === true,
    "Offline error reason was not retained."
  );

  const recoveredApi = {
    async getProject() {
      return {
        ok: true,
        project: { current_revision: 8 },
        snapshot: offlineBase
      };
    },
    async pushDelta() {
      return { ok: true, revision: 9, sync_mode: "delta" as const };
    },
    async pushSnapshot() {
      throw new Error("Reconnect recovery should use delta.");
    }
  } as unknown as ZaxisCloudApi;

  const recovered = await flushPendingSnapshots(recoveredApi);
  expect(recovered.synced === 1, "Recovered connection did not flush queued edit.");
  expect(recovered.deltaSynced === 1, "Recovered connection did not use delta.");
  expect(recovered.remaining === 0, "Recovered connection left pending work.");

  console.log(JSON.stringify({
    ok: true,
    coalescedQueueItems: 1,
    reconnectDeltaChangedArtboards: deltaChangedArtboards,
    reconnectRevision: syncedMeta?.lastKnownRevision,
    conflictClassified: conflict.conflicts,
    lockClassified: locked.locked,
    offlineRetained: offline.remaining,
    reconnectRecovered: recovered.synced
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
