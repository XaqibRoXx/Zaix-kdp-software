# Zaxis KDP — Live Development Status

Last updated: 2026-10-01

## Overall
- Phase 1: **BASELINE COMPLETE**
- Phase 2: **100% COMPLETE**
- Phase 3: **IN PROGRESS**
- Phase 4: **PENDING**

Detailed Phase 2 exit checklist: `docs/PHASE2_EXIT.md`

## Current Build Gates
- [x] Desktop TypeScript/Vite build: **SUCCESS**
- [x] Desktop dependency security audit (high severity): **SUCCESS**
- [x] Latest install audit: **0 known npm vulnerabilities**
- [x] PHP server syntax/CI: **SUCCESS**
- [x] Latest Windows Tauri release/bundle: **SUCCESS**
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

## Phase 3 — In Progress
- [x] Persistent public share-link database model.
- [x] One stable random public slug per share.
- [x] No-login browser preview page.
- [x] Password-protected public links with time-limited signed access token.
- [x] Link expiry enforcement.
- [x] Download enable/disable enforcement.
- [x] Link revoke support.
- [x] Replace File, Keep Same Link backend.
- [x] Privacy-preserving view/download analytics using HMAC-hashed IP/user-agent values.
- [x] Proof mode public comments.
- [x] Desktop Share Manager in Asset Library.
- [x] Create/copy/open/revoke share links.
- [x] Toggle download and proof mode.
- [x] Set/change/remove share password and expiry.
- [x] View/download/comment counters in desktop UI.
- [x] Select a replacement asset and keep the existing public URL.
- [x] Cloud/Both PDF export can automatically create a persistent public share link.
- [x] Export result reports the new public URL immediately.

## Remaining — Phase 3
- [ ] Advanced linked-asset/proxy lifecycle and duplicate-management UI.
- [ ] High-quality background remover + refine brush/edge cleanup.
- [ ] Public PDF share links.
- [ ] Password/private/expiry/revoke/download controls.
- [ ] Replace File, Keep Same Link.
- [ ] Share analytics.
- [ ] Admin/storage/backups/quota management and deeper diagnostics.

## Pending — Phase 4
- [ ] Large-book/performance stress QA.
- [ ] Installer/portable release polish.
- [ ] Auto-update.
- [ ] Final cPanel server ZIP/database/optional worker delivery.
- [ ] Backup/restore release package.
- [ ] Final documentation and release QA.

## Blocked
No product-feature blocker.

Phase 2 has no remaining exit blocker.

## Rule
Every implemented feature must be reflected here. Major architecture decisions must also be recorded in `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, or the phase exit document.
