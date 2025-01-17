import {
  constants,
  createReadStream,
  createWriteStream,
} from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import { pipeline } from 'node:stream/promises';

import { deepObjectClone } from '../lib/deep_clone.mjs';
import {
  errorIfPathNotDir,
  fileOrFolderExists,
  getRelativeStatus,
  humanReadableSizeString,
  readLargeFile,
  recursiveReaddir,
  recursiveReaddirSimpleFileNamesOnly,
  RelativeStatus,
  safeRename,
  setFileTimes,
  setReadOnly,
  SymlinkModes,
  testCreateFile,
  writeFileReplaceWhenDone,
} from '../lib/fs.mjs';
import { callBothLoggers } from '../lib/logger.mjs';
import { unixSecStringToUnixNSInt } from '../lib/time.mjs';
import { streamsEqual } from '../lib/stream_equality.mjs';
import {
  awaitFileDeletion,
  backupFileStringify,
  createCompressor,
  createDecompressor,
  compressBytes,
  COMPRESSION_ALGOS,
  CURRENT_BACKUP_VERSION,
  decompressBytes,
  deleteBackupDirInternal,
  fullInfoFileStringify,
  getBackupDirInfo,
  getAndAddBackupEntry,
  HASH_SIZES,
  hashBytes,
  hashStream,
  HB_BACKUP_META_DIRECTORY,
  HB_BACKUP_META_FILE_EXTENSION,
  HB_EDIT_LOCK_FILE,
  HB_FILE_DIRECTORY,
  HB_FILE_META_DIRECTORY,
  HB_FILE_META_FILE_EXTENSION,
  HB_FILE_META_SINGULAR_META_FILE_NAME,
  HB_FULL_INFO_FILE_NAME,
  HEX_CHAR_LENGTH_BITS,
  INSECURE_HASHES,
  metaFileStringify,
  permissiveGetFileType,
  splitCompressObjectAlgoAndParams,
} from './lib.mjs';
import { upgradeDirToCurrent } from './upgrader.mjs';

