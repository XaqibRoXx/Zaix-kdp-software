# Zaxis KDP — Phase 4 Release + QA

Status: **IN PROGRESS**

Started: 2026-10-01

## Goal

Turn the completed Phase 1–3 product into a reproducible, verifiable Windows release with a portable build, deployable cPanel/server package, optional worker package, release checks, update channel, restore validation, and final setup documentation.

## Verified Phase 4 implementation

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
- [x] Automated 400-page large-book core stress smoke with object creation, normalization, resize, cover generation, history, serialization and memory/timing metrics.
- [x] Automated 400-page sparse sync-delta regression covering changed/new/removed artboards, ordering and payload-size efficiency.
- [x] IndexedDB offline queue/reconnect/conflict/project-lock integration regression.
- [x] Bounded large-book artboard thumbnail rendering with a lightweight full-book jump selector.
- [x] KDP preflight regression matrix.
- [x] PDF merge/extract/rotate/remove/reorder/crop/split/compare/lossless structural regression suite.
- [x] Image-worker Fast / Quality / Hair-Fur / Mask / auth processing-contract regression.
- [x] MySQL backup → mutation → restore validation.
- [x] Original asset + proxy binary backup/restore byte-integrity validation.
- [x] Clean-disaster recovery test: database and asset storage removed, schema recreated, external ZIP restored by CLI, data integrity verified.
- [x] Deployable cPanel ZIP now includes optimized Composer autoload files.
- [x] Silent MSI install/uninstall validation on a clean Windows CI runner.
- [x] Portable executable clean-runner startup validation.
- [x] In-app updater check/install UX.
- [x] Signed Windows release workflow with private-key CI-secret boundary.
- [x] Updater initialization isolated to signed release builds so unsigned QA/portable builds do not crash.
- [x] Final cPanel deployment/recovery guide.
- [x] Final Windows setup/recovery guide.
- [x] Final auditable Phase 4 release checklist.
- [x] Latest consolidated automated Phase 4 run is green across desktop, server/worker, clean recovery and Windows release-candidate jobs.

## Remaining Phase 4 work

- [ ] Configure the real Tauri updater private/public signing keys in protected GitHub Actions secrets.
- [ ] Produce a signed release and complete a real installed version N → signed version N+1 update.
- [ ] Verify an invalid/unsigned updater artifact is rejected.
- [ ] Run representative image-heavy large-book interactive/memory profiling on a real Windows machine.
- [ ] Run representative PDF visual pixel-fidelity and lossy-compression acceptance corpus.
- [ ] Review representative real-photo background-removal quality, including difficult hair/fur/transparency edges.
- [ ] Exercise a real previous-version Windows upgrade path, not only clean MSI install/uninstall.
- [ ] Publish the final versioned signed release after the manual gates above are recorded.

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
