import {
  readdir,
  readFile,
} from 'fs/promises';
import { join } from 'path';

import { writeFileReplaceWhenDone } from './lib/fs.mjs';
import { callBothLoggers } from './lib/logger.mjs';
import {
  CURRENT_BACKUP_VERSION,
  FULL_INFO_FILE_NAME,
  fullInfoFileStringify,
  getBackupDirInfo,
  META_DIRECTORY,
  META_FILE_EXTENSION,
  metaFileStringify,
  MIN_BACKUP_VERSION,
  SINGULAR_META_FILE_NAME,
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
        x.endsWith(META_FILE_EXTENSION) &&
        (x.length - META_FILE_EXTENSION.length) == hashSliceLength &&
        isLowerCaseHex(x.slice(0, META_FILE_EXTENSION.length))
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
  
  const filesMetaPath = join(backupDirPath, META_DIRECTORY);
  
  if (info.hashSlices == 0) {
    const fullMetaFileName = join(filesMetaPath, SINGULAR_META_FILE_NAME);
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
  
  const infoFilePath = join(backupDirPath, FULL_INFO_FILE_NAME);
  
  await writeFileReplaceWhenDone(
    infoFilePath,
    fullInfoFileStringify(info)
  );
  
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
      upgradeDir1To2({ backupDirPath, info, logger, globalLogger });
  }
  
  callBothLoggers({ logger, globalLogger }, `Finished upgrading hash backup store across multiple versions, from version ${info.version} to ${CURRENT_BACKUP_VERSION}.`);
}
