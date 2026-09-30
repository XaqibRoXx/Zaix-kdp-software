<?php

declare(strict_types=1);

namespace ZaxisKdp;

final class Config
{
    private static bool $bootstrapped = false;

    public static function bootstrap(?string $envFile = null): void
    {
        if (self::$bootstrapped) {
            return;
        }

        self::$bootstrapped = true;
        $envFile ??= dirname(__DIR__) . '/.env';

        if (!is_file($envFile) || !is_readable($envFile)) {
            return;
        }

        $lines = file($envFile, FILE_IGNORE_NEW_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);

            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);

            if ($key === '') {
                continue;
            }

            if (
                strlen($value) >= 2 &&
                (($value[0] === '"' && $value[strlen($value) - 1] === '"') ||
                 ($value[0] === "'" && $value[strlen($value) - 1] === "'"))
            ) {
                $value = substr($value, 1, -1);
            }

            if (getenv($key) === false) {
                putenv($key . '=' . $value);
            }

            $_ENV[$key] ??= $value;
        }
    }

    public static function env(string $key, ?string $default = null): ?string
    {
        self::bootstrap();

        $value = $_ENV[$key] ?? getenv($key);

        if ($value === false || $value === null || $value === '') {
            return $default;
        }

        return (string) $value;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::env($key);

        if ($value === null) {
            return $default;
        }

        return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }

    /** @return list<string> */
    public static function allowedOrigins(): array
    {
        $raw = self::env('ALLOWED_ORIGINS', 'tauri://localhost,http://tauri.localhost,https://tauri.localhost') ?? '';
        return array_values(array_filter(array_map('trim', explode(',', $raw))));
    }
}
