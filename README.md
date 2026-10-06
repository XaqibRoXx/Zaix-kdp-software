# Zaxis KDP

Cloud-first Windows design software for KDP books, print/PDF production, and general graphic design.

## Product Direction
Zaxis KDP combines a professional multi-artboard graphics editor with KDP-specific publishing tools, cloud autosave, PDF production, asset management, public sharing, and server-controlled storage.

## Core Principles
- Windows-first desktop application.
- Cloud-first project storage with bounded local cache.
- Canva-style continuous autosave, offline queue, crash recovery, Undo/Redo, and long-term revision history.
- Illustrator-style design workflow: artboards, layers, vector/text/image editing, guides, alignment, transforms, custom units and sizes.
- KDP is a first-class workflow, but the editor must also work for general graphic design.
- Important settings, limits, paths, presets, and behaviors must be configurable rather than hardcoded.
- Server data is accessed through a secure API. FTP/SFTP may be used for setup/backup, but not as the main live editing protocol.

## Four Build Phases
See [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md).

## Live Progress
See [docs/STATUS.md](docs/STATUS.md).

## Architecture
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository Layout
- `apps/desktop` — Windows desktop application.
- `apps/server` — cPanel/VPS backend API and admin.
- `apps/worker` — heavy PDF/image/background processing worker.
- `packages/editor-core` — editor document model and shared editing logic.
- `packages/shared` — shared types/contracts.
- `docs` — plan, feature matrix, architecture, progress and decisions.

> Current status: Phase 1 baseline complete, Phase 2 **100% complete**, Phase 3 **100% complete**, and Phase 4 **Release + QA is in progress**. See `docs/STATUS.md` and `docs/PHASE4_RELEASE_QA.md` for the live verified gates.


## Phase 4 Release Guides
- [Release + QA tracker](docs/PHASE4_RELEASE_QA.md)
- [Final release checklist](docs/PHASE4_RELEASE_CHECKLIST.md)
- [cPanel deployment & recovery](docs/CPANEL_DEPLOYMENT.md)
- [Windows setup & recovery](docs/WINDOWS_SETUP.md)
- [Signed updater release process](docs/UPDATER_RELEASE.md)
