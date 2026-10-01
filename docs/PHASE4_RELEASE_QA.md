# Zaxis KDP — Phase 4 Release + QA

Status: **IN PROGRESS**

Started: 2026-10-01

## Goal

Turn the completed Phase 1–3 product into a reproducible, verifiable Windows release with a portable build, deployable cPanel/server package, optional worker package, release checks, update channel, restore validation, and final setup documentation.

## Implemented in the Phase 4 foundation

- [x] Dedicated Phase 4 release/QA workflow.
- [x] Desktop frontend build and high-severity npm audit gate.
- [x] PHP 8.2 syntax validation gate.
- [x] Python image-worker compile gate.
- [x] Windows installer build gate.
- [x] Portable-build configuration using an app-local `./app-data` directory.
- [x] Portable executable artifact staging.
- [x] cPanel/server ZIP artifact generation.
- [x] Optional image-worker ZIP artifact generation.
- [x] SHA-256 manifest generation for Windows release candidates.
- [x] Release artifacts kept separate from source-tree runtime data.

## Remaining Phase 4 work

- [ ] Run the new workflow and fix any release-candidate failures.
- [ ] Large-book and large-project stress QA.
- [ ] Memory/performance profiling and page/proxy virtualization hardening.
- [ ] Autosave/offline/reconnect/conflict stress tests.
- [ ] PDF fidelity/compression regression corpus.
- [ ] KDP preflight regression corpus.
- [ ] Background-removal quality regression checks.
- [ ] Backup → clean restore → data-integrity validation.
- [ ] Installer upgrade/uninstall/reinstall validation.
- [ ] Portable build clean-machine validation.
- [ ] Tauri updater signing key generation and secure secret storage.
- [ ] Signed updater artifacts and release metadata.
- [ ] In-app update check/install UX.
- [ ] Final cPanel deployment guide.
- [ ] Final Windows setup guide.
- [ ] Final release checklist and versioned release.

## Auto-update security rule

Tauri v2 updater artifacts must be signed. The private updater signing key must never be committed to Git. Release automation may consume it only from protected CI secrets. The public verification key may be stored in application configuration.

Auto-update is not considered complete until a signed update has been produced and successfully verified by an installed build.

## Portable-build rule

The portable flavor uses Tauri's app-directory override to place Tauri-managed application data in `./app-data` beside the executable. User-bound secrets may still use Windows-protected credential storage when required for security.

## Exit criteria

Phase 4 reaches 100% only when all required QA gates are green and the following deliverables are reproducibly generated and verified:

1. Windows installer.
2. Portable Windows package.
3. cPanel/server deployment ZIP including database installer/migrations.
4. Optional worker package.
5. Backup/restore-tested release package.
6. Signed auto-update channel.
7. Setup/deployment/recovery documentation.
