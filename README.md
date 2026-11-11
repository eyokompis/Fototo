# fototo

Enhance the quality, light and upscale your photos, locally or with AI.

## Stack

- **Electron + TypeScript** desktop app (Vite for the renderer build)
- **WebGL2** real-time local adjustments: exposure, contrast, saturation, temperature
- **ONNX Runtime** for on-device AI: Real-ESRGAN x4 upscaling (tiled inference) and Zero-DCE low-light enhancement
- **SQLite** (via sql.js/WASM) photo library with thumbnails, stored in the app's user-data directory

The Zero-DCE model (`models/zero-dce.onnx`, ~320 KB) is bundled with the app; the Real-ESRGAN model (~5 MB) downloads on first use. Zero-DCE weights are from [Li-Chongyi/Zero-DCE](https://github.com/Li-Chongyi/Zero-DCE) (CVPR 2020), converted to ONNX with the 8-iteration curve enhancement baked in.

Photos never leave your machine.

## Development

```bash
npm install
npm run dev        # renderer dev server at http://localhost:5173
npm start          # build renderer + main, then launch the Electron app
```

In one terminal run `npm run dev`, and in a second terminal `npx electron .` for hot reload during development. `npm start` is the one-shot production-style launch.

## Scripts

| Script                | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | Vite dev server for the renderer         |
| `npm run build`       | Build renderer (`dist/`) and main (`dist-electron/`) |
| `npm run typecheck`   | Typecheck renderer and main process      |
| `npm start`           | Build everything and launch Electron     |
| `npm run dist`        | Build and package installers into `release/` |
| `npm run dist:dir`    | Build and package an unpacked app (fast smoke test) |

## Packaging & installers

Packaging uses [electron-builder](https://www.electron.build) (config in the `build` field of `package.json`). Targets: **NSIS installer** (Windows), **DMG** (macOS), **AppImage** (Linux). Each OS builds its own target — run `npm run dist` on the platform you want.

Notes:
- The Zero-DCE model ships inside the package (`extraResources`); the Real-ESRGAN model still downloads on first use
- `onnxruntime-node` is unpacked from the asar and cross-platform/CUDA binaries are pruned per OS to keep installers small
- Output lands in `release/` (gitignored)

## Releases

Installers are built automatically for every version tag. To publish a release:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds the NSIS installer (Windows), DMG (macOS, Apple Silicon and Intel), and AppImage (Linux) on GitHub Actions and attaches them to a GitHub Release. Download them from the repo's Releases page.

Note: the macOS build is unsigned, so macOS may show an "unidentified developer" warning (right-click → Open, or allow it in System Settings → Privacy & Security).

## Roadmap

- [x] App shell: Electron main/preload/renderer with secure IPC
- [x] WebGL2 adjustment pipeline (exposure, contrast, saturation, temperature)
- [x] AI upscaling via ONNX Runtime (Real-ESRGAN x4, tiled, model downloaded on first use)
- [x] Low-light enhancement via ONNX Runtime (Zero-DCE, bundled model)
- [x] Sidecar edit metadata (non-destructive edits)
- [x] Photo library with SQLite index (recent photos with thumbnails on the start screen)
- [x] Packaging with electron-builder (NSIS / DMG / AppImage) and custom app icon
- [x] Theme switcher (system / light / dark) and in-app help
- [x] Gallery view with folder import, plus 90° rotation and crop
- [x] Batch processing (select photos in the gallery, upscale or enhance them all into an output folder)

## Non-destructive edits

Adjustments are saved automatically to a sidecar file next to the photo (`photo.jpg` → `photo.jpg.fototo.json`). Reopening the photo restores them; the original file is never modified. Delete the sidecar file to start fresh.
