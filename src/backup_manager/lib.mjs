import {
  createHash,
  getHashes,
} from 'node:crypto';
import {
  lstat,
  readFile,
  readlink,
  rm,
  watch,
} from 'node:fs/promises';
import {
  join,
  relative,
} from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  createBrotliCompress,
  createBrotliDecompress,
  createDeflate,
  createDeflateRaw,
  createGunzip,
  createGzip,
  createInflate,
  createInflateRaw,
} from 'node:zlib';

import {
  errorIfPathNotDir,
  fileOrFolderExists,
  isReadOnly,
  readLargeFile,
  splitPath,
} from '../lib/fs.mjs';
import { callBothLoggers } from '../lib/logger.mjs';
import { ReadOnlyMap } from '../lib/read_only_map.mjs';
import { ReadOnlySet } from '../lib/read_only_set.mjs';
import { unixNSIntToUnixSecString } from '../lib/time.mjs';

// main constants

export const MIN_BACKUP_VERSION = 1;
export const CURRENT_BACKUP_VERSION = 2;

// file name constants

export const META_FILE_EXTENSION = '.json';
export const HB_BACKUP_META_DIRECTORY = 'backups';
export const HB_BACKUP_META_FILE_EXTENSION = META_FILE_EXTENSION;
export const HB_FILE_META_DIRECTORY = 'files_meta';
export const HB_FILE_META_FILE_EXTENSION = META_FILE_EXTENSION;
export const HB_FILE_META_SINGULAR_META_FILE_NAME = `meta${HB_FILE_META_FILE_EXTENSION}`;
export const HB_FILE_DIRECTORY = 'files';
export const HB_FULL_INFO_FILE_EXTENSION = META_FILE_EXTENSION;
export const HB_FULL_INFO_FILE_NAME = `info${HB_FULL_INFO_FILE_EXTENSION}`;
export const HB_EDIT_LOCK_FILE = 'edit.lock';

// more internal constants

export const BACKUP_PATH_SEP = '/';
export const BITS_PER_BYTE = 8;
export const HEX_CHAR_LENGTH_BITS = 4;

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
  const infoFilePath = join(backupDirPath, HB_FULL_INFO_FILE_NAME);
  
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

const HASH_SIZES = new ReadOnlyMap(
  getHashes()
    .map(hashName => [
      hashName,
      (
        createHash(hashName)
          .update(Buffer.alloc(0))
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

export const COMPRESSION_ALGOS = new ReadOnlySet([
  'deflate-raw',
  'deflate',
  'gzip',
  'brotli',
]);

// for these, an outputLength parameter can be passed to hash params
export const VARIABLE_LENGTH_HAHSHES = new Set([
  'shake128',
  'shake256',
]);

export const RECOMMENDED_MINIMUM_TRIMMED_HASH_LENGTH_BITS = 128;

export function hashAlgoKnown(hashAlgo) {
  return HASH_SIZES.has(hashAlgo);
}

export function getHashOutputSizeBits(hashAlgo, hashParams = null) {
  if (typeof hashAlgo != 'string') {
    throw new Error(`hashAlgo not string: ${hashAlgo}`);
  }
  
  if (!HASH_SIZES.has(hashAlgo)) {
    throw new Error(`hashAlgo unrecognized: ${hashAlgo}`);
  }
  
  if (hashParams != null && typeof hashParams != 'object') {
    throw new Error(`hashParams not object or null: ${hashParams}`);
  }
  
  if (VARIABLE_LENGTH_HAHSHES.has(hashAlgo)) {
    if (hashParams != null) {
      if (!Number.isSafeInteger(hashParams.outputLength) || hashParams.outputLength < 0) {
        throw new Error(`hashParams.outputLength invalid: ${hashParams.outputLength}`);
      }
      
      return hashParams.outputLength * BITS_PER_BYTE;
    }
  }
  
  return HASH_SIZES.get(hashAlgo);
}

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
    
    compressor.end(bytes);
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
    
    decompressor.end(compressedBytes);
  });
}

function createHasher(hashAlgo, hashParams) {
  if (typeof hashAlgo != 'string') {
    throw new Error(`hashAlgo not string: ${typeof hashAlgo}`);
  }
  
  if (!HASH_SIZES.has(hashAlgo)) {
    throw new Error(`hashAlgo unknown: ${hashAlgo}`);
  }
  
  return createHash(hashAlgo, hashParams);
}

async function getHasherOutput(hasher) {
  return await new Promise((r, j) => {
    let outputChunks = [];
    
    hasher.on('error', err => j(err));
    
    hasher.on('data', chunk => outputChunks.push(chunk));
    
    hasher.on('end', () => r(Buffer.concat(outputChunks)));
  });
}

function trimHashOutputAndConvertToHex(hashOutputBuf, hashOutputTrimLength) {
  const hexString = hashOutputBuf.toString('hex');
  
  if (hashOutputTrimLength != null) {
    return hexString.slice(0, hashOutputTrimLength);
  } else {
    return hexString;
  }
}

export async function hashBytes(bytes, hashAlgo, hashParams = null, hashOutputTrimLength = null) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`bytes not Uint8Array: ${bytes}`);
  }
  
  let hasher = createHasher(hashAlgo, hashParams);
  
  const hasherResult = new Promise((r, j) => {
    let outputChunks = [];
    
    hasher.on('error', err => j(err));
    
    hasher.on('data', chunk => outputChunks.push(chunk));
    
    hasher.on('end', () => r(Buffer.concat(outputChunks)));
    
    hasher.end(bytes);
  });
  
  return trimHashOutputAndConvertToHex(await hasherResult, hashOutputTrimLength);
}

