import {
  CURRENT_BACKUP_VERSION,
  errorIfPathNotDir,
  getBackupDirInfo,
} from './lib.mjs';
import { upgradeDirToCurrent } from './upgrader.mjs';

class BackupManager {
  #path;
  #globalLogger;
  #allowFullBackupDirDestroy = false;
  
  async #initManager({
    path,
    autoUpgradeDir,
    globalLogger,
    logger,
  }) {
    if (typeof path != 'string') {
      throw new Error(`path not string: ${typeof path}`);
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
    
    await errorIfPathNotDir(path);
    
    let info = await getBackupDirInfo(path);
    
    if (info.version > CURRENT_BACKUP_VERSION) {
      throw new Error(`backup dir version is for more recent version of program: ${info.version} > ${CURRENT_BACKUP_VERSION}`);
    }
    
    if (info.version < CURRENT_BACKUP_VERSION) {
      if (autoUpgradeDir) {
        await upgradeDirToCurrent(path);
        
        info = await getBackupDirInfo(path);
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
  constructor(path, {
    autoUpgradeDir,
    globalLogger,
  }) {
    return this.#initManager({
      path,
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

export async function createBackupManager(path) {
  // the 'await' call does have an effect, as constructor returns a promise that gets
  // fulfilled with the newly constructed BackupManager object
  return await new BackupManager(path);
}
