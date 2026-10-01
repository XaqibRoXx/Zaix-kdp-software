import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  KDP_RULES,
  SnapshotHistory,
  addBookChapter,
  alignObject,
  applyMasterPage,
  applyReusableStyle,
  analyzeKdpProject,
  calculatePaperbackCoverLayout,
  calculatePaperbackCoverSize,
  createChapter,
  deleteBookChapter,
  getPageNumberLabel,
  normalizeBookStructure,
  requiredInsideMarginIn,
  requiredOutsideMarginIn,
  addArtboard,
  addImageObject,
  addPathObject,
  addPathPoint,
  addShapeObject,
  addTextObject,
  createBlankProject,
  createMasterPageFromArtboard,
  createOrUpdateKdpCoverArtboard,
  createOrUpdateTocArtboard,
  deleteArtboard,
  deleteObject,
  deletePathPoint,
  distributeObjects,
  duplicateArtboard,
  fitObjectInsideArtboard,
  moveArtboard,
  moveObjectLayer,
  resizeAllArtboards,
  resizeAllArtboardsWithContent,
  resizeArtboard,
  saveReusableStyle,
  setArtboardTemplateOverlay,
  setObjectLocked,
  setObjectVisible,
  updateBookChapter,
  updateKdpSettings,
  updateObject,
  updatePageNumberSettings,
  updateTocTitle,
  type DesignObject,
  type KdpInkType,
  type KdpPaperType,
  type PageNumberFormat,
  type PageNumberPosition,
  type ZaxisProject
} from "@zaxis-kdp/editor-core";
import type { SaveState, Unit } from "@zaxis-kdp/shared";
import { projectPresets, type ProjectPreset } from "../config/presets";
import {
  clearLocalRecoveryCache,
  loadAppSettings,
  saveAppSettings,
  type AppSettings
} from "../state/appSettings";
import {
  createRevision,
  listRevisions,
  type ProjectRevision
} from "../state/revisionStore";
import {
  registerStoredFonts,
  saveCustomFont
} from "../state/fontStore";
import {
  CloudApiError,
  ZaxisCloudApi,
  makeClientEventId,
  type CloudAsset,
  type CloudProjectSummary
} from "../cloud/apiClient";
import {
  flushPendingSnapshots,
  getPendingSnapshot,
  pendingSyncCount,
  queueProjectSnapshot,
  removePendingSnapshot,
  setSyncRevision
} from "../cloud/syncQueue";
import {
  renderProjectPdf,
  type PdfExportTarget,
  type PdfQualityPreset
} from "../export/pdfExporter";
import { ensurePdfExtension, saveBinaryToComputer, savePdfToComputer } from "../export/savePdf";
import {
  comparePdfStructure,
  extractPdfPages,
  mergePdfFiles,
  optimizePdfLossless,
  rotatePdfPages,
  splitPdfToZip,
  type PdfCompareResult
} from "../export/pdfTools";
import {
  deleteProjectFromLibrary,
  listProjectSummaries,
  loadActiveProject,
  loadProject,
  renameProjectInLibrary,
  saveProject,
  type ProjectSummary
} from "../state/projectLibrary";

type Screen = "dashboard" | "editor" | "assets" | "pdfTools" | "cloud" | "settings";

interface NativeCacheStatus {
  path: string;
  size_bytes: number;
  file_count: number;
}

type CloudSaveState =
  | "disabled"
  | "queued"
  | "syncing"
  | "saved"
  | "offline"
  | "conflict"
  | "locked"
  | "error";

type ProjectLockState =
  | "disabled"
  | "acquiring"
  | "owned"
  | "blocked"
  | "offline"
  | "error";

const navigation: Array<{ id: Screen; label: string }> = [
  { id: "dashboard", label: "Projects" },
  { id: "editor", label: "Editor" },
  { id: "assets", label: "Assets" },
  { id: "pdfTools", label: "PDF Tools" },
  { id: "cloud", label: "Cloud & Server" },
  { id: "settings", label: "Settings" }
];

const units: Unit[] = ["px", "in", "cm", "mm", "pt", "pc"];

function initialProject(): ZaxisProject {
  return loadActiveProject() ?? createBlankProject({
    name: "Untitled Design",
    width: 7,
    height: 10,
    unit: "in"
  });
}

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [project, setProject] = useState<ZaxisProject>(initialProject);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selectedArtboardId, setSelectedArtboardId] = useState(project.artboards[0].id);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [systemFonts, setSystemFonts] = useState<string[]>(["Arial", "Calibri", "Segoe UI", "Times New Roman"]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>(() => listProjectSummaries());
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const [revisions, setRevisions] = useState<ProjectRevision[]>(() => listRevisions(project.id));
  const [cloudToken, setCloudToken] = useState("");
  const [cloudSaveState, setCloudSaveState] = useState<CloudSaveState>(
    appSettings.cloudApiUrl.trim() ? "queued" : "disabled"
  );
  const [pendingCloudCount, setPendingCloudCount] = useState(0);
  const [projectLockState, setProjectLockState] = useState<ProjectLockState>("disabled");
  const [projectLockMessage, setProjectLockMessage] = useState("Local-only project");
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const historyRef = useRef(new SnapshotHistory(project));
  const skipCloudAutosaveOnceRef = useRef(false);

  useEffect(() => {
    Promise.all([
      invoke<string[]>("list_system_fonts").catch(() => []),
      registerStoredFonts().catch(() => [])
    ]).then(([nativeFonts, customFonts]) => {
      const combined = Array.from(new Set([
        ...systemFonts,
        ...nativeFonts,
        ...customFonts
      ])).sort((a, b) => a.localeCompare(b));
      setSystemFonts(combined);
    });
  }, []);

  useEffect(() => {
    invoke<NativeCacheStatus>("ensure_native_cache", {
      configuredPath: appSettings.cacheLocation,
      maxMb: appSettings.cacheLimitMb
    }).catch(() => {
      // Browser preview has no native cache bridge.
    });
  }, [appSettings.cacheLocation, appSettings.cacheLimitMb]);

  useEffect(() => {
    invoke<string | null>("load_cloud_token")
      .then((storedToken) => {
        if (storedToken) setCloudToken(storedToken);
      })
      .catch(() => {
        // Browser preview or a machine without the Windows bridge keeps session-only token state.
      });
  }, []);

  useEffect(() => {
    setSaveState("saving");

    const timer = window.setTimeout(() => {
      try {
        saveProject(project);
        setProjectSummaries(listProjectSummaries());
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, appSettings.autosaveDelayMs);

    return () => window.clearTimeout(timer);
  }, [project, appSettings.autosaveDelayMs]);

  const flushCloudQueue = useCallback(async () => {
    const apiUrl = appSettings.cloudApiUrl.trim();

    if (!apiUrl) {
      setCloudSaveState("disabled");
      setPendingCloudCount(await pendingSyncCount().catch(() => 0));
      return;
    }

    const count = await pendingSyncCount().catch(() => 0);
    setPendingCloudCount(count);

    if (count === 0) {
      setCloudSaveState("saved");
      return;
    }

    if (!navigator.onLine) {
      setCloudSaveState("offline");
      return;
    }

    if (!cloudToken.trim()) {
      setCloudSaveState("queued");
      return;
    }

    setCloudSaveState("syncing");

    try {
      const result = await flushPendingSnapshots(
        new ZaxisCloudApi(apiUrl, cloudToken.trim())
      );

      setPendingCloudCount(result.remaining);

      if (result.conflicts > 0) {
        setCloudSaveState("conflict");
      } else if (result.locked > 0) {
        setCloudSaveState("locked");
      } else if (result.failed > 0) {
        setCloudSaveState(navigator.onLine ? "error" : "offline");
      } else {
        setCloudSaveState("saved");
      }
    } catch {
      setCloudSaveState(navigator.onLine ? "error" : "offline");
      setPendingCloudCount(await pendingSyncCount().catch(() => count));
    }
  }, [appSettings.cloudApiUrl, cloudToken]);

  useEffect(() => {
    const apiUrl = appSettings.cloudApiUrl.trim();

    if (skipCloudAutosaveOnceRef.current) {
      skipCloudAutosaveOnceRef.current = false;
      setCloudSaveState(apiUrl ? "saved" : "disabled");
      return;
    }

    if (!apiUrl) {
      setCloudSaveState("disabled");
      return;
    }

    setCloudSaveState(navigator.onLine ? "queued" : "offline");

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await queueProjectSnapshot(project);
          setPendingCloudCount(await pendingSyncCount());

          if (!navigator.onLine) {
            setCloudSaveState("offline");
            return;
          }

          if (!cloudToken.trim()) {
            setCloudSaveState("queued");
            return;
          }

          await flushCloudQueue();
        } catch {
          setCloudSaveState("error");
        }
      })();
    }, Math.max(appSettings.autosaveDelayMs + 250, 650));

    return () => window.clearTimeout(timer);
  }, [
    project,
    appSettings.cloudApiUrl,
    appSettings.autosaveDelayMs,
    cloudToken,
    flushCloudQueue
  ]);

  useEffect(() => {
    void pendingSyncCount()
      .then(setPendingCloudCount)
      .catch(() => setPendingCloudCount(0));

    if (appSettings.cloudApiUrl.trim() && cloudToken.trim() && navigator.onLine) {
      void flushCloudQueue();
    }
  }, [appSettings.cloudApiUrl, cloudToken, flushCloudQueue]);

  useEffect(() => {
    function onOnline() {
      if (appSettings.cloudApiUrl.trim()) {
        void flushCloudQueue();
      }
    }

    function onOffline() {
      if (appSettings.cloudApiUrl.trim()) {
        setCloudSaveState("offline");
      }
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [appSettings.cloudApiUrl, flushCloudQueue]);


  useEffect(() => {
    const apiUrl = appSettings.cloudApiUrl.trim();
    const token = cloudToken.trim();

    if (screen !== "editor" || !apiUrl || !token) {
      setProjectLockState("disabled");
      setProjectLockMessage(
        !apiUrl || !token ? "Cloud lock not active" : "Lock acquired only while Editor is open"
      );
      return;
    }

    if (!navigator.onLine) {
      setProjectLockState("offline");
      setProjectLockMessage("Offline — local edits stay queued");
      return;
    }

    const api = new ZaxisCloudApi(apiUrl, token);
    let disposed = false;
    let hasOwnedLock = false;

    async function acquireOrRefreshLock() {
      if (!hasOwnedLock) {
        setProjectLockState("acquiring");
        setProjectLockMessage("Acquiring cloud edit lock...");
      }

      try {
        const result = await api.acquireProjectLock(project.id, "Zaxis KDP Windows", 120);

        if (disposed) return;

        hasOwnedLock = true;
        setProjectLockState("owned");
        setProjectLockMessage(
          "Owned until " + new Date(result.lock.expires_at).toLocaleTimeString()
        );

        void flushCloudQueue();
      } catch (error) {
        if (disposed) return;

        if (error instanceof CloudApiError && error.status === 404) {
          hasOwnedLock = false;
          setProjectLockState("disabled");
          setProjectLockMessage("Cloud project will be locked after first sync");
          return;
        }

        if (error instanceof CloudApiError && error.status === 423) {
          hasOwnedLock = false;
          const payload =
            error.payload && typeof error.payload === "object"
              ? (error.payload as { lock?: { client_name?: string; user_name?: string; expires_at?: string } })
              : undefined;
          const lock = payload?.lock;
          const owner = lock?.user_name || lock?.client_name || "another editor";
          const expiry = lock?.expires_at
            ? " until " + new Date(lock.expires_at).toLocaleTimeString()
            : "";

          setProjectLockState("blocked");
          setProjectLockMessage("Locked by " + owner + expiry);
          setCloudSaveState("locked");
          return;
        }

        hasOwnedLock = false;
        setProjectLockState("error");
        setProjectLockMessage(error instanceof Error ? error.message : "Project lock error");
      }
    }

    void acquireOrRefreshLock();
    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        void acquireOrRefreshLock();
      }
    }, 60_000);

    return () => {
      disposed = true;
      window.clearInterval(interval);

      if (hasOwnedLock && navigator.onLine) {
        void api.releaseProjectLock(project.id).catch(() => undefined);
      }
    };
  }, [
    screen,
    project.id,
    appSettings.cloudApiUrl,
    cloudToken,
    flushCloudQueue
  ]);

  useEffect(() => {
    if (!project.artboards.some((item) => item.id === selectedArtboardId)) {
      setSelectedArtboardId(project.artboards[0]?.id ?? "");
      setSelectedObjectId(null);
    }
  }, [project, selectedArtboardId]);

  function commit(next: ZaxisProject) {
    const committed = historyRef.current.commit(next);
    setProject(committed);
  }

  function undo() {
    setProject(historyRef.current.undo());
  }

  function redo() {
    setProject(historyRef.current.redo());
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && !isTyping) {
        if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          return;
        }

        if (event.key.toLowerCase() === "y") {
          event.preventDefault();
          redo();
          return;
        }
      }

      if (!isTyping && (event.key === "Delete" || event.key === "Backspace") && selectedObjectId) {
        event.preventDefault();
        commit(deleteObject(project, selectedArtboardId, selectedObjectId));
        setSelectedObjectId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (screen !== "editor") return;

      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      event.preventDefault();

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const result = addImageObject(project, selectedArtboardId, reader.result, file.name || "Pasted image");
        commit(result.project);
        setSelectedObjectId(result.objectId);
      };
      reader.readAsDataURL(file);
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [project, screen, selectedArtboardId]);

  async function importCustomFont(file: File) {
    const family = file.name.replace(/\.(ttf|otf|woff2?|ttc)$/i, "").replace(/[_-]+/g, " ").trim() || "Custom Font";

    try {
      const bytes = await file.arrayBuffer();
      const font = new FontFace(family, bytes);
      await font.load();
      document.fonts.add(font);
      await saveCustomFont(file, family);
      setSystemFonts((current) => Array.from(new Set([...current, family])).sort((a, b) => a.localeCompare(b)));
    } catch {
      // Invalid/unsupported font files are ignored for now; native install comes later.
    }
  }

  function createNewProject(preset?: ProjectPreset) {
    const chosen = preset ?? projectPresets.find((item) => item.id === "kdp-7x10");
    const next = createBlankProject({
      name: preset ? preset.label : "Untitled Design",
      width: chosen?.width ?? 7,
      height: chosen?.height ?? 10,
      unit: chosen?.unit ?? "in",
      mode: chosen?.mode ?? "kdp"
    });
    saveProject(next);
    setProjectSummaries(listProjectSummaries());
    historyRef.current.reset(next);
    setProject(next);
    setSelectedArtboardId(next.artboards[0].id);
    setSelectedObjectId(null);
    setScreen("editor");
  }

  function openProject(projectId: string) {
    const next = loadProject(projectId);
    if (!next) return;

    historyRef.current.reset(next);
    setProject(next);
    setSelectedArtboardId(next.artboards[0]?.id ?? "");
    setSelectedObjectId(null);
    setRevisions(listRevisions(next.id));
    setScreen("editor");
  }

  function renameProject(projectId: string) {
    const target = loadProject(projectId);
    if (!target) return;

    const name = window.prompt("Project name", target.name);
    if (!name?.trim()) return;

    const next = renameProjectInLibrary(target, name);
    setProjectSummaries(listProjectSummaries());

    if (project.id === projectId) {
      historyRef.current.reset(next);
      setProject(next);
    }
  }

  function removeProject(projectId: string) {
    if (!window.confirm("Delete this local project recovery copy?")) return;

    deleteProjectFromLibrary(projectId);
    const summaries = listProjectSummaries();
    setProjectSummaries(summaries);

    if (project.id !== projectId) return;

    const replacement = loadActiveProject() ?? createBlankProject({
      name: "Untitled Design",
      width: 7,
      height: 10,
      unit: "in"
    });

    saveProject(replacement);
    historyRef.current.reset(replacement);
    setProject(replacement);
    setSelectedArtboardId(replacement.artboards[0]?.id ?? "");
    setSelectedObjectId(null);
  }

  function makeRevision() {
    const label = window.prompt("Version name", "Manual Version");
    if (!label?.trim()) return;
    createRevision(project, label);
    setRevisions(listRevisions(project.id));
  }

  function restoreRevision(revision: ProjectRevision) {
    createRevision(project, "Before restore");

    const restored: ZaxisProject = {
      ...revision.snapshot,
      updatedAt: new Date().toISOString()
    };

    historyRef.current.reset(restored);
    setProject(restored);
    setSelectedArtboardId(restored.artboards[0]?.id ?? "");
    setSelectedObjectId(null);
    saveProject(restored);
    setProjectSummaries(listProjectSummaries());
    setRevisions(listRevisions(restored.id));
  }

  function replaceProjectFromCloud(snapshot: ZaxisProject, suppressCloudAutosave = true) {
    const normalized: ZaxisProject = {
      ...snapshot,
      updatedAt: new Date().toISOString()
    };

    if (suppressCloudAutosave) {
      skipCloudAutosaveOnceRef.current = true;
    }

    createRevision(project, "Before cloud conflict resolution");
    historyRef.current.reset(normalized);
    setProject(normalized);
    setSelectedArtboardId(normalized.artboards[0]?.id ?? "");
    setSelectedObjectId(null);
    saveProject(normalized);
    setProjectSummaries(listProjectSummaries());
    setRevisions(listRevisions(normalized.id));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Z</span>
          <div>
            <strong>Zaxis KDP</strong>
            <small>Cloud Design Studio</small>
          </div>
        </div>

        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={screen === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setScreen(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sync-card">
          <span className="status-dot" />
          <div>
            <strong>Local recovery active</strong>
            <small>Cloud server connects in Phase 2</small>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <small>ZAXIS KDP / PHASE 2</small>
            <h1>{screen === "editor" ? project.name : titleFor(screen)}</h1>
          </div>
          <div className="top-actions">
            <span className={"save-state " + saveState}>Local: {saveLabel(saveState)}</span>
            <span className={"save-state cloud-" + cloudSaveState}>
              Cloud: {cloudSaveLabel(cloudSaveState, pendingCloudCount)}
            </span>
            <span className={"save-state lock-" + projectLockState} title={projectLockMessage}>
              Lock: {projectLockLabel(projectLockState)}
            </span>
            <button className="secondary" onClick={() => setPdfExportOpen(true)}>Export PDF</button>
            <input
              ref={fontInputRef}
              className="hidden-input"
              type="file"
              accept=".ttf,.otf,.woff,.woff2,.ttc"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCustomFont(file);
                event.currentTarget.value = "";
              }}
            />
            <button className="secondary" onClick={() => fontInputRef.current?.click()}>Import Font</button>
            <button className="secondary">Import</button>
            <button className="primary" onClick={() => createNewProject()}>New Project</button>
          </div>
        </header>

        {screen === "dashboard" && (
          <Dashboard
            project={project}
            projects={projectSummaries}
            onOpen={() => setScreen("editor")}
            onOpenProject={openProject}
            onRenameProject={renameProject}
            onDeleteProject={removeProject}
            onNewProject={() => createNewProject()}
            onCreatePreset={createNewProject}
          />
        )}
        {screen === "editor" && (
          <EditorShell
            project={project}
            selectedArtboardId={selectedArtboardId}
            selectedObjectId={selectedObjectId}
            onSelectArtboard={(id) => {
              setSelectedArtboardId(id);
              setSelectedObjectId(null);
            }}
            onSelectObject={setSelectedObjectId}
            onCommit={commit}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyRef.current.canUndo}
            canRedo={historyRef.current.canRedo}
            systemFonts={systemFonts}
            appSettings={appSettings}
            revisions={revisions}
            onCreateRevision={makeRevision}
            onRestoreRevision={restoreRevision}
          />
        )}
        {screen === "assets" && (
          <AssetsScreen
            settings={appSettings}
            token={cloudToken}
            project={project}
          />
        )}
        {screen === "pdfTools" && <PdfToolsScreen />}
        {screen === "cloud" && (
          <CloudScreen
            settings={appSettings}
            onSettingsChange={(next) => {
              setAppSettings(next);
              saveAppSettings(next);
            }}
            token={cloudToken}
            onTokenChange={setCloudToken}
            project={project}
            automaticState={cloudSaveState}
            pendingCount={pendingCloudCount}
            onFlushQueue={flushCloudQueue}
            onReplaceProject={replaceProjectFromCloud}
          />
        )}
        {screen === "settings" && (
          <SettingsScreen
            settings={appSettings}
            onChange={(next) => {
              setAppSettings(next);
              saveAppSettings(next);
            }}
            onClearCache={() => {
              clearLocalRecoveryCache();
              setProjectSummaries([]);
            }}
          />
        )}
      </main>

      {pdfExportOpen && (
        <PdfExportDialog
          project={project}
          settings={appSettings}
          token={cloudToken}
          onClose={() => setPdfExportOpen(false)}
        />
      )}
    </div>
  );
}

