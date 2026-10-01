<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;

final class Auth
{
    /** @return array{id:int,email:string,name:string,role:string,storage_quota_bytes:int}|null */
    public static function userFromRequest(PDO $db): ?array
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

        if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return null;
        }

        $token = trim($matches[1]);
        if ($token === '') {
            return null;
        }

        $hash = hash('sha256', $token);

        $stmt = $db->prepare(
            'SELECT u.id, u.email, u.name, u.role, u.storage_quota_bytes
             FROM api_tokens t
             INNER JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = :hash
               AND t.revoked_at IS NULL
               AND (t.expires_at IS NULL OR t.expires_at > NOW())
             LIMIT 1'
        );
        $stmt->execute(['hash' => $hash]);
        $user = $stmt->fetch();

        if (!$user) {
            return null;
        }

        $db->prepare('UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = :hash')
            ->execute(['hash' => $hash]);

        return [
            'id' => (int) $user['id'],
            'email' => (string) $user['email'],
            'name' => (string) $user['name'],
            'role' => (string) $user['role'],
            'storage_quota_bytes' => (int) $user['storage_quota_bytes'],
        ];
    }
}
