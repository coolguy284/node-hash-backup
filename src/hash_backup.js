let cp = require('child_process');
let crypto = require('crypto');
let fs = require('fs');
let path = require('path');
let zlib = require('zlib');

async function _getUserInput() {
  let prompt = 'Choice (y/n, default n): ';
  let choices = new Map([
    ['y', true],
    ['n', false],
  ]);
  
  process.stdout.write(prompt);
  let choice = choices.get(await new Promise(r => {
    process.stdin.once('data', c => r(c.toString().trim()));
  }));
  
  return choice == null ? choices.get('n') : choice;
}

async function _recursiveReaddir(basePath, excludedDirs, includeDirs) {
  if (!Array.isArray(excludedDirs)) excludedDirs = [];
  
  let currentExcludeDirs = excludedDirs.filter(x => !x.includes('/'));
  
  let contents = (await fs.promises.readdir(basePath, { withFileTypes: true }))
    .filter(x => !currentExcludeDirs.includes(x.name));
  
  var folders = [], files = [];
  
  contents.forEach(x => x.isDirectory() ? folders.push(x) : files.push(x));
  
  if (includeDirs) {
    return [
      '.',
      ...(await Promise.all(folders.map(async x =>
        (await _recursiveReaddir(
          basePath + '/' + x.name,
          excludedDirs
            .filter(x => x.startsWith(x))
            .map(x => x.split('/').slice(1).join('/')),
          includeDirs
        ))
        .map(y => (x.name + '/' + y).replace(/\/\.$/, ''))
      )))
      .reduce((a, c) => (a.push(...c), a), []),
      ...files.map(x => x.name),
    ];
  } else {
    return [
      ...(await Promise.all(folders.map(async x =>
        (await _recursiveReaddir(
          basePath + '/' + x.name,
          excludedDirs
            .filter(x => x.startsWith(x))
            .map(x => x.split('/').slice(1).join('/')),
          includeDirs
        ))
        .map(y => (x.name + '/' + y))
      )))
      .reduce((a, c) => (a.push(...c), a), []),
      ...files.map(x => x.name),
    ];
  }
}

function _nsTimeToString(nstime) {
  let string = nstime.toString().padStart(10, '0');
  return string.slice(0, string.length - 9) + '.' + string.slice(string.length - 9);
}

function _stringToNsTime(string) {
  let split = string.split('.');
  if (split.length == 1) split = [ split, '0' ];
  return BigInt(split[0]) * 1000000000n + BigInt(split[1].slice(0, 9).padEnd(9, '0'));
}

async function _getAllEntriesInDir(basePath, excludedDirs) {
  return await Promise.all(
    (await _recursiveReaddir(basePath, excludedDirs, true))
      .map(async x => {
        let stat = await fs.promises.stat(path.join(basePath, x), { bigint: true });
        
        let entryType;
        if (stat.isDirectory()) entryType = 'directory';
        else if (stat.isFile()) entryType = 'file';
        else throw new Error(`Invalid entry type for ${basePath}/${x}: ${(stat.isBlockDevice() ? 'Block Device' : stat.isCharacterDevice() ? 'Character Device' : stat.isFIFO() ? 'FIFO' : stat.isSocket() ? 'Socket' : stat.isSymbolicLink() ? 'Symbolic Link' : stat.mode)}`);
        
        return {
          path: x,
          type: entryType,
          atime: _nsTimeToString(stat.atimeNs),
          mtime: _nsTimeToString(stat.mtimeNs),
          ctime: _nsTimeToString(stat.ctimeNs),
          birthtime: _nsTimeToString(stat.birthtimeNs),
        };
      })
  );
}

async function _checkPathIsDir(basePath) {
  let pathStats;
  try {
    pathStats = await fs.promises.stat(basePath);
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
  }
  
  if (pathStats == null)
    throw new Error(`Error: ${basePath} does not exist.`);
  
  if (!pathStats.isDirectory())
    throw new Error(`Error: ${basePath} not a directory.`);
}

