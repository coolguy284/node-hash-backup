import {
  CURRENT_BACKUP_VERSION,
  errorIfPathNotDir,
  getBackupDirInfo,
} from './lib.mjs';
import { upgradeDirToCurrent } from './upgrader.mjs';

class BackupManager {
  #backupDirPath;
  #globalLogger;
  #allowFullBackupDirDestroy = false;
  
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
    
    return this;
  }
  
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
  
  initBackupDir({
    
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
  
  destroyBackupDir() {
    if (!this.#allowFullBackupDirDestroy) {
      throw new Error(
        'full backup dir deletion attempted, but backup dir destroy flag is false\n' +
        'call "this.updateAllowFullBackupDirDestroyStatus_Danger(true);" to enable full backup dir destruction'
      );
    }
    
    // TODO
  }
}

export async function createBackupManager(backupDirPath) {
  // the 'await' call does have an effect, as constructor returns a promise that gets
  // fulfilled with the newly constructed BackupManager object
  return await new BackupManager(backupDirPath);
}
