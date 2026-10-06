<?php

declare(strict_types=1);

use ZaxisKdp\BackupService;
use ZaxisKdp\Database;

require dirname(__DIR__) . '/vendor/autoload.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This recovery command can only run from PHP CLI.\n");
    exit(2);
}

$args = array_values(array_slice($argv, 1));
$confirmed = in_array('--yes', $args, true);
$paths = array_values(array_filter(
    $args,
    static fn (string $arg): bool => $arg !== '--yes'
));

if (count($paths) !== 1) {
    fwrite(
        STDERR,
        "Usage: php bin/restore-backup.php /absolute/path/to/zaxis-kdp-backup.zip --yes\n"
    );
    exit(2);
}

if (!$confirmed) {
    fwrite(
        STDERR,
        "Refusing destructive restore without --yes. A safety backup is created first, but current cloud tokens will be invalidated.\n"
    );
    exit(2);
}

$inputPath = $paths[0];
$realPath = realpath($inputPath);

if ($realPath === false || !is_file($realPath) || !is_readable($realPath)) {
    fwrite(STDERR, "Backup archive is missing or unreadable: " . $inputPath . "\n");
    exit(2);
}

if (strtolower((string) pathinfo($realPath, PATHINFO_EXTENSION)) !== 'zip') {
    fwrite(STDERR, "Backup archive must be a .zip file.\n");
    exit(2);
}

try {
    $db = Database::connection();

    // This command is designed for both disaster recovery and deliberate local restores.
    // It imports the external archive into backup history first so the normal validated
    // restore engine is the single source of truth for destructive restore behavior.
    $stmt = $db->prepare(
        'INSERT INTO backups
         (file_name, storage_path, secondary_path, size_bytes, status, created_by)
         VALUES (:file_name, :storage_path, NULL, :size_bytes, "completed", NULL)'
    );
    $stmt->execute([
        'file_name' => basename($realPath),
        'storage_path' => $realPath,
        'size_bytes' => filesize($realPath) ?: 0,
    ]);

    $backupId = (int) $db->lastInsertId();
    if ($backupId <= 0) {
        throw new RuntimeException('Could not register external backup archive.');
    }

    $result = BackupService::restore($db, $backupId, null);

    fwrite(
        STDOUT,
        json_encode(
            [
                'ok' => true,
                'backup_id' => $backupId,
                'restored_archive' => $result['file_name'] ?? basename($realPath),
                'safety_backup' => $result['safety_backup']['file_name'] ?? null,
                'assets_restored' => (bool) ($result['assets_restored'] ?? false),
                'reauth_required' => true,
                'message' => 'Restore complete. Generate new one-time connection codes for Windows devices.',
            ],
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
        ) . PHP_EOL
    );
    exit(0);
} catch (Throwable $error) {
    fwrite(STDERR, "Restore failed: " . $error->getMessage() . "\n");
    exit(1);
}
