import { recursiveReaddir } from '../../src/lib/fs.mjs';
import { getAndAddBackupEntry } from '../../src/lib.mjs';

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
