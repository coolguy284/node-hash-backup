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
      '  Initalizes empty hash backup in backup dir\n' +
      '\n' +
      'Command `delete`:\n' +
      '  Usage: node hash_backup.js delete <backupDir>\n' +
      '  Removes hash backup at backup dir'
    );
  } else {
    let commandArgs = argvSliced.slice(1);
    
    switch (argvSliced[0]) {
      case 'init': {
        let backupDir = commandArgs[0];
        
        if (backupDir == null || backupDir == '') backupDir = '.';
        
        let backupDirStats;
        try {
          backupDirStats = await fs.promises.stat(backupDir);
        } catch (e) {
          if (e.code != 'ENOENT') throw e;
        }
        
        if (backupDirStats == null) {
          console.log(`Error: ${backupDir} does not exist.`);
          return;
        }
        
        if (!backupDirStats.isDirectory()) {
          console.log(`Error: ${backupDir} not a directory.`);
          return;
        }
        
        let backupDirContents = await fs.promises.readdir(backupDir, { withFileTypes: true });
        
        if (backupDirContents.length != 0) {
          console.log(
            `Directory ${backupDir} is not empty, proceed anyway?\n` +
            'WARNING: This will remove all files in the directory!'
          );
          let proceed = await getUserInput();
          if (!proceed) return;
          
          for (let backupDirContent of backupDirContents)
            await fs.promises.rm(path.join(backupDir, backupDirContent.name), { recursive: true });
        }
        
        await fs.promises.mkdir(path.join(backupDir, 'files'));
        break;
      }
      
      case 'delete':
        break;
    }
  }
}

module.exports = exports = {
  runIfMain,
};

if (require.main === module) {
  (async () => {
    await runIfMain();
    process.exit();
  })();
}
