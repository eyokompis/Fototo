const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const main = fs.readFileSync(path.join(root, 'src/main/main.ts'), 'utf8');

test('release workflow can only be manually dispatched from main', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+push:/m);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
});

test('release tag must be semantic version and reachable from main', () => {
  assert.match(workflow, /TAG_NAME" =~ \^v\[0-9\]+\\\.\[0-9\]+\\\.\[0-9\]+\$/);
  assert.match(workflow, /git merge-base --is-ancestor "\$TAG_COMMIT" origin\/main/);
  assert.match(workflow, /git checkout --detach "\$TAG_COMMIT"/);
});

test('release creates a draft and refuses to overwrite an existing release', () => {
  assert.match(workflow, /gh release view "\$TAG_NAME"/);
  assert.match(workflow, /draft: true/);
  assert.match(workflow, /fail_on_unmatched_files: true/);
});

test('release does not publish unsigned updater metadata or blockmaps', () => {
  assert.doesNotMatch(workflow, /latest(?:-linux|-mac)?\.yml/);
  assert.doesNotMatch(workflow, /\.blockmap/);
});

test('Windows and macOS distributables fail closed without code signing', () => {
  assert.equal(packageJson.build.win.forceCodeSigning, true);
  assert.equal(packageJson.build.win.verifyUpdateCodeSignature, true);
  assert.equal(packageJson.build.mac.forceCodeSigning, true);
});

test('runtime does not poll or install unsigned automatic updates', () => {
  assert.doesNotMatch(main, /from 'electron-updater'/);
  assert.doesNotMatch(main, /checkForUpdatesAndNotify/);
  assert.doesNotMatch(main, /autoInstallOnAppQuit/);
});
