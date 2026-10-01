<?php

declare(strict_types=1);

namespace ZaxisKdp;

final class ProjectDelta
{
    /**
     * Apply a page/artboard-level delta to the last full project snapshot.
     *
     * @param array<string,mixed> $base
     * @param array<string,mixed> $delta
     * @return array<string,mixed>
     */
    public static function apply(array $base, array $delta): array
    {
        foreach (['name', 'mode', 'kdpSettings', 'bookStructure', 'masterPages', 'reusableStyles', 'updatedAt'] as $field) {
            if (array_key_exists($field, $delta['project'] ?? [])) {
                $base[$field] = $delta['project'][$field];
            }
        }

        $artboards = is_array($base['artboards'] ?? null) ? $base['artboards'] : [];
        $byId = [];

        foreach ($artboards as $artboard) {
            if (is_array($artboard) && isset($artboard['id'])) {
                $byId[(string) $artboard['id']] = $artboard;
            }
        }

        foreach (($delta['removed_artboard_ids'] ?? []) as $removedId) {
            unset($byId[(string) $removedId]);
        }

        foreach (($delta['changed_artboards'] ?? []) as $artboard) {
            if (!is_array($artboard) || !isset($artboard['id'])) {
                continue;
            }

            $byId[(string) $artboard['id']] = $artboard;
        }

        $order = is_array($delta['artboard_order'] ?? null)
            ? array_values(array_map('strval', $delta['artboard_order']))
            : array_keys($byId);

        $nextArtboards = [];
        $seen = [];

        foreach ($order as $id) {
            if (isset($byId[$id])) {
                $nextArtboards[] = $byId[$id];
                $seen[$id] = true;
            }
        }

        // Preserve any artboards omitted from order rather than discarding data.
        foreach ($byId as $id => $artboard) {
            if (!isset($seen[$id])) {
                $nextArtboards[] = $artboard;
            }
        }

        $base['artboards'] = $nextArtboards;

        return $base;
    }

    /** @param array<string,mixed> $delta */
    public static function validate(array $delta): bool
    {
        if (!isset($delta['version']) || (int) $delta['version'] !== 1) {
            return false;
        }

        foreach (($delta['changed_artboards'] ?? []) as $artboard) {
            if (!is_array($artboard) || !isset($artboard['id'])) {
                return false;
            }
        }

        return true;
    }
}
