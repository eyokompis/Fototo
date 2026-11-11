import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { downloadModel, isModelDownloaded, REAL_ESRGAN_X4, upscaleImage } from './upscaler';

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
  return { name: path.basename(filePath), data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
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
