let fs = require('fs');
let path = require('path');

let { _checkPathIsDir,
      _recursiveReaddir } = require('../lib/fs');
let { _getFileMetaPathFromBackup } = require('../lib/fs_meta');

module.exports = async function getBackupInfo(opts) {
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
};
