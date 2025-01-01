export { createBackupManager } from './src/backup_manager.mjs';
export {
  createBackupDir,
  deleteBackupDir,
} from './src/backup_helper_funcs.mjs';
export {
  CURRENT_BACKUP_VERSION,
  getBackupDirInfo,
  isValidBackupDir,
  MIN_BACKUP_VERSION,
} from './src/lib.mjs';

/*
export {
  errorIfPathNotDir,
  writeFileReplaceWhenDone,
} from './src/lib/fs.mjs';
export { callBothLoggers } from './src/lib/logger.mjs';
export {
  FULL_INFO_FILE_NAME,
  fullInfoFileStringify,
  META_DIRECTORY,
  META_FILE_EXTENSION,
  metaFileStringify,
  SINGULAR_META_FILE_NAME,
} from './src/lib.mjs';
export { upgradeDirToCurrent } from './src/upgrader.mjs';
*/
