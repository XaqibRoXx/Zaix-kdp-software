<?php

declare(strict_types=1);

namespace ZaxisKdp;

use PDO;

final class PublicSharePage
{
    /** @param array<string,mixed> $share */
    public static function render(
        PDO $db,
        array $share,
        ?string $accessToken = null,
        string $error = ''
    ): never {
        $slug = (string) $share['slug'];
        $active = (bool) ($share['active'] ?? false);
        $passwordProtected = (bool) ($share['password_protected'] ?? false);
        $authorized = !$passwordProtected ||
            ShareService::verifyAccessToken($slug, $accessToken);

        http_response_code($active ? 200 : 410);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');

        if (!$active) {
            self::layout(
                'Link unavailable',
                '<div class="card"><h1>This share link is no longer available.</h1><p>It may have expired or been revoked.</p></div>'
            );
        }

        if (!$authorized) {
            $errorHtml = $error !== ''
                ? '<p class="error">' . self::h($error) . '</p>'
                : '';

            $body =
                '<div class="card unlock">' .
                '<div class="brand">ZAXIS KDP</div>' .
                '<h1>Protected proof</h1>' .
                '<p>Enter the password to preview this file.</p>' .
                $errorHtml .
                '<form method="post" action="/s/' . rawurlencode($slug) . '">' .
                '<input type="password" name="password" placeholder="Password" required autofocus>' .
                '<button type="submit">Unlock</button>' .
                '</form>' .
                '</div>';

            self::layout((string) $share['title'], $body);
        }

        $accessToken ??= ShareService::makeAccessToken($share);
        ShareService::recordEvent($db, $share, 'view');
        $comments = (bool) $share['proof_mode']
            ? ShareService::comments($db, (string) $share['id'])
            : [];

        $fileUrl =
            '/s/' . rawurlencode($slug) .
            '/file?access=' . rawurlencode($accessToken);

        $downloadUrl =
            $fileUrl . '&download=1';

        $viewer = str_contains(strtolower((string) $share['mime_type']), 'pdf')
            ? '<iframe class="preview" src="' . self::h($fileUrl) . '" title="PDF preview"></iframe>'
            : '<img class="image-preview" src="' . self::h($fileUrl) . '" alt="">';

        $download = (bool) $share['allow_download']
            ? '<a class="button secondary" href="' . self::h($downloadUrl) . '">Download</a>'
            : '<span class="badge">Download disabled</span>';

        $commentSection = '';

        if ((bool) $share['proof_mode']) {
            $items = '';

            foreach ($comments as $comment) {
                $items .=
                    '<article class="comment">' .
                    '<strong>' . self::h((string) $comment['author_name']) . '</strong>' .
                    '<small>' . self::h((string) $comment['created_at']) . '</small>' .
                    '<p>' . nl2br(self::h((string) $comment['body'])) . '</p>' .
                    '</article>';
            }

            if ($items === '') {
                $items = '<p class="muted">No comments yet.</p>';
            }

            $commentSection =
                '<section class="card proof">' .
                '<h2>Proof comments</h2>' .
                '<div class="comments">' . $items . '</div>' .
                '<form method="post" action="/s/' . rawurlencode($slug) . '/comments">' .
                '<input type="hidden" name="access" value="' . self::h($accessToken) . '">' .
                '<input name="author_name" maxlength="120" placeholder="Your name" required>' .
                '<textarea name="body" maxlength="4000" placeholder="Leave a comment…" required></textarea>' .
                '<button type="submit">Post comment</button>' .
                '</form>' .
                '</section>';
        }

        $expires = $share['expires_at'] !== null
            ? '<span class="badge">Expires ' . self::h((string) $share['expires_at']) . '</span>'
            : '<span class="badge">No expiry</span>';

        $body =
            '<header class="topbar">' .
            '<div><div class="brand">ZAXIS KDP</div><h1>' . self::h((string) $share['title']) . '</h1>' .
            '<p>' . self::h((string) $share['original_name']) . '</p></div>' .
            '<div class="actions">' . $expires . $download . '</div>' .
            '</header>' .
            '<main>' .
            '<section class="card viewer">' . $viewer . '</section>' .
            $commentSection .
            '</main>';

        self::layout((string) $share['title'], $body);
    }

    private static function layout(string $title, string $body): never
    {
        echo '<!doctype html><html lang="en"><head>' .
            '<meta charset="utf-8">' .
            '<meta name="viewport" content="width=device-width,initial-scale=1">' .
            '<meta name="robots" content="noindex,nofollow">' .
            '<title>' . self::h($title) . '</title>' .
            '<style>' . self::css() . '</style>' .
            '</head><body>' . $body . '</body></html>';
        exit;
    }

    private static function h(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function css(): string
    {
        return <<<'CSS'
:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#edf6f2;background:#020202}
*{box-sizing:border-box}body{margin:0;background:#020202;color:#edf6f2}
.topbar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;gap:20px;align-items:center;padding:18px 24px;background:#070908;border-bottom:1px solid #1c2521}
.brand{color:#00f6ac;font-size:12px;font-weight:800;letter-spacing:1.4px}
h1{font-size:22px;margin:4px 0}h2{font-size:17px;margin:0 0 12px}p{color:#9ca9a3}
main{max-width:1260px;margin:0 auto;padding:20px}.card{background:#090c0b;border:1px solid #202924;border-radius:12px;padding:14px}
.viewer{padding:0;overflow:hidden}.preview{display:block;width:100%;height:78vh;border:0;background:white}.image-preview{display:block;max-width:100%;margin:auto}
.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:9px 12px;background:#00f6ac;color:#020202;font-weight:700;text-decoration:none;cursor:pointer}
.button.secondary{background:#111714;color:#edf6f2;border:1px solid #2a3731}.badge{display:inline-flex;padding:7px 9px;border-radius:999px;border:1px solid #29332f;color:#9faaa5;font-size:12px}
.proof{margin-top:16px}.comments{display:grid;gap:8px;margin-bottom:14px}.comment{padding:10px;border:1px solid #1e2723;border-radius:8px;background:#0c100e}.comment strong,.comment small{display:block}.comment small{color:#6f7d76;margin-top:2px}.comment p{white-space:normal;color:#cbd5d0}
form{display:grid;gap:8px}input,textarea{width:100%;border:1px solid #29342f;border-radius:8px;background:#0e1311;color:#fff;padding:10px}textarea{min-height:100px;resize:vertical}.unlock{max-width:480px;margin:12vh auto;padding:22px}.error{color:#ff9191}.muted{color:#77837d}
@media(max-width:700px){.topbar{align-items:flex-start;flex-direction:column}.preview{height:70vh}}
CSS;
    }
}
