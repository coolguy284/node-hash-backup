export { createBackupManager } from './new-src/backup_manager.mjs';
export {
  CURRENT_BACKUP_VERSION,
  getBackupDirInfo,
  isValidBackupDir,
  MIN_BACKUP_VERSION,
} from './new-src/lib.mjs';

/*
export {
  errorIfPathNotDir,
  writeFileReplaceWhenDone,
} from './new-src/lib/fs.mjs';
export { callBothLoggers } from './new-src/lib/logger.mjs';
export {
  FULL_INFO_FILE_NAME,
  fullInfoFileStringify,
  META_DIRECTORY,
  META_FILE_EXTENSION,
  metaFileStringify,
  SINGULAR_META_FILE_NAME,
} from './new-src/lib.mjs';
export { upgradeDirToCurrent } from './new-src/upgrader.mjs';
*/
