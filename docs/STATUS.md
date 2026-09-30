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

## In Progress
- [ ] Phase 1 desktop workspace scaffold.
- [ ] Shared project/editor document model.
- [ ] Editor shell and multi-artboard canvas.
- [ ] Core Undo/Redo command architecture.
- [ ] Autosave state machine hooks.
- [ ] Font-provider abstraction.
- [ ] Clipboard/image ingestion architecture.

## Pending — Phase 1
- [ ] Dashboard/project screens.
- [ ] Full artboard management.
- [ ] Layers.
- [ ] Text.
- [ ] Shapes/vector paths.
- [ ] Images/crop/mask.
- [ ] Alignment/guides/grid.
- [ ] Transform controls.
- [ ] System/custom fonts.
- [ ] Bulk artboard resize.
- [ ] Core general-design presets.
- [ ] First Windows test build.

## Pending — Later Phases
See MASTER_PLAN.md for Phase 2-4 tasks.

## Blocked
None currently.

## Rule
Every implemented feature must move from Pending → In Progress → Done here. Significant architecture decisions must also be recorded in docs/ARCHITECTURE.md or docs/DECISIONS.md.
