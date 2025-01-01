let crypto = require('crypto');
let fs = require('fs');
let path = require('path');

let { _checkPathIsDir,
      _getAllEntriesInDir,
      readLargeFile,
      hashSync } = require('../lib/fs');
let { _getFileFromBackup,
      _getFilePathFromBackup,
      _setFileToBackup } = require('../lib/fs_meta');

module.exports = async function performBackup(opts) {
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
      let fileBytes = await readLargeFile(filePath);
      
      fileHash = hashSync(fileBytes, backupDirInfo.hash);
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
};
