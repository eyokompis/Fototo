# Security Threat Model and Safe IPC Contract

**Status:** P0 implementation in progress on this branch; remaining P1/P2 controls are not yet implemented  
**Scope:** Electron main process, preload bridge, renderer, local files, local AI inference, model downloads, and application updates.  
**Branch:** `architecture/fototo-next`

This document records risks visible in the current code and defines the security contract that should guide subsequent implementation. It is not a penetration-test report. Findings are based on source inspection; runtime behavior and exploitability have not yet been independently tested.

## 1. Security objectives

Fototo is a local-first desktop photo editor. Its security model should preserve that promise while assuming that renderer input can be malformed or compromised.

1. The renderer must not be able to read or write arbitrary filesystem paths.
2. The main process must treat every IPC argument as untrusted, even when TypeScript types exist.
3. File access must follow an explicit user action or a previously established, main-process-owned authorization.
4. Export operations must stay inside the destination selected by the user and must not overwrite existing files unexpectedly.
5. Image and AI workloads must have explicit byte, dimension, pixel, and memory limits.
6. Remote model and application updates must be integrity-checked and fail safely.
7. Navigation, window creation, permissions, and content loading must be restricted to the application.
8. Privacy claims and export behavior must be clear, especially for retained EXIF/GPS metadata.

## 2. Assets and trust boundaries

### Assets to protect

- User photos and their embedded metadata, including GPS coordinates.
- User-selected input and export directories.
- Photo edit sidecars (`.fototo.json`) and the local gallery database.
- Downloaded ONNX model files and model execution.
- Application binaries and update packages.
- User data directory contents and filesystem integrity.

### Trust boundaries

| Boundary | Treat as untrusted | Required control |
|---|---|---|
| Renderer → preload | All values, paths, buffers, object shapes | Narrow typed API; no raw IPC exposure |
| Preload → main IPC | Arguments and sender/frame identity | Runtime schema validation and trusted-sender checks |
| Renderer → filesystem | File/drop paths and destination paths | Main-owned grants/opaque IDs; user-mediated dialogs |
| Network → model storage | Redirects, response sizes, bytes, remote artifacts | HTTPS, pinned digest/version, size limits, atomic install |
| Update service → installed app | Update metadata and packages | Signed updates, trusted feed, controlled install UX |
| Image file → decoder/AI | File bytes, dimensions, decompression behavior | File-size and decoded-pixel limits; bounded processing |

The renderer is not a security boundary. Context isolation and sandboxing reduce exposure but do not make renderer-provided data trustworthy.

## 3. Existing protections

The current BrowserWindow configuration already enables:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

The preload uses `contextBridge.exposeInMainWorld` and exposes specific methods rather than exposing `ipcRenderer` itself. These are good foundations and should be preserved.

## 4. Findings in the inspected baseline

Severity describes the risk if the relevant input or execution path is reachable; it is not a claim that a remote exploit has been demonstrated.

### Confirmed from source inspection

| Priority | Finding | Evidence / impact |
|---|---|---|
| High | Renderer-controlled arbitrary path read | **Mitigated in this branch:** `open-image-at` accepts only a random main-process photo ID created by a native open dialog, an authorized drop, or a main-process gallery lookup. The renderer no longer receives or supplies the source path. Runtime integration testing remains outstanding. |
| High | Renderer-controlled arbitrary sidecar write | **Mitigated in this branch:** `save-edits` resolves a main-owned photo ID and validates the complete edit object and numeric ranges before writing the sidecar. |
| High | Export path traversal / destination escape | **Mitigated in this branch:** the renderer receives an opaque destination token from the native folder dialog; export names must be safe basenames with PNG/JPEG extensions, and files are created exclusively (`wx`) with collision-safe suffixes. |
| High | IPC handlers lack visible sender validation | **Mitigated in this branch:** every registered invoke handler checks the main frame and the configured Vite origin or packaged app document before doing privileged work. |
| Medium | AI payload shape and byte length are not validated at the IPC boundary | **Mitigated in this branch:** AI IPC validates ArrayBuffer type, positive safe-integer dimensions, exact RGBA byte length, and a 25-megapixel input cap before constructing typed arrays. |
| Medium | No Content Security Policy is present in the inspected `index.html` | There is no CSP meta policy in the document. A policy must be designed for both Vite development and packaged `file://` loading, then tested in both modes. |
| Medium | Navigation and new-window restrictions are not visible | The inspected window setup does not register `will-navigate` or `setWindowOpenHandler` policies. |
| Medium | Gallery limit is not validated | **Mitigated in this branch:** gallery limits are normalized to the range 1–2,000, with a default of 60. |
| Medium | Model downloads are not visibly integrity-pinned or size-bounded | Model URLs point at Hugging Face `resolve/main`; the code streams files to disk without an expected digest or maximum byte count. A moving branch is not a stable artifact identity. |
| Medium | Update download/install is automatic | Packaged builds enable `autoDownload` and `autoInstallOnAppQuit`. Review the configured update feed, signing verification, release process, and whether users should be able to defer installation. |