function saveLabel(state: SaveState) {
  if (state === "saving") return "Saving...";
  if (state === "offline") return "Offline — queued";
  if (state === "error") return "Recovery save failed";
  return "Saved locally";
}

function cloudSaveLabel(state: CloudSaveState, pendingCount: number) {
  if (state === "disabled") return "Not configured";
  if (state === "syncing") return "Saving...";
  if (state === "offline") return "Offline — " + pendingCount + " queued";
  if (state === "queued") return pendingCount + " queued";
  if (state === "conflict") return "Conflict — review needed";
  if (state === "locked") return "Locked — " + pendingCount + " queued";
  if (state === "error") return "Sync error — queued";
  return "Saved to Cloud";
}

function projectLockLabel(state: ProjectLockState) {
  if (state === "acquiring") return "Acquiring...";
  if (state === "owned") return "This device";
  if (state === "blocked") return "Another editor";
  if (state === "offline") return "Offline";
  if (state === "error") return "Error";
  return "Inactive";
}

function titleFor(screen: Screen) {
  if (screen === "dashboard") return "Projects";
  if (screen === "assets") return "Asset Library";
  if (screen === "pdfTools") return "PDF Tools";
  if (screen === "cloud") return "Cloud & Server";
  if (screen === "settings") return "Settings";
  return "Zaxis KDP";
}

