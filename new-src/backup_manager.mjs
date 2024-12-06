import { readdir } from 'fs/promises';

import {
  CURRENT_BACKUP_VERSION,
  errorIfPathNotDir,
  getBackupDirInfo,
} from './lib.mjs';
import { upgradeDirToCurrent } from './upgrader.mjs';

class BackupManager {
  // class vars
  
  #backupDirPath = null;
  #hashAlgo = null;
  #hashSliceLength = null;
  #hashSlices = null;
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
    
    const currentDirContents = await readdir(backupDirPath);
    
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
      
      this.#backupDirPath = backupDirPath;
      this.#hashAlgo = info.hash;
      this.#hashSliceLength = info.hashSliceLength;
      this.#hashSlices = info.hashSlices;
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
  
  async initBackupDir({
    hashAlgo = 'sha256',
    hashSliceLength = 2,
    hashSlices = 1,
    compressionAlgo = 'brotli',
    compressionParams = { level: 6 },
    logger,
  }) {
    // TODO
  }
  
  getAllowFullBackupDirDestroyStatus() {
    return this.#allowFullBackupDirDestroy;
  }
  
  updateAllowFullBackupDirDestroyStatus_Danger(newAllowFullBackupDirDestroy) {
    if (typeof newAllowFullBackupDirDestroy != 'boolean') {
      throw new Error(`newAllowFullBackupDirDestroy not boolean: ${typeof newAllowFullBackupDirDestroy}`);
    }
    
    this.#allowFullBackupDirDestroy = newAllowFullBackupDirDestroy;
  }
  
  async destroyBackupDir() {
    if (!this.#allowFullBackupDirDestroy) {
      throw new Error(
        'full backup dir deletion attempted, but backup dir destroy flag is false\n' +
        'call "this.updateAllowFullBackupDirDestroyStatus_Danger(true);" to enable full backup dir destruction'
      );
    }
    
    // TODO
    
    this.#backupDirPath = null;
    this.#hashAlgo = null;
    this.#hashSliceLength = null;
    this.#hashSlices = null;
    this.#compressionAlgo = null;
    this.#compressionParams = null;
  }
  
  async listBackups() {
    // TODO
  }
  
  async hasBackup(backupName) {
    // TODO
  }
  
  async createBackup({
    
  }) {
    // TODO
  }
  
  // Output can not exist, or can be an empty folder
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
    // TODO
  }
  
  async renameBackup({
    oldBackupName,
    newBackupName,
    logger,
  }) {
    // TODO
    // TODO: must check and error if destination name exists
  }
  
  async getFileOrFolderInfoFromBackup({ backupName, backupFileOrFolderPath }) {
    // TODO
  }
  
  async getAllFilesOrFoldersInfoFromBackup(backupName) {
    // TODO
  }
  
  async getFileFromBackup({ backupName, backupFilePath }) {
    // TODO
  }
  
  async getFolderFilenamesFromBackup({ backupName, backupFolderPath }) {
    // TODO
  }
  
  // If restoring a folder, output can not exist, or can be an empty folder
  async restoreFileOrFolderFromBackup({
    backupName,
    backupFileOrFolderPath,
    outputFileOrFolderPath,
    logger,
  }) {
    // TODO
  }
  
  async pruneUnreferencedFiles() {
    // TODO
  }
  
  // Layout of object returned by this function may change over time, beware
  async fullBackupInfoDump() {
    // TODO
  }
}

export async function createBackupManager(backupDirPath) {
  // the 'await' call does have an effect, as constructor returns a promise that gets
  // fulfilled with the newly constructed BackupManager object
  return await new BackupManager(backupDirPath);
}
