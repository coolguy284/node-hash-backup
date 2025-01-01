import { createBackupManager } from './backup_manager.mjs';
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