### Potential / requires further verification

- A compromised renderer could potentially invoke privileged handlers if it can reach the exposed bridge. The absence of sender checks increases impact, but a renderer compromise path has not been demonstrated.
- The current `save-image-to` behavior may also permit writes outside the selected folder through absolute or platform-specific path forms. Exact behavior depends on platform path semantics; enforce containment rather than relying on assumptions.
- File and image decoding may allow excessive memory or CPU consumption before existing pixel caps are reached. The import path reads the complete file into memory; compressed file size and decoded dimensions need separate limits.
- A compromised or malicious update/model source could affect users if artifact authenticity is not independently verified. No signature bypass or malicious artifact has been demonstrated.
- CSP compatibility and the minimum safe policy are not yet verified against the complete renderer asset graph.

## 4.1 P0 implementation status on `architecture/fototo-next`

The following changes have been implemented on this branch and have not been merged into `main`:

- `src/main/main.ts`: centralized sender/main-frame/origin validation on every invoke handler; main-process photo-ID and export-directory registries; file type/size checks; edit, thumbnail, AI payload and export validation; exclusive collision-safe batch export writes.
- `src/main/preload.ts`: narrow bridge methods now pass opaque photo IDs and destination tokens instead of arbitrary source and destination paths. Drag-and-drop resolves a real dropped `File` through `webUtils` in preload.
- `src/renderer/api.ts` and `src/renderer/main.ts`: updated gallery, recents, autosave, drag/drop and batch-export flows to use opaque references.
- `src/main/security.ts`: shared runtime validation helpers.
- `tests/security.test.cjs`: Node built-in regression tests for edit ranges, AI payload dimensions/byte lengths, export traversal, filenames, thumbnails and image types.
- `package.json` and CI: `npm test` builds the main-process TypeScript and runs the security tests; CI now runs on `architecture/**` branches and skips the optional ONNX CUDA provider download because this project exercises the CPU provider in CI.

**Verification:** GitHub Actions run 43136820521 completed the build job successfully: `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` all passed. The packaging job was still running when this document was updated. This is not a substitute for runtime testing of the packaged Electron app, cross-platform filesystem behavior, or adversarial renderer integration tests.

## 5. Required safe IPC contract

### 5.1 Sender and frame validation

Every privileged IPC handler must verify that the request comes from the expected application window and main frame.

- Reject requests from destroyed, unexpected, or non-main frames.
- In development, allow only the configured local Vite origin.
- In packaged builds, allow only the app's own loaded document.
- Do not accept requests from arbitrary remote origins.
- Apply the check centrally so new handlers cannot silently omit it.

### 5.2 Runtime argument validation

TypeScript declarations are not runtime validation. Validate all incoming values at the main-process boundary.

- Validate object shape and reject unexpected types.
- Validate strings for length, emptiness, NUL characters, and platform-specific invalid forms.
- Validate numbers as finite safe integers where appropriate.
- Clamp bounded numeric settings to documented ranges.
- Validate enum values explicitly.
- Validate buffers before allocation or conversion.
- Return structured, non-sensitive errors; do not leak arbitrary local paths or stack traces to the renderer.

