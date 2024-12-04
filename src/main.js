let fs = require('fs');
let path = require('path');

let { _checkPathIsDir } = require('./lib/fs');
let _getUserInput = require('./lib/input');
let deleteBackupDir = require('./main/delete_backup_dir');
let getBackupInfo = require('./main/get_backup_info');
let initBackupDir = require('./main/init_backup_dir');
let performBackup = require('./main/perform_backup');
let performRestore = require('./main/perform_restore');

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
      '    --symlink-handling <value> (default \'\'): If \'ignore\', symlinks will be ignored. If \'passthrough\', symlinks will be copied over as regular files (and the modtime of the destination file will be used). If \'true\', symlinks will be added to the backup as-is, storing their path.\n' +
      '    --in-memory <value> (default true): Read file into memory and store hash and compressed forms into memory. Minimizes hard drive reads/writes. Turn off for files too large to fit in memory.\n' +
      '\n' +
      'Command `restore`:\n' +
      '  Restores a folder from the hash backup.\n' +
      '  \n' +
      '  Options:\n' +
      '    --from <backupDir> (required): The hash backup folder to use.\n' +
      '    --to <basePath> (required): The directory to restore to.\n' +
      '    --name <name> (required): The name of the backup.\n' +
      '    --symlink-handling <value> (default \'\'): If \'ignore\', symlinks in backup will not be copied. If \'passthrough\', symlinks will be created as regular files, copying in their contents (and the modtime of the destination file will be set). If \'true\', symlinks will be added to the backup as-is, including their path.\n' +
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
            ['undatad', 'UnData\'d'],
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
          verify: commandArgs.get('verify') ? commandArgs.get('verify') == 'true' : null,
          setFileTimes: commandArgs.get('set_file_times') ? commandArgs.get('set_file_times') == 'true' : null,
          _performChecks: false,
        });
        
        console.log('Finished.');
        break;
      }
    }
  }
}

module.exports = exports = {
  _checkPathIsDir,
  _getAllEntriesInDir: require('./lib/fs')._getAllEntriesInDir,
  _getUserInput,
  _recursiveReaddir: require('./lib/fs')._recursiveReaddir,
  _setFileTimes: require('./lib/fs')._setFileTimes,
  _getFileFromBackup: require('./lib/fs_meta')._getFileFromBackup,
  _getFileHashSlices: require('./lib/fs_meta')._getFileHashSlices,
  _getFileMetaPathFromBackup: require('./lib/fs_meta')._getFileMetaPathFromBackup,
  _getFilePathFromBackup: require('./lib/fs_meta')._getFilePathFromBackup,
  _setFileToBackup: require('./lib/fs_meta')._setFileToBackup,
  _nsTimeToString: require('./lib/misc')._nsTimeToString,
  _stringToNsTime: require('./lib/misc')._stringToNsTime,
  _stringToUTCTimeString: require('./lib/misc')._stringToUTCTimeString,
  _procPromisify: require('./lib/process'),
  deleteBackupDir,
  getBackupInfo,
  initBackupDir,
  performBackup,
  performRestore,
  runIfMain,
};

if (require.main === module) {
  (async () => {
    await runIfMain();
    process.exit();
  })();
}
