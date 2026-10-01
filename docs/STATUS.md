# Zaxis KDP — Live Development Status

Last updated: 2026-10-01

## Overall
- Phase 1: **BASELINE COMPLETE**
- Phase 2: **100% COMPLETE**
- Phase 3: **100% COMPLETE**
- Phase 4: **IN PROGRESS**

Detailed Phase 2 exit checklist: `docs/PHASE2_EXIT.md`

## Current Build Gates
- [x] Desktop TypeScript/Vite build: **SUCCESS**
- [x] Desktop dependency security audit (high severity): **SUCCESS**
- [x] Latest install audit: **0 known npm vulnerabilities**
- [x] PHP server syntax/CI: **SUCCESS**
- [x] Latest Windows Tauri release/bundle: **SUCCESS**
- [x] Phase 3 Python image-worker syntax gate: **SUCCESS**
- [x] Phase 3 Windows artifact `zaxis-kdp-windows`: **VERIFIED**
- [x] Earlier Windows installer artifact generation was already proven successfully in Phase 1.

Phase 2 exit gates are all green. Latest Windows artifact `zaxis-kdp-windows` was generated successfully and verified.

## Phase 1 — Baseline Complete
- [x] Windows Tauri + React/TypeScript application shell.
- [x] Multi-project local library and crash recovery.
- [x] Multi-artboard editor.
- [x] Text, shapes, images, paths and layers.
- [x] Drag/resize/rotate/skew/flip/opacity.
- [x] Pen/Direct Select, cubic Bezier anchors and handles.
- [x] Undo/Redo.
- [x] Clipboard image paste.
- [x] Image crop/fit/masks.
- [x] Windows system fonts + persistent imported fonts.
- [x] Grids, snap, alignment, distribution and smart-center guides.
- [x] Native bounded Windows cache manager.
- [x] Local named revisions and restore points.
- [x] KDP and graphic-design project presets.
- [x] Successful Windows build artifact foundation.

### Phase 1 Future Polish — Non-blocking
These are editor-depth improvements, not Phase 2 blockers:
- asymmetric Bezier-handle power controls;
- richer typography engine;
- advanced on-canvas polygon-mask editing;
- more advanced multi-object smart guides;
- cloud font library/sync.

## Phase 2 — 100% Complete

### Cloud & Server
- [x] cPanel/PHP 8.2/MySQL backend.
- [x] One-time cPanel installer.
- [x] Server `.env` configuration loader.
- [x] API URL / share-domain / storage profile / worker settings.
- [x] One-time desktop connection-code pairing.
- [x] Windows user-bound encrypted token storage.
- [x] Health, identity and production diagnostics.
- [x] DB/storage/free-space/GD/upload-limit diagnostics.
- [x] Optional worker health check.
- [x] Cloud project CRUD foundation.
- [x] Continuous cloud autosave.
- [x] Incremental delta sync with full snapshot fallback.
- [x] Offline queue + reconnect flush.
- [x] Base revision tracking.
- [x] Project edit locks.
- [x] Conflict review + explicit Use Cloud / Keep Local.
- [x] Cloud revision history.
- [x] Cloud revision preview/compare.
- [x] Restore old cloud revision as a new current revision.
- [x] Local safety revision before cloud replacement.
- [x] Asset upload/list/content/delete.
- [x] SHA-256 asset dedupe.
- [x] Automatic image proxy generation when PHP GD is available.
- [x] Desktop Cloud Asset Library.
- [x] Book structure, Master Pages and reusable styles participate in delta sync.

