import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SnapshotHistory,
  addArtboard,
  addImageObject,
  addShapeObject,
  addTextObject,
  createBlankProject,
  deleteArtboard,
  deleteObject,
  duplicateArtboard,
  moveArtboard,
  moveObjectLayer,
  normalizeProject,
  resizeAllArtboards,
  resizeArtboard,
  setObjectLocked,
  setObjectVisible,
  updateObject,
  type DesignObject,
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
    if (stored) return normalizeProject(JSON.parse(stored) as ZaxisProject);
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
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [systemFonts, setSystemFonts] = useState<string[]>(["Arial", "Calibri", "Segoe UI", "Times New Roman"]);
  const historyRef = useRef(new SnapshotHistory(project));

  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then((fonts) => {
        if (fonts.length > 0) setSystemFonts(fonts);
      })
      .catch(() => {
        // Browser development preview uses the built-in fallback list.
      });
  }, []);

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
    setSelectedObjectId(null);
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
          />
        )}
        {screen === "assets" && (
          <Placeholder title="Asset Library" copy="Cloud assets, linked files, font library, proxies and background-removal tools will live here." />
        )}
        {screen === "cloud" && (
          <Placeholder title="Cloud & Server" copy="The configurable cPanel/VPS connection wizard, health checks, storage, share domain and worker settings will live here." />
        )}
        {screen === "settings" && (
          <Placeholder title="Settings" copy="Global defaults, cache, units, presets, shortcuts, theme and all configurable non-hardcoded behaviors will live here." />
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
  const objectCount = project.artboards.reduce((total, artboard) => total + artboard.objects.length, 0);

  return (
    <section className="content">
      <div className="metric-grid">
        <Metric label="Active Project" value={project.name} />
        <Metric label="Artboards" value={String(project.artboards.length)} />
        <Metric label="Objects" value={String(objectCount)} />
        <Metric label="Phase" value="1 / 4" />
      </div>

      <div className="panel hero-panel">
        <div>
          <span className="eyebrow">START DESIGNING</span>
          <h2>Book layouts and full graphic design in one cloud-first Windows workspace.</h2>
          <p>Core layers, text and shape objects are now part of the editor model.</p>
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
        <div className="progress"><span style={{ width: "46%" }} /></div>
        <p className="muted">Artboards, layers, selectable objects, basic text/shapes, Undo/Redo and local recovery autosave are wired.</p>
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
  systemFonts
}: EditorShellProps) {
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
        <button title="Select">S</button>
        <button title="Direct Select">D</button>
        <button title="Text" onClick={createText}>T</button>
        <button title="Rectangle" onClick={() => createShape("rectangle")}>R</button>
        <button title="Ellipse" onClick={() => createShape("ellipse")}>O</button>
        <button title="Pen">P</button>
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
        </div>

        <div className="canvas-stage" onClick={() => onSelectObject(null)}>
          <div
            className="artboard"
            style={{
              aspectRatio: String(artboard.width) + " / " + String(artboard.height),
              background: artboard.background
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="safe-area" />

            {artboard.objects.filter((object) => object.visible).map((object) => (
              <CanvasObject
                key={object.id}
                object={object}
                selected={object.id === selectedObjectId}
                onSelect={() => onSelectObject(object.id)}
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
  onSelect
}: {
  object: DesignObject;
  selected: boolean;
  onSelect: () => void;
}) {
  const commonStyle = {
    left: object.x + "%",
    top: object.y + "%",
    width: object.width + "%",
    height: object.height + "%",
    opacity: object.opacity,
    transform: "rotate(" + object.rotation + "deg)"
  };

  if (object.type === "image") {
    return (
      <div
        className={selected ? "design-object image-object selected" : "design-object image-object"}
        style={commonStyle}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <img src={object.src} alt={object.alt} style={{ objectFit: object.fit }} />
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
          textAlign: object.textAlign
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        {object.text}
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
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    />
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

      {object.type === "image" ? (
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

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;
}

function Placeholder({ title, copy }: { title: string; copy: string }) {
  return <section className="content"><div className="panel placeholder"><h2>{title}</h2><p>{copy}</p></div></section>;
}

function Property({ label, value }: { label: string; value: string }) {
  return <div className="property"><small>{label}</small><strong>{value}</strong></div>;
}
