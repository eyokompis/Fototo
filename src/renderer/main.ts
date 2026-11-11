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
const up2Btn = document.getElementById('up2-btn') as HTMLButtonElement;
const up4Btn = document.getElementById('up4-btn') as HTMLButtonElement;
const res2kBtn = document.getElementById('res-2k') as HTMLButtonElement;
const res4kBtn = document.getElementById('res-4k') as HTMLButtonElement;
const res8kBtn = document.getElementById('res-8k') as HTMLButtonElement;
const enhanceBtn = document.getElementById('enhance-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const fileNameEl = document.getElementById('file-name') as HTMLSpanElement;
const recentsGrid = document.getElementById('recents-grid') as HTMLDivElement;
const recentsSection = document.getElementById('recents') as HTMLDivElement;
const galleryBtn = document.getElementById('gallery-btn') as HTMLButtonElement;
const galleryDialog = document.getElementById('gallery-dialog') as HTMLDialogElement;
const galleryCloseBtn = document.getElementById('gallery-close') as HTMLButtonElement;
const galleryGrid = document.getElementById('gallery-grid') as HTMLDivElement;
const galleryEmpty = document.getElementById('gallery-empty') as HTMLParagraphElement;
const importFolderBtn = document.getElementById('import-folder-btn') as HTMLButtonElement;
const gallerySelectBtn = document.getElementById('gallery-select-btn') as HTMLButtonElement;
const batchBar = document.getElementById('batch-bar') as HTMLDivElement;
const batchCount = document.getElementById('batch-count') as HTMLSpanElement;
const batchUpscaleBtn = document.getElementById('batch-upscale') as HTMLButtonElement;
const batchEnhanceBtn = document.getElementById('batch-enhance') as HTMLButtonElement;
const batchDoneBtn = document.getElementById('batch-done') as HTMLButtonElement;
const zoomInBtn = document.getElementById('zoom-in') as HTMLButtonElement;
const zoomOutBtn = document.getElementById('zoom-out') as HTMLButtonElement;
const zoomFitBtn = document.getElementById('zoom-fit') as HTMLButtonElement;
const progressEl = document.getElementById('progress') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const rotateCcwBtn = document.getElementById('rotate-ccw') as HTMLButtonElement;
const rotateCwBtn = document.getElementById('rotate-cw') as HTMLButtonElement;
const cropBtn = document.getElementById('crop-btn') as HTMLButtonElement;
const cropApplyBtn = document.getElementById('crop-apply') as HTMLButtonElement;
const cropCancelBtn = document.getElementById('crop-cancel') as HTMLButtonElement;
const transformRow = document.getElementById('transform-row') as HTMLDivElement;
const cropActions = document.getElementById('crop-actions') as HTMLDivElement;
const cropOverlay = document.getElementById('crop-overlay') as HTMLDivElement;
const cropSelection = document.getElementById('crop-selection') as HTMLDivElement;
const mainEl = document.querySelector('main') as HTMLElement;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const helpBtn = document.getElementById('help-btn') as HTMLButtonElement;
const helpCloseBtn = document.getElementById('help-close') as HTMLButtonElement;
const helpDialog = document.getElementById('help-dialog') as HTMLDialogElement;

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
let zoom: number | null = null;
let originalBitmap: ImageBitmap | null = null;
let progressTimer: ReturnType<typeof setTimeout> | null = null;
let cropping = false;
let cropDragging = false;
let cropOrigin: { x: number; y: number } | null = null;
let selecting = false;
let batchBusy = false;
const selectedPaths = new Set<string>();

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function showProgress(label: string, fraction: number | null): void {
  setStatus(label);
  progressEl.hidden = false;
  progressFill.classList.remove('indeterminate');
  if (fraction === null) {
    progressFill.classList.add('indeterminate');
    progressFill.style.width = '';
  } else {
    progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  }
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
}

function finishProgress(message: string): void {
  setStatus(message);
  progressFill.classList.remove('indeterminate');
  progressFill.style.width = '100%';
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    progressEl.hidden = true;
    progressFill.style.width = '0%';
    progressTimer = null;
  }, 1500);
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
  exitCrop();
  hideBefore();
  bitmap = await createImageBitmap(new Blob([result.data]));
  originalBitmap = bitmap;
  zoom = null;
  applyZoom();
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

