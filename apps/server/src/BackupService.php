<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;
use RuntimeException;
use Throwable;
use ZipArchive;

final class BackupService
{
    /** @var list<string> */
    private const DATABASE_TABLES = [
        'users',
        'projects',
        'project_locks',
        'project_snapshots',
        'sync_events',
        'assets',
        'asset_variants',
        'share_links',
        'share_events',
        'share_comments',
        'server_settings',
        'activity_logs',
        'notifications',
        'export_jobs',
    ];

    /** @return array<string,mixed> */
    public static function create(PDO $db, ?int $createdBy = null): array
    {
        $settings = AdminService::getSettings($db);
        $storageRoot = rtrim(
            (string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'),
            '/\\'
        );
        $backupRoot = $storageRoot . DIRECTORY_SEPARATOR . 'backups';

        if (!is_dir($backupRoot) && !mkdir($backupRoot, 0750, true) && !is_dir($backupRoot)) {
            throw new RuntimeException('Could not create backup directory.');
        }

        $stamp = gmdate('Ymd-His');
        $fileName = 'zaxis-kdp-backup-' . $stamp . '-' . bin2hex(random_bytes(3)) . '.zip';
        $path = $backupRoot . DIRECTORY_SEPARATOR . $fileName;
        $secondaryPath = null;

        try {
            if (!class_exists(ZipArchive::class)) {
                throw new RuntimeException('PHP ZipArchive extension is required for backups.');
            }

            $zip = new ZipArchive();
            if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('Could not open backup archive.');
            }

            $tables = self::DATABASE_TABLES;

            $database = [];
            foreach ($tables as $table) {
                $database[$table] = $db->query('SELECT * FROM ' . $table)->fetchAll();
            }

            $manifest = [
                'product' => 'Zaxis KDP',
                'format_version' => 1,
                'created_at' => gmdate(DATE_ATOM),
                'include_assets' => (bool) ($settings['backup_include_assets'] ?? false),
                'tables' => $tables,
            ];

            $zip->addFromString(
                'manifest.json',
                json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            );
            $zip->addFromString(
                'database.json',
                json_encode($database, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            );

            if ((bool) ($settings['backup_include_assets'] ?? false)) {
                $assetRows = $db->query(
                    'SELECT storage_key FROM assets
                     UNION
                     SELECT storage_key FROM asset_variants'
                )->fetchAll();

                foreach ($assetRows as $row) {
                    $key = (string) $row['storage_key'];
                    $assetPath = $storageRoot . DIRECTORY_SEPARATOR .
                        str_replace('/', DIRECTORY_SEPARATOR, $key);

                    if (is_file($assetPath)) {
                        $zip->addFile($assetPath, 'storage/' . str_replace('\\', '/', $key));
                    }
                }
            }

            $zip->close();

            if (!is_file($path)) {
                throw new RuntimeException('Backup archive was not created.');
            }

            $secondaryProvider = (string) ($settings['backup_secondary_provider'] ?? 'none');
            $secondaryRoot = trim(
                (string) ($settings['backup_secondary_path'] ?? '')
            );

            if ($secondaryProvider === 'local-path' && $secondaryRoot !== '') {
                $secondaryRoot = rtrim($secondaryRoot, '/\\');
                if (!is_dir($secondaryRoot) &&
                    !mkdir($secondaryRoot, 0750, true) &&
                    !is_dir($secondaryRoot)
                ) {
                    throw new RuntimeException('Could not create secondary backup directory.');
                }

                $secondaryPath = $secondaryRoot . DIRECTORY_SEPARATOR . $fileName;
                if (!copy($path, $secondaryPath)) {
                    throw new RuntimeException('Could not copy backup to secondary path.');
                }
            }

            $db->prepare(
                'INSERT INTO backups
                 (file_name, storage_path, secondary_path, size_bytes, status, created_by)
                 VALUES (:file_name, :storage_path, :secondary_path, :size_bytes, "completed", :created_by)'
            )->execute([
                'file_name' => $fileName,
                'storage_path' => $path,
                'secondary_path' => $secondaryPath,
                'size_bytes' => filesize($path) ?: 0,
                'created_by' => $createdBy,
            ]);

            self::enforceRetention($db, (int) ($settings['backup_retention_count'] ?? 14));

            AdminService::log(
                $db,
                $createdBy,
                'backup.created',
                'backup',
                $fileName,
                ['size_bytes' => filesize($path) ?: 0, 'secondary_path' => $secondaryPath]
            );

            return [
                'file_name' => $fileName,
                'path' => $path,
                'secondary_path' => $secondaryPath,
                'size_bytes' => filesize($path) ?: 0,
                'created_at' => gmdate(DATE_ATOM),
            ];
        } catch (Throwable $error) {
            if (is_file($path)) @unlink($path);

            $db->prepare(
                'INSERT INTO backups
                 (file_name, storage_path, secondary_path, size_bytes, status, error_message, created_by)
                 VALUES (:file_name, :storage_path, NULL, 0, "failed", :error, :created_by)'
            )->execute([
                'file_name' => $fileName,
                'storage_path' => $path,
                'error' => mb_substr($error->getMessage(), 0, 2000),
                'created_by' => $createdBy,
            ]);

            throw $error;
        }
    }

    /** @return list<array<string,mixed>> */
    public static function list(PDO $db, int $limit = 100): array
    {
        $limit = max(1, min(500, $limit));
        $stmt = $db->query(
            'SELECT id, file_name, storage_path, secondary_path, size_bytes, status, error_message, created_by, created_at
             FROM backups
             ORDER BY id DESC
             LIMIT ' . $limit
        );

        return array_map(
            static fn (array $row): array => [
                'id' => (int) $row['id'],
                'file_name' => (string) $row['file_name'],
                'storage_path' => (string) $row['storage_path'],
                'secondary_path' => $row['secondary_path'] !== null ? (string) $row['secondary_path'] : null,
                'size_bytes' => (int) $row['size_bytes'],
                'status' => (string) $row['status'],
                'error_message' => $row['error_message'] !== null ? (string) $row['error_message'] : null,
                'created_by' => $row['created_by'] !== null ? (int) $row['created_by'] : null,
                'created_at' => (string) $row['created_at'],
            ],
            $stmt->fetchAll()
        );
    }

    /**
     * Restore a completed backup by database ID.
     *
     * A fresh safety backup is created before destructive database work.
     * Authentication tokens and pairing codes are intentionally invalidated
     * after restore so credentials cannot survive a database rollback.
     *
     * @return array<string,mixed>
     */
    public static function restore(PDO $db, int $backupId, ?int $restoredBy = null): array
    {
        $stmt = $db->prepare(
            'SELECT id, file_name, storage_path, secondary_path, status
             FROM backups
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $backupId]);
        $backup = $stmt->fetch();

        if (!$backup || (string) $backup['status'] !== 'completed') {
            throw new RuntimeException('Completed backup was not found.');
        }

        $path = null;
        foreach ([$backup['storage_path'] ?? null, $backup['secondary_path'] ?? null] as $candidate) {
            if (is_string($candidate) && $candidate !== '' && is_file($candidate)) {
                $path = $candidate;
                break;
            }
        }

        if ($path === null) {
            throw new RuntimeException('Backup archive is missing from primary and secondary storage.');
        }

        [$manifest, $database] = self::readArchive($path);

        // Always make a rollback point from the live state first.
        $safetyBackup = self::create($db, $restoredBy);

        $storageRoot = rtrim(
            (string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'),
            '/\\'
        );

        $db->exec('SET FOREIGN_KEY_CHECKS=0');
        $db->beginTransaction();

        try {
            // Backup history survives a restore, but creator IDs may not.
            $db->exec('UPDATE backups SET created_by = NULL WHERE created_by IS NOT NULL');

            // Credentials are intentionally excluded from archives.
            $db->exec('DELETE FROM api_tokens');
            $db->exec('DELETE FROM pairing_codes');

            foreach (array_reverse(self::DATABASE_TABLES) as $table) {
                $db->exec('DELETE FROM ' . $table);
            }

            foreach (self::DATABASE_TABLES as $table) {
                $rows = $database[$table] ?? null;
                if (!is_array($rows)) {
                    throw new RuntimeException('Backup database payload is missing table: ' . $table);
                }

                foreach ($rows as $row) {
                    if (!is_array($row) || $row === []) {
                        continue;
                    }

                    self::insertRow($db, $table, $row);
                }
            }

            // Edit locks are ephemeral and must not be resurrected.
            $db->exec('DELETE FROM project_locks');

            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        } finally {
            $db->exec('SET FOREIGN_KEY_CHECKS=1');
        }

        if ((bool) ($manifest['include_assets'] ?? false)) {
            self::restoreAssetFiles($path, $storageRoot);
        }

        AdminService::log(
            $db,
            null,
            'backup.restored',
            'backup',
            (string) $backup['file_name'],
            [
                'backup_id' => $backupId,
                'safety_backup' => $safetyBackup['file_name'],
                'reauth_required' => true,
            ]
        );

        return [
            'backup_id' => $backupId,
            'file_name' => (string) $backup['file_name'],
            'safety_backup' => $safetyBackup,
            'restored_tables' => self::DATABASE_TABLES,
            'assets_restored' => (bool) ($manifest['include_assets'] ?? false),
            'reauth_required' => true,
        ];
    }

    /**
     * @return array{0: array<string,mixed>, 1: array<string,mixed>}
     */
    private static function readArchive(string $path): array
    {
        if (!class_exists(ZipArchive::class)) {
            throw new RuntimeException('PHP ZipArchive extension is required for restore.');
        }

        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RuntimeException('Could not open backup archive.');
        }

        try {
            $manifestJson = $zip->getFromName('manifest.json');
            $databaseJson = $zip->getFromName('database.json');

            if (!is_string($manifestJson) || !is_string($databaseJson)) {
                throw new RuntimeException('Backup archive is missing manifest.json or database.json.');
            }

            $manifest = json_decode($manifestJson, true);
            $database = json_decode($databaseJson, true);

            if (!is_array($manifest) || !is_array($database)) {
                throw new RuntimeException('Backup archive JSON is invalid.');
            }

            if (
                ($manifest['product'] ?? null) !== 'Zaxis KDP' ||
                (int) ($manifest['format_version'] ?? 0) !== 1
            ) {
                throw new RuntimeException('Unsupported backup archive format.');
            }

            $manifestTables = $manifest['tables'] ?? null;
            if (!is_array($manifestTables)) {
                throw new RuntimeException('Backup manifest table list is invalid.');
            }

            foreach (self::DATABASE_TABLES as $table) {
                if (
                    !in_array($table, $manifestTables, true) ||
                    !array_key_exists($table, $database) ||
                    !is_array($database[$table])
                ) {
                    throw new RuntimeException('Backup is incomplete; missing table: ' . $table);
                }
            }

            return [$manifest, $database];
        } finally {
            $zip->close();
        }
    }

