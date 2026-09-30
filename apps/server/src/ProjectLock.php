<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;
use Throwable;

final class ProjectLock
{
    /** @return array<string,mixed>|null */
    public static function status(PDO $db, string $projectId): ?array
    {
        self::cleanupExpired($db, $projectId);

        $stmt = $db->prepare(
            'SELECT l.project_id, l.user_id, l.client_id, l.client_name, l.acquired_at, l.expires_at, u.name AS user_name
             FROM project_locks l
             INNER JOIN users u ON u.id = l.user_id
             WHERE l.project_id = :project_id AND l.expires_at > NOW()
             LIMIT 1'
        );
        $stmt->execute(['project_id' => $projectId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @return array{acquired:bool,lock:array<string,mixed>}
     */
    public static function acquire(
        PDO $db,
        string $projectId,
        int $userId,
        string $clientId,
        string $clientName,
        int $ttlSeconds = 120
    ): array {
        $clientId = trim($clientId);
        $clientName = trim($clientName) !== '' ? trim($clientName) : 'Windows Desktop';

        if ($clientId === '') {
            throw new InvalidArgumentException('client_id is required.');
        }

        $ttlSeconds = max(30, min(300, $ttlSeconds));
        $expiresAt = date('Y-m-d H:i:s', time() + $ttlSeconds);

        $db->beginTransaction();

        try {
            $db->prepare(
                'DELETE FROM project_locks
                 WHERE project_id = :project_id AND expires_at <= NOW()'
            )->execute(['project_id' => $projectId]);

            $stmt = $db->prepare(
                'SELECT project_id, user_id, client_id, client_name, acquired_at, expires_at
                 FROM project_locks
                 WHERE project_id = :project_id
                 LIMIT 1
                 FOR UPDATE'
            );
            $stmt->execute(['project_id' => $projectId]);
            $existing = $stmt->fetch();

            if ($existing && (string) $existing['client_id'] !== $clientId) {
                $db->commit();
                return [
                    'acquired' => false,
                    'lock' => $existing,
                ];
            }

            if ($existing) {
                $db->prepare(
                    'UPDATE project_locks
                     SET user_id = :user_id,
                         client_name = :client_name,
                         expires_at = :expires_at
                     WHERE project_id = :project_id'
                )->execute([
                    'user_id' => $userId,
                    'client_name' => $clientName,
                    'expires_at' => $expiresAt,
                    'project_id' => $projectId,
                ]);
            } else {
                $db->prepare(
                    'INSERT INTO project_locks
                     (project_id, user_id, client_id, client_name, expires_at)
                     VALUES (:project_id, :user_id, :client_id, :client_name, :expires_at)'
                )->execute([
                    'project_id' => $projectId,
                    'user_id' => $userId,
                    'client_id' => $clientId,
                    'client_name' => $clientName,
                    'expires_at' => $expiresAt,
                ]);
            }

            $db->commit();

            return [
                'acquired' => true,
                'lock' => [
                    'project_id' => $projectId,
                    'user_id' => $userId,
                    'client_id' => $clientId,
                    'client_name' => $clientName,
                    'expires_at' => $expiresAt,
                ],
            ];
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }
    }

    public static function release(PDO $db, string $projectId, int $userId, string $clientId): bool
    {
        $stmt = $db->prepare(
            'DELETE FROM project_locks
             WHERE project_id = :project_id
               AND user_id = :user_id
               AND client_id = :client_id'
        );
        $stmt->execute([
            'project_id' => $projectId,
            'user_id' => $userId,
            'client_id' => trim($clientId),
        ]);

        return $stmt->rowCount() > 0;
    }

    /** @return array<string,mixed>|null */
    public static function blockingLock(PDO $db, string $projectId, string $clientId): ?array
    {
        $lock = self::status($db, $projectId);

        if (!$lock) {
            return null;
        }

        if (trim($clientId) !== '' && (string) $lock['client_id'] === trim($clientId)) {
            return null;
        }

        return $lock;
    }

    private static function cleanupExpired(PDO $db, string $projectId): void
    {
        $db->prepare(
            'DELETE FROM project_locks
             WHERE project_id = :project_id AND expires_at <= NOW()'
        )->execute(['project_id' => $projectId]);
    }
}
