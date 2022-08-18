let fs = require('fs');
let path = require('path');

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
          name: x,
          type: entryType,
          atime: _nsTimeToString(stat.atimeNs),
          mtime: _nsTimeToString(stat.mtimeNs),
          ctime: _nsTimeToString(stat.ctimeNs),
          birthtime: _nsTimeToString(stat.birthtimeNs),
        };
      })
  );
}

async function _checkBackupDirIsDir(basePath) {
  let backupDirStats;
  try {
    backupDirStats = await fs.promises.stat(basePath);
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
  }
  
  if (backupDirStats == null)
    throw new Error(`Error: ${basePath} does not exist.`);
  
  if (!backupDirStats.isDirectory())
    throw new Error(`Error: ${basePath} not a directory.`);
}

async function initBackupDir(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : '.';
  
  if (performChecks) {
    _checkBackupDirIsDir(backupDir);
    
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
    version: 1,
    hash,
    hashSliceLength,
    hashSlices,
    compressAlgo,
    compressLevel,
  }, null, 2));
}

async function deleteBackupDir(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : '.';
  
  if (performChecks)
    _checkBackupDirIsDir(backupDir);
  
  let backupDirContents = Array.isArray(opts._backupDirContents) ?
    opts._backupDirContents :
    await fs.promises.readdir(backupDir, { withFileTypes: true });
  
  for (let backupDirContent of backupDirContents)
    await fs.promises.rm(path.join(backupDir, backupDirContent.name), { recursive: true });
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
      '    --hash <algorythm> (default `sha384`): The hash algorythm to use on the files.\n' +
      '    --hash-slice-length (default `2`): The length of the hash slice used to split files into folders.\n' +
      '    --hash-slices (default `2`): The number of nested subfolders of hash slices each file should be under.\n' +
      '    --compress-algo (default `brotli`): The algorythm to compress files (`none` for no algo).\n' +
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
      '    --check-duplicate-hash (default true): If true, check for whether files are truly equal if their hashes are (false not implemented yet, true will error if hashes match as duplicate hash handling not implemented yet).\n' +
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
        
        _checkBackupDirIsDir(backupDir);
        
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
        
        _checkBackupDirIsDir(backupDir);
        
        let backupDirContents = await fs.promises.readdir(backupDir, { withFileTypes: true });
        
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
    }
  }
}

module.exports = exports = {
  _getUserInput, _recursiveReaddir, _getAllEntriesInDir, _checkBackupDirIsDir,
  _nsTimeToString, _stringToNsTime,
  initBackupDir, deleteBackupDir,
  runIfMain,
};

if (require.main === module) {
  (async () => {
    await runIfMain();
    process.exit();
  })();
}
