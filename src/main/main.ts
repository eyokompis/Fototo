import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { downloadModel, isModelDownloaded, REAL_ESRGAN_X4, upscaleImage } from './upscaler';
import { enhanceLowLight } from './enhancer';
import { loadEdits, saveEdits, type ImageEdits } from './edits';
import { recentPhotos, recordPhoto } from './library';

const isDev = !app.isPackaged;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    title: 'fototo',
    backgroundColor: '#111318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('open-image', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open photo',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const data = await fs.readFile(filePath);
  const edits = await loadEdits(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    edits,
  };
});

ipcMain.handle('save-edits', async (_event, imagePath: string, edits: ImageEdits) => {
  await saveEdits(imagePath, edits);
  return true;
});

ipcMain.handle('open-image-at', async (_event, imagePath: string) => {
  try {
    const data = await fs.readFile(imagePath);
    const edits = await loadEdits(imagePath);
    return {
      name: path.basename(imagePath),
      path: imagePath,
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      edits,
    };
  } catch {
    return null;
  }
});

ipcMain.handle('library:record', async (_event, imagePath: string, name: string, thumbnail: string | null) => {
  await recordPhoto(imagePath, name, thumbnail);
  return true;
});

ipcMain.handle('library:recent', async (_event, limit?: number) => recentPhotos(limit));

ipcMain.handle('library:import-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Add folder to gallery',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return 0;
  const dir = result.filePaths[0];
  const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !exts.has(path.extname(entry.name).toLowerCase())) continue;
    await recordPhoto(path.join(dir, entry.name), entry.name, null);
    count += 1;
  }
  return count;
});

ipcMain.handle('ai:model-status', async () => ({
  label: REAL_ESRGAN_X4.label,
  downloaded: await isModelDownloaded(REAL_ESRGAN_X4),
}));

ipcMain.handle('ai:upscale', async (event, image: { data: ArrayBuffer; width: number; height: number }) => {
  const send = (progress: { stage: string; done: number; total: number }) => {
    if (!event.sender.isDestroyed()) event.sender.send('ai:progress', progress);
  };
  if (!(await isModelDownloaded(REAL_ESRGAN_X4))) {
    await downloadModel(REAL_ESRGAN_X4, send);
  }
  const rgba = new Uint8ClampedArray(image.data);
  const result = await upscaleImage(REAL_ESRGAN_X4, rgba, image.width, image.height, send);
  return { data: result.data.buffer, width: result.width, height: result.height };
});

ipcMain.handle('ai:enhance', async (_event, image: { data: ArrayBuffer; width: number; height: number }) => {
  const rgba = new Uint8ClampedArray(image.data);
  const result = await enhanceLowLight(rgba, image.width, image.height);
  return { data: result.data.buffer, width: result.width, height: result.height };
});

ipcMain.handle('save-image', async (_event, data: ArrayBuffer, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    title: 'Save photo',
    defaultPath: defaultName,
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, Buffer.from(data));
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
