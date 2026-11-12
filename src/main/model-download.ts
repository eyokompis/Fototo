import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Transform } from 'node:stream';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface VerifiedModelArtifact {
  url: string;
  sizeBytes: number;
  sha256: string;
}

function validateArtifact(artifact: VerifiedModelArtifact): void {
  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
    throw new Error('Invalid model artifact size');
  }
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    throw new Error('Invalid model artifact SHA-256');
  }
  const url = new URL(artifact.url);
  if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co' || url.username || url.password) {
    throw new Error('Model URL must use the trusted HTTPS model host');
  }
}

export async function verifyModelFile(filePath: string, artifact: VerifiedModelArtifact): Promise<void> {
  validateArtifact(artifact);
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size !== artifact.sizeBytes) {
    throw new Error('Model artifact size mismatch');
  }

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  if (hash.digest('hex') !== artifact.sha256) {
    throw new Error('Model artifact SHA-256 mismatch');
  }
}

export async function isVerifiedModelFile(filePath: string, artifact: VerifiedModelArtifact): Promise<boolean> {
  try {
    await verifyModelFile(filePath, artifact);
    return true;
  } catch {
    return false;
  }
}

export async function downloadVerifiedModelFile(
  artifact: VerifiedModelArtifact,
  destPath: string,
  onProgress: (received: number, total: number) => void = () => undefined,
): Promise<void> {
  validateArtifact(artifact);
  const response = await fetch(artifact.url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed: HTTP ${response.status}`);
  }
  if (!response.url || new URL(response.url).protocol !== 'https:') {
    throw new Error('Model download redirected to an insecure URL');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength !== artifact.sizeBytes) {
      await response.body.cancel();
      throw new Error('Model artifact Content-Length mismatch');
    }
  }

  let received = 0;
  const hash = createHash('sha256');
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > artifact.sizeBytes) {
        callback(new Error('Model artifact exceeds its maximum allowed size'));
        return;
      }
      hash.update(chunk);
      onProgress(received, artifact.sizeBytes);
      callback(null, chunk);
    },
  });

  const partPath = `${destPath}.part`;
  try {
    const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    await pipeline(source, verifier, createWriteStream(partPath, { flags: 'w' }));
    if (received !== artifact.sizeBytes) throw new Error('Model artifact size mismatch');
    if (hash.digest('hex') !== artifact.sha256) throw new Error('Model artifact SHA-256 mismatch');
    await fs.rename(partPath, destPath);
  } catch (error) {
    await fs.rm(partPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
