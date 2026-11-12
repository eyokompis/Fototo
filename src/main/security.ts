import path from 'node:path';

export const MAX_IMAGE_BYTES = 512 * 1024 * 1024;
export const MAX_AI_INPUT_PIXELS = 25_000_000;
export const MAX_THUMBNAIL_LENGTH = 1_500_000;

export interface ImageEdits {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

const EDIT_RANGES: Record<keyof ImageEdits, [number, number]> = {
  exposure: [-2, 2],
  contrast: [0.5, 1.8],
  saturation: [0, 2],
  temperature: [-0.5, 0.5],
};

export function validateImageEdits(value: unknown): value is ImageEdits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const edits = value as Record<string, unknown>;
  const keys = Object.keys(EDIT_RANGES);
  if (Object.keys(edits).length !== keys.length || keys.some((key) => !(key in edits))) return false;
  return keys.every((key) => {
    const number = edits[key];
    const [min, max] = EDIT_RANGES[key as keyof ImageEdits];
    return typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max;
  });
}

export function validateImageBuffer(data: unknown, width: unknown, height: unknown): data is ArrayBuffer {
  if (!(data instanceof ArrayBuffer)) return false;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return false;
  const w = width as number;
  const h = height as number;
  if (w < 1 || h < 1 || w * h > MAX_AI_INPUT_PIXELS) return false;
  return data.byteLength === w * h * 4 && data.byteLength <= MAX_IMAGE_BYTES;
}

export function validateExportFileName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 5 || value.length > 180) return false;
  if (value !== path.basename(value) || value === '.' || value === '..') return false;
  if (/[\\/\0<>:"|?*]/.test(value) || value.endsWith('.') || value.endsWith(' ')) return false;
  return /\.(png|jpe?g)$/i.test(value);
}

export function validateImageName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\0\\/]/.test(value);
}

export function validateThumbnail(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === 'string'
    && value.length <= MAX_THUMBNAIL_LENGTH
    && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);
}

export function validateBinaryExport(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer && value.byteLength > 0 && value.byteLength <= MAX_IMAGE_BYTES;
}

export function validateImageExtension(filePath: string): boolean {
  return new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp'])
    .has(path.extname(filePath).toLowerCase());
}
