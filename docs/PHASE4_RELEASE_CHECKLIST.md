# Zaxis KDP — Phase 4 Final Release Checklist

A release is accepted only when every **Required** item below is complete and evidence is retained.

## 1. Source and dependency gates — Required

- [ ] Desktop TypeScript/Vite production build passes.
- [ ] High-severity npm security audit passes.
- [ ] PHP 8.2 syntax validation passes.
- [ ] Python worker source compiles.
- [ ] Image-worker processing contract regression passes.
- [ ] Release source commit is recorded.
- [ ] Release artifacts have SHA-256 manifests.

## 2. Large project / editor — Required

- [ ] 400-page core project stress smoke passes.
- [ ] Sparse 400-page sync-delta regression passes.
- [ ] Large-book artboard navigator uses bounded thumbnail rendering.
- [ ] Interactive editor remains usable on a representative image-heavy large book.
- [ ] Undo/Redo remains functional after sustained editing.
- [ ] Memory use does not grow without bound during repeated page navigation.

## 3. Sync and recovery — Required

- [ ] IndexedDB queue coalescing regression passes.
- [ ] Offline edit remains queued.
- [ ] Reconnect flushes the queued edit.
- [ ] Revision mismatch becomes an explicit conflict rather than silent overwrite.
- [ ] HTTP 423 project lock remains queued and separately classified.
- [ ] Crash/local recovery behavior is exercised.
- [ ] Cloud revision restore creates a safe new revision.

## 4. KDP production — Required

- [ ] Valid paperback regression is Ready.
- [ ] Minimum page count enforcement passes.
- [ ] Page-size mismatch detection passes.
- [ ] Trim-range validation passes.
- [ ] Minimum font-size detection passes.
- [ ] Missing-image detection passes.
- [ ] Cover geometry validation passes.
- [ ] Barcode reservation overlap detection passes.
- [ ] Spine-text threshold regression passes.
- [ ] Hardcover restriction/template checks pass.
- [ ] Bleed/no-bleed margin thresholds pass.

## 5. PDF production — Required

- [ ] PDF merge regression passes.
- [ ] Extract/range regression passes.
- [ ] Rotate regression passes.
- [ ] Remove/reorder regression passes.
- [ ] Crop geometry regression passes.
- [ ] Split ZIP regression passes.
- [ ] Structural compare regression passes.
- [ ] Lossless optimization never chooses a larger output.
- [ ] Representative visual pixel-diff corpus passes.
- [ ] Representative lossy/compression fidelity corpus passes.

## 6. Image worker — Required when worker is shipped

- [ ] Fast mode processing contract passes.
- [ ] Quality mode decontamination contract passes.
- [ ] Hair/Fur ViTMatte contract passes.
- [ ] Mask-only contract passes.
- [ ] Worker auth guard regression passes.
- [ ] Representative real-photo background-removal quality corpus is reviewed.
- [ ] Transparent edges/hair/fur are checked on representative difficult images.
- [ ] Original asset preservation is verified.

## 7. Server, backup and restore — Required

- [ ] cPanel/server ZIP is generated.
- [ ] Optional worker ZIP is generated.
- [ ] Server and worker package checksums are generated.
- [ ] MySQL backup → mutation → restore integration test passes.
- [ ] Pre-restore safety backup is created.
- [ ] Restored data integrity is verified.
- [ ] API tokens/pairing codes are invalidated after restore.
- [ ] Project locks are cleared after restore.
- [ ] Restore action is present in Windows Admin.
- [ ] Scheduled backup cron is documented.
- [ ] Secondary/off-server backup is configured for production.

## 8. Windows installer and portable — Required

- [ ] MSI bundle builds.
- [ ] NSIS bundle builds.
- [ ] Silent MSI installation passes on a clean Windows runner.
- [ ] MSI uninstall passes and removes registration.
- [ ] Portable executable builds.
- [ ] Portable startup smoke passes.
- [ ] Portable app-local data directory behavior is verified.
- [ ] Windows release SHA-256 manifest is generated.
- [ ] Upgrade from previous installed release is exercised on a real/VM Windows environment.
- [ ] Local-only user data is reviewed before uninstall/upgrade testing.

## 9. Signed auto-update — Required for Phase 4 exit

- [ ] Tauri updater plugin compiles in Windows release build.
- [ ] Settings contains Check for Updates / Install UX.
- [ ] `TAURI_SIGNING_PRIVATE_KEY` is stored only as a protected GitHub Actions secret.
- [ ] Signing-key password is stored as a protected secret when used.
- [ ] Updater public key is configured.
- [ ] Signed release workflow generates installer signature.
- [ ] `latest.json` is generated and published.
- [ ] Update endpoint uses HTTPS.
- [ ] Installed version N detects signed version N+1.
- [ ] Version N successfully installs N+1.
- [ ] N+1 opens and project data remains intact.
- [ ] Invalid/unsigned update is rejected.

See `docs/UPDATER_RELEASE.md`.

## 10. Deployment documentation — Required

- [ ] `docs/CPANEL_DEPLOYMENT.md` reviewed.
- [ ] `docs/WINDOWS_SETUP.md` reviewed.
- [ ] `docs/UPDATER_RELEASE.md` reviewed.
- [ ] Recovery steps are validated on a non-production environment.
- [ ] Release notes identify server/database compatibility requirements.

## 11. Final release — Required

- [ ] All automated Phase 4 CI jobs are green on the exact release commit.
- [ ] All required manual checks above are recorded.
- [ ] Version is updated consistently.
- [ ] Signed GitHub Release is published.
- [ ] Installer, signature, `latest.json`, server ZIP, optional worker ZIP and checksum evidence are retained.
- [ ] `docs/STATUS.md` marks Phase 4 **100% COMPLETE** only after the real signed N → N+1 update gate and remaining manual fidelity checks pass.
