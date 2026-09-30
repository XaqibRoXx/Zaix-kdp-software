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
