// primary exports

export { SymlinkModes } from './src/lib/fs.mjs';
export { createBackupManager } from './src/backup_manager.mjs';
export {
  initBackupDir,
  deleteBackupDir,
  performBackup,
  performRestore,
} from './src/backup_helper_funcs.mjs';

// additional exports

export { DEFAULT_IN_MEMORY_CUTOFF_SIZE } from './src/backup_manager.mjs';
export {
  BACKUP_PATH_SEP,
  BITS_PER_BYTE,
  COMPRESSION_ALGOS,
  CURRENT_BACKUP_VERSION,
  deleteBackupDirInternal,
  getBackupDirInfo,
  HASH_SIZES,
  HEX_CHAR_LENGTH_BITS,
  INSECURE_HASHES,
  isValidBackupDir,
  MIN_BACKUP_VERSION,
  // VARIABLE_LENGTH_HAHSHES,
} from './src/lib.mjs';

// check for running as main

import { realpath } from 'fs/promises';

if (process.argv[0] == await realpath(import.meta.filename)) {
  // execute main cli code
  // TODO
}
