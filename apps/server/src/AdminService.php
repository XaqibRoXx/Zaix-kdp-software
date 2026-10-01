<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;
use RuntimeException;

final class AdminService
{
    /** @param array<string,mixed> $user */
    public static function requireAdmin(array $user): void
    {
        if (!in_array((string) ($user['role'] ?? ''), ['owner', 'admin'], true)) {
            throw new RuntimeException('Administrator access is required.');
        }
    }

    /** @return array<string,mixed> */
    public static function overview(PDO $db): array
    {
        $users = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $projects = (int) $db->query('SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL')->fetchColumn();
        $assets = (int) $db->query('SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL')->fetchColumn();
        $assetBytes = (int) $db->query(
            'SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE deleted_at IS NULL'
        )->fetchColumn();
        $recycle = (int) $db->query(
            'SELECT
              (SELECT COUNT(*) FROM projects WHERE deleted_at IS NOT NULL) +
              (SELECT COUNT(*) FROM assets WHERE deleted_at IS NOT NULL)'
        )->fetchColumn();
        $shares = (int) $db->query(
            'SELECT COUNT(*) FROM share_links WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())'
        )->fetchColumn();
        $queuedExports = (int) $db->query(
            'SELECT COUNT(*) FROM export_jobs WHERE status IN ("queued","running")'
        )->fetchColumn();
        $unreadNotifications = (int) $db->query(
            'SELECT COUNT(*) FROM notifications WHERE read_at IS NULL'
        )->fetchColumn();
        $backups = (int) $db->query('SELECT COUNT(*) FROM backups WHERE status = "completed"')->fetchColumn();

        return [
            'users' => $users,
            'projects' => $projects,
            'assets' => $assets,
            'asset_bytes' => $assetBytes,
            'recycle_items' => $recycle,
            'active_shares' => $shares,
            'queued_exports' => $queuedExports,
            'unread_notifications' => $unreadNotifications,
            'backups' => $backups,
        ];
    }

    /** @return list<array<string,mixed>> */
    public static function users(PDO $db): array
    {
        $stmt = $db->query(
            'SELECT
               u.id,
               u.email,
               u.name,
               u.role,
               u.storage_quota_bytes,
               u.created_at,
               u.updated_at,
               COALESCE((
                 SELECT SUM(a.size_bytes)
                 FROM assets a
                 WHERE a.owner_user_id = u.id AND a.deleted_at IS NULL
               ), 0) AS storage_used_bytes,
               (
                 SELECT COUNT(*)
                 FROM projects p
                 WHERE p.owner_user_id = u.id AND p.deleted_at IS NULL
               ) AS project_count
             FROM users u
             ORDER BY u.created_at ASC'
        );

        return array_map(
            static fn (array $row): array => [
                'id' => (int) $row['id'],
                'email' => (string) $row['email'],
                'name' => (string) $row['name'],
                'role' => (string) $row['role'],
                'storage_quota_bytes' => (int) $row['storage_quota_bytes'],
                'storage_used_bytes' => (int) $row['storage_used_bytes'],
                'project_count' => (int) $row['project_count'],
                'created_at' => (string) $row['created_at'],
                'updated_at' => (string) $row['updated_at'],
            ],
            $stmt->fetchAll()
        );
    }

    /**
     * @param array<string,mixed> $actor
     * @param array<string,mixed> $input
     * @return array<string,mixed>|null
     */
    public static function updateUser(PDO $db, array $actor, int $userId, array $input): ?array
    {
        self::requireAdmin($actor);

        $stmt = $db->prepare(
            'SELECT id, email, name, role, storage_quota_bytes
             FROM users WHERE id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $userId]);
        $current = $stmt->fetch();

        if (!$current) return null;

        $role = array_key_exists('role', $input)
            ? (string) $input['role']
            : (string) $current['role'];

        if (!in_array($role, ['owner', 'admin', 'editor', 'reviewer'], true)) {
            throw new RuntimeException('Invalid user role.');
        }

        if (
            (int) $actor['id'] === $userId &&
            (string) $current['role'] === 'owner' &&
            $role !== 'owner'
        ) {
            throw new RuntimeException('The current owner cannot demote their own account.');
        }

