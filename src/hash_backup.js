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
  
  let choice;
  do {
    process.stdout.write(prompt);
    choice = choices.get(await new Promise(r => {
      process.stdin.once('data', c => r(c.toString().trim()));
    }));
  } while (choice == null);
  
  return choice;
}

async function _recursiveReaddir(basePath, excludeDirs) {
  if (!Array.isArray(excludeDirs)) excludeDirs = [];
  
  let currentExcludeDirs = excludeDirs.filter(x => !x.includes('/'));
  
  let contents = (await fs.promises.readdir(basePath, { withFileTypes: true }))
    .filter(x => !currentExcludeDirs.includes(x.name));
  
  var folders = [], files = [];
  
  contents.forEach(x => x.isDirectory() ? folders.push(x) : files.push(x));
  
  return [
    '.',
    ...(await Promise.all(folders.map(async x =>
      (await _recursiveReaddir(
        basePath + '/' + x.name,
        excludeDirs
          .filter(x => x.startsWith(x))
          .map(x => x.split('/').slice(1).join('/'))
      ))
      .map(y => (x.name + '/' + y).replace(/\/\.$/, ''))
    )))
    .reduce((a, c) => (a.push(...c), a), []),
    ...files.map(x => x.name)
  ];
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

async function _getAllEntriesInDir(basePath, excludeDirs) {
  return await Promise.all(
    (await _recursiveReaddir(basePath, excludeDirs))
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
    
    _checkPathIsDir(backupDir);
    
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
    version: 1,
    hash,
    hashSliceLength,
    hashSlices,
    compression: compressAlgo ? {
      algorithm: compressAlgo,
      level: compressLevel,
    } : null,
  }, null, 2));
}

async function deleteBackupDir(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : null;
  
  if (performChecks) {
    if (backupDir == null) throw new Error('Error: backup dir must be specified.');
    
    _checkPathIsDir(backupDir);
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
    
    if (storeBytes.length > fileBytes.length) {
      console.debug(`Not compressed with ${backupDirInfo.compression.algorithm} as file increases in size from ${fileBytes.length} to ${storeBytes.length} bytes`);
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
      ...(resultAlgo ? { compressedSize: storeBytes.length } : {}),
      compression: resultAlgo,
    }
  ]);
  
  fileMetaJSON.sort((a, b) => a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0);
  
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, storeBytes);
  
  await fs.promises.mkdir(path.dirname(fileMetaPath), { recursive: true });
  await fs.promises.writeFile(fileMetaPath + '_new', JSON.stringify(Object.fromEntries(fileMetaJSON), null, 2));
  await fs.promises.rename(fileMetaPath + '_new', fileMetaPath);
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
    
    _checkPathIsDir(basePath);
    _checkPathIsDir(backupDir);
  }
  
  let backupDirInfo = JSON.parse(await fs.promises.readFile(path.join(backupDir, 'info.json')));
  
  if (backupDirInfo.folderType != 'coolguy284/node-hash-backup')
    throw new Error('Error: backup dir is not a hash backup dir.');
  
  if (!Number.isSafeInteger(backupDirInfo.version))
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (not an integer).`);
  
  if (backupDirInfo.version < 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} invalid (must be at least 1)`);
  
  if (backupDirInfo.version > 1)
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
    
    _checkPathIsDir(backupDir);
    _checkPathIsDir(basePath);
    
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
  
  if (backupDirInfo.version > 1)
    throw new Error(`Error: hash backup version ${backupDirInfo.version} is for a later version of this program.`);
  
  let backupPath = path.join(backupDir, 'backups', name + '.json');
  
  let backupJSON;
  try {
    backupJSON = JSON.parse((await fs.promises.readFile(backupPath)).toString());
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
    throw new Error(`Error: backup name "${name}" does not exist.`);
  }
  
  let backupDirRelBase = path.relative(basePath, backupDir);
  
  if (backupDirRelBase == '')
    throw new Error('Error: backup and base dirs are the same');
  
  for (let entry of backupJSON.entries) {
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
  
  for (let entry of backupJSON.entries) {
    console.log(`Setting timestamps of "${entry.path}"`);
    
    let filePath = path.join(basePath, entry.path);
    
    await fs.promises.utimes(filePath, entry.atime, entry.mtime);
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
        console.log(basePath, basePathContents);
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
  _getUserInput, _recursiveReaddir, _getAllEntriesInDir, _checkPathIsDir,
  _nsTimeToString, _stringToNsTime,
  initBackupDir, deleteBackupDir,
  runIfMain,
};

if (require.main === module) {
  (async () => {
    await runIfMain();
    //console.log(await _getAllEntriesInDir('.', ['.git']));
    //console.log(await _getAllEntriesInDir('./lebackup'));
    process.exit();
  })();
}
