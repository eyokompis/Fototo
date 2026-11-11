import { DEFAULT_ADJUSTMENTS, ImageProcessor, type Adjustments } from './processor';
import './api';
import './style.css';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const controls = document.getElementById('controls') as HTMLDivElement;
const openBtn = document.getElementById('open-btn') as HTMLButtonElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const fileNameEl = document.getElementById('file-name') as HTMLSpanElement;

const sliders: Record<keyof Adjustments, HTMLInputElement> = {
  exposure: document.getElementById('exposure') as HTMLInputElement,
  contrast: document.getElementById('contrast') as HTMLInputElement,
  saturation: document.getElementById('saturation') as HTMLInputElement,
  temperature: document.getElementById('temperature') as HTMLInputElement,
};

let processor: ImageProcessor | null = null;
let bitmap: ImageBitmap | null = null;
let currentName = 'photo.png';
let adjustments: Adjustments = { ...DEFAULT_ADJUSTMENTS };

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
  bitmap = await createImageBitmap(new Blob([result.data]));
  currentName = result.name;
  fileNameEl.textContent = result.name;
  if (!processor) processor = new ImageProcessor(canvas);
  processor.setImage(bitmap);
  emptyState.hidden = true;
  canvas.hidden = false;
  controls.hidden = false;
  saveBtn.disabled = false;
  resetBtn.disabled = false;
  resetAdjustments();
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

saveBtn.addEventListener('click', saveImage);

resetBtn.addEventListener('click', resetAdjustments);

for (const key of Object.keys(sliders) as (keyof Adjustments)[]) {
  sliders[key].addEventListener('input', () => {
    adjustments[key] = Number(sliders[key].value);
    applyAdjustments();
  });
}

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  loadImage();
});
