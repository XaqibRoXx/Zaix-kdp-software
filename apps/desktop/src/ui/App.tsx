import { useEffect, useMemo, useRef, useState } from "react";
import {
  SnapshotHistory,
  addArtboard,
  createBlankProject,
  deleteArtboard,
  duplicateArtboard,
  moveArtboard,
  resizeAllArtboards,
  resizeArtboard,
  type ZaxisProject
} from "@zaxis-kdp/editor-core";
import type { SaveState, Unit } from "@zaxis-kdp/shared";

type Screen = "dashboard" | "editor" | "assets" | "cloud" | "settings";

const navigation: Array<{ id: Screen; label: string }> = [
  { id: "dashboard", label: "Projects" },
  { id: "editor", label: "Editor" },
  { id: "assets", label: "Assets" },
  { id: "cloud", label: "Cloud & Server" },
  { id: "settings", label: "Settings" }
];

const STORAGE_KEY = "zaxis-kdp:current-project";
const units: Unit[] = ["px", "in", "cm", "mm", "pt", "pc"];

function initialProject(): ZaxisProject {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as ZaxisProject;
  } catch {
    // Recovery storage should never block app startup.
  }

  return createBlankProject({
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
  const historyRef = useRef(new SnapshotHistory(project));

  useEffect(() => {
    setSaveState("saving");

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    if (!project.artboards.some((item) => item.id === selectedArtboardId)) {
      setSelectedArtboardId(project.artboards[0]?.id ?? "");
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
      const isModifier = event.ctrlKey || event.metaKey;
      if (!isModifier) return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTyping) return;

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function createNewProject() {
    const next = createBlankProject({
      name: "Untitled Design",
      width: 7,
      height: 10,
      unit: "in"
    });
    historyRef.current.reset(next);
    setProject(next);
    setSelectedArtboardId(next.artboards[0].id);
    setScreen("editor");
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
            <button className="secondary">Import</button>
            <button className="primary" onClick={createNewProject}>New Project</button>
          </div>
        </header>

        {screen === "dashboard" && <Dashboard project={project} onOpen={() => setScreen("editor")} />}
        {screen === "editor" && (
          <EditorShell
            project={project}
            selectedArtboardId={selectedArtboardId}
            onSelectArtboard={setSelectedArtboardId}
            onCommit={commit}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyRef.current.canUndo}
            canRedo={historyRef.current.canRedo}
          />
        )}
        {screen === "assets" && (
          <Placeholder
            title="Asset Library"
            copy="Cloud assets, linked files, font library, proxies and background-removal tools will live here."
          />
        )}
        {screen === "cloud" && (
          <Placeholder
            title="Cloud & Server"
            copy="The configurable cPanel/VPS connection wizard, health checks, storage, share domain and worker settings will live here."
          />
        )}
        {screen === "settings" && (
          <Placeholder
            title="Settings"
            copy="Global defaults, cache, units, presets, shortcuts, theme and all configurable non-hardcoded behaviors will live here."
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

function Dashboard({ project, onOpen }: { project: ZaxisProject; onOpen: () => void }) {
  return (
    <section className="content">
      <div className="metric-grid">
        <Metric label="Active Project" value={project.name} />
        <Metric label="Artboards" value={String(project.artboards.length)} />
        <Metric label="Local Recovery" value="Active" />
        <Metric label="Phase" value="1 / 4" />
      </div>

      <div className="panel hero-panel">
        <div>
          <span className="eyebrow">START DESIGNING</span>
          <h2>Book layouts and full graphic design in one cloud-first Windows workspace.</h2>
          <p>Use KDP presets or create any custom artboard in px, in, cm, mm, pt or pica.</p>
        </div>
        <button className="primary" onClick={onOpen}>Open Editor</button>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DEVELOPMENT</span>
            <h3>Phase 1 Editor Core</h3>
          </div>
          <span className="pill">In Progress</span>
        </div>
        <div className="progress"><span style={{ width: "32%" }} /></div>
        <p className="muted">Multi-artboard controls, real Undo/Redo and local recovery autosave are now wired into the editor.</p>
      </div>
    </section>
  );
}

interface EditorShellProps {
  project: ZaxisProject;
  selectedArtboardId: string;
  onSelectArtboard: (id: string) => void;
  onCommit: (project: ZaxisProject) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function EditorShell({
  project,
  selectedArtboardId,
  onSelectArtboard,
  onCommit,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: EditorShellProps) {
  const artboard = useMemo(
    () => project.artboards.find((item) => item.id === selectedArtboardId) ?? project.artboards[0],
    [project, selectedArtboardId]
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
    onCommit(
      resizeAllArtboards(project, {
        width: artboard.width,
        height: artboard.height,
        unit: artboard.unit
      })
    );
  }

  return (
    <section className="editor-layout">
      <aside className="tools">
        {["Select", "Direct", "Text", "Shape", "Pen", "Image", "Hand", "Zoom"].map((tool) => (
          <button key={tool} title={tool}>{tool.slice(0, 1)}</button>
        ))}
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

          <label>
            W
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={artboard.width}
              onChange={(event) => updateDimension("width", event.target.value)}
            />
          </label>

          <label>
            H
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={artboard.height}
              onChange={(event) => updateDimension("height", event.target.value)}
            />
          </label>

          <select value={artboard.unit} onChange={(event) => updateUnit(event.target.value as Unit)}>
            {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>

          <button onClick={bulkResize}>Apply Size to All</button>
        </div>

        <div className="canvas-stage">
          <div
            className="artboard"
            style={{
              aspectRatio: String(artboard.width) + " / " + String(artboard.height),
              background: artboard.background
            }}
          >
            <div className="safe-area">
              <span>{artboard.name}</span>
              <strong>{artboard.width} × {artboard.height} {artboard.unit}</strong>
              <small>{project.mode === "kdp" ? "KDP / Print mode" : "Graphic Design mode"}</small>
            </div>
          </div>
        </div>

        <div className="bottom-status">
          <span>100%</span>
          <span>{project.artboards.length} artboard{project.artboards.length === 1 ? "" : "s"}</span>
          <span>Undo {canUndo ? "ready" : "empty"}</span>
          <span>Redo {canRedo ? "ready" : "empty"}</span>
          <span>Local autosave active</span>
        </div>
      </div>

      <aside className="properties">
        <div className="panel-title">Properties</div>
        <Property label="Document Mode" value={project.mode === "kdp" ? "KDP / Print" : "Graphic Design"} />
        <Property label="Artboard" value={String(artboard.width) + " × " + String(artboard.height) + " " + artboard.unit} />
        <Property label="Bleed" value={String(artboard.bleed) + " " + artboard.unit} />
        <Property label="Background" value={artboard.background} />
        <Property label="Local Recovery" value="Enabled" />
        <hr />
        <button className="secondary full" onClick={bulkResize}>Bulk Resize</button>
        <button className="secondary full">Layers</button>
        <button className="secondary full">Export PDF</button>
      </aside>
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