export const DEFAULT_IN_MEMORY_CUTOFF_SIZE = 4 * 2 ** 20;
const FILE_TIMES_SET_CHUNK_SIZE = 50;

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
  #cacheEnabled;
  #loadedBackupsCache = null;
  #loadedFileMetasCache = null;
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
    this.#loadedFileMetasCache = new Map();
  }
  
  #clearBackupDirVars() {
    this.#hashAlgo = null;
    this.#hashSlices = null;
    this.#hashSliceLength = null;
    this.#compressionAlgo = null;
    this.#compressionParams = null;
    this.#hashHexLength = null;
    this.#loadedBackupsCache = null;
    this.#loadedFileMetasCache = null;
  }
  
  async #hashBytes(bytes) {
    return await hashBytes(bytes, this.#hashAlgo);
  }
  
  async #hashStream(stream) {
    return await hashStream(stream, this.#hashAlgo);
  }
  
  static #lockFilePath(backupDirPath) {
    return join(backupDirPath, HB_EDIT_LOCK_FILE);
  }
  
  static async #openLockFile(backupDirPath) {
    return await open(
      BackupManager.#lockFilePath(backupDirPath),
      // https://man7.org/linux/man-pages/man2/open.2.html
      constants.O_CREAT | constants.O_EXCL | constants.O_RDONLY,
      0o444,
    );
  }
  
  async #initManager({
    backupDirPath,
    awaitLockFileDeletionTimeout = 0,
    autoUpgradeDir = false,
    cacheEnabled = true,
    logger = null,
    globalLogger = null,
  }) {
    if (typeof backupDirPath != 'string') {
      throw new Error(`backupDirPath not string: ${typeof backupDirPath}`);
    }
    
    if (awaitLockFileDeletionTimeout != Infinity && !Number.isSafeInteger(awaitLockFileDeletionTimeout) || awaitLockFileDeletionTimeout < 0) {
      throw new Error(`awaitLockFileDeletionTimeout invalid: ${awaitLockFileDeletionTimeout}`);
    }
    
    if (typeof autoUpgradeDir != 'boolean') {
      throw new Error(`autoUpgradeDir must be boolean, but was: ${typeof autoUpgradeDir}`);
    }
    
    if (typeof cacheEnabled != 'boolean') {
      throw new Error(`cacheEnabled must be boolean, but was: ${typeof cacheEnabled}`);
    }
    
    if (typeof logger != 'function' && logger != null) {
      throw new Error(`logger must be a function or null, but was: ${typeof logger}`);
    }
    
    if (typeof globalLogger != 'function' && globalLogger != null) {
      throw new Error(`globalLogger must be a function or null, but was: ${typeof globalLogger}`);
    }
    
    this.#cacheEnabled = cacheEnabled;
    
    this.#globalLogger = globalLogger ?? null;
    
    await errorIfPathNotDir(backupDirPath);
    
    // create lock file
    if (awaitLockFileDeletionTimeout == 0) {
      this.#lockFile = await BackupManager.#openLockFile(backupDirPath);
    } else {
      let success = false;
      let timeStarted = null;
      
      while (!success) {
        try {
          this.#lockFile = await BackupManager.#openLockFile(backupDirPath);
          success = true;
        } catch (err) {
          if (err.code != 'EEXIST') {
            throw err;
          } else {
            if (timeStarted == null) {
              timeStarted = Date.now();
            }
            
            if (awaitLockFileDeletionTimeout != Infinity && Date.now() - timeStarted > awaitLockFileDeletionTimeout) {
              throw new Error(`timeout (${awaitLockFileDeletionTimeout}) exceeded waiting for lockfile to be deleted`);
            }
            
            const lockFilePath = BackupManager.#lockFilePath(backupDirPath);
            const lockFileType = await permissiveGetFileType(lockFilePath);
            
            if (lockFileType == 'file') {
              // await file going away
              await awaitFileDeletion(
                lockFilePath,
                awaitLockFileDeletionTimeout == Infinity ?
                  null :
                  awaitLockFileDeletionTimeout - (Date.now() - timeStarted)
              );
            } else if (lockFileType == null) {
              // file doesnt exist, try again in while loop
            } else {
              // lock file forbidden type, error
              throw new Error(`lockFile forbidden type: ${lockFileType}`);
            }
          }
        }
      }
    }
    
    try {
      const { bytesRead } = await this.#lockFile.read({
        buffer: Buffer.alloc(1),
        position: 0,
      });
      
      if (bytesRead > 0) {
        throw new Error(`${HB_EDIT_LOCK_FILE} lockfile has contents in it, cannot acquire lock`);
      }
      
      this.#backupDirPath = backupDirPath;
      
      const currentDirContents =
        (await readdir(backupDirPath))
          .filter(x => x != HB_EDIT_LOCK_FILE);
      
      if (currentDirContents.length != 0) {
        // dir contains hash backup contents
        
        let info = await getBackupDirInfo(backupDirPath);
        
        if (info.version > CURRENT_BACKUP_VERSION) {
          throw new Error(`backup dir version is for more recent version of program: ${info.version} > ${CURRENT_BACKUP_VERSION}`);
        } else if (info.version < CURRENT_BACKUP_VERSION) {
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
        } else if (info.version != CURRENT_BACKUP_VERSION) {
          throw new Error(`backup dir version is invalid: ${info.version}`);
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
    } catch (err) {
      await this.#lockFile[Symbol.asyncDispose]();
      
      throw err;
    }
    
    return this;
  }
  
  #getPathOfFile(fileHashHex) {
    let hashSliceParts = [];
    
    for (let i = 0; i < this.#hashSlices; i++) {
      hashSliceParts.push(fileHashHex.slice(this.#hashSliceLength * i, this.#hashSliceLength * (i + 1)));
    }
    
    return join(this.#backupDirPath, HB_FILE_DIRECTORY, ...hashSliceParts, fileHashHex);
  }
  
  #getMetaPathOfFile(fileHashHex) {
    if (this.#hashSlices == 0) {
      return join(this.#backupDirPath, HB_FILE_META_DIRECTORY, HB_FILE_META_SINGULAR_META_FILE_NAME);
    } else {
      let hashSliceParts = [];
      
      for (let i = 0; i < this.#hashSlices; i++) {
        hashSliceParts.push(fileHashHex.slice(this.#hashSliceLength * i, this.#hashSliceLength * (i + 1)));
      }
      
      return join(
        this.#backupDirPath,
        HB_FILE_META_DIRECTORY,
        ...hashSliceParts.slice(0, -1),
        `${hashSliceParts.at(-1)}${HB_FILE_META_FILE_EXTENSION}`
      );
    }
  }
  
  async #fileIsInStore(fileHashHex) {
    const filePath = this.#getPathOfFile(fileHashHex);
    
    return await fileOrFolderExists(filePath);
  }
  
  async #getAndAddFileToMeta({
    fileHashHex,
    size,
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
    
    const metaEntry = {
      size,
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
    
    metaJson[fileHashHex] = metaEntry;
    
    this.#addMetaEntryToCache(fileHashHex, metaEntry);
    
    return {
      newFilePath,
      metaFilePath,
      metaJson,
    };
  }
  
  async #addFileBytesToStore({
    fileBytes,
    filePath,
    checkForDuplicateHashes,
    compressionMinimumSizeThreshold,
    compressionMaximumSizeThreshold,
    logger,
  }) {
    const fileHashHex = (await this.#hashBytes(fileBytes)).toString('hex');
    
    this.#log(logger, `Hash: ${fileHashHex}`);
    
    if (await this.#fileIsInStore(fileHashHex)) {
      if (checkForDuplicateHashes) {
        const storeFileBytes = await this.#getFileBytesFromStore(fileHashHex);
        
        if (!fileBytes.equals(storeFileBytes)) {
          throw new Error(`Hash Collision Found: ${JSON.stringify(this.#getPathOfFile(fileHashHex))} and fileBytes (path ${JSON.stringify(filePath)}) have same ${this.#hashAlgo} hash: ${fileHashHex}`);
        }
      }
      
      this.#log(logger, 'File already in backup dir');
    } else {
      this.#log(logger, 'File not in backup dir, adding');
      
      let compressionUsed = false;
      let compressedBytes;
      
      if (this.#compressionAlgo != null && fileBytes.length >= compressionMinimumSizeThreshold && fileBytes.length <= compressionMaximumSizeThreshold) {
        compressedBytes = await compressBytes(fileBytes, this.#compressionAlgo, this.#compressionParams);
        
        if (compressedBytes.length < fileBytes.length) {
          this.#log(logger, `Compressed with ${this.#compressionAlgo} (${JSON.stringify(this.#compressionParams)}) from ${fileBytes.length} bytes to ${compressedBytes.length} bytes`);
          compressionUsed = true;
        } else {
          this.#log(logger, `Not compressed with ${this.#compressionAlgo} (${JSON.stringify(this.#compressionParams)}) as file size increases from ${fileBytes.length} bytes to ${compressedBytes.length} bytes`);
        }
      } else {
        this.#log(logger, `File size: ${fileBytes.length} bytes`);
      }
      
      const {
        newFilePath,
        metaFilePath,
        metaJson,
      } = await this.#getAndAddFileToMeta({
        fileHashHex,
        size: fileBytes.length,
        compressionUsed,
        compressedSize: compressedBytes.length,
      });
      
      await mkdir(dirname(newFilePath), { recursive: true });
      await writeFileReplaceWhenDone(newFilePath, compressionUsed ? compressedBytes : fileBytes, { readonly: true });
      await mkdir(dirname(metaFilePath), { recursive: true });
      await writeFileReplaceWhenDone(metaFilePath, metaFileStringify(metaJson));
    }
    
    return fileHashHex;
  }
  
  static #reusablyGetReadStream(fileHandle) {
    return fileHandle.createReadStream({
      autoClose: false,
      start: 0,
    });
  }
  
  async #addFilePathStreamToStore({
    filePath,
    checkForDuplicateHashes,
    compressionMinimumSizeThreshold,
    compressionMaximumSizeThreshold,
    logger,
  }) {
    const fileHandle = await open(filePath);
    
    try {
      const fileHashHex = (await this.#hashStream(BackupManager.#reusablyGetReadStream(fileHandle))).toString('hex');
      
      this.#log(logger, `Hash: ${fileHashHex}`);
      
      if (await this.#fileIsInStore(fileHashHex)) {
        if (checkForDuplicateHashes) {
          const storeFileStream = await this.#getFileStreamFromStore(fileHashHex);
          
          if (!(await streamsEqual([BackupManager.#reusablyGetReadStream(fileHandle), storeFileStream]))) {
            throw new Error(`Hash Collision Found: ${JSON.stringify(this.#getPathOfFile(fileHashHex))} and ${JSON.stringify(filePath)} have same ${this.#hashAlgo} hash: ${fileHashHex}`);
          }
        }
      
        this.#log(logger, 'File already in backup dir');
      } else {
        this.#log(logger, 'File not in backup dir, adding');
        
        let compressionUsed = false;
        
        const { size: fileSize } = await fileHandle.stat();
        
        if (this.#compressionAlgo != null && fileSize >= compressionMinimumSizeThreshold && fileSize <= compressionMaximumSizeThreshold) {
          const tmpDirPath = join(this.#backupDirPath, 'temp');
          await mkdir(tmpDirPath, { recursive: true });
          
          try {
            const compressedFilePath = join(tmpDirPath, fileHashHex);
            const fileStream = BackupManager.#reusablyGetReadStream(fileHandle);
            const compressor = createCompressor(this.#compressionAlgo, this.#compressionParams);
            const compressedFile = createWriteStream(compressedFilePath);
            
            await pipeline(
              fileStream,
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
              size: fileSize,
              compressionUsed,
              compressedSize,
            });
            
            await mkdir(dirname(newFilePath), { recursive: true });
            if (compressionUsed) {
              await setReadOnly(compressedFilePath);
              await rename(compressedFilePath, newFilePath);
            } else {
              await copyFile(filePath, newFilePath);
              await setReadOnly(newFilePath);
            }
            await writeFileReplaceWhenDone(metaFilePath, metaFileStringify(metaJson));
          } finally {
            if ((await readdir(tmpDirPath)).length == 0) {
              await rmdir(tmpDirPath);
            }
          }
        } else {
          this.#log(logger, `File size: ${fileSize} bytes`);
          
          const {
            newFilePath,
            metaFilePath,
            metaJson,
          } = await this.#getAndAddFileToMeta({
            fileHashHex,
            size: fileSize,
            compressionUsed: false,
            compressedSize: null,
          });
            
          await mkdir(dirname(newFilePath), { recursive: true });
          await copyFile(filePath, newFilePath);
          await writeFileReplaceWhenDone(metaFilePath, metaFileStringify(metaJson));
          
          await setReadOnly(newFilePath);
        }
      }
      
      return fileHashHex;
    } finally {
      await fileHandle[Symbol.asyncDispose]();
    }
  }
  
  static #processMetaEntry({
    size,
    compressedSize,
    compression = null,
  }) {
    return {
      size,
      compressedSize: compressedSize != null ? compressedSize : size,
      compression,
    };
  }
  
  #addMetaEntryToCache(fileHashHex, metaEntry) {
    if (this.#cacheEnabled && !this.#loadedFileMetasCache.has(fileHashHex)) {
      this.#loadedFileMetasCache.set(fileHashHex, BackupManager.#processMetaEntry(metaEntry));
    }
  }
  
  async #getFileMeta(fileHashHex) {
    if (this.#cacheEnabled && this.#loadedFileMetasCache.has(fileHashHex)) {
      return this.#loadedFileMetasCache.get(fileHashHex);
    } else {
      const metaFilePath = this.#getMetaPathOfFile(fileHashHex);
      
      const metaJson = JSON.parse((await readLargeFile(metaFilePath)).toString());
      
      if (!(fileHashHex in metaJson)) {
        throw new Error(`fileHash (${fileHashHex}) not found in meta files`);
      }
      
      if (this.#cacheEnabled) {
        for (const hash in metaJson) {
          if (!this.#loadedFileMetasCache.has(hash)) {
            this.#loadedFileMetasCache.set(hash, BackupManager.#processMetaEntry(metaJson[hash]));
          }
        }
        
        return this.#loadedFileMetasCache.get(fileHashHex);
      } else {
        return BackupManager.#processMetaEntry(metaJson[fileHashHex]);
      }
    }
  }
  
  async #getFileBytesFromStore(fileHashHex, verifyFileHashOnRetrieval) {
    const filePath = this.#getPathOfFile(fileHashHex);
    const fileMeta = await this.#getFileMeta(fileHashHex);
    
    const rawFileBytes = await readLargeFile(filePath);
    
    let fileBytes;
    
    if (fileMeta.compression != null) {
      const { compressionAlgo, compressionParams } = splitCompressObjectAlgoAndParams(fileMeta.compression);
      
      fileBytes = await decompressBytes(
        rawFileBytes,
        compressionAlgo,
        compressionParams
      );
    } else {
      fileBytes = rawFileBytes;
    }
    
    if (verifyFileHashOnRetrieval) {
      const storeFileHashHex = (await this.#hashBytes(fileBytes)).toString('hex');
      
      if (storeFileHashHex != fileHashHex) {
        throw new Error(`file in store has hash ${storeFileHashHex} != expected hash ${fileHashHex}`);
      }
    }
    
    return fileBytes;
  }
  
  async #getFileStreamFromStore(fileHashHex, verifyFileHashOnRetrieval) {
    const filePath = this.#getPathOfFile(fileHashHex);
    const fileMeta = await this.#getFileMeta(fileHashHex);
    
    const rawFileStream = createReadStream(filePath);
    
    let fileStream;
    
    if (fileMeta.compression != null) {
      const { compressionAlgo, compressionParams } = splitCompressObjectAlgoAndParams(fileMeta.compression);
      
      const decompressor = createDecompressor(
        fileMeta.compression.algorithm,
        compressionAlgo,
        compressionParams
      );
      
      rawFileStream.pipe(decompressor);
      
      fileStream = decompressor;
    } else {
      fileStream = rawFileStream;
    }
    
    if (verifyFileHashOnRetrieval) {
      const storeFileHashHex = (await this.#hashStream(fileStream)).toString('hex');
      
      if (storeFileHashHex != fileHashHex) {
        throw new Error(`file in store has hash ${storeFileHashHex} != expected hash ${fileHashHex}`);
      }
      
      return await this.#getFileStreamFromStore(fileHashHex, false);
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
  
  async #addAndGetBackupEntry({
    baseFileOrFolderPath,
    subFileOrFolderPath,
    stats,
    inMemoryCutoffSize,
    compressionMinimumSizeThreshold,
    compressionMaximumSizeThreshold,
    checkForDuplicateHashes,
    logger,
  }) {
    const backupEntry = await getAndAddBackupEntry({
      baseFileOrFolderPath,
      subFileOrFolderPath,
      stats,
      addingLogger: data => this.#log(logger, data),
      addFileToStoreFunc: async () => {
        // only called if file or something else that will be attempted to be read as a file
        if (stats.size <= inMemoryCutoffSize) {
          const fileBytes = await readLargeFile(subFileOrFolderPath);
          return await this.#addFileBytesToStore({
            fileBytes,
            filePath: subFileOrFolderPath,
            checkForDuplicateHashes,
            compressionMinimumSizeThreshold,
            compressionMaximumSizeThreshold,
            logger,
          });
        } else {
          return await this.#addFilePathStreamToStore({
            filePath: subFileOrFolderPath,
            checkForDuplicateHashes,
            compressionMinimumSizeThreshold,
            compressionMaximumSizeThreshold,
            logger,
          });
        }
      },
    });
    
    return backupEntry;
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
    if (this.#cacheEnabled) {
      this.#loadedBackupsCache.set(backupName, BackupManager.#processBackupData(backupData));
    }
  }
  
  #deleteCachedBackupData(backupName) {
    if (this.#cacheEnabled) {
      this.#loadedBackupsCache.delete(backupName);
    }
  }
  
  async #getCachedBackupData(backupName) {
    let backupData;
    
    if (this.#cacheEnabled && this.#loadedBackupsCache.has(backupName)) {
      backupData = this.#loadedBackupsCache.get(backupName);
    } else {
      const backupFilePath = join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY, `${backupName}${HB_BACKUP_META_FILE_EXTENSION}`);
      
      backupData = BackupManager.#processBackupData(
        JSON.parse((await readLargeFile(backupFilePath)).toString())
      );
      
      if (this.#cacheEnabled) {
        this.#loadedBackupsCache.set(backupName, backupData);
      }
    }
    
    return backupData;
  }
  
  async #processFileOrFolderEntry(fileOrFolderEntry) {
    let result = Object.fromEntries(Object.entries(fileOrFolderEntry));
    
    result.attributes = result.attributes ?? [];
    
    if (fileOrFolderEntry.type == 'file') {
      const { size, compressedSize } = await this.#getFileMeta(fileOrFolderEntry.hash);
      
      result.size = size;
      result.compressedSize = compressedSize;
    }
    
    return result;
  }
  
  // public funcs
  
  // This function is async as it calls an async helper and returns the corresponding promise
  constructor(backupDirPath, {
    awaitLockFileDeletionTimeout = 0,
    autoUpgradeDir = false,
    cacheEnabled = true,
    logger = null,
    globalLogger = null,
  }) {
    return this.#initManager({
      backupDirPath,
      awaitLockFileDeletionTimeout,
      autoUpgradeDir,
      cacheEnabled,
      logger,
      globalLogger,
    });
  }
  
  isDisposed() {
    return this.#disposed;
  }
  
  isInitialized() {
    return this.#hashAlgo != null;
  }
  
  cacheEnabled() {
    return this.#cacheEnabled;
  }
  
  getBackupDirPath() {
    return this.#backupDirPath;
  }
  
  getHashAlgo() {
    return this.#hashAlgo;
  }
  
  getHashSlices() {
    return this.#hashSlices;
  }
  
  getHashSliceLength() {
    return this.#hashSliceLength;
  }
  
  getCompressionAlgo() {
    return this.#compressionAlgo;
  }
  
  getCompressionParams() {
    return deepObjectClone(this.#compressionParams);
  }
  
  static #DEFAULT_LEVEL_COMPRESS_ALGOS = new Set(['deflate-raw', 'deflate', 'gzip', 'brotli']);
  
  async initBackupDir({
    hashAlgo = 'sha256',
    hashSlices = 1,
    hashSliceLength = null,
    compressionAlgo = 'brotli',
    compressionParams = null,
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
      const hashLengthBits = HASH_SIZES.get(hashAlgo);
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
      } else {
        if (BackupManager.#DEFAULT_LEVEL_COMPRESS_ALGOS.has(compressionAlgo)) {
          compressionParams = { level: 6 };
        }
      }
      
      try {
        await compressBytes(Buffer.from('test'), compressionAlgo, compressionParams);
      } catch {
        throw new Error(`compressionParams invalid: ${JSON.stringify(compressionParams)}`);
      }
    } else {
      if (compressionParams != null) {
        throw new Error(`compressionAlgo null but compressionParams not null: ${JSON.stringify(compressionParams)}`);
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
    
    await mkdir(join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY));
    await mkdir(join(this.#backupDirPath, HB_FILE_DIRECTORY));
    await mkdir(join(this.#backupDirPath, HB_FILE_META_DIRECTORY));
    const infoFilePath = join(this.#backupDirPath, HB_FULL_INFO_FILE_NAME);
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
              },
            } :
            {}
        ),
      }),
      { readonly: true },
    );
    
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
    
    await deleteBackupDirInternal({
      backupDirPath: this.#backupDirPath,
      logger,
      globalLogger: this.#globalLogger,
    });
    
    this.#clearBackupDirVars();
  }
  
  async listBackups() {
    this.#ensureBackupDirLive();
    
    return (await readdir(join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY)))
      .filter(x => x.endsWith(HB_BACKUP_META_FILE_EXTENSION))
      .map(x => x.slice(0, -(HB_BACKUP_META_FILE_EXTENSION.length)));
  }
  
  async hasBackup(backupName) {
    this.#ensureBackupDirLive();
    
    if (typeof backupName != 'string') {
      throw new Error(`backupName not string: ${typeof backupName}`);
    }
    
    const backupFilePath = join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY, `${backupName}${HB_BACKUP_META_FILE_EXTENSION}`);
    
    return await fileOrFolderExists(backupFilePath);
  }
  
  async createBackup({
    backupName,
    fileOrFolderPath,
    excludedFilesOrFolders = [],
    allowBackupDirSubPathOfFileOrFolderPath = false,
    symlinkMode = SymlinkModes.PRESERVE,
    inMemoryCutoffSize = DEFAULT_IN_MEMORY_CUTOFF_SIZE,
    compressionMinimumSizeThreshold = -1,
    compressionMaximumSizeThreshold = Infinity,
    checkForDuplicateHashes = true,
    ignoreErrors = false,
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
    
    if (inMemoryCutoffSize != Infinity && (!Number.isSafeInteger(inMemoryCutoffSize) || inMemoryCutoffSize < -1)) {
      throw new Error(`inMemoryCutoffSize not string: ${typeof inMemoryCutoffSize}`);
    }
    
    if (compressionMinimumSizeThreshold != Infinity && (!Number.isSafeInteger(compressionMinimumSizeThreshold) || compressionMinimumSizeThreshold < -1)) {
      throw new Error(`compressionMinimumSizeThreshold not string: ${typeof compressionMinimumSizeThreshold}`);
    }
    
    if (compressionMaximumSizeThreshold != Infinity && (!Number.isSafeInteger(compressionMaximumSizeThreshold) || compressionMaximumSizeThreshold < -1)) {
      throw new Error(`compressionMaximumSizeThreshold not string: ${typeof compressionMaximumSizeThreshold}`);
    }
    
    if (typeof ignoreErrors != 'boolean') {
      throw new Error(`ignoreErrors not boolean: ${typeof ignoreErrors}`);
    }
    
    if (typeof logger != 'function' && logger != null) {
      throw new Error(`logger not function or null: ${typeof logger}`);
    }
    
    if (!(await fileOrFolderExists(fileOrFolderPath))) {
      throw new Error(`file or folder path ${JSON.stringify(fileOrFolderPath)} does not exist`);
    }
    
    if (await this.hasBackup(backupName)) {
      throw new Error(`backup with name ${JSON.stringify(backupName)} already exists`);
    }
    
    const {
      status: relativeStatus,
      pathFromSecondToFirst: pathToBackupDir,
    } = getRelativeStatus(this.#backupDirPath, fileOrFolderPath);
    
    switch (relativeStatus) {
      case RelativeStatus.PATHS_EQUAL:
        // this.#backupDirPath is same as fileOrFolderPath
        throw new Error(`fileOrFolderPath (${fileOrFolderPath}) is same as backupDirPath ${this.#backupDirPath}`);
      
      case RelativeStatus.SECOND_IS_SUBPATH_OF_FIRST:
        // fileOrFolderPath is subfolder of this.#backupDirPath
        throw new Error(`fileOrFolderPath (${fileOrFolderPath}) is a subfolder of backupDirPath ${this.#backupDirPath}`);
      
      case RelativeStatus.FIRST_IS_SUBPATH_OF_SECOND:
        // this.#backupDirPath is subfolder of fileOrFolderPath
        if (allowBackupDirSubPathOfFileOrFolderPath) {
          excludedFilesOrFolders = [
            ...excludedFilesOrFolders,
            pathToBackupDir,
          ];
        } else {
          throw new Error(`backupDirPath (${backupFilePath}) is a subfolder of fileOrFolderPath (${fileOrFolderPath})`);
        }
        break;
    }
    
    const backupFilePath = join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY, `${backupName}${HB_BACKUP_META_FILE_EXTENSION}`);
    
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
            await this.#addAndGetBackupEntry({
              baseFileOrFolderPath: fileOrFolderPath,
              subFileOrFolderPath: filePath,
              stats,
              inMemoryCutoffSize,
              compressionMinimumSizeThreshold,
              compressionMaximumSizeThreshold,
              checkForDuplicateHashes,
              logger,
            })
          );
        } catch (err) {
          this.#log(logger, `ERROR: msg:${err.toString()} code:${err.code} stack:\n${err.stack}`);
        }
      } else {
        newEntries.push(
          await this.#addAndGetBackupEntry({
            baseFileOrFolderPath: fileOrFolderPath,
            subFileOrFolderPath: filePath,
            stats,
            inMemoryCutoffSize,
            compressionMinimumSizeThreshold,
            compressionMaximumSizeThreshold,
            checkForDuplicateHashes,
            logger,
          })
        );
      }
    }
    
    this.#log(logger, 'Writing backup file...');
    
    const finishedBackupData = {
      createdAt: new Date().toISOString(),
      entries: newEntries,
    };
    
    await writeFileReplaceWhenDone(
      backupFilePath,
      backupFileStringify(finishedBackupData),
      { readonly: true },
    );
    
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
    
    const backupFilePath = join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY, `${backupName}${HB_BACKUP_META_FILE_EXTENSION}`);
    
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
      join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY, `${oldBackupName}${HB_BACKUP_META_FILE_EXTENSION}`),
      join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY, `${newBackupName}${HB_BACKUP_META_FILE_EXTENSION}`)
    );
    
    this.#log(logger, `Successfully renamed backup ${JSON.stringify(oldBackupName)} to ${JSON.stringify(newBackupName)}`);
  }
  
  async getBackupCreationDate(backupName) {
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
    
    const entry = entries.get(backupFileOrFolderPath);
    
    return await this.#processFileOrFolderEntry(entry);
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
      throw new Error(`backupName does not exist: ${backupName}`);
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
          resultEntries.push(entry);
        }
      }
    } else {
      resultEntries = Array.from(entries.values());
    }
    
    if (resultEntries.length == 0) {
      throw new Error(`no subtree found in backup ${JSON.stringify(backupName)} with prefix ${JSON.stringify(backupFileOrFolderPath)}`);
    }
    
    return await Promise.all(
      resultEntries
        .map(async entry => await this.#processFileOrFolderEntry(entry))
    );
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
    verifyFileHashOnRetrieval = true,
  }) {
    this.#ensureBackupDirLive();
    
    const entry = await this.getFileOrFolderInfoFromBackup({
      backupName,
      backupFileOrFolderPath: backupFilePath,
    });
    
    if (entry.type != 'file') {
      throw new Error(`entry is type ${entry.type}, not file`);
    }
    
    return await this._getFileStream(entry.hash, { verifyFileHashOnRetrieval });
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
        if (entry.path == '.') {
          continue;
        }
        
        slicedPath = entry.path;
      } else {
        if (entry.path.length <= backupFolderPath.length) {
          continue;
        }
        
        slicedPath = entry.path.slice(backupFolderPath.length + 1);
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
  
  static #SYMLINK_TYPE_CONVERSION = new Map([
    ['junction', 'junction'],
    ['directory', 'dir'],
    ['file', 'file'],
  ]);
  
  // If restoring a folder, output can not exist, or can be an empty folder; if restoring file, output must not exist
  async restoreFileOrFolderFromBackup({
    backupName,
    backupFileOrFolderPath = '.',
    outputFileOrFolderPath,
    excludedFilesOrFolders = [],
    symlinkMode = SymlinkModes.PRESERVE,
    inMemoryCutoffSize = DEFAULT_IN_MEMORY_CUTOFF_SIZE,
    setFileTimes: doSetFileTimes = true,
    createParentFolders = false,
    overwriteExistingRestoreFolderOrFile = false,
    verifyFileHashOnRetrieval = true,
    logger = null,
  }) {
    if (typeof backupName != 'string') {
      throw new Error(`backupName not string: ${typeof backupName}`);
    }
    
    if (typeof backupFileOrFolderPath != 'string') {
      throw new Error(`backupFileOrFolderPath not string: ${typeof backupFileOrFolderPath}`);
    }
    
    if (typeof outputFileOrFolderPath != 'string') {
      throw new Error(`outputFileOrFolderPath not string: ${typeof outputFileOrFolderPath}`);
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
    
    if (symlinkMode == SymlinkModes.PASSTHROUGH) {
      throw new Error('symlinkMode SymlinkModes.PASSTHROUGH not supported');
    }
    
    if (inMemoryCutoffSize != Infinity && (!Number.isSafeInteger(inMemoryCutoffSize) || inMemoryCutoffSize < -1)) {
      throw new Error(`inMemoryCutoffSize not string: ${typeof inMemoryCutoffSize}`);
    }
    
    if (typeof doSetFileTimes != 'boolean') {
      throw new Error(`setFileTimes not boolean: ${typeof doSetFileTimes}`);
    }
    
    if (typeof createParentFolders != 'boolean') {
      throw new Error(`createParentFolders not boolean: ${typeof createParentFolders}`);
    }
    
    if (typeof overwriteExistingRestoreFolderOrFile != 'boolean') {
      throw new Error(`overwriteExistingRestoreFolderOrFile not boolean: ${typeof overwriteExistingRestoreFolderOrFile}`);
    }
    
    if (typeof verifyFileHashOnRetrieval != 'boolean') {
      throw new Error(`verifyFileHashOnRetrieval not boolean: ${typeof verifyFileHashOnRetrieval}`);
    }
    
    if (typeof logger != 'function' && logger != null) {
      throw new Error(`logger not function or null: ${typeof logger}`);
    }
    
    this.#ensureBackupDirLive();
    
    const { status: relativeStatus } = getRelativeStatus(this.#backupDirPath, outputFileOrFolderPath);
    
    switch (relativeStatus) {
      case RelativeStatus.PATHS_EQUAL:
        // this.#backupDirPath is same as outputFileOrFolderPath
        throw new Error(`outputFileOrFolderPath (${outputFileOrFolderPath}) is same as backupDirPath ${this.#backupDirPath}`);
      
      case RelativeStatus.SECOND_IS_SUBPATH_OF_FIRST:
        // outputFileOrFolderPath is subfolder of this.#backupDirPath
        throw new Error(`outputFileOrFolderPath (${outputFileOrFolderPath}) is a subfolder of backupDirPath ${this.#backupDirPath}`);
      
      case RelativeStatus.FIRST_IS_SUBPATH_OF_SECOND:
        throw new Error(`backupDirPath (${backupFileOrFolderPath}) is a subfolder of outputFileOrFolderPath (${outputFileOrFolderPath})`);
    }
    
    this.#log(logger, `Starting restore of ${JSON.stringify(backupName)} into path ${JSON.stringify(outputFileOrFolderPath)}`);
    
    const backupData = (await this.getSubtreeInfoFromBackup({
      backupName,
      backupFileOrFolderPath,
    }))
      .filter(
        ({ path }) =>
          !excludedFilesOrFolders.some(
            excludePath =>
              path.startsWith(`${excludePath}/`) ||
              path == excludePath
          )
      );
    
    const parentOutputFileOrFolderPath = dirname(outputFileOrFolderPath);
    
    if (!(await fileOrFolderExists(parentOutputFileOrFolderPath))) {
      if (createParentFolders) {
        this.#log(logger, `Creating parent folder: ${JSON.stringify(parentOutputFileOrFolderPath)}`);
        
        await mkdir(parentOutputFileOrFolderPath, { recursive: true });
      } else {
        throw new Error(`parent folder does not exist: ${JSON.stringify(parentOutputFileOrFolderPath)}`);
      }
    } else {
      if (!(await lstat(parentOutputFileOrFolderPath)).isDirectory()) {
        throw new Error(`parent folder is not a folder: ${parentOutputFileOrFolderPath}`);
      }
    }
    
    if (await fileOrFolderExists(outputFileOrFolderPath)) {
      if ((await lstat(outputFileOrFolderPath)).isDirectory()) {
        if ((await readdir(outputFileOrFolderPath)).length != 0) {
          if (overwriteExistingRestoreFolderOrFile) {
            this.#log(logger, `Clearing contents of existing restore folder: ${JSON.stringify(outputFileOrFolderPath)}`);
            
            await rm(outputFileOrFolderPath, { recursive: true });
            
            this.#log(logger, `Finished clearing contents of existing restore folder: ${JSON.stringify(outputFileOrFolderPath)}`);
          } else {
            throw new Error(`output folder already contains contents: ${JSON.stringify(outputFileOrFolderPath)}`);
          }
        } else {
          await rmdir(outputFileOrFolderPath);
        }
      } else {
        if (overwriteExistingRestoreFolderOrFile) {
          this.#log(logger, `Deleting existing restore file: ${JSON.stringify(outputFileOrFolderPath)}`);
          
          await unlink(outputFileOrFolderPath);
        } else {
          throw new Error(`output file already exists: ${JSON.stringify(outputFileOrFolderPath)}`);
        }
      }
    }
    
    for (const { path, type, attributes, hash, symlinkType, symlinkPath } of backupData) {
      const outputPath = join(outputFileOrFolderPath, path);
      
      switch (type) {
        case 'file': {
          this.#log(logger, `Restoring ${JSON.stringify(outputPath)} [file (${humanReadableSizeString((await this.#getFileMeta(hash)).size)})]...`);
          
          const { size: fileSize } = await this.#getFileMeta(hash);
          
          if (fileSize <= inMemoryCutoffSize) {
            const fileBytes = await this._getFileBytes(hash, {
              verifyFileHashOnRetrieval,
            });
            
            await writeFile(outputPath, fileBytes);
          } else {
            const backupFileStream = await this._getFileStream(hash, {
              verifyFileHashOnRetrieval,
            });
            
            await pipeline(
              backupFileStream,
              createWriteStream(outputPath)
            );
          }
          break;
        }
        
        case 'directory':
          this.#log(logger, `Restoring ${JSON.stringify(outputPath)} [directory]...`);
          
          await mkdir(outputPath);
          break;
        
        case 'symbolic link': {
          if (symlinkMode != SymlinkModes.IGNORE) {
            const symlinkBuf = Buffer.from(symlinkPath, 'base64');
            
            this.#log(logger, `Restoring ${JSON.stringify(outputPath)} [symbolic link (points to: ${JSON.stringify(symlinkBuf.toString())})]...`);
            
            if (symlinkType != null) {
              const convertedType = BackupManager.#SYMLINK_TYPE_CONVERSION.get(symlinkType);
              await symlink(symlinkBuf, outputPath, convertedType);
            } else {
              await symlink(symlinkBuf, outputPath);
            }
          }
          break;
        }
      }
      
      if (attributes != null) {
        for (const attribute of attributes) {
          switch (attribute) {
            case 'readonly':
              await setReadOnly(outputPath);
              break;
            
            default:
              throw new Error(`cannot set attribute on file ${JSON.stringify(outputPath)}: attribute ${attribute} unknown`);
          }
        }
      }
    }
    
    if (doSetFileTimes) {
      for (let forwardIndex = 0; forwardIndex < backupData.length; forwardIndex += FILE_TIMES_SET_CHUNK_SIZE) {
        const reverseIndexEnd = backupData.length - forwardIndex;
        const reverseIndexStart = Math.max(reverseIndexEnd - FILE_TIMES_SET_CHUNK_SIZE, 0);
        
        const forwardIndexEnd = Math.min(forwardIndex + FILE_TIMES_SET_CHUNK_SIZE, backupData.length);
        
        this.#log(
          logger,
          'Setting timestamps of entries: ' +
            `${forwardIndex}-${forwardIndexEnd}` +
            `/${backupData.length} ` +
            `(${(forwardIndexEnd / backupData.length * 100).toFixed(3)}%)...`
        );
        
        await setFileTimes(
          backupData
            .slice(reverseIndexStart, reverseIndexEnd)
            .map(({
              path,
              atime,
              mtime,
              birthtime,
            }) => {
              const outputPath = join(outputFileOrFolderPath, path);
              
              return {
                filePath: outputPath,
                accessTimeUnixNSInt: unixSecStringToUnixNSInt(atime),
                modifyTimeUnixNSInt: unixSecStringToUnixNSInt(mtime),
                createTimeUnixNSInt: unixSecStringToUnixNSInt(birthtime),
              };
            })
            .reverse()
        );
      }
    }
    
    this.#log(logger, `Successfully restored backup ${JSON.stringify(backupName)} to ${JSON.stringify(outputFileOrFolderPath)}`);
  }
  
  async pruneUnreferencedFiles({ logger = null }) {
    if (typeof logger != 'function' && logger != null) {
      throw new Error(`logger not function or null: ${typeof logger}`);
    }
    
    this.#ensureBackupDirLive();
    
    this.#log(logger, 'Scanning for unreferenced files...');
    
    const filesInStore = await this._getFilesHexInStore();
    
    let referencedFilesInStore = new Set();
    
    for (const backupName of this.listBackups()) {
      for (const { entry } of this.#getCachedBackupData(backupName)) {
        if (entry.type == 'file') {
          referencedFilesInStore.add(entry.hash);
        }
      }
    }
    
    let unreferencedFiles = [];
    
    for (const fileHex of filesInStore) {
      if (!referencedFilesInStore.has(fileHex)) {
        unreferencedFiles.push(fileHex);
      }
    }
    
    this.#log(logger, `Pruning ${unreferencedFiles.length} unreferenced files out of ${filesInStore.length}...`);
    
    let totalPrunedUncompressedBytes = 0;
    let totalPrunedCompressedBytes = 0;
    
    for (const fileHex of unreferencedFiles) {
      this.#log(logger, `Pruning file with hash ${fileHex}...`);
      const { size, compressedSize } = await this.#getFileMeta(fileHex);
      totalPrunedUncompressedBytes += size;
      totalPrunedCompressedBytes += compressedSize;
      await this.#removeFileFromStore(fileHex, logger);
    }
    
    this.#log(logger, `Finished pruning ${unreferencedFiles.length} unreferenced files out of ${filesInStore.length}, freed ${humanReadableSizeString(totalPrunedCompressedBytes)} compressed bytes, ${humanReadableSizeString(totalPrunedUncompressedBytes)} uncompressed bytes`);
  }
  
  async [Symbol.asyncDispose]() {
    if (this.#disposed) {
      return;
    }
    
    const lockFile = this.#lockFile;
    const backupDirPath = this.#backupDirPath;
    
    this.#disposed = true;
    this.#lockFile = null;
    this.#backupDirPath = null;
    this.#clearBackupDirVars();
    this.#cacheEnabled = null;
    this.#globalLogger = null;
    this.#allowFullBackupDirDestroy = null;
    this.#allowSingleBackupDestroy = null;
    
    // delete lock file
    const { bytesRead } = await lockFile.read({
      buffer: Buffer.alloc(1),
      position: 0,
    });
    
    if (bytesRead > 0) {
      throw new Error(`${HB_EDIT_LOCK_FILE} lockfile has contents in it, cannot delete`);
    }
    
    // operating systems allow unlinking files with open read handles, so might as well unlink before closing
    await unlink(join(backupDirPath, HB_EDIT_LOCK_FILE));
    await lockFile[Symbol.asyncDispose]();
  }
  
  async _getFilesHexInStore(fileHashHexPrefix = '') {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHexPrefix != 'string') {
      throw new Error(`fileHashHexPrefix not string: ${typeof fileHashHexPrefix}`);
    }
    
    if (fileHashHexPrefix.length > this.#hashHexLength) {
      throw new Error(`fileHashHexPrefix length (${fileHashHexPrefix.length}) > hash length (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]*$/.test(fileHashHexPrefix)) {
      throw new Error(`fileHashHexPrefix not hex: ${fileHashHexPrefix}`);
    }
    
    let folderToRead = join(this.#backupDirPath, HB_FILE_DIRECTORY);
    
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
    
    if (!/^[0-9a-f]*$/.test(fileHashHex)) {
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
    
    if (!/^[0-9a-f]*$/.test(fileHashHex)) {
      throw new Error(`fileHashHex not hex: ${fileHashHex}`);
    }
    
    if (!(await this.#fileIsInStore(fileHashHex))) {
      throw new Error(`file hash not found in store: ${fileHashHex}`);
    }
    
    return deepObjectClone(await this.#getFileMeta(fileHashHex));
  }
  
  async _getFileBytes(fileHashHex, { verifyFileHashOnRetrieval = true }) {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHex != 'string') {
      throw new Error(`fileHashHex not string: ${typeof fileHashHex}`);
    }
    
    if (fileHashHex.length != this.#hashHexLength) {
      throw new Error(`fileHashHex length (${fileHashHex.length}) not expected (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]*$/.test(fileHashHex)) {
      throw new Error(`fileHashHex not hex: ${fileHashHex}`);
    }
    
    if (typeof verifyFileHashOnRetrieval != 'boolean') {
      throw new Error(`verifyFileHashOnRetrieval not boolean: ${typeof verifyFileHashOnRetrieval}`);
    }
    
    if (!(await this.#fileIsInStore(fileHashHex))) {
      throw new Error(`file hash not found in store: ${fileHashHex}`);
    }
    
    const fileBytes = this.#getFileBytesFromStore(fileHashHex, verifyFileHashOnRetrieval);
    
    return fileBytes;
  }
  
  async _getFileStream(fileHashHex, { verifyFileHashOnRetrieval = true }) {
    this.#ensureBackupDirLive();
    
    if (typeof fileHashHex != 'string') {
      throw new Error(`fileHashHex not string: ${typeof fileHashHex}`);
    }
    
    if (fileHashHex.length != this.#hashHexLength) {
      throw new Error(`fileHashHex length (${fileHashHex.length}) not expected (${this.#hashHexLength})`);
    }
    
    if (!/^[0-9a-f]*$/.test(fileHashHex)) {
      throw new Error(`fileHashHex not hex: ${fileHashHex}`);
    }
    
    if (typeof verifyFileHashOnRetrieval != 'boolean') {
      throw new Error(`verifyFileHashOnRetrieval not boolean: ${typeof verifyFileHashOnRetrieval}`);
    }
    
    if (!(await this.#fileIsInStore(fileHashHex))) {
      throw new Error(`file hash not found in store: ${fileHashHex}`);
    }
    
    return await this.#getFileStreamFromStore(fileHashHex, verifyFileHashOnRetrieval);
  }
  
  _clearCaches() {
    this.#ensureBackupDirLive();
    
    if (this.#cacheEnabled) {
      this.#loadedBackupsCache.clear();
      this.#loadedFileMetasCache.clear();
    } else {
      throw new Error('caches disabled');
    }
  }
  
  async _getBackupOnlyMetaSize(backupName) {
    if (!(await this.hasBackup(backupName))) {
      throw new Error(`backup nonexistent: ${backupName}`);
    }
    
    const backupFilePath = join(this.#backupDirPath, HB_BACKUP_META_DIRECTORY, `${backupName}${HB_BACKUP_META_FILE_EXTENSION}`);
    
    return (await lstat(backupFilePath)).size;
  }
  
  async _getTotalFilesMetaSize() {
    const metaFiles = await recursiveReaddir(join(this.#backupDirPath, HB_FILE_META_DIRECTORY), { includeDirs: false, entries: false });
    
    let totalBytes = 0;
    
    for (const metaFilePath of metaFiles) {
      totalBytes += (await lstat(metaFilePath)).size;
    }
    
    return {
      fileCount: metaFiles.length,
      sizeBytes: totalBytes,
    };
  }
  
  async _getTotalFilesSize() {
    const allFileHexes = await this._getFilesHexInStore();
    
    let totalSizeBytes = 0;
    let totalCompressedSizeBytes = 0;
    
    for (const fileHex of allFileHexes) {
      const { size, compressedSize } = await this.#getFileMeta(fileHex);
      
      totalSizeBytes += size;
      totalCompressedSizeBytes += compressedSize;
    }
    
    return {
      fileCount: allFileHexes.length,
      sizeBytes: totalSizeBytes,
      compressedSizeBytes: totalCompressedSizeBytes,
    };
  }
  
  // public helper funcs
  
  async getAllFilesOrFoldersInfoFromBackup(backupName) {
    return await this.getSubtreeInfoFromBackup({ backupName });
  }
  
  // Output can not exist, or can be an empty folder; if restoring file, output must not exist
  async restoreFromBackup({
    backupName,
    outputFileOrFolderPath,
    excludedFilesOrFolders = [],
    symlinkMode = SymlinkModes.PRESERVE,
    setFileTimes = true,
    logger = null,
  }) {
    await this.restoreFileOrFolderFromBackup({
      backupName,
      outputFileOrFolderPath,
      excludedFilesOrFolders,
      symlinkMode,
      setFileTimes,
      logger,
    });
  }
  
  /*
    Layout of object returned by this function may change over time, beware.
    Current Layout:
    {
      createdAt,
      files: integer,
      folders: integer,
      symbolicLinks: integer,
      items: integer,
      sizeBytes: integer,
      compressedSizeBytes: integer,
      backupOnlyMetaSizeBytes: integer,
      referencedFileHashes: Set<string>,
    }
  */
  async singleBackupInfoDump(backupName, { summary = true } = {}) {
    let files = 0,
      folders = 0,
      symbolicLinks = 0,
      sizeBytes = 0,
      compressedSizeBytes = 0;
    
    let referencedFileHashes = new Set();
    
    const backupInfo = await this.getAllFilesOrFoldersInfoFromBackup(backupName);
    
    for (const { type, hash } of backupInfo) {
      switch (type) {
        case 'file': {
          const { size, compressedSize } = await this._getFileMeta(hash);
          
          files++;
          
          sizeBytes += size;
          compressedSizeBytes += compressedSize;
          
          referencedFileHashes.add(hash);
          break;
        }
        
        case 'directory':
          folders++;
          break;
        
        case 'symbolic link':
          symbolicLinks++;
          break;
      }
    }
    
    return {
      createdAt: await this.getBackupCreationDate(backupName),
      files,
      folders,
      symbolicLinks,
      items: files + folders + symbolicLinks,
      sizeBytes,
      compressedSizeBytes,
      backupOnlyMetaSizeBytes: await this._getBackupOnlyMetaSize(backupName),
      referencedFileCount: referencedFileHashes.size,
      ...(
        summary ?
          {} :
          {
            referencedFileHashes,
          }
      ),
    };
  }
  
  /*
    Layout of object returned by this function may change over time, beware.
    Current Layout:
    {
      hashAlgo,
      hashSlices,
      hashSliceLength,
      compressionAlgo,
      compressionParams,
    }
  */
  backupTopologySummary() {
    return {
      hashAlgo: this.getHashAlgo(),
      hashSlices: this.getHashSlices(),
      hashSliceLength: this.getHashSliceLength(),
      compressionAlgo: this.getCompressionAlgo(),
      compressionParams: this.getCompressionParams(),
    };
  }
  
  /*
    Layout of object returned by this function may change over time, beware.
    Current Layout:
    {
      individualBackupsInfo: {
        backups: [
          [ backupName, backupData: singleBackupInfoDump ],
          ...
        ],
        naiveSum: {
          files,
          folders,
          symbolicLinks,
          items,
          sizeBytes,
          compressedSizeBytes,
        },
      },
      fullBackupInfo: {
        topology: backupTopologySummary,
        meta: {
          backupMeta: {
            fileCount,
            fileSizeTotal,
          },
          filesMeta: {
            fileCount,
            fileSizeTotal,
          },
          totalMeta: {
            fileCount,
            fileSizeTotal,
          },
        },
        nonMeta: {
          referenced: {
            fileCount,
            fileSizeTotal,
            fileCompressedSizeTotal,
          },
          nonReferenced: {
            fileCount,
            fileSizeTotal,
            fileCompressedSizeTotal,
          },
          total: {
            fileCount,
            fileSizeTotal,
            fileCompressedSizeTotal,
          },
        },
        total: {
          fileCount,
          fileSizeTotal,
          fileCompressedSizeTotal,
        },
      },
    }
  */
  async fullBackupInfoDump() {
    const backupNames = await this.listBackups();
    
    let backupInfo = [];
    
    for (const backupName of backupNames) {
      backupInfo.push([
        backupName,
        await this.singleBackupInfoDump(backupName, { summary: false }),
      ]);
    }
    
    let filesTotal = 0,
      foldersTotal = 0,
      symbolicLinksTotal = 0,
      sizeBytesTotal = 0,
      compressedSizeBytesTotal = 0,
      backupMetaSizeBytesTotal = 0;
    
    let referencedFileHashesTotal = new Set();
    
    for (
      const [
        _,
        {
          files,
          folders,
          symbolicLinks,
          sizeBytes,
          compressedSizeBytes,
          backupOnlyMetaSizeBytes,
          referencedFileHashes,
        },
      ] of backupInfo
    ) {
      filesTotal += files;
      foldersTotal += folders;
      symbolicLinksTotal += symbolicLinks;
      sizeBytesTotal += sizeBytes;
      compressedSizeBytesTotal += compressedSizeBytes;
      backupMetaSizeBytesTotal += backupOnlyMetaSizeBytes;
      
      for (const hash of referencedFileHashes) {
        referencedFileHashesTotal.add(hash);
      }
    }
    
    const {
      fileCount: totalMetaFileCount,
      sizeBytes: totalMetaFileSizeBytes,
    } = await this._getTotalFilesMetaSize();
    
    const {
      fileCount: totalFileCount,
      sizeBytes: totalSizeBytes,
      compressedSizeBytes: totalCompressedSizeBytes,
    } = await this._getTotalFilesSize();
    
    let referencedSizeTotal = 0,
      referencedCompressedSizeTotal = 0;
    
    for (const hash of referencedFileHashesTotal) {
      const { size, compressedSize } = await this._getFileMeta(hash);
      
      referencedSizeTotal += size;
      referencedCompressedSizeTotal += compressedSize;
    }
    
    return {
      individualBackupsInfo: {
        backups:
          backupInfo
            .map(([ backupName, backupInfo ]) => [
              backupName,
              Object.fromEntries(
                Object.entries(backupInfo)
                  .filter(
                    ([ backupInfoKey, _ ]) =>
                      backupInfoKey != 'referencedFileHashes'
                  )
              ),
            ]),
        naiveSum: {
          files: filesTotal,
          folders: foldersTotal,
          symbolicLinks: symbolicLinksTotal,
          items: filesTotal + foldersTotal + symbolicLinksTotal,
          sizeBytes: sizeBytesTotal,
          compressedSizeBytes: compressedSizeBytesTotal,
        },
      },
      fullBackupInfo: {
        topology: this.backupTopologySummary(),
        meta: {
          backupMeta: {
            fileCount: backupInfo.length,
            fileSizeTotal: backupMetaSizeBytesTotal,
          },
          filesMeta: {
            fileCount: totalMetaFileCount,
            fileSizeTotal: totalMetaFileSizeBytes,
          },
          totalMeta: {
            fileCount: backupInfo.length + totalMetaFileCount,
            fileSizeTotal: backupMetaSizeBytesTotal + totalMetaFileSizeBytes,
          },
        },
        nonMeta: {
          referenced: {
            fileCount: referencedFileHashesTotal.size,
            fileSizeTotal: referencedSizeTotal,
            fileCompressedSizeTotal: referencedCompressedSizeTotal,
          },
          nonReferenced: {
            fileCount: totalFileCount - referencedFileHashesTotal.size,
            fileSizeTotal: totalSizeBytes - referencedSizeTotal,
            fileCompressedSizeTotal: totalCompressedSizeBytes - referencedCompressedSizeTotal,
          },
          total: {
            fileCount: totalFileCount,
            fileSizeTotal: totalSizeBytes,
            fileCompressedSizeTotal: totalCompressedSizeBytes,
          },
        },
        total: {
          fileCount: backupInfo.length + totalMetaFileCount + totalFileCount,
          fileSizeTotal: backupMetaSizeBytesTotal + totalMetaFileSizeBytes + totalSizeBytes,
          fileCompressedSizeTotal: backupMetaSizeBytesTotal + totalMetaFileSizeBytes + totalCompressedSizeBytes,
        },
      },
    };
  }
}

export async function createBackupManager(
  backupDirPath,
  {
    autoUpgradeDir = false,
    cacheEnabled = true,
    globalLogger = null,
  } = {}
) {
  // the 'await' call does have an effect, as constructor returns a promise that gets
  // fulfilled with the newly constructed BackupManager object
  /* eslint-disable-next-line @typescript-eslint/await-thenable */
  return await new BackupManager(
    backupDirPath,
    {
      autoUpgradeDir,
      cacheEnabled,
      globalLogger,
    }
  );
}