function extractPixels(source: ImageBitmap): RawImage | null {
  const offscreen = new OffscreenCanvas(source.width, source.height);
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  return { data: pixels.data.buffer as ArrayBuffer, width: source.width, height: source.height };
}

async function applyBitmap(bm: ImageBitmap): Promise<void> {
  bitmap = bm;
  processor?.setImage(bitmap);
  applyZoom();
  resetAdjustments();
  scheduleSave();
}

async function applyResult(result: RawImage): Promise<void> {
  await applyBitmap(await createImageBitmap(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height)));
}

async function resizeBitmap(source: ImageBitmap, w: number, h: number): Promise<ImageBitmap> {
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return createImageBitmap(offscreen);
}

async function runUpscaleOption(button: HTMLButtonElement, option: number): Promise<void> {
  await runAiAction(button, async () => {
    if (!bitmap) return;
    const image = extractPixels(bitmap);
    if (!image) return;
    const long = Math.max(bitmap.width, bitmap.height);
    let targetLong: number;
    let capped = false;
    if (option <= 8) {
      targetLong = long * option;
    } else {
      if (option / long <= 1.05) {
        setStatus(`Photo is already ${long}px on its long side — nothing to do`);
        return;
      }
      targetLong = Math.round(Math.min(option, long * 4));
      capped = targetLong < option;
    }
    const s = targetLong / long;
    const targetW = Math.max(1, Math.round(bitmap.width * s));
    const targetH = Math.max(1, Math.round(bitmap.height * s));
    const result = await runUpscale(image, currentName);
    let out = await createImageBitmap(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height));
    if (out.width !== targetW || out.height !== targetH) {
      out = await resizeBitmap(out, targetW, targetH);
    }
    await applyBitmap(out);
    finishProgress(`Upscaled to ${bitmap.width}×${bitmap.height}${capped ? ' (max 4×)' : ''}`);
  });
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

async function runUpscale(image: RawImage, label: string): Promise<RawImage> {
  const status = await window.fototo.modelStatus();
  showProgress(
    status.downloaded ? `${label} — upscaling…` : `Downloading AI model (first run)…`,
    status.downloaded ? 0 : null,
  );
  const unsubscribe = window.fototo.onProgress(({ stage, done, total }) => {
    if (stage === 'download') showProgress(`Downloading AI model — ${done}/${total}`, total > 0 ? done / total : null);
    else showProgress(`${label} — upscaling tile ${done}/${total}`, total > 0 ? done / total : null);
  });
  try {
    return await window.fototo.upscaleImage(image);
  } finally {
    unsubscribe();
  }
}

async function enhance(): Promise<void> {
  await runAiAction(enhanceBtn, async () => {
    if (!bitmap) return;
    const image = extractPixels(bitmap);
    if (!image) return;
    showProgress(`${currentName} — enhancing light…`, null);
    const result = await window.fototo.enhanceImage(image);
    await applyResult(result);
    finishProgress('Light enhanced');
  });
}

function fitScale(): number {
  if (!bitmap) return 1;
  const rect = mainEl.getBoundingClientRect();
  return Math.min(rect.width / bitmap.width, rect.height / bitmap.height);
}

function setZoom(value: number): void {
  zoom = Math.min(8, Math.max(0.05, value));
  applyZoom();
}

function applyZoom(): void {
  if (!bitmap) return;
  if (zoom === null) {
    canvas.classList.remove('zoomed');
    canvas.style.width = '';
    canvas.style.height = '';
  } else {
    canvas.classList.add('zoomed');
    canvas.style.width = `${Math.round(bitmap.width * zoom)}px`;
    canvas.style.height = `${Math.round(bitmap.height * zoom)}px`;
  }
  if (cropping) positionCropOverlay();
}

