// whether to check for file equality when hash compares equal
let CHECK_HASH_COLLISION = true;

let fs = require('fs');
let path = require('path');

async function getUserInput() {
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

async function getAllFilesInDir(path, excludeDirs) {
  if (!Array.isArray(excludeDirs)) excludeDirs = [];
  
  var entries = [];
  
  return entries;
}

async function _checkBackupDirIsDir(path) {
  let backupDirStats;
  try {
    backupDirStats = await fs.promises.stat(path);
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
  }
  
  if (backupDirStats == null)
    throw new Error(`Error: ${path} does not exist.`);
  
  if (!backupDirStats.isDirectory())
    throw new Error(`Error: ${path} not a directory.`);
}

async function initBackupDir(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : '.';
  
  if (performChecks) {
    _checkBackupDirIsDir(backupDir);
    
    if ((await fs.promises.readdir(backupDir)).length != 0)
      throw new Error(`Error: ${backupDir} already has files in it.`);
  }
  
  let hash = typeof opts.hash == 'string' ? opts.hash : 'sha384';
  
  let hashSliceLength = typeof opts.hashSliceLength == 'string' ? Number(opts.hashSliceLength) : 2;
  
  if (!Number.isSafeInteger(hashSliceLength) || hashSliceLength <= 0)
    throw new Error(`Error: hash slice length ${hashSliceLength} invalid (must be greater than zero and a safe integer).`);
  
  let hashSlices = typeof opts.hashSlices == 'string' ? Number(opts.hashSlices) : 2;
  
  if (!Number.isSafeInteger(hashSlices) || hashSlices <= 0)
    throw new Error(`Error: hash slices ${hashSlices} invalid (must be greater than zero and a safe integer).`);
  
  await fs.promises.mkdir(path.join(backupDir, 'files'));
  
  await fs.promises.writeFile(path.join(backupDir, 'info.json'), JSON.stringify({
    version: 1,
    hash,
    hashSliceLength,
    hashSlices,
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
      'Usage: node hash_backup.js [command] [arguments]\n' +
      '\n' +
      'Command `init`:\n' +
      '  Usage: node hash_backup.js init <backupDir>\n' +
      '  Initalizes empty hash backup in backup dir.\n' +
      '\n' +
      'Command `delete`:\n' +
      '  Usage: node hash_backup.js delete <backupDir>\n' +
      '  Removes hash backup at backup dir.'
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
        
        if (backupDir == null || backupDir == '') backupDir = '.';
        
        _checkBackupDirIsDir(backupDir);
        
        let backupDirContents = await fs.promises.readdir(backupDir, { withFileTypes: true });
        
        if (backupDirContents.length != 0) {
          console.log(
            `Directory ${backupDir} is not empty, proceed anyway?\n` +
            'WARNING: This will remove all files in the directory!'
          );
          
          let proceed = await getUserInput();
          if (!proceed) {
            console.log('Aborting.');
            return;
          }
          
          console.log(`Deleting files in ${backupDir}.`);
          await deleteBackupDir({ backupDir, _performChecks: false, _backupDirContents: backupDirContents });
          console.log('Delete finished.');
        }
        
        console.log(`Initializing new hash backup in ${backupDir}`);
        await initBackupDir({
          backupDir,
          hash: commandArgs.get('hash'),
          hashSliceLength: commandArgs.get('hash-slice-length'),
          hashSlices: commandArgs.get('hash-slices'),
          _performChecks: false,
        });
        console.log('Finished.');
        break;
      }
      
      case 'delete': {
        let backupDir = commandArgs.get('to');
        
        if (backupDir == null || backupDir == '') backupDir = '.';
        
        _checkBackupDirIsDir(backupDir);
        
        let backupDirContents = await fs.promises.readdir(backupDir, { withFileTypes: true });
        
        if (backupDirContents.length == 0) {
          console.log(`Directory ${backupDir} already empty.`);
          return;
        }
        
        console.log('WARNING: This will remove all files in the directory! Proceed?');
        
        let proceed = await getUserInput();
        if (!proceed) {
          console.log('Aborting.');
          return;
        }
        
        console.log(`Deleting files in ${backupDir}.`);
        await deleteBackupDir({ backupDir, _performChecks: false, _backupDirContents: backupDirContents });
        console.log('Finished.');
        break;
      }
    }
  }
}

module.exports = exports = {
  _checkBackupDirIsDir,
  getUserInput, getAllFilesInDir,
  initBackupDir, deleteBackupDir,
  runIfMain,
};

if (require.main === module) {
  (async () => {
    await runIfMain();
    process.exit();
  })();
}
