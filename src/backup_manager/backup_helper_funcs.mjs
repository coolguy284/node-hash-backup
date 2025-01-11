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
  compressParams = null,
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
    throw new Error('Confirm must be true to perform full backup dir deletion');
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
  allowBackupDirSubPathOfFileOrFolderPath = false,
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

export async function deleteBackup({
  backupDir,
  name,
  pruneReferencedFilesAfter = true,
  confirm = false,
  logger = console.log,
}) {
  if (!confirm) {
    throw new Error('Confirm must be true to perform backup deletion');
  }
  
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    backupMgr.updateAllowSingleBackupDestroyStatus_Danger(true);
    
    await backupMgr.destroyBackup({
      backupName: name,
      pruneReferencedFilesAfter,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function renameBackup({
  backupDir,
  oldName,
  newName,
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    await backupMgr.renameBackup({
      oldBackupName: oldName,
      newBackupName: newName,
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
    throw new Error(`name not string or null: ${typeof name}`);
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

export async function getFolderContents({
  backupDir,
  name,
  pathToFolder,
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    return await backupMgr.getFolderFilenamesFromBackup({
      backupName: name,
      backupFolderPath: pathToFolder,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function getEntryInfo({
  backupDir,
  name,
  pathToEntry,
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    return await backupMgr.getFileOrFolderInfoFromBackup({
      backupName: name,
      backupFileOrFolderPath: pathToEntry,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function getSubtree({
  backupDir,
  name,
  pathToEntry = '.',
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    return await backupMgr.getSubtreeInfoFromBackup({
      backupName: name,
      backupFileOrFolderPath: pathToEntry,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function getFileStreamByBackupPath({
  backupDir,
  name,
  pathToFile,
  logger = console.error,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    return await backupMgr.getFileStreamFromBackup({
      backupName: name,
      backupFilePath: pathToFile,
    });
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function pruneUnreferencedFiles({
  backupDir,
  logger = console.log,
}) {
  let backupMgr = await createBackupManager(backupDir, {
    globalLogger: logger,
  });
  
  try {
    await backupMgr.pruneUnreferencedFiles();
  } finally {
    await backupMgr[Symbol.asyncDispose]();
  }
}

export async function runInteractiveSession({
  backupDir = null,
  custom = null,
  logger = console.error,
}) {
  if (typeof backupDir != 'string' && backupDir != null) {
    throw new Error(`backupDir not string or null: ${typeof backupDir}`);
  }
  
  if (typeof custom != 'string' && custom != null) {
    throw new Error(`custom not string or null: ${typeof custom}`);
  }
  
  let hashBackup = null;
  
  if (backupDir != null) {
    hashBackup = await createBackupManager(backupDir, { globalLogger: logger });
  }
  
  try {
    if (hashBackup != null) {
      globalThis.hb = hashBackup;
    }
    
    if (custom != null) {
      globalThis.custom = custom;
    }
  } finally {
    if (hashBackup != null) {
      await hashBackup[Symbol.asyncDispose]();
    }
  }
  
  delete globalThis.hb;
  delete globalThis.custom;
}
