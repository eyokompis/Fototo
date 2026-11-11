# fototo

Enhance the quality, light and upscale your photos, locally or with AI.

## Stack

- **Electron + TypeScript** desktop app (Vite for the renderer build)
- **WebGL2** real-time local adjustments: exposure, contrast, saturation, temperature
- **ONNX Runtime** (planned) for on-device AI upscaling (Real-ESRGAN 2x/4x) and low-light enhancement

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
- [ ] Sidecar edit metadata (non-destructive edits)
- [ ] Photo library with SQLite index
- [ ] AI upscaling via ONNX Runtime (Real-ESRGAN)
- [ ] Low-light enhancement model
