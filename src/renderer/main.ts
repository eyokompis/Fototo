import { DEFAULT_ADJUSTMENTS, ImageProcessor, type Adjustments } from './processor';
import type { LoadedImage, RawImage } from './api';
import './api';
import './style.css';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const controls = document.getElementById('controls') as HTMLDivElement;
const openBtn = document.getElementById('open-btn') as HTMLButtonElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const upscaleBtn = document.getElementById('upscale-btn') as HTMLButtonElement;
const enhanceBtn = document.getElementById('enhance-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const fileNameEl = document.getElementById('file-name') as HTMLSpanElement;
const recentsGrid = document.getElementById('recents-grid') as HTMLDivElement;
const recentsSection = document.getElementById('recents') as HTMLDivElement;

const sliders: Record<keyof Adjustments, HTMLInputElement> = {
  exposure: document.getElementById('exposure') as HTMLInputElement,
  contrast: document.getElementById('contrast') as HTMLInputElement,
  saturation: document.getElementById('saturation') as HTMLInputElement,
  temperature: document.getElementById('temperature') as HTMLInputElement,
};

let processor: ImageProcessor | null = null;
let bitmap: ImageBitmap | null = null;
let currentName = 'photo.png';
let currentPath: string | null = null;
let adjustments: Adjustments = { ...DEFAULT_ADJUSTMENTS };
let busy = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function scheduleSave(): void {
  if (!currentPath) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    window.fototo.saveEdits(currentPath!, adjustments).catch(() => undefined);
  }, 400);
}

function syncSliders(): void {
  sliders.exposure.value = String(adjustments.exposure);
  sliders.contrast.value = String(adjustments.contrast);
  sliders.saturation.value = String(adjustments.saturation);
  sliders.temperature.value = String(adjustments.temperature);
}

function applyAdjustments(): void {
  processor?.render(adjustments);
}

function resetAdjustments(): void {
  adjustments = { ...DEFAULT_ADJUSTMENTS };
  syncSliders();
  applyAdjustments();
}

async function loadImage(): Promise<void> {
  const result = await window.fototo.openImage();
  if (!result) return;
  await applyLoadedImage(result);
}

async function openRecent(imagePath: string): Promise<void> {
  const result = await window.fototo.openImageAt(imagePath);
  if (!result) {
    setStatus('Could not open photo (file missing?)');
    return;
  }
  await applyLoadedImage(result);
}

async function applyLoadedImage(result: LoadedImage): Promise<void> {
  bitmap = await createImageBitmap(new Blob([result.data]));
  currentName = result.name;
  currentPath = result.path;
  fileNameEl.textContent = result.name;
  if (!processor) processor = new ImageProcessor(canvas);
  processor.setImage(bitmap);
  emptyState.hidden = true;
  canvas.hidden = false;
  controls.hidden = false;
  saveBtn.disabled = false;
  resetBtn.disabled = false;
  upscaleBtn.disabled = false;
  enhanceBtn.disabled = false;
  if (result.edits) {
    adjustments = { ...result.edits };
    syncSliders();
    applyAdjustments();
    setStatus('Loaded saved edits');
  } else {
    resetAdjustments();
  }
  recordThumbnail();
}

async function recordThumbnail(): Promise<void> {
  if (!bitmap || !currentPath) return;
  try {
    const maxDim = 160;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const thumbCanvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const blob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    await window.fototo.recordPhoto(currentPath, currentName, dataUrl);
  } catch {
    void 0;
  }
  loadRecents();
}

async function loadRecents(): Promise<void> {
  try {
    const entries = await window.fototo.recentPhotos();
    recentsSection.hidden = entries.length === 0;
    recentsGrid.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement('button');
      item.className = 'recent-item';
      item.title = entry.name;
      if (entry.thumbnail) {
        const img = document.createElement('img');
        img.src = entry.thumbnail;
        img.alt = entry.name;
        item.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.textContent = '🖼';
        item.appendChild(placeholder);
      }
      const label = document.createElement('span');
      label.textContent = entry.name;
      item.appendChild(label);
      item.addEventListener('click', () => openRecent(entry.path));
      recentsGrid.appendChild(item);
    }
  } catch {
    void 0;
  }
}

function extractPixels(): RawImage | null {
  if (!bitmap) return null;
  const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { data: pixels.data.buffer as ArrayBuffer, width: bitmap.width, height: bitmap.height };
}

async function applyResult(result: RawImage): Promise<void> {
  const imageData = new ImageData(new Uint8ClampedArray(result.data), result.width, result.height);
  bitmap = await createImageBitmap(imageData);
  processor?.setImage(bitmap);
  resetAdjustments();
  scheduleSave();
}

async function runAiAction(button: HTMLButtonElement, run: () => Promise<void>): Promise<void> {
  if (!processor || !bitmap || busy) return;
  busy = true;
  button.disabled = true;
  saveBtn.disabled = true;
  try {
    await run();
  } catch (error) {
    setStatus(`AI action failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    busy = false;
    button.disabled = false;
    saveBtn.disabled = false;
  }
}

async function upscale(): Promise<void> {
  await runAiAction(upscaleBtn, async () => {
    const image = extractPixels();
    if (!image) return;
    const status = await window.fototo.modelStatus();
    setStatus(status.downloaded ? 'Upscaling…' : 'Downloading AI model (first run)…');

    const unsubscribe = window.fototo.onProgress(({ stage, done, total }) => {
      if (stage === 'download') setStatus(`Downloading model ${done}/${total}…`);
      else setStatus(`Upscaling tile ${done}/${total}…`);
    });
    try {
      const result = await window.fototo.upscaleImage(image);
      await applyResult(result);
      setStatus(`Upscaled to ${result.width}×${result.height}`);
    } finally {
      unsubscribe();
    }
  });
}

async function enhance(): Promise<void> {
  await runAiAction(enhanceBtn, async () => {
    const image = extractPixels();
    if (!image) return;
    setStatus('Enhancing light…');
    const result = await window.fototo.enhanceImage(image);
    await applyResult(result);
    setStatus('Light enhanced');
  });
}

async function saveImage(): Promise<void> {
  if (!processor) return;
  const blob = await processor.exportBlob();
  if (!blob) return;
  const data = await blob.arrayBuffer();
  const dot = currentName.lastIndexOf('.');
  const base = dot > 0 ? currentName.slice(0, dot) : currentName;
  await window.fototo.saveImage(data, `${base}-fototo.png`);
}

openBtn.addEventListener('click', loadImage);
upscaleBtn.addEventListener('click', upscale);
enhanceBtn.addEventListener('click', enhance);

saveBtn.addEventListener('click', saveImage);

resetBtn.addEventListener('click', () => {
  resetAdjustments();
  scheduleSave();
});

for (const key of Object.keys(sliders) as (keyof Adjustments)[]) {
  sliders[key].addEventListener('input', () => {
    adjustments[key] = Number(sliders[key].value);
    applyAdjustments();
    scheduleSave();
  });
}

window.fototo
  .modelStatus()
  .then((status) => {
    upscaleBtn.title = status.downloaded
      ? `Upscale 4× with ${status.label}`
      : `Upscale 4× with ${status.label} (model downloads on first use)`;
  })
  .catch(() => undefined);

loadRecents();

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  loadImage();
});
