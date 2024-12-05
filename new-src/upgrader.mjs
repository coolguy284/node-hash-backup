import {
  readdir,
  readFile,
  rename,
  writeFile,
} from 'fs/promises';
import { join } from 'path';

import {
  getBackupDirInfo,
  META_FILE_EXTENSION,
  MIN_BACKUP_VERSION,
  SINGULAR_META_FILE_NAME,
  TEMP_NEW_FILE_SUFFIX,
} from './lib.mjs';

function isLowerCaseHex(string) {
  return /^[0-9a-f]+$/.test(string);
}

async function upgradeDir1To2_processOneMetaFile(metaFilePath) {
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
  
  const tempNewMetaFilePath = metaFilePath + TEMP_NEW_FILE_SUFFIX;
  
  await writeFile(
    tempNewMetaFilePath,
    JSON.stringify(newContents, null, 2)
  );
  await rename(tempNewMetaFilePath, metaFilePath);
}

async function upgradeDir1To2_processMetaFolder({
  metaFolderPath,
  nestingLevelsRemaining,
  hashSliceLength,
}) {
  if (nestingLevelsRemaining <= 0) {
    const metaFiles = (await readdir(metaFolderPath))
      .filter(x =>
        x.endsWith(META_FILE_EXTENSION) &&
        (x.length - META_FILE_EXTENSION.length) == hashSliceLength &&
        isLowerCaseHex(x.slice(0, META_FILE_EXTENSION.length))
      );
    
    for (const metaFile of metaFiles) {
      const fullFilePath = join(metaFolderPath, metaFile);
      await upgradeDir1To2_processOneMetaFile(fullFilePath);
    }
  } else {
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
      });
    }
  }
}

async function upgradeDir1To2({ path, info }) {
  const filesMetaPath = join(path, 'files_meta');
  
  if (info.hashSlices == 0) {
    await upgradeDir1To2_processOneMetaFile(join(filesMetaPath, SINGULAR_META_FILE_NAME));
  } else {
    await upgradeDir1To2_processMetaFolder({
      metaFolderPath: filesMetaPath,
      nestingLevelsRemaining: info.hashSlices,
      hashSliceLength: info.hashSliceLength,
    });
  }
}

export async function upgradeDirToCurrent(path) {
  const info = await getBackupDirInfo(path);
  
  if (info.version < MIN_BACKUP_VERSION) {
    throw new Error(`backup version invalid: version (${info.version}) < min version (${MIN_BACKUP_VERSION})`);
  }
  
  switch (info.version) {
    case 1:
      upgradeDir1To2({ path, info });
  }
}
