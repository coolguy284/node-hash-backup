// primary exports

export { createBackupManager } from './src/backup_manager/backup_manager.mjs';
export {
  initBackupDir,
  getBackupInfo,
  getEntryInfo,
  getFileStreamByBackupPath,
  getFolderContents,
  getSubtree,
  listBackups,
  deleteBackup,
  deleteBackupDir,
  performBackup,
  performRestore,
  pruneUnreferencedFiles,
  renameBackup,
  runInteractiveSession,
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
  getHashOutputSizeBits,
  hashAlgoKnown,
  HEX_CHAR_LENGTH_BITS,
  INSECURE_HASHES,
  isValidBackupDir,
  knownHashAlgos,
  MIN_BACKUP_VERSION,
  RECOMMENDED_MINIMUM_HASH_LENGTH_BITS,
  VARIABLE_LENGTH_HAHSHES,
} from './src/backup_manager/lib.mjs';
export {
  getLzmaInstalled,
  getProgramVersion,
} from './src/backup_manager/version.mjs';
export {
  executeCommandLine,
  executeCommandLineCollectOutput,
} from './src/command_line/command_line.mjs';
export { getVersionString } from './src/command_line/help_info.mjs';

// check for running as main

import { realpath } from 'node:fs/promises';
import { dirname } from 'node:path';

import { executeCommandLine } from './src/command_line/command_line.mjs';

const nodeCalledFilePath = await realpath(process.argv[1]);
const thisFilePath = await realpath(import.meta.filename);

if (nodeCalledFilePath == thisFilePath || nodeCalledFilePath == dirname(thisFilePath)) {
  // execute main cli code
  await executeCommandLine();
}
