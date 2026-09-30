<?php

declare(strict_types=1);

namespace ZaxisKdp;

final class Config
{
    public static function env(string $key, ?string $default = null): ?string
    {
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
