# fototo

Enhance the quality, light and upscale your photos, locally or with AI.

## Stack

- **Electron + TypeScript** desktop app (Vite for the renderer build)
- **WebGL2** real-time local adjustments: exposure, contrast, saturation, temperature
- **ONNX Runtime** for on-device AI: Real-ESRGAN x4 upscaling (tiled inference) and Zero-DCE low-light enhancement

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

## Roadmap

- [x] App shell: Electron main/preload/renderer with secure IPC
- [x] WebGL2 adjustment pipeline (exposure, contrast, saturation, temperature)
- [x] AI upscaling via ONNX Runtime (Real-ESRGAN x4, tiled, model downloaded on first use)
- [x] Low-light enhancement via ONNX Runtime (Zero-DCE, bundled model)
- [x] Sidecar edit metadata (non-destructive edits)
- [ ] Photo library with SQLite index

## Non-destructive edits

Adjustments are saved automatically to a sidecar file next to the photo (`photo.jpg` → `photo.jpg.fototo.json`). Reopening the photo restores them; the original file is never modified. Delete the sidecar file to start fresh.
