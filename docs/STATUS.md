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
- [ ] Cloud/full persistence layer. Multi-project local recovery library is now working.
- [ ] First runnable Windows development build verification.

## Newly Completed in Current Implementation
- [x] Configurable project preset registry separated from editor UI.
- [x] KDP project presets for common trim sizes.
- [x] Graphic-design presets for common screen/print formats.
- [x] New project creation can start from a preset and correct document mode.
- [x] Text weight control.
- [x] Text left/center/right alignment.
- [x] Text line-height control.
- [x] Text letter-spacing control.
- [x] Basic image crop-position controls (X/Y).
- [x] Image scale control.
- [x] Rounded mask-radius foundation for images.
- [x] Settings screen for cache limit/location and autosave delay.
- [x] Grid/Snap default preferences.
- [x] Clear local recovery cache action.
- [x] Grid visibility toggle on artboard.
- [x] Snap toggle for object drag and resize.
- [x] 2% canvas snap step foundation.
- [x] Local multi-project recovery library.
- [x] Recent projects dashboard list.
- [x] Create new project without overwriting previous local projects.
- [x] Open local project.
- [x] Rename local project.
- [x] Delete local project recovery copy.
- [x] Separate local recovery record per project plus active-project tracking.
- [x] Canvas drag/move for unlocked objects with live preview.
- [x] Bottom-right resize handle with live preview.
- [x] One Undo/Redo history entry per completed drag/resize gesture.
- [x] Align selected object: left/center/right/top/middle/bottom.
- [x] Fit selected object inside artboard.
- [x] Session-level custom font import for TTF/OTF/WOFF/WOFF2/TTC via FontFace API.
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
- [x] Local dashboard project CRUD and recent projects. Cloud project library remains Phase 2.
- [ ] Full direct-selection/vector-node system. Basic object selection is working.
- [ ] Advanced text engine remains. Font family/size/weight/color, alignment, line height and letter spacing are working.
- [ ] Advanced vector paths/bezier editor. Rectangle and ellipse objects are working.
- [ ] Advanced freeform masks remain. Clipboard paste, contain/cover/fill, crop position, image scale and mask-radius controls are working.
- [ ] Distribution/smart guides remain. Grid visibility and snap-to-grid plus single-object artboard alignment are working.
- [ ] Advanced transforms. Canvas drag/move, resize handle, rotation/opacity inspector controls are working.
- [ ] Persistent custom/cloud font install. Session-level custom font import plus Windows installed-font discovery are working.
- [x] Initial bulk artboard resize (apply active size/unit to all). Advanced content behavior remains Phase 1 work.
- [x] Initial graphic-design presets: A4, A5, Instagram, Story/Reel, YouTube thumbnail and US Letter flyer.
- [x] Initial KDP/book presets: 5×8, 5.25×8, 5.5×8.5, 6×9, 7×10, 8×10, 8.5×11.
- [x] Undo/Redo keyboard shortcuts: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z.
- [ ] Native disk-cache enforcement remains. Settings now expose cache limit/location, autosave delay, grid/snap defaults and clear recovery cache.
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
- No product feature blocker. GitHub Actions build verification is being monitored separately; source work continues.

## Rule
Every implemented feature must move from Pending → In Progress → Done here. Significant architecture decisions must also be recorded in docs/ARCHITECTURE.md or docs/DECISIONS.md.
