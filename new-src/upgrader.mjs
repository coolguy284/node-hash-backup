import { join } from 'path';

import {
  getBackupDirInfo,
  MIN_BACKUP_VERSION,
} from './lib.mjs';

async function upgradeDir1To2({ path, info }) {
  const filesMetaPath = join(path, 'files_meta');
  
  if (info.hashSlices == 0) {
    
  }
}

export async function upgradeDirToCurrent(path) {
  const info = await getBackupDirInfo(path);
  
  if (info.version < MIN_BACKUP_VERSION) {
    throw new Error(`backup version invalid: version (${info.version}) < min version (${MIN_BACKUP_VERSION})`);
  }
  
  switch (info.version) {
    case 1:
      upgradeDir1To2({ path, info });
  }
}
