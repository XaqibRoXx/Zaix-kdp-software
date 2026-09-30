<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;
use RuntimeException;

final class AssetStorage
{
    /**
     * @param array{name:string,type:string,tmp_name:string,error:int,size:int} $file
     * @return array<string,mixed>
     */
    public static function storeUpload(PDO $db, int $userId, ?string $projectId, array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Upload failed with code ' . (int) ($file['error'] ?? -1) . '.');
        }

        $size = (int) ($file['size'] ?? 0);
        $maxMb = max(1, (int) (Config::env('MAX_UPLOAD_MB', '100') ?? '100'));

        if ($size <= 0 || $size > $maxMb * 1024 * 1024) {
            throw new RuntimeException('File exceeds the configured upload size limit.');
        }

        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_file($tmp)) {
            throw new RuntimeException('Temporary upload file is missing.');
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($tmp);

        $extensions = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'application/pdf' => 'pdf',
            'font/ttf' => 'ttf',
            'font/otf' => 'otf',
            'font/woff' => 'woff',
            'font/woff2' => 'woff2',
            'application/font-sfnt' => 'ttf',
        ];

        if (!isset($extensions[$mime])) {
            throw new RuntimeException('Unsupported asset type: ' . $mime);
        }

        $sha256 = hash_file('sha256', $tmp);
        if ($sha256 === false) {
            throw new RuntimeException('Could not hash uploaded asset.');
        }

        $existingStmt = $db->prepare(
            'SELECT id, project_id, original_name, mime_type, size_bytes, sha256, storage_key, created_at
             FROM assets
             WHERE owner_user_id = :owner AND sha256 = :sha AND deleted_at IS NULL
             LIMIT 1'
        );
        $existingStmt->execute(['owner' => $userId, 'sha' => $sha256]);
        $existing = $existingStmt->fetch();

        if ($existing) {
            return self::decorateAsset($db, $existing);
        }

        $assetId = self::uuidV4();
        $storageRoot = rtrim((string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'), '/\\');
        $folder = 'assets/' . $userId . '/' . substr($assetId, 0, 2);
        $absoluteFolder = $storageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);

        if (!is_dir($absoluteFolder) && !mkdir($absoluteFolder, 0750, true) && !is_dir($absoluteFolder)) {
            throw new RuntimeException('Could not create cloud asset directory.');
        }

        $extension = $extensions[$mime];
        $storageKey = $folder . '/' . $assetId . '.' . $extension;
        $absolutePath = $storageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $storageKey);

        if (!move_uploaded_file($tmp, $absolutePath)) {
            if (!copy($tmp, $absolutePath)) {
                throw new RuntimeException('Could not move asset into cloud storage.');
            }
        }

        $originalName = trim((string) ($file['name'] ?? 'asset.' . $extension));
        if ($originalName === '') {
            $originalName = 'asset.' . $extension;
        }

        $db->prepare(
            'INSERT INTO assets
             (id, owner_user_id, project_id, original_name, mime_type, size_bytes, sha256, storage_key)
             VALUES (:id, :owner, :project_id, :original_name, :mime_type, :size_bytes, :sha256, :storage_key)'
        )->execute([
            'id' => $assetId,
            'owner' => $userId,
            'project_id' => $projectId,
            'original_name' => mb_substr($originalName, 0, 255),
            'mime_type' => $mime,
            'size_bytes' => filesize($absolutePath) ?: $size,
            'sha256' => $sha256,
            'storage_key' => $storageKey,
        ]);

        self::createImageProxy($db, $assetId, $absolutePath, $mime, $storageRoot, $folder);

        $stmt = $db->prepare(
            'SELECT id, project_id, original_name, mime_type, size_bytes, sha256, storage_key, created_at
             FROM assets WHERE id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $assetId]);
        $asset = $stmt->fetch();

        if (!$asset) {
            throw new RuntimeException('Stored asset could not be reloaded.');
        }

        return self::decorateAsset($db, $asset);
    }

    /** @param array<string,mixed> $asset */
    public static function decorateAsset(PDO $db, array $asset): array
    {
        $variantStmt = $db->prepare(
            'SELECT variant_type, mime_type, width_px, height_px, size_bytes, storage_key
             FROM asset_variants
             WHERE asset_id = :asset_id
             ORDER BY variant_type'
        );
        $variantStmt->execute(['asset_id' => $asset['id']]);
        $variants = [];

        foreach ($variantStmt->fetchAll() as $variant) {
            $variants[$variant['variant_type']] = [
                'mime_type' => $variant['mime_type'],
                'width_px' => $variant['width_px'] !== null ? (int) $variant['width_px'] : null,
                'height_px' => $variant['height_px'] !== null ? (int) $variant['height_px'] : null,
                'size_bytes' => (int) $variant['size_bytes'],
            ];
        }

        return [
            'id' => (string) $asset['id'],
            'project_id' => $asset['project_id'] !== null ? (string) $asset['project_id'] : null,
            'original_name' => (string) $asset['original_name'],
            'mime_type' => (string) $asset['mime_type'],
            'size_bytes' => (int) $asset['size_bytes'],
            'sha256' => (string) $asset['sha256'],
            'created_at' => (string) $asset['created_at'],
            'variants' => $variants,
        ];
    }

    /** @return array{path:string,mime_type:string,original_name:string}|null */
    public static function resolveContent(PDO $db, int $userId, string $assetId, string $variant): ?array
    {
        $assetStmt = $db->prepare(
            'SELECT id, original_name, mime_type, storage_key
             FROM assets
             WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
             LIMIT 1'
        );
        $assetStmt->execute(['id' => $assetId, 'owner' => $userId]);
        $asset = $assetStmt->fetch();

        if (!$asset) {
            return null;
        }

        $storageKey = (string) $asset['storage_key'];
        $mime = (string) $asset['mime_type'];

        if ($variant === 'proxy') {
            $variantStmt = $db->prepare(
                'SELECT mime_type, storage_key
                 FROM asset_variants
                 WHERE asset_id = :asset_id AND variant_type = :variant
                 LIMIT 1'
            );
            $variantStmt->execute(['asset_id' => $assetId, 'variant' => 'proxy']);
            $proxy = $variantStmt->fetch();

            if ($proxy) {
                $storageKey = (string) $proxy['storage_key'];
                $mime = (string) $proxy['mime_type'];
            }
        }

        $storageRoot = rtrim((string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'), '/\\');
        $path = $storageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $storageKey);

        if (!is_file($path)) {
            return null;
        }

        return [
            'path' => $path,
            'mime_type' => $mime,
            'original_name' => (string) $asset['original_name'],
        ];
    }

    private static function createImageProxy(
        PDO $db,
        string $assetId,
        string $sourcePath,
        string $mime,
        string $storageRoot,
        string $folder
    ): void {
        if (!extension_loaded('gd') || !in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return;
        }

        $info = @getimagesize($sourcePath);
        if (!$info || empty($info[0]) || empty($info[1])) {
            return;
        }

        [$width, $height] = [(int) $info[0], (int) $info[1]];
        $maxEdge = 1600;
        $ratio = min(1, $maxEdge / max($width, $height));
        $targetWidth = max(1, (int) round($width * $ratio));
        $targetHeight = max(1, (int) round($height * $ratio));

        $source = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($sourcePath),
            'image/png' => @imagecreatefrompng($sourcePath),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($sourcePath) : false,
            default => false,
        };

        if (!$source) {
            return;
        }

        $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
        if (!$canvas) {
            imagedestroy($source);
            return;
        }

        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
        imagefilledrectangle($canvas, 0, 0, $targetWidth, $targetHeight, $transparent);

        imagecopyresampled(
            $canvas,
            $source,
            0,
            0,
            0,
            0,
            $targetWidth,
            $targetHeight,
            $width,
            $height
        );

        $proxyKey = $folder . '/' . $assetId . '-proxy.webp';
        $proxyPath = $storageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $proxyKey);

        $saved = function_exists('imagewebp')
            ? @imagewebp($canvas, $proxyPath, 82)
            : false;

        imagedestroy($canvas);
        imagedestroy($source);

        if (!$saved || !is_file($proxyPath)) {
            return;
        }

        $db->prepare(
            'INSERT INTO asset_variants
             (asset_id, variant_type, mime_type, width_px, height_px, size_bytes, storage_key)
             VALUES (:asset_id, :variant_type, :mime_type, :width_px, :height_px, :size_bytes, :storage_key)
             ON DUPLICATE KEY UPDATE
               mime_type = VALUES(mime_type),
               width_px = VALUES(width_px),
               height_px = VALUES(height_px),
               size_bytes = VALUES(size_bytes),
               storage_key = VALUES(storage_key)'
        )->execute([
            'asset_id' => $assetId,
            'variant_type' => 'proxy',
            'mime_type' => 'image/webp',
            'width_px' => $targetWidth,
            'height_px' => $targetHeight,
            'size_bytes' => filesize($proxyPath) ?: 0,
            'storage_key' => $proxyKey,
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
