import { readFile } from 'fs/promises';
import { join } from 'path';

export const MIN_BACKUP_VERSION = 1;
export const CURRENT_BACKUP_VERSION = 2;
export const FULL_INFO_FILE_NAME = 'info.json';
export const META_FILE_EXTENSION = '.json';
export const META_DIRECTORY = 'files_meta';
export const SINGULAR_META_FILE_NAME = `file.${META_FILE_EXTENSION}`;

export function fullInfoFileStringify(contents) {
  return JSON.stringify(contents, null, 2);
}

export function metaFileStringify(contents) {
  return JSON.stringify(contents, null, 2);
}

export function backupFileStringify(contents) {
  return JSON.stringify(contents, null, 2);
}

export async function getBackupDirInfo(backupDirPath) {
  const infoFilePath = join(backupDirPath, FULL_INFO_FILE_NAME);
  
  let data;
  try {
    data = await readFile(infoFilePath);
  } catch (err) {
    if (err.code == 'ENOENT') {
      throw new Error(`path is not a backup dir (no info.json): ${backupDirPath}`);
    } else {
      throw err;
    }
  }
  
  try {
    data = JSON.parse(data);
  } catch {
    throw new Error(`path is not a backup dir (info.json invalid json): ${backupDirPath}`);
  }
  
  if (data.folderType != 'coolguy284/node-hash-backup') {
    throw new Error(`path is not a backup dir (info.json type not hash backup): ${backupDirPath}`);
  }
  
  return data;
}

export async function isValidBackupDir(backupDirPath) {
  await errorIfPathNotDir(backupDirPath);
  
  try {
    await getBackupDirInfo(backupDirPath);
    return true;
  } catch {
    return false;
  }
}
