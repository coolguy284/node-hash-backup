import packageData from '../../package.json' with { type: 'json' };

const version = packageData.version;

let lzmaInstalled = false;
let nativeLibInstalled = false;

try {
  await import('lzma-native');
  lzmaInstalled = true;
} catch { /* empty */ }

try {
  await import('hash-backup-native-fs');
  nativeLibInstalled = false;
} catch { /* empty */ }

export function getProgramVersion() {
  return version;
}

export function getLzmaInstalled() {
  return lzmaInstalled;
}

export function getNativeLibInstalled() {
  return nativeLibInstalled;
}
