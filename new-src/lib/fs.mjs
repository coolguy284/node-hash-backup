import {
  access,
  lstat,
  open,
  readdir,
  rename,
  stat,
  writeFile,
} from 'fs/promises';
import {
  join,
  sep,
} from 'path';

import { Enum } from './enum.mjs';

const TEMP_NEW_FILE_SUFFIX = '_new';
const LARGE_FILE_CHUNK_SIZE = 4 * 2 ** 20;
export const SymlinkModes = Enum([
  'IGNORE',
  'PASSTHROUGH',
  'PRESERVE',
]);

export async function errorIfPathNotDir(validationPath) {
  if (typeof validationPath != 'string') {
    throw new Error(`validationPath not string: ${validationPath}`)
  }
  
  let stats = await stat(validationPath);
  
  if (!stats.isDirectory()) {
    throw new Error(`${validationPath} not a directory`);
  }
}

export async function writeFileReplaceWhenDone(filename, contents) {
  const tempNewFilename = filename + TEMP_NEW_FILE_SUFFIX;
  
  await writeFile(tempNewFilename, contents);
  await rename(tempNewFilename, filename);
}

export async function readLargeFile(filename) {
  const fd = await open(filename);
  
  try {
    let chunks = [];
    
    let bytesRead;
    
    do {
      let buffer;
      
      ({ buffer, bytesRead }) = fd.read({
        buffer: Buffer.alloc(LARGE_FILE_CHUNK_SIZE),
      });
      
      if (bytesRead > 0) {
        if (bytesRead < buffer.length) {
          chunks.push(buffer.subarray(0, bytesRead));
        } else {
          chunks.push(buffer);
        }
      }
    } while (bytesRead > 0);
    
    return Buffer.concat(chunks);
  } finally {
    await fd[Symbol.asyncDispose]();
  }
}

export async function fileExists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function recursiveReaddirInternal(
  fileOrDirPath,
  {
    excludedFilesOrDirs,
    symlinkMode,
  }
) {
  let selfStats;
  
  switch (symlinkMode) {
    case SymlinkModes.IGNORE: {
      const stats = await lstat(fileOrDirPath);
      
      if (stats.isSymbolicLink()) {
        return null;
      } else {
        selfStats = stats;
      }
      break;
    }
    
    case SymlinkModes.PASSTHROUGH:
      selfStats = await stat(fileOrDirPath);
      break;
    
    case SymlinkModes.PRESERVE:
      selfStats = await lstat(fileOrDirPath);
      break;
    
    default:
      throw new Error(`default case not possible: ${symlinkMode}`);
  }
  
  let result = [
    {
      path: fileOrDirPath,
      stats: selfStats,
    }
  ];
  
  if (selfStats.isDirectory()) {
    const dirContents =
      (await Promise.all(
        (await readdir(dirPath))
          .map(name => {
            return {
              name,
              subExcludedFilesOrDirs:
                excludedFilesOrDirs
                  .filter(excludePath => {
                    const [ first, ..._ ] = excludePath;
                    return first == name;
                  })
                  .map(excludePath => excludePath.slice(1))
            };
          })
          .filter(({ subExcludedFilesOrDirs }) =>
            !subExcludedFilesOrDirs.some(excludePath => excludePath.length == 0)
          )
          .map(async ({ name, subExcludedFilesOrDirs }) => {
            await recursiveReaddirInternal(
              join(fileOrDirPath, name),
              {
                excludedFilesOrDirs: subExcludedFilesOrDirs,
                symlinkMode,
              }
            );
          })
      ))
      .filter(entry => entry != null)
      .flat();
    
    dirContents.forEach(entry => result.push(entry));
  }
  
  return result;
}

export async function recursiveReaddir(
  dirPath,
  {
    excludedFilesOrDirs = [],
    includeDirs = true,
    entries = true,
    symlinkMode = SymlinkModes.PRESERVE,
  }
) {
  if (typeof dirPath != 'string') {
    throw new Error(`dirPath not string: ${typeof dirPath}`);
  }
  
  if (!Array.isArray(excludedFilesOrDirs)) {
    throw new Error(`excludedFilesOrDirs not array: ${excludedFilesOrDirs}`);
  }
  
  for (let i = 0; i < excludedFilesOrDirs.length; i++) {
    if (typeof excludedFilesOrDirs[i] != 'string') {
      throw new Error(`excludedFilesOrDirs[${i}] not string: ${typeof excludedFilesOrDirs[i]}`);
    }
  }
  
  if (sep == '\\') {
    excludedFilesOrDirs =
      excludedFilesOrDirs
        .map(excludeEntry => excludeEntry.split(/\/|\\/));
  } else {
    excludedFilesOrDirs =
      excludedFilesOrDirs
        .map(excludeEntry => excludeEntry.split(sep));
  }
  
  if (typeof includeDirs != 'boolean') {
    throw new Error(`includeDirs not boolean: ${typeof includeDirs}`);
  }
  
  if (typeof entries != 'boolean') {
    throw new Error(`entries not boolean: ${typeof entries}`);
  }
  
  if (typeof symlinkMode != 'string') {
    throw new Error(`symlinkMode not string: ${typeof symlinkMode}`);
  }
  
  if (!(symlinkMode in SymlinkModes)) {
    throw new Error(`symlinkMode not in SymlinkModes: ${symlinkMode}`);
  }
  
  const internalResult = await recursiveReaddirInternal(
    dirPath,
    {
      excludedFilesOrDirs,
      symlinkMode,
    }
  );
  
  return internalResult
    .map(({ path, stats }) => {
      if (!includeDirs && stats.isDirectory()) {
        return null;
      }
      
      if (!entries) {
        return path;
      } else {
        return { path, stats };
      }
    })
    .filter(entry => entry != null);
}
