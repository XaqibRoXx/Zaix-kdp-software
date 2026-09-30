<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;

final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $host = Config::env('DB_HOST', 'localhost');
        $port = Config::env('DB_PORT', '3306');
        $name = Config::env('DB_NAME');
        $user = Config::env('DB_USER');
        $pass = Config::env('DB_PASS', '');

        if (!$name || !$user) {
            throw new \RuntimeException('Database configuration is incomplete.');
        }

        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $name);

        self::$connection = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        return self::$connection;
    }
}
