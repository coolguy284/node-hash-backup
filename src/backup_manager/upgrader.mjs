import {
  readdir,
  readFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import {
  recursiveReaddir,
  setReadOnly,
  writeFileReplaceWhenDone,
  unsetReadOnly,
} from '../lib/fs.mjs';
import { callBothLoggers } from '../lib/logger.mjs';
import {
  CURRENT_BACKUP_VERSION,
  HB_FULL_INFO_FILE_NAME,
  fullInfoFileStringify,
  getBackupDirInfo,
  HB_BACKUP_META_DIRECTORY,
  HB_FILE_DIRECTORY,
  HB_FILE_META_DIRECTORY,
  HB_FILE_META_FILE_EXTENSION,
  HB_FILE_META_SINGULAR_META_FILE_NAME,
  metaFileStringify,
  MIN_BACKUP_VERSION,
} from './lib.mjs';

function isLowerCaseHex(string) {
  return /^[0-9a-f]+$/.test(string);
}

async function upgradeDir1To2_processOneMetaFile({
  metaFilePath,
  logger,
  globalLogger,
}) {
  callBothLoggers({ logger, globalLogger }, `Upgrading meta file ${metaFilePath}...`);
  
  const origContents = JSON.parse(await readFile(metaFilePath));
  
  const newContents = Object.fromEntries(
    Object.entries(origContents)
      .map(([fileHash, fileMeta]) => [
        fileHash,
        {
          size: fileMeta.size,
          ...(fileMeta.compressedSize != null ? { compressedSize: fileMeta.compressedSize } : {}),
          ...(fileMeta.compression != null ? { compression: fileMeta.compression } : {}),
        },
      ])
  );
  
  await writeFileReplaceWhenDone(
    metaFilePath,
    metaFileStringify(newContents)
  );
}

async function upgradeDir1To2_processMetaFolder({
  metaFolderPath,
  nestingLevelsRemaining,
  hashSliceLength,
  logger,
  globalLogger,
}) {
  if (nestingLevelsRemaining <= 0) {
    callBothLoggers({ logger, globalLogger }, `Upgrading meta folder ${metaFolderPath}...`);
    
    const metaFiles = (await readdir(metaFolderPath))
      .filter(x =>
        x.endsWith(HB_FILE_META_FILE_EXTENSION) &&
        (x.length - HB_FILE_META_FILE_EXTENSION.length) == hashSliceLength &&
        isLowerCaseHex(x.slice(0, HB_FILE_META_FILE_EXTENSION.length))
      );
    
    for (const metaFile of metaFiles) {
      const fullFilePath = join(metaFolderPath, metaFile);
      await upgradeDir1To2_processOneMetaFile({
        metaFilePath: fullFilePath,
        logger,
        globalLogger,
      });
    }
  } else {
    callBothLoggers({ logger, globalLogger }, `Upgrading meta category folder ${metaFolderPath}...`);
    
    const subFolders = (await readdir(metaFolderPath))
      .filter(x =>
        x.length == hashSliceLength &&
        isLowerCaseHex(x)
      );
    
    for (const subFolder of subFolders) {
      const fullFolderPath = join(metaFolderPath, subFolder);
      await upgradeDir1To2_processMetaFolder({
        metaFolderPath: fullFolderPath,
        nestingLevelsRemaining: nestingLevelsRemaining - 1,
        hashSliceLength,
        logger,
        globalLogger,
      });
    }
  }
}

async function upgradeDir1To2({
  backupDirPath,
  info,
  logger,
  globalLogger,
}) {
  callBothLoggers({ logger, globalLogger }, 'Upgrading hash backup store from version 1 to 2...');
  
  callBothLoggers({ logger, globalLogger }, 'Upgrading file metadata folder...');
  
  const filesMetaPath = join(backupDirPath, HB_FILE_META_DIRECTORY);
  
  if (info.hashSlices == 0) {
    const fullMetaFileName = join(filesMetaPath, HB_FILE_META_SINGULAR_META_FILE_NAME);
    
    await upgradeDir1To2_processOneMetaFile({
      metaFilePath: fullMetaFileName,
      logger,
      globalLogger,
    });
  } else {
    await upgradeDir1To2_processMetaFolder({
      metaFolderPath: filesMetaPath,
      nestingLevelsRemaining: info.hashSlices,
      hashSliceLength: info.hashSliceLength,
      logger,
      globalLogger,
    });
  }
  
  info.version++;
  
  if (info.hashSlices == 0) {
    delete info.hashSliceLength;
  }
  
  if (info.compression == null) {
    delete info.compression;
  }
  
  callBothLoggers({ logger, globalLogger }, `Upgrading ${HB_FULL_INFO_FILE_NAME}...`);
  
  const infoFilePath = join(backupDirPath, HB_FULL_INFO_FILE_NAME);
  
  await setReadOnly(infoFilePath, false);
  
  await writeFileReplaceWhenDone(
    infoFilePath,
    fullInfoFileStringify(info),
    { readonly: true },
  );
  
  callBothLoggers({ logger, globalLogger }, 'Setting backup metadata files to read-only...');
  
  const backupMetaFilePath = join(backupDirPath, HB_BACKUP_META_DIRECTORY);
  
  const backupFileNames = await readdir(backupMetaFilePath);
  
  for (const fileName of backupFileNames) {
    const backupMetaFile = join(backupMetaFilePath, fileName);
    await setReadOnly(backupMetaFile, true);
  }
  
  callBothLoggers({ logger, globalLogger }, 'Setting data files to read-only...');
  
  const filesFilePath = join(backupDirPath, HB_FILE_DIRECTORY);
  
  const dataFilePaths = await recursiveReaddir(filesFilePath, { includeDirs: false, entries: false });
  
  for (const filePath of dataFilePaths) {
    await setReadOnly(filePath, true);
  }
  
  callBothLoggers({ logger, globalLogger }, 'Finished upgrading hash backup store from version 1 to 2.');
}

export async function upgradeDirToCurrent({
  backupDirPath,
  logger = null,
  globalLogger = null,
}) {
  if (typeof backupDirPath != 'string') {
    throw new Error(`backupDirPath not string: ${typeof backupDirPath}`);
  }
  
  if (typeof logger != 'function' && logger != null) {
    throw new Error(`logger not function or null: ${typeof logger}`);
  }
  
  if (typeof globalLogger != 'function' && globalLogger != null) {
    throw new Error(`globalLogger not function or null: ${typeof globalLogger}`);
  }
  
  let info = await getBackupDirInfo(backupDirPath);
  
  if (info.version < MIN_BACKUP_VERSION) {
    throw new Error(`backup version invalid: version (${info.version}) < min version (${MIN_BACKUP_VERSION})`);
  }
  
  if (info.version > CURRENT_BACKUP_VERSION) {
    throw new Error(`backup version invalid: version (${info.version}) > latest version (${CURRENT_BACKUP_VERSION})`);
  }
  
  callBothLoggers({ logger, globalLogger }, `Upgrading hash backup store across multiple versions, from version ${info.version} to ${CURRENT_BACKUP_VERSION}...`);
  
  switch (info.version) {
    case 1:
      await upgradeDir1To2({ backupDirPath, info, logger, globalLogger });
  }
  
  callBothLoggers({ logger, globalLogger }, `Finished upgrading hash backup store across multiple versions, from version ${info.version} to ${CURRENT_BACKUP_VERSION}.`);
}
