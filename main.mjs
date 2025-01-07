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
export { getProgramVersion } from './src/backup_manager/version.mjs';
export { executeCommandLine } from './src/command_line/command_line.mjs';

// check for running as main

import { realpath } from 'fs/promises';
import { dirname } from 'path';

import { executeCommandLine } from './src/command_line/command_line.mjs';

const nodeCalledFilePath = process.argv[1];
const thisFilePath = await realpath(import.meta.filename);

if (nodeCalledFilePath == thisFilePath || nodeCalledFilePath == dirname(thisFilePath)) {
  // execute main cli code
  await executeCommandLine();
}
