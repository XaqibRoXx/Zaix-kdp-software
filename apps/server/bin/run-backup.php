<?php

declare(strict_types=1);

use ZaxisKdp\BackupService;
use ZaxisKdp\Database;

require dirname(__DIR__) . '/vendor/autoload.php';

try {
    $result = BackupService::runScheduled(Database::connection());

    if ($result === null) {
        fwrite(STDOUT, "No backup due.\n");
        exit(0);
    }

    fwrite(STDOUT, "Backup created: " . $result['file_name'] . "\n");
    exit(0);
} catch (Throwable $error) {
    fwrite(STDERR, "Backup failed: " . $error->getMessage() . "\n");
    exit(1);
}
