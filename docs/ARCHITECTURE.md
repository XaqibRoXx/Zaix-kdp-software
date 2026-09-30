# Zaxis KDP — Architecture

## Top-Level System

Windows Desktop App → Secure HTTPS API → Zaxis KDP Server → Storage/MySQL → Optional Worker.

## Desktop Direction
- Tauri desktop shell for a lightweight Windows footprint.
- React/TypeScript UI.
- Editor core separated from UI.
- Native bridge for system fonts, clipboard, local cache, filesystem dialogs, secure credentials, and Windows integration.

## Document Model
Projects must not be stored as one giant opaque file. Use project metadata, artboards/pages, object/layer records, asset references, font references, styles/components, export presets and revisions. This enables incremental autosave and loading only active/nearby artboards.

## Autosave
1. User action changes editor state.
2. Change enters Undo/Redo command history.
3. Recovery state is written to bounded local cache.
4. Change is added to sync queue.
5. Server acknowledges persisted revision.
6. UI reports Saved to Cloud.

Offline operations stay recoverable and sync later.

## Undo/Redo vs Revision History
- Undo/Redo: immediate command history.
- Revision history: persistent server-side checkpoints across sessions/devices.
They are separate systems.

## Assets
- Preserve originals.
- Editor may use lightweight proxies.
- Pasted/imported assets upload asynchronously.
- Final export uses original/highest-quality source.
- Project objects reference stable asset IDs.

## Fonts
Desktop provider reads installed Windows fonts. Cloud/project provider handles uploaded fonts. One provider interface exposes both to the editor and tracks embedding/licensing metadata where detectable.

## Cloud Connection
Primary live editing transport is HTTPS API. FTP/SFTP may be optional for setup, migration or backup, not live document sync.

Configurable connection fields include API URL, token/connection code, share domain, storage provider/path, worker URL/key, health test and diagnostics.

## No-Hardcoding Rule
Settings likely to differ by install/project must be configuration driven, including presets, compression defaults, storage paths, share-link defaults, cache limits/location, backup retention, feature flags, worker endpoints and naming rules.


## Current Phase 2 Server Implementation
The first deployable server foundation is intentionally lightweight for cPanel/shared-host compatibility:
- PHP 8.2.
- PDO MySQL.
- Framework-neutral HTTP/API layer with Composer PSR-4 autoloading.
- Bearer-token authentication using SHA-256 token hashes.
- Optimistic project revision locking and idempotent client event IDs.
- Apache .htaccess front-controller routing.

The API contracts are kept framework-neutral so the implementation can be wrapped by or migrated to Laravel later without changing the desktop sync contract.


## Secure Server Pairing
1. Server package is uploaded to cPanel and the one-time `/install/` wizard is opened.
2. Installer validates PHP/MySQL, runs the schema, creates the first owner, writes the server-side `.env`, creates storage, and locks itself with `install.lock`.
3. Installer creates a 15-minute one-time pairing code stored only as SHA-256 in `pairing_codes`.
4. Windows app receives only API URL + pairing code.
5. `POST /api/pair` consumes the code exactly once and returns a newly generated desktop API token.
6. Server stores only the SHA-256 token hash.
7. Windows app encrypts the raw token with the current Windows user account; it is never written to localStorage or app settings.
8. Additional devices can receive new short-lived pairing codes from an already authenticated session.

This pairing flow is the preferred connection path. Manual API-token entry remains an advanced fallback only.

## Cloud Sync Conflict Rule
Every queued snapshot retains the cloud revision it was based on. Coalescing newer local edits must not replace that base revision. Before pushing, the client verifies the current server revision. A mismatch becomes a conflict and the client must not silently overwrite newer cloud work.


## Project Edit Locking
Cloud projects use short-lived server locks to reduce accidental multi-device overwrite while preserving offline editing.

- Every Windows installation has a stable random `client_id` stored locally.
- When the Editor opens a cloud project, the desktop app requests a 120-second lock and refreshes it every 60 seconds.
- The same client may refresh its own lock; another active client receives HTTP 423 Locked.
- Snapshot writes are also checked server-side, so the protection does not depend on UI behavior.
- Leaving or switching the project attempts to release the owned lock immediately.
- Expired locks are cleaned automatically.
- If another editor owns the lock, local edits are still allowed and remain in the offline/sync queue; they are not silently discarded.
- The top bar shows the current edit-lock state.
- Revision-base conflict checks still run independently. A lock does not replace revision conflict detection.


## Incremental Autosave Deltas
After the first full cloud snapshot, the desktop keeps the last successfully synced project snapshot in its local sync metadata.

For each autosave:
- The client compares artboards by stable ID.
- Only changed/new artboards, removed artboard IDs, current artboard order and changed project metadata are included in a versioned delta.
- The client uses delta sync only when the delta payload is materially smaller than the full project snapshot; otherwise it sends the full snapshot.
- The server applies a delta only when `base_revision` still matches the current cloud revision.
- Server-side project locks are checked before the delta is applied.
- The server reconstructs the complete next project snapshot and stores that full result in `project_snapshots`.
- `sync_events` records the compact delta payload for audit/idempotency.
- If the delta endpoint is unavailable on an older server, the desktop falls back to a full snapshot.
- Revision conflicts never fall back to overwrite.
