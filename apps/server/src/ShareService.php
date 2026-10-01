<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;
use RuntimeException;

final class ShareService
{
    /** @return array<string,mixed> */
    public static function create(
        PDO $db,
        int $userId,
        string $assetId,
        ?string $projectId,
        string $title,
        ?string $password,
        ?string $expiresAt,
        bool $allowDownload,
        bool $proofMode
    ): array {
        $asset = self::ownedAsset($db, $userId, $assetId);

        if (!$asset) {
            throw new RuntimeException('Asset not found.');
        }

        if ($projectId !== null && $projectId !== '') {
            $project = $db->prepare(
                'SELECT id FROM projects
                 WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
                 LIMIT 1'
            );
            $project->execute(['id' => $projectId, 'owner' => $userId]);

            if (!$project->fetch()) {
                throw new RuntimeException('Project not found.');
            }
        }

        $id = self::uuidV4();
        $slug = self::newSlug($db);
        $cleanTitle = trim($title) !== '' ? trim($title) : (string) $asset['original_name'];
        $passwordHash = $password !== null && trim($password) !== ''
            ? password_hash($password, PASSWORD_DEFAULT)
            : null;

        $stmt = $db->prepare(
            'INSERT INTO share_links
             (id, owner_user_id, project_id, asset_id, slug, title, password_hash, expires_at, allow_download, proof_mode)
             VALUES
             (:id, :owner, :project_id, :asset_id, :slug, :title, :password_hash, :expires_at, :allow_download, :proof_mode)'
        );
        $stmt->execute([
            'id' => $id,
            'owner' => $userId,
            'project_id' => $projectId !== '' ? $projectId : null,
            'asset_id' => $assetId,
            'slug' => $slug,
            'title' => mb_substr($cleanTitle, 0, 255),
            'password_hash' => $passwordHash,
            'expires_at' => self::normalizeExpiry($expiresAt),
            'allow_download' => $allowDownload ? 1 : 0,
            'proof_mode' => $proofMode ? 1 : 0,
        ]);

        return self::getOwned($db, $userId, $id) ?? throw new RuntimeException('Share link could not be created.');
    }

