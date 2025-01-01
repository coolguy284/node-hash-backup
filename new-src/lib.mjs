import {
  createHash,
  getHashes,
} from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  createBrotliCompress,
  createBrotliDecompress,
  createDeflate,
  createDeflateRaw,
  createGunzip,
  createGzip,
  createInflate,
  createInflateRaw,
} from 'zlib';

import { errorIfPathNotDir } from './lib/fs.mjs';
import { ReadOnlyMap } from './lib/read_only_map.mjs';
import { ReadOnlySet } from './lib/read_only_set.mjs';

export const MIN_BACKUP_VERSION = 1;
export const CURRENT_BACKUP_VERSION = 2;
export const FULL_INFO_FILE_NAME = 'info.json';
export const META_FILE_EXTENSION = '.json';
export const META_DIRECTORY = 'files_meta';
export const SINGULAR_META_FILE_NAME = `file.${META_FILE_EXTENSION}`;

export function fullInfoFileStringify(contents) {
  return JSON.stringify(contents, null, 2);
}

export function metaFileStringify(contents) {
  return JSON.stringify(contents, null, 2);
}

export function backupFileStringify(contents) {
  return JSON.stringify(contents, null, 2);
}

export async function getBackupDirInfo(backupDirPath) {
  const infoFilePath = join(backupDirPath, FULL_INFO_FILE_NAME);
  
  let data;
  try {
    data = await readFile(infoFilePath);
  } catch (err) {
    if (err.code == 'ENOENT') {
      throw new Error(`path is not a backup dir (no info.json): ${backupDirPath}`);
    } else {
      throw err;
    }
  }
  
  try {
    data = JSON.parse(data);
  } catch {
    throw new Error(`path is not a backup dir (info.json invalid json): ${backupDirPath}`);
  }
  
  if (data.folderType != 'coolguy284/node-hash-backup') {
    throw new Error(`path is not a backup dir (info.json type not hash backup): ${backupDirPath}`);
  }
  
  return data;
}

export async function isValidBackupDir(backupDirPath) {
  await errorIfPathNotDir(backupDirPath);
  
  try {
    await getBackupDirInfo(backupDirPath);
    return true;
  } catch {
    return false;
  }
}

export const BITS_PER_BYTE = 8;
export const HEX_CHAR_LENGTH_BITS = 4;

export const HASH_SIZES = new ReadOnlyMap(
  getHashes()
    .map(hashName => [
      hashName,
      (
        createHash(hashName)
          .update(Buffer.alloc())
          .digest()
          .length
      ) * BITS_PER_BYTE,
    ])
);

const INSECURE_HASH_PARTS = new Set(['md5', 'sha1']);

export const INSECURE_HASHES = new ReadOnlySet(
  Array.from(HASH_SIZES.keys())
    .filter(
      hashAlgo =>
        hashAlgo
          .toLowerCase()
          .split('-')
          .some(hashAlgoPart => INSECURE_HASH_PARTS.has(hashAlgoPart))
    )
);

console.log(INSECURE_HASHES);

export const COMPRESSION_ALGOS = new ReadOnlySet([
  'deflate-raw',
  'deflate',
  'gzip',
  'brotli',
]);

// unused for now:
// const VARIABLE_LENGTH_HAHSHES = new Set([
//   'shake128',
//   'shake256',
// ]);

export function createCompressor(compressionAlgo, compressionParams) {
  if (typeof compressionAlgo != 'string') {
    throw new Error(`compressionAlgo not string: ${typeof compressionAlgo}`);
  }
  
  switch (compressionAlgo) {
    case 'deflate-raw':
      return createDeflateRaw(compressionParams);
    
    case 'deflate':
      return createDeflate(compressionParams);
    
    case 'gzip':
      return createGzip(compressionParams);
    
    case 'brotli':
      return createBrotliCompress(compressionParams);
    
    default:
      throw new Error(`unknown compression algorithm: ${compressionAlgo}`);
  }
}

export async function compressBytes(bytes, compressionAlgo, compressionParams) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`bytes not Uint8Array: ${bytes}`);
  }
  
  let compressor = createCompressor(compressionAlgo, compressionParams);
  
  return await new Promise((r, j) => {
    let outputChunks = [];
    
    compressor.on('error', err => j(err));
    
    compressor.on('data', chunk => outputChunks.push(chunk));
    
    compressor.on('end', () => r(Buffer.concat(outputChunks)));
    
    compressor.write(bytes);
  });
}

export function createDecompressor(compressionAlgo, compressionParams) {
  if (typeof compressionAlgo != 'string') {
    throw new Error(`compressionAlgo not string: ${typeof compressionAlgo}`);
  }
  
  switch (compressionAlgo) {
    case 'deflate-raw':
      return createInflateRaw(compressionParams);
    
    case 'deflate':
      return createInflate(compressionParams);
    
    case 'gzip':
      return createGunzip(compressionParams);
    
    case 'brotli':
      return createBrotliDecompress(compressionParams);
    
    default:
      throw new Error(`unknown compression algorithm: ${compressionAlgo}`);
  }
}

export async function decompressBytes(compressedBytes, compressionAlgo, compressionParams) {
  if (!(compressedBytes instanceof Uint8Array)) {
    throw new Error(`bytes not Uint8Array: ${compressedBytes}`);
  }
  
  let decompressor = createDecompressor(compressionAlgo, compressionParams);
  
  return await new Promise((r, j) => {
    let outputChunks = [];
    
    decompressor.on('error', err => j(err));
    
    decompressor.on('data', chunk => outputChunks.push(chunk));
    
    decompressor.on('end', () => r(Buffer.concat(outputChunks)));
    
    decompressor.write(compressedBytes);
  });
}

export function createHasher(hashAlgo) {
  return createHash(hashAlgo);
}

export async function getHasherOutput(hasher) {
  return await new Promise((r, j) => {
    let outputChunks = [];
    
    hasher.on('error', err => j(err));
    
    hasher.on('data', chunk => outputChunks.push(chunk));
    
    hasher.on('end', () => r(Buffer.concat(outputChunks)));
  });
}

export async function hashBytes(bytes, hashAlgo) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`bytes not Uint8Array: ${bytes}`);
  }
  
  let hasher = createHasher(hashAlgo);
  
  return await new Promise((r, j) => {
    let outputChunks = [];
    
    hasher.on('error', err => j(err));
    
    hasher.on('data', chunk => outputChunks.push(chunk));
    
    hasher.on('end', () => r(Buffer.concat(outputChunks)));
    
    hasher.write(bytes);
  });
}

export function splitCompressObjectAlgoAndParams(compression) {
  return {
    compressionAlgo: compression.algorithm,
    compressionParams: Object.fromEntries(
      Object.entries(compression)
        .filter(([key, _]) => key != 'algorithm')
    )
  };
}
