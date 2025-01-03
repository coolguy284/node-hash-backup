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
      .map(async ({ path, stats }) => {
        await getAndAddBackupEntry({
          baseFileOrFolderPath: basePath,
          subFileOrFolderPath: path,
          stats,
          includeBytes: true,
        });
      })
  );
}
