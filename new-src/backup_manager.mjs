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
  errorIfPathNotDir,
  fileOrFolderExists,
  readLargeFile,
  recursiveReaddir,
  recursiveReaddirSimpleFileNamesOnly,
  safeRename,
  setReadOnly,
  splitPath,
  SymlinkModes,
  testCreateFile,
  writeFileReplaceWhenDone,
} from './lib/fs.mjs';
import { callBothLoggers } from './lib/logger.mjs';
import { streamsEqual } from './lib/stream_equality.mjs';
import { unixNSIntToUnixSecString } from './lib/time.mjs';
import {
  BACKUP_PATH_SEP,
  backupFileStringify,
  createCompressor,
  createDecompressor,
  createHasher,
  compressBytes,
  COMPRESSION_ALGOS,
  CURRENT_BACKUP_VERSION,
  decompressBytes,
  fullInfoFileStringify,
  getBackupDirInfo,
  getHasherOutput,
  HASH_SIZES,
  hashBytes,
  HEX_CHAR_LENGTH_BITS,
  INSECURE_HASHES,
  metaFileStringify,
  splitCompressObjectAlgoAndParams,
} from './lib.mjs';
import { upgradeDirToCurrent } from './upgrader.mjs';

const DEFAULT_IN_MEMORY_SIZE = 4 * 2 ** 20;

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
  #loadedBackupsCache = null;
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
    this.#loadedBackupsCache = new Map();
  }
  
  #clearBackupDirVars() {
    this.#hashAlgo = null;
    this.#hashSlices = null;
    this.#hashSliceLength = null;
    this.#compressionAlgo = null;
    this.#compressionParams = null;
    this.#hashHexLength = null;
    this.#loadedBackupsCache = null;
  }
  
  async #initManager({
    backupDirPath,
    autoUpgradeDir,
    globalLogger,
    logger = null,
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
            splitCompressObjectAlgoAndParams(info.compression) :
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
    
    return await fileOrFolderExists(filePath);
  }
  
  async #getAndAddFileToMeta({
    fileHashHex,
    compressionUsed,
    compressedSize,
  }) {
    const newFilePath = this.#getPathOfFile(fileHashHex);
    const metaFilePath = this.#getMetaPathOfFile(fileHashHex);
    
    let metaJson;
    
    if (await fileOrFolderExists(metaFilePath)) {
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
    
    return {
      newFilePath,
      metaFilePath,
      metaJson,
    };
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
      
      const {
        newFilePath,
        metaFilePath,
        metaJson,
      } = await this.#getAndAddFileToMeta({
        fileHashHex,
        compressionUsed,
        compressedSize: compressedBytes.length,
      });
      
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
            
            const {
              newFilePath,
              metaFilePath,
              metaJson,
            } = await this.#getAndAddFileToMeta({
              fileHashHex,
              compressionUsed,
              compressedSize,
            });
            
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
      const { compressionAlgo, compressionParams } = splitCompressObjectAlgoAndParams(fileMeta.compression);
      
      return await decompressBytes(
        rawFileBytes,
        compressionAlgo,
        compressionParams
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
      const { compressionAlgo, compressionParams } = splitCompressObjectAlgoAndParams(fileMeta.compression);
      
      const decompressor = createDecompressor(
        fileMeta.compression.algorithm,
        compressionAlgo,
        compressionParams
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
    const backupInternalNativePath = relative(fileOrFolderPath, filePath);
    const relativeFilePath =
      backupInternalNativePath == '' ?
        '.' :
        splitPath().join(BACKUP_PATH_SEP);
    
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
  
  static #processBackupData({ createdAt, entries }) {
    return {
      createdAt,
      entries: new Map(
        entries
          .map(entry => [entry.path, entry])
      ),
    };
  }
  
  #setCachedBackupData(backupName, backupData) {
    this.#loadedBackupsCache.set(backupName, BackupManager.#processBackupData(backupData));
  }
  
  #deleteCachedBackupData(backupName) {
    this.#loadedBackupsCache.delete(backupName);
  }
  
  async #getCachedBackupData(backupName) {
    let backupData;
    
    if (this.#loadedBackupsCache.has(backupName)) {
      backupData = this.#loadedBackupsCache.get(backupName);
    } else {
      const backupFilePath = join(this.#backupDirPath, 'backups', `${backupName}.json`);
      backupData = BackupManager.#processBackupData(
        JSON.parse((await readLargeFile(backupFilePath)).toString())
      );
      this.#loadedBackupsCache.set(backupName, backupData);
    }
    
    return backupData;
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
    logger = null,
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
    
    return await fileOrFolderExists(backupFilePath);
  }
  
  async createBackup({
    backupName,
    fileOrFolderPath,
    excludedFilesOrFolders = [],
    symlinkMode = SymlinkModes.PRESERVE,
    ignoreErrors = false,
    inMemoryCutoffSize = DEFAULT_IN_MEMORY_SIZE,
    logger = null,
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
    
    const finishedBackupData = {
      createdAt: new Date().toISOString(),
      entries: newEntries,
    };
    
    await writeFileReplaceWhenDone(
      backupFilePath,
      backupFileStringify(finishedBackupData)
    );
    
    await setReadOnly(backupFilePath);
    
    this.#setCachedBackupData(backupName, finishedBackupData);
    
    this.#log(logger, `Successfully created backup of ${JSON.stringify(fileOrFolderPath)} with name ${JSON.stringify(backupName)}`);
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
    logger = null,
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
    
    this.#deleteCachedBackupData(backupName);
    
    this.#log(logger, `Successfully deleted backup ${JSON.stringify(backupName)}`);
  }
  
  async renameBackup({
    oldBackupName,
    newBackupName,
    logger = null,
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
  
  async getBackupCreationDate() {
    this.#ensureBackupDirLive();
    
    if (!(await this.hasBackup(backupName))) {
      throw new Error(`backupName not a backup: ${backupName}`);
    }
    
    return new Date((await this.#getCachedBackupData(backupName)).createdAt);
  }
  
  async backupSubtreeExists({
    backupName,
    backupFileOrFolderPath,
  }) {
    if (typeof backupName != 'string') {
      throw new Error(`backupName not string: ${typeof backupName}`);
    }
    
    if (typeof backupFileOrFolderPath != 'string') {
      throw new Error(`backupFileOrFolderPath not string: ${typeof backupFileOrFolderPath}`);
    }
    
    this.#ensureBackupDirLive();
    
    if (!(await this.hasBackup(backupName))) {
      throw new Error(`backupName not a backup: ${backupName}`);
    }
    
    let resultEntries = (await this.#getCachedBackupData(backupName)).entries;
    
    return resultEntries
      .some(
        ({ path }) =>
          path == backupFileOrFolderPath
      );
  }
  
  async getFileOrFolderInfoFromBackup({
    backupName,
    backupFileOrFolderPath,
  }) {
    if (typeof backupName != 'string') {
      throw new Error(`backupName not string: ${typeof backupName}`);
    }
    
    if (typeof backupFileOrFolderPath != 'string') {
      throw new Error(`backupFileOrFolderPath not string: ${typeof backupFileOrFolderPath}`);
    }
    
    this.#ensureBackupDirLive();
    
    if (!(await this.hasBackup(backupName))) {
      throw new Error(`backupName does not exist: ${backupName}`);
    }
    
    const entries = (await this.#getCachedBackupData(backupName)).entries;
    
    if (!entries.has(backupFileOrFolderPath)) {
      throw new Error(`entry not found in backup ${JSON.stringify(backupName)}, entry ${JSON.stringify(backupFileOrFolderPath)}`);
    }
    
    return Object.fromEntries(Object.entries(entries.get(backupFileOrFolderPath)));
  }
  
  async getSubtreeInfoFromBackup({
    backupName,
    backupFileOrFolderPath = '.',
  }) {
    if (typeof backupName != 'string') {
      throw new Error(`backupName not string: ${typeof backupName}`);
    }
    
    if (typeof backupFileOrFolderPath != 'string') {
      throw new Error(`backupFileOrFolderPath not string: ${typeof backupFileOrFolderPath}`);
    }
    
    this.#ensureBackupDirLive();
    
    if (!(await this.hasBackup(backupName))) {
      throw new Error(`backupName not a backup: ${backupName}`);
    }
    
    const entries = (await this.#getCachedBackupData(backupName)).entries;
    
    let resultEntries;
    
    if (backupFileOrFolderPath != '.') {
      resultEntries = [];
      
      for (const [ path, entry ] of entries) {
        if (
          path.startsWith(backupFileOrFolderPath + '/') ||
          path == backupFileOrFolderPath
        ) {
          resultEntries.push(Object.fromEntries(Object.entries(entry)));
        }
      }
    } else {
      resultEntries =
        Array.from(entries.values())
          .map(
            entry =>
              Object.fromEntries(Object.entries(entry))
          );
    }
    
    if (resultEntries.length == 0) {
      throw new Error(`no subtree found in backup ${JSON.stringify(backupName)} with prefix ${JSON.stringify(backupFileOrFolderPath)}`);
    }
    
    return resultEntries;
  }
  
  async getFileBytesFromBackup({
    backupName,
    backupFilePath,
  }) {
    this.#ensureBackupDirLive();
    
    const entry = await this.getFileOrFolderInfoFromBackup({
      backupName,
      backupFileOrFolderPath: backupFilePath,
    });
    
    if (entry.type != 'file') {
      throw new Error(`entry is type ${entry.type}, not file`);
    }
    
    return await this._getFileBytes(entry.hash);
  }
  
  async getFileStreamFromBackup({
    backupName,
    backupFilePath,
  }) {
    this.#ensureBackupDirLive();
    
    const entry = await this.getFileOrFolderInfoFromBackup({
      backupName,
      backupFileOrFolderPath: backupFilePath,
    });
    
    if (entry.type != 'file') {
      throw new Error(`entry is type ${entry.type}, not file`);
    }
    
    return await this._getFileStream(entry.hash);
  }
  
  async getFolderFilenamesFromBackup({
    backupName,
    backupFolderPath,
    withEntries = false,
  }) {
    this.#ensureBackupDirLive();
    
    const subtreeInfo = await this.getSubtreeInfoFromBackup({
      backupName,
      backupFileOrFolderPath: backupFolderPath,
    });
    
    if (subtreeInfo[0].type != 'directory') {
      throw new Error(`entry is type ${subtreeInfo[0].type}, not directory`);
    }
    
    let filenames = withEntries ? new Map() : new Set();
    
    for (const entry of subtreeInfo) {
      let slicedPath;
      
      if (backupFolderPath == '.') {
        slicedPath = path;
      } else {
        if (path.length <= backupFolderPath.length) {
          continue;
        }
        
        slicedPath = path.slice(backupFolderPath.length + 1);
      }
      
      const folderName = slicedPath.split('/')[0];
      
      if (!filenames.has(folderName)) {
        if (withEntries) {
          filenames.set(folderName, entry);
        } else {
          filenames.add(folderName);
        }
      }
    }
    
    return Array.from(filenames);
  }
  
  // If restoring a folder, output can not exist, or can be an empty folder; if restoring file, output must not exist
  async restoreFileOrFolderFromBackup({
    backupName,
    backupFileOrFolderPath = '.',
    outputFileOrFolderPath,
    excludedFilesOrFolders = [],
    symlinkMode = SymlinkModes.PRESERVE,
    inMemoryCutoffSize = DEFAULT_IN_MEMORY_SIZE,
    setFileTimes = true,
    logger = null,
  }) {
    this.#ensureBackupDirLive();
    
    // TODO
  }
  
  async pruneUnreferencedFiles({ logger = null }) {
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
    
    let slicesRemaining;
    
    if (this.#hashSlices > 0) {
      slicesRemaining = this.#hashSlices;
      
      while (fileHashHexPrefix.length > this.#hashSliceLength && slicesRemaining > 0) {
        folderToRead = join(folderToRead, fileHashHexPrefix.slice(0, this.#hashSliceLength));
        
        slicesRemaining--;
        fileHashHexPrefix = fileHashHexPrefix.slice(this.#hashSliceLength);
      }
    } else {
      slicesRemaining = 0;
    }
    
    if (await fileOrFolderExists(folderToRead)) {
      return (await recursiveReaddirSimpleFileNamesOnly(folderToRead, slicesRemaining + 1))
        .filter(fileHashHex => fileHashHex.startsWith(fileHashHexPrefix));
    } else {
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
  
  _clearCaches() {
    this.#ensureBackupDirLive();
    
    this.#loadedBackupsCache.clear();
  }
  
  // public helper funcs
  
  async getAllFilesOrFoldersInfoFromBackup(backupName) {
    return await this.getSubtreeInfoFromBackup({
      backupName,
    });
  }
  
  // Output can not exist, or can be an empty folder; if restoring file, output must not exist
  async restoreFromBackup({
    backupName,
    outputPath,
    logger = null,
  }) {
    await this.restoreFileOrFolderFromBackup({
      backupName,
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
