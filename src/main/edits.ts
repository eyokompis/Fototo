import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ImageEdits {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

export const DEFAULT_EDITS: ImageEdits = {
  exposure: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
};

const RANGES: Record<keyof ImageEdits, [number, number]> = {
  exposure: [-2, 2],
  contrast: [0.5, 1.8],
  saturation: [0, 2],
  temperature: [-0.5, 0.5],
};

function sidecarPath(imagePath: string): string {
  return `${imagePath}.fototo.json`;
}

export async function loadEdits(imagePath: string): Promise<ImageEdits | null> {
  let raw: string;
  try {
    raw = await fs.readFile(sidecarPath(imagePath), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { adjustments?: Record<string, unknown> };
    const source = parsed.adjustments ?? {};
    const edits: ImageEdits = { ...DEFAULT_EDITS };
    for (const key of Object.keys(RANGES) as (keyof ImageEdits)[]) {
      const value = Number(source[key]);
      if (!Number.isFinite(value)) continue;
      const [min, max] = RANGES[key];
      edits[key] = Math.min(max, Math.max(min, value));
    }
    return edits;
  } catch {
    return null;
  }
}

export async function saveEdits(imagePath: string, edits: ImageEdits): Promise<void> {
  const payload = { version: 1, adjustments: edits };
  const target = sidecarPath(imagePath);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmp, target);
}
