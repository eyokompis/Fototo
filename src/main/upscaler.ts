import { app } from 'electron';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as ort from 'onnxruntime-node';

export interface ModelFile {
  url: string;
  name: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  scale: number;
  tileSize: number;
  pad: number;
  files: ModelFile[];
}

export const REAL_ESRGAN_X4: ModelInfo = {
  id: 'realesrgan-x4',
  label: 'Real-ESRGAN x4',
  scale: 4,
  tileSize: 128,
  pad: 8,
  files: [
    {
      url: 'https://huggingface.co/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.onnx',
      name: 'model.onnx',
    },
    {
      url: 'https://huggingface.co/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.data',
      name: 'model.data',
    },
  ],
};

export const MAX_OUTPUT_PIXELS = 100_000_000;

export interface UpscaleProgress {
  stage: 'download' | 'upscale';
  done: number;
  total: number;
}

export interface UpscaleResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const sessions = new Map<string, ort.InferenceSession>();

function modelDir(model: ModelInfo): string {
  return path.join(app.getPath('userData'), 'models', model.id);
}

function modelFilePath(model: ModelInfo, file: ModelFile): string {
  return path.join(modelDir(model), file.name);
}

export async function isModelDownloaded(model: ModelInfo): Promise<boolean> {
  try {
    await Promise.all(model.files.map((file) => fs.access(modelFilePath(model, file))));
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, destPath: string, onProgress: (received: number, total: number) => void): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed: HTTP ${response.status} for ${url}`);
  }
  const total = Number(response.headers.get('content-length') ?? 0);
  let received = 0;
  const stream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  stream.on('data', (chunk: Buffer) => {
    received += chunk.length;
    onProgress(received, total);
  });
  const partPath = `${destPath}.part`;
  await pipeline(stream, createWriteStream(partPath));
  await fs.rename(partPath, destPath);
}

export async function downloadModel(model: ModelInfo, onProgress: (progress: UpscaleProgress) => void): Promise<void> {
  await fs.mkdir(modelDir(model), { recursive: true });
  let done = 0;
  for (const file of model.files) {
    onProgress({ stage: 'download', done, total: model.files.length });
    await downloadFile(file.url, modelFilePath(model, file), () => undefined);
    done += 1;
  }
  onProgress({ stage: 'download', done, total: model.files.length });
}

async function getSession(model: ModelInfo): Promise<ort.InferenceSession> {
  const existing = sessions.get(model.id);
  if (existing) return existing;
  const session = await ort.InferenceSession.create(modelFilePath(model, model.files[0]));
  sessions.set(model.id, session);
  return session;
}

function tileToTensor(rgba: Uint8ClampedArray, width: number, x0: number, y0: number, regionW: number, regionH: number, size: number): ort.Tensor {
  const region = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(regionH - 1, y);
    for (let x = 0; x < size; x++) {
      const sx = Math.min(regionW - 1, x);
      const si = ((y0 + sy) * width + (x0 + sx)) * 4;
      const di = (y * size + x) * 4;
      region[di] = rgba[si];
      region[di + 1] = rgba[si + 1];
      region[di + 2] = rgba[si + 2];
    }
  }
  const plane = size * size;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    chw[i] = region[i * 4] / 255;
    chw[plane + i] = region[i * 4 + 1] / 255;
    chw[2 * plane + i] = region[i * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', chw, [1, 3, size, size]);
}

export async function upscaleImage(
  model: ModelInfo,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  onProgress: (progress: UpscaleProgress) => void,
): Promise<UpscaleResult> {
  if (width * height * model.scale * model.scale > MAX_OUTPUT_PIXELS) {
    throw new Error('Image is too large to upscale (output would exceed 100 megapixels)');
  }
  const session = await getSession(model);
  const { scale, tileSize, pad } = model;
  const outWidth = width * scale;
  const outHeight = height * scale;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);

  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const total = cols * rows;
  let done = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx = col * tileSize;
      const ty = row * tileSize;
      const tw = Math.min(tileSize, width - tx);
      const th = Math.min(tileSize, height - ty);
      const x0 = Math.max(0, tx - pad);
      const y0 = Math.max(0, ty - pad);
      const x1 = Math.min(width, tx + tw + pad);
      const y1 = Math.min(height, ty + th + pad);

      const input = tileToTensor(rgba, width, x0, y0, x1 - x0, y1 - y0, tileSize);
      const results = await session.run({ image: input });
      const output = results.upscaled_image;
      const [, , oh, ow] = output.dims;
      const od = output.data as Float32Array;
      const plane = oh * ow;

      for (let y = 0; y < th * scale; y++) {
        const oy = y0 * scale + (ty - y0) * scale + y;
        for (let x = 0; x < tw * scale; x++) {
          const ox = x0 * scale + (tx - x0) * scale + x;
          const oi = (oy * outWidth + ox) * 4;
          const idx = y * ow + x;
          out[oi] = od[idx];
          out[oi + 1] = od[plane + idx];
          out[oi + 2] = od[2 * plane + idx];
          out[oi + 3] = 255;
        }
      }

      done += 1;
      onProgress({ stage: 'upscale', done, total });
    }
  }

  return { data: out, width: outWidth, height: outHeight };
}
