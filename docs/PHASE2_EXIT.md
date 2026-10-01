# Zaxis KDP — Phase 2 Exit Checklist

Date: 2026-10-01

Phase 2 objective: complete the Cloud + KDP + PDF production workflow so a project can move from editing to validated print PDF with reliable cloud recovery.

## Cloud & Server
- [x] cPanel/PHP/MySQL one-time installer.
- [x] Editable API URL and share-domain configuration.
- [x] One-time pairing code workflow.
- [x] Windows user-bound encrypted API credential storage.
- [x] Server health and authenticated diagnostics.
- [x] Database connectivity diagnostics.
- [x] Storage path, writable state, free-space and upload-limit diagnostics.
- [x] Storage-provider profile and optional worker URL controls.
- [x] Project create/open/list/delete API foundation.
- [x] Canva-style automatic cloud autosave.
- [x] Incremental delta sync with full-snapshot fallback.
- [x] Offline queue and reconnect flush.
- [x] Stable client identity and expiring project edit locks.
- [x] Conflict detection and explicit Use Cloud / Keep Local resolution.
- [x] Cloud revision history.
- [x] Cloud revision preview/compare.
- [x] Restore old revision as a new current revision.
- [x] Local safety revision before destructive cloud replacement.
- [x] Asset upload/dedupe/proxy/content/delete APIs.
- [x] Desktop project Asset Library connected to cloud assets.
- [x] Book structure, Master Pages and reusable styles included in incremental sync.

## KDP Production
- [x] KDP interior document mode.
- [x] Paperback mode.
- [x] Hardcover interior mode.
- [x] Common paperback trim presets.
- [x] Current supported hardcover trim presets.
- [x] Bleed / trim / safe-area overlays.
- [x] Page parity and gutter-aware safe areas.
- [x] Master Pages.
- [x] Automatic page numbering.
- [x] Arabic and Roman page-number formats.
- [x] Odd/even outside page-number positioning.
- [x] Chapter manager.
- [x] Editable generated TOC artboard.
- [x] Character styles.
- [x] Paragraph styles.
- [x] Object styles.
- [x] Paperback spine calculator.
- [x] Front / spine / back cover regions.
- [x] Cover bleed and safe-area guides.
- [x] Barcode reservation guide and overlap preflight.
- [x] Spine-text eligibility validation.
- [x] Paperback cover artboard generation/update.
- [x] Official KDP cover template image overlay import.
- [x] Template opacity/show/hide/remove controls.
- [x] Hardcover cover workflow driven by official KDP template dimensions rather than guessed wrap/hinge geometry.
- [x] Whole-book size conversion with content/font/stroke scaling.
- [x] KDP live preflight.
- [x] Page-count range validation.
- [x] Trim-size validation.
- [x] Page-size consistency checks.
- [x] Minimum text-size check.
- [x] Missing-image and blank-page checks.
- [x] Cover-size validation.
- [x] Ready / errors state with click-through to problem pages.

## PDF Production
- [x] Real PDF generation.
- [x] Interior-only export.
- [x] Cover-only export.
- [x] Interior + cover export.
- [x] Page-range export.
- [x] Batch separate Interior + Cover ZIP.
- [x] Destination: My Computer.
- [x] Destination: Cloud.
- [x] Destination: Both.
- [x] Native Windows save dialog with arbitrary drive/folder choice.
- [x] Metadata title/author/creator.
- [x] RGB output.
- [x] Grayscale output.
- [x] Crop marks.
- [x] Maximum/no-downsample image quality.
- [x] High 300-DPI smart downsample.
- [x] Standard 200-DPI smart downsample.
- [x] Small 144-DPI stronger compression.
- [x] Custom DPI and JPEG-quality controls.
- [x] Lossless PDF optimize with actual before/after byte validation.
- [x] Standalone lossy PDF recompression with configurable DPI/JPEG quality.
- [x] Imported custom-font embedding/subsetting.
- [x] Unicode text preservation when an embeddable imported font is selected.
- [x] Cubic Bezier vector export.
- [x] Image contain/cover/fill, crop, scale and mask rendering in export.
- [x] PDF merge.
- [x] PDF split to batched ZIP.
- [x] PDF extract/range.
- [x] PDF reorder.
- [x] PDF remove pages.
- [x] PDF rotate.
- [x] PDF crop.
- [x] Structural compare.
- [x] Rendered visual pixel-diff compare.
- [x] PDF.js upgraded to patched release 6.3.289 for local rendering/compare/recompression.
- [x] PDF processing uses the document/render API only; the PDF.js viewer scripting layer is not instantiated.

## Optional / Non-blocking Extensions
The master plan explicitly lists these as optional or “where supported”; they are not Phase 2 exit blockers:
- OCR/text extraction for scanned PDFs.
- PDF/X conformance presets.
- Full ICC/CMYK conversion engine.
- External heavy PDF worker; local desktop processing works without it.

## Exit Gate
Phase 2 can be marked COMPLETE only when the final source revision passes:
1. Desktop TypeScript/Vite build.
2. Windows Tauri release build/bundle.
3. PHP server syntax check.

Do not mark Phase 2 complete if any of those three gates is red.
