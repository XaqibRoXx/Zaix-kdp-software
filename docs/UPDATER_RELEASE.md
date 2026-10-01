# Zaxis KDP — Signed Auto-Update Release

Zaxis KDP uses the Tauri v2 updater. Update artifacts are signed and the installed app verifies the artifact signature before installation.

## Security rules

- Never commit the updater private key.
- Do not upload the private key as a normal build artifact.
- Keep a secure offline backup of the private key. Losing it prevents future updates from being accepted by already-installed builds.
- The public key is safe to distribute and is embedded into signed release builds.
- Signed release builds enable `requireSignedVersion` so the signed artifact version must match the update manifest version.
- Production update endpoints are HTTPS only.

## Generate the signing key once

Run this on a trusted machine:

```powershell
npm install
npm --workspace @zaxis-kdp/desktop run tauri -- signer generate -w "$HOME\.tauri\zaxis-kdp.key"
```

Keep the generated private key secure. The corresponding public key may be copied into GitHub Actions configuration.

## Required GitHub Actions secrets

Configure these repository secrets before using the **Signed Windows Release** workflow:

- `TAURI_SIGNING_PRIVATE_KEY` — private key **content**, never commit this value.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — password used when the key was generated; may be empty only if the key has no password.
- `ZAXIS_UPDATER_PUBLIC_KEY` — public key content. This is not confidential, but the workflow reads it from the same protected configuration surface to keep release configuration centralized.

The ChatGPT GitHub connection intentionally has no access to repository secret APIs, so these secret values must be entered through GitHub's repository Actions settings by an authorized repository owner.

## Publish a release

1. Open GitHub Actions.
2. Run **Signed Windows Release**.
3. Enter a new SemVer version such as `0.2.0`.
4. Enter release notes.
5. The workflow:
   - validates the signing configuration;
   - creates a temporary Tauri updater config;
   - builds signed MSI/NSIS artifacts;
   - verifies that the updater signature exists;
   - creates `latest.json`;
   - creates/updates the GitHub Release;
   - uploads installer, signature, `latest.json`, and SHA-256 evidence.

The desktop checks:

```text
https://github.com/XaqibRoXx/Zaix-kdp-software/releases/latest/download/latest.json
```

A signed release build uses passive Windows update installation. The Settings screen exposes **Check for Updates** and **Install** with download progress.

## Release verification

Before declaring auto-update complete:

1. Install version N using the normal signed installer.
2. Publish version N+1 with **Signed Windows Release**.
3. Open version N → Settings → Check for Updates.
4. Confirm N+1 is detected.
5. Install it.
6. Confirm the app reopens/runs as N+1 and project data remains intact.
7. Keep the generated `SHA256SUMS.txt` and workflow artifact as release evidence.

Auto-update remains a Phase 4 exit gate until this real N → N+1 signed update has been exercised successfully.
