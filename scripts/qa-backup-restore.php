<?php

declare(strict_types=1);

require __DIR__ . '/../apps/server/src/Config.php';
require __DIR__ . '/../apps/server/src/Database.php';
require __DIR__ . '/../apps/server/src/AdminService.php';
require __DIR__ . '/../apps/server/src/BackupService.php';

use ZaxisKdp\BackupService;
use ZaxisKdp\Database;

function assertQa(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$db = Database::connection();

$db->exec(
    "INSERT INTO users (id, email, name, role, storage_quota_bytes)
     VALUES (1, 'owner@example.test', 'Phase4 Owner', 'owner', 5368709120)"
);

$db->exec(
    "INSERT INTO projects
     (id, owner_user_id, name, mode, current_revision)
     VALUES
     ('11111111-1111-4111-8111-111111111111', 1, 'Restore Baseline', 'kdp', 1)"
);

$snapshot = json_encode([
    'id' => '11111111-1111-4111-8111-111111111111',
    'name' => 'Restore Baseline',
    'mode' => 'kdp',
    'artboards' => [],
], JSON_UNESCAPED_SLASHES);

assertQa(is_string($snapshot), 'Could not encode test snapshot.');

$stmt = $db->prepare(
    "INSERT INTO project_snapshots
     (project_id, revision_number, label, snapshot_json, snapshot_hash, created_by)
     VALUES
     ('11111111-1111-4111-8111-111111111111', 1, 'Baseline', :snapshot, :hash, 1)"
);
$stmt->execute([
    'snapshot' => $snapshot,
    'hash' => hash('sha256', $snapshot),
]);

$db->exec(
    "INSERT INTO project_locks
     (project_id, user_id, client_id, client_name, expires_at)
     VALUES
     ('11111111-1111-4111-8111-111111111111', 1, 'phase4-client', 'Phase 4 QA', DATE_ADD(NOW(), INTERVAL 1 HOUR))"
);

$db->exec(
    "INSERT INTO api_tokens
     (user_id, name, token_hash)
     VALUES (1, 'Before Backup', REPEAT('a', 64))"
);

$db->exec(
    "INSERT INTO pairing_codes
     (user_id, code_hash, expires_at)
     VALUES (1, REPEAT('b', 64), DATE_ADD(NOW(), INTERVAL 1 HOUR))"
);

$storageRoot = rtrim((string) getenv('STORAGE_PATH'), '/\\');
$assetKey = 'assets/phase4/original.txt';
$variantKey = 'assets/phase4/proxy.txt';
$assetPath = $storageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $assetKey);
$variantPath = $storageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $variantKey);

if (!is_dir(dirname($assetPath)) && !mkdir(dirname($assetPath), 0750, true) && !is_dir(dirname($assetPath))) {
    throw new RuntimeException('Could not create Phase 4 asset fixture directory.');
}

$assetBytes = "phase4-original-asset\n";
$variantBytes = "phase4-proxy-asset\n";
file_put_contents($assetPath, $assetBytes);
file_put_contents($variantPath, $variantBytes);

$assetStmt = $db->prepare(
    "INSERT INTO assets
     (id, owner_user_id, project_id, original_name, mime_type, size_bytes, sha256, storage_key)
     VALUES
     ('22222222-2222-4222-8222-222222222222', 1, '11111111-1111-4111-8111-111111111111',
      'original.txt', 'text/plain', :size, :sha, :storage_key)"
);
$assetStmt->execute([
    'size' => strlen($assetBytes),
    'sha' => hash('sha256', $assetBytes),
    'storage_key' => $assetKey,
]);

$variantStmt = $db->prepare(
    "INSERT INTO asset_variants
     (asset_id, variant_type, mime_type, size_bytes, storage_key)
     VALUES
     ('22222222-2222-4222-8222-222222222222', 'proxy', 'text/plain', :size, :storage_key)"
);
$variantStmt->execute([
    'size' => strlen($variantBytes),
    'storage_key' => $variantKey,
]);

$db->exec(
    "INSERT INTO server_settings (setting_key, setting_value, updated_by)
     VALUES ('backup_include_assets', 'true', 1)"
);

$backup = BackupService::create($db, 1);
$backupIdStmt = $db->prepare('SELECT id FROM backups WHERE file_name = :file_name LIMIT 1');
$backupIdStmt->execute(['file_name' => $backup['file_name']]);
$backupId = (int) $backupIdStmt->fetchColumn();

assertQa($backupId > 0, 'Backup row was not recorded.');
assertQa(is_file((string) $backup['path']), 'Backup archive was not created.');

