import {
  createHash,
  getHashes,
} from 'crypto';
import {
  createReadStream,
  createWriteStream,
} from 'fs';
import {
  copyFile,
  mkdir,
  open,
  readdir,
  readlink,
  rename,
  rm,
  rmdir,
  unlink,
} from 'fs/promises';
import {
  dirname,
  join,
  relative,
  resolve,
} from 'path';
import { pipeline } from 'stream/promises';
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

import {
  errorIfPathNotDir,
  fileExists,
  readLargeFile,
  recursiveReaddir,
  safeRename,
  setReadOnly,
  splitPath,
  SymlinkModes,
  testCreateFile,
  writeFileReplaceWhenDone,
} from './lib/fs.mjs';
import { callBothLoggers } from './lib/logger.mjs';
import { ReadOnlyMap } from './lib/read_only_map.mjs';
import { ReadOnlySet } from './lib/read_only_set.mjs';
import { streamsEqual } from './lib/stream_equality.mjs';
import { unixNSIntToUnixSecString } from './lib/time.mjs';
import {
  backupFileStringify,
  CURRENT_BACKUP_VERSION,
  fullInfoFileStringify,
  getBackupDirInfo,
  metaFileStringify,
} from './lib.mjs';
import { upgradeDirToCurrent } from './upgrader.mjs';

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