async function initBackupDir(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : null;
  
  if (performChecks) {
    if (backupDir == null) throw new Error('Error: backup dir must be specified.');
    
    await _checkPathIsDir(backupDir);
    
    if ((await fs.promises.readdir(backupDir)).length != 0)
      throw new Error(`Error: "${backupDir}" already has files in it.`);
  }
  
  let hash = typeof opts.hash == 'string' ? opts.hash : 'sha384';
  
  let hashSliceLength = typeof opts.hashSliceLength == 'string' ? Number(opts.hashSliceLength) : 2;
  
  if (!Number.isSafeInteger(hashSliceLength) || hashSliceLength <= 0)
    throw new Error(`Error: hash slice length ${hashSliceLength} invalid (must be greater than zero and a safe integer).`);
  
  let hashSlices = typeof opts.hashSlices == 'string' ? Number(opts.hashSlices) : 2;
  
  if (!Number.isSafeInteger(hashSlices) || hashSlices < 0)
    throw new Error(`Error: hash slices ${hashSlices} invalid (must be nonnegative and a safe integer).`);
  
  let compressAlgo = typeof opts.compressAlgo == 'string' ? (opts.compressAlgo == 'none' ? null : opts.compressAlgo) : 'brotli';
  
  let compressLevel;
  if (compressAlgo == null) {
    compressLevel = null;
  } else {
    compressLevel = typeof opts.compressLevel == 'string' ? Number(opts.compressLevel) : 6;
    
    if (!Number.isSafeInteger(compressLevel) || compressLevel < 0)
      throw new Error(`Error: compression level ${compressLevel} invalid (must be nonnegative and a safe integer).`);
  }
  
  await fs.promises.mkdir(path.join(backupDir, 'files'));
  
  await fs.promises.mkdir(path.join(backupDir, 'files_meta'));
  
  await fs.promises.mkdir(path.join(backupDir, 'backups'));
  
  await fs.promises.writeFile(path.join(backupDir, 'info.json'), JSON.stringify({
    folderType: 'coolguy284/node-hash-backup',
    version: 2,
    hash,
    hashSliceLength,
    hashSlices,
    ...(compressAlgo ? {
      compression: {
        algorithm: compressAlgo,
        level: compressLevel,
      },
    } : {}),
  }, null, 2));
}

async function deleteBackupDir(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : null;
  
  if (performChecks) {
    if (backupDir == null) throw new Error('Error: backup dir must be specified.');
    
    await _checkPathIsDir(backupDir);
  }
  
  let backupDirContents = Array.isArray(opts._backupDirContents) ?
    opts._backupDirContents :
    await fs.promises.readdir(backupDir);
  
  for (let backupDirContent of backupDirContents)
    await fs.promises.rm(path.join(backupDir, backupDirContent), { recursive: true });
}

function _getFileHashSlices(fileHash, hashSlices, hashSliceLength) {
  let slices = [];
  
  for (let i = 0; i < hashSlices; i++)
    slices.push(fileHash.slice(i * hashSliceLength, (i + 1) * hashSliceLength));
  
  return slices;
}

function _getFilePathFromBackup(backupDirInfo, fileHash, slices) {
  if (!Array.isArray(slices))
    slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  
  return path.join('files', ...slices, fileHash);
}

function _getFileMetaPathFromBackup(backupDirInfo, fileHash, slices) {
  if (!Array.isArray(slices))
    slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  
  return path.join('files_meta', ...slices.slice(0, -1), slices[slices.length - 1] + '.json');
}

