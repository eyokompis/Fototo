export interface ImageEdits {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

export interface LoadedImage {
  id: string;
  name: string;
  data: ArrayBuffer;
  edits: ImageEdits | null;
}

export interface LibraryEntry {
  id: string;
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
  openImage(): Promise<LoadedImage | null>;
  openDroppedImage(file: File): Promise<LoadedImage | null>;
  openImageAt(photoId: string): Promise<LoadedImage | null>;
  saveEdits(photoId: string, edits: ImageEdits): Promise<boolean>;
  recordPhoto(photoId: string, name: string, thumbnail: string | null): Promise<boolean>;
  recentPhotos(limit?: number): Promise<LibraryEntry[]>;
  libraryPhotos(limit: number): Promise<LibraryEntry[]>;
  importFolder(): Promise<number>;
  saveImage(data: ArrayBuffer, defaultName: string): Promise<boolean>;
  chooseDirectory(): Promise<string | null>;
  saveImageTo(data: ArrayBuffer, directoryId: string, fileName: string): Promise<string>;
  modelStatus(): Promise<ModelStatus>;
  upscaleImage(image: RawImage): Promise<RawImage>;
  enhanceImage(image: RawImage): Promise<RawImage>;
  onProgress(callback: (progress: Progress) => void): () => void;
  onUpdateStatus(callback: (message: string) => void): () => void;
}

declare global {
  interface Window {
    fototo: FototoApi;
  }
}

export {};
