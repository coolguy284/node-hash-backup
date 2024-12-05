import {
  stat,
} from 'fs/promises';

import {
  CURRENT_BACKUP_VERSION,
  getBackupDirInfo,
} from './lib.mjs';
import { upgradeDirToCurrent } from './upgrader.mjs';

async function errorIfPathNotDir(path) {
  let stats = await stat(path);
  
  if (!stats.isDirectory()) {
    throw new Error(`${path} not a directory`);
  }
}

class BackupManager {
  #path;
  #globalLogger;
  #allowFullBackupDirDestroy = false;
  
  async #initManager({
    path,
    autoUpgradeDir,
    globalLogger,
  }) {
    if (typeof path != 'string') {
      throw new Error(`path not string: ${typeof path}`);
    }
    
    if (typeof globalLogger != 'function' && globalLogger != null) {
      throw new Error(`globalLogger must be a function or null, but was: ${typeof globalLogger}`);
    }
    
    this.#globalLogger = globalLogger ?? null;
    
    await errorIfPathNotDir(path);
    
    let info = await getBackupDirInfo(path);
    
    if (info.version > CURRENT_BACKUP_VERSION) {
      throw new Error(`backup dir version is for more recent version of program: ${info.version} > ${CURRENT_BACKUP_VERSION}`);
    }
    
    if (info.version < CURRENT_BACKUP_VERSION) {
      if (autoUpgradeDir) {
        await upgradeDirToCurrent(path);
        
        info = await getBackupDirInfo(path);
      }
    }
    
    // info.version == CURRENT_BACKUP_VERSION here
    
    return this;
  }
  
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
        'call updateAllowFullBackupDirDestroyStatus_Danger(true) to enable full backup dir destruction'
      );
    }
    
    // TODO
  }
}

export async function createBackupManager(path) {
  return await new BackupManager(path);
}