async function _getFileFromBackup(backupDir, backupDirInfo, fileHash) {
  let slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  let filePath = path.join(backupDir, _getFilePathFromBackup(backupDirInfo, fileHash, slices));
  let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, fileHash, slices));
  
  let fileMetaJSON;
  try {
    fileMetaJSON = JSON.parse((await fs.promises.readFile(fileMetaPath)).toString());
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
    return null;
  }
  
  let fileMeta = fileMetaJSON[fileHash];
  
  if (fileMeta == null) return null;
  
  let processedFileBytes = await fs.promises.readFile(filePath);
  
  if (fileMeta.compression) {
    let fileBytes;
    switch (fileMeta.compression.algorithm) {
      case 'deflate':
        fileBytes = await new Promise((r, j) => {
          zlib.inflate(
            processedFileBytes,
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'gzip':
        fileBytes = await new Promise((r, j) => {
          zlib.gunzip(
            processedFileBytes,
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'brotli':
        fileBytes = await new Promise((r, j) => {
          zlib.brotliDecompress(
            processedFileBytes,
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      default:
        throw new Error(`Error: invalid compression algorithm ${backupDirInfo.compression.algorithm}`);
    }
    return fileBytes;
  } else {
    return processedFileBytes;
  }
}

async function _setFileToBackup(backupDir, backupDirInfo, fileHash, fileBytes) {
  let slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  let filePath = path.join(backupDir, _getFilePathFromBackup(backupDirInfo, fileHash, slices));
  let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, fileHash, slices));
  
  let fileMetaJSON;
  try {
    fileMetaJSON = Object.entries(JSON.parse((await fs.promises.readFile(fileMetaPath)).toString()));
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
    fileMetaJSON = [];
  }
  
  let storeBytes, resultAlgo;
  if (backupDirInfo.compression) {
    switch (backupDirInfo.compression.algorithm) {
      case 'deflate':
        storeBytes = await new Promise((r, j) => {
          zlib.deflate(
            fileBytes,
            { level: backupDirInfo.compression.level },
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'gzip':
        storeBytes = await new Promise((r, j) => {
          zlib.gzip(
            fileBytes,
            { level: backupDirInfo.compression.level },
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'brotli':
        storeBytes = await new Promise((r, j) => {
          zlib.brotliCompress(
            fileBytes,
            { level: backupDirInfo.compression.level },
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      default:
        throw new Error(`Error: invalid compression algorithm ${backupDirInfo.compression.algorithm}`);
    }
    
    if (storeBytes.length >= fileBytes.length) {
      console.debug(`Not compressed with ${backupDirInfo.compression.algorithm} as file increases or stays the same size from ${fileBytes.length} to ${storeBytes.length} bytes`);
      storeBytes = fileBytes;
      resultAlgo = null;
    } else {
      console.debug(`Compressed with ${backupDirInfo.compression.algorithm} from ${fileBytes.length} to ${storeBytes.length} bytes`);
      resultAlgo = { algorithm: backupDirInfo.compression.algorithm };
    }
  } else {
    console.debug(`File size ${fileBytes.length}.`);
    storeBytes = fileBytes;
  }
  
  fileMetaJSON.push([
    fileHash,
    {
      size: fileBytes.length,
      ...(resultAlgo ? {
        compressedSize: storeBytes.length,
        compression: resultAlgo,
      } : {}),
    }
  ]);
  
  fileMetaJSON.sort((a, b) => a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0);
  
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, storeBytes);
  
  await fs.promises.mkdir(path.dirname(fileMetaPath), { recursive: true });
  await fs.promises.writeFile(fileMetaPath + '_new', JSON.stringify(Object.fromEntries(fileMetaJSON), null, 2));
  await fs.promises.rename(fileMetaPath + '_new', fileMetaPath);
}

function _procPromisify(procName, args, envVars, stdin) {
  let proc = cp.spawn(procName, args, { stdio: 'pipe', timeout: 60000, ...(envVars != null ? { env: envVars } : {}) });
  
  if (stdin != null) proc.stdin.end(stdin);
  
  return new Promise((resolve, reject) => {
    let outputBufs = [], errorBufs = [];
    
    proc.stdout.on('data', c => outputBufs.push(c));
    proc.stderr.on('data', c => errorBufs.push(c));
    
    proc.on('close', code => {
      switch (code) {
        case 0:
          resolve(Buffer.concat(outputBufs).toString().trim());
          break;
        
        default:
          reject(new Error(Buffer.concat(errorBufs).toString().trim()));
          break;
      }
    });
  });
}

function _stringToUTCTimeString(string) {
  let split = string.split('.');
  return new Date(Number(split[0]) * 1000).toISOString().split('.')[0] + '.' + split[1] + 'Z';
}

async function _setFileTimes(fileTimesArr) {
  if (process.platform == 'win32') {
    let envVars = {};
    
    let commandString =
      '$ErrorActionPreference = "Stop"\n' +
      fileTimesArr.map((x, i) => {
        let [ filePath, atime, mtime, birthtime ] = x;
        
        let atimeUTC = _stringToUTCTimeString(atime),
          mtimeUTC = _stringToUTCTimeString(mtime),
          birthtimeUTC = _stringToUTCTimeString(birthtime);
        
        envVars['C284_' + i + 'F'] = filePath;
        envVars['C284_' + i + 'C'] = birthtimeUTC;
        envVars['C284_' + i + 'M'] = mtimeUTC;
        envVars['C284_' + i + 'A'] = atimeUTC;
        
        return `$file = Get-Item $Env:C284_${i}F\n` +
          `$file.CreationTime = Get-Date $Env:C284_${i}C\n` +
          `$file.LastWriteTime = Get-Date $Env:C284_${i}M\n` +
          `$file.LastAccessTime = Get-Date $Env:C284_${i}A`;
      }).join('\n');
    
    return await _procPromisify('powershell', ['-Command', '-'], envVars, commandString);
  } else {
    let commandString =
      'set -e\n' +
      fileTimesArr.map(x => {
        let [ filePath, atime, mtime, birthtime ] = x;
        
        let atimeUTC = _stringToUTCTimeString(atime),
          mtimeUTC = _stringToUTCTimeString(mtime);
        
        envVars['C284_' + i + 'F'] = filePath;
        envVars['C284_' + i + 'M'] = mtimeUTC;
        envVars['C284_' + i + 'A'] = atimeUTC;
        
        return `touch -m -d $C284_${i}M $C284_${i}F\n` +
          `touch -a -d $C284_${i}A $C284_${i}F`;
      }).join('\n');
    
    return await _procPromisify('bash', ['-'], envVars, commandString);
  }
}

async function getBackupInfo(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : null;
  let name = typeof opts.name == 'string' && opts.name != '' ? opts.name : null;
  
  if (performChecks) {
    if (backupDir == null) throw new Error('Error: backup dir must be specified.');
    
    await _checkPathIsDir(backupDir);
  }
  
  let backupDirInfo = JSON.parse(await fs.promises.readFile(path.join(backupDir, 'info.json')));
  
  if (backupDirInfo.folderType != 'coolguy284/node-hash-backup')
    throw new Error('Error: backup dir is not a hash backup dir.');
  
  if (!Number.isSafeInteger(backupDirInfo.version))
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (not an integer).`);
  
  if (backupDirInfo.version < 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (must be at least 1)`);
  
  if (backupDirInfo.version == 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} is for an earlier version of this program.`);
  
  if (backupDirInfo.version > 2)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} is for a later version of this program.`);
  
  if (name == null) {
    let backups = await fs.promises.readdir(path.join(backupDir, 'backups')), backupsSize = 0;
    
    let backupsParsed = [];
    
    let filesTotal = 0, foldersTotal = 0, itemsTotal = 0, sizeTotal = 0, compressedSizeTotal = 0;
    let fileHashes = new Set(),
      filesReal = await _recursiveReaddir(path.join(backupDir, 'files'), [], false),
      filesRefdSize = 0,
      filesRefdCompressedSize = 0;
    
    for (let backup of backups) {
      let backupJSONPath = path.join(backupDir, 'backups', backup);
      
      let backupFile = await fs.promises.readFile(backupJSONPath);
      backupsSize += backupFile.length;
      
      let backupObj = JSON.parse(backupFile.toString());
      
      let files = 0, folders = 0, items = 0, size = 0, compressedSize = 0;
      
      for (let entry of backupObj.entries) {
        if (entry.type == 'directory') {
          folders++;
        } else {
          let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, entry.hash));
          let fileMeta = JSON.parse((await fs.promises.readFile(fileMetaPath)).toString())[entry.hash];
          files++;
          size += fileMeta.size;
          if ('compressedSize' in fileMeta) compressedSize += fileMeta.compressedSize;
          else compressedSize += fileMeta.size;
          
          if (!fileHashes.has(entry.hash)) {
            fileHashes.add(entry.hash);
            filesRefdSize += fileMeta.size;
            if ('compressedSize' in fileMeta) filesRefdCompressedSize += fileMeta.compressedSize;
            else filesRefdCompressedSize += fileMeta.size;
          }
        }
        
        items++;
      }
      
      filesTotal += files;
      foldersTotal += folders;
      itemsTotal += items;
      sizeTotal += size;
      compressedSizeTotal += compressedSize;
      
      backupsParsed.push([backup.split('.').slice(0, -1).join('.'), { files, folders, items, size, compressedSize }]);
    }
    
    let filesOrphaned = filesReal.filter(x => !fileHashes.has(x.split('/').slice(-1)[0])),
      filesOrphanedSize = 0,
      filesOrphanedCompressedSize = 0;
    
    for (let orphanedFile of filesOrphaned) {
      let fileHash = orphanedFile.split('/').slice(-1)[0];
      let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, fileHash));
      let fileMeta = JSON.parse((await fs.promises.readFile(fileMetaPath)).toString())[fileHash];
      
      filesOrphanedSize += fileMeta.size;
      if ('compressedSize' in fileMeta) filesOrphanedCompressedSize += fileMeta.compressedSize;
      else filesOrphanedCompressedSize += fileMeta.size;
    }
    
    let fileMeta = await _recursiveReaddir(path.join(backupDir, 'files_meta'), [], false);
    let fileMetaSize = (await Promise.all(
        fileMeta.map(async x => (await fs.promises.stat(path.join(backupDir, 'files_meta', x))).size)
      ))
      .reduce((a, c) => a + c, 0);
    
    return {
      backups: backupsParsed,
      totalSum: {
        files: filesTotal,
        folders: foldersTotal,
        items: itemsTotal,
        size: sizeTotal,
        compressedSize: compressedSizeTotal,
      },
      totalReal: [
        ['refd', {
          files: fileHashes.size,
          size: filesRefdSize,
          compressedSize: filesRefdCompressedSize,
        }],
        ['orphaned', {
          files: filesOrphaned.length,
          size: filesOrphanedSize,
          compressedSize: filesOrphanedCompressedSize,
        }],
        ['total', {
          files: filesReal.length,
          size: filesRefdSize + filesOrphanedSize,
          compressedSize: filesRefdCompressedSize + filesOrphanedCompressedSize,
        }],
        ['filemeta', {
          files: fileMeta.length,
          size: fileMetaSize,
          compressedSize: fileMetaSize,
        }],
        ['backupsmeta', {
          files: backups.length,
          size: backupsSize,
          compressedSize: backupsSize,
        }],
        ['totalmeta', {
          files: fileMeta.length + backups.length,
          size: fileMetaSize + backupsSize,
          compressedSize: fileMetaSize + backupsSize,
        }],
        ['grandtotal', {
          files: filesReal.length + fileMeta.length + backups.length,
          size: filesRefdSize + filesOrphanedSize + fileMetaSize + backupsSize,
          compressedSize: filesRefdCompressedSize + filesOrphanedCompressedSize + fileMetaSize + backupsSize,
        }],
      ],
    };
  } else {
    let backupJSONPath = path.join(backupDir, 'backups', name + '.json');
    
    let backupObj;
    try {
      backupObj = JSON.parse((await fs.promises.readFile(backupJSONPath)).toString());
    } catch (e) {
      if (e.code != 'ENOENT') throw e;
      throw new Error(`Error: backup "${name}" in "${backupDir}" does not exist.`);
    }
    
    let files = 0, folders = 0, items = 0, size = 0, compressedSize = 0;
    
    for (let entry of backupObj.entries) {
      if (entry.type == 'directory') {
        folders++;
      } else {
        let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, entry.hash));
        let fileMeta = JSON.parse((await fs.promises.readFile(fileMetaPath)).toString())[entry.hash];
        files++;
        size += fileMeta.size;
        if ('compressedSize' in fileMeta) compressedSize += fileMeta.compressedSize;
        else compressedSize += fileMeta.size;
      }
      items++;
    }
    
    return { files, folders, items, size, compressedSize };
  }
}

async function performBackup(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let basePath = typeof opts.basePath == 'string' && opts.basePath != '' ? opts.basePath : null;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : null;
  let name = typeof opts.name == 'string' && opts.name != '' ? opts.name : null;
  
  if (performChecks) {
    if (basePath == null) throw new Error('Error: base path must be specified.');
    if (backupDir == null) throw new Error('Error: backup dir must be specified.');
    if (name == null) throw new Error('Error: name must be specified.');
    
    await _checkPathIsDir(basePath);
    await _checkPathIsDir(backupDir);
  }
  
  let backupDirInfo = JSON.parse(await fs.promises.readFile(path.join(backupDir, 'info.json')));
  
  if (backupDirInfo.folderType != 'coolguy284/node-hash-backup')
    throw new Error('Error: backup dir is not a hash backup dir.');
  
  if (!Number.isSafeInteger(backupDirInfo.version))
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (not an integer).`);
  
  if (backupDirInfo.version < 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (must be at least 1)`);
  
  if (backupDirInfo.version == 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} is for an earlier version of this program.`);
  
  if (backupDirInfo.version > 2)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} is for a later version of this program.`);
  
  let backupPath = path.join(backupDir, 'backups', name + '.json');
  try {
    await fs.promises.access(backupPath);
    throw new Error(`Error: backup name "${name}" already exists.`);
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
  }
  
  let backupDirRelBase = path.relative(basePath, backupDir);
  
  if (backupDirRelBase == '')
    throw new Error('Error: backup and base dirs are the same');
  
  let entries = await _getAllEntriesInDir(basePath, backupDirRelBase.startsWith('..' + path.sep) ? [] : [backupDirRelBase]);
  
  let entriesNew = [];
  
  for (let entry of entries) {
    console.log(`Backing up "${entry.path}".`);
    
    let filePath = path.join(basePath, entry.path);
    
    let isDir = (await fs.promises.stat(filePath)).isDirectory();
    
    let fileHash;
    if (!isDir) {
      let fileBytes = await fs.promises.readFile(filePath);
      
      fileHash = crypto.createHash(backupDirInfo.hash).update(fileBytes).digest('hex');
      console.log(`File hash: ${fileHash}`);
      
      let fileFromBackup = await _getFileFromBackup(backupDir, backupDirInfo, fileHash);
      let fileNeedsBackup = true;
      if (fileFromBackup) {
        if (!fileBytes.equals(fileFromBackup))
          throw new Error(`Error: hash collision found between file "${filePath}" and "${_getFilePathFromBackup(backupDirInfo, fileHash)}"`);
        else
          fileNeedsBackup = false;
      }
      
      if (fileNeedsBackup)
        await _setFileToBackup(backupDir, backupDirInfo, fileHash, fileBytes);
      else
        console.log(`File already in hash backup dir.`);
    } else {
      console.log('Is a folder.');
    }
    
    entriesNew.push({
      path: entry.path,
      type: isDir ? 'directory' : 'file',
      ...(isDir ? {} : { hash: fileHash }),
      atime: entry.atime,
      mtime: entry.mtime,
      ctime: entry.ctime,
      birthtime: entry.birthtime,
    });
  }
  
  console.log('Writing backup file.');
  
  await fs.promises.writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    entries: entriesNew,
  }, null, 2));
}

async function performRestore(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : null;
  let basePath = typeof opts.basePath == 'string' && opts.basePath != '' ? opts.basePath : null;
  let name = typeof opts.name == 'string' && opts.name != '' ? opts.name : null;
  
  if (performChecks) {
    if (backupDir == null) throw new Error('Error: backup dir must be specified.');
    if (basePath == null) throw new Error('Error: base path must be specified.');
    if (name == null) throw new Error('Error: name must be specified.');
    
    await _checkPathIsDir(backupDir);
    await _checkPathIsDir(basePath);
    
    if ((await fs.promises.readdir(basePath)).length != 0)
      throw new Error(`Error: "${basePath}" already has files in it.`);
  }
  
  let backupDirInfo = JSON.parse(await fs.promises.readFile(path.join(backupDir, 'info.json')));
  
  if (backupDirInfo.folderType != 'coolguy284/node-hash-backup')
    throw new Error('Error: backup dir is not a hash backup dir.');
  
  if (!Number.isSafeInteger(backupDirInfo.version))
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (not an integer).`);
  
  if (backupDirInfo.version < 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (must be at least 1)`);
  
  if (backupDirInfo.version == 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} is for an earlier version of this program.`);
  
  if (backupDirInfo.version > 2)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} is for a later version of this program.`);
  
  let backupPath = path.join(backupDir, 'backups', name + '.json');
  
  let backupObj;
  try {
    backupObj = JSON.parse((await fs.promises.readFile(backupPath)).toString());
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
    throw new Error(`Error: backup name "${name}" does not exist.`);
  }
  
  let backupDirRelBase = path.relative(basePath, backupDir);
  
  if (backupDirRelBase == '')
    throw new Error('Error: backup and base dirs are the same');
  
  for (let entry of backupObj.entries) {
    console.log(`Restoring "${entry.path}".`);
    
    let filePath = path.join(basePath, entry.path);
    
    if (entry.type == 'directory') {
      if (entry.path != '.') await fs.promises.mkdir(filePath);
    } else {
      let fileBytes = await _getFileFromBackup(backupDir, backupDirInfo, entry.hash);
      let fileHash = crypto.createHash(backupDirInfo.hash).update(fileBytes).digest('hex');
      
      if (fileHash != entry.hash)
        throw new Error(`Error: stored file has hash ${fileHash} but should have ${entry.hash}`);
      
      await fs.promises.writeFile(filePath, fileBytes);
    }
  }
  
  for (let i = 0, lasti; i < backupObj.entries.length; i += 1000) {
    lasti = Math.min(i + 1000, backupObj.entries.length);
    console.log(`Setting timestamps of files: ${lasti}/${backupObj.entries.length} (${(lasti / backupObj.entries.length * 100).toFixed(2)}%)`);
    
    await _setFileTimes(
      backupObj.entries
        .slice(i, lasti)
        .map(entry => [path.join(basePath, entry.path), entry.atime, entry.mtime, entry.birthtime])
    );
  }
}

