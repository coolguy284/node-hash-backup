import packageData from '../../package.json' with { type: 'json' };

const version = packageData.version;

let lzmaInstalled = false;

try {
  await import('lzma-native');
  lzmaInstalled = true;
} catch { /* empty */ }

export function getProgramVersion() {
  return version;
}

export function getLzmaInstalled() {
  return lzmaInstalled;
}