const beforeCanvas = document.createElement('canvas');
beforeCanvas.id = 'before-canvas';
beforeCanvas.hidden = true;
mainEl.appendChild(beforeCanvas);

function showBefore(): void {
  if (!originalBitmap || !bitmap || cropping || busy) return;
  const rect = canvas.getBoundingClientRect();
  const base = mainEl.getBoundingClientRect();
  beforeCanvas.width = originalBitmap.width;
  beforeCanvas.height = originalBitmap.height;
  const ctx = beforeCanvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(originalBitmap, 0, 0);
  beforeCanvas.style.left = `${rect.left - base.left}px`;
  beforeCanvas.style.top = `${rect.top - base.top}px`;
  beforeCanvas.style.width = `${rect.width}px`;
  beforeCanvas.style.height = `${rect.height}px`;
  beforeCanvas.hidden = false;
}

function hideBefore(): void {
  beforeCanvas.hidden = true;
}

function positionCropOverlay(): void {
  const rect = canvas.getBoundingClientRect();
  const base = mainEl.getBoundingClientRect();
  cropOverlay.style.left = `${rect.left - base.left}px`;
  cropOverlay.style.top = `${rect.top - base.top}px`;
  cropOverlay.style.width = `${rect.width}px`;
  cropOverlay.style.height = `${rect.height}px`;
}

function enterCrop(): void {
  if (!processor || !bitmap || busy) return;
  cropping = true;
  transformRow.hidden = true;
  cropActions.hidden = false;
  positionCropOverlay();
  cropOverlay.hidden = false;
}

function exitCrop(): void {
  cropping = false;
  cropDragging = false;
  cropOrigin = null;
  cropOverlay.hidden = true;
  cropSelection.style.left = '';
  cropSelection.style.top = '';
  cropSelection.style.width = '';
  cropSelection.style.height = '';
  cropActions.hidden = true;
  transformRow.hidden = false;
}

function updateCropSelection(clientX: number, clientY: number): void {
  if (!cropOrigin) return;
  const rect = cropOverlay.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
  cropSelection.style.left = `${Math.min(cropOrigin.x, x)}px`;
  cropSelection.style.top = `${Math.min(cropOrigin.y, y)}px`;
  cropSelection.style.width = `${Math.abs(x - cropOrigin.x)}px`;
  cropSelection.style.height = `${Math.abs(y - cropOrigin.y)}px`;
}

async function applyCrop(): Promise<void> {
  if (!bitmap || !processor) return;
  const overlayRect = cropOverlay.getBoundingClientRect();
  const selRect = cropSelection.getBoundingClientRect();
  if (selRect.width < 6 || selRect.height < 6) {
    exitCrop();
    return;
  }
  const sx = bitmap.width / overlayRect.width;
  const sy = bitmap.height / overlayRect.height;
  const x = Math.max(0, Math.round((selRect.left - overlayRect.left) * sx));
  const y = Math.max(0, Math.round((selRect.top - overlayRect.top) * sy));
  const w = Math.min(bitmap.width - x, Math.max(1, Math.round(selRect.width * sx)));
  const h = Math.min(bitmap.height - y, Math.max(1, Math.round(selRect.height * sy)));
  if (w < 8 || h < 8) {
    setStatus('Crop selection is too small');
    return;
  }
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  bitmap = await createImageBitmap(offscreen);
  processor.setImage(bitmap);
  applyZoom();
  applyAdjustments();
  recordThumbnail();
  setStatus(`Cropped to ${w}×${h}`);
  exitCrop();
}

