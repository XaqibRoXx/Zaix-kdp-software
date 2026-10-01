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

$backup = BackupService::create($db, 1);
$backupIdStmt = $db->prepare('SELECT id FROM backups WHERE file_name = :file_name LIMIT 1');
$backupIdStmt->execute(['file_name' => $backup['file_name']]);
$backupId = (int) $backupIdStmt->fetchColumn();

assertQa($backupId > 0, 'Backup row was not recorded.');
assertQa(is_file((string) $backup['path']), 'Backup archive was not created.');

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
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
