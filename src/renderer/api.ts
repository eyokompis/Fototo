export interface FototoApi {
  openImage(): Promise<{ name: string; data: ArrayBuffer } | null>;
  saveImage(data: ArrayBuffer, defaultName: string): Promise<boolean>;
}

declare global {
  interface Window {
    fototo: FototoApi;
  }
}

export {};
