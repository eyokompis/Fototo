import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fototo', {
  openImage: (): Promise<{ name: string; data: ArrayBuffer } | null> =>
    ipcRenderer.invoke('open-image'),
  saveImage: (data: ArrayBuffer, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('save-image', data, defaultName),
});
