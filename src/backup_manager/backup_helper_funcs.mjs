import { SymlinkModes } from '../lib/fs.mjs';
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
  
  try {
    await backupMgr.initBackupDir({
      hashAlgo: hash,
      hashSlices,
      hashSliceLength,
      compressionAlgo: compressAlgo,
      compressionParams: compressParams,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
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
  name,
  basePath,
  excludedFilesOrFolders = [],
  allowBackupDirSubPathOfFileOrFolderPath = true,
  symlinkMode = SymlinkModes.PRESERVE,
  inMemoryCutoffSize = DEFAULT_IN_MEMORY_CUTOFF_SIZE,
  compressionMinimumSizeThreshold = -1,
  compressionMaximumSizeThreshold = Infinity,
  checkForDuplicateHashes = true,
  ignoreErrors = false,
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    await backupMgr.createBackup({
      backupName: name,
      fileOrFolderPath: basePath,
      excludedFilesOrFolders,
      allowBackupDirSubPathOfFileOrFolderPath,
      symlinkMode,
      inMemoryCutoffSize,
      compressionMinimumSizeThreshold,
      compressionMaximumSizeThreshold,
      checkForDuplicateHashes,
      ignoreErrors,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function performRestore({
  backupDir,
  name,
  backupFileOrFolderPath = '.',
  basePath,
  excludedFilesOrFolders = [],
  symlinkMode = SymlinkModes.PRESERVE,
  inMemoryCutoffSize = DEFAULT_IN_MEMORY_CUTOFF_SIZE,
  setFileTimes = true,
  createParentFolders = false,
  overwriteExistingRestoreFolderOrFile = false,
  verifyFileHashOnRetrieval = true,
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    await backupMgr.restoreFileOrFolderFromBackup({
      backupName: name,
      backupFileOrFolderPath,
      outputFileOrFolderPath: basePath,
      excludedFilesOrFolders,
      symlinkMode,
      inMemoryCutoffSize,
      setFileTimes,
      createParentFolders,
      overwriteExistingRestoreFolderOrFile,
      verifyFileHashOnRetrieval,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function getBackupInfo({
  backupDir,
  name = null,
  logger = console.log,
}) {
  if (typeof name != 'string' && name != null) {
    throw new Error(`name not string or null: ${name}`);
  }
  
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    if (name == null) {
      return await backupMgr.fullBackupInfoDump();
    } else {
      return await backupMgr.singleBackupInfoDump(name);
    }
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}
