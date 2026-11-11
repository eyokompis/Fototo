function isJpeg(bytes: ArrayBuffer): boolean {
  return bytes.byteLength > 3 && new DataView(bytes).getUint16(0) === 0xffd8;
}

function extractExifSegment(bytes: ArrayBuffer): Uint8Array | null {
  if (!isJpeg(bytes)) return null;
  const view = new DataView(bytes);
  let off = 2;
  while (off + 4 <= bytes.byteLength) {
    if (view.getUint8(off) !== 0xff) return null;
    const marker = view.getUint8(off + 1);
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    if (marker === 0xda) return null;
    const len = view.getUint16(off + 2);
    if (marker === 0xe1 && len >= 8 && view.getUint32(off + 4) === 0x45786966 && view.getUint16(off + 8) === 0) {
      return new Uint8Array(bytes.slice(off, off + 2 + len));
    }
    off += 2 + len;
  }
  return null;
}

function setOrientationTo1(segment: Uint8Array): void {
  if (segment.length < 26) return;
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const order = view.getUint16(10);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return;
  const ifd = 10 + view.getUint32(14, little);
  if (ifd + 2 > segment.byteLength) return;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > segment.byteLength) return;
    if (view.getUint16(entry, little) === 0x0112) {
      view.setUint16(entry + 8, 1, little);
      return;
    }
  }
}

export function withExif(source: ArrayBuffer, out: ArrayBuffer): ArrayBuffer {
  const segment = extractExifSegment(source);
  if (!segment || !isJpeg(out)) return out;
  setOrientationTo1(segment);
  const result = new Uint8Array(out.byteLength + segment.length);
  result.set(new Uint8Array(out, 0, 2), 0);
  result.set(segment, 2);
  result.set(new Uint8Array(out, 2), 2 + segment.length);
  return result.buffer;
}
