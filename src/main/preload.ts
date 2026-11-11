import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('fototo', {
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  openImage: (): Promise<{
    name: string;
    path: string;
    data: ArrayBuffer;
    edits: { exposure: number; contrast: number; saturation: number; temperature: number } | null;
  } | null> => ipcRenderer.invoke('open-image'),
  openImageAt: (imagePath: string): Promise<{
    name: string;
    path: string;
    data: ArrayBuffer;
    edits: { exposure: number; contrast: number; saturation: number; temperature: number } | null;
  } | null> => ipcRenderer.invoke('open-image-at', imagePath),
  saveEdits: (
    imagePath: string,
    edits: { exposure: number; contrast: number; saturation: number; temperature: number },
  ): Promise<boolean> => ipcRenderer.invoke('save-edits', imagePath, edits),
  recordPhoto: (imagePath: string, name: string, thumbnail: string | null): Promise<boolean> =>
    ipcRenderer.invoke('library:record', imagePath, name, thumbnail),
  recentPhotos: (): Promise<
    { path: string; name: string; thumbnail: string | null; openedAt: number }[]
  > => ipcRenderer.invoke('library:recent'),
  libraryPhotos: (limit: number): Promise<
    { path: string; name: string; thumbnail: string | null; openedAt: number }[]
  > => ipcRenderer.invoke('library:recent', limit),
  importFolder: (): Promise<number> => ipcRenderer.invoke('library:import-folder'),
  saveImage: (data: ArrayBuffer, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('save-image', data, defaultName),
  chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('choose-directory'),
  saveImageTo: (data: ArrayBuffer, dirPath: string, fileName: string): Promise<string> =>
    ipcRenderer.invoke('save-image-to', data, dirPath, fileName),
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
});
