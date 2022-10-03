let fs = require('fs');

let { _checkPathIsDir } = require('../lib/fs');

module.exports = async function initBackupDir(opts) {
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
};
