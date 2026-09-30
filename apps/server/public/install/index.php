<?php

declare(strict_types=1);

$serverRoot = dirname(__DIR__, 2);
$envPath = $serverRoot . '/.env';
$lockPath = $serverRoot . '/install.lock';
$schemaPath = $serverRoot . '/database/schema.sql';

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function cleanEnv(string $value): string
{
    return str_replace(["\r", "\n"], '', trim($value));
}

function renderPage(string $message = '', ?array $result = null): never
{
    $installed = is_file(dirname(__DIR__, 2) . '/install.lock');
    $phpOk = version_compare(PHP_VERSION, '8.2.0', '>=');
    $pdoOk = extension_loaded('pdo_mysql');

    header('Content-Type: text/html; charset=utf-8');
    ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zaxis KDP Server Installer</title>
<style>
body{margin:0;background:#020202;color:#edf5f1;font-family:Arial,sans-serif}
.wrap{max-width:860px;margin:40px auto;padding:0 20px}
.card{border:1px solid #222b27;background:#0a0d0c;border-radius:14px;padding:22px;margin-bottom:16px}
h1,h2{margin:0 0 10px}.brand{color:#00f6ac}.muted{color:#87928d}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
label{display:grid;gap:6px;font-size:13px;color:#a8b2ae}
input{background:#111613;border:1px solid #2a3530;color:#fff;border-radius:8px;padding:10px}
button{background:#00f6ac;color:#020202;border:0;border-radius:8px;padding:11px 16px;font-weight:700;cursor:pointer}
.ok{color:#00f6ac}.bad{color:#ff8585}.code{font-size:28px;letter-spacing:3px;color:#00f6ac;font-weight:800}
@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="brand">ZAXIS KDP</div>
    <h1>Cloud Server Installer</h1>
    <p class="muted">One-time setup for cPanel / PHP 8.2 / MySQL.</p>
    <p>PHP 8.2+: <span class="<?= $phpOk ? 'ok' : 'bad' ?>"><?= $phpOk ? 'OK' : 'Required' ?></span> · PDO MySQL: <span class="<?= $pdoOk ? 'ok' : 'bad' ?>"><?= $pdoOk ? 'OK' : 'Required' ?></span></p>
  </div>

  <?php if ($message !== ''): ?>
  <div class="card"><strong><?= h($message) ?></strong></div>
  <?php endif; ?>

  <?php if ($result): ?>
  <div class="card">
    <h2>Server connected</h2>
    <p>API URL: <strong><?= h($result['app_url']) ?></strong></p>
    <p>Use this one-time connection code in the Windows app within 15 minutes:</p>
    <div class="code"><?= h($result['code']) ?></div>
    <p class="muted">The code can be used only once. The Windows app exchanges it for an API token and stores that token with Windows user-bound encryption.</p>
  </div>
  <?php elseif ($installed): ?>
  <div class="card">
    <h2>Installer locked</h2>
    <p>This server has already been installed. For security, the public installer is disabled.</p>
    <p class="muted">Generate future connection codes from an authenticated Zaxis KDP session.</p>
  </div>
  <?php elseif (!$phpOk || !$pdoOk): ?>
  <div class="card"><p class="bad">Fix the PHP requirements above before installing.</p></div>
  <?php else: ?>
  <form method="post" class="card">
    <h2>Application</h2>
    <div class="grid">
      <label>API URL
        <input name="app_url" required placeholder="https://kdp.example.com">
      </label>
      <label>Share Domain
        <input name="share_url" placeholder="https://files.example.com">
      </label>
      <label>Storage Path
        <input name="storage_path" placeholder="/home/account/zaxis-kdp-storage">
      </label>
    </div>

    <h2 style="margin-top:24px">MySQL</h2>
    <div class="grid">
      <label>DB Host<input name="db_host" value="localhost" required></label>
      <label>DB Port<input name="db_port" value="3306" required></label>
      <label>DB Name<input name="db_name" required></label>
      <label>DB User<input name="db_user" required></label>
      <label>DB Password<input name="db_pass" type="password"></label>
    </div>

    <h2 style="margin-top:24px">First Owner</h2>
    <div class="grid">
      <label>Name<input name="owner_name" required></label>
      <label>Email<input name="owner_email" type="email" required></label>
    </div>

    <p style="margin-top:22px"><button type="submit">Install Zaxis KDP Server</button></p>
  </form>
  <?php endif; ?>
</div>
</body>
</html>
    <?php
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    renderPage();
}

if (is_file($lockPath)) {
    renderPage('Installer is already locked.');
}

$appUrl = rtrim(cleanEnv((string) ($_POST['app_url'] ?? '')), '/');
$shareUrl = rtrim(cleanEnv((string) ($_POST['share_url'] ?? '')), '/');
$storagePath = cleanEnv((string) ($_POST['storage_path'] ?? ''));
$dbHost = cleanEnv((string) ($_POST['db_host'] ?? 'localhost'));
$dbPort = cleanEnv((string) ($_POST['db_port'] ?? '3306'));
$dbName = cleanEnv((string) ($_POST['db_name'] ?? ''));
$dbUser = cleanEnv((string) ($_POST['db_user'] ?? ''));
$dbPass = cleanEnv((string) ($_POST['db_pass'] ?? ''));
$ownerName = cleanEnv((string) ($_POST['owner_name'] ?? ''));
$ownerEmail = strtolower(cleanEnv((string) ($_POST['owner_email'] ?? '')));

if (!preg_match('#^https?://#i', $appUrl)) {
    renderPage('API URL must begin with http:// or https://.');
}

if ($dbName === '' || $dbUser === '' || $ownerName === '' || !filter_var($ownerEmail, FILTER_VALIDATE_EMAIL)) {
    renderPage('Database and owner fields are incomplete.');
}

if ($storagePath === '') {
    $storagePath = $serverRoot . '/storage';
}

try {
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $dbHost, $dbPort, $dbName);
    $db = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $schema = file_get_contents($schemaPath);
    if ($schema === false) {
        throw new RuntimeException('database/schema.sql could not be read.');
    }

    $statements = preg_split('/;\s*(?:\r?\n|$)/', $schema) ?: [];
    foreach ($statements as $statement) {
        $statement = trim($statement);
        if ($statement !== '') {
            $db->exec($statement);
        }
    }

    $stmt = $db->prepare(
        'INSERT INTO users (email, name)
         VALUES (:email, :name)
         ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()'
    );
    $stmt->execute(['email' => $ownerEmail, 'name' => $ownerName]);

    $userStmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $userStmt->execute(['email' => $ownerEmail]);
    $userId = (int) ($userStmt->fetch()['id'] ?? 0);

    if ($userId <= 0) {
        throw new RuntimeException('Could not create the first owner account.');
    }

    $normalizedCode = strtoupper(bin2hex(random_bytes(6)));
    $displayCode = implode('-', str_split($normalizedCode, 4));
    $codeHash = hash('sha256', $normalizedCode);
    $expiresAt = date('Y-m-d H:i:s', time() + 15 * 60);

    $pairStmt = $db->prepare(
        'INSERT INTO pairing_codes (user_id, code_hash, label, expires_at)
         VALUES (:user_id, :code_hash, :label, :expires_at)'
    );
    $pairStmt->execute([
        'user_id' => $userId,
        'code_hash' => $codeHash,
        'label' => 'Initial Windows Desktop',
        'expires_at' => $expiresAt,
    ]);

    if (!is_dir($storagePath) && !mkdir($storagePath, 0750, true) && !is_dir($storagePath)) {
        throw new RuntimeException('Could not create the configured storage directory.');
    }

    $env = implode("\n", [
        'APP_ENV=production',
        'APP_DEBUG=false',
        'APP_URL=' . $appUrl,
        'APP_KEY=' . bin2hex(random_bytes(32)),
        'DB_HOST=' . $dbHost,
        'DB_PORT=' . $dbPort,
        'DB_NAME=' . $dbName,
        'DB_USER=' . $dbUser,
        'DB_PASS=' . $dbPass,
        'ALLOWED_ORIGINS=tauri://localhost,http://tauri.localhost,https://tauri.localhost',
        'STORAGE_PATH=' . $storagePath,
        'SHARE_BASE_URL=' . $shareUrl,
        '',
    ]);

    if (file_put_contents($envPath, $env, LOCK_EX) === false) {
        throw new RuntimeException('Could not write the .env file. Check server folder permissions.');
    }

    @chmod($envPath, 0640);

    if (file_put_contents($lockPath, date(DATE_ATOM) . "\n", LOCK_EX) === false) {
        throw new RuntimeException('Could not create install.lock.');
    }

    renderPage('Installation completed successfully.', [
        'app_url' => $appUrl,
        'code' => $displayCode,
    ]);
} catch (Throwable $error) {
    renderPage('Installation failed: ' . $error->getMessage());
}
