import { readFile } from 'fs/promises';

export const MIN_BACKUP_VERSION = 1;
export const CURRENT_BACKUP_VERSION = 2;

export async function getBackupDirInfo(path) {
  let data;
  try {
    data = await readFile(path);
  } catch (err) {
    if (err.code == 'ENOENT') {
      throw new Error(`path is not a backup dir (no info.json): ${path}`);
    } else {
      throw err;
    }
  }
  
  try {
    data = JSON.parse(data);
  } catch {
    throw new Error(`path is not a backup dir (info.json invalid json): ${path}`);
  }
  
  if (data.folderType != 'coolguy284/node-hash-backup') {
    throw new Error(`path is not a backup dir (info.json type not hash backup): ${path}`);
  }
  
  return data;
}
