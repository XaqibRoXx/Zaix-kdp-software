import type { ZaxisProject } from "@zaxis-kdp/editor-core";
import {
  CloudApiError,
  ZaxisCloudApi,
  makeClientEventId,
  type ProjectDeltaPayload
} from "./apiClient";

export interface PendingProjectSync {
  projectId: string;
  eventId: string;
  baseRevision: number;
  snapshot: ZaxisProject;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface ProjectSyncMeta {
  projectId: string;
  lastKnownRevision: number;
  lastSyncedAt?: string;
  lastSyncedSnapshot?: ZaxisProject;
}

export interface QueueFlushResult {
  synced: number;
  deltaSynced: number;
  fullSynced: number;
  conflicts: number;
  locked: number;
  failed: number;
  remaining: number;
}

const DB_NAME = "zaxis-kdp-sync";
const QUEUE_STORE = "project-sync";
const META_STORE = "sync-meta";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "projectId" });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "projectId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open cloud sync queue."));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Cloud sync database operation failed."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Cloud sync database transaction failed."));
    });
  } finally {
    db.close();
  }
}

export async function getSyncMeta(projectId: string): Promise<ProjectSyncMeta | null> {
  const result = await withStore<ProjectSyncMeta | undefined>(
    META_STORE,
    "readonly",
    (store) => store.get(projectId)
  );

  return result ?? null;
}

export async function setSyncRevision(
  projectId: string,
  revision: number,
  snapshot?: ZaxisProject
): Promise<void> {
  const existing = await getSyncMeta(projectId);

  const meta: ProjectSyncMeta = {
    projectId,
    lastKnownRevision: Math.max(0, revision),
    lastSyncedAt: new Date().toISOString(),
    lastSyncedSnapshot: snapshot
      ? structuredClone(snapshot)
      : existing?.lastSyncedSnapshot
  };

  await withStore(META_STORE, "readwrite", (store) => store.put(meta));
}

export async function queueProjectSnapshot(project: ZaxisProject): Promise<PendingProjectSync> {
  const existing = await getPendingSnapshot(project.id);
  const meta = await getSyncMeta(project.id);

  const pending: PendingProjectSync = {
    projectId: project.id,
    eventId: makeClientEventId(),
    // Preserve the original base while edits continue to coalesce in the queue.
    baseRevision: existing?.baseRevision ?? meta?.lastKnownRevision ?? 0,
    snapshot: structuredClone(project),
    queuedAt: new Date().toISOString(),
    attempts: existing?.attempts ?? 0
  };

  await withStore(QUEUE_STORE, "readwrite", (store) => store.put(pending));
  return pending;
}

export async function getPendingSnapshot(projectId: string): Promise<PendingProjectSync | null> {
  const result = await withStore<PendingProjectSync | undefined>(
    QUEUE_STORE,
    "readonly",
    (store) => store.get(projectId)
  );

  if (!result) return null;

  if (typeof result.baseRevision !== "number") {
    const meta = await getSyncMeta(projectId);
    return { ...result, baseRevision: meta?.lastKnownRevision ?? 0 };
  }

  return result;
}

export async function listPendingSnapshots(): Promise<PendingProjectSync[]> {
  const result = await withStore<PendingProjectSync[]>(QUEUE_STORE, "readonly", (store) => store.getAll());

  return Promise.all(
    result.map(async (item) => {
      if (typeof item.baseRevision === "number") return item;
      const meta = await getSyncMeta(item.projectId);
      return { ...item, baseRevision: meta?.lastKnownRevision ?? 0 };
    })
  ).then((items) => items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)));
}

export async function pendingSyncCount(): Promise<number> {
  return withStore<number>(QUEUE_STORE, "readonly", (store) => store.count());
}

export async function removePendingSnapshot(projectId: string): Promise<void> {
  await withStore(QUEUE_STORE, "readwrite", (store) => store.delete(projectId));
}

async function markAttempt(item: PendingProjectSync, error?: string): Promise<void> {
  const updated: PendingProjectSync = {
    ...item,
    attempts: item.attempts + 1,
    lastError: error
  };

  await withStore(QUEUE_STORE, "readwrite", (store) => store.put(updated));
}

