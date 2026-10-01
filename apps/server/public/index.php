<?php

declare(strict_types=1);

use ZaxisKdp\AdminService;
use ZaxisKdp\AssetStorage;
use ZaxisKdp\BackupService;
use ZaxisKdp\Auth;
use ZaxisKdp\Config;
use ZaxisKdp\Database;
use ZaxisKdp\Http;
use ZaxisKdp\ImageWorker;
use ZaxisKdp\Pairing;
use ZaxisKdp\ProjectDelta;
use ZaxisKdp\ProjectLock;
use ZaxisKdp\PublicSharePage;
use ZaxisKdp\ShareService;

require dirname(__DIR__) . '/vendor/autoload.php';

Http::applyCors();

$requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? Http::requestId();
header('X-Request-Id: ' . $requestId);

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . ltrim($path, '/');

try {
    if ($method === 'GET' && $path === '/api/health') {
        $dbOk = false;
        $dbError = null;

        try {
            Database::connection()->query('SELECT 1');
            $dbOk = true;
        } catch (Throwable $error) {
            $dbError = $error->getMessage();
        }

        Http::json([
            'ok' => $dbOk,
            'service' => 'zaxis-kdp-api',
            'version' => '0.1.0',
            'database' => $dbOk ? 'connected' : 'error',
            'database_error' => $dbError,
            'request_id' => $requestId,
        ], $dbOk ? 200 : 503);
    }

    $db = Database::connection();
    $publicFeatures = AdminService::getSettings($db);

    if ($method === 'POST' && $path === '/api/pair') {
        $body = Http::body();
        $code = trim((string) ($body['code'] ?? ''));

        if ($code === '') {
            Http::json([
                'ok' => false,
                'error' => 'Connection code is required.',
                'request_id' => $requestId,
            ], 422);
        }

        $paired = Pairing::redeem($db, $code);

        if (!$paired) {
            Http::json([
                'ok' => false,
                'error' => 'Connection code is invalid, expired, or already used.',
                'request_id' => $requestId,
            ], 422);
        }

        Http::json([
            'ok' => true,
            'token' => $paired['token'],
            'user' => $paired['user'],
            'request_id' => $requestId,
        ]);
    }

    if (preg_match('#^/s/([^/]+)/file$#', $path, $matches) && $method === 'GET') {
        if (!(bool) ($publicFeatures['feature_public_sharing'] ?? true)) {
            http_response_code(404);
            exit('Share links are disabled.');
        }
        $slug = rawurldecode($matches[1]);
        $share = ShareService::publicShare($db, $slug);

        if (!$share || !$share['active']) {
            http_response_code(404);
            exit('Share not found.');
        }

        $access = isset($_GET['access']) ? (string) $_GET['access'] : null;
        if ($share['password_protected'] && !ShareService::verifyAccessToken($slug, $access)) {
            http_response_code(403);
            exit('Access denied.');
        }

        $download = isset($_GET['download']) && $_GET['download'] === '1';
        if ($download && !$share['allow_download']) {
            http_response_code(403);
            exit('Download disabled.');
        }

        $content = ShareService::content($share);
        if (!$content) {
            http_response_code(404);
            exit('File not found.');
        }

        if ($download) {
            ShareService::recordEvent($db, $share, 'download');
        }

        header('Content-Type: ' . $content['mime_type']);
        header('Content-Length: ' . (string) filesize($content['path']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', $content['original_name']) ?: 'file';
        header(
            'Content-Disposition: ' .
            ($download ? 'attachment' : 'inline') .
            '; filename="' . $safeName . '"'
        );
        readfile($content['path']);
        exit;
    }

    if (preg_match('#^/s/([^/]+)/comments$#', $path, $matches) && $method === 'POST') {
        if (!(bool) ($publicFeatures['feature_public_sharing'] ?? true)) {
            http_response_code(404);
            exit('Share links are disabled.');
        }
        if (!(bool) ($publicFeatures['feature_proof_comments'] ?? true)) {
            http_response_code(403);
            exit('Proof comments are disabled.');
        }

        $slug = rawurldecode($matches[1]);
        $share = ShareService::publicShare($db, $slug);

        if (!$share || !$share['active']) {
            http_response_code(404);
            exit('Share not found.');
        }

        $access = isset($_POST['access']) ? (string) $_POST['access'] : null;
        if ($share['password_protected'] && !ShareService::verifyAccessToken($slug, $access)) {
            http_response_code(403);
            exit('Access denied.');
        }

        try {
            ShareService::addComment(
                $db,
                $share,
                (string) ($_POST['author_name'] ?? ''),
                (string) ($_POST['body'] ?? '')
            );
        } catch (RuntimeException $error) {
            http_response_code(422);
            exit($error->getMessage());
        }

        $location = '/s/' . rawurlencode($slug);
        if ($access) {
            $location .= '?access=' . rawurlencode($access);
        }
        header('Location: ' . $location, true, 303);
        exit;
    }

    if (preg_match('#^/s/([^/]+)$#', $path, $matches) && in_array($method, ['GET', 'POST'], true)) {
        if (!(bool) ($publicFeatures['feature_public_sharing'] ?? true)) {
            http_response_code(404);
            exit('Share links are disabled.');
        }
        $slug = rawurldecode($matches[1]);
        $share = ShareService::publicShare($db, $slug);

        if (!$share) {
            http_response_code(404);
            exit('Share not found.');
        }

        $access = isset($_GET['access']) ? (string) $_GET['access'] : null;

        if ($method === 'POST' && $share['password_protected']) {
            $password = (string) ($_POST['password'] ?? '');

            if (ShareService::verifyPassword($share, $password)) {
                $access = ShareService::makeAccessToken($share);
                header(
                    'Location: /s/' . rawurlencode($slug) . '?access=' . rawurlencode($access),
                    true,
                    303
                );
                exit;
            }

            PublicSharePage::render($db, $share, null, 'Incorrect password.');
        }

        if (!(bool) ($publicFeatures['feature_proof_comments'] ?? true)) {
            $share['proof_mode'] = false;
        }

        PublicSharePage::render($db, $share, $access);
    }

    $user = Auth::userFromRequest($db);

    if (!$user) {
        Http::json([
            'ok' => false,
            'error' => 'Unauthorized.',
            'request_id' => $requestId,
        ], 401);
    }

    $reviewerReadException =
        $method === 'POST' &&
        preg_match('#^/api/v1/notifications/\d+/read$#', $path);

    if (
        (string) ($user['role'] ?? '') === 'reviewer' &&
        $method !== 'GET' &&
        !$reviewerReadException
    ) {
        Http::json([
            'ok' => false,
            'error' => 'Reviewer role is read-only.',
            'request_id' => $requestId,
        ], 403);
    }

    if ($method === 'GET' && $path === '/api/v1/me') {
        Http::json([
            'ok' => true,
            'user' => $user,
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'GET' && $path === '/api/v1/diagnostics') {
        $storagePath = rtrim(
            (string) Config::env('STORAGE_PATH', dirname(__DIR__) . '/storage'),
            '/\\'
        );

        if (!is_dir($storagePath)) {
            @mkdir($storagePath, 0750, true);
        }

        $dbOk = false;
        try {
            $db->query('SELECT 1');
            $dbOk = true;
        } catch (Throwable) {
            $dbOk = false;
        }

        $freeBytes = @disk_free_space($storagePath);
        $totalBytes = @disk_total_space($storagePath);
        $storageUsedBytes = (int) $db->query(
            'SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE deleted_at IS NULL'
        )->fetchColumn();
        $userStorageStmt = $db->prepare(
            'SELECT COALESCE(SUM(size_bytes), 0) AS used
             FROM assets
             WHERE owner_user_id = :owner AND deleted_at IS NULL'
        );
        $userStorageStmt->execute(['owner' => $user['id']]);
        $userStorageUsed = (int) ($userStorageStmt->fetch()['used'] ?? 0);
        $backupSummary = $db->query(
            'SELECT COUNT(*) AS backup_count,
                    MAX(CASE WHEN status = "completed" THEN created_at ELSE NULL END) AS last_backup_at
             FROM backups'
        )->fetch() ?: ['backup_count' => 0, 'last_backup_at' => null];

        $serverSettings = AdminService::getSettings($db);
        $workerUrl = trim((string) ($serverSettings['worker_url_override'] ?? ''));
        if ($workerUrl === '') {
            $workerUrl = trim((string) Config::env('WORKER_URL', ''));
        }
        $workerHealthy = null;
        $workerError = null;

        if ($workerUrl !== '' && extension_loaded('curl')) {
            $curl = curl_init(rtrim($workerUrl, '/') . '/health');

            if ($curl !== false) {
                $headers = ['Accept: application/json'];
                $workerToken = trim((string) Config::env('WORKER_TOKEN', ''));
                if ($workerToken !== '') {
                    $headers[] = 'Authorization: Bearer ' . $workerToken;
                }

                curl_setopt_array($curl, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => $headers,
                    CURLOPT_CONNECTTIMEOUT => 3,
                    CURLOPT_TIMEOUT => 6,
                    CURLOPT_FOLLOWLOCATION => false,
                ]);

                $body = curl_exec($curl);
                $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
                $curlError = curl_error($curl);
                curl_close($curl);

                $workerHealthy = $body !== false && $status >= 200 && $status < 300;
                if (!$workerHealthy) {
                    $workerError = $curlError !== ''
                        ? $curlError
                        : 'Worker health returned HTTP ' . $status;
                }
            }
        }

        Http::json([
            'ok' => true,
            'diagnostics' => [
                'php_version' => PHP_VERSION,
                'database' => $dbOk ? 'connected' : 'error',
                'storage_provider' => Config::env('STORAGE_PROVIDER', 'local-cpanel'),
                'storage_path' => $storagePath,
                'storage_exists' => is_dir($storagePath),
                'storage_writable' => is_dir($storagePath) && is_writable($storagePath),
                'storage_free_bytes' => $freeBytes !== false ? (int) $freeBytes : null,
                'storage_total_bytes' => $totalBytes !== false ? (int) $totalBytes : null,
                'storage_used_bytes' => $storageUsedBytes,
                'user_storage_used_bytes' => $userStorageUsed,
                'user_storage_quota_bytes' => (int) ($user['storage_quota_bytes'] ?? 0),
                'share_base_url' => Config::env('SHARE_BASE_URL', ''),
                'worker_url' => $workerUrl,
                'worker_healthy' => $workerHealthy,
                'worker_error' => $workerError,
                'max_upload_mb' => (int) (Config::env('MAX_UPLOAD_MB', '100') ?? '100'),
                'gd_available' => extension_loaded('gd'),
                'pdo_mysql_available' => extension_loaded('pdo_mysql'),
                'curl_available' => extension_loaded('curl'),
                'zip_available' => class_exists(ZipArchive::class),
                'upload_max_filesize' => ini_get('upload_max_filesize') ?: null,
                'post_max_size' => ini_get('post_max_size') ?: null,
                'backup_count' => (int) ($backupSummary['backup_count'] ?? 0),
                'last_backup_at' => $backupSummary['last_backup_at'] !== null
                    ? (string) $backupSummary['last_backup_at']
                    : null,
            ],
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'POST' && $path === '/api/v1/connection-codes') {
        $body = Http::body();
        $label = trim((string) ($body['label'] ?? 'Windows Desktop'));
        $pairing = Pairing::createCode($db, (int) $user['id'], $label, 15);

        Http::json([
            'ok' => true,
            'code' => $pairing['code'],
            'expires_at' => $pairing['expires_at'],
            'request_id' => $requestId,
        ], 201);
    }

    if ($method === 'GET' && $path === '/api/v1/shares') {
        $projectId = isset($_GET['project_id']) ? trim((string) $_GET['project_id']) : null;

        Http::json([
            'ok' => true,
            'shares' => ShareService::listOwned($db, (int) $user['id'], $projectId),
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'POST' && $path === '/api/v1/shares') {
        $shareSettings = AdminService::getSettings($db);
        if (!(bool) ($shareSettings['feature_public_sharing'] ?? true)) {
            Http::json([
                'ok' => false,
                'error' => 'Public sharing is disabled by Admin.',
                'request_id' => $requestId,
            ], 403);
        }

        $body = Http::body();

        try {
            $share = ShareService::create(
                $db,
                (int) $user['id'],
                trim((string) ($body['asset_id'] ?? '')),
                isset($body['project_id']) ? trim((string) $body['project_id']) : null,
                (string) ($body['title'] ?? ''),
                isset($body['password']) ? (string) $body['password'] : null,
                isset($body['expires_at']) && $body['expires_at'] !== null
                    ? (string) $body['expires_at']
                    : null,
                array_key_exists('allow_download', $body)
                    ? (bool) $body['allow_download']
                    : (bool) ($shareSettings['default_share_download'] ?? true),
                (bool) ($shareSettings['feature_proof_comments'] ?? true) &&
                    (array_key_exists('proof_mode', $body)
                        ? (bool) $body['proof_mode']
                        : (bool) ($shareSettings['default_share_proof_mode'] ?? false))
            );
        } catch (RuntimeException $error) {
            Http::json([
                'ok' => false,
                'error' => $error->getMessage(),
                'request_id' => $requestId,
            ], 422);
        }

        Http::json([
            'ok' => true,
            'share' => $share,
            'request_id' => $requestId,
        ], 201);
    }

    if (
        preg_match('#^/api/v1/shares/([^/]+)$#', $path, $matches) &&
        in_array($method, ['PATCH', 'DELETE'], true)
    ) {
        $shareId = rawurldecode($matches[1]);

        if ($method === 'DELETE') {
            Http::json([
                'ok' => true,
                'revoked' => ShareService::revoke($db, (int) $user['id'], $shareId),
                'request_id' => $requestId,
            ]);
        }

        $body = Http::body();

        try {
            $share = ShareService::updateOwned(
                $db,
                (int) $user['id'],
                $shareId,
                $body
            );
        } catch (RuntimeException $error) {
            Http::json([
                'ok' => false,
                'error' => $error->getMessage(),
                'request_id' => $requestId,
            ], 422);
        }

        if (!$share) {
            Http::json([
                'ok' => false,
                'error' => 'Share link not found.',
                'request_id' => $requestId,
            ], 404);
        }

        Http::json([
            'ok' => true,
            'share' => $share,
            'request_id' => $requestId,
        ]);
    }

    if (
        $method === 'POST' &&
        preg_match('#^/api/v1/shares/([^/]+)/replace$#', $path, $matches)
    ) {
        $body = Http::body();
        $shareId = rawurldecode($matches[1]);
        $assetId = trim((string) ($body['asset_id'] ?? ''));

        try {
            $share = ShareService::replaceAsset(
                $db,
                (int) $user['id'],
                $shareId,
                $assetId
            );
        } catch (RuntimeException $error) {
            Http::json([
                'ok' => false,
                'error' => $error->getMessage(),
                'request_id' => $requestId,
            ], 422);
        }

        if (!$share) {
            Http::json([
                'ok' => false,
                'error' => 'Share link not found.',
                'request_id' => $requestId,
            ], 404);
        }

        Http::json([
            'ok' => true,
            'share' => $share,
            'request_id' => $requestId,
        ]);
    }

    if (str_starts_with($path, '/api/v1/admin/')) {
        if (!in_array((string) ($user['role'] ?? ''), ['owner', 'admin'], true)) {
            Http::json([
                'ok' => false,
                'error' => 'Administrator access is required.',
                'request_id' => $requestId,
            ], 403);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/overview') {
            Http::json([
                'ok' => true,
                'overview' => AdminService::overview($db),
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/users') {
            Http::json([
                'ok' => true,
                'users' => AdminService::users($db),
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/admin/users') {
            try {
                $created = AdminService::createUser($db, $user, Http::body());
            } catch (RuntimeException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            Http::json([
                'ok' => true,
                'user' => $created['user'],
                'connection_code' => $created['connection_code'],
                'expires_at' => $created['expires_at'],
                'request_id' => $requestId,
            ], 201);
        }

        if ($method === 'PATCH' && preg_match('#^/api/v1/admin/users/(\d+)$#', $path, $matches)) {
            try {
                $updated = AdminService::updateUser(
                    $db,
                    $user,
                    (int) $matches[1],
                    Http::body()
                );
            } catch (RuntimeException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            if (!$updated) {
                Http::json([
                    'ok' => false,
                    'error' => 'User not found.',
                    'request_id' => $requestId,
                ], 404);
            }

            Http::json([
                'ok' => true,
                'user' => $updated,
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/settings') {
            Http::json([
                'ok' => true,
                'settings' => AdminService::getSettings($db),
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'PATCH' && $path === '/api/v1/admin/settings') {
            try {
                $settings = AdminService::updateSettings($db, $user, Http::body());
            } catch (RuntimeException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            Http::json([
                'ok' => true,
                'settings' => $settings,
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/activity') {
            Http::json([
                'ok' => true,
                'activity' => AdminService::activity($db),
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/recycle-bin') {
            Http::json([
                'ok' => true,
                'recycle_bin' => AdminService::recycleBin($db),
                'request_id' => $requestId,
            ]);
        }

        if (
            $method === 'POST' &&
            preg_match('#^/api/v1/admin/recycle-bin/(project|asset)/([^/]+)/restore$#', $path, $matches)
        ) {
            try {
                $restored = AdminService::restoreRecycle(
                    $db,
                    $user,
                    $matches[1],
                    rawurldecode($matches[2])
                );
            } catch (RuntimeException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            Http::json([
                'ok' => true,
                'restored' => $restored,
                'request_id' => $requestId,
            ]);
        }

        if (
            $method === 'DELETE' &&
            preg_match('#^/api/v1/admin/recycle-bin/(project|asset)/([^/]+)$#', $path, $matches)
        ) {
            try {
                $purged = AdminService::purgeRecycle(
                    $db,
                    $user,
                    $matches[1],
                    rawurldecode($matches[2])
                );
            } catch (RuntimeException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            Http::json([
                'ok' => true,
                'purged' => $purged,
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/notifications') {
            Http::json([
                'ok' => true,
                'notifications' => AdminService::notifications($db),
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/admin/notifications') {
            $body = Http::body();
            AdminService::notify(
                $db,
                isset($body['user_id']) && $body['user_id'] !== null
                    ? (int) $body['user_id']
                    : null,
                (string) ($body['level'] ?? 'info'),
                (string) ($body['title'] ?? 'Notification'),
                (string) ($body['body'] ?? '')
            );
            AdminService::log(
                $db,
                (int) $user['id'],
                'notification.created',
                'notification',
                null,
                ['target_user_id' => $body['user_id'] ?? null]
            );

            Http::json([
                'ok' => true,
                'request_id' => $requestId,
            ], 201);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/export-jobs') {
            Http::json([
                'ok' => true,
                'jobs' => AdminService::exportJobs($db),
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/admin/export-jobs') {
            $body = Http::body();
            $job = AdminService::createExportJob(
                $db,
                isset($body['user_id']) ? (int) $body['user_id'] : (int) $user['id'],
                isset($body['project_id']) && $body['project_id'] !== null
                    ? (string) $body['project_id']
                    : null,
                (string) ($body['job_type'] ?? 'export'),
                isset($body['payload']) && is_array($body['payload'])
                    ? $body['payload']
                    : []
            );

            Http::json([
                'ok' => true,
                'job' => $job,
                'request_id' => $requestId,
            ], 201);
        }

        if ($method === 'GET' && $path === '/api/v1/admin/backups') {
            Http::json([
                'ok' => true,
                'backups' => BackupService::list($db),
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/admin/backups') {
            try {
                $backup = BackupService::create($db, (int) $user['id']);
            } catch (RuntimeException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            Http::json([
                'ok' => true,
                'backup' => $backup,
                'request_id' => $requestId,
            ], 201);
        }

        if ($method === 'POST' && $path === '/api/v1/admin/repair') {
            $body = Http::body();

            try {
                $result = AdminService::repair(
                    $db,
                    $user,
                    (string) ($body['action'] ?? '')
                );
            } catch (RuntimeException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            Http::json([
                'ok' => true,
                'result' => $result,
                'request_id' => $requestId,
            ]);
        }
    }

    if ($method === 'GET' && $path === '/api/v1/notifications') {
        Http::json([
            'ok' => true,
            'notifications' => AdminService::notifications($db, (int) $user['id']),
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'POST' && preg_match('#^/api/v1/notifications/(\d+)/read$#', $path, $matches)) {
        Http::json([
            'ok' => true,
            'read' => AdminService::markNotificationRead(
                $db,
                (int) $user['id'],
                (int) $matches[1]
            ),
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'GET' && $path === '/api/v1/export-jobs') {
        Http::json([
            'ok' => true,
            'jobs' => AdminService::exportJobs($db, (int) $user['id']),
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'POST' && $path === '/api/v1/export-jobs') {
        $body = Http::body();
        $job = AdminService::createExportJob(
            $db,
            (int) $user['id'],
            isset($body['project_id']) && $body['project_id'] !== null
                ? (string) $body['project_id']
                : null,
            (string) ($body['job_type'] ?? 'pdf-export'),
            isset($body['payload']) && is_array($body['payload'])
                ? $body['payload']
                : []
        );

        Http::json([
            'ok' => true,
            'job' => $job,
            'request_id' => $requestId,
        ], 201);
    }

    if (
        $method === 'PATCH' &&
        preg_match('#^/api/v1/export-jobs/([^/]+)$#', $path, $matches)
    ) {
        $body = Http::body();

        try {
            $job = AdminService::updateExportJob(
                $db,
                (int) $user['id'],
                rawurldecode($matches[1]),
                (string) ($body['status'] ?? ''),
                isset($body['result']) && is_array($body['result'])
                    ? $body['result']
                    : null,
                isset($body['error_message']) && $body['error_message'] !== null
                    ? (string) $body['error_message']
                    : null
            );
        } catch (RuntimeException $error) {
            Http::json([
                'ok' => false,
                'error' => $error->getMessage(),
                'request_id' => $requestId,
            ], 422);
        }

        if (!$job) {
            Http::json([
                'ok' => false,
                'error' => 'Export job not found.',
                'request_id' => $requestId,
            ], 404);
        }

        Http::json([
            'ok' => true,
            'job' => $job,
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'GET' && $path === '/api/v1/assets') {
        $projectId = isset($_GET['project_id']) ? trim((string) $_GET['project_id']) : '';

        $sql =
            'SELECT id, project_id, original_name, mime_type, size_bytes, sha256, storage_key, version, source_asset_id, process_kind, created_at, updated_at
             FROM assets
             WHERE owner_user_id = :owner AND deleted_at IS NULL';
        $params = ['owner' => $user['id']];

        if ($projectId !== '') {
            $sql .= ' AND project_id = :project_id';
            $params['project_id'] = $projectId;
        }

        $sql .= ' ORDER BY created_at DESC LIMIT 500';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        $assets = array_map(
            static fn (array $asset): array => AssetStorage::decorateAsset($db, $asset),
            $stmt->fetchAll()
        );

        Http::json([
            'ok' => true,
            'assets' => $assets,
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'POST' && $path === '/api/v1/assets') {
        $projectId = trim((string) ($_POST['project_id'] ?? ''));

        if ($projectId !== '') {
            $projectStmt = $db->prepare(
                'SELECT id FROM projects
                 WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
                 LIMIT 1'
            );
            $projectStmt->execute(['id' => $projectId, 'owner' => $user['id']]);

            if (!$projectStmt->fetch()) {
                Http::json([
                    'ok' => false,
                    'error' => 'Project not found.',
                    'request_id' => $requestId,
                ], 404);
            }
        }

        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            Http::json([
                'ok' => false,
                'error' => 'Multipart file field "file" is required.',
                'request_id' => $requestId,
            ], 422);
        }

        try {
            $asset = AssetStorage::storeUpload(
                $db,
                (int) $user['id'],
                $projectId !== '' ? $projectId : null,
                $_FILES['file']
            );
        } catch (RuntimeException $error) {
            Http::json([
                'ok' => false,
                'error' => $error->getMessage(),
                'request_id' => $requestId,
            ], 422);
        }

        Http::json([
            'ok' => true,
            'asset' => $asset,
            'request_id' => $requestId,
        ], 201);
    }

    if ($method === 'POST' && $path === '/api/v1/assets/background-remove-batch') {
        $features = AdminService::getSettings($db);

        if (!(bool) ($features['feature_background_remove'] ?? true) ||
            !(bool) ($features['feature_batch_processing'] ?? true)
        ) {
            Http::json([
                'ok' => false,
                'error' => 'Batch background removal is disabled by Admin.',
                'request_id' => $requestId,
            ], 403);
        }

        $body = Http::body();
        $workerUrlOverride = trim((string) ($features['worker_url_override'] ?? ''));
        $assetIds = isset($body['asset_ids']) && is_array($body['asset_ids'])
            ? array_values(array_unique(array_filter(array_map('strval', $body['asset_ids']))))
            : [];
        $mode = trim((string) ($body['mode'] ?? 'quality'));
        $model = trim((string) ($body['model'] ?? 'birefnet-general'));

        if (count($assetIds) < 1 || count($assetIds) > 50) {
            Http::json([
                'ok' => false,
                'error' => 'Select between 1 and 50 image assets.',
                'request_id' => $requestId,
            ], 422);
        }

        $results = [];
        $failures = [];

        foreach ($assetIds as $assetId) {
            $assetStmt = $db->prepare(
                'SELECT id, project_id, original_name, mime_type
                 FROM assets
                 WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
                 LIMIT 1'
            );
            $assetStmt->execute(['id' => $assetId, 'owner' => $user['id']]);
            $assetRow = $assetStmt->fetch();

            if (!$assetRow || !str_starts_with((string) $assetRow['mime_type'], 'image/')) {
                $failures[] = ['asset_id' => $assetId, 'error' => 'Image asset not found.'];
                continue;
            }

            $content = AssetStorage::resolveContent(
                $db,
                (int) $user['id'],
                $assetId,
                'original'
            );

            if (!$content) {
                $failures[] = ['asset_id' => $assetId, 'error' => 'Original content missing.'];
                continue;
            }

            $tmp = null;

            try {
                $tmp = ImageWorker::removeBackground($content['path'], $mode, $model, $workerUrlOverride);
                $baseName = preg_replace('/\.[^.]+$/', '', (string) $assetRow['original_name']) ?: 'image';

                $processed = AssetStorage::storeUpload(
                    $db,
                    (int) $user['id'],
                    $assetRow['project_id'] !== null ? (string) $assetRow['project_id'] : null,
                    [
                        'name' => $baseName . '-transparent.png',
                        'type' => 'image/png',
                        'tmp_name' => $tmp,
                        'error' => UPLOAD_ERR_OK,
                        'size' => filesize($tmp) ?: 0,
                    ]
                );

                $db->prepare(
                    'UPDATE assets
                     SET source_asset_id = :source_asset_id,
                         process_kind = :process_kind
                     WHERE id = :id AND owner_user_id = :owner'
                )->execute([
                    'source_asset_id' => $assetId,
                    'process_kind' => 'background-remove:' . $mode,
                    'id' => $processed['id'],
                    'owner' => $user['id'],
                ]);

                $processedStmt = $db->prepare(
                    'SELECT id, project_id, original_name, mime_type, size_bytes, sha256, storage_key, version, source_asset_id, process_kind, created_at, updated_at
                     FROM assets
                     WHERE id = :id AND owner_user_id = :owner
                     LIMIT 1'
                );
                $processedStmt->execute([
                    'id' => $processed['id'],
                    'owner' => $user['id'],
                ]);
                $row = $processedStmt->fetch();
                $results[] = $row ? AssetStorage::decorateAsset($db, $row) : $processed;
            } catch (Throwable $error) {
                $failures[] = [
                    'asset_id' => $assetId,
                    'error' => $error->getMessage(),
                ];
            } finally {
                if (is_string($tmp) && is_file($tmp)) {
                    @unlink($tmp);
                }
            }
        }

        AdminService::log(
            $db,
            (int) $user['id'],
            'background.batch',
            'assets',
            null,
            [
                'requested' => count($assetIds),
                'completed' => count($results),
                'failed' => count($failures),
                'mode' => $mode,
                'model' => $model,
            ]
        );

        Http::json([
            'ok' => count($results) > 0,
            'assets' => $results,
            'failures' => $failures,
            'request_id' => $requestId,
        ], count($results) > 0 ? 201 : 422);
    }

    if (
        $method === 'POST' &&
        preg_match('#^/api/v1/assets/([^/]+)/background-remove$#', $path, $matches)
    ) {
        $features = AdminService::getSettings($db);
        if (!(bool) ($features['feature_background_remove'] ?? true)) {
            Http::json([
                'ok' => false,
                'error' => 'Background removal is disabled by Admin.',
                'request_id' => $requestId,
            ], 403);
        }

        $assetId = rawurldecode($matches[1]);
        $body = Http::body();
        $workerUrlOverride = trim((string) ($features['worker_url_override'] ?? ''));
        $mode = trim((string) ($body['mode'] ?? 'quality'));
        $model = trim((string) ($body['model'] ?? 'birefnet-general'));

        $assetStmt = $db->prepare(
            'SELECT id, project_id, original_name, mime_type
             FROM assets
             WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
             LIMIT 1'
        );
        $assetStmt->execute(['id' => $assetId, 'owner' => $user['id']]);
        $assetRow = $assetStmt->fetch();

        if (!$assetRow) {
            Http::json([
                'ok' => false,
                'error' => 'Asset not found.',
                'request_id' => $requestId,
            ], 404);
        }

        if (!str_starts_with((string) $assetRow['mime_type'], 'image/')) {
            Http::json([
                'ok' => false,
                'error' => 'Background removal requires an image asset.',
                'request_id' => $requestId,
            ], 422);
        }

        $content = AssetStorage::resolveContent(
            $db,
            (int) $user['id'],
            $assetId,
            'original'
        );

        if (!$content) {
            Http::json([
                'ok' => false,
                'error' => 'Original asset content is missing.',
                'request_id' => $requestId,
            ], 404);
        }

        $tmp = null;

        try {
            $tmp = ImageWorker::removeBackground(
                $content['path'],
                $mode,
                $model
            );

            $baseName = preg_replace(
                '/\.[^.]+$/',
                '',
                (string) $assetRow['original_name']
            ) ?: 'image';

            $processed = AssetStorage::storeUpload(
                $db,
                (int) $user['id'],
                $assetRow['project_id'] !== null ? (string) $assetRow['project_id'] : null,
                [
                    'name' => $baseName . '-transparent.png',
                    'type' => 'image/png',
                    'tmp_name' => $tmp,
                    'error' => UPLOAD_ERR_OK,
                    'size' => filesize($tmp) ?: 0,
                ]
            );

            $db->prepare(
                'UPDATE assets
                 SET source_asset_id = :source_asset_id,
                     process_kind = :process_kind
                 WHERE id = :id AND owner_user_id = :owner'
            )->execute([
                'source_asset_id' => $assetId,
                'process_kind' => 'background-remove:' . $mode,
                'id' => $processed['id'],
                'owner' => $user['id'],
            ]);

            $processedStmt = $db->prepare(
                'SELECT id, project_id, original_name, mime_type, size_bytes, sha256, storage_key, version, source_asset_id, process_kind, created_at, updated_at
                 FROM assets
                 WHERE id = :id AND owner_user_id = :owner
                 LIMIT 1'
            );
            $processedStmt->execute([
                'id' => $processed['id'],
                'owner' => $user['id'],
            ]);
            $processedRow = $processedStmt->fetch();
            if ($processedRow) {
                $processed = AssetStorage::decorateAsset($db, $processedRow);
            }
        } catch (RuntimeException $error) {
            Http::json([
                'ok' => false,
                'error' => $error->getMessage(),
                'request_id' => $requestId,
            ], 422);
        } finally {
            if (is_string($tmp) && is_file($tmp)) {
                @unlink($tmp);
            }
        }

        Http::json([
            'ok' => true,
            'asset' => $processed,
            'source_asset_id' => $assetId,
            'mode' => $mode,
            'model' => $model,
            'request_id' => $requestId,
        ], 201);
    }

    if ($method === 'POST' && preg_match('#^/api/v1/assets/([^/]+)/replace$#', $path, $matches)) {
        $assetId = rawurldecode($matches[1]);

        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            Http::json([
                'ok' => false,
                'error' => 'Multipart file field "file" is required.',
                'request_id' => $requestId,
            ], 422);
        }

        try {
            $asset = AssetStorage::replaceUpload(
                $db,
                (int) $user['id'],
                $assetId,
                $_FILES['file']
            );
        } catch (RuntimeException $error) {
            Http::json([
                'ok' => false,
                'error' => $error->getMessage(),
                'request_id' => $requestId,
            ], 422);
        }

        Http::json([
            'ok' => true,
            'asset' => $asset,
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'GET' && preg_match('#^/api/v1/assets/([^/]+)/content$#', $path, $matches)) {
        $assetId = rawurldecode($matches[1]);
        $variant = isset($_GET['variant']) && $_GET['variant'] === 'proxy' ? 'proxy' : 'original';
        $content = AssetStorage::resolveContent($db, (int) $user['id'], $assetId, $variant);

        if (!$content) {
            Http::json([
                'ok' => false,
                'error' => 'Asset content not found.',
                'request_id' => $requestId,
            ], 404);
        }

        header('Content-Type: ' . $content['mime_type']);
        header('Content-Length: ' . (string) filesize($content['path']));
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');
        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', $content['original_name']) ?: 'asset';
        header('Content-Disposition: inline; filename="' . $safeName . '"');
        readfile($content['path']);
        exit;
    }

    if ($method === 'DELETE' && preg_match('#^/api/v1/assets/([^/]+)$#', $path, $matches)) {
        $assetId = rawurldecode($matches[1]);
        $stmt = $db->prepare(
            'UPDATE assets SET deleted_at = NOW()
             WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL'
        );
        $stmt->execute(['id' => $assetId, 'owner' => $user['id']]);

        Http::json([
            'ok' => true,
            'deleted' => $stmt->rowCount() > 0,
            'request_id' => $requestId,
        ]);
    }

    if (preg_match('#^/api/v1/projects/([^/]+)/lock$#', $path, $matches)) {
        $projectId = rawurldecode($matches[1]);

        $ownerStmt = $db->prepare(
            'SELECT id FROM projects
             WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
             LIMIT 1'
        );
        $ownerStmt->execute(['id' => $projectId, 'owner' => $user['id']]);

        if (!$ownerStmt->fetch()) {
            Http::json([
                'ok' => false,
                'error' => 'Project not found.',
                'request_id' => $requestId,
            ], 404);
        }

        if ($method === 'GET') {
            Http::json([
                'ok' => true,
                'lock' => ProjectLock::status($db, $projectId),
                'request_id' => $requestId,
            ]);
        }

        $body = Http::body();
        $clientId = trim((string) ($body['client_id'] ?? ($_SERVER['HTTP_X_ZAXIS_CLIENT_ID'] ?? '')));

        if ($method === 'POST') {
            if ($clientId === '') {
                Http::json([
                    'ok' => false,
                    'error' => 'client_id is required.',
                    'request_id' => $requestId,
                ], 422);
            }

            try {
                $result = ProjectLock::acquire(
                    $db,
                    $projectId,
                    (int) $user['id'],
                    $clientId,
                    trim((string) ($body['client_name'] ?? 'Windows Desktop')),
                    (int) ($body['ttl_seconds'] ?? 120)
                );
            } catch (InvalidArgumentException $error) {
                Http::json([
                    'ok' => false,
                    'error' => $error->getMessage(),
                    'request_id' => $requestId,
                ], 422);
            }

            if (!$result['acquired']) {
                Http::json([
                    'ok' => false,
                    'error' => 'Project is locked by another editor.',
                    'lock' => $result['lock'],
                    'request_id' => $requestId,
                ], 423);
            }

            Http::json([
                'ok' => true,
                'lock' => $result['lock'],
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'DELETE') {
            Http::json([
                'ok' => true,
                'released' => ProjectLock::release(
                    $db,
                    $projectId,
                    (int) $user['id'],
                    $clientId
                ),
                'request_id' => $requestId,
            ]);
        }
    }

    if ($method === 'GET' && $path === '/api/v1/projects') {
        $stmt = $db->prepare(
            'SELECT id, name, mode, current_revision, created_at, updated_at
             FROM projects
             WHERE owner_user_id = :user_id AND deleted_at IS NULL
             ORDER BY updated_at DESC'
        );
        $stmt->execute(['user_id' => $user['id']]);

        Http::json([
            'ok' => true,
            'projects' => $stmt->fetchAll(),
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'POST' && $path === '/api/v1/projects') {
        $body = Http::body();
        $projectId = trim((string) ($body['id'] ?? ''));
        $name = trim((string) ($body['name'] ?? 'Untitled Project'));
        $mode = ($body['mode'] ?? 'kdp') === 'graphic-design' ? 'graphic-design' : 'kdp';
        $snapshot = $body['snapshot'] ?? null;

        if (!preg_match('/^[A-Za-z0-9._-]{8,80}$/', $projectId)) {
            Http::json(['ok' => false, 'error' => 'Invalid project id.', 'request_id' => $requestId], 422);
        }

        $db->beginTransaction();

        try {
            $stmt = $db->prepare(
                'INSERT INTO projects (id, owner_user_id, name, mode)
                 VALUES (:id, :owner, :name, :mode)'
            );
            $stmt->execute([
                'id' => $projectId,
                'owner' => $user['id'],
                'name' => $name !== '' ? $name : 'Untitled Project',
                'mode' => $mode,
            ]);

            if ($snapshot !== null) {
                $snapshotJson = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                if ($snapshotJson === false) {
                    throw new RuntimeException('Snapshot could not be encoded.');
                }

                $hash = hash('sha256', $snapshotJson);
                $db->prepare(
                    'INSERT INTO project_snapshots
                     (project_id, revision_number, label, snapshot_json, snapshot_hash, created_by)
                     VALUES (:project_id, 1, :label, :snapshot_json, :snapshot_hash, :created_by)'
                )->execute([
                    'project_id' => $projectId,
                    'label' => 'Initial',
                    'snapshot_json' => $snapshotJson,
                    'snapshot_hash' => $hash,
                    'created_by' => $user['id'],
                ]);

                $db->prepare('UPDATE projects SET current_revision = 1 WHERE id = :id')
                    ->execute(['id' => $projectId]);
            }

            $db->commit();
        } catch (Throwable $error) {
            $db->rollBack();

            if ((string) $error->getCode() === '23000') {
                Http::json([
                    'ok' => false,
                    'error' => 'Project already exists.',
                    'request_id' => $requestId,
                ], 409);
            }

            throw $error;
        }

        Http::json([
            'ok' => true,
            'project_id' => $projectId,
            'revision' => $snapshot !== null ? 1 : 0,
            'request_id' => $requestId,
        ], 201);
    }

    if (preg_match('#^/api/v1/projects/([^/]+)$#', $path, $matches)) {
        $projectId = rawurldecode($matches[1]);

        if ($method === 'GET') {
            $stmt = $db->prepare(
                'SELECT id, name, mode, current_revision, created_at, updated_at
                 FROM projects
                 WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
                 LIMIT 1'
            );
            $stmt->execute(['id' => $projectId, 'owner' => $user['id']]);
            $project = $stmt->fetch();

            if (!$project) {
                Http::json(['ok' => false, 'error' => 'Project not found.', 'request_id' => $requestId], 404);
            }

            $snapshot = null;

            if ((int) $project['current_revision'] > 0) {
                $snapshotStmt = $db->prepare(
                    'SELECT snapshot_json, snapshot_hash, label, created_at
                     FROM project_snapshots
                     WHERE project_id = :project_id AND revision_number = :revision
                     LIMIT 1'
                );
                $snapshotStmt->execute([
                    'project_id' => $projectId,
                    'revision' => $project['current_revision'],
                ]);
                $snapshotRow = $snapshotStmt->fetch();

                if ($snapshotRow) {
                    $snapshot = json_decode((string) $snapshotRow['snapshot_json'], true);
                }
            }

            Http::json([
                'ok' => true,
                'project' => $project,
                'snapshot' => $snapshot,
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'PATCH') {
            $body = Http::body();
            $fields = [];
            $params = ['id' => $projectId, 'owner' => $user['id']];

            if (isset($body['name'])) {
                $fields[] = 'name = :name';
                $params['name'] = trim((string) $body['name']) ?: 'Untitled Project';
            }

            if (isset($body['mode'])) {
                $fields[] = 'mode = :mode';
                $params['mode'] = $body['mode'] === 'graphic-design' ? 'graphic-design' : 'kdp';
            }

            if ($fields === []) {
                Http::json(['ok' => false, 'error' => 'No editable fields supplied.', 'request_id' => $requestId], 422);
            }

            $sql = 'UPDATE projects SET ' . implode(', ', $fields) .
                ', updated_at = NOW() WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL';

            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            Http::json([
                'ok' => true,
                'updated' => $stmt->rowCount() > 0,
                'request_id' => $requestId,
            ]);
        }

        if ($method === 'DELETE') {
            $stmt = $db->prepare(
                'UPDATE projects SET deleted_at = NOW(), updated_at = NOW()
                 WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL'
            );
            $stmt->execute(['id' => $projectId, 'owner' => $user['id']]);

            Http::json([
                'ok' => true,
                'deleted' => $stmt->rowCount() > 0,
                'request_id' => $requestId,
            ]);
        }
    }

    if ($method === 'PATCH' && preg_match('#^/api/v1/projects/([^/]+)/snapshot$#', $path, $matches)) {
        $projectId = rawurldecode($matches[1]);
        $body = Http::body();
        $clientId = trim((string) ($_SERVER['HTTP_X_ZAXIS_CLIENT_ID'] ?? ($body['client_id'] ?? '')));
        $blockingLock = ProjectLock::blockingLock($db, $projectId, $clientId);

        if ($blockingLock) {
            Http::json([
                'ok' => false,
                'error' => 'Project is locked by another editor.',
                'lock' => $blockingLock,
                'request_id' => $requestId,
            ], 423);
        }

        $baseRevision = (int) ($body['base_revision'] ?? -1);
        $clientEventId = trim((string) ($body['client_event_id'] ?? ''));
        $label = isset($body['label']) ? trim((string) $body['label']) : null;
        $delta = is_array($body['delta'] ?? null) ? $body['delta'] : null;

        if ($clientEventId === '' || $delta === null || !ProjectDelta::validate($delta)) {
            Http::json([
                'ok' => false,
                'error' => 'client_event_id and a valid version 1 delta are required.',
                'request_id' => $requestId,
            ], 422);
        }

        $db->beginTransaction();

        try {
            $eventStmt = $db->prepare(
                'SELECT resulting_revision
                 FROM sync_events
                 WHERE project_id = :project_id AND client_event_id = :event_id
                 LIMIT 1'
            );
            $eventStmt->execute(['project_id' => $projectId, 'event_id' => $clientEventId]);
            $existingEvent = $eventStmt->fetch();

            if ($existingEvent) {
                $db->commit();
                Http::json([
                    'ok' => true,
                    'idempotent_replay' => true,
                    'sync_mode' => 'delta',
                    'revision' => (int) $existingEvent['resulting_revision'],
                    'request_id' => $requestId,
                ]);
            }

            $projectStmt = $db->prepare(
                'SELECT current_revision, name, mode
                 FROM projects
                 WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
                 FOR UPDATE'
            );
            $projectStmt->execute(['id' => $projectId, 'owner' => $user['id']]);
            $project = $projectStmt->fetch();

            if (!$project) {
                $db->rollBack();
                Http::json(['ok' => false, 'error' => 'Project not found.', 'request_id' => $requestId], 404);
            }

            $currentRevision = (int) $project['current_revision'];

            if ($baseRevision !== $currentRevision) {
                $db->rollBack();
                Http::json([
                    'ok' => false,
                    'error' => 'Revision conflict.',
                    'server_revision' => $currentRevision,
                    'request_id' => $requestId,
                ], 409);
            }

            if ($currentRevision <= 0) {
                $db->rollBack();
                Http::json([
                    'ok' => false,
                    'error' => 'A full initial snapshot is required before delta sync.',
                    'request_id' => $requestId,
                ], 422);
            }

            $snapshotStmt = $db->prepare(
                'SELECT snapshot_json
                 FROM project_snapshots
                 WHERE project_id = :project_id AND revision_number = :revision
                 LIMIT 1'
            );
            $snapshotStmt->execute([
                'project_id' => $projectId,
                'revision' => $currentRevision,
            ]);
            $snapshotRow = $snapshotStmt->fetch();

            if (!$snapshotRow) {
                throw new RuntimeException('Current project snapshot is missing.');
            }

            $baseSnapshot = json_decode((string) $snapshotRow['snapshot_json'], true);

            if (!is_array($baseSnapshot)) {
                throw new RuntimeException('Current project snapshot is invalid.');
            }

            $nextSnapshot = ProjectDelta::apply($baseSnapshot, $delta);
            $snapshotJson = json_encode(
                $nextSnapshot,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            );

            if ($snapshotJson === false) {
                throw new RuntimeException('Delta result could not be encoded.');
            }

            $deltaPayloadJson = json_encode(
                ['type' => 'delta', 'delta' => $delta],
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            );

            if ($deltaPayloadJson === false) {
                throw new RuntimeException('Delta payload could not be encoded.');
            }

            $nextRevision = $currentRevision + 1;
            $hash = hash('sha256', $snapshotJson);

            $db->prepare(
                'INSERT INTO project_snapshots
                 (project_id, revision_number, label, snapshot_json, snapshot_hash, created_by)
                 VALUES (:project_id, :revision, :label, :snapshot_json, :snapshot_hash, :created_by)'
            )->execute([
                'project_id' => $projectId,
                'revision' => $nextRevision,
                'label' => $label !== '' ? $label : 'Incremental autosave',
                'snapshot_json' => $snapshotJson,
                'snapshot_hash' => $hash,
                'created_by' => $user['id'],
            ]);

            $db->prepare(
                'INSERT INTO sync_events
                 (project_id, client_event_id, base_revision, resulting_revision, payload_json, created_by)
                 VALUES (:project_id, :event_id, :base_revision, :resulting_revision, :payload_json, :created_by)'
            )->execute([
                'project_id' => $projectId,
                'event_id' => $clientEventId,
                'base_revision' => $baseRevision,
                'resulting_revision' => $nextRevision,
                'payload_json' => $deltaPayloadJson,
                'created_by' => $user['id'],
            ]);

            $projectFields = $delta['project'] ?? [];
            $nextName = isset($projectFields['name'])
                ? trim((string) $projectFields['name'])
                : (string) $project['name'];
            $nextMode = isset($projectFields['mode']) && $projectFields['mode'] === 'graphic-design'
                ? 'graphic-design'
                : (isset($projectFields['mode']) ? 'kdp' : (string) $project['mode']);

            $db->prepare(
                'UPDATE projects
                 SET current_revision = :revision,
                     name = :name,
                     mode = :mode,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'revision' => $nextRevision,
                'name' => $nextName !== '' ? $nextName : 'Untitled Project',
                'mode' => $nextMode,
                'id' => $projectId,
            ]);

            $db->commit();

            Http::json([
                'ok' => true,
                'sync_mode' => 'delta',
                'revision' => $nextRevision,
                'snapshot_hash' => $hash,
                'request_id' => $requestId,
            ]);
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }
    }

    if ($method === 'PUT' && preg_match('#^/api/v1/projects/([^/]+)/snapshot$#', $path, $matches)) {
        $projectId = rawurldecode($matches[1]);
        $body = Http::body();
        $clientId = trim((string) ($_SERVER['HTTP_X_ZAXIS_CLIENT_ID'] ?? ($body['client_id'] ?? '')));
        $blockingLock = ProjectLock::blockingLock($db, $projectId, $clientId);

        if ($blockingLock) {
            Http::json([
                'ok' => false,
                'error' => 'Project is locked by another editor.',
                'lock' => $blockingLock,
                'request_id' => $requestId,
            ], 423);
        }
        $baseRevision = (int) ($body['base_revision'] ?? -1);
        $clientEventId = trim((string) ($body['client_event_id'] ?? ''));
        $label = isset($body['label']) ? trim((string) $body['label']) : null;
        $snapshot = $body['snapshot'] ?? null;

        if ($clientEventId === '' || $snapshot === null) {
            Http::json([
                'ok' => false,
                'error' => 'client_event_id and snapshot are required.',
                'request_id' => $requestId,
            ], 422);
        }

        $snapshotJson = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($snapshotJson === false) {
            Http::json(['ok' => false, 'error' => 'Snapshot could not be encoded.', 'request_id' => $requestId], 422);
        }

        $db->beginTransaction();

        try {
            $eventStmt = $db->prepare(
                'SELECT resulting_revision
                 FROM sync_events
                 WHERE project_id = :project_id AND client_event_id = :event_id
                 LIMIT 1'
            );
            $eventStmt->execute(['project_id' => $projectId, 'event_id' => $clientEventId]);
            $existingEvent = $eventStmt->fetch();

            if ($existingEvent) {
                $db->commit();
                Http::json([
                    'ok' => true,
                    'idempotent_replay' => true,
                    'revision' => (int) $existingEvent['resulting_revision'],
                    'request_id' => $requestId,
                ]);
            }

            $projectStmt = $db->prepare(
                'SELECT current_revision
                 FROM projects
                 WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
                 FOR UPDATE'
            );
            $projectStmt->execute(['id' => $projectId, 'owner' => $user['id']]);
            $project = $projectStmt->fetch();

            if (!$project) {
                $db->rollBack();
                Http::json(['ok' => false, 'error' => 'Project not found.', 'request_id' => $requestId], 404);
            }

            $currentRevision = (int) $project['current_revision'];

            if ($baseRevision !== $currentRevision) {
                $db->rollBack();
                Http::json([
                    'ok' => false,
                    'error' => 'Revision conflict.',
                    'server_revision' => $currentRevision,
                    'request_id' => $requestId,
                ], 409);
            }

            $nextRevision = $currentRevision + 1;
            $hash = hash('sha256', $snapshotJson);

            $db->prepare(
                'INSERT INTO project_snapshots
                 (project_id, revision_number, label, snapshot_json, snapshot_hash, created_by)
                 VALUES (:project_id, :revision, :label, :snapshot_json, :snapshot_hash, :created_by)'
            )->execute([
                'project_id' => $projectId,
                'revision' => $nextRevision,
                'label' => $label !== '' ? $label : null,
                'snapshot_json' => $snapshotJson,
                'snapshot_hash' => $hash,
                'created_by' => $user['id'],
            ]);

            $db->prepare(
                'INSERT INTO sync_events
                 (project_id, client_event_id, base_revision, resulting_revision, payload_json, created_by)
                 VALUES (:project_id, :event_id, :base_revision, :resulting_revision, :payload_json, :created_by)'
            )->execute([
                'project_id' => $projectId,
                'event_id' => $clientEventId,
                'base_revision' => $baseRevision,
                'resulting_revision' => $nextRevision,
                'payload_json' => $snapshotJson,
                'created_by' => $user['id'],
            ]);

            $snapshotName = is_array($snapshot) && isset($snapshot['name'])
                ? trim((string) $snapshot['name'])
                : null;
            $snapshotMode = is_array($snapshot) && (($snapshot['mode'] ?? null) === 'graphic-design')
                ? 'graphic-design'
                : 'kdp';

            $db->prepare(
                'UPDATE projects
                 SET current_revision = :revision,
                     name = COALESCE(:name, name),
                     mode = :mode,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'revision' => $nextRevision,
                'name' => $snapshotName !== '' ? $snapshotName : null,
                'mode' => $snapshotMode,
                'id' => $projectId,
            ]);

            $db->commit();

            Http::json([
                'ok' => true,
                'revision' => $nextRevision,
                'snapshot_hash' => $hash,
                'request_id' => $requestId,
            ]);
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }
    }

    if ($method === 'GET' && preg_match('#^/api/v1/projects/([^/]+)/revisions/(\d+)$#', $path, $matches)) {
        $projectId = rawurldecode($matches[1]);
        $revisionNumber = (int) $matches[2];

        $stmt = $db->prepare(
            'SELECT s.revision_number, s.label, s.snapshot_hash, s.snapshot_json, s.created_at
             FROM project_snapshots s
             INNER JOIN projects p ON p.id = s.project_id
             WHERE s.project_id = :project_id
               AND s.revision_number = :revision
               AND p.owner_user_id = :owner
               AND p.deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([
            'project_id' => $projectId,
            'revision' => $revisionNumber,
            'owner' => $user['id'],
        ]);
        $row = $stmt->fetch();

        if (!$row) {
            Http::json([
                'ok' => false,
                'error' => 'Revision not found.',
                'request_id' => $requestId,
            ], 404);
        }

        Http::json([
            'ok' => true,
            'revision' => [
                'revision_number' => (int) $row['revision_number'],
                'label' => $row['label'],
                'snapshot_hash' => $row['snapshot_hash'],
                'created_at' => $row['created_at'],
            ],
            'snapshot' => json_decode((string) $row['snapshot_json'], true),
            'request_id' => $requestId,
        ]);
    }

    if ($method === 'GET' && preg_match('#^/api/v1/projects/([^/]+)/revisions$#', $path, $matches)) {
        $projectId = rawurldecode($matches[1]);

        $ownerStmt = $db->prepare(
            'SELECT id FROM projects
             WHERE id = :id AND owner_user_id = :owner AND deleted_at IS NULL
             LIMIT 1'
        );
        $ownerStmt->execute(['id' => $projectId, 'owner' => $user['id']]);

        if (!$ownerStmt->fetch()) {
            Http::json(['ok' => false, 'error' => 'Project not found.', 'request_id' => $requestId], 404);
        }

        $stmt = $db->prepare(
            'SELECT revision_number, label, snapshot_hash, created_at
             FROM project_snapshots
             WHERE project_id = :project_id
             ORDER BY revision_number DESC
             LIMIT 100'
        );
        $stmt->execute(['project_id' => $projectId]);

        Http::json([
            'ok' => true,
            'revisions' => $stmt->fetchAll(),
            'request_id' => $requestId,
        ]);
    }

    Http::json([
        'ok' => false,
        'error' => 'Route not found.',
        'request_id' => $requestId,
    ], 404);
} catch (Throwable $error) {
    $payload = [
        'ok' => false,
        'error' => 'Server error.',
        'request_id' => $requestId,
    ];

    if (\ZaxisKdp\Config::bool('APP_DEBUG', false)) {
        $payload['debug'] = $error->getMessage();
    }

    Http::json($payload, 500);
}
