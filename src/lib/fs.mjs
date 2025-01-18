import {
  access,
  chmod,
  lstat,
  lutimes,
  open,
  readdir,
  readlink,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  join,
  relative,
  sep,
} from 'node:path';

import { Enum } from './enum.mjs';
import {
  integerToStringWithSeparator,
  numberStringToStringWithSeparator,
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

export async function writeFileReplaceWhenDone(filename, contents, { readonly = false } = {}) {
  const tempNewFilename = filename + TEMP_NEW_FILE_SUFFIX;
  
  await writeFile(tempNewFilename, contents, readonly ? { mode: 0o444 } : {});
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

async function getSymlinkType(symlinkPath) {
  if (process.platform != 'win32') {
    return null;
  }
  
  const windowsifiedSymlinkPath = symlinkPath.split('/').join('\\');
  
  const containingDir = dirname(windowsifiedSymlinkPath);
  
  const commandResult = (await callProcess({
    processName: 'cmd',
    processArguments: ['/c', 'dir', '/al', containingDir],
  })).toString().split(/\r?\n/).join('\n');
  
  let match;
  if ((match = /^ Volume in drive .* is .*\n Volume Serial Number is .*\n\n Directory of .*\n\n((?:\d+-\d{2}-\d{2} {2}\d{2}:\d{2} [AP]M (?: {3}<SYMLINK> {5}| {3}<(?:SYMLINKD|JUNCTION)> {4}| {3}<DIR> {9}|[ 0-9,]{17}) .*\n)*(?:\d+-\d{2}-\d{2} {2}\d{2}:\d{2} [AP]M (?: {3}<SYMLINK> {5}| {3}<(?:SYMLINKD|JUNCTION)> {4}| {3}<DIR> {9}|[ 0-9,]{17}) .*))\n {15}[0-9,]+ File\(s\).*\n {15}[0-9,]+ Dir\(s\).*\n$/.exec(commandResult)) == null) {
    throw new Error(`dir command result invalid: ${JSON.stringify(commandResult)}`);
  }
  
  const dirData = match[1].split('\n');
  
  let symlinksFound = new Map();
  
  for (const dirEntry of dirData) {
    let match2;
    if ((match2 = /^\d+-\d{2}-\d{2} {2}\d{2}:\d{2} [AP]M (?: {3}<(SYMLINK)> {5}| {3}<(?:(SYMLINKD)|(JUNCTION))> {4}| {3}<DIR> {9}|[ 0-9,]{17}) (.*)$/.exec(dirEntry)) == null) {
      throw new Error(`internal regex error: ${JSON.stringify(dirEntry)}`);
    }
    
    let symlinkType;
      
    if (match2[1] != null) {
      symlinkType = 'file';
    } else if (match2[2] != null) {
      symlinkType = 'directory';
    } else if (match2[3] != null) {
      symlinkType = 'junction';
    } else {
      continue;
    }
    
    const symlinkAndPathString = match2[4];
    
    symlinksFound.set(symlinkAndPathString, symlinkType);
  }
  
  const symlinkDestination = await readlink(windowsifiedSymlinkPath);
  
  const symlinkName = basename(windowsifiedSymlinkPath);
  
  const symlinkKeys = [
    `${symlinkName} [${symlinkDestination}]`,
    `${symlinkName} [\\\\?\\${symlinkDestination}]`,
    `${symlinkName} [..]`,
  ];
  
  for (const symlinkKey of symlinkKeys) {
    if (symlinksFound.has(symlinkKey)) {
      return symlinksFound.get(symlinkKey);
    }
  }
  
  throw new Error(`symlink not found by dir command, or could not programmatically find symlink in dir command output: ${symlinkPath}`);
}

async function recursiveReaddirInternal(
  fileOrDirPath,
  {
    excludedFilesOrFolders,
    symlinkMode,
  }
) {
  let selfStats;
  let selfSymlinkType = null;
  
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
      if (selfStats.isSymbolicLink() && process.platform == 'win32') {
        selfSymlinkType = await getSymlinkType(fileOrDirPath);
      }
      break;
    
    default:
      throw new Error(`default case not possible: ${symlinkMode}`);
  }
  
  let result = [
    {
      filePath: fileOrDirPath,
      stats: selfStats,
      ...(
        selfSymlinkType != null ?
          {
            symlinkType: selfSymlinkType,
          } :
          {}
      ),
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
      .map(excludeEntry => splitPath(relative(fileOrDirPath, excludeEntry)));
  
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
    .map(readdirInternalEntry => {
      const { stats } = readdirInternalEntry;
      
      if (!includeDirs && stats.isDirectory()) {
        return null;
      }
      
      if (!entries) {
        return readdirInternalEntry.filePath;
      } else {
        return readdirInternalEntry;
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
            fileTimeEntriesRegular.push({
              ...entry,
              readOnly: await isReadOnly(entry.filePath),
            });
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
    
    // must manually unset files as readonly then set them back afterward because powershell
    // refuses to alter the file times if a file is readonly, even though nodejs fs.utimes
    // can do it fine
    
    for (const { filePath, readOnly } of fileTimeEntriesRegular) {
      if (readOnly) {
        await unsetReadOnly(filePath);
      }
    }
    
    await callProcess({
      processName: 'powershell',
      processArguments: ['-Command', '-'],
      environmentVars,
      stdin: commandString,
    });
    
    for (const { filePath, readOnly } of fileTimeEntriesRegular) {
      if (readOnly) {
        await setReadOnly(filePath);
      }
    }
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
    
    await callProcess({
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
    return `${numberStringToStringWithSeparator((bytes / 2 ** 10).toFixed(3))} KiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 30) {
    return `${numberStringToStringWithSeparator((bytes / 2 ** 20).toFixed(3))} MiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 40) {
    return `${numberStringToStringWithSeparator((bytes / 2 ** 30).toFixed(3))} GiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else if (bytes < HUMAN_READABLE_THRESHOLD * 2 ** 50) {
    return `${numberStringToStringWithSeparator((bytes / 2 ** 40).toFixed(3))} TiB; ${integerToStringWithSeparator(bytes)} bytes`;
  } else {
    return `${numberStringToStringWithSeparator((bytes / 2 ** 50).toFixed(3))} PiB; ${integerToStringWithSeparator(bytes)} bytes`;
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