export function buildProjectDelta(
  base: ZaxisProject,
  current: ZaxisProject
): ProjectDeltaPayload {
  const project: ProjectDeltaPayload["project"] = {};

  if (base.name !== current.name) project.name = current.name;
  if (base.mode !== current.mode) project.mode = current.mode;
  if (JSON.stringify(base.kdpSettings ?? null) !== JSON.stringify(current.kdpSettings ?? null)) {
    project.kdpSettings = current.kdpSettings;
  }
  if (JSON.stringify(base.bookStructure ?? null) !== JSON.stringify(current.bookStructure ?? null)) {
    project.bookStructure = current.bookStructure;
  }
  if (JSON.stringify(base.masterPages ?? []) !== JSON.stringify(current.masterPages ?? [])) {
    project.masterPages = current.masterPages;
  }
  if (JSON.stringify(base.reusableStyles ?? []) !== JSON.stringify(current.reusableStyles ?? [])) {
    project.reusableStyles = current.reusableStyles;
  }
  if (JSON.stringify(base.reusableComponents ?? []) !== JSON.stringify(current.reusableComponents ?? [])) {
    project.reusableComponents = current.reusableComponents;
  }
  if (JSON.stringify(base.projectOverrides ?? {}) !== JSON.stringify(current.projectOverrides ?? {})) {
    project.projectOverrides = current.projectOverrides;
  }
  if (base.updatedAt !== current.updatedAt) project.updatedAt = current.updatedAt;

  const baseById = new Map(base.artboards.map((artboard) => [artboard.id, artboard]));
  const currentById = new Map(current.artboards.map((artboard) => [artboard.id, artboard]));

  const changedArtboards = current.artboards.filter((artboard) => {
    const previous = baseById.get(artboard.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(artboard);
  });

  const removedArtboardIds = base.artboards
    .filter((artboard) => !currentById.has(artboard.id))
    .map((artboard) => artboard.id);

  return {
    version: 1,
    project,
    changed_artboards: changedArtboards,
    removed_artboard_ids: removedArtboardIds,
    artboard_order: current.artboards.map((artboard) => artboard.id)
  };
}

function shouldUseDelta(
  base: ZaxisProject | undefined,
  current: ZaxisProject
): { useDelta: boolean; delta?: ProjectDeltaPayload } {
  if (!base || base.id !== current.id) {
    return { useDelta: false };
  }

  const delta = buildProjectDelta(base, current);
  const fullBytes = JSON.stringify(current).length;
  const deltaBytes = JSON.stringify(delta).length;

  return {
    useDelta: deltaBytes < fullBytes * 0.8,
    delta
  };
}

export async function flushPendingSnapshots(api: ZaxisCloudApi): Promise<QueueFlushResult> {
  const queue = await listPendingSnapshots();

  let synced = 0;
  let deltaSynced = 0;
  let fullSynced = 0;
  let conflicts = 0;
  let locked = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      let remoteExists = true;

      try {
        const remote = await api.getProject(item.projectId);
        const remoteRevision = Number(remote.project.current_revision) || 0;

        if (remoteRevision !== item.baseRevision) {
          conflicts += 1;
          await markAttempt(
            item,
            "Revision conflict: queued from " + item.baseRevision + ", server is " + remoteRevision
          );
          continue;
        }
      } catch (error) {
        if (error instanceof CloudApiError && error.status === 404) {
          remoteExists = false;
        } else {
          throw error;
        }
      }

      if (!remoteExists) {
        const created = await api.createProject(item.snapshot);
        await setSyncRevision(item.projectId, created.revision, item.snapshot);
        await removePendingSnapshot(item.projectId);
        synced += 1;
        fullSynced += 1;
        continue;
      }

      const meta = await getSyncMeta(item.projectId);
      const baseSnapshot =
        meta?.lastKnownRevision === item.baseRevision
          ? meta.lastSyncedSnapshot
          : undefined;
      const choice = shouldUseDelta(baseSnapshot, item.snapshot);

      const pushed =
        choice.useDelta && choice.delta
          ? await api.pushDelta(
              item.projectId,
              item.baseRevision,
              item.eventId,
              choice.delta,
              "Incremental cloud autosave"
            )
          : await api.pushSnapshot(
              item.snapshot,
              item.baseRevision,
              item.eventId,
              "Automatic cloud autosave"
            );

      await setSyncRevision(item.projectId, pushed.revision, item.snapshot);
      await removePendingSnapshot(item.projectId);

      synced += 1;
      if (choice.useDelta) deltaSynced += 1;
      else fullSynced += 1;
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409) {
        conflicts += 1;
        await markAttempt(item, "Revision conflict");
        continue;
      }

      if (error instanceof CloudApiError && error.status === 423) {
        locked += 1;
        await markAttempt(item, "Project locked by another editor");
        continue;
      }

      // Older servers can reject PATCH until upgraded. Fall back to full snapshot
      // only when the delta endpoint is explicitly unavailable/invalid.
      if (
        error instanceof CloudApiError &&
        (error.status === 404 || error.status === 405 || error.status === 422)
      ) {
        try {
          const pushed = await api.pushSnapshot(
            item.snapshot,
            item.baseRevision,
            item.eventId,
            "Automatic cloud autosave fallback"
          );

          await setSyncRevision(item.projectId, pushed.revision, item.snapshot);
          await removePendingSnapshot(item.projectId);
          synced += 1;
          fullSynced += 1;
          continue;
        } catch (fallbackError) {
          if (fallbackError instanceof CloudApiError && fallbackError.status === 423) {
            locked += 1;
            await markAttempt(item, "Project locked by another editor");
            continue;
          }

          if (fallbackError instanceof CloudApiError && fallbackError.status === 409) {
            conflicts += 1;
            await markAttempt(item, "Revision conflict");
            continue;
          }

          failed += 1;
          await markAttempt(
            item,
            fallbackError instanceof Error ? fallbackError.message : "Full sync fallback failed"
          );
          continue;
        }
      }

      failed += 1;
      await markAttempt(
        item,
        error instanceof Error ? error.message : "Unknown cloud sync error"
      );
    }
  }

  return {
    synced,
    deltaSynced,
    fullSynced,
    conflicts,
    locked,
    failed,
    remaining: await pendingSyncCount()
  };
}
