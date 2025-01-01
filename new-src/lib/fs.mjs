import {
  access,
  chmod,
  lstat,
  open,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'fs/promises';
import {
  join,
  sep,
} from 'path';

import { Enum } from './enum.mjs';
import { callProcess } from './process.mjs';
import { unixNSIntToUTCTimeString } from './time.mjs';

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

export async function testCreateFile(filename) {
  const tempFilename = filename + TEMP_NEW_FILE_SUFFIX;
  
  await writeFile(tempFilename, Buffer.alloc(0));
  await unlink(tempFilename);
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

export async function fileOrFolderExists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

export function splitPath(pathToSplit) {
  if (sep == '\\') {
    return pathToSplit.split(/\/|\\/);
  } else {
    return pathToSplit.split(sep);
  }
}

async function recursiveReaddirInternal(
  fileOrDirPath,
  {
    excludedFilesOrFolders,
    symlinkMode,
  }
) {
  let selfStats;
  
  switch (symlinkMode) {
    case SymlinkModes.IGNORE: {
      const stats = await lstat(fileOrDirPath, { bigint: true });
      
      if (stats.isSymbolicLink()) {
        return null;
      } else {
        selfStats = stats;
      }
      break;
    }
    
    case SymlinkModes.PASSTHROUGH:
      selfStats = await stat(fileOrDirPath, { bigint: true });
      break;
    
    case SymlinkModes.PRESERVE:
      selfStats = await lstat(fileOrDirPath, { bigint: true });
      break;
    
    default:
      throw new Error(`default case not possible: ${symlinkMode}`);
  }
  
  let result = [
    {
      filePath: fileOrDirPath,
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
              subExcludedFilesOrFolders:
                excludedFilesOrFolders
                  .filter(excludePath => {
                    const [ first, ..._ ] = excludePath;
                    return first == name;
                  })
                  .map(excludePath => excludePath.slice(1))
            };
          })
          .filter(({ subExcludedFilesOrFolders }) =>
            !subExcludedFilesOrFolders.some(excludePath => excludePath.length == 0)
          )
          .map(async ({ name, subExcludedFilesOrFolders }) => {
            await recursiveReaddirInternal(
              join(fileOrDirPath, name),
              {
                excludedFilesOrFolders: subExcludedFilesOrFolders,
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
    excludedFilesOrFolders = [],
    includeDirs = true,
    entries = true,
    symlinkMode = SymlinkModes.PRESERVE,
    sorted = false,
  }
) {
  if (typeof dirPath != 'string') {
    throw new Error(`dirPath not string: ${typeof dirPath}`);
  }
  
  if (!Array.isArray(excludedFilesOrFolders)) {
    throw new Error(`excludedFilesOrFolders not array: ${excludedFilesOrFolders}`);
  }
  
  for (let i = 0; i < excludedFilesOrFolders.length; i++) {
    if (typeof excludedFilesOrFolders[i] != 'string') {
      throw new Error(`excludedFilesOrFolders[${i}] not string: ${typeof excludedFilesOrFolders[i]}`);
    }
  }
  
  excludedFilesOrFolders =
    excludedFilesOrFolders
      .map(excludeEntry => splitPath(excludeEntry));
  
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
  
  let internalResult = await recursiveReaddirInternal(
    dirPath,
    {
      excludedFilesOrFolders,
      symlinkMode,
    }
  );
  
  if (sorted) {
    internalResult
      .sort(
        ({ filePath: filePathA }, { filePath: filePathB }) => {
          if (filePathA < filePathB) {
            return 1;
          } else if (filePathA > filePathB) {
            return -1;
          } else {
            return 0;
          }
        }
      );
  }
  
  return internalResult
    .map(({ filePath, stats }) => {
      if (!includeDirs && stats.isDirectory()) {
        return null;
      }
      
      if (!entries) {
        return filePath;
      } else {
        return { filePath, stats };
      }
    })
    .filter(entry => entry != null);
}

async function recursiveReaddirSimpleFileNamesOnlyInternal(dirPath, depth) {
  if (depth == 1) {
    return await readdir(dirPath);
  } else {
    return (await Promise.all(
      (await readdir(dirPath))
        .map(
          async subDirName =>
            await recursiveReaddirSimpleFileNamesOnlyInternal(
              join(dirPath, subDirName),
              depth - 1
            )
        )
    )).flat();
  }
}

export async function recursiveReaddirSimpleFileNamesOnly(dirPath, depth) {
  if (typeof dirPath != 'string') {
    throw new Error(`dirPath not string: ${typeof dirPath}`);
  }
  
  if (!Number.isSafeInteger(depth) || depth <= 0) {
    throw new Error(`depth not positive integer`);
  }
  
  return await recursiveReaddirSimpleFileNamesOnlyInternal(dirPath, depth);
}

export async function setFileTimes(fileTimeEntries) {
  if (fileTimeEntries.length == 0) {
    return;
  }
  
  if (process.platform == 'win32') {
    let environmentVars = {};
    
    const commandString =
      '$ErrorActionPreference = "Stop"\n' +
      fileTimeEntries
        .map(({
          filePath,
          accessTime,
          modifyTime,
          createTime,
        }, i) => {
          environmentVars[`C284_${i}_F`] = filePath;
          environmentVars[`C284_${i}_C`] = unixNSIntToUTCTimeString(createTime);
          environmentVars[`C284_${i}_M`] = unixNSIntToUTCTimeString(modifyTime);
          environmentVars[`C284_${i}_A`] = unixNSIntToUTCTimeString(accessTime);
          
          return `$file = Get-Item $Env:C284_${i}_F\n` +
            `$file.CreationTime = Get-Date $Env:C284_${i}_C\n` +
            `$file.LastWriteTime = Get-Date $Env:C284_${i}_M\n` +
            `$file.LastAccessTime = Get-Date $Env:C284_${i}_A\n`;
        })
        .join('\n');
      
      return await callProcess({
        processName: 'powershell',
        processArguments: ['-Command', '-'],
        environmentVars,
        stdin: commandString,
      });
  } else {
    let environmentVars = {};
    
    const commandString =
      'set -e\n' +
      fileTimeEntries
        .map(({
          filePath,
          accessTime,
          modifyTime,
        }, i) => {
          environmentVars[`C284_${i}_F`] = filePath;
          environmentVars[`C284_${i}_M`] = unixNSIntToUTCTimeString(modifyTime);
          environmentVars[`C284_${i}_A`] = unixNSIntToUTCTimeString(accessTime);
          
          return `touch -m -d $C284_${i}_M $C284_${i}_F\n` +
            `touch -a -d $C284_${i}_A $C284_${i}_F`;
        })
        .join('\n');
      
      return await callProcess({
        processName: 'bash',
        processArguments: ['-'],
        environmentVars,
        stdin: commandString,
      });
  }
}

export async function setReadOnly(filePath) {
  const currentPerms = (await lstat(filePath)).mode & 0o777;
  const newPerms = currentPerms & 0o555;
  
  if (currentPerms != newPerms) {
    await chmod(filePath, newPerms);
  }
}

export async function unsetReadOnly(filePath) {
  const currentPerms = (await lstat(filePath)).mode & 0o777;
  let newPerms = currentPerms;
  
  if (currentPerms & 0o400) {
    newPerms |= 0o200;
  }
  
  if (currentPerms & 0o040) {
    newPerms |= 0o020;
  }
  
  if (currentPerms & 0o004) {
    newPerms |= 0o002;
  }
  
  if (currentPerms != newPerms) {
    await chmod(filePath, newPerms);
  }
}

export async function isReadOnly(filePath) {
  const currentPerms = (await lstat(filePath)).mode & 0o777;
  const readOnlyPerms = currentPerms & 0o555;
  
  return currentPerms == readOnlyPerms;
}

export async function safeRename(oldFilePath, newFilePath) {
  if (await fileOrFolderExists(newFilePath)) {
    throw new Error(`newFilePath (${newFilePath}) of rename exists`);
  }
  
  await rename(oldFilePath, newFilePath);
}