Prefer one small validation layer with reusable schemas/helpers over scattered ad hoc checks.

### 5.3 File authorization and path ownership

The main process should own filesystem authority.

**Preferred API shape:**

- `openImage()` opens the native file dialog and returns an opaque `photoId` plus display metadata and image bytes (or a bounded stream/chunk interface).
- `openRecent(photoId)` resolves the photo ID from a main-process-owned registry/database and verifies that the file still exists and is an allowed regular file.
- `saveEdits(photoId, edits)` resolves the original path internally. The renderer never chooses a sidecar path.
- `chooseExportDirectory()` returns an opaque destination token, not a raw path.
- `exportImage(destinationToken, safeFileName, data)` resolves the selected directory internally and writes only within it.

If an opaque registry is introduced, define its lifecycle and persistence deliberately. A persisted gallery record is not, by itself, proof of current user authorization: verify the path and expected file type when reopening it. Revalidate symlinks and path containment at the time of use.

For drag-and-drop, do not treat an arbitrary string from the renderer as a trusted path. Use a deliberate main-process authorization flow and retain the current user-visible drop behavior.

### 5.4 Safe export rules

- The renderer supplies a filename, never a directory path.
- Normalize to a single basename; reject `.`, `..`, separators, NUL, reserved names, and unexpected extensions.
- The main process appends or enforces the selected export extension.
- Resolve the final path and verify it remains inside the selected directory.
- Avoid time-of-check/time-of-use races. Prefer exclusive creation (`wx`) and retry with a generated suffix rather than checking existence and then writing.
- Never overwrite an existing file unless the user explicitly chose an overwrite flow.
- Apply a maximum export byte size before writing.
- Keep the native save-dialog flow for single exports where it provides a clear user authorization boundary.

### 5.5 Image and AI payload limits

At the IPC boundary, before constructing typed arrays or allocating output buffers:

- Require positive safe-integer width and height.
- Require `data.byteLength === width * height * 4`, with overflow-safe arithmetic.
- Enforce a maximum compressed input byte size before decoding and a separate maximum decoded pixel count.
- Enforce output pixel and output byte limits for each AI operation.
- Reject malformed or detached buffers and unsupported payload shapes.
- Prevent concurrent jobs from exceeding a documented memory budget; serialize or queue expensive inference where necessary.
- Ensure progress events are sent only to the requesting, still-authorized webContents.

A pixel cap alone is insufficient: 100 megapixels of RGBA input is approximately 400 MB, and model tensors, output buffers, and renderer copies can multiply peak memory use.

## 6. Electron window and document policy

1. Keep context isolation, sandboxing, and disabled Node integration enabled.
2. Add a restrictive `will-navigate` policy. Block unexpected navigation; explicitly allow only the app document and the configured development origin.
3. Deny new windows by default with `setWindowOpenHandler`. If external links are needed, validate an explicit HTTPS allowlist and open them through the system browser from the main process.
4. Set a restrictive permission policy with `session.setPermissionRequestHandler`; deny permissions not explicitly required. Revisit only if a future feature needs one.
5. Add a CSP that starts from a deny-by-default policy and explicitly permits only required local scripts, styles, images, workers, and development-server connections. Avoid `unsafe-eval` in production. Do not blindly copy a development CSP into the packaged build.
6. Keep remote content out of the privileged application window.
7. Review external protocol handling and ensure arbitrary protocols cannot be launched from renderer-controlled strings.

## 7. Model and updater supply-chain controls

### AI model artifacts

- Replace moving `main` download references with immutable version/revision URLs.
- Pin a SHA-256 digest and expected maximum size for every model file.
- Verify digest and size before the model is made available to inference.
- Download to a temporary file, verify it, then atomically move it into the model directory.
- Handle partial downloads and interrupted installs safely.
- Surface model identity/version and download consent clearly.
- Keep image bytes local; the model download must never include user photos.

### Application updates