async function runIfMain() {
  let argvSliced = process.argv.slice(2);
  
  if (argvSliced.length == 0 || argvSliced[0] == '--help') {
    console.log(
      'Node Hash Backup Tool\n' +
      '\n' +
      'Usage: node hash_backup.js [command] [options]\n' +
      '\n' +
      'Command `init`:\n' +
      '  Initalizes empty hash backup in backup dir.\n' +
      '  \n' +
      '  Options:\n' +
      '    --to <backupDir> (required): The hash backup dir to initialize.\n' +
      '    --hash <algorithm> (default `sha384`): The hash algorithm to use on the files.\n' +
      '    --hash-slice-length (default `2`): The length of the hash slice used to split files into folders.\n' +
      '    --hash-slices (default `2`): The number of nested subfolders of hash slices each file should be under.\n' +
      '    --compress-algo (default `brotli`): The algorithm to compress files (`none` for no algo).\n' +
      '    --compress-level (default 6): The amount to compress files (valid is 1 through 9).\n' +
      '\n' +
      'Command `delete`:\n' +
      '  Removes all files at hash backup dir.\n' +
      '  \n' +
      '  Options:\n' +
      '    --to <backupDir> (required): The hash backup dir to remove contents of.\n' +
      '\n' +
      'Command `list`:\n' +
      '  Lists the backups in a given hash backup folder.\n' +
      '  \n' +
      '  Options:\n' +
      '    --to <backupDir> (required): The hash backup folder to use.\n' +
      '    --name <name> (optional): The name of the backup to show information about specifically.\n' +
      '\n' +
      'Command `backup`:\n' +
      '  Backs up a folder to the hash backup.\n' +
      '  \n' +
      '  Options:\n' +
      '    --from <basePath> (required): The directory to backup.\n' +
      '    --to <backupDir> (required): The hash backup folder to use.\n' +
      '    --name <name> (required): The name of the backup.\n' +
      '    --ignore-symlinks <value> (default false): If true, symlinks will be ignored (not implemented yet). If false, symlinks will be copied over as regular files (and the modtime of the destination file will be used).\n' +
      '    --in-memory <value> (default true): Read file into memory and store hash and compressed forms into memory. Minimizes hard drive reads/writes. Turn off for files too large to fit in memory (not implemented yet).\n' +
      '    --check-duplicate-hashes (default true): If true, check for whether files are truly equal if their hashes are (false not implemented yet, true will error if hashes match as duplicate hash handling not implemented yet).\n' +
      '\n' +
      'Command `restore`:\n' +
      '  Restores a folder from the hash backup.\n' +
      '  \n' +
      '  Options:\n' +
      '    --from <backupDir> (required): The hash backup folder to use.\n' +
      '    --to <basePath> (required): The directory to restore to.\n' +
      '    --name <name> (required): The name of the backup.\n' +
      '    --verify <value> (default true): If true, file checksums will be verified as they are copied out.'
    );
  } else {
    let commandArgsRaw = argvSliced.slice(1);
    
    let commandArgs = new Map();
    
    let commandArgName;
    for (let commandArgRaw of commandArgsRaw) {
      if (commandArgRaw.startsWith('--')) {
        commandArgName = commandArgRaw.slice(2);
      } else if (commandArgName) {
        commandArgs.set(commandArgName, commandArgRaw);
      }
    }
    
    switch (argvSliced[0]) {
      case 'init': {
        let backupDir = commandArgs.get('to');
        
        if (backupDir == null || backupDir == '') throw new Error('Error: to dir must be specified.');
        
        _checkPathIsDir(backupDir);
        
        let backupDirContents = await fs.promises.readdir(backupDir, { withFileTypes: true });
        
        if (backupDirContents.length != 0) {
          console.log(
            `Directory "${backupDir}" is not empty, proceed anyway?\n` +
            'WARNING: This will remove all files in the directory!'
          );
          
          let proceed = await _getUserInput();
          if (!proceed) {
            console.log('Aborting.');
            return;
          }
          
          console.log(`Deleting files in "${backupDir}".`);
          
          await deleteBackupDir({ backupDir, _performChecks: false, _backupDirContents: backupDirContents });
          
          console.log('Delete finished.');
        }
        
        console.log(`Initializing new hash backup in "${backupDir}"`);
        
        await initBackupDir({
          backupDir,
          hash: commandArgs.get('hash'),
          hashSliceLength: commandArgs.get('hash-slice-length'),
          hashSlices: commandArgs.get('hash-slices'),
          compressAlgo: commandArgs.get('compress-algo'),
          compressLevel: commandArgs.get('compress-level'),
          _performChecks: false,
        });
        
        console.log('Finished.');
        break;
      }
      
      case 'delete': {
        let backupDir = commandArgs.get('to');
        
        if (backupDir == null || backupDir == '') throw new Error('Error: to dir must be specified.');
        
        _checkPathIsDir(backupDir);
        
        let backupDirContents = await fs.promises.readdir(backupDir);
        
        if (backupDirContents.length == 0) {
          console.log(`Directory "${backupDir}" already empty.`);
          return;
        }
        
        console.log(`WARNING: This will remove all files in "${backupDir}"! Proceed?`);
        
        let proceed = await _getUserInput();
        if (!proceed) {
          console.log('Aborting.');
          return;
        }
        
        console.log(`Deleting files in "${backupDir}".`);
        
        await deleteBackupDir({ backupDir, _performChecks: false, _backupDirContents: backupDirContents });
        
        console.log('Finished.');
        break;
      }
      
      case 'list': {
        let backupDir = commandArgs.get('to');
        
        if (backupDir == null || backupDir == '') throw new Error('Error: to dir must be specified.');
        
        let name = commandArgs.get('name');
        
        _checkPathIsDir(backupDir);
        
        let info = await getBackupInfo({
          backupDir,
          name,
          _performChecks: false,
        });
        
        if (name == null) {
          console.log(`Info for backups in "${backupDir}":`);
          
          let infoEntries = [
            ['Name', { files: 'Files', folders: 'Folders', items: 'Items', size: 'Size (B)', compressedSize: 'Compressed Size (B)' }],
            ...[
              ...info.backups,
              ['Artifical Sum', info.totalSum],
            ]
            .map(x => [
              x[0],
              Object.fromEntries(
                Object.entries(x[1])
                  .map(y => [y[0], y[1].toLocaleString()])
              ),
            ]),
          ];
          
          // by default set to length of table headers for each column
          let nameStrLen = 4, filesStrLen = 5, foldersStrLen = 7, totalStrLen = 5, sizeStrLen = 8, compressedSizeStrLen = 19;
          
          infoEntries.forEach(x => {
            nameStrLen = Math.max(nameStrLen, x[0].length);
            filesStrLen = Math.max(filesStrLen, x[1].files.length);
            foldersStrLen = Math.max(foldersStrLen, x[1].folders.length);
            totalStrLen = Math.max(totalStrLen, x[1].items.length);
            sizeStrLen = Math.max(sizeStrLen, x[1].size.length);
            compressedSizeStrLen = Math.max(compressedSizeStrLen, x[1].compressedSize.length);
          });
          
          console.log(
            infoEntries
              .map(x => `${x[0].padEnd(nameStrLen)}  ${x[1].files.padEnd(filesStrLen)}  ${x[1].folders.padEnd(foldersStrLen)}  ${x[1].items.padEnd(totalStrLen)}  ${x[1].size.padEnd(sizeStrLen)}  ${x[1].compressedSize.padEnd(compressedSizeStrLen)}`)
              .join('\n')
          );
          
          let totalMap = new Map([
            ['status', 'Status'],
            ['refd', 'Referenced'],
            ['orphaned', 'Orphaned'],
            ['total', 'Total'],
            ['filemeta', 'File Meta'],
            ['backupsmeta', 'Backup Meta'],
            ['totalmeta', 'Total Meta'],
            ['grandtotal', 'Grand Total'],
          ]);
          
          let infoTotalEntries = [
            ['status', { files: 'Files', size: 'Size (B)', compressedSize: 'Compressed Size (B)' }],
            ...info.totalReal
            .map(x => [
              x[0],
              Object.fromEntries(
                Object.entries(x[1])
                  .map(y => [y[0], y[1].toLocaleString()])
              ),
            ]),
          ];
          
          // by default set to length of table headers for each column
          let totalNameStrLen = 0, totalFilesStrLen = 0, totalSizeStrLen = 0, totalCompressedSizeStrLen = 0;
          
          infoTotalEntries.forEach(x => {
            totalNameStrLen = Math.max(totalNameStrLen, totalMap.get(x[0]).length);
            totalFilesStrLen = Math.max(totalFilesStrLen, x[1].files.length);
            totalSizeStrLen = Math.max(totalSizeStrLen, x[1].size.length);
            totalCompressedSizeStrLen = Math.max(totalCompressedSizeStrLen, x[1].compressedSize.length);
          });
          
          let infoTotalStrArr = infoTotalEntries.map(x =>
              `${totalMap.get(x[0]).padEnd(totalNameStrLen)}  ${x[1].files.padEnd(totalFilesStrLen)}  ${x[1].size.padEnd(totalSizeStrLen)}  ${x[1].compressedSize.padEnd(totalCompressedSizeStrLen)}`
            );
          
          // adding gaps in totals for clarity
          infoTotalStrArr.splice(4, 0, '');
          infoTotalStrArr.splice(8, 0, '');
          
          console.log(
            '\n' +
            `Totals:\n` +
            infoTotalStrArr.join('\n')
          );
        } else {
          console.log(`Info for backup "${name}" in "${backupDir}":`);
          console.log(`${info.files.toLocaleString()} files, ${info.folders.toLocaleString()} folders, ${info.items.toLocaleString()} items, ${info.size.toLocaleString()} bytes (${info.compressedSize.toLocaleString()} bytes compressed)`);
        }
        break;
      }
      
      case 'backup': {
        let basePath = commandArgs.get('from');
        
        if (basePath == null || basePath == '') throw new Error('Error: from dir must be specified.');
        
        let backupDir = commandArgs.get('to');
        
        if (backupDir == null || backupDir == '') throw new Error('Error: to dir must be specified.');
        
        let name = commandArgs.get('name');
        
        if (name == null) throw new Error('Error: backup name must be specified.');
        
        _checkPathIsDir(basePath);
        _checkPathIsDir(backupDir);
        
        console.log(`Backing up "${basePath}" to "${backupDir}", backup name "${name}".`);
        
        await performBackup({
          basePath,
          backupDir,
          name,
          ignoreSymlinks: commandArgs.get('ignore-symlinks'),
          inMemory: commandArgs.get('in-memory'),
          checkDuplicateHashes: commandArgs.get('check-duplicate-hashes'),
          _performChecks: false,
        });
        
        console.log('Finished.');
        break;
      }
      
      case 'restore': {
        let backupDir = commandArgs.get('from');
        
        if (backupDir == null || backupDir == '') throw new Error('Error: from dir must be specified.');
        
        let basePath = commandArgs.get('to');
        
        if (basePath == null || basePath == '') throw new Error('Error: to dir must be specified.');
        
        let name = commandArgs.get('name');
        
        if (name == null) throw new Error('Error: backup name must be specified.');
        
        _checkPathIsDir(backupDir);
        _checkPathIsDir(basePath);
        
        let basePathContents = await fs.promises.readdir(basePath);
        
        if (basePathContents.length != 0) {
          console.log(
            `Directory "${basePath}" is not empty, proceed anyway?\n` +
            'WARNING: This will remove all files in the directory and replace them with the restore!'
          );
          
          let proceed = await _getUserInput();
          if (!proceed) {
            console.log('Aborting.');
            return;
          }
          
          console.log(`Deleting files in "${basePath}".`);
          
          for (let basePathContent of basePathContents)
            await fs.promises.rm(path.join(basePath, basePathContent), { recursive: true });
          
          console.log('Delete finished.');
        }
        
        console.log(`Restoring backup name "${name}" from "${backupDir}" to "${basePath}".`);
        
        await performRestore({
          backupDir,
          basePath,
          name,
          verify: commandArgs.get('verify'),
          _performChecks: false,
        });
        
        console.log('Finished.');
        break;
      }
    }
  }
}

module.exports = exports = {
  _getUserInput, _recursiveReaddir, _nsTimeToString, _stringToNsTime, _getAllEntriesInDir, _checkPathIsDir,
  _getFileHashSlices, _getFilePathFromBackup, _getFileMetaPathFromBackup, _getFileFromBackup, _setFileToBackup, _procPromisify, _stringToUTCTimeString, _setFileTimes,
  initBackupDir, deleteBackupDir,
  getBackupInfo, performBackup, performRestore,
  runIfMain,
};

if (require.main === module) {
  (async () => {
    await runIfMain();
    process.exit();
  })();
}