    /** @return list<array<string,mixed>> */
    public static function listOwned(PDO $db, int $userId, ?string $projectId = null): array
    {
        $sql =
            'SELECT s.*,
                    a.original_name,
                    a.mime_type,
                    a.size_bytes,
                    (SELECT COUNT(*) FROM share_events e WHERE e.share_id = s.id AND e.event_type = "view") AS views,
                    (SELECT COUNT(*) FROM share_events e WHERE e.share_id = s.id AND e.event_type = "download") AS downloads,
                    (SELECT COUNT(*) FROM share_comments c WHERE c.share_id = s.id AND c.status = "visible") AS comments
             FROM share_links s
             INNER JOIN assets a ON a.id = s.asset_id
             WHERE s.owner_user_id = :owner';
        $params = ['owner' => $userId];

        if ($projectId !== null && $projectId !== '') {
            $sql .= ' AND s.project_id = :project_id';
            $params['project_id'] = $projectId;
        }

        $sql .= ' ORDER BY s.created_at DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        return array_map(
            static fn (array $row): array => self::decorateOwned($row),
            $stmt->fetchAll()
        );
    }

    /** @return array<string,mixed>|null */
    public static function getOwned(PDO $db, int $userId, string $shareId): ?array
    {
        $stmt = $db->prepare(
            'SELECT s.*,
                    a.original_name,
                    a.mime_type,
                    a.size_bytes,
                    (SELECT COUNT(*) FROM share_events e WHERE e.share_id = s.id AND e.event_type = "view") AS views,
                    (SELECT COUNT(*) FROM share_events e WHERE e.share_id = s.id AND e.event_type = "download") AS downloads,
                    (SELECT COUNT(*) FROM share_comments c WHERE c.share_id = s.id AND c.status = "visible") AS comments
             FROM share_links s
             INNER JOIN assets a ON a.id = s.asset_id
             WHERE s.id = :id AND s.owner_user_id = :owner
             LIMIT 1'
        );
        $stmt->execute(['id' => $shareId, 'owner' => $userId]);
        $row = $stmt->fetch();

        return $row ? self::decorateOwned($row) : null;
    }

    /** @param array<string,mixed> $input */
    public static function updateOwned(PDO $db, int $userId, string $shareId, array $input): ?array
    {
        $share = self::getOwned($db, $userId, $shareId);
        if (!$share) return null;

        $title = array_key_exists('title', $input)
            ? trim((string) $input['title'])
            : (string) $share['title'];

        $expiresAt = array_key_exists('expires_at', $input)
            ? self::normalizeExpiry(
                $input['expires_at'] !== null ? (string) $input['expires_at'] : null
            )
            : $share['expires_at'];

        $allowDownload = array_key_exists('allow_download', $input)
            ? (bool) $input['allow_download']
            : (bool) $share['allow_download'];

        $proofMode = array_key_exists('proof_mode', $input)
            ? (bool) $input['proof_mode']
            : (bool) $share['proof_mode'];

        $passwordHash = $share['password_protected']
            ? self::getPasswordHash($db, $userId, $shareId)
            : null;

        if (array_key_exists('password', $input)) {
            $password = trim((string) ($input['password'] ?? ''));
            $passwordHash = $password === ''
                ? null
                : password_hash($password, PASSWORD_DEFAULT);
        }

        $stmt = $db->prepare(
            'UPDATE share_links
             SET title = :title,
                 password_hash = :password_hash,
                 expires_at = :expires_at,
                 allow_download = :allow_download,
                 proof_mode = :proof_mode
             WHERE id = :id AND owner_user_id = :owner'
        );
        $stmt->execute([
            'title' => $title !== '' ? mb_substr($title, 0, 255) : (string) $share['original_name'],
            'password_hash' => $passwordHash,
            'expires_at' => $expiresAt,
            'allow_download' => $allowDownload ? 1 : 0,
            'proof_mode' => $proofMode ? 1 : 0,
            'id' => $shareId,
            'owner' => $userId,
        ]);

        return self::getOwned($db, $userId, $shareId);
    }

    /** @return array<string,mixed>|null */
    public static function replaceAsset(PDO $db, int $userId, string $shareId, string $assetId): ?array
    {
        if (!self::ownedAsset($db, $userId, $assetId)) {
            throw new RuntimeException('Replacement asset not found.');
        }

        $stmt = $db->prepare(
            'UPDATE share_links
             SET asset_id = :asset_id, replaced_at = NOW()
             WHERE id = :id AND owner_user_id = :owner'
        );
        $stmt->execute([
            'asset_id' => $assetId,
            'id' => $shareId,
            'owner' => $userId,
        ]);

        if ($stmt->rowCount() === 0 && !self::getOwned($db, $userId, $shareId)) {
            return null;
        }

        return self::getOwned($db, $userId, $shareId);
    }

    public static function revoke(PDO $db, int $userId, string $shareId): bool
    {
        $stmt = $db->prepare(
            'UPDATE share_links
             SET revoked_at = COALESCE(revoked_at, NOW())
             WHERE id = :id AND owner_user_id = :owner'
        );
        $stmt->execute(['id' => $shareId, 'owner' => $userId]);

        return $stmt->rowCount() > 0;
    }

    /** @return array<string,mixed>|null */
    public static function publicShare(PDO $db, string $slug): ?array
    {
        $stmt = $db->prepare(
            'SELECT s.*, a.original_name, a.mime_type, a.size_bytes, a.storage_key
             FROM share_links s
             INNER JOIN assets a ON a.id = s.asset_id
             WHERE s.slug = :slug AND a.deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute(['slug' => $slug]);
        $row = $stmt->fetch();

        if (!$row) return null;

        $row['active'] = self::isActive($row);
        $row['password_protected'] = $row['password_hash'] !== null && $row['password_hash'] !== '';
        $row['allow_download'] = (bool) $row['allow_download'];
        $row['proof_mode'] = (bool) $row['proof_mode'];

        return $row;
    }

    /** @param array<string,mixed> $share */
    public static function verifyPassword(array $share, ?string $password): bool
    {
        if (empty($share['password_hash'])) return true;

        return $password !== null &&
            $password !== '' &&
            password_verify($password, (string) $share['password_hash']);
    }

    /** @param array<string,mixed> $share */
    public static function makeAccessToken(array $share, int $ttlSeconds = 3600): string
    {
        $expires = time() + max(60, $ttlSeconds);
        $payload = (string) $share['slug'] . '|' . $expires;
        $secret = (string) Config::env('APP_KEY', 'change-me');
        $signature = hash_hmac('sha256', $payload, $secret);

        return self::base64UrlEncode($payload . '|' . $signature);
    }

    public static function verifyAccessToken(string $slug, ?string $token): bool
    {
        if ($token === null || $token === '') return false;

        $decoded = self::base64UrlDecode($token);
        if ($decoded === null) return false;

        $parts = explode('|', $decoded);
        if (count($parts) !== 3) return false;

        [$tokenSlug, $expires, $signature] = $parts;
        if (!hash_equals($slug, $tokenSlug)) return false;
        if (!ctype_digit($expires) || (int) $expires < time()) return false;

        $payload = $tokenSlug . '|' . $expires;
        $expected = hash_hmac(
            'sha256',
            $payload,
            (string) Config::env('APP_KEY', 'change-me')
        );

        return hash_equals($expected, $signature);
    }

    /** @param array<string,mixed> $share */
    public static function content(array $share): ?array
    {
        if (!self::isActive($share)) return null;

        $root = rtrim(
            (string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'),
            '/\\'
        );
        $path = $root . DIRECTORY_SEPARATOR .
            str_replace('/', DIRECTORY_SEPARATOR, (string) $share['storage_key']);

        if (!is_file($path)) return null;

        return [
            'path' => $path,
            'mime_type' => (string) $share['mime_type'],
            'original_name' => (string) $share['original_name'],
        ];
    }

    /** @param array<string,mixed> $share */
    public static function recordEvent(PDO $db, array $share, string $type): void
    {
        if (!in_array($type, ['view', 'download'], true)) return;

        $secret = (string) Config::env('APP_KEY', 'change-me');
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');

        $stmt = $db->prepare(
            'INSERT INTO share_events
             (share_id, event_type, ip_hash, user_agent_hash)
             VALUES (:share_id, :event_type, :ip_hash, :ua_hash)'
        );
        $stmt->execute([
            'share_id' => $share['id'],
            'event_type' => $type,
            'ip_hash' => $ip !== '' ? hash_hmac('sha256', $ip, $secret) : null,
            'ua_hash' => $ua !== '' ? hash_hmac('sha256', $ua, $secret) : null,
        ]);
    }

    /** @return list<array<string,mixed>> */
    public static function comments(PDO $db, string $shareId): array
    {
        $stmt = $db->prepare(
            'SELECT id, author_name, body, created_at
             FROM share_comments
             WHERE share_id = :share_id AND status = "visible"
             ORDER BY created_at ASC
             LIMIT 500'
        );
        $stmt->execute(['share_id' => $shareId]);

        return array_map(
            static fn (array $row): array => [
                'id' => (int) $row['id'],
                'author_name' => (string) $row['author_name'],
                'body' => (string) $row['body'],
                'created_at' => (string) $row['created_at'],
            ],
            $stmt->fetchAll()
        );
    }

    public static function addComment(
        PDO $db,
        array $share,
        string $authorName,
        string $body
    ): void {
        if (!(bool) $share['proof_mode']) {
            throw new RuntimeException('Proof comments are disabled for this link.');
        }

        $authorName = trim($authorName);
        $body = trim($body);

        if ($authorName === '' || $body === '') {
            throw new RuntimeException('Name and comment are required.');
        }

        if (mb_strlen($authorName) > 120) {
            throw new RuntimeException('Name is too long.');
        }

        if (mb_strlen($body) > 4000) {
            throw new RuntimeException('Comment is too long.');
        }

        $stmt = $db->prepare(
            'INSERT INTO share_comments (share_id, author_name, body)
             VALUES (:share_id, :author_name, :body)'
        );
        $stmt->execute([
            'share_id' => $share['id'],
            'author_name' => $authorName,
            'body' => $body,
        ]);
    }

    /** @param array<string,mixed> $row */
    private static function decorateOwned(array $row): array
    {
        $base = rtrim(
            (string) Config::env(
                'SHARE_BASE_URL',
                (string) Config::env('APP_URL', '')
            ),
            '/'
        );

        return [
            'id' => (string) $row['id'],
            'project_id' => $row['project_id'] !== null ? (string) $row['project_id'] : null,
            'asset_id' => (string) $row['asset_id'],
            'slug' => (string) $row['slug'],
            'url' => $base !== '' ? $base . '/s/' . rawurlencode((string) $row['slug']) : '/s/' . rawurlencode((string) $row['slug']),
            'title' => (string) $row['title'],
            'original_name' => (string) $row['original_name'],
            'mime_type' => (string) $row['mime_type'],
            'size_bytes' => (int) $row['size_bytes'],
            'password_protected' => !empty($row['password_hash']),
            'expires_at' => $row['expires_at'] !== null ? (string) $row['expires_at'] : null,
            'allow_download' => (bool) $row['allow_download'],
            'proof_mode' => (bool) $row['proof_mode'],
            'revoked_at' => $row['revoked_at'] !== null ? (string) $row['revoked_at'] : null,
            'replaced_at' => $row['replaced_at'] !== null ? (string) $row['replaced_at'] : null,
            'active' => self::isActive($row),
            'views' => isset($row['views']) ? (int) $row['views'] : 0,
            'downloads' => isset($row['downloads']) ? (int) $row['downloads'] : 0,
            'comments' => isset($row['comments']) ? (int) $row['comments'] : 0,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    /** @return array<string,mixed>|null */
    private static function ownedAsset(PDO $db, int $userId, string $assetId): ?array
    {
        $stmt = $db->prepare(
            'SELECT id, original_name, mime_type, size_bytes, storage_key
             FROM assets
             WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute(['id' => $assetId, 'owner' => $userId]);
        $asset = $stmt->fetch();

        return $asset ?: null;
    }

    private static function getPasswordHash(PDO $db, int $userId, string $shareId): ?string
    {
        $stmt = $db->prepare(
            'SELECT password_hash FROM share_links
             WHERE id = :id AND owner_user_id = :owner
             LIMIT 1'
        );
        $stmt->execute(['id' => $shareId, 'owner' => $userId]);
        $row = $stmt->fetch();

        return $row && $row['password_hash'] !== null
            ? (string) $row['password_hash']
            : null;
    }

    /** @param array<string,mixed> $row */
    private static function isActive(array $row): bool
    {
        if (!empty($row['revoked_at'])) return false;

        if (!empty($row['expires_at'])) {
            $expires = strtotime((string) $row['expires_at']);
            if ($expires !== false && $expires <= time()) return false;
        }

        return true;
    }

    private static function normalizeExpiry(?string $value): ?string
    {
        if ($value === null || trim($value) === '') return null;

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            throw new RuntimeException('Invalid expiry date.');
        }

        if ($timestamp <= time()) {
            throw new RuntimeException('Expiry must be in the future.');
        }

        return date('Y-m-d H:i:s', $timestamp);
    }

    private static function newSlug(PDO $db): string
    {
        for ($attempt = 0; $attempt < 6; $attempt += 1) {
            $slug = rtrim(strtr(base64_encode(random_bytes(12)), '+/', '-_'), '=');
            $stmt = $db->prepare('SELECT id FROM share_links WHERE slug = :slug LIMIT 1');
            $stmt->execute(['slug' => $slug]);

            if (!$stmt->fetch()) return $slug;
        }

        throw new RuntimeException('Could not generate a unique share URL.');
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

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): ?string
    {
        $padding = strlen($value) % 4;
        if ($padding > 0) {
            $value .= str_repeat('=', 4 - $padding);
        }

        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        return $decoded === false ? null : $decoded;
    }
}
