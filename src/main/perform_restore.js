let crypto = require('crypto');
let fs = require('fs');
let path = require('path');

let { _checkPathIsDir,
      _setFileTimes } = require('../lib/fs');
let { _getFileFromBackup } = require('../lib/fs_meta');

module.exports = async function performRestore(opts) {
  if (typeof opts != 'object') opts = {};
  
  let performChecks = typeof opts._performChecks == 'boolean' ? opts._performChecks : true;
  let backupDir = typeof opts.backupDir == 'string' && opts.backupDir != '' ? opts.backupDir : null;
  let basePath = typeof opts.basePath == 'string' && opts.basePath != '' ? opts.basePath : null;
  let name = typeof opts.name == 'string' && opts.name != '' ? opts.name : null;
  let setFileTimes = typeof opts.setFileTimes == 'boolean' ? opts.setFileTimes : true;
  
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
  
  if (setFileTimes) {
    for (let i = 0, lasti; i < backupObj.entries.length; i += 1000) {
      lasti = Math.min(i + 1000, backupObj.entries.length);
      console.log(`Setting timestamps of entries: ${lasti}/${backupObj.entries.length} (${(lasti / backupObj.entries.length * 100).toFixed(2)}%)`);
      
      await _setFileTimes(
        backupObj.entries
          .slice(i, lasti)
          .map(entry => [path.join(basePath, entry.path), entry.atime, entry.mtime, entry.birthtime])
          .reverse()
      );
    }
  }
};
