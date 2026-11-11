export interface LoadedImage {
  name: string;
  data: ArrayBuffer;
}

export interface ModelStatus {
  label: string;
  downloaded: boolean;
}

export interface Progress {
  stage: string;
  done: number;
  total: number;
}

export interface RawImage {
  data: ArrayBuffer;
  width: number;
  height: number;
}

export interface FototoApi {
  openImage(): Promise<LoadedImage | null>;
  saveImage(data: ArrayBuffer, defaultName: string): Promise<boolean>;
  modelStatus(): Promise<ModelStatus>;
  upscaleImage(image: RawImage): Promise<RawImage>;
  onProgress(callback: (progress: Progress) => void): () => void;
}

declare global {
  interface Window {
    fototo: FototoApi;
  }
}

export {};
