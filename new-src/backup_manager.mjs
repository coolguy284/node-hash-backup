import {
  createHash,
  getHashes,
} from 'crypto';
import {
  mkdir,
  open,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'fs/promises';
import { join } from 'path';
import {
  createBrotliCompress,
  createDeflate,
  createDeflateRaw,
  createGzip,
} from 'zlib';

import { errorIfPathNotDir } from './lib/fs.mjs';
import { callBothLoggers } from './lib/logger.mjs';
import { ReadOnlyMap } from './lib/read_only_map.mjs';
import { ReadOnlySet } from './lib/read_only_set.mjs';
import {
  CURRENT_BACKUP_VERSION,
  getBackupDirInfo,
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
  #globalLogger;
  #allowFullBackupDirDestroy = false;
  #allowSingleBackupDestroy = false;
  
  // helper funcs
  
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
      
      this.#hashAlgo = info.hash;
      this.#hashSlices = info.hashSlices;
      this.#hashSliceLength = info.hashSliceLength ?? null;
      if (info.compression != null) {
        this.#compressionAlgo = info.compression.algorithm;
        this.#compressionParams = Object.fromEntries(
          Object.entries(info.compression).filter(([key, _]) => key != 'algorithm')
        );
      }
    }
    
    // otherwise, dir is currently empty, leave vars at defaults
    
    return this;
  }
  
  async #addFileToStore() {
    // TODO
  }
  
  async #removeFileFromStore() {
    // TODO
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
      callBothLoggers(
        { logger, globalLogger: this.#globalLogger },
        `WARNING: insecure hash algorithm used for backup dir: ${hashAlgo}`
      );
    }
    
    callBothLoggers(
      { logger, globalLogger: this.#globalLogger },
      `Initializing backup dir at ${JSON.stringify(this.#backupDirPath)}`
    );
    
    await mkdir(join(this.#backupDirPath, 'backups'));
    await mkdir(join(this.#backupDirPath, 'files'));
    await mkdir(join(this.#backupDirPath, 'files_meta'));
    await writeFile(
      join(this.#backupDirPath, 'info.json'),
      JSON.stringify({
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
    
    callBothLoggers(
      { logger, globalLogger: this.#globalLogger },
      `Backup dir successfully initialized at ${JSON.stringify(this.#backupDirPath)}`
    );
    
    this.#hashAlgo = hashAlgo;
    this.#hashSlices = hashSlices;
    this.#hashSliceLength = hashSliceLength;
    this.#compressionAlgo = compressionAlgo;
    this.#compressionParams = compressionParams;
  }
  
  getAllowFullBackupDirDestroyStatus() {
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
    
    callBothLoggers(
      { logger, globalLogger: this.#globalLogger },
      `Destroying backup dir at ${JSON.stringify(this.#backupDirPath)}`
    );
    
    await rm(join(this.#backupDirPath, 'backups'), { recursive: true });
    await rm(join(this.#backupDirPath, 'files'), { recursive: true });
    await rm(join(this.#backupDirPath, 'files_meta'), { recursive: true });
    await rm(join(this.#backupDirPath, 'info.json'));
    
    callBothLoggers(
      { logger, globalLogger: this.#globalLogger },
      `Backup dir successfully destroyed at ${JSON.stringify(this.#backupDirPath)}`
    );
    
    this.#hashAlgo = null;
    this.#hashSlices = null;
    this.#hashSliceLength = null;
    this.#compressionAlgo = null;
    this.#compressionParams = null;
  }
  
  async listBackups() {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  async hasBackup(backupName) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  async createBackup({ logger }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  // Output can not exist, or can be an empty folder
  async restoreFromBackup({
    backupName,
    outputPath,
    logger,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    await this.restoreFileOrFolderFromBackup({
      backupName,
      backupFileOrFolderPath: '.',
      outputPath,
      logger,
    });
  }
  
  getAllowSingleBackupDestroyStatus() {
    return this.#allowSingleBackupDestroy;
  }
  
  updateAllowSingleBackupDestroyStatus_Danger(newSingleBackupDestroy) {
    if (typeof newSingleBackupDestroy != 'boolean') {
      throw new Error(`newSingleBackupDestroy not boolean: ${typeof newSingleBackupDestroy}`);
    }
    
    this.#allowSingleBackupDestroy = newSingleBackupDestroy;
  }
  
  async destroyBackup({
    backupName,
    logger,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    if (!this.#allowSingleBackupDestroy) {
      throw new Error(
        'backup deletion attempted, but backup dir destroy flag is false\n' +
        'call "this.updateAllowSingleBackupDestroyStatus_Danger(true);" to enable backup deletion'
      );
    }
    
    // TODO
  }
  
  async renameBackup({
    oldBackupName,
    newBackupName,
    logger,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
    // TODO: must check and error if destination name exists
  }
  
  async getFileOrFolderInfoFromBackup({
    backupName,
    backupFileOrFolderPath,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  async getAllFilesOrFoldersInfoFromBackup(backupName) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  async getFileFromBackup({
    backupName,
    backupFilePath,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  async getFolderFilenamesFromBackup({
    backupName,
    backupFolderPath,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  // If restoring a folder, output can not exist, or can be an empty folder
  async restoreFileOrFolderFromBackup({
    backupName,
    backupFileOrFolderPath,
    outputFileOrFolderPath,
    logger,
  }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  async pruneUnreferencedFiles({ logger }) {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
  }
  
  // Layout of object returned by this function may change over time, beware
  async fullBackupInfoDump() {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    if (this.#hashAlgo == null) {
      throw new Error('backup dir not initialized');
    }
    
    // TODO
    // TODO: only call public functions in backupmanager to create the info dump
  }
  
  async [Symbol.asyncDispose]() {
    if (this.#disposed) {
      throw new Error('BackupManager already disposed');
    }
    
    this.#disposed = true;
    
    try {
      // delete lock file
      await this.#lockFile[Symbol.asyncDispose]();
      await unlink(join(this.#backupDirPath, 'edit.lock'));
    } finally {
      this.#lockFile = null;
      this.#backupDirPath = null;
      this.#hashAlgo = null;
      this.#hashSliceLength = null;
      this.#hashSlices = null;
      this.#compressionAlgo = null;
      this.#compressionParams = null;
      this.#globalLogger = null;
      this.#allowFullBackupDirDestroy = null;
      this.#allowSingleBackupDestroy = null;
    }
  }
}

export async function createBackupManager(backupDirPath) {
  // the 'await' call does have an effect, as constructor returns a promise that gets
  // fulfilled with the newly constructed BackupManager object
  return await new BackupManager(backupDirPath);
}