### KDP Production
- [x] Book interior workflow.
- [x] Paperback mode.
- [x] Hardcover interior mode.
- [x] Paperback and current hardcover trim presets.
- [x] Bleed / trim / safe-area overlays.
- [x] Gutter-aware odd/even safe areas.
- [x] Master Pages.
- [x] Automatic page numbering.
- [x] Arabic + Roman page-number formats.
- [x] Odd/even outside page-number placement.
- [x] Chapter manager.
- [x] Editable generated TOC artboard.
- [x] Character styles.
- [x] Paragraph styles.
- [x] Object styles.
- [x] Paperback spine calculator.
- [x] Paperback cover creator.
- [x] Back / spine / front cover guides.
- [x] Cover bleed and safe-area guides.
- [x] Barcode reservation guide + overlap preflight.
- [x] Spine-text eligibility validation.
- [x] Official KDP cover-template overlay import.
- [x] Template opacity/show/hide/remove.
- [x] Hardcover template-driven cover workflow.
- [x] Whole-book content-aware size conversion.
- [x] Live KDP preflight.
- [x] Page-count, trim-size and page-size validation.
- [x] Minimum text-size check.
- [x] Missing-image and blank-page checks.
- [x] Cover-size validation.
- [x] Ready/errors state with click-through to affected pages.

### PDF Production
- [x] Real PDF generation.
- [x] Interior-only / cover-only / combined export.
- [x] Selected page-range export.
- [x] Batch separate Interior + Cover ZIP.
- [x] Laptop / Cloud / Both destinations.
- [x] Native Windows save dialog with arbitrary drive/folder selection.
- [x] Metadata title/author/creator.
- [x] RGB output.
- [x] Grayscale output.
- [x] Crop marks.
- [x] Maximum/no-downsample quality.
- [x] High 300-DPI smart downsampling.
- [x] Standard 200-DPI smart downsampling.
- [x] Small 144-DPI compression.
- [x] Custom DPI + JPEG quality.
- [x] Lossless optimize with honest before/after byte comparison.
- [x] Standalone lossy PDF recompression.
- [x] Imported custom-font embedding/subsetting.
- [x] Unicode text preservation with embeddable imported fonts.
- [x] Cubic Bezier vector export.
- [x] Image contain/cover/fill/crop/scale/mask rendering.
- [x] PDF Merge.
- [x] PDF Split to ZIP.
- [x] Extract pages/ranges.
- [x] Reorder pages.
- [x] Remove pages.
- [x] Rotate pages.
- [x] Crop pages.
- [x] Structural compare.
- [x] Rendered visual pixel-diff compare.
- [x] PDF.js upgraded to patched 6.3.289.
- [x] CI blocks high-severity npm dependency regressions.

### Optional / Non-blocking PDF Extensions
The master plan marks these optional or “where supported”, so they are not Phase 2 exit blockers:
- OCR/text extraction for scanned PDFs.
- PDF/X conformance presets.
- Full ICC/CMYK conversion engine.
- External heavy PDF worker (local desktop processing works without it).

## Phase 3 — 100% Complete

### Image AI & Processing
- [x] Optional Python image worker package.
- [x] Worker syntax/CI gate.
- [x] One-click background removal.
- [x] Fast / Quality / Hair-Fur modes.
- [x] BiRefNet-general default model with selectable alternatives.
- [x] Edge decontamination.
- [x] ViTMatte soft-edge / hair-fur refinement.
- [x] Transparent PNG output while preserving the original.
- [x] Manual Restore / Erase / Soft Refine brush editor.
- [x] Replace background with Transparent / Solid Color / Blur / Custom Image.
- [x] Batch background removal workflow.
- [x] Background mask endpoint foundation.
- [x] Optional 2x / 4x upscale + cleanup worker pipeline.
- [x] Secure PHP server-to-worker bridge; Windows never receives the worker secret.
- [x] Worker URL override + worker health diagnostics.

### Asset Library
- [x] Cloud asset library.
- [x] Original preservation.
- [x] Lightweight editor proxies.
- [x] Stable cloud asset IDs + version tracking.
- [x] Linked image metadata: asset ID / version / SHA-256.
- [x] Replace cloud binary while keeping the same asset ID.
- [x] Proxy regeneration after replacement.
- [x] Missing linked asset detection.
- [x] Update Available detection.
- [x] Refresh All Linked Updates.
- [x] Batch Relink references.
- [x] SHA-256 duplicate detection/dedupe.
- [x] Processed asset → original source relationship.
- [x] Optional upscale result saved as a new cloud asset.

