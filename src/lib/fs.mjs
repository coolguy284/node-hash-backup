import {
  access,
  chmod,
  lstat,
  lutimes,
  open,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'fs/promises';
import {
  join,
  relative,
  sep,
} from 'path';

import { Enum } from './enum.mjs';
import {
  decimalStringToStringWithSeparator,
  integerToStringWithSeparator,
} from './number.mjs';
import { callProcess } from './process.mjs';
import {
  unixNSIntToUnixSecString,
  unixNSIntToUTCTimeString,
} from './time.mjs';

const TEMP_NEW_FILE_SUFFIX = '_new';
const LARGE_FILE_CHUNK_SIZE = 4 * 2 ** 20;
export const SymlinkModes = Enum([
  'IGNORE',
  'PASSTHROUGH',
  'PRESERVE',
]);
const HUMAN_READABLE_THRESHOLD = 16;
export const RelativeStatus = Enum([
  'NO_RELATIVE',
  'FIRST_IS_SUBPATH_OF_SECOND',
  'SECOND_IS_SUBPATH_OF_FIRST',
  'PATHS_EQUAL',
]);

export async function errorIfPathNotDir(validationPath) {
  if (typeof validationPath != 'string') {
    throw new Error(`validationPath not string: ${validationPath}`);
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
      
      ({ buffer, bytesRead } = await fd.read({
        buffer: Buffer.alloc(LARGE_FILE_CHUNK_SIZE),
      }));
      
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

export async function fileOrFolderExists(fileOrFolderName) {
  try {
    await access(fileOrFolderName);
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
    },
  ];
  
  if (selfStats.isDirectory()) {
    const dirContents =
      (await Promise.all(
        (await readdir(fileOrDirPath))
          .map(name => {
            return {
              name,
              subExcludedFilesOrFolders:
                excludedFilesOrFolders
                  .filter(excludePath => {
                    const [ first, ..._ ] = excludePath;
                    return first == name;
                  })
                  .map(excludePath => excludePath.slice(1)),
            };
          })
          .filter(({ subExcludedFilesOrFolders }) =>
            !subExcludedFilesOrFolders.some(excludePath => excludePath.length == 0)
          )
          .map(async ({ name, subExcludedFilesOrFolders }) => await recursiveReaddirInternal(
            join(fileOrDirPath, name),
            {
              excludedFilesOrFolders: subExcludedFilesOrFolders,
              symlinkMode,
            }
          ))
      ))
        .filter(entry => entry != null)
        .flat();
    
    dirContents.forEach(entry => result.push(entry));
  }
  
  return result;
}

export async function recursiveReaddir(
  fileOrDirPath,
  {
    excludedFilesOrFolders = [],
    includeDirs = true,
    entries = true,
    symlinkMode = SymlinkModes.PRESERVE,
    sorted = false,
  } = {}
) {
  if (typeof fileOrDirPath != 'string') {
    throw new Error(`fileOrDirPath not string: ${typeof fileOrDirPath}`);
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
    fileOrDirPath,
    {
      excludedFilesOrFolders,
      symlinkMode,
    }
  );
  
  if (symlinkMode == 'IGNORE' && internalResult == null) {
    throw new Error(`symlinkMode set to "IGNORE" but root directory is a symlink: ${JSON.stringify(fileOrDirPath)}`);
  }
  
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
    throw new Error(`depth not positive integer: ${depth}`);
  }
  
  return await recursiveReaddirSimpleFileNamesOnlyInternal(dirPath, depth);
}

export async function setFileTimes(fileTimeEntries) {
  if (fileTimeEntries.length == 0) {
    return;
  }
  
  if (process.platform == 'win32') {
    let fileTimeEntriesRegular = [],
      fileTimeEntriesSymbolicLink = [];
    
    await Promise.all(
      fileTimeEntries
        .map(async entry => {
          const fileStats = await lstat(entry.filePath, { bigint: true });
          if (fileStats.isSymbolicLink()) {
            fileTimeEntriesSymbolicLink.push({
              ...entry,
              atimeNs: fileStats.atimeNs,
              mtimeNs: fileStats.mtimeNs,
            });
          } else {
            fileTimeEntriesRegular.push(entry);
          }
        })
    );
    
    // powershell cannot set timestamps of symbolic links, must use utimes and accept inaccuracy
    for (let {
      filePath,
      accessTimeUnixNSInt = null,
      modifyTimeUnixNSInt = null,
      atimeNs,
      mtimeNs,
    } of fileTimeEntriesSymbolicLink) {
      if (accessTimeUnixNSInt == null) {
        accessTimeUnixNSInt = atimeNs;
      }
      
      if (modifyTimeUnixNSInt == null) {
        modifyTimeUnixNSInt = mtimeNs;
      }
      
      await lutimes(
        filePath,
        unixNSIntToUnixSecString(accessTimeUnixNSInt),
        unixNSIntToUnixSecString(modifyTimeUnixNSInt)
      );
    }
    
    let environmentVars = {};
    
    const commandString =
      '$ErrorActionPreference = "Stop"\n' +
      fileTimeEntriesRegular
        .map(({
          filePath,
          accessTimeUnixNSInt = null,
          modifyTimeUnixNSInt = null,
          createTimeUnixNSInt = null,
        }, i) => {
          if (accessTimeUnixNSInt == null && modifyTimeUnixNSInt == null && createTimeUnixNSInt == null) {
            return null;
          } else {
            environmentVars[`C284_${i}_F`] = filePath;
            if (createTimeUnixNSInt != null) environmentVars[`C284_${i}_C`] = unixNSIntToUTCTimeString(createTimeUnixNSInt);
            if (modifyTimeUnixNSInt != null) environmentVars[`C284_${i}_M`] = unixNSIntToUTCTimeString(modifyTimeUnixNSInt);
            if (accessTimeUnixNSInt != null) environmentVars[`C284_${i}_A`] = unixNSIntToUTCTimeString(accessTimeUnixNSInt);
            
            return [
              `$file = Get-Item $Env:C284_${i}_F`,
              createTimeUnixNSInt != null ? `$file.CreationTime = Get-Date $Env:C284_${i}_C` : '',
              modifyTimeUnixNSInt != null ? `$file.LastWriteTime = Get-Date $Env:C284_${i}_M` : '',
              accessTimeUnixNSInt != null ? `$file.LastAccessTime = Get-Date $Env:C284_${i}_A` : '',
            ].join('\n');
          }
        })
        .filter(fileSetCode => fileSetCode != null)
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
          accessTimeUnixNSInt = null,
          modifyTimeUnixNSInt = null,
        }, i) => {
          if (accessTimeUnixNSInt == null && modifyTimeUnixNSInt == null) {
            return null;
          } else {
            environmentVars[`C284_${i}_F`] = filePath;
            if (modifyTimeUnixNSInt != null) environmentVars[`C284_${i}_M`] = unixNSIntToUTCTimeString(modifyTimeUnixNSInt);
            if (accessTimeUnixNSInt != null) environmentVars[`C284_${i}_A`] = unixNSIntToUTCTimeString(accessTimeUnixNSInt);
            
            return [
              modifyTimeUnixNSInt != null ? `touch -m -d $C284_${i}_M $C284_${i}_F` : '',
              accessTimeUnixNSInt != null ? `touch -a -d $C284_${i}_A $C284_${i}_F` : '',
            ].join('\n');
          }
        })
        .filter(fileSetCode => fileSetCode != null)
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
  if (typeof filePath != 'string') {
    throw new Error(`filePath not string: ${filePath}`);
  }
  
  const currentPerms = (await lstat(filePath)).mode & 0o777;
  const newPerms = currentPerms & 0o555;
  
  if (currentPerms != newPerms) {
    // it would seem that lchmod should be used here, but chmod does not
    // follow symlinks anyway apparently (at least on windows), and lchmod
    // (non promise ver) is apparently only implemented on macos
    await chmod(filePath, newPerms);
  }
}

