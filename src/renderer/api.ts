export interface ImageEdits {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

export interface LoadedImage {
  name: string;
  path: string;
  data: ArrayBuffer;
  edits: ImageEdits | null;
}

export interface LibraryEntry {
  path: string;
  name: string;
  thumbnail: string | null;
  openedAt: number;
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
  pathForFile(file: File): string;
  openImage(): Promise<LoadedImage | null>;
  openImageAt(imagePath: string): Promise<LoadedImage | null>;
  saveEdits(imagePath: string, edits: ImageEdits): Promise<boolean>;
  recordPhoto(imagePath: string, name: string, thumbnail: string | null): Promise<boolean>;
  recentPhotos(): Promise<LibraryEntry[]>;
  saveImage(data: ArrayBuffer, defaultName: string): Promise<boolean>;
  modelStatus(): Promise<ModelStatus>;
  upscaleImage(image: RawImage): Promise<RawImage>;
  enhanceImage(image: RawImage): Promise<RawImage>;
  onProgress(callback: (progress: Progress) => void): () => void;
}

declare global {
  interface Window {
    fototo: FototoApi;
  }
}

export {};
