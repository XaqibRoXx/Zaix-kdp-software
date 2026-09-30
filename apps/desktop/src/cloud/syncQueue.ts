import type { ZaxisProject } from "@zaxis-kdp/editor-core";
import { CloudApiError, ZaxisCloudApi, makeClientEventId } from "./apiClient";

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
}

export interface QueueFlushResult {
  synced: number;
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

export async function setSyncRevision(projectId: string, revision: number): Promise<void> {
  const meta: ProjectSyncMeta = {
    projectId,
    lastKnownRevision: Math.max(0, revision),
    lastSyncedAt: new Date().toISOString()
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

  // Backward-compatible migration for queue entries created before baseRevision existed.
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

export async function flushPendingSnapshots(api: ZaxisCloudApi): Promise<QueueFlushResult> {
  const queue = await listPendingSnapshots();

  let synced = 0;
  let conflicts = 0;
  let locked = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      try {
        const remote = await api.getProject(item.projectId);
        const remoteRevision = Number(remote.project.current_revision) || 0;

        // Never silently overwrite edits made by another device/session.
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
          const created = await api.createProject(item.snapshot);
          await setSyncRevision(item.projectId, created.revision);
          await removePendingSnapshot(item.projectId);
          synced += 1;
          continue;
        }

        throw error;
      }

      const pushed = await api.pushSnapshot(
        item.snapshot,
        item.baseRevision,
        item.eventId,
        "Automatic cloud autosave"
      );

      await setSyncRevision(item.projectId, pushed.revision);
      await removePendingSnapshot(item.projectId);
      synced += 1;
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

      failed += 1;
      await markAttempt(
        item,
        error instanceof Error ? error.message : "Unknown cloud sync error"
      );
    }
  }

  return {
    synced,
    conflicts,
    locked,
    failed,
    remaining: await pendingSyncCount()
  };
}
