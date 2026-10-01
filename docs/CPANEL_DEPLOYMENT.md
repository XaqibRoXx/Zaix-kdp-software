# Zaxis KDP — cPanel Server Deployment & Recovery

This guide deploys the Phase 4 server release artifact produced by **Phase 4 Release QA**.

## Release package

Use the workflow artifact containing:

- `zaxis-kdp-server.zip`
- `zaxis-kdp-worker.zip` (optional image worker package)
- `SHA256SUMS.txt`

Verify the SHA-256 values before deployment.

## Server requirements

- PHP 8.2 or newer.
- MySQL / MariaDB with PDO MySQL enabled.
- PHP ZipArchive for backup/restore.
- Writable server storage directory.
- HTTPS for the production API URL.
- Recommended PHP extensions: `pdo_mysql`, `zip`, `mbstring`, `curl`, and GD.
- The optional image worker is separate and is not required for normal editing, sync, PDF, sharing, or backup operation.

## Recommended cPanel layout

Keep the server application separate from the public document root:

```text
/home/ACCOUNT/zaxis-kdp-server/
  .env
  install.lock
  bin/
  database/
  public/          <-- subdomain document root
  src/

/home/ACCOUNT/zaxis-kdp-storage/
  assets/
  backups/
  ...
```

Create a subdomain such as `kdp.example.com` and point its document root to:

```text
/home/ACCOUNT/zaxis-kdp-server/public
```

This keeps `.env`, database schema files, backup jobs, and PHP source outside the web root.

## First installation

1. Create an empty MySQL database and database user in cPanel.
2. Grant that user all privileges on the Zaxis KDP database.
3. Upload and extract `zaxis-kdp-server.zip` into the server directory.
4. Set the subdomain document root to the extracted `public` directory.
5. Ensure the application directory can create `.env` and `install.lock` during the one-time installer.
6. Ensure the configured storage path is writable by PHP.
7. Visit:

```text
https://kdp.example.com/install/
```

8. Enter:
   - API URL, e.g. `https://kdp.example.com`
   - optional share domain
   - storage path
   - MySQL host/port/database/user/password
   - first Owner name/email
9. Complete installation.
10. Copy the one-time connection code shown by the installer. It expires after 15 minutes and can be used once.
11. Open Zaxis KDP on Windows → **Cloud & Server** → enter API URL and connection code.
12. Confirm server diagnostics are healthy.

The installer creates `.env`, imports `database/schema.sql`, creates the first Owner, writes `install.lock`, and generates the first desktop pairing code. Once `install.lock` exists, the public installer is disabled.

## Production `.env`

The installer generates the production file automatically. A reference is available at `apps/server/.env.example`.

Important production values include:

```text
APP_ENV=production
APP_DEBUG=false
APP_URL=https://kdp.example.com
DB_HOST=localhost
DB_PORT=3306
DB_NAME=...
DB_USER=...
DB_PASS=...
STORAGE_PATH=/home/ACCOUNT/zaxis-kdp-storage
STORAGE_PROVIDER=local-cpanel
SHARE_BASE_URL=https://files.example.com
WORKER_URL=
WORKER_TOKEN=
MAX_UPLOAD_MB=100
```

Do not expose or commit `.env`.

## Storage and permissions

Use the narrowest permissions that still allow the PHP account to read/write its own files.

Recommended intent:

- application source: readable by the account/PHP process;
- `.env`: private to the account/PHP process;
- storage: writable by the account/PHP process;
- never make `.env` or backups directly public.

Avoid `0777` unless a host explicitly requires it and there is no safer alternative.

## Scheduled backups

In the Windows Admin screen configure:

- backup enabled/disabled;
- interval;
- retention;
- include asset binaries;
- optional secondary backup provider/path.

Then add a cPanel Cron Job, for example hourly:

```bash
php /home/ACCOUNT/zaxis-kdp-server/bin/run-backup.php
```

The script only creates a backup when the configured interval has elapsed, applies retention, and can copy the archive to the configured secondary path.

## Manual backup

Windows app → **Admin** → **Backups** → create a backup.

A completed archive contains a manifest and database snapshot. When asset backup is enabled, storage asset files are also included.

## Restore

Windows app → **Admin** → **Backups** → **Restore**.

Restore safety behavior:

1. The selected archive is validated before destructive work.
2. A fresh safety backup of the current live state is created automatically.
3. Persistent database tables are restored transactionally.
4. Project edit locks are cleared.
5. Existing API tokens and pairing codes are invalidated deliberately.
6. Asset files are restored when the backup contains assets.
7. Restore is recorded in the activity log.

After a successful restore, reconnect the Windows app with a newly generated connection code because prior desktop API tokens are no longer valid.

## Server update

For an application update:

1. Create and verify a fresh backup.
2. Keep the current `.env`, `install.lock`, and storage directory.
3. Upload the new server package to a staging directory.
4. Compare database migrations/schema requirements included in the release.
5. Replace application code, not runtime storage.
6. Keep the existing production `.env`.
7. Run server diagnostics from the Windows app.
8. Confirm project list, asset access, sharing, and backup status.

Do not rerun the first-install wizard on an existing production database.

## Optional image worker

`zaxis-kdp-worker.zip` is optional. Deploy it on a machine that can run the Python worker dependencies and ML models. Configure `WORKER_URL` and `WORKER_TOKEN` on the PHP server. The Windows app should never receive the worker secret.

Use Admin/Diagnostics to verify worker health.

## Post-deployment verification

Verify all of the following:

- API health responds.
- Windows pairing succeeds.
- Owner identity is correct.
- create/open/edit project works.
- cloud autosave advances revision.
- asset upload/download works.
- PDF export works.
- public share link works when enabled.
- Admin diagnostics show writable storage and sufficient free space.
- manual backup completes.
- scheduled backup cron executes.
- restore can be exercised on a staging/test installation before production recovery is needed.

## Recovery when the primary server is lost

1. Provision PHP 8.2+ and MySQL.
2. Deploy the same or a compatible Zaxis KDP server release.
3. Create an empty database.
4. Configure a valid `.env` for the new host.
5. Make the storage directory writable.
6. Register the available backup archive in the restored installation or place it in configured backup storage.
7. Use the restore workflow.
8. Reconnect every desktop using new one-time pairing codes.
9. Verify diagnostics and project/asset integrity.

Always retain at least one secondary backup outside the primary server filesystem.