export async function hashStream(stream, hashAlgo, hashParams = null, hashOutputTrimLength = null) {
  let hasher = createHasher(hashAlgo, hashParams);
  
  const hasherResult = getHasherOutput(hasher);
  
  await pipeline(
    stream,
    hasher
  );
  
  return trimHashOutputAndConvertToHex(await hasherResult, hashOutputTrimLength);
}

export function splitCompressObjectAlgoAndParams(compression) {
  return {
    compressionAlgo: compression.algorithm,
    compressionParams: Object.fromEntries(
      Object.entries(compression)
        .filter(([key, _]) => key != 'algorithm')
    ),
  };
}

export async function getAndAddBackupEntry({
  baseFileOrFolderPath,
  subFileOrFolderPath,
  stats,
  addingLogger = null,
  // if null, hash will not be included
  addFileToStoreFunc = null,
  includeBytes = false,
}) {
  const backupInternalNativePath = relative(baseFileOrFolderPath, subFileOrFolderPath);
  const relativeFilePath =
    backupInternalNativePath == '' ?
      '.' :
      splitPath(backupInternalNativePath).join(BACKUP_PATH_SEP);
  
  const atime = unixNSIntToUnixSecString(stats.atimeNs);
  const mtime = unixNSIntToUnixSecString(stats.mtimeNs);
  const ctime = unixNSIntToUnixSecString(stats.ctimeNs);
  const birthtime = unixNSIntToUnixSecString(stats.birthtimeNs);
  
  if (stats.isDirectory()) {
    if (addingLogger != null) addingLogger(`Adding ${JSON.stringify(subFileOrFolderPath)} [directory]`);
    
    return {
      path: relativeFilePath,
      type: 'directory',
      ...(
        (await isReadOnly(subFileOrFolderPath)) ?
          { attributes: ['readonly'] } :
          {}
      ),
      atime,
      mtime,
      ctime,
      birthtime,
    };
  } else if (stats.isSymbolicLink()) {
    if (addingLogger != null) addingLogger(`Adding ${JSON.stringify(subFileOrFolderPath)} [symbolic link]`);
    
    const linkPathBuf = await readlink(subFileOrFolderPath, { encoding: 'buffer' });
    const linkPathBase64 = linkPathBuf.toString('base64');
    
    if (addingLogger != null) addingLogger(`Points to: ${JSON.stringify(linkPathBuf.toString())}`);
    
    return {
      path: relativeFilePath,
      type: 'symbolic link',
      ...(
        (await isReadOnly(subFileOrFolderPath)) ?
          { attributes: ['readonly'] } :
          {}
      ),
      symlinkPath: linkPathBase64,
      atime,
      mtime,
      ctime,
      birthtime,
    };
  } else {
    // file, or something else that will be attempted to be read as a file
    
    if (addingLogger != null) addingLogger(`Adding ${JSON.stringify(subFileOrFolderPath)} [file]`);
    
    return {
      path: relativeFilePath,
      type: 'file',
      ...(
        (await isReadOnly(subFileOrFolderPath)) ?
          { attributes: ['readonly'] } :
          {}
      ),
      ...(
        addFileToStoreFunc != null ?
          {
            hash: await addFileToStoreFunc(),
          } :
          {}
      ),
      atime,
      mtime,
      ctime,
      birthtime,
      ...(
        includeBytes ?
          {
            bytes: await readLargeFile(subFileOrFolderPath),
          } :
          {}
      ),
    };
  }
}