export async function unsetReadOnly(filePath) {
  if (typeof filePath != 'string') {
    throw new Error(`filePath not string: ${filePath}`);
  }
  
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
    // it would seem that lchmod should be used here, but chmod does not
    // follow symlinks anyway apparently (at least on windows), and lchmod
    // (non promise ver) is apparently only implemented on macos
    await chmod(filePath, newPerms);
  }
}

export async function isReadOnly(filePath) {
  if (typeof filePath != 'string') {
    throw new Error(`filePath not string: ${filePath}`);
  }
  
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

export function humanReadableSizeString(bytes) {
  if (!Number.isSafeInteger(bytes)) {
    throw new Error(`bytes not integer: ${bytes}`);
  }
  
  if (bytes < 0) {
    return `-${humanReadableSizeString(-bytes)}`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 10) {
    return `${integerToStringWithSeparator(bytes)} bytes`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 20) {
    return `${decimalStringToStringWithSeparator((bytes / 2 ** 10).toFixed(3))} KiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 30) {
    return `${decimalStringToStringWithSeparator((bytes / 2 ** 20).toFixed(3))} MiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 40) {
    return `${decimalStringToStringWithSeparator((bytes / 2 ** 30).toFixed(3))} GiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 50) {
    return `${decimalStringToStringWithSeparator((bytes / 2 ** 40).toFixed(3))} TiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else {
    return `${decimalStringToStringWithSeparator((bytes / 2 ** 50).toFixed(3))} PiB; ${integerToStringWithSeparator(bytes)} bytes`;
  }
}

export function getRelativeStatus(firstPath, secondPath) {
  const pathFromFirstToSecond = relative(firstPath, secondPath);
  
  if (pathFromFirstToSecond == '') {
    return {
      status: RelativeStatus.PATHS_EQUAL,
      pathFromFirstToSecond,
      pathFromSecondToFirst: pathFromFirstToSecond,
    };
  }
  
  const pathFromSecondToFirst = relative(secondPath, firstPath);
  
  if (splitPath(pathFromFirstToSecond).every(pathSegment => pathSegment == '..')) {
    return {
      status: RelativeStatus.FIRST_IS_SUBPATH_OF_SECOND,
      pathFromFirstToSecond,
      pathFromSecondToFirst,
    };
  }
  
  if (splitPath(pathFromSecondToFirst).every(pathSegment => pathSegment == '..')) {
    return {
      status: RelativeStatus.SECOND_IS_SUBPATH_OF_FIRST,
      pathFromFirstToSecond,
      pathFromSecondToFirst,
    };
  }
  
  return {
    status: RelativeStatus.NO_RELATIVE,
    pathFromFirstToSecond,
    pathFromSecondToFirst,
  };
}
