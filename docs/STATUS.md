# Zaxis KDP — Live Development Status

Last updated: 2026-09-30

## Overall
- Phase 1: **IN PROGRESS**
- Phase 2: **PENDING**
- Phase 3: **PENDING**
- Phase 4: **PENDING**

## Done
- [x] Product name locked: Zaxis KDP.
- [x] Four-phase delivery model locked.
- [x] GitHub repository access verified with admin/push permission.
- [x] Canonical master plan added to repository.
- [x] Architecture direction locked: Windows app + secure API + server storage/database + optional worker.
- [x] “No important hardcoding” product rule documented.
- [x] Cloud-first storage and bounded local-cache rule documented.
- [x] Canva-style autosave requirement documented.
- [x] Undo/Redo and long-term revision history separated in architecture.
- [x] General graphic-design use added in addition to KDP.
- [x] Full font-library requirement included.
- [x] Custom artboard units/sizes included.
- [x] Background remover requirement included.
- [x] PDF merge/export/compression/share workflow included.
- [x] Monorepo workspace created.
- [x] Windows desktop app package created.
- [x] Tauri Windows shell created.
- [x] React/Vite UI foundation created.
- [x] Zaxis KDP dashboard/editor shell created.
- [x] Shared package and editor-core package created.
- [x] Initial project/artboard document model created.
- [x] Units contract added: px, in, cm, mm, pt, pica.
- [x] Initial Undo/Redo command-history engine created.
- [x] App sections scaffolded: Projects, Editor, Assets, Cloud & Server, Settings.
- [x] Initial editor layout scaffolded: tools, artboards panel, canvas, properties and status bar.

## In Progress
- [x] Real multi-artboard create/delete/duplicate/reorder behavior.
- [x] Editable artboard size/unit controls.
- [x] Undo/Redo wired to artboard editor actions.
- [ ] Cloud/offline autosave state machine and recovery queue. Local recovery autosave is working.
- [x] Initial layers/object model with visibility, locking and z-order controls.
- [ ] Full font-provider abstraction. Native Windows system-font discovery is now wired; project/cloud/custom font install remains.
- [x] Initial clipboard image ingestion: pasted clipboard images become editable image objects.
- [ ] Full project persistence layer. Current project local recovery persistence is working.
- [ ] First runnable Windows development build verification.

## Newly Completed in Current Implementation
- [x] Native Windows font-folder discovery through Tauri.
- [x] Installed TTF/OTF/TTC font names exposed to the text inspector.
- [x] Text font selector uses system-font results with development fallbacks.
- [x] Ctrl+V clipboard image paste into active artboard.
- [x] Pasted PNG/bitmap becomes an editable image object.
- [x] Pasted images appear in Layers and local recovery state.
- [x] Image contain/cover/fill controls.
- [x] Image alt-text field foundation.
- [x] Basic object selection on canvas and from Layers panel.
- [x] Text object creation and editing.
- [x] Rectangle and ellipse object creation.
- [x] Object X/Y/W/H, rotation and opacity controls.
- [x] Shape fill/stroke/stroke-width controls.
- [x] Layer visibility toggle.
- [x] Layer lock/unlock.
- [x] Layer z-order move up/down.
- [x] Delete selected object with UI or Delete/Backspace.
- [x] Objects persist through local recovery autosave.
- [x] Debounced local recovery autosave with Saving/Saved/Error status.
- [x] Active artboard selection.
- [x] Add, duplicate, delete and move artboards.
- [x] Custom width/height editing.
- [x] Unit switching across px/in/cm/mm/pt/pica.
- [x] Snapshot Undo/Redo engine connected to editor changes.
- [x] Apply active artboard dimensions to all artboards.
- [x] Current project restores from local recovery storage on restart.

## Pending — Phase 1
- [ ] Dashboard project CRUD and recent projects.
- [ ] Full direct-selection/vector-node system. Basic object selection is working.
- [ ] Advanced text engine. Basic editable text objects, font family/size/color are working.
- [ ] Advanced vector paths/bezier editor. Rectangle and ellipse objects are working.
- [ ] Advanced image crop/masks. Clipboard paste plus contain/cover/fill image fit are working.
- [ ] Alignment/distribution/guides/grid/snap.
- [ ] Transform controls.
- [ ] Custom/cloud font upload/install. Windows installed-font discovery is working.
- [x] Initial bulk artboard resize (apply active size/unit to all). Advanced content behavior remains Phase 1 work.
- [ ] Graphic-design presets.
- [ ] KDP/book presets in project creation.
- [x] Undo/Redo keyboard shortcuts: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z.
- [ ] Local bounded cache controls.
- [ ] First Windows installer/test build.

## Pending — Phase 2
- [ ] cPanel/VPS connection wizard and secure API.
- [ ] Canva-style cloud autosave and offline sync.
- [ ] Revisions/version history/restore points.
- [ ] KDP book tools, cover/spine and preflight.
- [ ] PDF export/compression/merge/split/compare.
- [ ] Save destination: Server / Laptop / Both.

## Pending — Phase 3
- [ ] Asset library and proxies.
- [ ] High-quality background remover/refine workflow.
- [ ] Public PDF share links and same-link replacement.
- [ ] Admin/server/storage/backups/diagnostics.

## Pending — Phase 4
- [ ] Performance/large-book QA.
- [ ] Installer/portable build/auto-update.
- [ ] Server ZIP/database/worker delivery.
- [ ] Final documentation and release QA.

## Blocked
- GitHub Actions runner is currently failing before workflow steps start (zero steps reported), so CI has not yet provided a compile verdict. Source implementation continues while this runner-level issue is tracked.

## Rule
Every implemented feature must move from Pending → In Progress → Done here. Significant architecture decisions must also be recorded in docs/ARCHITECTURE.md or docs/DECISIONS.md.