        $quotaBytes = array_key_exists('storage_quota_bytes', $input)
            ? max(0, (int) $input['storage_quota_bytes'])
            : (int) $current['storage_quota_bytes'];

        $db->prepare(
            'UPDATE users
             SET role = :role, storage_quota_bytes = :quota
             WHERE id = :id'
        )->execute([
            'role' => $role,
            'quota' => $quotaBytes,
            'id' => $userId,
        ]);

        self::log($db, (int) $actor['id'], 'user.updated', 'user', (string) $userId, [
            'role' => $role,
            'storage_quota_bytes' => $quotaBytes,
        ]);

        foreach (self::users($db) as $user) {
            if ((int) $user['id'] === $userId) return $user;
        }

        return null;
    }

    /** @return array<string,mixed> */
    public static function getSettings(PDO $db): array
    {
        $defaults = [
            'feature_background_remove' => true,
            'feature_public_sharing' => true,
            'feature_proof_comments' => true,
            'feature_batch_processing' => true,
            'default_share_download' => true,
            'default_share_proof_mode' => false,
            'default_project_mode' => 'kdp',
            'naming_project_pattern' => '{name}',
            'naming_export_pattern' => '{project}-{date}',
            'backup_enabled' => true,
            'backup_interval_hours' => 24,
            'backup_retention_count' => 14,
            'backup_include_assets' => false,
            'backup_secondary_path' => '',
            'recycle_retention_days' => 30,
            'worker_url_override' => '',
        ];

        $stmt = $db->query('SELECT setting_key, setting_value FROM server_settings');
        foreach ($stmt->fetchAll() as $row) {
            $decoded = json_decode((string) $row['setting_value'], true);
            $defaults[(string) $row['setting_key']] =
                json_last_error() === JSON_ERROR_NONE ? $decoded : (string) $row['setting_value'];
        }

        return $defaults;
    }

    /**
     * @param array<string,mixed> $actor
     * @param array<string,mixed> $input
     * @return array<string,mixed>
     */
    public static function updateSettings(PDO $db, array $actor, array $input): array
    {
        self::requireAdmin($actor);

        $allowed = array_keys(self::getSettings($db));
        $stmt = $db->prepare(
            'INSERT INTO server_settings (setting_key, setting_value, updated_by)
             VALUES (:key, :value, :user)
             ON DUPLICATE KEY UPDATE
               setting_value = VALUES(setting_value),
               updated_by = VALUES(updated_by),
               updated_at = NOW()'
        );

        foreach ($input as $key => $value) {
            if (!in_array((string) $key, $allowed, true)) continue;

            if ($key === 'backup_interval_hours') {
                $value = max(1, min(720, (int) $value));
            } elseif ($key === 'backup_retention_count') {
                $value = max(1, min(365, (int) $value));
            } elseif ($key === 'recycle_retention_days') {
                $value = max(1, min(365, (int) $value));
            } elseif ($key === 'default_project_mode') {
                $value = in_array($value, ['kdp', 'graphic-design'], true) ? $value : 'kdp';
            }

            $stmt->execute([
                'key' => $key,
                'value' => json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'user' => $actor['id'],
            ]);
        }

        self::log($db, (int) $actor['id'], 'settings.updated', 'server', 'global', array_keys($input));

        return self::getSettings($db);
    }

    /** @return list<array<string,mixed>> */
    public static function activity(PDO $db, int $limit = 200): array
    {
        $limit = max(1, min(500, $limit));
        $stmt = $db->query(
            'SELECT l.id, l.action, l.subject_type, l.subject_id, l.details_json, l.created_at,
                    u.id AS user_id, u.name AS user_name, u.email AS user_email
             FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             ORDER BY l.id DESC
             LIMIT ' . $limit
        );

        return array_map(
            static function (array $row): array {
                $details = $row['details_json'] !== null
                    ? json_decode((string) $row['details_json'], true)
                    : null;

                return [
                    'id' => (int) $row['id'],
                    'action' => (string) $row['action'],
                    'subject_type' => $row['subject_type'] !== null ? (string) $row['subject_type'] : null,
                    'subject_id' => $row['subject_id'] !== null ? (string) $row['subject_id'] : null,
                    'details' => $details,
                    'user_id' => $row['user_id'] !== null ? (int) $row['user_id'] : null,
                    'user_name' => $row['user_name'] !== null ? (string) $row['user_name'] : null,
                    'user_email' => $row['user_email'] !== null ? (string) $row['user_email'] : null,
                    'created_at' => (string) $row['created_at'],
                ];
            },
            $stmt->fetchAll()
        );
    }

    /** @return array{projects:list<array<string,mixed>>,assets:list<array<string,mixed>>} */
    public static function recycleBin(PDO $db): array
    {
        $projects = $db->query(
            'SELECT id, owner_user_id, name, mode, deleted_at
             FROM projects WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC LIMIT 500'
        )->fetchAll();

        $assets = $db->query(
            'SELECT id, owner_user_id, project_id, original_name, mime_type, size_bytes, deleted_at
             FROM assets WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC LIMIT 500'
        )->fetchAll();

        return [
            'projects' => array_values($projects),
            'assets' => array_values($assets),
        ];
    }

    /** @param array<string,mixed> $actor */
    public static function restoreRecycle(PDO $db, array $actor, string $type, string $id): bool
    {
        self::requireAdmin($actor);

        if ($type === 'project') {
            $stmt = $db->prepare('UPDATE projects SET deleted_at = NULL WHERE id = :id AND deleted_at IS NOT NULL');
        } elseif ($type === 'asset') {
            $stmt = $db->prepare('UPDATE assets SET deleted_at = NULL WHERE id = :id AND deleted_at IS NOT NULL');
        } else {
            throw new RuntimeException('Unsupported recycle-bin item type.');
        }

        $stmt->execute(['id' => $id]);
        $restored = $stmt->rowCount() > 0;

        if ($restored) {
            self::log($db, (int) $actor['id'], 'recycle.restored', $type, $id);
        }

        return $restored;
    }

    /** @param array<string,mixed> $actor */
    public static function purgeRecycle(PDO $db, array $actor, string $type, string $id): bool
    {
        self::requireAdmin($actor);

        if ($type === 'project') {
            $stmt = $db->prepare('DELETE FROM projects WHERE id = :id AND deleted_at IS NOT NULL');
            $stmt->execute(['id' => $id]);
            $purged = $stmt->rowCount() > 0;
        } elseif ($type === 'asset') {
            $asset = $db->prepare(
                'SELECT owner_user_id, storage_key FROM assets
                 WHERE id = :id AND deleted_at IS NOT NULL LIMIT 1'
            );
            $asset->execute(['id' => $id]);
            $row = $asset->fetch();

            if (!$row) return false;

            $variantStmt = $db->prepare('SELECT storage_key FROM asset_variants WHERE asset_id = :id');
            $variantStmt->execute(['id' => $id]);
            $keys = [(string) $row['storage_key']];
            foreach ($variantStmt->fetchAll() as $variant) {
                $keys[] = (string) $variant['storage_key'];
            }

            $db->prepare('DELETE FROM share_links WHERE asset_id = :id')->execute(['id' => $id]);
            $db->prepare('DELETE FROM assets WHERE id = :id AND deleted_at IS NOT NULL')->execute(['id' => $id]);

            $root = rtrim((string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'), '/\\');
            foreach ($keys as $key) {
                $path = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $key);
                if (is_file($path)) @unlink($path);
            }

            $purged = true;
        } else {
            throw new RuntimeException('Unsupported recycle-bin item type.');
        }

        if ($purged) {
            self::log($db, (int) $actor['id'], 'recycle.purged', $type, $id);
        }

        return $purged;
    }

    /** @return list<array<string,mixed>> */
    public static function notifications(PDO $db, ?int $userId = null): array
    {
        if ($userId === null) {
            $stmt = $db->query(
                'SELECT id, user_id, level, title, body, read_at, created_at
                 FROM notifications ORDER BY id DESC LIMIT 300'
            );
        } else {
            $stmt = $db->prepare(
                'SELECT id, user_id, level, title, body, read_at, created_at
                 FROM notifications
                 WHERE user_id IS NULL OR user_id = :user
                 ORDER BY id DESC LIMIT 300'
            );
            $stmt->execute(['user' => $userId]);
        }

        return array_map(
            static fn (array $row): array => [
                'id' => (int) $row['id'],
                'user_id' => $row['user_id'] !== null ? (int) $row['user_id'] : null,
                'level' => (string) $row['level'],
                'title' => (string) $row['title'],
                'body' => (string) $row['body'],
                'read_at' => $row['read_at'] !== null ? (string) $row['read_at'] : null,
                'created_at' => (string) $row['created_at'],
            ],
            $stmt->fetchAll()
        );
    }

    public static function markNotificationRead(PDO $db, int $userId, int $notificationId): bool
    {
        $stmt = $db->prepare(
            'UPDATE notifications SET read_at = NOW()
             WHERE id = :id AND (user_id IS NULL OR user_id = :user)'
        );
        $stmt->execute(['id' => $notificationId, 'user' => $userId]);

        return $stmt->rowCount() > 0;
    }

    public static function notify(
        PDO $db,
        ?int $userId,
        string $level,
        string $title,
        string $body
    ): void {
        if (!in_array($level, ['info', 'warning', 'error', 'success'], true)) {
            $level = 'info';
        }

        $db->prepare(
            'INSERT INTO notifications (user_id, level, title, body)
             VALUES (:user_id, :level, :title, :body)'
        )->execute([
            'user_id' => $userId,
            'level' => $level,
            'title' => mb_substr(trim($title), 0, 190),
            'body' => trim($body),
        ]);
    }

    /** @return list<array<string,mixed>> */
    public static function exportJobs(PDO $db, ?int $userId = null): array
    {
        $sql =
            'SELECT id, user_id, project_id, job_type, status, payload_json, result_json, error_message, created_at, updated_at
             FROM export_jobs';
        $params = [];

        if ($userId !== null) {
            $sql .= ' WHERE user_id = :user';
            $params['user'] = $userId;
        }

        $sql .= ' ORDER BY created_at DESC LIMIT 300';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        return array_map(
            static fn (array $row): array => [
                'id' => (string) $row['id'],
                'user_id' => (int) $row['user_id'],
                'project_id' => $row['project_id'] !== null ? (string) $row['project_id'] : null,
                'job_type' => (string) $row['job_type'],
                'status' => (string) $row['status'],
                'payload' => $row['payload_json'] ? json_decode((string) $row['payload_json'], true) : null,
                'result' => $row['result_json'] ? json_decode((string) $row['result_json'], true) : null,
                'error_message' => $row['error_message'] !== null ? (string) $row['error_message'] : null,
                'created_at' => (string) $row['created_at'],
                'updated_at' => (string) $row['updated_at'],
            ],
            $stmt->fetchAll()
        );
    }

    /** @param array<string,mixed> $payload */
    public static function createExportJob(
        PDO $db,
        int $userId,
        ?string $projectId,
        string $jobType,
        array $payload = []
    ): array {
        $id = self::uuidV4();

        $db->prepare(
            'INSERT INTO export_jobs
             (id, user_id, project_id, job_type, payload_json)
             VALUES (:id, :user, :project, :job_type, :payload)'
        )->execute([
            'id' => $id,
            'user' => $userId,
            'project' => $projectId,
            'job_type' => mb_substr(trim($jobType) ?: 'export', 0, 80),
            'payload' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);

        foreach (self::exportJobs($db, $userId) as $job) {
            if ($job['id'] === $id) return $job;
        }

        throw new RuntimeException('Export job could not be created.');
    }

    /**
     * @param array<string,mixed>|null $result
     */
    public static function updateExportJob(
        PDO $db,
        int $userId,
        string $jobId,
        string $status,
        ?array $result = null,
        ?string $errorMessage = null,
        bool $admin = false
    ): ?array {
        if (!in_array($status, ['queued', 'running', 'completed', 'failed', 'cancelled'], true)) {
            throw new RuntimeException('Invalid export job status.');
        }

        $sql =
            'UPDATE export_jobs
             SET status = :status,
                 result_json = :result_json,
                 error_message = :error_message,
                 updated_at = NOW()
             WHERE id = :id';
        $params = [
            'status' => $status,
            'result_json' => $result !== null
                ? json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                : null,
            'error_message' => $errorMessage !== null
                ? mb_substr($errorMessage, 0, 4000)
                : null,
            'id' => $jobId,
        ];

        if (!$admin) {
            $sql .= ' AND user_id = :user_id';
            $params['user_id'] = $userId;
        }

        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        $lookup = $db->prepare(
            'SELECT id, user_id, project_id, job_type, status, payload_json, result_json, error_message, created_at, updated_at
             FROM export_jobs
             WHERE id = :id' . ($admin ? '' : ' AND user_id = :user_id') . '
             LIMIT 1'
        );
        $lookupParams = ['id' => $jobId];
        if (!$admin) $lookupParams['user_id'] = $userId;
        $lookup->execute($lookupParams);
        $row = $lookup->fetch();

        if (!$row) return null;

        self::log(
            $db,
            $userId,
            'export.' . $status,
            'export_job',
            $jobId,
            $result ?? ($errorMessage !== null ? ['error' => $errorMessage] : null)
        );

        return [
            'id' => (string) $row['id'],
            'user_id' => (int) $row['user_id'],
            'project_id' => $row['project_id'] !== null ? (string) $row['project_id'] : null,
            'job_type' => (string) $row['job_type'],
            'status' => (string) $row['status'],
            'payload' => $row['payload_json'] ? json_decode((string) $row['payload_json'], true) : null,
            'result' => $row['result_json'] ? json_decode((string) $row['result_json'], true) : null,
            'error_message' => $row['error_message'] !== null ? (string) $row['error_message'] : null,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    /** @param array<string,mixed> $actor */
    public static function repair(PDO $db, array $actor, string $action): array
    {
        self::requireAdmin($actor);

        $result = ['action' => $action, 'changed' => 0];

        if ($action === 'purge-expired-locks') {
            $result['changed'] = $db->exec('DELETE FROM project_locks WHERE expires_at <= NOW()');
        } elseif ($action === 'purge-expired-pairing-codes') {
            $result['changed'] = $db->exec(
                'DELETE FROM pairing_codes WHERE used_at IS NOT NULL OR expires_at <= NOW()'
            );
        } elseif ($action === 'ensure-storage') {
            $path = rtrim(
                (string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'),
                '/\\'
            );

            if (!is_dir($path)) {
                if (!mkdir($path, 0750, true) && !is_dir($path)) {
                    throw new RuntimeException('Could not create storage directory.');
                }
                $result['changed'] = 1;
            }

            $result['path'] = $path;
            $result['writable'] = is_writable($path);
        } elseif ($action === 'purge-old-recycle') {
            $days = (int) (self::getSettings($db)['recycle_retention_days'] ?? 30);
            $cutoff = date('Y-m-d H:i:s', time() - $days * 86400);
            $result['changed_projects'] = $db->prepare(
                'DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff'
            )->execute(['cutoff' => $cutoff]) ? 1 : 0;
            $result['note'] = 'Asset binaries require explicit recycle purge so linked/share dependencies are handled safely.';
        } else {
            throw new RuntimeException('Unsupported repair action.');
        }

        self::log($db, (int) $actor['id'], 'repair.' . $action, 'server', 'global', $result);
        return $result;
    }

    /**
     * @param mixed $details
     */
    public static function log(
        PDO $db,
        ?int $userId,
        string $action,
        ?string $subjectType = null,
        ?string $subjectId = null,
        mixed $details = null
    ): void {
        $db->prepare(
            'INSERT INTO activity_logs
             (user_id, action, subject_type, subject_id, details_json)
             VALUES (:user_id, :action, :subject_type, :subject_id, :details)'
        )->execute([
            'user_id' => $userId,
            'action' => mb_substr($action, 0, 120),
            'subject_type' => $subjectType !== null ? mb_substr($subjectType, 0, 80) : null,
            'subject_id' => $subjectId !== null ? mb_substr($subjectId, 0, 190) : null,
            'details' => $details !== null
                ? json_encode($details, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                : null,
        ]);
    }

    private static function uuidV4(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        $hex = bin2hex($data);

        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12)
        );
    }
}
