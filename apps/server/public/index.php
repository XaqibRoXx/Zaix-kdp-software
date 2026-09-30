<?php

declare(strict_types=1);

use ZaxisKdp\Auth;
use ZaxisKdp\Database;
use ZaxisKdp\Http;

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
    $user = Auth::userFromRequest($db);

    if (!$user) {
        Http::json([
            'ok' => false,
            'error' => 'Unauthorized.',
            'request_id' => $requestId,
        ], 401);
    }

    if ($method === 'GET' && $path === '/api/v1/me') {
        Http::json([
            'ok' => true,
            'user' => $user,
            'request_id' => $requestId,
        ]);
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

    if ($method === 'PUT' && preg_match('#^/api/v1/projects/([^/]+)/snapshot$#', $path, $matches)) {
        $projectId = rawurldecode($matches[1]);
        $body = Http::body();
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

            $db->prepare(
                'UPDATE projects
                 SET current_revision = :revision, updated_at = NOW()
                 WHERE id = :id'
            )->execute(['revision' => $nextRevision, 'id' => $projectId]);

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
