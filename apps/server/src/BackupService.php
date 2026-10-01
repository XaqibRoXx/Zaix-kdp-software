<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;
use RuntimeException;
use Throwable;
use ZipArchive;

final class BackupService
{
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
        $fileName = 'zaxis-kdp-backup-' . $stamp . '.zip';
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

            $tables = [
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
