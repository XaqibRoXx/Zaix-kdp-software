import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SnapshotHistory,
  alignObject,
  addArtboard,
  addImageObject,
  addPathObject,
  addShapeObject,
  addTextObject,
  createBlankProject,
  deleteArtboard,
  deleteObject,
  distributeObjects,
  duplicateArtboard,
  fitObjectInsideArtboard,
  moveArtboard,
  moveObjectLayer,
  resizeAllArtboards,
  resizeArtboard,
  setObjectLocked,
  setObjectVisible,
  updateObject,
  type DesignObject,
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
  deleteProjectFromLibrary,
  listProjectSummaries,
  loadActiveProject,
  loadProject,
  renameProjectInLibrary,
  saveProject,
  type ProjectSummary
} from "../state/projectLibrary";

type Screen = "dashboard" | "editor" | "assets" | "cloud" | "settings";

interface NativeCacheStatus {
  path: string;
  size_bytes: number;
  file_count: number;
}

const navigation: Array<{ id: Screen; label: string }> = [
  { id: "dashboard", label: "Projects" },
  { id: "editor", label: "Editor" },
  { id: "assets", label: "Assets" },
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
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const historyRef = useRef(new SnapshotHistory(project));

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
  }, [project]);

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
            <small>ZAXIS KDP / PHASE 1</small>
            <h1>{screen === "editor" ? project.name : titleFor(screen)}</h1>
          </div>
          <div className="top-actions">
            <span className={"save-state " + saveState}>{saveLabel(saveState)}</span>
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
          <Placeholder title="Asset Library" copy="Cloud assets, linked files, font library, proxies and background-removal tools will live here." />
        )}
        {screen === "cloud" && (
          <Placeholder title="Cloud & Server" copy="The configurable cPanel/VPS connection wizard, health checks, storage, share domain and worker settings will live here." />
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
    </div>
  );
}

function saveLabel(state: SaveState) {
  if (state === "saving") return "Saving...";
  if (state === "offline") return "Offline — queued";
  if (state === "error") return "Recovery save failed";
  return "Saved locally";
}

function titleFor(screen: Screen) {
  if (screen === "dashboard") return "Projects";
  if (screen === "assets") return "Asset Library";
  if (screen === "cloud") return "Cloud & Server";
  if (screen === "settings") return "Settings";
  return "Zaxis KDP";
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
        <Metric label="Phase" value="1 / 4" />
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
            <h3>Phase 1 Editor Core</h3>
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
    onCommit(resizeAllArtboards(project, {
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
            <span>{index + 1}</span>
            <div style={{ aspectRatio: String(item.width) + " / " + String(item.height) }} />
            <small>{item.width} × {item.height} {item.unit}</small>
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
            <div className="safe-area" />
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
            <button className="secondary full" onClick={bulkResize}>Bulk Resize</button>
          </>
        )}
      </aside>
    </section>
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
    transform: "rotate(" + object.rotation + "deg)"
  };

  const handle = selected && !object.locked ? (
    <button className="resize-handle" aria-label="Resize object" onPointerDown={beginResize} />
  ) : null;

  if (object.type === "path") {
    const pathData = object.points
      .map((point, index) => (index === 0 ? "M " : "L ") + point.x + " " + point.y)
      .join(" ") + (object.closed ? " Z" : "");

    function beginPointDrag(event: React.PointerEvent<HTMLButtonElement>, pointId: string) {
      if (!directEdit || object.locked || object.type !== "path") return;

      event.preventDefault();
      event.stopPropagation();
      onSelect();

      const frameElement = event.currentTarget.closest(".design-object");
      if (!(frameElement instanceof HTMLElement)) return;

      const rect = frameElement.getBoundingClientRect();
      const originalPoints = object.points.map((point) => ({ ...point }));
      const pointIndex = originalPoints.findIndex((point) => point.id === pointId);
      if (pointIndex < 0) return;

      function finish(pointerEvent: PointerEvent) {
        const x = Math.max(0, Math.min(100, ((pointerEvent.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((pointerEvent.clientY - rect.top) / rect.height) * 100));
        const points = originalPoints.map((point, index) => index === pointIndex ? { ...point, x, y } : point);
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
          <path
            d={pathData}
            fill={object.closed ? object.fill : "none"}
            stroke={object.stroke}
            strokeWidth={object.strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {selected && directEdit && object.points.map((point) => (
          <button
            key={point.id}
            className="path-node"
            style={{ left: point.x + "%", top: point.y + "%" }}
            onPointerDown={(event) => beginPointDrag(event, point.id)}
            title="Drag anchor point"
          />
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
            borderRadius: object.borderRadius + "px"
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
          <label className="inspector-field">Mask Radius
            <input type="number" min="0" value={object.borderRadius} onChange={(event) => onChange({ borderRadius: Number(event.target.value) })} />
          </label>
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

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;
}

function Placeholder({ title, copy }: { title: string; copy: string }) {
  return <section className="content"><div className="panel placeholder"><h2>{title}</h2><p>{copy}</p></div></section>;
}

function Property({ label, value }: { label: string; value: string }) {
  return <div className="property"><small>{label}</small><strong>{value}</strong></div>;
}
