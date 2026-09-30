import type { ZaxisProject } from "@zaxis-kdp/editor-core";
import { CloudApiError, ZaxisCloudApi, makeClientEventId } from "./apiClient";

export interface PendingProjectSync {
  projectId: string;
  eventId: string;
  snapshot: ZaxisProject;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface QueueFlushResult {
  synced: number;
  conflicts: number;
  failed: number;
  remaining: number;
}

const DB_NAME = "zaxis-kdp-sync";
const STORE_NAME = "project-sync";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "projectId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open cloud sync queue."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Cloud sync queue operation failed."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Cloud sync queue transaction failed."));
    });
  } finally {
    db.close();
  }
}

export async function queueProjectSnapshot(project: ZaxisProject): Promise<PendingProjectSync> {
  const existing = await getPendingSnapshot(project.id);

  const pending: PendingProjectSync = {
    projectId: project.id,
    eventId: makeClientEventId(),
    snapshot: structuredClone(project),
    queuedAt: new Date().toISOString(),
    attempts: existing?.attempts ?? 0
  };

  await withStore("readwrite", (store) => store.put(pending));
  return pending;
}

export async function getPendingSnapshot(projectId: string): Promise<PendingProjectSync | null> {
  const result = await withStore<PendingProjectSync | undefined>(
    "readonly",
    (store) => store.get(projectId)
  );

  return result ?? null;
}

export async function listPendingSnapshots(): Promise<PendingProjectSync[]> {
  const result = await withStore<PendingProjectSync[]>("readonly", (store) => store.getAll());
  return result.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function pendingSyncCount(): Promise<number> {
  return withStore<number>("readonly", (store) => store.count());
}

export async function removePendingSnapshot(projectId: string): Promise<void> {
  await withStore<IDBValidKey | undefined>("readwrite", (store) => store.delete(projectId));
}

async function markAttempt(item: PendingProjectSync, error?: string): Promise<void> {
  const updated: PendingProjectSync = {
    ...item,
    attempts: item.attempts + 1,
    lastError: error
  };

  await withStore("readwrite", (store) => store.put(updated));
}

export async function flushPendingSnapshots(api: ZaxisCloudApi): Promise<QueueFlushResult> {
  const queue = await listPendingSnapshots();

  let synced = 0;
  let conflicts = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      let remoteRevision = 0;

      try {
        const remote = await api.getProject(item.projectId);
        remoteRevision = Number(remote.project.current_revision) || 0;
      } catch (error) {
        if (error instanceof CloudApiError && error.status === 404) {
          await api.createProject(item.snapshot);
          await removePendingSnapshot(item.projectId);
          synced += 1;
          continue;
        }

        throw error;
      }

      await api.pushSnapshot(
        item.snapshot,
        remoteRevision,
        item.eventId,
        "Automatic cloud autosave"
      );

      await removePendingSnapshot(item.projectId);
      synced += 1;
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409) {
        conflicts += 1;
        await markAttempt(item, "Revision conflict");
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
    failed,
    remaining: await pendingSyncCount()
  };
}
