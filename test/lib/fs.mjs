import { getAndAddBackupEntry } from '../../src/backup_manager/lib.mjs';
import { recursiveReaddir } from '../../src/lib/fs.mjs';

export async function getFilesAndMetaInDir(basePath, excludedDirs) {
  return await Promise.all(
    (await recursiveReaddir(
      basePath,
      {
        excludedFilesOrFolders: excludedDirs,
        sorted: true,
      }
    ))
      .map(async ({ filePath, stats }) => {
        let backupEntry = await getAndAddBackupEntry({
          baseFileOrFolderPath: basePath,
          subFileOrFolderPath: filePath,
          stats,
          includeBytes: true,
        });
        
        if (backupEntry.type == 'symbolic link') {
          // the test case is not validating full accuracy of symbolic links but only partial accuracy,
          // as full accuracy is impossible. apparently even casting to float then back to string (which
          // i think is what nodejs does internally to pass timestamp to libuv) still is too accurate,
          // so rounding to nearest 1/10_000th instead
          backupEntry.mtime = Math.round(Number(backupEntry.mtime) * 10_000) / 10_000 + '';
          backupEntry.birthtime = null;
        }
        
        return backupEntry;
      })
  );
}
