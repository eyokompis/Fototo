import { app, BrowserWindow, dialog, ipcMain, session, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import { promises as fs, existsSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { downloadModel, isModelDownloaded, REAL_ESRGAN_X4, upscaleImage } from './upscaler';
import { enhanceLowLight } from './enhancer';
import { loadEdits, saveEdits, type ImageEdits } from './edits';
import { recentPhotos, recordPhoto } from './library';
import {
  MAX_IMAGE_BYTES,
  isAllowedAppNavigation,
  validateBinaryExport,
  validateExportFileName,
  validateImageBuffer,
  validateImageEdits,
  validateImageExtension,
  validateImageName,
  validateThumbnail,
} from './security';

const isDev = !app.isPackaged;
const photoPathById = new Map<string, string>();
const photoIdByPath = new Map<string, string>();
const directoryPathById = new Map<string, string>();

function migrateUserData(): void {
  if (!app.isPackaged) return;
  const newPath = app.getPath('userData');
  if (path.basename(newPath).toLowerCase() !== 'fototo') return;
  const oldPath = path.join(path.dirname(newPath), 'fototo');
  if (!existsSync(oldPath)) return;
  try {
    mkdirSync(newPath, { recursive: true });
    const db = path.join(oldPath, 'library.db');
    if (existsSync(db) && !existsSync(path.join(newPath, 'library.db'))) {
      cpSync(db, path.join(newPath, 'library.db'));
    }
    const models = path.join(oldPath, 'models');
    if (existsSync(models) && !existsSync(path.join(newPath, 'models'))) {
      cpSync(models, path.join(newPath, 'models'), { recursive: true });
    }
  } catch {
    return;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('Untrusted IPC frame');
  let url: URL;
  try {
    url = new URL(frame.url);
  } catch {
    throw new Error('Invalid IPC sender URL');
  }
  if (isDev) {
    if (url.origin !== 'http://localhost:5173') throw new Error('Untrusted IPC sender');
  } else if (url.protocol !== 'file:' || !url.pathname.endsWith('/dist/index.html')) {
    throw new Error('Untrusted IPC sender');
  }
}

function registerPhotoPath(filePath: string): string {
  const existing = photoIdByPath.get(filePath);
  if (existing) return existing;
  const id = randomUUID();
  photoPathById.set(id, filePath);
  photoIdByPath.set(filePath, id);
  return id;
}

function resolvePhotoPath(photoId: unknown): string {
  if (typeof photoId !== 'string' || photoId.length > 64) throw new Error('Invalid photo reference');
  const filePath = photoPathById.get(photoId);
  if (!filePath) throw new Error('Unknown photo reference');
  return filePath;
}

async function readImage(filePath: string) {
  if (!validateImageExtension(filePath)) throw new Error('Unsupported image type');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) {
    throw new Error('Image file is too large or invalid');
  }
  const data = await fs.readFile(filePath);
  if (data.byteLength <= 0 || data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image file is too large or invalid');
  }
  const edits = await loadEdits(filePath);
  return {
    id: registerPhotoPath(filePath),
    name: path.basename(filePath),
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    edits,
  };
}

function validateAiRequest(image: unknown): image is { data: ArrayBuffer; width: number; height: number } {
  if (!image || typeof image !== 'object' || Array.isArray(image)) return false;
  const value = image as Record<string, unknown>;
  return validateImageBuffer(value.data, value.width, value.height);
}

async function saveUniqueExport(dirPath: string, fileName: string, data: ArrayBuffer): Promise<string> {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  for (let i = 0; i < 1000; i++) {
    const name = i === 0 ? fileName : `${base} (${i})${ext}`;
    const target = path.join(dirPath, name);
    try {
      await fs.writeFile(target, Buffer.from(data), { flag: 'wx' });
      return name;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Could not find an unused export filename');
}

function createWindow(): void {
  const indexHtmlPath = path.join(__dirname, '..', 'dist', 'index.html');
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    title: 'Fototo',
    backgroundColor: '#111318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const { webContents } = win;
  webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedAppNavigation(navigationUrl, isDev, indexHtmlPath)) event.preventDefault();
  });
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-attach-webview', (event) => event.preventDefault());

  const appSession = session.defaultSession;
  appSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  appSession.setPermissionCheckHandler(() => false);

  if (isDev) {
    void win.loadURL('http://localhost:5173');
  } else {
    void win.loadFile(indexHtmlPath);
  }

  if (app.isPackaged && process.platform !== 'darwin') {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    const send = (message: string) => {
      if (!win.isDestroyed()) win.webContents.send('update:status', message);
    };
    autoUpdater.on('update-available', () => send('Downloading update…'));
    autoUpdater.on('update-downloaded', () => send('Update downloaded — it installs when you close fototo'));
    autoUpdater.on('error', () => send('Update check failed (offline?)'));
    autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  }
}

ipcMain.handle('open-image', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog({
    title: 'Open photo',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return readImage(result.filePaths[0]);
});

ipcMain.handle('open-dropped-image', async (event, filePath: unknown) => {
  assertTrustedSender(event);
  if (typeof filePath !== 'string' || filePath.length > 4096 || !path.isAbsolute(filePath)) {
    throw new Error('Invalid dropped file');
  }
  return readImage(filePath);
});

ipcMain.handle('save-edits', async (event, photoId: unknown, edits: unknown) => {
  assertTrustedSender(event);
  if (!validateImageEdits(edits)) throw new Error('Invalid image adjustments');
  await saveEdits(resolvePhotoPath(photoId), edits as ImageEdits);
  return true;
});

ipcMain.handle('open-image-at', async (event, photoId: unknown) => {
  assertTrustedSender(event);
  try {
    return await readImage(resolvePhotoPath(photoId));
  } catch {
    return null;
  }
});

ipcMain.handle('library:record', async (event, photoId: unknown, name: unknown, thumbnail: unknown) => {
  assertTrustedSender(event);
  if (!validateImageName(name) || !validateThumbnail(thumbnail)) throw new Error('Invalid library entry');
  await recordPhoto(resolvePhotoPath(photoId), name, thumbnail);
  return true;
});

ipcMain.handle('library:recent', async (event, limit?: unknown) => {
  assertTrustedSender(event);
  const safeLimit = typeof limit === 'number' && Number.isFinite(limit)
    ? Math.min(2000, Math.max(1, Math.floor(limit)))
    : 60;
  const entries = await recentPhotos(safeLimit);
  return entries.map((entry) => ({
    id: registerPhotoPath(entry.path),
    name: entry.name,
    thumbnail: validateThumbnail(entry.thumbnail) ? entry.thumbnail : null,
    openedAt: entry.openedAt,
  }));
});

ipcMain.handle('library:import-folder', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog({
    title: 'Add folder to gallery',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return 0;
  const dir = result.filePaths[0];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !validateImageExtension(entry.name)) continue;
    await recordPhoto(path.join(dir, entry.name), entry.name, null);
    count += 1;
  }
  return count;
});

ipcMain.handle('ai:model-status', async (event) => {
  assertTrustedSender(event);
  return {
    label: REAL_ESRGAN_X4.label,
    downloaded: await isModelDownloaded(REAL_ESRGAN_X4),
  };
});

ipcMain.handle('ai:upscale', async (event, image: unknown) => {
  assertTrustedSender(event);
  if (!validateAiRequest(image)) throw new Error('Invalid AI image payload');
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

ipcMain.handle('ai:enhance', async (event, image: unknown) => {
  assertTrustedSender(event);
  if (!validateAiRequest(image)) throw new Error('Invalid AI image payload');
  const rgba = new Uint8ClampedArray(image.data);
  const result = await enhanceLowLight(rgba, image.width, image.height);
  return { data: result.data.buffer, width: result.width, height: result.height };
});

ipcMain.handle('choose-directory', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog({
    title: 'Choose output folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const id = randomUUID();
  directoryPathById.set(id, result.filePaths[0]);
  return id;
});

ipcMain.handle('save-image-to', async (event, data: unknown, directoryId: unknown, fileName: unknown) => {
  assertTrustedSender(event);
  if (!validateBinaryExport(data) || !validateExportFileName(fileName)) {
    throw new Error('Invalid export payload');
  }
  if (typeof directoryId !== 'string' || !directoryPathById.has(directoryId)) {
    throw new Error('Unknown export directory reference');
  }
  return saveUniqueExport(directoryPathById.get(directoryId)!, fileName, data);
});

ipcMain.handle('save-image', async (event, data: unknown, defaultName: unknown) => {
  assertTrustedSender(event);
  if (!validateBinaryExport(data) || typeof defaultName !== 'string' || defaultName.length > 180) {
    throw new Error('Invalid export payload');
  }
  const safeDefaultName = path.basename(defaultName).replace(/[\\/\0<>:"|?*]/g, '_');
  const result = await dialog.showSaveDialog({
    title: 'Save photo',
    defaultPath: safeDefaultName || 'photo.png',
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, Buffer.from(data));
  return true;
});

app.whenReady().then(() => {
  migrateUserData();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
