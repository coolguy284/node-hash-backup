import { SymlinkModes } from './src/lib/fs.mjs';
import {
  createBackupManager,
  DEFAULT_IN_MEMORY_CUTOFF_SIZE,
} from './backup_manager.mjs';
import { deleteBackupDirInternal } from './lib.mjs';

export async function initBackupDir({
  backupDir,
  hash = 'sha256',
  hashSlices = 1,
  hashSliceLength = null,
  compressAlgo = 'brotli',
  compressParams = { level: 6 },
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  await backupMgr.initBackupDir({
    hashAlgo: hash,
    hashSlices,
    hashSliceLength,
    compressionAlgo: compressAlgo,
    compressionParams: compressParams,
  });
}

export async function deleteBackupDir({
  backupDir,
  confirm = false,
  logger = console.log,
}) {
  if (!confirm) {
    throw new Error(`Confirm must be true to perform backup dir deletion`);
  }
  
  await deleteBackupDirInternal({
    backupDirPath: backupDir,
    logger,
  });
}

export async function performBackup({
  backupDir,
  basePath,
  name,
  excludedFilesOrFolders = [],
  symlinkMode = SymlinkModes.PRESERVE,
  inMemoryCutoffSize = DEFAULT_IN_MEMORY_CUTOFF_SIZE,
  ignoreErrors = false,
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  await backupMgr.createBackup({
    backupName: name,
    fileOrFolderPath: basePath,
    excludedFilesOrFolders,
    symlinkMode,
    inMemoryCutoffSize,
    ignoreErrors,
  });
}

export async function performRestore({
  
}) {
  
}