function createCompressor(compressionAlgo, compressionParams) {
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

async function compressBytes(bytes, compressionAlgo, compressionParams) {
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

function createDecompressor(compressionAlgo, compressionParams) {
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

async function decompressBytes(compressedBytes, compressionAlgo, compressionParams) {
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

function createHasher(hashAlgo) {
  return createHash(hashAlgo);
}

async function getHasherOutput(hasher) {
  return await new Promise((r, j) => {
    let outputChunks = [];
    
    hasher.on('error', err => j(err));
    
    hasher.on('data', chunk => outputChunks.push(chunk));
    
    hasher.on('end', () => r(Buffer.concat(outputChunks)));
  });
}

async function hashBytes(bytes, hashAlgo) {
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

function stripAlgorithmFromCompressObject(compression) {
  return Object.fromEntries(
    Object.entries(compression)
      .filter(([key, _]) => key != 'algorithm')
  );
}

class BackupManager {
  // class vars
  
  #disposed = false;
  #lockFile = null;
  #backupDirPath = null;
  #hashAlgo = null;
  #hashSlices = null;
  #hashSliceLength = null;
  #compressionAlgo = null;
  #compressionParams = null;
  #hashHexLength = null;
  #globalLogger;
  #allowFullBackupDirDestroy = false;
  #allowSingleBackupDestroy = false;
  
  // helper funcs
  
  #log(logger, data) {
    callBothLoggers(
      {
        logger,
        globalLogger: this.#globalLogger,
      },
      data
    );
  }
  
  #ensureBackupDirLive() {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
  }
  
  #setBackupDirVars({
    hashAlgo,
    hashSlices,
    hashSliceLength,
    compressionAlgo = null,
    compressionParams = null,
  }) {
    this.#hashAlgo = hashAlgo;
    this.#hashSlices = hashSlices;
    this.#hashSliceLength = hashSliceLength;
    this.#compressionAlgo = compressionAlgo;
    this.#compressionParams = compressionParams;
    this.#hashHexLength = HASH_SIZES.get(this.#hashAlgo) / HEX_CHAR_LENGTH_BITS;
  }
  
  #clearBackupDirVars() {
    this.#hashAlgo = null;
    this.#hashSlices = null;
    this.#hashSliceLength = null;
    this.#compressionAlgo = null;
    this.#compressionParams = null;
    this.#hashHexLength = null;
  }
  
  async #initManager({
    backupDirPath,
    autoUpgradeDir,
    globalLogger,
    logger,
  }) {
    if (typeof backupDirPath != 'string') {
      throw new Error(`backupDirPath not string: ${typeof backupDirPath}`);
    }
    
    if (typeof autoUpgradeDir != 'boolean' && autoUpgradeDir != null) {
      throw new Error(`autoUpgradeDir must be boolean or null, but was: ${typeof autoUpgradeDir}`);
    }
    
    if (typeof globalLogger != 'function' && globalLogger != null) {
      throw new Error(`globalLogger must be a function or null, but was: ${typeof globalLogger}`);
    }
    
    this.#globalLogger = globalLogger ?? null;
    
    if (typeof logger != 'function' && logger != null) {
      throw new Error(`logger must be a function or null, but was: ${typeof logger}`);
    }
    
    await errorIfPathNotDir(backupDirPath);
    
    // create lock file
    this.#lockFile = await open(join(backupDirPath, 'edit.lock'), 'w');
    
    this.#backupDirPath = backupDirPath;
    
    const currentDirContents =
      (await readdir(backupDirPath))
        .filter(x => x != 'edit.lock');
    
    if (currentDirContents.length != 0) {
      // dir contains hash backup contents
      
      let info = await getBackupDirInfo(backupDirPath);
      
      if (info.version > CURRENT_BACKUP_VERSION) {
        throw new Error(`backup dir version is for more recent version of program: ${info.version} > ${CURRENT_BACKUP_VERSION}`);
      }
      
      if (info.version < CURRENT_BACKUP_VERSION) {
        if (autoUpgradeDir) {
          await upgradeDirToCurrent({
            backupDirPath,
            logger,
            globalLogger,
          });
          
          info = await getBackupDirInfo(backupDirPath);
        } else {
          throw new Error(
            `cannot open backup dir, dir version (${info.version}) < supported version (${CURRENT_BACKUP_VERSION})\n` +
            'specify "autoUpgradeDir: true" in args to auto upgrade'
          );
        }
      }
      
      // info.version == CURRENT_BACKUP_VERSION here
      
      this.#setBackupDirVars({
        hashAlgo: info.hash,
        hashSlices: info.hashSlices,
        hashSliceLength: info.hashSliceLength ?? null,
        ...(
          info.compression != null ?
            {
              compressionAlgo: info.compression.algorithm,
              compressionParams: Object.fromEntries(
                Object.entries(info.compression).filter(([key, _]) => key != 'algorithm')
              ),
            } :
            {}
        ),
      });
    }
    
    // otherwise, dir is currently empty, leave vars at defaults
    
    return this;
  }
  
  #getPathOfFile(fileHashHex) {
    let hashSliceParts = [];
    
    for (let i = 0; i < this.#hashSlices; i++) {
      hashSliceParts.push(fileHashHex.slice(this.#hashSliceLength * i, this.#hashSliceLength * (i + 1)));
    }
    
    return join(this.#backupDirPath, ...hashSliceParts, fileHashHex);
  }
  
  #getMetaPathOfFile(fileHashHex) {
    if (this.#hashSlices == 0) {
      return join(this.#backupDirPath, 'meta.json');
    } else {
      let hashSliceParts = [];
      
      for (let i = 0; i < this.#hashSlices; i++) {
        hashSliceParts.push(fileHashHex.slice(this.#hashSliceLength * i, this.#hashSliceLength * (i + 1)));
      }
      
      return join(this.#backupDirPath, ...hashSliceParts.slice(0, -1), `${hashSliceParts.at(-1)}.json`);
    }
  }
  
  async #fileIsInStore(fileHashHex) {
    const filePath = this.#getPathOfFile(fileHashHex);
    
    return await fileExists(filePath);
  }
  
  async #addFileBytesToStore(fileBytes, logger) {
    const fileHashHex = (await hashBytes(fileBytes, this.#hashAlgo)).toString('hex');
    
    this.#log(logger, `Hash: ${fileHashHex}`);
    
    if (await this.#fileIsInStore(fileHashHex)) {
      const storeFileBytes = await this.#getFileBytesFromStore(fileHashHex);
      
      if (!fileBytes.equals(storeFileBytes)) {
        throw new Error(`Hash Collision Found: ${JSON.stringify(this.#getPathOfFile(fileHashHex))} and fileBytes have same ${this.#hashAlgo} hash: ${fileHashHex}`);
      }
    } else {
      let compressionUsed = false;
      let compressedBytes;
      
      if (this.#compressionAlgo != null) {
        compressedBytes = await compressBytes(fileBytes, this.#compressionAlgo, this.#compressionParams);
        
        if (compressedBytes.length < fileBytes.length) {
          this.#log(logger, `Compressed with ${this.#compressionAlgo} (${JSON.stringify(this.#compressionParams)}) from ${fileBytes.length} bytes to ${compressedBytes.length} bytes`);
          compressionUsed = true;
        } else {
          this.#log(logger, `Not compressed with ${this.#compressionAlgo} (${JSON.stringify(this.#compressionParams)}) as file size increases from ${fileBytes.length} bytes to ${compressedBytes.length} bytes`);
        }
      }
      
      const newFilePath = this.#getPathOfFile(fileHashHex);
      const metaFilePath = this.#getMetaPathOfFile(fileHashHex);
      
      let metaJson;
      
      if (fileExists(metaFilePath)) {
        metaJson = JSON.parse((await readLargeFile(metaFilePath)).toString());
      } else {
        await mkdir(dirname(metaFilePath), { recursive: true });
        metaJson = {};
      }
      
      metaJson[fileHashHex] = {
        size: fileBytes.length,
        ...(
          compressionUsed ?
            {
              compressedSize: compressedBytes.length,
              compression: {
                algorithm: this.#compressionAlgo,
                ...this.#compressionParams,
              },
            } :
            {}
        ),
      };
      
      await mkdir(dirname(newFilePath), { recursive: true });
      await writeFileReplaceWhenDone(newFilePath, compressionUsed ? compressedBytes : fileBytes);
      await writeFileReplaceWhenDone(metaFilePath, metaFileStringify(metaJson));
      
      await setReadOnly(newFilePath);
    }
    
    return fileHashHex;
  }
  
  async #addFilePathStreamToStore(filePath, logger) {
    const fileHandle = await open(filePath);
    
    try {
      const fileStream = fileHandle.createReadStream();
      const hasher = createHasher(this.#hashAlgo);
      const hasherResult = getHasherOutput(hasher);
      
      await pipeline(
        fileStream,
        hasher
      );
      
      const fileHashHex = (await hasherResult).toString('hex');
      
      this.#log(logger, `Hash: ${fileHashHex}`);
      
      if (await this.#fileIsInStore(fileHashHex)) {
        const storeFileStream = this.#getFileStreamFromStore(fileHashHex);
        
        if (!(await streamsEqual([fileStream, storeFileStream]))) {
          throw new Error(`Hash Collision Found: ${JSON.stringify(this.#getPathOfFile(fileHashHex))} and ${JSON.stringify(filePath)} have same ${this.#hashAlgo} hash: ${fileHashHex}`);
        }
      } else {
        let compressionUsed = false;
        
        if (this.#compressionAlgo != null) {
          const tmpDirPath = join(this.#backupDirPath, 'temp');
          await mkdir(tmpDirPath, { recursive: true });
          
          try {
            const compressedFilePath = join(tmpDirPath, fileHashHex);
            const fileStream2 = fileHandle.createReadStream();
            const compressor = createCompressor(this.#compressionAlgo, this.#compressionParams);
            const compressedFile = createWriteStream(compressedFilePath);
            
            await pipeline(
              fileStream2,
              compressor,
              compressedFile
            );
            
            let compressedSize;
            if (compressedFile.closed) {
              compressedSize = compressedFile.bytesWritten;
            } else {
              await new Promise(r => {
                compressedFile.once('close', () => {
                  r(compressedSize);
                });
              });
            }
            
            if (compressedSize < fileStream.bytesRead) {
              this.#log(logger, `Compressed with ${this.#compressionAlgo} (${JSON.stringify(this.#compressionParams)}) from ${fileStream.bytesRead} bytes to ${compressedSize} bytes`);
              compressionUsed = true;
            } else {
              this.#log(logger, `Not compressed with ${this.#compressionAlgo} (${JSON.stringify(this.#compressionParams)}) as file size increases from ${fileStream.bytesRead} bytes to ${compressedSize} bytes`);
              await unlink(compressedFilePath);
            }
            
            const newFilePath = this.#getPathOfFile(fileHashHex);
            const metaFilePath = this.#getMetaPathOfFile(fileHashHex);
            
            let metaJson;
            
            if (fileExists(metaFilePath)) {
              metaJson = JSON.parse((await readLargeFile(metaFilePath)).toString());
            } else {
              await mkdir(dirname(metaFilePath), { recursive: true });
              metaJson = {};
            }
            
            metaJson[fileHashHex] = {
              size: fileBytes.length,
              ...(
                compressionUsed ?
                  {
                    compressedSize,
                    compression: {
                      algorithm: this.#compressionAlgo,
                      ...this.#compressionParams,
                    },
                  } :
                  {}
              ),
            };
            
            await mkdir(dirname(newFilePath), { recursive: true });
            if (compressionUsed) {
              await rename(compressedFilePath, newFilePath);
            } else {
              await copyFile(filePath, newFilePath);
            }
            await writeFileReplaceWhenDone(metaFilePath, metaFileStringify(metaJson));
      
            await setReadOnly(newFilePath);
          } finally {
            if ((await readdir(tmpDirPath)).length == 0) {
              await rmdir(tmpDirPath);
            }
          }
        }
      }
      
      return fileHashHex;
    } finally {
      await fileHandle[Symbol.asyncDispose]();
    }
  }
  
  async #getMetaOfFile(fileHashHex) {
    const metaFilePath = this.#getMetaPathOfFile(fileHashHex);
    
    const metaJson = JSON.parse((await readLargeFile(metaFilePath)).toString());
    
    if (!(fileHashHex in metaJson)) {
      throw new Error(`fileHash (${fileHashHex}) not found in meta files`);
    }
    
    return metaJson[fileHashHex];
  }
  
  async #getFileBytesFromStore(fileHashHex) {
    const filePath = this.#getPathOfFile(fileHashHex);
    const fileMeta = this.#getMetaOfFile(fileHashHex);
    
    const rawFileBytes = await readLargeFile(filePath);
    
    if (fileMeta.compression != null) {
      return await decompressBytes(
        rawFileBytes,
        fileMeta.compression.algorithm,
        stripAlgorithmFromCompressObject(fileMeta.compression)
      );
    } else {
      return rawFileBytes;
    }
  }
  
  #getFileStreamFromStore(fileHashHex) {
    const filePath = this.#getPathOfFile(fileHashHex);
    const fileMeta = this.#getMetaOfFile(fileHashHex);
    
    const fileStream = createReadStream(filePath);
    
    if (fileMeta.compression != null) {
      const decompressor = createDecompressor(
        fileMeta.compression.algorithm,
        stripAlgorithmFromCompressObject(fileMeta.compression)
      );
      
      fileStream.pipe(decompressor);
      
      return decompressor;
    } else {
      return fileStream;
    }
  }
  
  async #removeFileFromStore(fileHashHex, logger) {
    this.#log(logger, `Removing file with hash: ${fileHashHex}`);
    
    const filePath = this.#getPathOfFile(fileHashHex);
    const metaFilePath = this.#getMetaPathOfFile(fileHashHex);
    
    let metaDeletionErrorOccurred = false;
    let metaDeletionError;
    
    try {
      let metaJson = JSON.parse((await readLargeFile(metaFilePath)).toString());
      
      delete metaJson[fileHashHex];
      
      if (Object.keys(metaJson).length == 0) {
        // begin delete chain for meta file
        
        await unlink(metaFilePath);
        
        if (this.#hashSlices > 0) {
          let currentDirName = dirname(metaFilePath);
          
          for (let sliceIndex = this.#hashSlices - 1; sliceIndex > 0; sliceIndex--) {
            const metaDirContents = await readdir(currentDirName);
            
            if (metaDirContents.length == 0) {
              await rmdir(currentDirName);
            } else {
              break;
            }
            
            currentDirName = resolve(currentDirName, '..');
          }
        }
      } else {
        await writeFileReplaceWhenDone(metaFilePath, metaFileStringify(metaJson));
      }
    } catch (err) {
      this.#log(logger, `ERROR deleting metadata: msg:${err.toString()} code:${err.code} stack:\n${err.stack}`);
      metaDeletionErrorOccurred = true;
      metaDeletionError = err;
    }
    
    await unlink(filePath);
    
    // begin delete chain for regular file
    
    if (this.#hashSlices > 0) {
      let currentDirName = dirname(filePath);
      
      for (let sliceIndex = this.#hashSlices; sliceIndex > 0; sliceIndex--) {
        const fileDirContents = await readdir(currentDirName);
        
        if (fileDirContents.length == 0) {
          await rmdir(currentDirName);
        } else {
          break;
        }
        
        currentDirName = resolve(currentDirName, '..');
      }
    }
    
    if (metaDeletionErrorOccurred) {
      throw metaDeletionError;
    }
  }
  
  async #addAndGetBackupEntry(fileOrFolderPath, filePath, stats, inMemoryCutoffSize, logger) {
    const relativeFilePath = relative(fileOrFolderPath, filePath) || '.';
    
    const atime = unixNSIntToUnixSecString(stats.atimeNs);
    const mtime = unixNSIntToUnixSecString(stats.mtimeNs);
    const ctime = unixNSIntToUnixSecString(stats.ctimeNs);
    const birthtime = unixNSIntToUnixSecString(stats.birthtimeNs);
    
    if (stats.isDirectory()) {
      this.#log(logger, `Adding ${JSON.stringify(fileOrFolderPath)} [directory]`);
      
      return {
        path: relativeFilePath,
        type: 'directory',
        atime,
        mtime,
        ctime,
        birthtime,
      };
    } else if (stats.isSymbolicLink()) {
      this.#log(logger, `Adding ${JSON.stringify(fileOrFolderPath)} [symbolic link]`);
      
      const linkPathBuf = await readlink(filePath, { encoding: 'buffer' });
      const linkPathBase64 =
        linkPathBuf
        .toString('base64');
      
      this.#log(logger, `Points to: ${JSON.stringify(linkPathBuf.toString())}`);
      
      return {
        path: relativeFilePath,
        type: 'symbolic link',
        symlinkPath: linkPathBase64,
        atime,
        mtime,
        ctime,
        birthtime,
      };
    } else {
      // file, or something else that will be attempted to be read as a file
      
      this.#log(logger, `Adding ${JSON.stringify(fileOrFolderPath)} [file]`);
      
      let hash;
      
      if (stats.size <= inMemoryCutoffSize) {
        const fileBytes = await readLargeFile(filePath);
        hash = await this.#addFileBytesToStore(fileBytes, logger);
      } else {
        hash = await this.#addFilePathStreamToStore(filePath, logger);
      }
      
      return {
        path: relativeFilePath,
        type: 'file',
        hash,
        atime,
        mtime,
        ctime,
        birthtime,
      };
    }
  }
  
  // public funcs
  
  // This function is async as it calls an async helper and returns the corresponding promise
  constructor(backupDirPath, {
    autoUpgradeDir,
    globalLogger,
  }) {
    return this.#initManager({
      backupDirPath,
      autoUpgradeDir,
      globalLogger,
    });
  }
  
  isDisposed() {
    return this.#disposed;
  }
  
  isInitialized() {
    return this.#hashAlgo != null;
  }
  
  getBackupDirPath() {
    return this.#backupDirPath;
  }
  
  async initBackupDir({
    hashAlgo = 'sha256',
    hashSlices = 1,
    hashSliceLength = null,
    compressionAlgo = 'brotli',
    compressionParams = { level: 6 },
    logger,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (typeof hashAlgo != 'string') {
      throw new Error(`hashAlgo not string: ${typeof hashAlgo}`);
    }
    
    if (!HASH_SIZES.has(hashAlgo)) {
      throw new Error(`hashAlgo unrecognized: ${hashAlgo}`);
    }
    
    if (!Number.isSafeInteger(hashSlices) || hashSlices < 0) {
      throw new Error(`hashSlices not nonnegative integer: ${hashSlices}`);
    }
    
    if (hashSlices == 0) {
      if (hashSliceLength != null) {
        throw new Error(`hashSliceLength not null despite no hashSlices: ${hashSliceLength}`);
      }
    } else {
      hashSliceLength = hashSliceLength ?? 2;
      
      if (!Number.isSafeInteger(hashSliceLength) || hashSliceLength < 0) {
        throw new Error(`hashSliceLength not nonnegative integer: ${hashSliceLength}`);
      }
    }
    
    if (hashSlices != 0) {
      const hashLengthBits = HASH_SIZES.has(hashAlgo);
      const totalHashSliceLengthBits = hashSlices * hashSliceLength * HEX_CHAR_LENGTH_BITS;
      if (totalHashSliceLengthBits > hashLengthBits) {
        throw new Error(
          `hashSlices (${hashSlices}) * hashSliceLength (${hashSliceLength}) * ${HEX_CHAR_LENGTH_BITS} = ${totalHashSliceLengthBits} > hash size in bits (${hashLengthBits})`
        );
      }
    }
    
    if (typeof compressionAlgo != 'string' && compressionAlgo != null) {
      throw new Error(`compressionAlgo not string: ${compressionAlgo}`);
    }
    
    if (compressionAlgo != null) {
      if (!COMPRESSION_ALGOS.has(compressionAlgo)) {
        throw new Error(`compressionAlgo unknown: ${compressionAlgo}`);
      }
      
      if (typeof compressionParams != 'object' && compressionParams != null) {
        throw new Error(`compressionParams not object or null: ${compressionParams}`);
      }
      
      if (compressionParams != null) {
        if ('algorithm' in compressionParams) {
          throw new Error(`compressionParams contains disallowed key "algorithm": ${JSON.stringify(compressionParams)}`);
        }
      }
      
      try {
        await compressBytes(Buffer.from('test'), compressionAlgo, compressionParams);
      } catch {
        throw new Error(`compressionParams invalid: ${JSON.stringify(compressionParams)}`);
      }
    } else {
      if (compressionParams != null) {
        throw new Error(`compressionAlgo null but compressionParams not null: ${compressionParams}`);
      }
    }
    
    if (typeof logger != 'function' && logger != null) {
      throw new Error(`logger not function or null: ${typeof logger}`);
    }
    
    if (this.#hashAlgo != null) {
      throw new Error('backup dir already initialized');
    }
    
    if (INSECURE_HASHES.has(hashAlgo)) {
      this.#log(logger, `WARNING: insecure hash algorithm used for backup dir: ${hashAlgo}`);
    }
    
    this.#log(logger, `Initializing backup dir at ${JSON.stringify(this.#backupDirPath)}`);
    
    await mkdir(join(this.#backupDirPath, 'backups'));
    await mkdir(join(this.#backupDirPath, 'files'));
    await mkdir(join(this.#backupDirPath, 'files_meta'));
    const infoFilePath = join(this.#backupDirPath, 'info.json')
    await writeFileReplaceWhenDone(
      infoFilePath,
      fullInfoFileStringify({
        folderType: 'coolguy284/node-hash-backup',
        version: 2,
        hash: hashAlgo,
        hashSlices: hashSlices,
        ...(hashSliceLength != null ? { hashSliceLength } : {}),
        ...(
          compressionAlgo != null ?
            {
              compression: {
                algorithm: compressionAlgo,
                ...compressionParams,
              }
            } :
            {}
        ),
      })
    );
      
    await setReadOnly(infoFilePath);
    
    this.#log(logger, `Backup dir successfully initialized at ${JSON.stringify(this.#backupDirPath)}`);
    
    this.#setBackupDirVars({
      hashAlgo,
      hashSlices,
      hashSliceLength,
      compressionAlgo,
      compressionParams,
    });
  }
  
  getAllowFullBackupDirDestroyStatus() {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    return this.#allowFullBackupDirDestroy;
  }
  
  updateAllowFullBackupDirDestroyStatus_Danger(newAllowFullBackupDirDestroy) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (typeof newAllowFullBackupDirDestroy != 'boolean') {
      throw new Error(`newAllowFullBackupDirDestroy not boolean: ${typeof newAllowFullBackupDirDestroy}`);
    }
    
    this.#allowFullBackupDirDestroy = newAllowFullBackupDirDestroy;
  }
  
  async destroyBackupDir({ logger }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (!this.#allowFullBackupDirDestroy) {
      throw new Error(
        'full backup dir deletion attempted, but backup dir destroy flag is false\n' +
        'call "this.updateAllowFullBackupDirDestroyStatus_Danger(true);" to enable full backup dir destruction'
      );
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir already destroyed');
    }
    
    this.#log(logger, `Destroying backup dir at ${JSON.stringify(this.#backupDirPath)}`);
    
    await rm(join(this.#backupDirPath, 'backups'), { recursive: true });
    await rm(join(this.#backupDirPath, 'files'), { recursive: true });
    await rm(join(this.#backupDirPath, 'files_meta'), { recursive: true });
    await rm(join(this.#backupDirPath, 'info.json'));
    
    this.#log(logger, `Backup dir successfully destroyed at ${JSON.stringify(this.#backupDirPath)}`);
    
    this.#clearBackupDirVars();
  }
  
  async listBackups() {
    this.#ensureBackupDirLive();
    
    return (await readdir(join(this.#backupDirPath, 'backups')))
      .filter(x => x.endsWith('.json'))
      .map(x => x.slice(0, -('.json'.length)));
  }
  
  async hasBackup(backupName) {
    this.#ensureBackupDirLive();
    
    if (typeof backupName != 'string') {
      throw new Error(`backupName not string: ${typeof backupName}`);
    }
    
    const backupFilePath = join(this.#backupDirPath, 'backups', `${backupName}.json`);
    
    return await fileExists(backupFilePath);
  }
  
  async createBackup({
    backupName,
    fileOrFolderPath,
    excludedFilesOrFolders = [],
    symlinkMode = SymlinkModes.PRESERVE,
    ignoreErrors = false,
    inMemoryCutoffSize = 4 * 2 ** 20,
    logger,
  }) {
    this.#ensureBackupDirLive();
    
    if (typeof backupName != 'string') {
      throw new Error(`backupName not string: ${typeof backupName}`);
    }
    
    if (typeof fileOrFolderPath != 'string') {
      throw new Error(`fileOrFolderPath not string: ${typeof fileOrFolderPath}`);
    }
    
    if (!Array.isArray(excludedFilesOrFolders)) {
      throw new Error(`excludedFilesOrFolders not array: ${excludedFilesOrFolders}`);
    }
    
    for (let i = 0; i < excludedFilesOrFolders.length; i++) {
      if (typeof excludedFilesOrFolders[i] != 'string') {
        throw new Error(`excludedFilesOrFolders[${i}] not string: ${typeof excludedFilesOrFolders[i]}`);
      }
    }
    
    if (typeof symlinkMode != 'string') {
      throw new Error(`symlinkMode not string: ${typeof symlinkMode}`);
    }
    
    if (!(symlinkMode in SymlinkModes)) {
      throw new Error(`symlinkMode not in SymlinkModes: ${symlinkMode}`);
    }
    
    if (typeof ignoreErrors != 'boolean') {
      throw new Error(`ignoreErrors not boolean: ${typeof ignoreErrors}`);
    }
    
    if (inMemoryCutoffSize != Infinity && (!Number.isSafeInteger(inMemoryCutoffSize) || inMemoryCutoffSize < -1)) {
      throw new Error(`inMemoryCutoffSize not string: ${typeof inMemoryCutoffSize}`);
    }
    
    if (typeof logger != 'function' && logger != null) {
      throw new Error(`logger not function or null: ${typeof logger}`);
    }
    
    const pathToBackupDir = relative(fileOrFolderPath, this.#backupDirPath);
    
    if (pathToBackupDir == '') {
      // this.#backupDirPath is same as fileOrFolderPath
      throw new Error(`fileOrFolderPath (${fileOrFolderPath}) is same as backupDirPath ${this.#backupDirPath}`);
    }
    
    if (splitPath(pathToBackupDir).every(pathSegment => pathSegment == '..')) {
      // fileOrFolderPath is subfolder of this.#backupDirPath
      throw new Error(`fileOrFolderPath (${fileOrFolderPath}) is a subfolder of backupDirPath ${this.#backupDirPath}`);
    }
    
    const pathToFileOrFolder = relative(this.#backupDirPath, fileOrFolderPath);
    
    if (splitPath(pathToFileOrFolder).every(pathSegment => pathSegment == '..')) {
      // this.#backupDirPath is subfolder of fileOrFolderPath
      excludedFilesOrFolders = [
        ...excludedFilesOrFolders,
        pathToBackupDir,
      ];
    }
    
    const backupFilePath = path(this.#backupDirPath, 'backups', `${backupName}.json`);
    
    try {
      await testCreateFile(backupFilePath);
    } catch {
      throw new Error(`backup name (${JSON.stringify(backupName)}) invalid name or backup file unable to be created`);
    }
    
    this.#log(logger, `Starting backup of ${JSON.stringify(fileOrFolderPath)} with name ${JSON.stringify(backupName)}`);
    
    const dirContents = await recursiveReaddir(fileOrFolderPath, {
      excludedFilesOrFolders,
      includeDirs: true,
      entries: true,
      symlinkMode,
    });
    
    let newEntries = [];
    
    for (const { filePath, stats } of dirContents) {
      if (ignoreErrors) {
        try {
          newEntries.push(
            await this.#addAndGetBackupEntry(fileOrFolderPath, filePath, stats, inMemoryCutoffSize, logger)
          );
        } catch (err) {
          this.#log(logger, `ERROR: msg:${err.toString()} code:${err.code} stack:\n${err.stack}`);
        }
      } else {
        newEntries.push(
          await this.#addAndGetBackupEntry(fileOrFolderPath, filePath, stats, inMemoryCutoffSize, logger)
        );
      }
    }
    
    await writeFileReplaceWhenDone(
      backupFilePath,
      backupFileStringify({
        createdAt: new Date().toISOString(),
        entries: newEntries,
      })
    );
    
    await setReadOnly(backupFilePath);
  }
  
  getAllowSingleBackupDestroyStatus() {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    return this.#allowSingleBackupDestroy;
  }
  
  updateAllowSingleBackupDestroyStatus_Danger(newSingleBackupDestroy) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (typeof newSingleBackupDestroy != 'boolean') {
      throw new Error(`newSingleBackupDestroy not boolean: ${typeof newSingleBackupDestroy}`);
    }
    
    this.#allowSingleBackupDestroy = newSingleBackupDestroy;
  }
  
  async destroyBackup({
    backupName,
    pruneUnreferencedFilesAfter = true,
    logger,
  }) {
    this.#ensureBackupDirLive();
    
    if (!this.#allowSingleBackupDestroy) {
      throw new Error(
        'backup deletion attempted, but backup dir destroy flag is false\n' +
        'call "this.updateAllowSingleBackupDestroyStatus_Danger(true);" to enable backup deletion'
      );
    }
    
    if (!(await this.hasBackup(backupName))) {
      throw new Error(`backup ${JSON.stringify(backupName)} does not exist, cannot delete`);
    }
    
    this.#log(logger, `Deleting backup ${JSON.stringify(backupName)}`);
    
    const backupFilePath = join(this.#backupDirPath, 'backups', `${backupName}.json`);
    
    await unlink(backupFilePath);
    
    if (pruneUnreferencedFilesAfter) {
      await this.pruneUnreferencedFiles({ logger });
    }
    
    this.#log(logger, `Successfully deleted backup ${JSON.stringify(backupName)}`);
  }
  
  async renameBackup({
    oldBackupName,
    newBackupName,
    logger,
  }) {
    this.#ensureBackupDirLive();
    
    if (typeof oldBackupName != 'string') {
      throw new Error(`oldBackupName not string: ${typeof oldBackupName}`);
    }
    
    if (typeof newBackupName != 'string') {
      throw new Error(`newBackupName not string: ${typeof newBackupName}`);
    }
    
    if (!(await this.hasBackup(oldBackupName))) {
      throw new Error(`backup oldBackupName (${JSON.stringify(oldBackupName)}) does not exist`);
    }
    
    if (await this.hasBackup(newBackupName)) {
      throw new Error(`backup newBackupName (${JSON.stringify(newBackupName)}) already exists`);
    }
    
    this.#log(logger, `Renaming backup ${JSON.stringify(oldBackupName)} to ${JSON.stringify(newBackupName)}`);
    
    await safeRename(
      join(this.#backupDirPath, 'backups', `${oldBackupName}.json`),
      join(this.#backupDirPath, 'backups', `${newBackupName}.json`)
    );
    
    this.#log(logger, `Successfully renamed backup ${JSON.stringify(oldBackupName)} to ${JSON.stringify(newBackupName)}`);
  }
  
  async getFileOrFolderInfoFromBackup({
    backupName,
    backupFileOrFolderPath,
  }) {
    this.#ensureBackupDirLive();
    
    // TODO
  }
  
  async getSubtreeInfoFromBackup({
    backupName,
    backupFileOrFolderPath,
  }) {
    this.#ensureBackupDirLive();
    
    // TODO
  }
  
  async getFileFromBackup({
    backupName,
    backupFilePath,
  }) {
    this.#ensureBackupDirLive();
    
    // TODO
  }
  
  async getFolderFilenamesFromBackup({
    backupName,
    backupFolderPath,
  }) {
    this.#ensureBackupDirLive();
    
    // TODO
  }
  
  // If restoring a folder, output can not exist, or can be an empty folder; if restoring file, output must not exist
  async restoreFileOrFolderFromBackup({
    backupName,
    backupFileOrFolderPath,
    outputFileOrFolderPath,
    logger,
  }) {
    this.#ensureBackupDirLive();
    
    // TODO
  }
  
  async pruneUnreferencedFiles({ logger }) {
    this.#ensureBackupDirLive();
    
    // TODO
  }
  
  async [Symbol.asyncDispose]() {
    if (this.#disposed) {
      return;
    }
    
    const lockFile = this.#lockFile;
    
    this.#disposed = true;
    this.#lockFile = null;
    this.#backupDirPath = null;
    this.#clearBackupDirVars();
    this.#globalLogger = null;
    this.#allowFullBackupDirDestroy = null;
    this.#allowSingleBackupDestroy = null;
    
    // delete lock file
    await lockFile[Symbol.asyncDispose]();
    await unlink(join(this.#backupDirPath, 'edit.lock'));
  }
  
  async _getFilesHexInStore(fileHashHexPrefix = '') {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHexPrefix != 'string') {
      throw new Error(`fileHashHexPrefix not string: ${typeof fileHashHexPrefix}`);
    }
    
    if (fileHashHexPrefix.length > this.#hashHexLength) {
      throw new Error(`fileHashHexPrefix length (${fileHashHexPrefix.length}) > hash length (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]+$/.test(fileHashHexPrefix)) {
      throw new Error(`fileHashHexPrefix not hex: ${fileHashHexPrefix}`);
    }
    
    let folderToRead = join(this.#backupDirPath, 'files');
    
    if (this.#hashSlices > 0) {
      let slicesRemaining = this.#hashSlices;
      
      while (fileHashHexPrefix.length > this.#hashSliceLength && slicesRemaining > 0) {
        folderToRead = join(folderToRead, fileHashHexPrefix.slice(0, this.#hashSliceLength));
        
        slicesRemaining--;
        fileHashHexPrefix = fileHashHexPrefix.slice(this.#hashSliceLength);
      }
    }
    
    try {
      return (await readdir(folderToRead))
        .filter(file => file.startsWith(fileHashHexPrefix));
    } catch {
      return [];
    }
  }
  
  async _fileHexIsInStore(fileHashHex) {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHex != 'string') {
      throw new Error(`fileHashHex not string: ${typeof fileHashHex}`);
    }
    
    if (fileHashHex.length != this.#hashHexLength) {
      throw new Error(`fileHashHex length (${fileHashHex.length}) not expected (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]+$/.test(fileHashHex)) {
      throw new Error(`fileHashHex not hex: ${fileHashHex}`);
    }
    
    return await this.#fileIsInStore(fileHashHex);
  }
  
  async _getFileMeta(fileHashHex) {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHex != 'string') {
      throw new Error(`fileHashHex not string: ${typeof fileHashHex}`);
    }
    
    if (fileHashHex.length != this.#hashHexLength) {
      throw new Error(`fileHashHex length (${fileHashHex.length}) not expected (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]+$/.test(fileHashHex)) {
      throw new Error(`fileHashHex not hex: ${fileHashHex}`);
    }
    
    if (!(await this.#fileIsInStore(fileHashHex))) {
      throw new Error(`file hash not found in store: ${fileHashHex}`);
    }
    
    return this.#getMetaOfFile(fileHashHex);
  }
  
  async _getFileBytes(fileHashHex) {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHex != 'string') {
      throw new Error(`fileHashHex not string: ${typeof fileHashHex}`);
    }
    
    if (fileHashHex.length != this.#hashHexLength) {
      throw new Error(`fileHashHex length (${fileHashHex.length}) not expected (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]+$/.test(fileHashHex)) {
      throw new Error(`fileHashHex not hex: ${fileHashHex}`);
    }
    
    if (!(await this.#fileIsInStore(fileHashHex))) {
      throw new Error(`file hash not found in store: ${fileHashHex}`);
    }
    
    return this.#getFileBytesFromStore(fileHashHex);
  }
  
  async _getFileStream(fileHashHex) {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHex != 'string') {
      throw new Error(`fileHashHex not string: ${typeof fileHashHex}`);
    }
    
    if (fileHashHex.length != this.#hashHexLength) {
      throw new Error(`fileHashHex length (${fileHashHex.length}) not expected (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]+$/.test(fileHashHex)) {
      throw new Error(`fileHashHex not hex: ${fileHashHex}`);
    }
    
    if (!(await this.#fileIsInStore(fileHashHex))) {
      throw new Error(`file hash not found in store: ${fileHashHex}`);
    }
    
    return this.#getFileStreamFromStore(fileHashHex);
  }
  
  // public helper funcs
  
  async getAllFilesOrFoldersInfoFromBackup(backupName) {
    return await this.getSubtreeInfoFromBackup({
      backupName,
      backupFileOrFolderPath: '.',
    });
  }
  
  // Output can not exist, or can be an empty folder; if restoring file, output must not exist
  async restoreFromBackup({
    backupName,
    outputPath,
    logger,
  }) {
    await this.restoreFileOrFolderFromBackup({
      backupName,
      backupFileOrFolderPath: '.',
      outputPath,
      logger,
    });
  }
  
  // Layout of object returned by this function may change over time, beware
  async fullBackupInfoDump() {
    // TODO
    // TODO: only call public functions in backupmanager to create the info dump
  }
}

export async function createBackupManager(backupDirPath) {
  // the 'await' call does have an effect, as constructor returns a promise that gets
  // fulfilled with the newly constructed BackupManager object
  return await new BackupManager(backupDirPath);
}