- Verify the production update feed is controlled by the project and uses HTTPS.
- Preserve platform code-signature and updater signature verification; test invalid and tampered update cases.
- Document how releases are built, signed, and published, and protect release credentials outside the repository.
- Consider notifying users and allowing deferral instead of silently downloading and installing on quit.
- Do not disable signature checks to make local testing easier.

## 8. Privacy and local-data handling

- The current help text says photos are never uploaded and processing is local. Keep that statement accurate as features evolve.
- The Real-ESRGAN model download is network traffic, but it should contain model artifacts only—not photo content or identifying photo metadata.
- JPEG export currently retains EXIF, including GPS, according to the in-app help text. Add a clear export choice to preserve or strip metadata, with a privacy-safe default considered for sharing workflows.
- Treat thumbnails, the gallery database, edit sidecars, and logs as user data. Avoid logging full paths or sensitive metadata.
- Document where models, gallery data, and sidecars are stored and how users can clear them.

## 9. Test requirements

Security tests should be automated where possible and run on supported operating systems.

### IPC and authorization

- Reject calls from an unexpected origin, frame, or destroyed window.
- Reject malformed arguments, wrong types, oversized strings, NaN/Infinity, negative values, and unexpected object shapes.
- Verify that a renderer cannot read an arbitrary path through `open-image-at`.
- Verify that a renderer cannot write arbitrary sidecars through `save-edits`.
- Verify that photo IDs cannot be substituted or guessed to access ungranted files.

### Export

- Reject `../`, absolute paths, Windows drive paths, UNC paths, path separators, NUL bytes, and reserved names in filenames.
- Verify resolved paths remain inside the chosen destination on Windows, macOS, and Linux.
- Verify existing files are not overwritten and concurrent exports cannot race into an overwrite.
- Verify cancellation and invalid destination tokens fail safely.

### Image and AI

- Reject dimensions of zero, negative, fractional, unsafe-integer, and excessively large values.
- Reject byte-length mismatches and oversized buffers before typed-array allocation.
- Test output caps, concurrent job limits, cancellation, and recovery from inference errors.
- Test corrupt, truncated, and decompression-bomb-like image inputs.

### Window and supply chain

- Verify navigation and popup attempts are blocked.
- Verify unneeded permission requests are denied.
- Verify CSP in both development and packaged builds.
- Verify model checksum mismatch, oversized download, redirect failure, interrupted download, and retry behavior.
- Verify updater signature/tamper failure and offline behavior.

### Regression coverage

Security changes must preserve:
- Open via dialog and drag/drop.
- Reopen recent photos and gallery import.
- Autosaved edits and sidecar restoration.
- Single-image export and batch export.
- Local AI enhancement and upscaling, including progress reporting.
- Cancelled dialogs and missing/deleted source files.

## 10. Recommended implementation order

1. **P0 — Close filesystem authority gaps:** replace renderer-supplied paths with main-owned photo/destination handles; harden export filename and containment; add sender/frame validation.
2. **P0 — Validate IPC and AI payloads:** introduce centralized runtime schemas and memory/byte budgets before allocation.
3. **P1 — Harden the window:** navigation and popup policy, permission denial by default, CSP verified in dev and packaged modes.
4. **P1 — Secure model delivery:** immutable model revision, SHA-256 pinning, size limits, atomic install.
5. **P1 — Verify updater chain:** feed ownership, signatures, release process, and user-facing update behavior.
6. **P2 — Privacy controls:** EXIF/GPS export choice, data-location/clear-data guidance, privacy copy review.
7. **P2 — Add automated security and regression tests:** make them part of CI before considering the hardening complete.

## 11. Definition of done

Security hardening is complete only when:

- No renderer-controlled arbitrary filesystem path reaches a privileged read or write operation.
- Every privileged IPC handler validates both sender and arguments.
- Export writes are proven to remain within a user-selected destination and cannot overwrite silently.
- Image/AI inputs and outputs have tested resource limits.
- Window navigation, popups, permissions, and CSP are explicitly controlled.
- Model and updater integrity checks are verified by negative tests.
- Existing photo workflows pass regression tests on supported platforms.
- Documentation and privacy statements match actual application behavior.
