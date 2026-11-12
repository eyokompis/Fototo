const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const ort = require('onnxruntime-node');
const { REAL_ESRGAN_X4 } = require('../dist-electron/model-manifest.js');
const { downloadVerifiedModelFile } = require('../dist-electron/model-download.js');

test('downloads verified Real-ESRGAN artifacts and runs native ONNX inference', { timeout: 180_000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fototo-onnx-smoke-'));
  let session;
  try {
    for (const artifact of REAL_ESRGAN_X4.files) {
      await downloadVerifiedModelFile(artifact, path.join(dir, artifact.name));
    }

    session = await ort.InferenceSession.create(path.join(dir, REAL_ESRGAN_X4.files[0].name));
    assert.ok(session.inputNames.includes('image'), `Unexpected ONNX inputs: ${session.inputNames.join(', ')}`);
    assert.ok(session.outputNames.includes('upscaled_image'), `Unexpected ONNX outputs: ${session.outputNames.join(', ')}`);

    const input = new ort.Tensor('float32', new Float32Array(3 * 128 * 128).fill(0.25), [1, 3, 128, 128]);
    const output = await session.run({ image: input });
    const result = output.upscaled_image;
    assert.deepEqual(result.dims, [1, 3, 512, 512]);
    assert.equal(result.data.length, 3 * 512 * 512);
    assert.ok(result.data.every(Number.isFinite), 'Inference returned non-finite values');
  } finally {
    if (session) await session.release();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