    /** @param array<string,mixed> $row */
    private static function insertRow(PDO $db, string $table, array $row): void
    {
        if (!in_array($table, self::DATABASE_TABLES, true)) {
            throw new RuntimeException('Restore attempted an unexpected table.');
        }

        $columns = array_keys($row);
        foreach ($columns as $column) {
            if (!is_string($column) || preg_match('/^[A-Za-z0-9_]+$/', $column) !== 1) {
                throw new RuntimeException('Backup contains an invalid column name.');
            }
        }

        $placeholders = array_map(
            static fn (int $index): string => ':v' . $index,
            array_keys($columns)
        );

        $stmt = $db->prepare(
            'INSERT INTO ' . $table . ' (' . implode(', ', $columns) . ')
             VALUES (' . implode(', ', $placeholders) . ')'
        );

        $params = [];
        foreach ($columns as $index => $column) {
            $params['v' . $index] = $row[$column];
        }

        $stmt->execute($params);
    }

    private static function restoreAssetFiles(string $archivePath, string $storageRoot): void
    {
        if (!is_dir($storageRoot) && !mkdir($storageRoot, 0750, true) && !is_dir($storageRoot)) {
            throw new RuntimeException('Could not create storage directory for asset restore.');
        }

        $zip = new ZipArchive();
        if ($zip->open($archivePath) !== true) {
            throw new RuntimeException('Could not reopen backup archive for asset restore.');
        }

        try {
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $name = $zip->getNameIndex($index);
                if (!is_string($name) || !str_starts_with($name, 'storage/')) {
                    continue;
                }

                $relative = str_replace('\\', '/', substr($name, strlen('storage/')));
                if (
                    $relative === '' ||
                    str_ends_with($relative, '/') ||
                    str_starts_with($relative, '/') ||
                    preg_match('#(^|/)\.\.(/|$)#', $relative) === 1 ||
                    str_starts_with($relative, 'backups/')
                ) {
                    continue;
                }

                $destination = $storageRoot . DIRECTORY_SEPARATOR .
                    str_replace('/', DIRECTORY_SEPARATOR, $relative);
                $directory = dirname($destination);

                if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
                    throw new RuntimeException('Could not create restored asset directory.');
                }

                $source = $zip->getStream($name);
                if ($source === false) {
                    throw new RuntimeException('Could not read restored asset from backup.');
                }

                $target = fopen($destination, 'wb');
                if ($target === false) {
                    fclose($source);
                    throw new RuntimeException('Could not write restored asset.');
                }

                $copied = stream_copy_to_stream($source, $target);
                fclose($source);
                fclose($target);

                if ($copied === false) {
                    throw new RuntimeException('Restored asset copy failed.');
                }
            }
        } finally {
            $zip->close();
        }
    }

    public static function runScheduled(PDO $db): ?array
    {
        $settings = AdminService::getSettings($db);

        if (!(bool) ($settings['backup_enabled'] ?? true)) {
            return null;
        }

        $intervalHours = max(1, (int) ($settings['backup_interval_hours'] ?? 24));
        $last = $db->query(
            'SELECT created_at FROM backups
             WHERE status = "completed"
             ORDER BY id DESC LIMIT 1'
        )->fetchColumn();

        if ($last) {
            $lastTime = strtotime((string) $last);
            if ($lastTime !== false && $lastTime + $intervalHours * 3600 > time()) {
                return null;
            }
        }

        return self::create($db, null);
    }

    private static function enforceRetention(PDO $db, int $keep): void
    {
        $keep = max(1, min(365, $keep));
        $stmt = $db->query(
            'SELECT id, storage_path, secondary_path
             FROM backups
             WHERE status = "completed"
             ORDER BY id DESC'
        );
        $rows = $stmt->fetchAll();

        foreach (array_slice($rows, $keep) as $row) {
            foreach (['storage_path', 'secondary_path'] as $field) {
                $path = $row[$field] ?? null;
                if (is_string($path) && $path !== '' && is_file($path)) {
                    @unlink($path);
                }
            }

            $db->prepare('DELETE FROM backups WHERE id = :id')
                ->execute(['id' => $row['id']]);
        }
    }
}
