<?php

declare(strict_types=1);

namespace ZaxisKdp;

use RuntimeException;

final class ImageWorker
{
    public static function removeBackground(
        string $sourcePath,
        string $mode = 'quality',
        string $model = 'birefnet-general'
    ): string {
        $workerUrl = rtrim((string) Config::env('WORKER_URL', ''), '/');
        if ($workerUrl === '') {
            throw new RuntimeException('Image worker URL is not configured.');
        }

        if (!extension_loaded('curl')) {
            throw new RuntimeException('PHP cURL extension is required for the image worker.');
        }

        if (!is_file($sourcePath)) {
            throw new RuntimeException('Source image file is missing.');
        }

        if (!in_array($mode, ['fast', 'quality', 'hair'], true)) {
            throw new RuntimeException('Unsupported background removal mode.');
        }

        if (!preg_match('/^[A-Za-z0-9._-]+$/', $model)) {
            throw new RuntimeException('Invalid background model name.');
        }

        $endpoint =
            $workerUrl .
            '/v1/background/remove?mode=' . rawurlencode($mode) .
            '&model=' . rawurlencode($model);

        $headers = ['Accept: image/png'];
        $token = trim((string) Config::env('WORKER_TOKEN', ''));
        if ($token !== '') {
            $headers[] = 'Authorization: Bearer ' . $token;
        }

        $curl = curl_init($endpoint);
        if ($curl === false) {
            throw new RuntimeException('Could not initialize image worker request.');
        }

        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => [
                'file' => new \CURLFile($sourcePath),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 180,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($body === false) {
            throw new RuntimeException('Image worker request failed: ' . $error);
        }

        if ($status < 200 || $status >= 300) {
            $message = trim((string) $body);
            throw new RuntimeException(
                'Image worker returned HTTP ' . $status .
                ($message !== '' ? ': ' . mb_substr($message, 0, 400) : '')
            );
        }

        $tmp = tempnam(sys_get_temp_dir(), 'zaxis-bg-');
        if ($tmp === false) {
            throw new RuntimeException('Could not create temporary background-removal file.');
        }

        if (file_put_contents($tmp, $body, LOCK_EX) === false) {
            @unlink($tmp);
            throw new RuntimeException('Could not store image worker output.');
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($tmp);
        if ($mime !== 'image/png') {
            @unlink($tmp);
            throw new RuntimeException('Image worker returned a non-PNG payload.');
        }

        return $tmp;
    }
}
