<?php

declare(strict_types=1);

require __DIR__ . '/../apps/server/src/Config.php';
require __DIR__ . '/../apps/server/src/Database.php';

use ZaxisKdp\Database;

function assertRecovery(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$db = Database::connection();

$project = $db->query(
    "SELECT name, current_revision
     FROM projects
     WHERE id = '11111111-1111-4111-8111-111111111111'"
)->fetch();

assertRecovery(is_array($project), 'Clean recovery project is missing.');
assertRecovery((string) $project['name'] === 'Restore Baseline', 'Clean recovery project name mismatch.');
assertRecovery((int) $project['current_revision'] === 1, 'Clean recovery revision mismatch.');

assertRecovery(
    (int) $db->query("SELECT COUNT(*) FROM users WHERE email = 'owner@example.test'")->fetchColumn() === 1,
    'Clean recovery owner is missing.'
);
assertRecovery(
    (int) $db->query('SELECT COUNT(*) FROM api_tokens')->fetchColumn() === 0,
    'Clean recovery must not resurrect API tokens.'
);
assertRecovery(
    (int) $db->query('SELECT COUNT(*) FROM pairing_codes')->fetchColumn() === 0,
    'Clean recovery must not resurrect pairing codes.'
);
assertRecovery(
    (int) $db->query('SELECT COUNT(*) FROM project_locks')->fetchColumn() === 0,
    'Clean recovery must not resurrect project locks.'
);

$storageRoot = rtrim((string) getenv('STORAGE_PATH'), '/\\');
$assetPath = $storageRoot . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'phase4' . DIRECTORY_SEPARATOR . 'original.txt';
$variantPath = $storageRoot . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'phase4' . DIRECTORY_SEPARATOR . 'proxy.txt';
$assetBytes = "phase4-original-asset\n";
$variantBytes = "phase4-proxy-asset\n";

assertRecovery(is_file($assetPath), 'Clean recovery original asset is missing.');
assertRecovery(is_file($variantPath), 'Clean recovery proxy asset is missing.');
assertRecovery(file_get_contents($assetPath) === $assetBytes, 'Clean recovery original asset bytes mismatch.');
assertRecovery(file_get_contents($variantPath) === $variantBytes, 'Clean recovery proxy bytes mismatch.');
assertRecovery(
    hash_file('sha256', $assetPath) === hash('sha256', $assetBytes),
    'Clean recovery asset SHA-256 mismatch.'
);

assertRecovery(
    (int) $db->query("SELECT COUNT(*) FROM activity_logs WHERE action = 'backup.restored'")->fetchColumn() >= 1,
    'Clean recovery restore audit log is missing.'
);
assertRecovery(
    (int) $db->query("SELECT COUNT(*) FROM backups WHERE status = 'completed'")->fetchColumn() >= 2,
    'Clean recovery should retain imported archive plus pre-restore safety backup.'
);

echo json_encode([
    'ok' => true,
    'clean_recovery_project' => (string) $project['name'],
    'revision' => (int) $project['current_revision'],
    'asset_sha256' => hash_file('sha256', $assetPath),
    'proxy_restored' => is_file($variantPath),
    'tokens' => 0,
    'locks' => 0,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