async function rotateBy(deg: number): Promise<void> {
  if (!bitmap || !processor || busy) return;
  busy = true;
  try {
    const offscreen = new OffscreenCanvas(bitmap.height, bitmap.width);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.translate(offscreen.width / 2, offscreen.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    bitmap = await createImageBitmap(offscreen);
    processor.setImage(bitmap);
    applyZoom();
    applyAdjustments();
    recordThumbnail();
    setStatus(`Rotated to ${bitmap.width}×${bitmap.height}`);
  } finally {
    busy = false;
  }
}

async function loadGallery(): Promise<void> {
  try {
    const entries = await window.fototo.libraryPhotos(2000);
    galleryEmpty.hidden = entries.length > 0;
    galleryGrid.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement('button');
      item.className = 'gallery-item';
      item.title = entry.path;
      if (entry.thumbnail) {
        const img = document.createElement('img');
        img.src = entry.thumbnail;
        img.alt = entry.name;
        img.loading = 'lazy';
        item.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.textContent = '🖼';
        item.appendChild(placeholder);
      }
      const label = document.createElement('span');
      label.textContent = entry.name;
      item.appendChild(label);
      item.addEventListener('click', () => {
        if (selecting) {
          if (selectedPaths.has(entry.path)) {
            selectedPaths.delete(entry.path);
            item.classList.remove('selected');
          } else {
            selectedPaths.add(entry.path);
            item.classList.add('selected');
          }
          updateBatchBar();
          return;
        }
        galleryDialog.close();
        void openRecent(entry.path);
      });
      galleryGrid.appendChild(item);
    }
  } catch {
    void 0;
  }
}

function updateBatchBar(): void {
  batchCount.textContent = `${selectedPaths.size} selected`;
  const disabled = !selecting || batchBusy || selectedPaths.size === 0;
  batchUpscaleBtn.disabled = disabled;
  batchEnhanceBtn.disabled = disabled;
  batchDoneBtn.disabled = batchBusy;
}

function setSelectMode(on: boolean): void {
  selecting = on;
  selectedPaths.clear();
  batchBar.hidden = !on;
  gallerySelectBtn.textContent = on ? 'Stop selecting' : 'Select';
  updateBatchBar();
  void loadGallery();
}

async function encodePng(result: RawImage): Promise<ArrayBuffer | null> {
  const offscreen = new OffscreenCanvas(result.width, result.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height), 0, 0);
  const blob = await offscreen.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

async function runBatch(op: 'upscale' | 'enhance'): Promise<void> {
  if (batchBusy || selectedPaths.size === 0) return;
  const outputDir = await window.fototo.chooseDirectory();
  if (!outputDir) return;
  batchBusy = true;
  updateBatchBar();
  const paths = [...selectedPaths];
  let done = 0;
  let failed = 0;
  for (let i = 0; i < paths.length; i++) {
    const photoPath = paths[i];
    const name = photoPath.split(/[\\/]/).pop() ?? photoPath;
    showProgress(`Batch ${i + 1}/${paths.length} — ${name}`, i / paths.length);
    try {
      const loaded = await window.fototo.openImageAt(photoPath);
      if (!loaded) throw new Error('unreadable');
      const source = await createImageBitmap(new Blob([loaded.data]));
      const image = extractPixels(source);
      if (!image) throw new Error('decode failed');
      const result = op === 'upscale' ? await runUpscale(image, name) : await window.fototo.enhanceImage(image);
      const data = await encodePng(result);
      if (!data) throw new Error('encode failed');
      const dot = loaded.name.lastIndexOf('.');
      const base = dot > 0 ? loaded.name.slice(0, dot) : loaded.name;
      await window.fototo.saveImageTo(data, outputDir, `${base}-fototo.png`);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  batchBusy = false;
  finishProgress(`Batch complete: ${done} saved${failed > 0 ? `, ${failed} failed` : ''}`);
  setSelectMode(false);
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

function applyTheme(theme: string): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

themeSelect.value = localStorage.getItem('fototo-theme') ?? 'system';
applyTheme(themeSelect.value);
themeSelect.addEventListener('change', () => {
  localStorage.setItem('fototo-theme', themeSelect.value);
  applyTheme(themeSelect.value);
});

galleryBtn.addEventListener('click', () => {
  galleryDialog.showModal();
  void loadGallery();
});
galleryCloseBtn.addEventListener('click', () => {
  if (!batchBusy) setSelectMode(false);
  galleryDialog.close();
});
galleryDialog.addEventListener('click', (e) => {
  if (e.target === galleryDialog && !batchBusy) {
    setSelectMode(false);
    galleryDialog.close();
  }
});
gallerySelectBtn.addEventListener('click', () => setSelectMode(!selecting));
batchDoneBtn.addEventListener('click', () => setSelectMode(false));
batchUpscaleBtn.addEventListener('click', () => void runBatch('upscale'));
batchEnhanceBtn.addEventListener('click', () => void runBatch('enhance'));

importFolderBtn.addEventListener('click', async () => {
  importFolderBtn.disabled = true;
  try {
    const count = await window.fototo.importFolder();
    setStatus(count > 0 ? `Imported ${count} photo${count === 1 ? '' : 's'}` : 'No images found in that folder');
  } catch {
    setStatus('Could not read that folder');
  } finally {
    importFolderBtn.disabled = false;
  }
  void loadGallery();
});

zoomInBtn.addEventListener('click', () => setZoom((zoom ?? fitScale()) * 1.25));
zoomOutBtn.addEventListener('click', () => setZoom((zoom ?? fitScale()) / 1.25));
zoomFitBtn.addEventListener('click', () => {
  zoom = null;
  applyZoom();
});
mainEl.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey || !bitmap) return;
    e.preventDefault();
    setZoom((zoom ?? fitScale()) * (e.deltaY < 0 ? 1.25 : 0.8));
  },
  { passive: false },
);

