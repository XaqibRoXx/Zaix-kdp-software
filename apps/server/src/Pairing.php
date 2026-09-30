<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;
use Throwable;

final class Pairing
{
    /** @return array{code:string,expires_at:string} */
    public static function createCode(
        PDO $db,
        int $userId,
        string $label = 'Windows Desktop',
        int $ttlMinutes = 15
    ): array {
        $normalized = strtoupper(bin2hex(random_bytes(6)));
        $display = implode('-', str_split($normalized, 4));
        $hash = hash('sha256', $normalized);
        $expiresAt = date('Y-m-d H:i:s', time() + max(1, $ttlMinutes) * 60);

        $stmt = $db->prepare(
            'INSERT INTO pairing_codes (user_id, code_hash, label, expires_at)
             VALUES (:user_id, :code_hash, :label, :expires_at)'
        );
        $stmt->execute([
            'user_id' => $userId,
            'code_hash' => $hash,
            'label' => trim($label) !== '' ? trim($label) : 'Windows Desktop',
            'expires_at' => $expiresAt,
        ]);

        return [
            'code' => $display,
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * @return array{
     *   token:string,
     *   user:array{id:int,email:string,name:string}
     * }|null
     */
    public static function redeem(PDO $db, string $code): ?array
    {
        $normalized = strtoupper((string) preg_replace('/[^A-F0-9]/i', '', $code));

        if (strlen($normalized) !== 12) {
            return null;
        }

        $hash = hash('sha256', $normalized);
        $db->beginTransaction();

        try {
            $stmt = $db->prepare(
                'SELECT p.id, p.user_id, u.email, u.name
                 FROM pairing_codes p
                 INNER JOIN users u ON u.id = p.user_id
                 WHERE p.code_hash = :hash
                   AND p.used_at IS NULL
                   AND p.expires_at > NOW()
                 LIMIT 1
                 FOR UPDATE'
            );
            $stmt->execute(['hash' => $hash]);
            $row = $stmt->fetch();

            if (!$row) {
                $db->rollBack();
                return null;
            }

            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);

            $db->prepare(
                'INSERT INTO api_tokens (user_id, name, token_hash)
                 VALUES (:user_id, :name, :token_hash)'
            )->execute([
                'user_id' => $row['user_id'],
                'name' => 'Windows Desktop Pairing',
                'token_hash' => $tokenHash,
            ]);

            $db->prepare('UPDATE pairing_codes SET used_at = NOW() WHERE id = :id')
                ->execute(['id' => $row['id']]);

            $db->commit();

            return [
                'token' => $token,
                'user' => [
                    'id' => (int) $row['user_id'],
                    'email' => (string) $row['email'],
                    'name' => (string) $row['name'],
                ],
            ];
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }
    }
}
