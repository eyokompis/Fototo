import { app } from 'electron';
import path from 'node:path';
import * as ort from 'onnxruntime-node';

export const MAX_ENHANCE_PIXELS = 100_000_000;

let session: ort.InferenceSession | null = null;

function modelPath(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, 'models', 'zero-dce.onnx');
}

async function getSession(): Promise<ort.InferenceSession> {
  if (!session) {
    session = await ort.InferenceSession.create(modelPath());
  }
  return session;
}

export interface EnhanceResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function enhanceLowLight(rgba: Uint8ClampedArray, width: number, height: number): Promise<EnhanceResult> {
  if (width * height > MAX_ENHANCE_PIXELS) {
    throw new Error('Image is too large to enhance (exceeds 100 megapixels)');
  }
  const ort_session = await getSession();
  const plane = width * height;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    chw[i] = rgba[i * 4] / 255;
    chw[plane + i] = rgba[i * 4 + 1] / 255;
    chw[2 * plane + i] = rgba[i * 4 + 2] / 255;
  }

  const results = await ort_session.run({ image: new ort.Tensor('float32', chw, [1, 3, height, width]) });
  const out = results.enhanced_image.data as Float32Array;

  const enhanced = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i++) {
    enhanced[i * 4] = out[i] * 255;
    enhanced[i * 4 + 1] = out[plane + i] * 255;
    enhanced[i * 4 + 2] = out[2 * plane + i] * 255;
    enhanced[i * 4 + 3] = 255;
  }
  return { data: enhanced, width, height };
}
