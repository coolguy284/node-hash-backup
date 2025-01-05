// primary exports

export { createBackupManager } from './src/backup_manager/backup_manager.mjs';
export {
  initBackupDir,
  deleteBackupDir,
  performBackup,
  performRestore,
} from './src/backup_manager/backup_helper_funcs.mjs';
export { SymlinkModes } from './src/lib/fs.mjs';

// additional exports

export { DEFAULT_IN_MEMORY_CUTOFF_SIZE } from './src/backup_manager/backup_manager.mjs';
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
} from './src/backup_manager/lib.mjs';

// check for running as main

import { realpath } from 'fs/promises';

import { executeCommandLine } from './src/command_line/command_line.mjs';

if (process.argv[0] == await realpath(import.meta.filename)) {
  // execute main cli code
  await executeCommandLine();
}