$recoveryRoot = (string) (getenv('RUNNER_TEMP') ?: sys_get_temp_dir());
$externalRecoveryPath = rtrim($recoveryRoot, '/\\') . DIRECTORY_SEPARATOR . 'zaxis-kdp-clean-recovery.zip';
if (!copy((string) $backup['path'], $externalRecoveryPath)) {
    throw new RuntimeException('Could not stage external clean-recovery archive.');
}
assertQa(is_file($externalRecoveryPath), 'External clean-recovery archive was not staged.');

$db->exec(
    "UPDATE projects
     SET name = 'Mutated After Backup', current_revision = 99
     WHERE id = '11111111-1111-4111-8111-111111111111'"
);

$db->exec(
    "INSERT INTO users (id, email, name, role)
     VALUES (2, 'temporary@example.test', 'Temporary User', 'editor')"
);

$db->exec(
    "INSERT INTO api_tokens
     (user_id, name, token_hash)
     VALUES (2, 'Temporary Token', REPEAT('c', 64))"
);

// Prove that restore repairs binary storage, not only database rows.
file_put_contents($assetPath, "corrupted-after-backup\n");
@unlink($variantPath);

$result = BackupService::restore($db, $backupId, 1);

$project = $db->query(
    "SELECT name, current_revision
     FROM projects
     WHERE id = '11111111-1111-4111-8111-111111111111'"
)->fetch();

assertQa(is_array($project), 'Restored project is missing.');
assertQa((string) $project['name'] === 'Restore Baseline', 'Project name was not restored.');
assertQa((int) $project['current_revision'] === 1, 'Project revision was not restored.');

$userCount = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
assertQa($userCount === 1, 'Unexpected user count after restore.');
assertQa(
    (int) $db->query("SELECT COUNT(*) FROM users WHERE email = 'temporary@example.test'")->fetchColumn() === 0,
    'Temporary user survived restore.'
);

assertQa(
    (int) $db->query('SELECT COUNT(*) FROM api_tokens')->fetchColumn() === 0,
    'API tokens must be invalidated by restore.'
);
assertQa(
    (int) $db->query('SELECT COUNT(*) FROM pairing_codes')->fetchColumn() === 0,
    'Pairing codes must be invalidated by restore.'
);
assertQa(
    (int) $db->query('SELECT COUNT(*) FROM project_locks')->fetchColumn() === 0,
    'Project locks must not be resurrected by restore.'
);

assertQa(is_file($assetPath), 'Original asset file was not restored.');
assertQa(is_file($variantPath), 'Proxy asset file was not restored.');
assertQa(file_get_contents($assetPath) === $assetBytes, 'Original asset bytes were not restored exactly.');
assertQa(file_get_contents($variantPath) === $variantBytes, 'Proxy asset bytes were not restored exactly.');
assertQa(
    hash_file('sha256', $assetPath) === hash('sha256', $assetBytes),
    'Restored original asset SHA-256 does not match backup source.'
);
assertQa(
    (int) $db->query("SELECT COUNT(*) FROM assets WHERE id = '22222222-2222-4222-8222-222222222222'")->fetchColumn() === 1,
    'Asset database row was not restored.'
);
assertQa(
    (int) $db->query("SELECT COUNT(*) FROM asset_variants WHERE asset_id = '22222222-2222-4222-8222-222222222222'")->fetchColumn() === 1,
    'Asset variant database row was not restored.'
);
assertQa(
    (bool) ($result['assets_restored'] ?? false),
    'Restore did not report asset binary restoration.'
);

assertQa(
    isset($result['safety_backup']['path']) && is_file((string) $result['safety_backup']['path']),
    'Pre-restore safety backup was not created.'
);
assertQa(
    (bool) ($result['reauth_required'] ?? false),
    'Restore must require reauthentication.'
);
assertQa(
    (int) $db->query("SELECT COUNT(*) FROM activity_logs WHERE action = 'backup.restored'")->fetchColumn() === 1,
    'Restore audit log was not written.'
);

echo json_encode([
    'ok' => true,
    'restored_backup' => $result['file_name'] ?? null,
    'safety_backup' => $result['safety_backup']['file_name'] ?? null,
    'users' => $userCount,
    'tokens_after_restore' => 0,
    'locks_after_restore' => 0,
    'asset_sha256' => hash_file('sha256', $assetPath),
    'asset_variant_restored' => is_file($variantPath),
    'external_recovery_archive' => $externalRecoveryPath,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
