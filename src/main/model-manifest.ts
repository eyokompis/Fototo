export interface ModelFile {
  url: string;
  name: string;
  sizeBytes: number;
  sha256: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  scale: number;
  tileSize: number;
  pad: number;
  files: ModelFile[];
}

export const REAL_ESRGAN_X4: ModelInfo = {
  id: 'realesrgan-x4',
  label: 'Real-ESRGAN x4',
  scale: 4,
  tileSize: 128,
  pad: 8,
  files: [
    {
      url: 'https://huggingface.co/TheGuy444/Real-ESRGAN-ONNX/resolve/4c80f3da1a8a85f0757a9e7f79e08d0307220eb5/onnx/model.onnx',
      name: 'model.onnx',
      sizeBytes: 42443,
      sha256: '2d1810f8b75c6a899487decf933697241eafbe6327d7b723674ba6df73a08fda',
    },
    {
      url: 'https://huggingface.co/TheGuy444/Real-ESRGAN-ONNX/resolve/4c80f3da1a8a85f0757a9e7f79e08d0307220eb5/onnx/model.data',
      name: 'model.data',
      sizeBytes: 4836096,
      sha256: '512d0ec9940c2e9d85d27f2952f12a0b77b7841dc22df4ce9f3ea458bc98f37f',
    },
  ],
};
