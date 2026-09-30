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
- [ ] Real multi-artboard create/delete/duplicate/reorder behavior.
- [ ] Editable artboard size/unit controls.
- [ ] Undo/Redo wiring to real editor actions.
- [ ] Autosave state machine and recovery queue.
- [ ] Layers/object model.
- [ ] Font-provider abstraction.
- [ ] Clipboard/image ingestion architecture.
- [ ] Project persistence layer.
- [ ] First runnable Windows development build verification.

## Pending — Phase 1
- [ ] Dashboard project CRUD and recent projects.
- [ ] Full selection/direct-selection system.
- [ ] Text engine and text controls.
- [ ] Shapes/vector paths and bezier editor.
- [ ] Images/crop/masks/fit/fill.
- [ ] Alignment/distribution/guides/grid/snap.
- [ ] Transform controls.
- [ ] System/custom/cloud fonts.
- [ ] Bulk artboard resize.
- [ ] Graphic-design presets.
- [ ] KDP/book presets in project creation.
- [ ] Keyboard shortcuts.
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
None currently.

## Rule
Every implemented feature must move from Pending → In Progress → Done here. Significant architecture decisions must also be recorded in docs/ARCHITECTURE.md or docs/DECISIONS.md.
