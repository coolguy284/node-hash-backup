let fs = require('fs');
let path = require('path');

let { _checkPathIsDir } = require('../lib/fs');

module.exports = async function deleteBackupDir(opts) {
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
};
