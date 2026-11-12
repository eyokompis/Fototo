const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  MAX_AI_INPUT_PIXELS,
  isAllowedAppNavigation,
  validateBinaryExport,
  validateExportFileName,
  validateImageBuffer,
  validateImageEdits,
  validateImageExtension,
  validateImageName,
  validateThumbnail,
} = require('../dist-electron/security.js');

test('accepts only complete, bounded image adjustments', () => {
  assert.equal(validateImageEdits({ exposure: 0, contrast: 1, saturation: 1, temperature: 0 }), true);
  assert.equal(validateImageEdits({ exposure: 3, contrast: 1, saturation: 1, temperature: 0 }), false);
  assert.equal(validateImageEdits({ exposure: 0, contrast: 1, saturation: 1, temperature: 0, path: '/tmp/x' }), false);
  assert.equal(validateImageEdits(null), false);
});

test('validates AI pixel buffers and dimensions before allocation', () => {
  assert.equal(validateImageBuffer(new ArrayBuffer(4 * 10 * 10), 10, 10), true);
  assert.equal(validateImageBuffer(new ArrayBuffer(12), 2, 2), false);
  assert.equal(validateImageBuffer(new ArrayBuffer(4), 0, 1), false);
  assert.equal(validateImageBuffer(new ArrayBuffer(4), Number.MAX_SAFE_INTEGER + 1, 1), false);
  assert.equal(validateImageBuffer(new ArrayBuffer(4), MAX_AI_INPUT_PIXELS + 1, 1), false);
  assert.equal(validateImageBuffer(new Uint8Array(4), 1, 1), false);
});

test('rejects path traversal and unsafe export names', () => {
  assert.equal(validateExportFileName('portrait-fototo.png'), true);
  assert.equal(validateExportFileName('portrait-fototo.jpg'), true);
  assert.equal(validateExportFileName('../outside.png'), false);
  assert.equal(validateExportFileName('..\\outside.png'), false);
  assert.equal(validateExportFileName('nested/name.png'), false);
  assert.equal(validateExportFileName('portrait.exe'), false);
});

test('validates names, thumbnails, binary exports and image extensions', () => {
  assert.equal(validateImageName('portrait.jpg'), true);
  assert.equal(validateImageName('../portrait.jpg'), false);
  assert.equal(validateThumbnail(null), true);
  assert.equal(validateThumbnail('data:image/jpeg;base64,Zm9v'), true);
  assert.equal(validateThumbnail('data:text/html;base64,Zm9v'), false);
  assert.equal(validateBinaryExport(new ArrayBuffer(4)), true);
  assert.equal(validateBinaryExport(new ArrayBuffer(0)), false);
  assert.equal(validateImageExtension('/photos/portrait.webp'), true);
  assert.equal(validateImageExtension('/photos/notes.txt'), false);
});


test('allows only the expected app navigation target', () => {
  const entry = path.resolve('/opt/Fototo/resources/app/dist/index.html');
  assert.equal(isAllowedAppNavigation('http://localhost:5173/', true, entry), true);
  assert.equal(isAllowedAppNavigation('http://localhost:5173/other', true, entry), false);
  assert.equal(isAllowedAppNavigation('https://example.com/', true, entry), false);
  assert.equal(isAllowedAppNavigation(pathToFileURL(entry).href, false, entry), true);
  assert.equal(isAllowedAppNavigation(pathToFileURL(path.join(path.dirname(entry), 'other.html')).href, false, entry), false);
  assert.equal(isAllowedAppNavigation('javascript:alert(1)', false, entry), false);
});
