import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fototo', {
  openImage: (): Promise<{ name: string; data: ArrayBuffer } | null> =>
    ipcRenderer.invoke('open-image'),
  saveImage: (data: ArrayBuffer, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('save-image', data, defaultName),
  modelStatus: (): Promise<{ label: string; downloaded: boolean }> =>
    ipcRenderer.invoke('ai:model-status'),
  upscaleImage: (
    image: { data: ArrayBuffer; width: number; height: number },
  ): Promise<{ data: ArrayBuffer; width: number; height: number }> =>
    ipcRenderer.invoke('ai:upscale', image),
  onProgress: (callback: (progress: { stage: string; done: number; total: number }) => void): (() => void) => {
    const listener = (_event: unknown, progress: { stage: string; done: number; total: number }) =>
      callback(progress);
    ipcRenderer.on('ai:progress', listener);
    return () => ipcRenderer.removeListener('ai:progress', listener);
  },
});
