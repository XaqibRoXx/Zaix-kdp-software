# Zaxis KDP — Master Build Plan

This document is the canonical implementation plan. It must be updated whenever scope, phase ownership, architecture, or delivery status changes.

## Phase 1 — Windows App + Full Design Editor

### Foundation
- Windows desktop shell.
- Project dashboard.
- Create/Open/Duplicate/Delete/Archive projects.
- Recent projects.
- App settings.
- Dark/light workspace support.
- Zaxis D v5-inspired solid-color design language.
- Auto-update foundation.
- Diagnostics/logging foundation.

### Editor
- Multi-artboard canvas.
- Custom artboard size: px, in, cm, mm, pt, pica.
- Multiple artboard presets, including KDP presets.
- Add/delete/duplicate/reorder artboards.
- Bulk artboard resize: all, selected, page range.
- Resize behavior: artboard only, centered content, proportional scale, fit, constraints.
- Selection and direct-selection architecture.
- Move/resize/rotate/flip/skew transforms.
- Shapes: rectangle, ellipse, polygon, star, line.
- Pen/path architecture and bezier editing.
- Text boxes and paragraph text.
- Layers/sub-layers, visibility, locking, ordering, grouping.
- Align/distribute/snap/smart guides/rulers/grid.
- Fill/stroke/opacity/swatches/gradients.
- Image placement, crop, fit/fill, masks and transparency.
- Clipboard image paste from browser/File Explorer/Snipping Tool/design apps.
- Imported image immediately editable while cloud upload happens in background.
- Undo/Redo command history.
- Autosave hooks.
- Zoom/pan/spread/single-page views.

### Fonts
- Enumerate Windows system fonts.
- Project fonts.
- Uploaded/global cloud fonts.
- TTF/OTF support first; additional web font formats where relevant.
- Search/favorites/recent/font preview.
- Missing-font detection and replacement.
- Font embedding/preflight metadata.

### Graphic Design Mode
- KDP/book mode and general graphic-design mode.
- Posters, flyers, social graphics, thumbnails, brochures, certificates, banners and custom print layouts.

### Phase 1 Exit
A usable Windows editor build that can create/save/reopen multi-artboard projects and perform core text/image/shape/layer operations with Undo/Redo and autosave hooks.

---

## Phase 2 — Cloud + KDP + PDF Production

### Cloud Connection
- Server/Cloud Setup Wizard.
- API URL, connection code/token, storage, database, share domain and worker settings.
- Test connection and diagnostics.
- Secure credential storage.
- Configurable storage paths/providers.
- cPanel server connector/installer package.

### Autosave & Recovery
- Canva-style continuous autosave.
- Incremental/delta sync rather than whole-project upload.
- Visible Saving / Saved / Offline state.
- Offline queue and reconnect sync.
- Bounded cache with configurable location/size.
- Crash recovery.
- Automatic restore points.
- Manual named revisions.
- Compare/preview/restore revision.
- Project locking and conflict resolution.

### KDP
- Book Interior mode.
- Cover mode.
- Paperback/hardcover presets.
- Trim/bleed/safe-area overlays.
- Master pages.
- Auto page numbering.
- Odd/even page rules.
- Chapters.
- Auto TOC.
- Styles: paragraph, character, object.
- KDP cover creator.
- Spine calculator.
- KDP template overlay import.
- ISBN/barcode safe area.
- Whole-book size conversion.
- KDP preflight.

### PDF
- Adobe-style PDF export options.
- No compression / lossless / smart / custom compression.
- Downsampling controls and image quality controls.
- Font embedding.
- Color/print options and metadata.
- Export selected pages/artboards/ranges.
- Batch exports.
- Save destination: Cloud / Laptop / Both.
- PDF Merge.
- PDF Split.
- Extract pages.
- Reorder/remove/rotate/crop pages.
- PDF Compare.
- Optional OCR pipeline.
- PDF/X variants where supported.

### Phase 2 Exit
A complete KDP workflow from design to validated PDF, with reliable cloud autosave/recovery and configurable server connection.

---

## Phase 3 — Image AI + Assets + Sharing + Admin

### Asset Library
- Cloud asset library.
- Original asset preservation.
- Lightweight editor proxies.
- Linked assets.
- Duplicate detection.
- Batch replace.
- Missing asset detection.
- Reusable components/templates.

### Image Tools
- One-click background remover.
- High-quality subject edge extraction.
- Hair/fur/soft edge handling.
- Remove/restore/refine brush.
- Decontaminate edge/background color spill where possible.
- Transparent PNG output.
- Replace background with color/image/blur.
- Batch background removal.
- Optional upscale/cleanup pipeline.
- Original image always retained.

### Cloud Files & Sharing
- Cloud file manager.
- Automatic persistent share URL after cloud PDF export.
- Public browser preview.
- Download option.
- No-login “anyone with link” mode.
- Password protection.
- Link expiry.
- Disable download.
- Revoke link.
- Replace file while keeping same share URL.
- View/download counters.
- Proof mode and comments.

### Admin / Server
- User/role/permission management.
- Storage quotas.
- Feature toggles.
- Global defaults with per-project overrides.
- Server/storage/worker management.
- Backup schedules and retention.
- Secondary backup provider.
- Activity logs.
- Recycle bin.
- Export queue.
- Notifications.
- Configurable naming rules.
- Diagnostics and repair tools.

### Phase 3 Exit
Cloud collaboration, high-quality image utilities and production-ready administration are functional.

---

## Phase 4 — Release + QA

- Performance profiling and memory reduction.
- Large project and large-book testing.
- Proxy loading and page virtualization.
- Stress test many artboards/assets.
- Autosave/offline/conflict tests.
- PDF fidelity testing.
- Compression quality/size testing.
- KDP preflight validation.
- Background-removal QA.
- Security review.
- Installer build.
- Portable build.
- Auto-update channel.
- Server deployment ZIP.
- Database migrations/installer.
- Worker package if separate worker is required.
- Backup/restore validation.
- Final docs and setup guide.

## Final Deliverables
- Zaxis KDP Windows installer.
- Portable Windows build.
- Full GitHub source.
- cPanel/VPS backend package.
- Database migrations/installer.
- Worker package where required.
- Admin panel.
- Auto-update configuration.
- Setup/deployment documentation.