### Cloud Files & Sharing
- [x] Persistent public PDF/image share links.
- [x] Stable random public slug.
- [x] No-login browser preview.
- [x] Password protection.
- [x] Expiry.
- [x] Download on/off.
- [x] Revoke.
- [x] Replace File, Keep Same Link.
- [x] View/download analytics.
- [x] Privacy-preserving HMAC visitor hashing.
- [x] Proof mode + public comments.
- [x] Desktop Share Manager.
- [x] Cloud/Both PDF export can automatically create a persistent public link.
- [x] Public Sharing and Proof Comments Admin feature toggles are enforced server-side.
- [x] Share defaults are configuration-driven.

### Collaboration / Roles
- [x] Owner / Admin / Editor / Reviewer roles.
- [x] Reviewer role is server-enforced read-only.
- [x] Owner/Admin-only administration APIs.
- [x] Admin user creation + one-time desktop connection code.
- [x] Role and quota management.

### Admin / Server
- [x] Production Admin screen in Windows app.
- [x] Per-user storage quotas.
- [x] Server-side quota enforcement.
- [x] Global feature toggles.
- [x] Global defaults with per-project overrides.
- [x] Configurable project/export naming rules.
- [x] Server/storage/worker diagnostics.
- [x] Storage usage/free-space/quota visibility.
- [x] Worker health/status.
- [x] Repair tools.
- [x] Scheduled backups.
- [x] Manual backup.
- [x] Backup retention.
- [x] Optional asset-binary backup.
- [x] Secondary backup provider selector + path copy.
- [x] cPanel cron backup runner.
- [x] Activity logs.
- [x] Recycle Bin restore / permanent purge.
- [x] Export queue with queued/running/completed/failed tracking.
- [x] User Notifications screen + Admin notification creation.
- [x] Effective server/project policy endpoint.

### Phase 3 Exit Gates
- [x] Desktop TypeScript/Vite: **SUCCESS** on current head `68ce2be1d8d9c207751f1e0b297993f322541a0d`.
- [x] Python Worker Check: **SUCCESS** on current head `68ce2be1d8d9c207751f1e0b297993f322541a0d`.
- [x] Latest server source commit `cfd5c636a6214e3c671df503e6fde94b2748a975`: **Server Check SUCCESS**.
- [x] Latest Windows feature bundle commit `c1ea1a7f013620b95ffcb8d4868562df206e38bf`: **Windows Build SUCCESS**.
- [x] Windows artifact `zaxis-kdp-windows` verified, 7,121,876 bytes, SHA-256 `8880964c3d880ac63920547ce5c25ad2c352ea2a8b2ffb6927dad6ffa7c01ddd`.
- [x] Current head only adds the Worker CI workflow on top of the verified Windows feature source.

Phase 3 exit condition is satisfied: cloud collaboration, high-quality image utilities and production-ready administration are functional.

## Phase 4 — IN PROGRESS
- [x] Dedicated Phase 4 release/QA workflow foundation.
- [x] Portable build configuration with app-local data directory.
- [x] Automated cPanel/server ZIP packaging.
- [x] Automated optional worker ZIP packaging.
- [x] Windows release-candidate SHA-256 manifest generation.
- [ ] First Phase 4 release workflow run verified green.
- [ ] Large-book/performance stress QA.
- [ ] Installer/portable release polish and clean-machine validation.
- [ ] Signed auto-update channel and in-app updater UX.
- [ ] Backup/restore release validation.
- [ ] Final documentation and release QA.

Detailed Phase 4 checklist: `docs/PHASE4_RELEASE_QA.md`.

## Blocked
No product-feature blocker.

Phase 2 has no remaining exit blocker.

## Rule
Every implemented feature must be reflected here. Major architecture decisions must also be recorded in `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, or the phase exit document.
