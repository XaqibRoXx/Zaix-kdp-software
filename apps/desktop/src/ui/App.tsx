import { useState } from "react";
import { createBlankProject, type ZaxisProject } from "@zaxis-kdp/editor-core";

type Screen = "dashboard" | "editor" | "assets" | "cloud" | "settings";

const navigation: Array<{ id: Screen; label: string }> = [
  { id: "dashboard", label: "Projects" },
  { id: "editor", label: "Editor" },
  { id: "assets", label: "Assets" },
  { id: "cloud", label: "Cloud & Server" },
  { id: "settings", label: "Settings" }
];

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [project] = useState<ZaxisProject>(() =>
    createBlankProject({
      name: "Untitled Design",
      width: 7,
      height: 10,
      unit: "in"
    })
  );

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
            <strong>Cloud architecture ready</strong>
            <small>Server not connected yet</small>
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
            <span className="save-state">Autosave foundation</span>
            <button className="secondary">Import</button>
            <button className="primary">New Project</button>
          </div>
        </header>

        {screen === "dashboard" && <Dashboard />}
        {screen === "editor" && <EditorShell project={project} />}
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

function titleFor(screen: Screen) {
  if (screen === "dashboard") return "Projects";
  if (screen === "assets") return "Asset Library";
  if (screen === "cloud") return "Cloud & Server";
  if (screen === "settings") return "Settings";
  return "Zaxis KDP";
}

function Dashboard() {
  return (
    <section className="content">
      <div className="metric-grid">
        <Metric label="Active Projects" value="0" />
        <Metric label="Cloud Storage" value="Not connected" />
        <Metric label="Pending Sync" value="0" />
        <Metric label="Phase" value="1 / 4" />
      </div>

      <div className="panel hero-panel">
        <div>
          <span className="eyebrow">START DESIGNING</span>
          <h2>Book layouts and full graphic design in one cloud-first Windows workspace.</h2>
          <p>Use KDP presets or create any custom artboard in px, in, cm, mm, pt or pica.</p>
        </div>
        <button className="primary">Create Project</button>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DEVELOPMENT</span>
            <h3>Phase 1 Foundation</h3>
          </div>
          <span className="pill">In Progress</span>
        </div>
        <div className="progress"><span /></div>
        <p className="muted">Repository structure, editor model, app shell and command history foundation are now in source control.</p>
      </div>
    </section>
  );
}

function EditorShell({ project }: { project: ZaxisProject }) {
  const artboard = project.artboards[0];

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
          <button className="artboard-thumb active" key={item.id}>
            <span>{index + 1}</span>
            <div />
            <small>{item.width} × {item.height} {item.unit}</small>
          </button>
        ))}
        <button className="secondary full">+ Add Artboard</button>
      </aside>

      <div className="canvas-area">
        <div className="editor-toolbar">
          <button>Undo</button>
          <button>Redo</button>
          <span className="toolbar-separator" />
          <label>W <input value={artboard.width} readOnly /></label>
          <label>H <input value={artboard.height} readOnly /></label>
          <span>{artboard.unit}</span>
          <button>Bulk Resize</button>
        </div>

        <div className="canvas-stage">
          <div className="artboard" style={{ aspectRatio: String(artboard.width) + " / " + String(artboard.height) }}>
            <div className="safe-area">
              <span>Artboard 1</span>
              <strong>7 × 10 in</strong>
              <small>KDP preset • No bleed</small>
            </div>
          </div>
        </div>

        <div className="bottom-status">
          <span>100%</span>
          <span>1 artboard</span>
          <span>Undo/Redo foundation ready</span>
          <span>Autosave foundation ready</span>
        </div>
      </div>

      <aside className="properties">
        <div className="panel-title">Properties</div>
        <Property label="Document Mode" value="KDP / Print" />
        <Property label="Artboard" value={String(artboard.width) + " × " + String(artboard.height) + " " + artboard.unit} />
        <Property label="Bleed" value="0 in" />
        <Property label="Color" value="RGB" />
        <Property label="Background" value="White" />
        <hr />
        <button className="secondary full">Artboard Settings</button>
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