export async function deleteBackupDirInternal({
  backupDirPath,
  logger = null,
  globalLogger = null,
}) {
  if (typeof backupDirPath != 'string') {
    throw new Error(`backupDirPath not string: ${typeof backupDirPath}`);
  }
  
  if (typeof logger != 'function' && logger != null) {
    throw new Error(`logger not function or null: ${typeof logger}`);
  }
  
  if (typeof globalLogger != 'function' && globalLogger != null) {
    throw new Error(`globalLogger not function or null: ${typeof globalLogger}`);
  }
  
  await errorIfPathNotDir(backupDirPath);
  
  if (!(await fileOrFolderExists(join(backupDirPath, HB_FULL_INFO_FILE_NAME)))) {
    throw new Error(`Directory does not appear to be a backup dir: ${backupDirPath}`);
  }
  
  callBothLoggers({ logger, globalLogger }, `Destroying backup dir at ${JSON.stringify(backupDirPath)}`);
  
  await rm(join(backupDirPath, HB_BACKUP_META_DIRECTORY), { recursive: true });
  await rm(join(backupDirPath, HB_FILE_DIRECTORY), { recursive: true });
  await rm(join(backupDirPath, HB_FILE_META_DIRECTORY), { recursive: true });
  await rm(join(backupDirPath, HB_FULL_INFO_FILE_NAME));
  
  callBothLoggers({ logger, globalLogger }, `Backup dir successfully destroyed at ${JSON.stringify(backupDirPath)}`);
}

export async function permissiveGetFileType(filePath) {
  let stats;
  
  try {
    stats = await lstat(filePath);
  } catch (err) {
    if (err.code == 'ENOENT') {
      return null;
    } else {
      throw err;
    }
  }
  
  if (stats.isSymbolicLink()) {
    return 'symbolic link';
  } else if (stats.isDirectory()) {
    return 'directory';
  } else if (stats.isFile()) {
    return 'file';
  } else {
    return 'other';
  }
}

export async function awaitFileDeletion(filePath, timeout = null) {
  if (timeout != null && !Number.isSafeInteger(timeout)) {
    throw new Error(`timeout invalid: ${timeout}`);
  }
  
  if (timeout != null && timeout <= 0) {
    throw new Error(`timeout ${timeout} exceeded awaiting file deletion`);
  }
  
  const abortController = new AbortController();
  
  let abortTimeout = null;
  
  let errorThrown = false;
  let errorValue;
  
  if (timeout != null) {
    abortTimeout = setTimeout(() => {
      errorThrown = true;
      errorValue = new Error(`timeout ${timeout} exceeded awaiting file deletion`);
      abortController.abort();
    }, timeout);
  }
  
  try {
    for await (const event of watch(filePath, { signal: abortController.signal })) {
      if (event.filename != filePath) {
        // error, watchfile called on directory
        const error = new Error(`awaitFileDeletion called on a directory: ${JSON.stringify(filePath)}`);
        errorThrown = true;
        errorValue = error;
        abortController.abort();
        if (abortTimeout != null) {
          clearTimeout(abortTimeout);
        }
        throw error;
      }
      
      if (event.eventType == 'rename') {
        if (!(await fileOrFolderExists(filePath))) {
          // success, file deleted
          abortController.abort();
          if (abortTimeout != null) {
            clearTimeout(abortTimeout);
          }
          break;
        }
      }
    }
  } catch (err) {
    if (err.name == 'AbortError') {
      if (errorThrown) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw errorValue;
      }
    } else {
      throw err;
    }
  }
}
