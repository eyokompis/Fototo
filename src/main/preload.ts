import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('fototo', {
  openImage: (): Promise<{
    id: string;
    name: string;
    data: ArrayBuffer;
    edits: { exposure: number; contrast: number; saturation: number; temperature: number } | null;
  } | null> => ipcRenderer.invoke('open-image'),
  openDroppedImage: (file: File): Promise<{
    id: string;
    name: string;
    data: ArrayBuffer;
    edits: { exposure: number; contrast: number; saturation: number; temperature: number } | null;
  } | null> => {
    let filePath = '';
    try {
      filePath = webUtils.getPathForFile(file);
    } catch {
      return Promise.resolve(null);
    }
    if (!filePath) return Promise.resolve(null);
    return ipcRenderer.invoke('open-dropped-image', filePath);
  },
  openImageAt: (photoId: string): Promise<{
    id: string;
    name: string;
    data: ArrayBuffer;
    edits: { exposure: number; contrast: number; saturation: number; temperature: number } | null;
  } | null> => ipcRenderer.invoke('open-image-at', photoId),
  saveEdits: (
    photoId: string,
    edits: { exposure: number; contrast: number; saturation: number; temperature: number },
  ): Promise<boolean> => ipcRenderer.invoke('save-edits', photoId, edits),
  recordPhoto: (photoId: string, name: string, thumbnail: string | null): Promise<boolean> =>
    ipcRenderer.invoke('library:record', photoId, name, thumbnail),
  recentPhotos: (): Promise<
    { id: string; name: string; thumbnail: string | null; openedAt: number }[]
  > => ipcRenderer.invoke('library:recent'),
  libraryPhotos: (limit: number): Promise<
    { id: string; name: string; thumbnail: string | null; openedAt: number }[]
  > => ipcRenderer.invoke('library:recent', limit),
  importFolder: (): Promise<number> => ipcRenderer.invoke('library:import-folder'),
  saveImage: (data: ArrayBuffer, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('save-image', data, defaultName),
  chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('choose-directory'),
  saveImageTo: (data: ArrayBuffer, directoryId: string, fileName: string): Promise<string> =>
    ipcRenderer.invoke('save-image-to', data, directoryId, fileName),
  modelStatus: (): Promise<{ label: string; downloaded: boolean }> =>
    ipcRenderer.invoke('ai:model-status'),
  upscaleImage: (
    image: { data: ArrayBuffer; width: number; height: number },
  ): Promise<{ data: ArrayBuffer; width: number; height: number }> =>
    ipcRenderer.invoke('ai:upscale', image),
  enhanceImage: (
    image: { data: ArrayBuffer; width: number; height: number },
  ): Promise<{ data: ArrayBuffer; width: number; height: number }> =>
    ipcRenderer.invoke('ai:enhance', image),
  onProgress: (callback: (progress: { stage: string; done: number; total: number }) => void): (() => void) => {
    const listener = (_event: unknown, progress: { stage: string; done: number; total: number }) =>
      callback(progress);
    ipcRenderer.on('ai:progress', listener);
    return () => ipcRenderer.removeListener('ai:progress', listener);
  },
  onUpdateStatus: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: unknown, message: string) => callback(message);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
});