function PdfExportDialog({
  project,
  settings,
  token,
  onClose
}: {
  project: ZaxisProject;
  settings: AppSettings;
  token: string;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<PdfExportTarget>(
    project.mode === "kdp" ? "interior" : "all"
  );
  const [quality, setQuality] = useState<PdfQualityPreset>("maximum");
  const [pageRange, setPageRange] = useState("");
  const [destination, setDestination] = useState<"computer" | "cloud" | "both">("computer");
  const [fileName, setFileName] = useState(project.name.replace(/[^A-Za-z0-9._-]+/g, "-") || "zaxis-kdp-export");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function runExport() {
    setBusy(true);
    setStatus("Rendering PDF...");
    setWarnings([]);

    try {
      const result = await renderProjectPdf(project, {
        target,
        quality,
        pageRange,
        title: project.name,
        author
      });

      const finalName = ensurePdfExtension(fileName);
      const destinations: string[] = [];

      if (destination === "computer" || destination === "both") {
        const savedPath = await savePdfToComputer(result.bytes, finalName);

        if (savedPath) {
          destinations.push(savedPath.startsWith("browser-download:") ? "computer download" : savedPath);
        } else if (destination === "computer") {
          setStatus("Export cancelled.");
          setBusy(false);
          return;
        }
      }

      if (destination === "cloud" || destination === "both") {
        if (!settings.cloudApiUrl.trim() || !token.trim()) {
          throw new Error("Cloud destination requires a connected Cloud & Server account.");
        }

        const buffer = result.bytes.buffer.slice(
          result.bytes.byteOffset,
          result.bytes.byteOffset + result.bytes.byteLength
        ) as ArrayBuffer;

        const file = new File([buffer], finalName, { type: "application/pdf" });
        const uploaded = await new ZaxisCloudApi(
          settings.cloudApiUrl.trim(),
          token.trim()
        ).uploadAsset(file, project.id);

        destinations.push("cloud asset " + uploaded.asset.id);
      }

      setWarnings(result.warnings);
      setStatus(
        "Exported " +
          result.pageCount +
          " PDF page" +
          (result.pageCount === 1 ? "" : "s") +
          (destinations.length ? " • " + destinations.join(" • ") : "")
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PDF export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="export-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PDF EXPORT</span>
            <h2>Export {project.name}</h2>
          </div>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>

        <div className="settings-grid">
          <label>Content
            <select value={target} onChange={(event) => setTarget(event.target.value as PdfExportTarget)}>
              <option value="interior">Interior Pages</option>
              <option value="cover">Paperback Cover</option>
              <option value="all">Interior + Cover</option>
            </select>
          </label>

          <label>Quality
            <select value={quality} onChange={(event) => setQuality(event.target.value as PdfQualityPreset)}>
              <option value="maximum">Maximum</option>
              <option value="high">High</option>
              <option value="standard">Standard</option>
              <option value="small">Small File</option>
            </select>
          </label>

          <label>Page Range
            <input
              value={pageRange}
              onChange={(event) => setPageRange(event.target.value)}
              placeholder="All or 1-10,12,15-18"
            />
          </label>

          <label>Destination
            <select
              value={destination}
              onChange={(event) => setDestination(event.target.value as "computer" | "cloud" | "both")}
            >
              <option value="computer">My Computer</option>
              <option value="cloud">Cloud / Server</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label>File Name
            <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
          </label>

          <label>Author
            <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Optional" />
          </label>
        </div>

        <div className="export-summary">
          <span>Target: {target}</span>
          <span>Quality: {quality}</span>
          <span>Destination: {destination}</span>
        </div>

        {status && <p className="export-status">{status}</p>}

        {warnings.length > 0 && (
          <div className="export-warnings">
            <strong>Export notes</strong>
            {warnings.slice(0, 8).map((warning, index) => (
              <small key={index}>{warning}</small>
            ))}
            {warnings.length > 8 && <small>+ {warnings.length - 8} more</small>}
          </div>
        )}

        <div className="hero-actions export-actions">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={() => void runExport()} disabled={busy}>
            {busy ? "Exporting..." : "Export PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  project,
  projects,
  onOpen,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onNewProject,
  onCreatePreset
}: {
  project: ZaxisProject;
  projects: ProjectSummary[];
  onOpen: () => void;
  onOpenProject: (id: string) => void;
  onRenameProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onNewProject: () => void;
  onCreatePreset: (preset: ProjectPreset) => void;
}) {
  const objectCount = project.artboards.reduce((total, artboard) => total + artboard.objects.length, 0);

  return (
    <section className="content">
      <div className="metric-grid">
        <Metric label="Local Projects" value={String(projects.length)} />
        <Metric label="Active Artboards" value={String(project.artboards.length)} />
        <Metric label="Active Objects" value={String(objectCount)} />
        <Metric label="Phase" value="2 / 4" />
      </div>

      <div className="panel hero-panel">
        <div>
          <span className="eyebrow">START DESIGNING</span>
          <h2>Book layouts and full graphic design in one cloud-first Windows workspace.</h2>
          <p>Local project recovery library is active now; cloud project sync comes in Phase 2.</p>
        </div>
        <div className="hero-actions">
          <button className="secondary" onClick={onOpen}>Open Active</button>
          <button className="primary" onClick={onNewProject}>Create Project</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">NEW PROJECT</span>
            <h3>Presets</h3>
          </div>
          <span className="pill">Configurable</span>
        </div>
        <div className="preset-grid">
          {projectPresets.map((preset) => (
            <button key={preset.id} onClick={() => onCreatePreset(preset)}>
              <strong>{preset.label}</strong>
              <small>{preset.category === "kdp" ? "KDP / Book" : "Graphic Design"}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RECENT PROJECTS</span>
            <h3>Local Project Library</h3>
          </div>
          <span className="pill">{projects.length} saved</span>
        </div>

        <div className="project-list">
          {projects.length === 0 ? (
            <div className="empty-projects">No saved local projects yet.</div>
          ) : projects.map((item) => (
            <div className={item.id === project.id ? "project-row active" : "project-row"} key={item.id}>
              <button className="project-main" onClick={() => onOpenProject(item.id)}>
                <strong>{item.name}</strong>
                <small>{item.artboardCount} artboard{item.artboardCount === 1 ? "" : "s"} • {item.mode === "kdp" ? "KDP" : "Graphic Design"}</small>
              </button>
              <button onClick={() => onRenameProject(item.id)}>Rename</button>
              <button className="danger-text" onClick={() => onDeleteProject(item.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DEVELOPMENT</span>
            <h3>Phase 2 Cloud Foundation</h3>
          </div>
          <span className="pill">In Progress</span>
        </div>
        <div className="progress"><span style={{ width: "58%" }} /></div>
        <p className="muted">Artboards, objects, drag/resize, fonts, image paste, local multi-project recovery and Undo/Redo are now wired.</p>
      </div>
    </section>
  );
}

interface EditorShellProps {
  project: ZaxisProject;
  selectedArtboardId: string;
  selectedObjectId: string | null;
  onSelectArtboard: (id: string) => void;
  onSelectObject: (id: string | null) => void;
  onCommit: (project: ZaxisProject) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  systemFonts: string[];
  appSettings: AppSettings;
  revisions: ProjectRevision[];
  onCreateRevision: () => void;
  onRestoreRevision: (revision: ProjectRevision) => void;
}

function EditorShell({
  project,
  selectedArtboardId,
  selectedObjectId,
  onSelectArtboard,
  onSelectObject,
  onCommit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  systemFonts,
  appSettings,
  revisions,
  onCreateRevision,
  onRestoreRevision
}: EditorShellProps) {
  const [gridVisible, setGridVisible] = useState(appSettings.gridDefault);
  const [snapEnabled, setSnapEnabled] = useState(appSettings.snapDefault);
  const [showKdpTrim, setShowKdpTrim] = useState(true);
  const [showKdpBleed, setShowKdpBleed] = useState(true);
  const [showKdpSafe, setShowKdpSafe] = useState(true);
  const [smartGuide, setSmartGuide] = useState<{ vertical: boolean; horizontal: boolean }>({ vertical: false, horizontal: false });
  const [activeTool, setActiveTool] = useState<"select" | "direct">("select");

  const artboard = useMemo(
    () => project.artboards.find((item) => item.id === selectedArtboardId) ?? project.artboards[0],
    [project, selectedArtboardId]
  );

  const selectedObject = useMemo(
    () => artboard.objects.find((object) => object.id === selectedObjectId) ?? null,
    [artboard, selectedObjectId]
  );

  function add() {
    const next = addArtboard(project, artboard);
    onCommit(next);
    onSelectArtboard(next.artboards[next.artboards.length - 1].id);
  }

  function duplicate() {
    const next = duplicateArtboard(project, artboard.id);
    const sourceIndex = project.artboards.findIndex((item) => item.id === artboard.id);
    onCommit(next);
    onSelectArtboard(next.artboards[Math.min(sourceIndex + 1, next.artboards.length - 1)].id);
  }

  function remove() {
    const index = project.artboards.findIndex((item) => item.id === artboard.id);
    const next = deleteArtboard(project, artboard.id);
    onCommit(next);
    const nextIndex = Math.min(index, next.artboards.length - 1);
    onSelectArtboard(next.artboards[nextIndex].id);
  }

  function updateDimension(field: "width" | "height", raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    onCommit(resizeArtboard(project, artboard.id, { [field]: value }));
  }

  function updateUnit(unit: Unit) {
    onCommit(resizeArtboard(project, artboard.id, { unit }));
  }

  function bulkResize() {
    onCommit(resizeAllArtboardsWithContent(project, {
      width: artboard.width,
      height: artboard.height,
      unit: artboard.unit
    }));
  }

  function createText() {
    const result = addTextObject(project, artboard.id);
    onCommit(result.project);
    onSelectObject(result.objectId);
  }

  function createPath() {
    const result = addPathObject(project, artboard.id);
    onCommit(result.project);
    onSelectObject(result.objectId);
    setActiveTool("direct");
  }

  function createShape(type: "rectangle" | "ellipse") {
    const result = addShapeObject(project, artboard.id, type);
    onCommit(result.project);
    onSelectObject(result.objectId);
  }

  useEffect(() => {
    function onToolShortcut(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTyping) return;

      const key = event.key.toLowerCase();

      if (key === "v") setActiveTool("select");
      else if (key === "a") setActiveTool("direct");
      else if (key === "t") createText();
      else if (key === "r") createShape("rectangle");
      else if (key === "e") createShape("ellipse");
      else if (key === "p") createPath();
      else return;

      event.preventDefault();
    }

    window.addEventListener("keydown", onToolShortcut);
    return () => window.removeEventListener("keydown", onToolShortcut);
  }, [project, artboard.id]);

  function removeObject() {
    if (!selectedObject) return;
    onCommit(deleteObject(project, artboard.id, selectedObject.id));
    onSelectObject(null);
  }

  return (
    <section className="editor-layout">
      <aside className="tools">
        <button className={activeTool === "select" ? "active-tool" : ""} title="Select" onClick={() => setActiveTool("select")}>S</button>
        <button className={activeTool === "direct" ? "active-tool" : ""} title="Direct Select" onClick={() => setActiveTool("direct")}>D</button>
        <button title="Text" onClick={createText}>T</button>
        <button title="Rectangle" onClick={() => createShape("rectangle")}>R</button>
        <button title="Ellipse" onClick={() => createShape("ellipse")}>O</button>
        <button title="Pen / Path" onClick={createPath}>P</button>
        <button title="Image — use Ctrl+V to paste">I</button>
        <button title="Hand">H</button>
        <button title="Zoom">Z</button>
      </aside>

      <aside className="artboards-panel">
        <div className="panel-title">Artboards</div>

        {project.artboards.map((item, index) => (
          <button
            className={item.id === artboard.id ? "artboard-thumb active" : "artboard-thumb"}
            key={item.id}
            onClick={() => onSelectArtboard(item.id)}
          >
            <span>{item.role === "cover" ? "C" : index + 1}</span>
            <div style={{ aspectRatio: String(item.width) + " / " + String(item.height) }} />
            <small>
              {item.role === "cover" ? "Cover • " : item.kind === "toc" ? "TOC • " : ""}
              {item.width} × {item.height} {item.unit}
            </small>
          </button>
        ))}

        <button className="secondary full" onClick={add}>+ Add Artboard</button>
        <div className="artboard-actions">
          <button className="secondary" onClick={duplicate}>Duplicate</button>
          <button className="secondary" onClick={remove} disabled={project.artboards.length <= 1}>Delete</button>
        </div>
        <div className="artboard-actions">
          <button className="secondary" onClick={() => onCommit(moveArtboard(project, artboard.id, "up"))}>↑ Move</button>
          <button className="secondary" onClick={() => onCommit(moveArtboard(project, artboard.id, "down"))}>↓ Move</button>
        </div>
      </aside>

      <div className="canvas-area">
        <div className="editor-toolbar">
          <button onClick={onUndo} disabled={!canUndo}>Undo</button>
          <button onClick={onRedo} disabled={!canRedo}>Redo</button>
          <span className="toolbar-separator" />

          <label>W <input type="number" min="0.01" step="0.01" value={artboard.width} onChange={(event) => updateDimension("width", event.target.value)} /></label>
          <label>H <input type="number" min="0.01" step="0.01" value={artboard.height} onChange={(event) => updateDimension("height", event.target.value)} /></label>

          <select value={artboard.unit} onChange={(event) => updateUnit(event.target.value as Unit)}>
            {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>

          <button onClick={bulkResize}>Apply Size to All</button>
          <span className="toolbar-separator" />
          <button className={gridVisible ? "toggle-on" : ""} onClick={() => setGridVisible((value) => !value)}>Grid</button>
          <button className={snapEnabled ? "toggle-on" : ""} onClick={() => setSnapEnabled((value) => !value)}>Snap</button>
          {project.mode === "kdp" && artboard.role !== "cover" && (
            <>
              <span className="toolbar-separator" />
              <button className={showKdpTrim ? "toggle-on" : ""} onClick={() => setShowKdpTrim((value) => !value)}>Trim</button>
              <button className={showKdpBleed ? "toggle-on" : ""} onClick={() => setShowKdpBleed((value) => !value)}>Bleed</button>
              <button className={showKdpSafe ? "toggle-on" : ""} onClick={() => setShowKdpSafe((value) => !value)}>Safe</button>
            </>
          )}
        </div>

        <div className="canvas-stage" onClick={() => onSelectObject(null)}>
          <div
            className={gridVisible ? "artboard grid-visible" : "artboard"}
            style={{
              aspectRatio: String(artboard.width) + " / " + String(artboard.height),
              background: artboard.background
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {artboard.templateOverlay?.visible && (
              <img
                className="template-overlay"
                src={artboard.templateOverlay.src}
                alt={artboard.templateOverlay.name}
                style={{ opacity: artboard.templateOverlay.opacity }}
              />
            )}
            {project.mode !== "kdp" && <div className="safe-area" />}
            {artboard.role === "cover" && project.kdpSettings && (
              <KdpCoverGuides project={project} />
            )}
            {project.mode === "kdp" && artboard.role !== "cover" && project.kdpSettings && (
              <KdpInteriorGuides
                project={project}
                artboardId={artboard.id}
                showTrim={showKdpTrim}
                showBleed={showKdpBleed}
                showSafe={showKdpSafe}
              />
            )}
            {project.mode === "kdp" && artboard.role !== "cover" && (
              <KdpPageNumberOverlay project={project} artboardId={artboard.id} />
            )}
            {smartGuide.vertical && <div className="smart-guide vertical" />}
            {smartGuide.horizontal && <div className="smart-guide horizontal" />}

            {artboard.objects.filter((object) => object.visible).map((object) => (
              <CanvasObject
                key={object.id}
                object={object}
                selected={object.id === selectedObjectId}
                onSelect={() => onSelectObject(object.id)}
                onChange={(input) => onCommit(updateObject(project, artboard.id, object.id, input))}
                snap={snapEnabled}
                onGuideChange={setSmartGuide}
                directEdit={activeTool === "direct"}
              />
            ))}

            {artboard.objects.length === 0 && (
              <div className="empty-artboard">
                <span>{artboard.name}</span>
                <strong>{artboard.width} × {artboard.height} {artboard.unit}</strong>
                <small>Use T / R / O tools to add content</small>
              </div>
            )}
          </div>
        </div>

        <div className="bottom-status">
          <span>100%</span>
          <span>{project.artboards.length} artboard{project.artboards.length === 1 ? "" : "s"}</span>
          <span>{artboard.objects.length} object{artboard.objects.length === 1 ? "" : "s"}</span>
          <span>Undo {canUndo ? "ready" : "empty"}</span>
          <span>Local autosave active</span>
        </div>
      </div>

      <aside className="properties">
        <div className="panel-title">Layers & Properties</div>

        <div className="revision-box">
          <div className="revision-head">
            <strong>Revision History</strong>
            <button onClick={onCreateRevision}>+ Version</button>
          </div>
          <div className="revision-list">
            {revisions.slice(0, 5).map((revision) => (
              <button key={revision.id} onClick={() => onRestoreRevision(revision)}>
                <strong>{revision.label}</strong>
                <small>{new Date(revision.createdAt).toLocaleString()}</small>
              </button>
            ))}
            {revisions.length === 0 && <small className="muted">No restore points yet.</small>}
          </div>
        </div>

        {project.mode === "kdp" && (
          <KdpBookPanel
            project={project}
            onCommit={onCommit}
            onOpenPage={(page) => {
              const pages = project.artboards.filter((item) => (item.role ?? "page") === "page");
              const target = pages[page - 1];
              if (target) onSelectArtboard(target.id);
            }}
            onOpenArtboard={onSelectArtboard}
          />
        )}

        <div className="layer-list">
          {[...artboard.objects].reverse().map((object) => (
            <div className={object.id === selectedObjectId ? "layer-row active" : "layer-row"} key={object.id}>
              <button className="layer-name" onClick={() => onSelectObject(object.id)}>{object.name}</button>
              <button title="Toggle visibility" onClick={() => onCommit(setObjectVisible(project, artboard.id, object.id, !object.visible))}>{object.visible ? "◉" : "○"}</button>
              <button title="Toggle lock" onClick={() => onCommit(setObjectLocked(project, artboard.id, object.id, !object.locked))}>{object.locked ? "L" : "U"}</button>
            </div>
          ))}
        </div>

        {selectedObject ? (
          <>
            <hr />
            <ObjectInspector
              object={selectedObject}
              onChange={(input) => onCommit(updateObject(project, artboard.id, selectedObject.id, input))}
              systemFonts={systemFonts}
            />
            <div className="production-tools">
              <button
                className="secondary full"
                onClick={() => {
                  const name = window.prompt("Style name", selectedObject.type === "text" ? "Text Style" : "Object Style");
                  if (name?.trim()) onCommit(saveReusableStyle(project, selectedObject, name));
                }}
              >
                Save Current Style
              </button>
              {(project.reusableStyles ?? [])
                .filter((style) => style.kind === (selectedObject.type === "text" ? "text" : "object"))
                .map((style) => (
                  <button
                    className="secondary full"
                    key={style.id}
                    onClick={() => onCommit(applyReusableStyle(project, artboard.id, selectedObject.id, style.id))}
                  >
                    Apply: {style.name}
                  </button>
                ))}
            </div>
            {selectedObject.type === "path" && (
              <div className="path-point-tools">
                <button className="secondary full" onClick={() => onCommit(addPathPoint(project, artboard.id, selectedObject.id))}>+ Add Anchor Point</button>
                <div className="path-point-list">
                  {selectedObject.points.map((point, index) => (
                    <div className="path-point-row" key={point.id}>
                      <span>P{index + 1}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={point.x}
                        onChange={(event) => {
                          const nextX = Number(event.target.value);
                          const points = selectedObject.points.map((item) => item.id === point.id ? { ...item, x: nextX } : item);
                          onCommit(updateObject(project, artboard.id, selectedObject.id, { points }));
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={point.y}
                        onChange={(event) => {
                          const nextY = Number(event.target.value);
                          const points = selectedObject.points.map((item) => item.id === point.id ? { ...item, y: nextY } : item);
                          onCommit(updateObject(project, artboard.id, selectedObject.id, { points }));
                        }}
                      />
                      <button
                        className={point.smooth ? "curve-toggle active" : "curve-toggle"}
                        onClick={() => {
                          const points = selectedObject.points.map((item) => {
                            if (item.id !== point.id) return item;
                            const smooth = !item.smooth;
                            return {
                              ...item,
                              smooth,
                              handleIn: smooth ? (item.handleIn ?? { x: Math.max(0, item.x - 10), y: item.y }) : undefined,
                              handleOut: smooth ? (item.handleOut ?? { x: Math.min(100, item.x + 10), y: item.y }) : undefined
                            };
                          });
                          onCommit(updateObject(project, artboard.id, selectedObject.id, { points }));
                        }}
                      >{point.smooth ? "S" : "C"}</button>
                      <button
                        disabled={selectedObject.points.length <= 2}
                        onClick={() => onCommit(deletePathPoint(project, artboard.id, selectedObject.id, point.id))}
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="alignment-grid">
              <button onClick={() => onCommit(alignObject(project, artboard.id, selectedObject.id, "left"))}>Left</button>
              <button onClick={() => onCommit(alignObject(project, artboard.id, selectedObject.id, "center"))}>Center</button>
              <button onClick={() => onCommit(alignObject(project, artboard.id, selectedObject.id, "right"))}>Right</button>
              <button onClick={() => onCommit(alignObject(project, artboard.id, selectedObject.id, "top"))}>Top</button>
              <button onClick={() => onCommit(alignObject(project, artboard.id, selectedObject.id, "middle"))}>Middle</button>
              <button onClick={() => onCommit(alignObject(project, artboard.id, selectedObject.id, "bottom"))}>Bottom</button>
            </div>
            <div className="artboard-actions">
              <button className="secondary" disabled={artboard.objects.length < 3} onClick={() => onCommit(distributeObjects(project, artboard.id, "horizontal"))}>Distribute H</button>
              <button className="secondary" disabled={artboard.objects.length < 3} onClick={() => onCommit(distributeObjects(project, artboard.id, "vertical"))}>Distribute V</button>
            </div>
            <button className="secondary full" onClick={() => onCommit(fitObjectInsideArtboard(project, artboard.id, selectedObject.id))}>Fit Inside Artboard</button>
            <div className="artboard-actions">
              <button className="secondary" onClick={() => onCommit(moveObjectLayer(project, artboard.id, selectedObject.id, "up"))}>Bring Up</button>
              <button className="secondary" onClick={() => onCommit(moveObjectLayer(project, artboard.id, selectedObject.id, "down"))}>Send Down</button>
            </div>
            <button className="secondary full danger" onClick={removeObject}>Delete Object</button>
          </>
        ) : (
          <>
            <Property label="Document Mode" value={project.mode === "kdp" ? "KDP / Print" : "Graphic Design"} />
            <Property label="Artboard" value={String(artboard.width) + " × " + String(artboard.height) + " " + artboard.unit} />
            <Property label="Objects" value={String(artboard.objects.length)} />
            <button className="secondary full" onClick={bulkResize}>Scale Whole Book to This Size</button>
            <button
              className="secondary full"
              onClick={() => {
                const name = window.prompt("Master page name", "Master " + ((project.masterPages?.length ?? 0) + 1));
                if (name?.trim()) onCommit(createMasterPageFromArtboard(project, artboard.id, name));
              }}
            >
              Save Current Page as Master
            </button>
            {(project.masterPages ?? []).map((master) => (
              <button
                className="secondary full"
                key={master.id}
                onClick={() => onCommit(applyMasterPage(project, artboard.id, master.id))}
              >
                Apply Master: {master.name}
              </button>
            ))}
          </>
        )}
      </aside>
    </section>
  );
}

function KdpPageNumberOverlay({
  project,
  artboardId
}: {
  project: ZaxisProject;
  artboardId: string;
}) {
  const structure = normalizeBookStructure(project.bookStructure);
  const pages = project.artboards.filter((item) => (item.role ?? "page") === "page");
  const index = pages.findIndex((item) => item.id === artboardId);
  if (index < 0) return null;

  const physicalPage = index + 1;
  const label = getPageNumberLabel(physicalPage, structure);
  if (!label) return null;

  const position = structure.pageNumbers.position;
  const outsideRight = physicalPage % 2 === 1;
  const style: React.CSSProperties = {};

  if (position.startsWith("top")) style.top = "3%";
  else style.bottom = "3%";

  if (position.endsWith("center")) {
    style.left = "50%";
    style.transform = "translateX(-50%)";
  } else if (outsideRight) {
    style.right = "5%";
  } else {
    style.left = "5%";
  }

  return (
    <div className="kdp-auto-page-number" style={style} aria-hidden="true">
      {label}
    </div>
  );
}

function KdpInteriorGuides({
  project,
  artboardId,
  showTrim,
  showBleed,
  showSafe
}: {
  project: ZaxisProject;
  artboardId: string;
  showTrim: boolean;
  showBleed: boolean;
  showSafe: boolean;
}) {
  const settings = project.kdpSettings;
  if (!settings) return null;

  const pages = project.artboards.filter((item) => (item.role ?? "page") === "page");
  const pageIndex = pages.findIndex((item) => item.id === artboardId);
  if (pageIndex < 0) return null;

  const pageNumber = pageIndex + 1;
  const isRightPage = pageNumber % 2 === 1;
  const insideMargin = requiredInsideMarginIn(pages.length);
  const outsideMargin = requiredOutsideMarginIn(settings.bleed);
  const bleed = settings.bleed ? KDP_RULES.bleedIn : 0;
  const pageWidth = settings.trimWidthIn + bleed;
  const pageHeight = settings.trimHeightIn + bleed * 2;

  const topTrim = (bleed / pageHeight) * 100;
  const bottomTrim = 100 - topTrim;
  const leftTrim = settings.bleed && !isRightPage ? (bleed / pageWidth) * 100 : 0;
  const rightTrim = settings.bleed && isRightPage
    ? (settings.trimWidthIn / pageWidth) * 100
    : 100;

  const safeTop = ((bleed + outsideMargin) / pageHeight) * 100;
  const safeBottom = 100 - safeTop;

  const safeLeft = isRightPage
    ? (insideMargin / pageWidth) * 100
    : ((bleed + outsideMargin) / pageWidth) * 100;

  const safeRight = isRightPage
    ? ((settings.trimWidthIn - outsideMargin) / pageWidth) * 100
    : 100 - (insideMargin / pageWidth) * 100;

  return (
    <div className="kdp-interior-guides" aria-hidden="true">
      {showBleed && settings.bleed && (
        <div className="guide-label bleed-label">BLEED • 0.125"</div>
      )}

      {showTrim && (
        <>
          <div className="kdp-guide-line trim vertical" style={{ left: leftTrim + "%" }} />
          <div className="kdp-guide-line trim vertical" style={{ left: rightTrim + "%" }} />
          <div className="kdp-guide-line trim horizontal" style={{ top: topTrim + "%" }} />
          <div className="kdp-guide-line trim horizontal" style={{ top: bottomTrim + "%" }} />
          <div className="guide-label trim-label">TRIM</div>
        </>
      )}

      {showSafe && (
        <>
          <div
            className="kdp-safe-box"
            style={{
              left: safeLeft + "%",
              top: safeTop + "%",
              width: Math.max(0, safeRight - safeLeft) + "%",
              height: Math.max(0, safeBottom - safeTop) + "%"
            }}
          />
          <div className="guide-label safe-label">
            SAFE • inside {insideMargin}" • outside {outsideMargin}"
          </div>
        </>
      )}

      <div className="guide-label page-side-label">
        Page {pageNumber} • {isRightPage ? "Right / odd" : "Left / even"}
      </div>
    </div>
  );
}

function KdpCoverGuides({ project }: { project: ZaxisProject }) {
  const settings = project.kdpSettings;
  if (!settings) return null;

  const pageCount = project.artboards.filter((item) => (item.role ?? "page") === "page").length;
  const layout = calculatePaperbackCoverLayout(pageCount, settings);
  const totalWidth = layout.totalWidthIn || 1;
  const totalHeight = layout.totalHeightIn || 1;

  const pctX = (value: number) => (value / totalWidth) * 100;
  const pctY = (value: number) => (value / totalHeight) * 100;

  const backStart = pctX(layout.backCover.xIn);
  const spineStart = pctX(layout.spine.xIn);
  const frontStart = pctX(layout.frontCover.xIn);
  const rightTrim = pctX(layout.frontCover.xIn + layout.frontCover.widthIn);
  const bleedTop = pctY(layout.bleedIn);
  const bleedBottom = 100 - bleedTop;

  const safeInsetX = pctX(layout.outerSafeMarginIn);
  const safeInsetY = pctY(layout.outerSafeMarginIn);
  const spineInset = pctX(Math.min(layout.spineSafeInsetIn, layout.spine.widthIn / 2));
  const barcode = layout.barcodeReservation;

  return (
    <div className="cover-guides" aria-hidden="true">
      <div className="cover-line bleed-left" style={{ left: backStart + "%" }} />
      <div className="cover-line spine-left" style={{ left: spineStart + "%" }} />
      <div className="cover-line spine-right" style={{ left: frontStart + "%" }} />
      <div className="cover-line bleed-right" style={{ left: rightTrim + "%" }} />
      <div className="cover-line horizontal bleed-top" style={{ top: bleedTop + "%" }} />
      <div className="cover-line horizontal bleed-bottom" style={{ top: bleedBottom + "%" }} />

      <div className="cover-zone back" style={{ left: backStart + "%", width: (spineStart - backStart) + "%" }}>
        <span>BACK COVER</span>
      </div>
      <div className="cover-zone spine" style={{ left: spineStart + "%", width: (frontStart - spineStart) + "%" }}>
        <span>SPINE {layout.spine.widthIn.toFixed(3)}"</span>
      </div>
      <div className="cover-zone front" style={{ left: frontStart + "%", width: (rightTrim - frontStart) + "%" }}>
        <span>FRONT COVER</span>
      </div>

      <div
        className="cover-safe back-safe"
        style={{
          left: (backStart + safeInsetX) + "%",
          right: (100 - spineStart + safeInsetX) + "%",
          top: safeInsetY + "%",
          bottom: safeInsetY + "%"
        }}
      >
        <span>BACK SAFE AREA</span>
      </div>

      <div
        className="cover-safe front-safe"
        style={{
          left: (frontStart + safeInsetX) + "%",
          right: (100 - rightTrim + safeInsetX) + "%",
          top: safeInsetY + "%",
          bottom: safeInsetY + "%"
        }}
      >
        <span>FRONT SAFE AREA</span>
      </div>

      {layout.spine.widthIn > 0 && (
        <div
          className="cover-spine-safe"
          style={{
            left: (spineStart + spineInset) + "%",
            width: Math.max(0, (frontStart - spineStart) - spineInset * 2) + "%",
            top: safeInsetY + "%",
            bottom: safeInsetY + "%"
          }}
        >
          <span>{pageCount >= KDP_RULES.spineTextMinimumPages ? "SPINE SAFE" : "NO SPINE TEXT"}</span>
        </div>
      )}

      <div
        className="cover-barcode-reservation"
        style={{
          left: pctX(barcode.xIn) + "%",
          bottom: pctY(barcode.yIn) + "%",
          width: pctX(barcode.widthIn) + "%",
          height: pctY(barcode.heightIn) + "%"
        }}
      >
        <strong>BARCODE</strong>
        <small>2" × 1.2" suggested</small>
      </div>
    </div>
  );
}

function CanvasObject({
  object,
  selected,
  onSelect,
  onChange,
  snap,
  onGuideChange,
  directEdit
}: {
  object: DesignObject;
  selected: boolean;
  onSelect: () => void;
  onChange: (input: Parameters<typeof updateObject>[3]) => void;
  snap: boolean;
  onGuideChange: (guide: { vertical: boolean; horizontal: boolean }) => void;
  directEdit: boolean;
}) {
  const [preview, setPreview] = useState<null | { x: number; y: number; width: number; height: number }>(null);
  const frame = preview ?? { x: object.x, y: object.y, width: object.width, height: object.height };
  const snapStep = 2;
  const snapValue = (value: number) => snap ? Math.round(value / snapStep) * snapStep : value;

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (object.locked || event.button !== 0) return;

    event.stopPropagation();
    onSelect();

    const artboardElement = event.currentTarget.parentElement;
    if (!artboardElement) return;

    const rect = artboardElement.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: object.x, y: object.y };

    function move(pointerEvent: PointerEvent) {
      const dx = ((pointerEvent.clientX - startX) / rect.width) * 100;
      const dy = ((pointerEvent.clientY - startY) / rect.height) * 100;
      let x = Math.max(0, Math.min(100 - object.width, snapValue(origin.x + dx)));
      let y = Math.max(0, Math.min(100 - object.height, snapValue(origin.y + dy)));
      const vertical = Math.abs((x + object.width / 2) - 50) <= 1;
      const horizontal = Math.abs((y + object.height / 2) - 50) <= 1;
      if (vertical) x = 50 - object.width / 2;
      if (horizontal) y = 50 - object.height / 2;
      onGuideChange({ vertical, horizontal });
      setPreview({ x, y, width: object.width, height: object.height });
    }

    function finish(pointerEvent: PointerEvent) {
      const dx = ((pointerEvent.clientX - startX) / rect.width) * 100;
      const dy = ((pointerEvent.clientY - startY) / rect.height) * 100;
      const x = Math.max(0, Math.min(100 - object.width, snapValue(origin.x + dx)));
      const y = Math.max(0, Math.min(100 - object.height, snapValue(origin.y + dy)));
      setPreview(null);
      onGuideChange({ vertical: false, horizontal: false });
      onChange({ x, y });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (object.locked || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const artboardElement = event.currentTarget.closest(".artboard");
    if (!(artboardElement instanceof HTMLElement)) return;

    const rect = artboardElement.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { width: object.width, height: object.height };

    function move(pointerEvent: PointerEvent) {
      const dw = ((pointerEvent.clientX - startX) / rect.width) * 100;
      const dh = ((pointerEvent.clientY - startY) / rect.height) * 100;
      setPreview({
        x: object.x,
        y: object.y,
        width: Math.max(2, Math.min(100 - object.x, snapValue(origin.width + dw))),
        height: Math.max(2, Math.min(100 - object.y, snapValue(origin.height + dh)))
      });
    }

    function finish(pointerEvent: PointerEvent) {
      const dw = ((pointerEvent.clientX - startX) / rect.width) * 100;
      const dh = ((pointerEvent.clientY - startY) / rect.height) * 100;
      const width = Math.max(2, Math.min(100 - object.x, snapValue(origin.width + dw)));
      const height = Math.max(2, Math.min(100 - object.y, snapValue(origin.height + dh)));
      setPreview(null);
      onChange({ width, height });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  const commonStyle = {
    left: frame.x + "%",
    top: frame.y + "%",
    width: frame.width + "%",
    height: frame.height + "%",
    opacity: object.opacity,
    transform:
      "rotate(" + object.rotation + "deg) " +
      "skew(" + object.skewX + "deg, " + object.skewY + "deg) " +
      "scale(" + (object.flipX ? -1 : 1) + ", " + (object.flipY ? -1 : 1) + ")"
  };

  const handle = selected && !object.locked ? (
    <button className="resize-handle" aria-label="Resize object" onPointerDown={beginResize} />
  ) : null;

  if (object.type === "path") {
    const firstPoint = object.points[0];
    let pathData = firstPoint ? "M " + firstPoint.x + " " + firstPoint.y : "";

    for (let index = 1; index < object.points.length; index += 1) {
      const previous = object.points[index - 1];
      const current = object.points[index];
      const out = previous.handleOut ?? { x: previous.x, y: previous.y };
      const incoming = current.handleIn ?? { x: current.x, y: current.y };

      pathData += previous.handleOut || current.handleIn
        ? " C " + out.x + " " + out.y + " " + incoming.x + " " + incoming.y + " " + current.x + " " + current.y
        : " L " + current.x + " " + current.y;
    }

    if (object.closed && object.points.length > 1) {
      const previous = object.points[object.points.length - 1];
      const current = object.points[0];
      const out = previous.handleOut ?? { x: previous.x, y: previous.y };
      const incoming = current.handleIn ?? { x: current.x, y: current.y };

      pathData += previous.handleOut || current.handleIn
        ? " C " + out.x + " " + out.y + " " + incoming.x + " " + incoming.y + " " + current.x + " " + current.y + " Z"
        : " Z";
    }

    function beginPointDrag(
      event: React.PointerEvent<HTMLButtonElement>,
      pointId: string,
      kind: "anchor" | "in" | "out"
    ) {
      if (!directEdit || object.locked || object.type !== "path") return;

      event.preventDefault();
      event.stopPropagation();
      onSelect();

      const frameElement = event.currentTarget.closest(".design-object");
      if (!(frameElement instanceof HTMLElement)) return;

      const rect = frameElement.getBoundingClientRect();
      const originalPoints = object.points.map((point) => ({
        ...point,
        handleIn: point.handleIn ? { ...point.handleIn } : undefined,
        handleOut: point.handleOut ? { ...point.handleOut } : undefined
      }));
      const pointIndex = originalPoints.findIndex((point) => point.id === pointId);
      if (pointIndex < 0) return;

      function finish(pointerEvent: PointerEvent) {
        const x = Math.max(0, Math.min(100, ((pointerEvent.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((pointerEvent.clientY - rect.top) / rect.height) * 100));

        const points = originalPoints.map((point, index) => {
          if (index !== pointIndex) return point;

          if (kind === "anchor") {
            const dx = x - point.x;
            const dy = y - point.y;
            return {
              ...point,
              x,
              y,
              handleIn: point.handleIn ? { x: point.handleIn.x + dx, y: point.handleIn.y + dy } : undefined,
              handleOut: point.handleOut ? { x: point.handleOut.x + dx, y: point.handleOut.y + dy } : undefined
            };
          }

          if (kind === "in") {
            return {
              ...point,
              handleIn: { x, y },
              handleOut: point.smooth ? {
                x: Math.max(0, Math.min(100, point.x * 2 - x)),
                y: Math.max(0, Math.min(100, point.y * 2 - y))
              } : point.handleOut
            };
          }

          return {
            ...point,
            handleOut: { x, y },
            handleIn: point.smooth ? {
              x: Math.max(0, Math.min(100, point.x * 2 - x)),
              y: Math.max(0, Math.min(100, point.y * 2 - y))
            } : point.handleIn
          };
        });

        onChange({ points });
        window.removeEventListener("pointerup", finish);
      }

      window.addEventListener("pointerup", finish, { once: true });
    }

    return (
      <div
        className={selected ? "design-object path-object selected" : "design-object path-object"}
        style={commonStyle}
        onPointerDown={directEdit ? undefined : beginDrag}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {selected && directEdit && object.points.map((point) => (
            <g key={"handles-" + point.id}>
              {point.handleIn && <line className="path-handle-line" x1={point.x} y1={point.y} x2={point.handleIn.x} y2={point.handleIn.y} />}
              {point.handleOut && <line className="path-handle-line" x1={point.x} y1={point.y} x2={point.handleOut.x} y2={point.handleOut.y} />}
            </g>
          ))}
          <path
            d={pathData}
            fill={object.closed ? object.fill : "none"}
            stroke={object.stroke}
            strokeWidth={object.strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {selected && directEdit && object.points.map((point) => (
          <div key={point.id}>
            <button
              className="path-node"
              style={{ left: point.x + "%", top: point.y + "%" }}
              onPointerDown={(event) => beginPointDrag(event, point.id, "anchor")}
              title="Drag anchor point"
            />
            {point.handleIn && (
              <button
                className="path-handle-node"
                style={{ left: point.handleIn.x + "%", top: point.handleIn.y + "%" }}
                onPointerDown={(event) => beginPointDrag(event, point.id, "in")}
                title="Drag incoming Bezier handle"
              />
            )}
            {point.handleOut && (
              <button
                className="path-handle-node"
                style={{ left: point.handleOut.x + "%", top: point.handleOut.y + "%" }}
                onPointerDown={(event) => beginPointDrag(event, point.id, "out")}
                title="Drag outgoing Bezier handle"
              />
            )}
          </div>
        ))}
        {handle}
      </div>
    );
  }

  if (object.type === "image") {
    return (
      <div
        className={selected ? "design-object image-object selected" : "design-object image-object"}
        style={commonStyle}
        onPointerDown={beginDrag}
      >
        <img
          src={object.src}
          alt={object.alt}
          style={{
            objectFit: object.fit,
            objectPosition: object.cropX + "% " + object.cropY + "%",
            transform: "scale(" + object.scale + ")",
            borderRadius: object.borderRadius + "px",
            clipPath:
              object.maskType === "ellipse"
                ? "ellipse(50% 50% at 50% 50%)"
                : object.maskType === "polygon"
                  ? "polygon(" + object.maskPoints.map((point) => point.x + "% " + point.y + "%").join(", ") + ")"
                  : undefined
          }}
        />
        {handle}
      </div>
    );
  }

  if (object.type === "text") {
    return (
      <div
        className={selected ? "design-object text-object selected" : "design-object text-object"}
        style={{
          ...commonStyle,
          color: object.color,
          fontFamily: object.fontFamily,
          fontSize: Math.max(10, object.fontSize * 0.55) + "px",
          fontWeight: object.fontWeight,
          textAlign: object.textAlign,
          lineHeight: object.lineHeight,
          letterSpacing: object.letterSpacing + "px"
        }}
        onPointerDown={beginDrag}
      >
        {object.text}
        {handle}
      </div>
    );
  }

  return (
    <div
      className={selected ? "design-object shape-object selected" : "design-object shape-object"}
      style={{
        ...commonStyle,
        background: object.fill,
        border: object.strokeWidth + "px solid " + object.stroke,
        borderRadius: object.type === "ellipse" ? "50%" : object.cornerRadius + "px"
      }}
      onPointerDown={beginDrag}
    >
      {handle}
    </div>
  );
}

function KdpBookPanel({
  project,
  onCommit,
  onOpenPage,
  onOpenArtboard
}: {
  project: ZaxisProject;
  onCommit: (project: ZaxisProject) => void;
  onOpenPage: (page: number) => void;
  onOpenArtboard: (artboardId: string) => void;
}) {
  const maybeSettings = project.kdpSettings;
  const structure = normalizeBookStructure(project.bookStructure);
  const result = useMemo(() => analyzeKdpProject(project), [project]);

  if (!maybeSettings) return null;
  const kdpSettings = maybeSettings;

  function update(input: Parameters<typeof updateKdpSettings>[1]) {
    onCommit(updateKdpSettings(project, input));
  }

  const applyPageSize = () => {
    const width = kdpSettings.trimWidthIn + (kdpSettings.bleed ? KDP_RULES.bleedIn : 0);
    const height = kdpSettings.trimHeightIn + (kdpSettings.bleed ? KDP_RULES.bleedIn * 2 : 0);
    onCommit(resizeAllArtboards(project, { width, height, unit: "in" }));
  };

  const createCover = () => {
    const result = createOrUpdateKdpCoverArtboard(project);
    onCommit(result.project);
    if (result.artboardId) onOpenArtboard(result.artboardId);
  };

  const generateToc = () => {
    const result = createOrUpdateTocArtboard(project);
    onCommit(result.project);
    if (result.artboardId) onOpenArtboard(result.artboardId);
  };

  const addChapter = () => {
    const title = window.prompt("Chapter title", "Chapter " + (structure.chapters.length + 1));
    if (!title?.trim()) return;

    const pageValue = window.prompt(
      "Chapter starts on physical interior page",
      String(Math.min(result.pageCount, Math.max(1, structure.chapters.at(-1)?.startPage ?? 1)))
    );
    if (!pageValue) return;

    const startPage = Math.max(1, Math.min(result.pageCount || 1, Number(pageValue) || 1));
    onCommit(addBookChapter(project, createChapter(title, startPage)));
  };

  const errorCount = result.issues.filter((issue) => issue.severity === "error").length;
  const warningCount = result.issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className="kdp-panel">
      <div className="kdp-panel-head">
        <div>
          <strong>KDP Book & Preflight</strong>
          <small>Rules {KDP_RULES.rulesetVersion}</small>
        </div>
        <span className={result.ready ? "kdp-ready" : "kdp-not-ready"}>
          {result.ready ? "Ready" : errorCount + " errors"}
        </span>
      </div>

      <div className="inspector-grid">
        <label>Trim W
          <input
            type="number"
            min="4"
            max="8.5"
            step="0.001"
            value={kdpSettings.trimWidthIn}
            onChange={(event) => update({ trimWidthIn: Number(event.target.value) })}
          />
        </label>
        <label>Trim H
          <input
            type="number"
            min="6"
            max="11.69"
            step="0.001"
            value={kdpSettings.trimHeightIn}
            onChange={(event) => update({ trimHeightIn: Number(event.target.value) })}
          />
        </label>
      </div>

      <label className="toggle-setting kdp-toggle">
        <input
          type="checkbox"
          checked={kdpSettings.bleed}
          onChange={(event) => update({ bleed: event.target.checked })}
        />
        Full bleed interior
      </label>

      <label className="inspector-field">Paper
        <select
          value={kdpSettings.paperType}
          onChange={(event) => update({ paperType: event.target.value as KdpPaperType })}
        >
          <option value="white">White</option>
          <option value="cream">Cream</option>
          <option value="groundwood">Groundwood</option>
          <option value="color">Color paper</option>
        </select>
      </label>

      <label className="inspector-field">Ink
        <select
          value={kdpSettings.inkType}
          onChange={(event) => update({ inkType: event.target.value as KdpInkType })}
        >
          <option value="black">Black</option>
          <option value="standard-color">Standard Color</option>
          <option value="premium-color">Premium Color</option>
        </select>
      </label>

      <div className="artboard-actions">
        <button className="secondary" onClick={applyPageSize}>Apply Page Size</button>
        <button className="secondary" onClick={createCover}>Create / Update Cover</button>
      </div>

      <div className="kdp-metrics">
        <span><small>Pages</small><strong>{result.pageCount}</strong></span>
        <span><small>Inside</small><strong>{result.requiredInsideMarginIn}"</strong></span>
        <span><small>Outside</small><strong>{result.requiredOutsideMarginIn}"</strong></span>
        <span><small>Spine</small><strong>{result.spineWidthIn}"</strong></span>
      </div>

      <div className="kdp-cover-size">
        <small>Full paperback cover + bleed</small>
        <strong>{result.coverWidthIn}" × {result.coverHeightIn}"</strong>
        <span>{result.spineTextAllowed ? "Spine text allowed" : "No spine text below 80 pages"}</span>
      </div>

      <div className="kdp-subsection">
        <div className="kdp-subsection-head">
          <strong>Page Numbers</strong>
          <label className="toggle-setting">
            <input
              type="checkbox"
              checked={structure.pageNumbers.enabled}
              onChange={(event) => onCommit(updatePageNumberSettings(project, { enabled: event.target.checked }))}
            />
            Enabled
          </label>
        </div>

        <div className="inspector-grid">
          <label>Start Page
            <input
              type="number"
              min="1"
              value={structure.pageNumbers.startPage}
              onChange={(event) => onCommit(updatePageNumberSettings(project, { startPage: Number(event.target.value) }))}
            />
          </label>
          <label>Start Number
            <input
              type="number"
              min="1"
              value={structure.pageNumbers.startNumber}
              onChange={(event) => onCommit(updatePageNumberSettings(project, { startNumber: Number(event.target.value) }))}
            />
          </label>
        </div>

        <label className="inspector-field">Format
          <select
            value={structure.pageNumbers.format}
            onChange={(event) => onCommit(updatePageNumberSettings(project, { format: event.target.value as PageNumberFormat }))}
          >
            <option value="arabic">1, 2, 3</option>
            <option value="roman-lower">i, ii, iii</option>
            <option value="roman-upper">I, II, III</option>
          </select>
        </label>

        <label className="inspector-field">Position
          <select
            value={structure.pageNumbers.position}
            onChange={(event) => onCommit(updatePageNumberSettings(project, { position: event.target.value as PageNumberPosition }))}
          >
            <option value="bottom-outside">Bottom Outside</option>
            <option value="bottom-center">Bottom Center</option>
            <option value="top-outside">Top Outside</option>
            <option value="top-center">Top Center</option>
          </select>
        </label>

        <label className="toggle-setting kdp-toggle">
          <input
            type="checkbox"
            checked={structure.pageNumbers.skipChapterOpeners}
            onChange={(event) => onCommit(updatePageNumberSettings(project, { skipChapterOpeners: event.target.checked }))}
          />
          Skip page number on chapter opening pages
        </label>
      </div>

      <div className="kdp-subsection">
        <div className="kdp-subsection-head">
          <strong>Chapters & TOC</strong>
          <div className="hero-actions">
            <button className="secondary" onClick={addChapter}>+ Chapter</button>
            <button className="secondary" onClick={generateToc}>Generate / Update TOC</button>
          </div>
        </div>

        <label className="inspector-field">TOC Title
          <input
            value={structure.tocTitle}
            onChange={(event) => onCommit(updateTocTitle(project, event.target.value))}
          />
        </label>

        <div className="chapter-list">
          {structure.chapters.length === 0 ? (
            <small className="muted">No chapters yet. Add chapters to build TOC metadata.</small>
          ) : structure.chapters.map((chapter) => (
            <div className="chapter-row" key={chapter.id}>
              <input
                value={chapter.title}
                onChange={(event) => onCommit(updateBookChapter(project, chapter.id, { title: event.target.value }))}
              />
              <input
                type="number"
                min="1"
                max={Math.max(1, result.pageCount)}
                value={chapter.startPage}
                onChange={(event) => onCommit(updateBookChapter(project, chapter.id, { startPage: Number(event.target.value) }))}
              />
              <button
                className="danger-text"
                onClick={() => onCommit(deleteBookChapter(project, chapter.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {structure.chapters.length > 0 && (
          <div className="toc-preview">
            <strong>{structure.tocTitle}</strong>
            {structure.chapters.map((chapter) => (
              <span key={chapter.id}>
                <em>{chapter.title}</em>
                <i />
                <b>{chapter.startPage}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="preflight-list">
        {result.issues.slice(0, 10).map((issue, index) => (
          <button
            key={issue.code + "-" + (issue.page ?? "book") + "-" + index}
            className={"preflight-item " + issue.severity}
            onClick={() => issue.page && onOpenPage(issue.page)}
          >
            <strong>{issue.severity.toUpperCase()}{issue.page ? " • Page " + issue.page : ""}</strong>
            <small>{issue.message}</small>
          </button>
        ))}
        {result.issues.length === 0 && <div className="kdp-all-clear">No current preflight issues.</div>}
        {result.issues.length > 10 && <small className="muted">+ {result.issues.length - 10} more issues</small>}
      </div>

      <small className="muted">{warningCount} warnings • {errorCount} errors</small>
    </div>
  );
}

function ObjectInspector({
  object,
  onChange,
  systemFonts
}: {
  object: DesignObject;
  onChange: (input: Parameters<typeof updateObject>[3]) => void;
  systemFonts: string[];
}) {
  return (
    <div className="object-inspector">
      <Property label="Selected" value={object.name} />

      <div className="inspector-grid">
        <label>X<input type="number" value={object.x} onChange={(event) => onChange({ x: Number(event.target.value) })} /></label>
        <label>Y<input type="number" value={object.y} onChange={(event) => onChange({ y: Number(event.target.value) })} /></label>
        <label>W<input type="number" value={object.width} onChange={(event) => onChange({ width: Number(event.target.value) })} /></label>
        <label>H<input type="number" value={object.height} onChange={(event) => onChange({ height: Number(event.target.value) })} /></label>
      </div>

      <label className="inspector-field">Rotation
        <input type="number" value={object.rotation} onChange={(event) => onChange({ rotation: Number(event.target.value) })} />
      </label>

      <div className="inspector-grid">
        <label>Skew X<input type="number" min="-89" max="89" value={object.skewX} onChange={(event) => onChange({ skewX: Number(event.target.value) })} /></label>
        <label>Skew Y<input type="number" min="-89" max="89" value={object.skewY} onChange={(event) => onChange({ skewY: Number(event.target.value) })} /></label>
      </div>

      <div className="artboard-actions">
        <button className={object.flipX ? "secondary toggle-on" : "secondary"} onClick={() => onChange({ flipX: !object.flipX })}>Flip X</button>
        <button className={object.flipY ? "secondary toggle-on" : "secondary"} onClick={() => onChange({ flipY: !object.flipY })}>Flip Y</button>
      </div>

      <label className="inspector-field">Opacity
        <input type="number" min="0" max="1" step="0.05" value={object.opacity} onChange={(event) => onChange({ opacity: Number(event.target.value) })} />
      </label>

      {object.type === "path" ? (
        <>
          <label className="inspector-field">Closed Path
            <select value={object.closed ? "yes" : "no"} onChange={(event) => onChange({ closed: event.target.value === "yes" })}>
              <option value="no">Open</option>
              <option value="yes">Closed</option>
            </select>
          </label>
          <label className="inspector-field">Fill
            <input type="color" value={object.fill === "transparent" ? "#ffffff" : object.fill} onChange={(event) => onChange({ fill: event.target.value })} />
          </label>
          <label className="inspector-field">Stroke
            <input type="color" value={object.stroke} onChange={(event) => onChange({ stroke: event.target.value })} />
          </label>
          <label className="inspector-field">Stroke Width
            <input type="number" min="0" value={object.strokeWidth} onChange={(event) => onChange({ strokeWidth: Number(event.target.value) })} />
          </label>
          <Property label="Anchor Points" value={String(object.points.length)} />
        </>
      ) : object.type === "image" ? (
        <>
          <label className="inspector-field">Fit
            <select value={object.fit} onChange={(event) => onChange({ fit: event.target.value as "contain" | "cover" | "fill" })}>
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Fill</option>
            </select>
          </label>
          <label className="inspector-field">Alt Text
            <input value={object.alt} onChange={(event) => onChange({ alt: event.target.value })} />
          </label>
          <div className="inspector-grid">
            <label>Crop X<input type="number" min="0" max="100" value={object.cropX} onChange={(event) => onChange({ cropX: Number(event.target.value) })} /></label>
            <label>Crop Y<input type="number" min="0" max="100" value={object.cropY} onChange={(event) => onChange({ cropY: Number(event.target.value) })} /></label>
          </div>
          <label className="inspector-field">Image Scale
            <input type="number" min="0.1" max="5" step="0.1" value={object.scale} onChange={(event) => onChange({ scale: Number(event.target.value) })} />
          </label>
          <label className="inspector-field">Mask
            <select value={object.maskType} onChange={(event) => onChange({ maskType: event.target.value as "none" | "ellipse" | "polygon" })}>
              <option value="none">None</option>
              <option value="ellipse">Ellipse</option>
              <option value="polygon">Custom Polygon</option>
            </select>
          </label>
          <label className="inspector-field">Mask Radius
            <input type="number" min="0" value={object.borderRadius} onChange={(event) => onChange({ borderRadius: Number(event.target.value) })} />
          </label>
          {object.maskType === "polygon" && (
            <div className="mask-point-list">
              {object.maskPoints.map((point, index) => (
                <div className="mask-point-row" key={point.id}>
                  <span>M{index + 1}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={point.x}
                    onChange={(event) => {
                      const maskPoints = object.maskPoints.map((item) => item.id === point.id ? { ...item, x: Number(event.target.value) } : item);
                      onChange({ maskPoints });
                    }}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={point.y}
                    onChange={(event) => {
                      const maskPoints = object.maskPoints.map((item) => item.id === point.id ? { ...item, y: Number(event.target.value) } : item);
                      onChange({ maskPoints });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : object.type === "text" ? (
        <>
          <label className="inspector-field">Text
            <textarea value={object.text} onChange={(event) => onChange({ text: event.target.value })} />
          </label>
          <label className="inspector-field">Font
            <select value={object.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
              {!systemFonts.includes(object.fontFamily) && <option value={object.fontFamily}>{object.fontFamily}</option>}
              {systemFonts.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </label>
          <label className="inspector-field">Font Size
            <input type="number" value={object.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} />
          </label>
          <label className="inspector-field">Weight
            <select value={object.fontWeight} onChange={(event) => onChange({ fontWeight: Number(event.target.value) })}>
              <option value={300}>Light</option>
              <option value={400}>Regular</option>
              <option value={500}>Medium</option>
              <option value={600}>Semi Bold</option>
              <option value={700}>Bold</option>
              <option value={800}>Extra Bold</option>
            </select>
          </label>
          <label className="inspector-field">Alignment
            <select value={object.textAlign} onChange={(event) => onChange({ textAlign: event.target.value as "left" | "center" | "right" })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="inspector-field">Line Height
            <input type="number" min="0.5" step="0.1" value={object.lineHeight} onChange={(event) => onChange({ lineHeight: Number(event.target.value) })} />
          </label>
          <label className="inspector-field">Letter Spacing
            <input type="number" step="0.1" value={object.letterSpacing} onChange={(event) => onChange({ letterSpacing: Number(event.target.value) })} />
          </label>
          <label className="inspector-field">Color
            <input type="color" value={object.color} onChange={(event) => onChange({ color: event.target.value })} />
          </label>
        </>
      ) : (
        <>
          <label className="inspector-field">Fill
            <input type="color" value={object.fill} onChange={(event) => onChange({ fill: event.target.value })} />
          </label>
          <label className="inspector-field">Stroke
            <input type="color" value={object.stroke} onChange={(event) => onChange({ stroke: event.target.value })} />
          </label>
          <label className="inspector-field">Stroke Width
            <input type="number" min="0" value={object.strokeWidth} onChange={(event) => onChange({ strokeWidth: Number(event.target.value) })} />
          </label>
        </>
      )}
    </div>
  );
}

function PdfToolsScreen() {
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeStatus, setMergeStatus] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [range, setRange] = useState("1");
  const [splitGroups, setSplitGroups] = useState("");
  const [pageStatus, setPageStatus] = useState("");
  const [optimizeStatus, setOptimizeStatus] = useState("");
  const [leftCompare, setLeftCompare] = useState<File | null>(null);
  const [rightCompare, setRightCompare] = useState<File | null>(null);
  const [compareResult, setCompareResult] = useState<PdfCompareResult | null>(null);
  const [compareStatus, setCompareStatus] = useState("");
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const leftInputRef = useRef<HTMLInputElement | null>(null);
  const rightInputRef = useRef<HTMLInputElement | null>(null);

  function moveMergeFile(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= mergeFiles.length) return;

    const next = [...mergeFiles];
    [next[index], next[target]] = [next[target], next[index]];
    setMergeFiles(next);
  }

  async function mergeAndSave() {
    setMergeStatus("Merging PDFs...");

    try {
      const bytes = await mergePdfFiles(mergeFiles);
      const path = await savePdfToComputer(bytes, "zaxis-kdp-merged.pdf");
      setMergeStatus(path ? "Merged PDF saved." : "Merge save cancelled.");
    } catch (error) {
      setMergeStatus(error instanceof Error ? error.message : "PDF merge failed.");
    }
  }

  async function extractAndSave() {
    if (!sourceFile) {
      setPageStatus("Select a PDF first.");
      return;
    }

    setPageStatus("Extracting pages...");

    try {
      const bytes = await extractPdfPages(sourceFile, range);
      const base = sourceFile.name.replace(/\.pdf$/i, "");
      const path = await savePdfToComputer(bytes, base + "-pages-" + range.replace(/[^0-9,-]+/g, "") + ".pdf");
      setPageStatus(path ? "Extracted PDF saved." : "Extract save cancelled.");
    } catch (error) {
      setPageStatus(error instanceof Error ? error.message : "Page extraction failed.");
    }
  }

  async function rotateAndSave(degree: 90 | 180 | 270) {
    if (!sourceFile) {
      setPageStatus("Select a PDF first.");
      return;
    }

    setPageStatus("Rotating pages...");

    try {
      const bytes = await rotatePdfPages(sourceFile, range, degree);
      const base = sourceFile.name.replace(/\.pdf$/i, "");
      const path = await savePdfToComputer(bytes, base + "-rotated.pdf");
      setPageStatus(path ? "Rotated PDF saved." : "Rotate save cancelled.");
    } catch (error) {
      setPageStatus(error instanceof Error ? error.message : "PDF rotation failed.");
    }
  }

  async function splitAndSave() {
    if (!sourceFile) {
      setPageStatus("Select a PDF first.");
      return;
    }

    setPageStatus("Splitting PDF...");

    try {
      const result = await splitPdfToZip(sourceFile, splitGroups);
      const base = sourceFile.name.replace(/\.pdf$/i, "");
      const path = await saveBinaryToComputer(
        result.bytes,
        base + "-split.zip",
        {
          title: "Save Split PDF Bundle",
          mimeType: "application/zip",
          filterName: "ZIP Archive",
          extensions: ["zip"]
        }
      );
      setPageStatus(
        path
          ? "Split complete: " + result.outputCount + " PDF file" + (result.outputCount === 1 ? "" : "s") + " saved in ZIP."
          : "Split save cancelled."
      );
    } catch (error) {
      setPageStatus(error instanceof Error ? error.message : "PDF split failed.");
    }
  }

  async function optimizeAndSave() {
    if (!sourceFile) {
      setOptimizeStatus("Select a PDF first.");
      return;
    }

    setOptimizeStatus("Optimizing PDF without image downsampling...");

    try {
      const result = await optimizePdfLossless(sourceFile);

      if (!result.changed) {
        setOptimizeStatus(
          "No smaller lossless result found. Original is already as small or smaller, so Zaxis will not pretend it compressed."
        );
        return;
      }

      const base = sourceFile.name.replace(/\.pdf$/i, "");
      const path = await savePdfToComputer(result.bytes, base + "-optimized.pdf");

      if (!path) {
        setOptimizeStatus("Optimize save cancelled.");
        return;
      }

      setOptimizeStatus(
        "Optimized: " +
        (result.originalSizeBytes / (1024 * 1024)).toFixed(2) +
        " MB → " +
        (result.optimizedSizeBytes / (1024 * 1024)).toFixed(2) +
        " MB • saved " +
        result.savedPercent.toFixed(2) +
        "%."
      );
    } catch (error) {
      setOptimizeStatus(error instanceof Error ? error.message : "PDF optimization failed.");
    }
  }

  async function compareFiles() {
    if (!leftCompare || !rightCompare) {
      setCompareStatus("Select both PDFs first.");
      return;
    }

    setCompareStatus("Comparing PDF structure...");

    try {
      const result = await comparePdfStructure(leftCompare, rightCompare);
      setCompareResult(result);
      setCompareStatus("Structural comparison complete.");
    } catch (error) {
      setCompareStatus(error instanceof Error ? error.message : "PDF comparison failed.");
    }
  }

  return (
    <section className="content">
      <div className="panel">
        <span className="eyebrow">PDF MERGE</span>
        <div className="panel-heading">
          <div>
            <h2>Merge PDFs</h2>
            <p className="muted">Files are merged in the exact order shown below.</p>
          </div>
          <div className="hero-actions">
            <input
              ref={mergeInputRef}
              className="hidden-input"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) setMergeFiles((current) => [...current, ...files]);
                event.currentTarget.value = "";
              }}
            />
            <button className="secondary" onClick={() => mergeInputRef.current?.click()}>Add PDFs</button>
            <button className="primary" disabled={mergeFiles.length < 2} onClick={() => void mergeAndSave()}>Merge & Save</button>
          </div>
        </div>

        <div className="pdf-file-list">
          {mergeFiles.length === 0 ? (
            <div className="empty-projects">Add two or more PDF files.</div>
          ) : mergeFiles.map((file, index) => (
            <div className="pdf-file-row" key={file.name + "-" + file.size + "-" + index}>
              <span>{index + 1}</span>
              <div><strong>{file.name}</strong><small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small></div>
              <button onClick={() => moveMergeFile(index, -1)} disabled={index === 0}>↑</button>
              <button onClick={() => moveMergeFile(index, 1)} disabled={index === mergeFiles.length - 1}>↓</button>
              <button className="danger-text" onClick={() => setMergeFiles((current) => current.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
        </div>
        {mergeStatus && <p className="muted">{mergeStatus}</p>}
      </div>

      <div className="panel">
        <span className="eyebrow">EXTRACT / ROTATE</span>
        <div className="panel-heading">
          <div>
            <h2>Page Tools</h2>
            <p className="muted">Use ranges like 1-5,8,11-14 or All.</p>
          </div>
          <div className="hero-actions">
            <input
              ref={sourceInputRef}
              className="hidden-input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                setSourceFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            <button className="secondary" onClick={() => sourceInputRef.current?.click()}>
              {sourceFile ? sourceFile.name : "Select PDF"}
            </button>
          </div>
        </div>

        <div className="settings-grid">
          <label>Page Range
            <input value={range} onChange={(event) => setRange(event.target.value)} placeholder="1-5,8,11-14" />
          </label>
          <label>Split Groups
            <input
              value={splitGroups}
              onChange={(event) => setSplitGroups(event.target.value)}
              placeholder="1-10;11-20;21-30 (blank = every page)"
            />
          </label>
        </div>
        <div className="hero-actions">
          <button className="primary" disabled={!sourceFile} onClick={() => void extractAndSave()}>Extract & Save</button>
          <button className="secondary" disabled={!sourceFile} onClick={() => void splitAndSave()}>Split to ZIP</button>
          <button className="secondary" disabled={!sourceFile} onClick={() => void rotateAndSave(90)}>Rotate 90°</button>
          <button className="secondary" disabled={!sourceFile} onClick={() => void rotateAndSave(180)}>Rotate 180°</button>
          <button className="secondary" disabled={!sourceFile} onClick={() => void rotateAndSave(270)}>Rotate 270°</button>
          <button className="secondary" disabled={!sourceFile} onClick={() => void optimizeAndSave()}>Lossless Optimize</button>
        </div>
        {pageStatus && <p className="muted">{pageStatus}</p>}
        {optimizeStatus && <p className="muted">{optimizeStatus}</p>}
      </div>

      <div className="panel">
        <span className="eyebrow">PDF COMPARE</span>
        <h2>Structural Compare</h2>
        <p className="muted">Current foundation compares page count, page sizes/rotation and file size. Visual pixel-diff comparison comes next.</p>
        <div className="hero-actions">
          <input
            ref={leftInputRef}
            className="hidden-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              setLeftCompare(event.target.files?.[0] ?? null);
              setCompareResult(null);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={rightInputRef}
            className="hidden-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              setRightCompare(event.target.files?.[0] ?? null);
              setCompareResult(null);
              event.currentTarget.value = "";
            }}
          />
          <button className="secondary" onClick={() => leftInputRef.current?.click()}>{leftCompare?.name ?? "Old PDF"}</button>
          <button className="secondary" onClick={() => rightInputRef.current?.click()}>{rightCompare?.name ?? "New PDF"}</button>
          <button className="primary" disabled={!leftCompare || !rightCompare} onClick={() => void compareFiles()}>Compare</button>
        </div>

        {compareResult && (
          <div className="pdf-compare-grid">
            <div><small>Old Pages</small><strong>{compareResult.left.pageCount}</strong></div>
            <div><small>New Pages</small><strong>{compareResult.right.pageCount}</strong></div>
            <div><small>Page Count</small><strong>{compareResult.samePageCount ? "Same" : "Changed"}</strong></div>
            <div><small>Page Sizes</small><strong>{compareResult.samePageSizes ? "Same" : "Changed"}</strong></div>
            <div><small>Old Size</small><strong>{(compareResult.left.sizeBytes / (1024 * 1024)).toFixed(2)} MB</strong></div>
            <div><small>New Size</small><strong>{(compareResult.right.sizeBytes / (1024 * 1024)).toFixed(2)} MB</strong></div>
          </div>
        )}

        {compareStatus && <p className="muted">{compareStatus}</p>}
      </div>
    </section>
  );
}

function AssetsScreen({
  settings,
  token,
  project
}: {
  settings: AppSettings;
  token: string;
  project: ZaxisProject;
}) {
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function api() {
    return new ZaxisCloudApi(settings.cloudApiUrl.trim(), token.trim() || undefined);
  }

  async function refreshAssets() {
    if (!settings.cloudApiUrl.trim() || !token.trim()) {
      setAssets([]);
      setStatus("Connect Cloud & Server first.");
      return;
    }

    setStatus("Loading assets...");

    try {
      const result = await api().listAssets(project.id);
      setAssets(result.assets);
      setStatus(result.assets.length + " project asset" + (result.assets.length === 1 ? "" : "s") + " loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load cloud assets.");
    }
  }

  useEffect(() => {
    void refreshAssets();
  }, [settings.cloudApiUrl, token, project.id]);

  async function uploadFile(file: File) {
    if (!settings.cloudApiUrl.trim() || !token.trim()) {
      setStatus("Connect Cloud & Server first.");
      return;
    }

    setUploading(true);
    setStatus("Uploading " + file.name + "...");

    try {
      const result = await api().uploadAsset(file, project.id);
      setStatus(
        "Uploaded " + result.asset.original_name +
        (result.asset.variants.proxy ? " • proxy generated" : " • original stored")
      );
      await refreshAssets();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Asset upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAsset(assetId: string) {
    if (!window.confirm("Remove this cloud asset from the library?")) return;

    try {
      await api().deleteAsset(assetId);
      await refreshAssets();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove asset.");
    }
  }

  return (
    <section className="content">
      <div className="panel hero-panel">
        <div>
          <span className="eyebrow">CLOUD ASSET LIBRARY</span>
          <h2>Originals stay on the server. Lightweight proxies keep the editor responsive.</h2>
          <p>{status || "Upload images, PDFs or supported fonts to the active project."}</p>
        </div>
        <div className="hero-actions">
          <input
            ref={inputRef}
            className="hidden-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.ttf,.otf,.woff,.woff2"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
              event.currentTarget.value = "";
            }}
          />
          <button className="secondary" onClick={() => void refreshAssets()}>Refresh</button>
          <button className="primary" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading..." : "Upload Asset"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ACTIVE PROJECT</span>
            <h3>{project.name}</h3>
          </div>
          <span className="pill">{assets.length} assets</span>
        </div>

        <div className="asset-list">
          {assets.length === 0 ? (
            <div className="empty-projects">No cloud assets for this project yet.</div>
          ) : assets.map((asset) => (
            <div className="asset-row" key={asset.id}>
              <div>
                <strong>{asset.original_name}</strong>
                <small>
                  {asset.mime_type} • {(asset.size_bytes / (1024 * 1024)).toFixed(2)} MB
                  {asset.variants.proxy ? " • Proxy ready" : ""}
                </small>
              </div>
              <div className="asset-meta">
                <small>{new Date(asset.created_at).toLocaleString()}</small>
                {asset.variants.proxy && (
                  <small>
                    {asset.variants.proxy.width_px} × {asset.variants.proxy.height_px}
                  </small>
                )}
              </div>
              <button className="secondary danger" onClick={() => void removeAsset(asset.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SettingsScreen({
  settings,
  onChange,
  onClearCache
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClearCache: () => void;
}) {
  const [nativeCache, setNativeCache] = useState<NativeCacheStatus | null>(null);
  const [cacheMessage, setCacheMessage] = useState("");

  async function refreshNativeCache() {
    try {
      const status = await invoke<NativeCacheStatus>("get_native_cache_status", {
        configuredPath: settings.cacheLocation
      });
      setNativeCache(status);
      setCacheMessage("");
    } catch {
      setCacheMessage("Native cache info is available in the Windows app.");
    }
  }

  async function clearNativeCacheNow() {
    try {
      const status = await invoke<NativeCacheStatus>("clear_native_cache", {
        configuredPath: settings.cacheLocation
      });
      setNativeCache(status);
      setCacheMessage("Native cache cleared.");
    } catch {
      setCacheMessage("Native cache clear is available in the Windows app.");
    }
  }

  return (
    <section className="content">
      <div className="panel">
        <span className="eyebrow">LOCAL CACHE & RECOVERY</span>
        <h2>Settings</h2>
        <div className="settings-grid">
          <label>Cache Limit
            <select
              value={settings.cacheLimitMb}
              onChange={(event) => onChange({ ...settings, cacheLimitMb: Number(event.target.value) })}
            >
              <option value={250}>250 MB</option>
              <option value={500}>500 MB</option>
              <option value={1024}>1 GB</option>
              <option value={2048}>2 GB</option>
            </select>
          </label>
          <label>Cache Location
            <input
              value={settings.cacheLocation}
              onChange={(event) => onChange({ ...settings, cacheLocation: event.target.value })}
              placeholder="System Default / D:\\ZaxisCache"
            />
          </label>
          <label>Autosave Delay
            <select
              value={settings.autosaveDelayMs}
              onChange={(event) => onChange({ ...settings, autosaveDelayMs: Number(event.target.value) })}
            >
              <option value={250}>250 ms</option>
              <option value={450}>450 ms</option>
              <option value={750}>750 ms</option>
              <option value={1000}>1 second</option>
            </select>
          </label>
          <label className="toggle-setting">
            <input type="checkbox" checked={settings.gridDefault} onChange={(event) => onChange({ ...settings, gridDefault: event.target.checked })} />
            Grid visible by default
          </label>
          <label className="toggle-setting">
            <input type="checkbox" checked={settings.snapDefault} onChange={(event) => onChange({ ...settings, snapDefault: event.target.checked })} />
            Snap enabled by default
          </label>
        </div>
        <div className="cache-status-card">
          <strong>Native Windows Cache</strong>
          {nativeCache ? (
            <>
              <small>{nativeCache.path}</small>
              <span>{(nativeCache.size_bytes / (1024 * 1024)).toFixed(2)} MB • {nativeCache.file_count} files</span>
            </>
          ) : (
            <small>Check the actual filesystem cache used by the Windows app.</small>
          )}
          {cacheMessage && <small>{cacheMessage}</small>}
          <div className="hero-actions">
            <button className="secondary" onClick={() => void refreshNativeCache()}>Check Native Cache</button>
            <button className="secondary danger" onClick={() => void clearNativeCacheNow()}>Clear Native Cache</button>
          </div>
        </div>
        <button className="secondary danger" onClick={onClearCache}>Clear Local Recovery Cache</button>
      </div>
    </section>
  );
}

function CloudScreen({
  settings,
  onSettingsChange,
  token,
  onTokenChange,
  project,
  automaticState,
  pendingCount,
  onFlushQueue,
  onReplaceProject
}: {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  token: string;
  onTokenChange: (token: string) => void;
  project: ZaxisProject;
  automaticState: CloudSaveState;
  pendingCount: number;
  onFlushQueue: () => Promise<void>;
  onReplaceProject: (snapshot: ZaxisProject, suppressCloudAutosave?: boolean) => void;
}) {
  const [status, setStatus] = useState("Not tested");
  const [identity, setIdentity] = useState("");
  const [cloudProjects, setCloudProjects] = useState<CloudProjectSummary[]>([]);
  const [cloudRevisions, setCloudRevisions] = useState<Array<{
    revision_number: number | string;
    label: string | null;
    snapshot_hash: string;
    created_at: string;
  }>>([]);
  const [revisionStatus, setRevisionStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [credentialStatus, setCredentialStatus] = useState("");
  const [connectionCode, setConnectionCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [conflictInfo, setConflictInfo] = useState<{
    remoteRevision: number;
    remote: ZaxisProject | null;
    local: ZaxisProject;
    queuedAt: string;
  } | null>(null);

  function api() {
    return new ZaxisCloudApi(settings.cloudApiUrl.trim(), token.trim() || undefined);
  }

  async function connectWithCode() {
    if (!settings.cloudApiUrl.trim() || !connectionCode.trim()) {
      setCredentialStatus("API URL and connection code are required.");
      return;
    }

    setCredentialStatus("Connecting...");

    try {
      const result = await new ZaxisCloudApi(settings.cloudApiUrl.trim()).pair(connectionCode.trim());
      onTokenChange(result.token);
      await invoke("store_cloud_token", { token: result.token });
      setConnectionCode("");
      setIdentity("Connected as " + result.user.name + " • " + result.user.email);
      setCredentialStatus("Connected. Token encrypted for this Windows account.");
      await onFlushQueue();
    } catch (error) {
      setCredentialStatus(error instanceof Error ? error.message : "Connection code failed.");
    }
  }

  async function generateConnectionCode() {
    if (!settings.cloudApiUrl.trim() || !token.trim()) {
      setCredentialStatus("Connect this device first.");
      return;
    }

    try {
      const result = await api().createConnectionCode("Additional Windows Desktop");
      setGeneratedCode(result.code + " • expires " + new Date(result.expires_at).toLocaleString());
      setCredentialStatus("New one-time code generated.");
    } catch (error) {
      setCredentialStatus(error instanceof Error ? error.message : "Could not generate a connection code.");
    }
  }

  async function saveTokenSecurely() {
    if (!token.trim()) {
      setCredentialStatus("Enter a token first.");
      return;
    }

    setCredentialStatus("Saving securely...");

    try {
      await invoke("store_cloud_token", { token: token.trim() });
      setCredentialStatus("Token saved with Windows user-bound encryption.");
    } catch {
      setCredentialStatus("Secure token storage is available in the Windows app.");
    }
  }

  async function clearStoredToken() {
    try {
      await invoke("clear_cloud_token");
      onTokenChange("");
      setCredentialStatus("Stored token cleared.");
    } catch {
      setCredentialStatus("Could not clear the stored token.");
    }
  }

  async function testHealth() {
    if (!settings.cloudApiUrl.trim()) {
      setStatus("Enter the server API URL first.");
      return;
    }

    setStatus("Testing...");

    try {
      const result = await api().health();
      setStatus(result.ok ? "API connected • DB " + result.database : "API returned an unhealthy state");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection failed");
    }
  }

  async function verifyToken() {
    if (!settings.cloudApiUrl.trim() || !token.trim()) {
      setIdentity("API URL and token are required.");
      return;
    }

    setIdentity("Verifying...");

    try {
      const result = await api().me();
      setIdentity("Connected as " + result.user.name + " • " + result.user.email);
    } catch (error) {
      setIdentity(error instanceof Error ? error.message : "Token verification failed");
    }
  }

  async function refreshProjects() {
    if (!settings.cloudApiUrl.trim() || !token.trim()) {
      setSyncStatus("API URL and token are required.");
      return;
    }

    setSyncStatus("Loading cloud projects...");

    try {
      const result = await api().listProjects();
      setCloudProjects(result.projects);
      setSyncStatus(result.projects.length + " cloud project" + (result.projects.length === 1 ? "" : "s") + " found.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Could not load cloud projects");
    }
  }

  async function syncCurrentProject() {
    if (!settings.cloudApiUrl.trim() || !token.trim()) {
      setSyncStatus("Connect the server first.");
      return;
    }

    setSyncStatus("Queueing current project...");

    try {
      await queueProjectSnapshot(project);
      await onFlushQueue();
      setSyncStatus("Conflict-safe cloud sync requested.");
      await refreshProjects();
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Cloud sync failed");
    }
  }

  async function refreshCloudRevisions() {
    if (!settings.cloudApiUrl.trim() || !token.trim()) {
      setRevisionStatus("Connect the server first.");
      return;
    }

    setRevisionStatus("Loading cloud revisions...");

    try {
      const result = await api().revisions(project.id);
      setCloudRevisions(result.revisions);
      setRevisionStatus(
        result.revisions.length +
          " cloud revision" +
          (result.revisions.length === 1 ? "" : "s") +
          " loaded."
      );
    } catch (error) {
      setRevisionStatus(error instanceof Error ? error.message : "Could not load cloud revisions.");
    }
  }

  async function restoreCloudRevision(revisionNumber: number) {
    if (!settings.cloudApiUrl.trim() || !token.trim()) return;

    if (!window.confirm(
      "Restore cloud revision " +
        revisionNumber +
        " as a new current revision? The existing latest revision will stay in history."
    )) {
      return;
    }

    setRevisionStatus("Restoring cloud revision " + revisionNumber + "...");

    try {
      const [oldRevision, current] = await Promise.all([
        api().getRevision(project.id, revisionNumber),
        api().getProject(project.id)
      ]);

      const currentRevision = Number(current.project.current_revision) || 0;
      const restored: ZaxisProject = {
        ...oldRevision.snapshot,
        updatedAt: new Date().toISOString()
      };

      await removePendingSnapshot(project.id);
      await setSyncRevision(
        project.id,
        currentRevision,
        current.snapshot ?? project
      );
      onReplaceProject(restored, true);
      await queueProjectSnapshot(restored);
      await onFlushQueue();
      await refreshCloudRevisions();

      setRevisionStatus(
        "Revision " +
          revisionNumber +
          " restored and saved as a new cloud revision."
      );
    } catch (error) {
      setRevisionStatus(error instanceof Error ? error.message : "Cloud revision restore failed.");
    }
  }

  async function inspectConflict() {
    if (!settings.cloudApiUrl.trim() || !token.trim()) return;

    try {
      const pending = await getPendingSnapshot(project.id);
      const remote = await api().getProject(project.id);

      if (!pending) {
        setConflictInfo(null);
        setSyncStatus("No pending local conflict snapshot exists.");
        return;
      }

      setConflictInfo({
        remoteRevision: Number(remote.project.current_revision) || 0,
        remote: remote.snapshot,
        local: pending.snapshot,
        queuedAt: pending.queuedAt
      });
      setSyncStatus("Conflict details loaded. Choose which version to keep.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Could not inspect conflict.");
    }
  }

  async function useCloudVersion() {
    if (!conflictInfo?.remote) {
      setSyncStatus("Cloud snapshot is not available.");
      return;
    }

    if (!window.confirm("Replace the local project with the cloud version? A local safety revision will be created first.")) {
      return;
    }

    onReplaceProject(conflictInfo.remote);
    await removePendingSnapshot(project.id);
    await setSyncRevision(project.id, conflictInfo.remoteRevision, conflictInfo.remote);
    setConflictInfo(null);
    setSyncStatus("Cloud version restored locally.");
  }

  async function keepLocalVersion() {
    if (!conflictInfo) return;

    if (!window.confirm("Explicitly replace the newer cloud project with your queued local version?")) {
      return;
    }

    try {
      const pushed = await api().pushSnapshot(
        conflictInfo.local,
        conflictInfo.remoteRevision,
        makeClientEventId(),
        "Conflict resolved: keep local"
      );

      await setSyncRevision(project.id, pushed.revision, conflictInfo.local);
      await removePendingSnapshot(project.id);
      setConflictInfo(null);
      setSyncStatus("Local version saved to cloud at revision " + pushed.revision + ".");
      await refreshProjects();
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Conflict resolution failed.");
    }
  }

  return (
    <section className="content">
      <div className="panel">
        <span className="eyebrow">CLOUD & SERVER</span>
        <h2>Connection</h2>
        <div className="settings-grid">
          <label>API URL
            <input
              value={settings.cloudApiUrl}
              onChange={(event) => onSettingsChange({ ...settings, cloudApiUrl: event.target.value })}
              placeholder="https://kdp.example.com"
            />
          </label>
          <label>Share Domain
            <input
              value={settings.shareDomain}
              onChange={(event) => onSettingsChange({ ...settings, shareDomain: event.target.value })}
              placeholder="https://files.example.com"
            />
          </label>
          <label>Connection Code
            <input
              value={connectionCode}
              onChange={(event) => setConnectionCode(event.target.value.toUpperCase())}
              placeholder="ABCD-EF12-3456"
            />
          </label>
          <label>Desktop API Token
            <input
              type="password"
              value={token}
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="Advanced/manual token"
            />
          </label>
        </div>
        <p className="muted">Recommended setup: enter the API URL and the one-time code shown by the cPanel installer, then click Connect with Code. The exchanged API token is never saved in localStorage and is encrypted for the current Windows account.</p>
        {generatedCode && <p className="connection-code-output">{generatedCode}</p>}
        {credentialStatus && <p className="muted">{credentialStatus}</p>}
        <div className="hero-actions">
          <button className="primary" onClick={() => void connectWithCode()}>Connect with Code</button>
          <button className="secondary" onClick={() => void testHealth()}>Test API</button>
          <button className="secondary" onClick={() => void verifyToken()}>Verify Token</button>
          <button className="secondary" onClick={() => void generateConnectionCode()}>New Connection Code</button>
          <button className="secondary" onClick={() => void saveTokenSecurely()}>Save Manual Token</button>
          <button className="secondary danger" onClick={() => void clearStoredToken()}>Clear Stored Token</button>
          <button className="secondary" onClick={() => void onFlushQueue()}>Flush Autosave Queue</button>
          <button className="primary" onClick={() => void syncCurrentProject()}>Sync Current Project</button>
        </div>
        <div className="cloud-status-grid">
          <div><small>Health</small><strong>{status}</strong></div>
          <div><small>Identity</small><strong>{identity || "Not verified"}</strong></div>
          <div><small>Manual Sync</small><strong>{syncStatus || "Not synced"}</strong></div>
          <div>
            <small>Automatic Autosave</small>
            <strong>{cloudSaveLabel(automaticState, pendingCount)}</strong>
          </div>
        </div>
        {(automaticState === "conflict" || conflictInfo) && (
          <div className="conflict-panel">
            <div>
              <strong>Cloud Sync Conflict</strong>
              <small>Another device/session changed this project after your local copy was based on an older revision.</small>
            </div>
            {conflictInfo && (
              <div className="conflict-summary">
                <span>Cloud revision {conflictInfo.remoteRevision}</span>
                <span>Local queued {new Date(conflictInfo.queuedAt).toLocaleString()}</span>
                <span>Local artboards {conflictInfo.local.artboards.length}</span>
                <span>Cloud artboards {conflictInfo.remote?.artboards.length ?? 0}</span>
              </div>
            )}
            <div className="hero-actions">
              <button className="secondary" onClick={() => void inspectConflict()}>Review Conflict</button>
              <button className="secondary" disabled={!conflictInfo?.remote} onClick={() => void useCloudVersion()}>Use Cloud</button>
              <button className="primary" disabled={!conflictInfo} onClick={() => void keepLocalVersion()}>Keep Local</button>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CLOUD PROJECTS</span>
            <h3>Server Library</h3>
          </div>
          <button className="secondary" onClick={() => void refreshProjects()}>Refresh</button>
        </div>
        <div className="project-list">
          {cloudProjects.length === 0 ? (
            <div className="empty-projects">No cloud projects loaded yet.</div>
          ) : cloudProjects.map((item) => (
            <div className="project-row" key={item.id}>
              <div className="project-main">
                <strong>{item.name}</strong>
                <small>{item.mode} • revision {item.current_revision}</small>
              </div>
              <span className="cloud-project-date">{new Date(item.updated_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CLOUD RECOVERY</span>
            <h3>Revision History</h3>
          </div>
          <button className="secondary" onClick={() => void refreshCloudRevisions()}>Load Revisions</button>
        </div>

        {revisionStatus && <p className="muted">{revisionStatus}</p>}

        <div className="revision-cloud-list">
          {cloudRevisions.length === 0 ? (
            <div className="empty-projects">No cloud revisions loaded for the active project.</div>
          ) : cloudRevisions.slice(0, 25).map((revision) => (
            <div className="revision-cloud-row" key={String(revision.revision_number)}>
              <div>
                <strong>Revision {revision.revision_number}</strong>
                <small>{revision.label || "Automatic cloud autosave"}</small>
              </div>
              <div>
                <small>{new Date(revision.created_at).toLocaleString()}</small>
                <small>{revision.snapshot_hash.slice(0, 12)}…</small>
              </div>
              <button
                className="secondary"
                onClick={() => void restoreCloudRevision(Number(revision.revision_number))}
              >
                Restore as New
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;
}

function Placeholder({ title, copy }: { title: string; copy: string }) {
  return <section className="content"><div className="panel placeholder"><h2>{title}</h2><p>{copy}</p></div></section>;
}

function Property({ label, value }: { label: string; value: string }) {
  return <div className="property"><small>{label}</small><strong>{value}</strong></div>;
}