canvas.addEventListener('mousedown', () => showBefore());
window.addEventListener('mouseup', hideBefore);

rotateCcwBtn.addEventListener('click', () => void rotateBy(-90));
rotateCwBtn.addEventListener('click', () => void rotateBy(90));
cropBtn.addEventListener('click', enterCrop);
cropCancelBtn.addEventListener('click', exitCrop);
cropApplyBtn.addEventListener('click', () => void applyCrop());
cropOverlay.addEventListener('mousedown', (e) => {
  e.preventDefault();
  if (!cropping) return;
  const rect = cropOverlay.getBoundingClientRect();
  cropDragging = true;
  cropOrigin = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  updateCropSelection(e.clientX, e.clientY);
});
window.addEventListener('mousemove', (e) => {
  if (cropping && cropDragging) updateCropSelection(e.clientX, e.clientY);
});
window.addEventListener('mouseup', () => {
  cropDragging = false;
});
window.addEventListener('resize', () => {
  if (cropping) positionCropOverlay();
});

helpBtn.addEventListener('click', () => helpDialog.showModal());
helpCloseBtn.addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', (e) => {
  if (e.target === helpDialog) helpDialog.close();
});

openBtn.addEventListener('click', loadImage);
up2Btn.addEventListener('click', () => void runUpscaleOption(up2Btn, 2));
up4Btn.addEventListener('click', () => void runUpscaleOption(up4Btn, 4));
res2kBtn.addEventListener('click', () => void runUpscaleOption(res2kBtn, 2560));
res4kBtn.addEventListener('click', () => void runUpscaleOption(res4kBtn, 3840));
res8kBtn.addEventListener('click', () => void runUpscaleOption(res8kBtn, 7680));
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
    const title = status.downloaded
      ? `Upscale with ${status.label}`
      : `Upscale with ${status.label} (model downloads on first use)`;
    for (const btn of [up2Btn, up4Btn, res2kBtn, res4kBtn, res8kBtn]) btn.title = title;
  })
  .catch(() => undefined);

window.fototo.onUpdateStatus((message) => setStatus(message));

loadRecents();

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (busy) return;
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
  if (!isImage) {
    setStatus('Not an image file');
    return;
  }
  const filePath = window.fototo.pathForFile(file);
  if (!filePath) {
    setStatus('Could not open dropped photo');
    return;
  }
  openRecent(filePath).catch(() => setStatus('Could not open photo'));
});
