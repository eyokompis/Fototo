# Release and update security

**Branch:** `architecture/fototo-next`  
**Applies to:** GitHub Releases, Windows NSIS, macOS DMG, Linux AppImage

## Current decision

## Branch-only status

All controls described here currently exist only on `architecture/fototo-next`. The existing `main` branch and already published application builds have not been changed. The manual Release workflow becomes available from the `main` branch only after these changes have been reviewed and explicitly merged. Do not treat the branch's workflow as an active production release process before that point.

The project currently pins `electron-builder` 26.18.0 and `electron-updater` 6.8.11. The stable v26 toolchain does not provide the Ed25519 signed update-manifest verification introduced in electron-builder v27. v27 is still prerelease in the currently reviewed package registry, so Fototo does not jump to an alpha release merely to obtain this security feature.

Until the stable toolchain supports signed manifests and the release key is provisioned:

- Automatic update polling and installation are disabled in the application.
- The release workflow does not upload `latest*.yml` or `.blockmap` files.
- Updates must be installed manually from a reviewed GitHub draft release.
- Windows and macOS packaging is configured to fail if platform code signing cannot be performed.
- This is a deliberate fail-closed transition, not a claim that signed update manifests are already active.

Older installed versions still contain their original updater code. Because new releases omit update metadata, those older clients should not receive a valid new update manifest from newly created releases; users must install the new signed build manually. This behavior needs to be confirmed in an end-to-end test before publishing a release.

## Release procedure

1. Protect `main` with required review and CI checks in GitHub repository settings.
2. Create a semantic version tag (`vMAJOR.MINOR.PATCH`) on a commit already reachable from `main`.
3. Open GitHub Actions → Release, select the `main` branch, and manually dispatch the workflow with the exact tag.
4. The workflow independently checks the tag format and verifies that its commit is an ancestor of `origin/main`.
5. Windows, macOS, and Linux builds run in parallel. The Windows and macOS builds fail closed unless signing succeeds.
6. The workflow creates a **draft** GitHub Release containing only platform installers. It refuses to overwrite an existing release.
7. Review the artifacts, signatures, notarization, release notes, and smoke-test results before manually publishing the draft.

The workflow intentionally does not trigger on tag pushes. That ensures the workflow definition used for a release is loaded from `main`, rather than from an arbitrary tag commit.

## Required GitHub Actions secrets

Configure these under repository Settings → Secrets and variables → Actions. Never commit certificates, passwords, API keys, or private keys.

| Secret | Purpose |
|---|---|
| `WIN_CSC_LINK` | Base64-encoded or path/URL-accessible Windows Authenticode certificate |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows signing certificate |
| `CSC_LINK` | Apple Developer ID Application certificate for macOS |
| `CSC_KEY_PASSWORD` | Password for the Apple signing certificate |
| `APPLE_ID` | Apple account used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

The release workflow injects these values only into build jobs. Missing or invalid signing credentials should cause the corresponding platform build to fail; do not disable `forceCodeSigning` to make a release pass.

Linux AppImage currently has no equivalent publisher code-signing configuration in this project. Its release remains a manual-review artifact and automatic updates remain disabled.

## Signed update manifests — next gated milestone

When a stable electron-builder release supports Ed25519 signed update manifests:

1. Upgrade electron-builder and electron-updater together following the official v26-to-v27 migration guide; do not adopt an alpha in production.
2. Generate a dedicated Ed25519 update keypair once using `electron-builder create-update-key`.
3. Store only the base64-encoded private PEM as the GitHub Actions secret `ELECTRON_BUILDER_UPDATE_SIGN_KEY`. Keep an offline backup under controlled access; never commit it.
4. Build a transition release that embeds the matching public key in `app-update.yml` and signs every `latest*.yml`.
5. Verify the packaged app and every manifest using `electron-builder verify`.
6. Add negative tests for unsigned, tampered, wrong-key, and artifact-hash-mismatched manifests.
7. Re-enable automatic updates only after signed manifests are present for every supported updater platform and code-signature checks pass on real Windows/macOS installations.

Important: once an installed version embeds a trusted manifest public key, it will reject unsigned manifests. Do not publish a later unsigned manifest or rotate the key without following the documented dual-signing transition.

## Repository settings still required

Workflow code cannot replace repository-level authorization controls. Configure a GitHub ruleset/branch protection policy that:

- Requires pull requests and passing CI before changes reach `main`.
- Restricts who can push or create release tags matching `v*`.
- Prevents force-pushes and deletion of protected release tags.
- Restricts who can run the Release workflow and publish GitHub Releases.

These settings have not been changed by this code update and must be verified in GitHub repository settings.

## Verification boundaries

The workflow and config are covered by static regression tests and CI. This does not yet prove that the repository has the required secrets, that Windows/macOS signing certificates are valid, or that notarization and installation work on end-user machines. A release must remain a draft until those checks pass.
