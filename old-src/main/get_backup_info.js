let fs = require('fs');
let path = require('path');

let { _recursiveReaddir } = require('../lib/fs');
let { _getFileMetaPathFromBackup } = require('../lib/fs_meta');

module.exports = async function getBackupInfo() {
  let backupDir;
  let name;
  let backupDirInfo;
  
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
      filesOrphanedCompressedSize = 0,
      filesUndatadNum = 0,
      filesUndatadSize = 0,
      filesUndatadCompressedSize = 0;
    
    for (let orphanedFile of filesOrphaned) {
      let fileHash = orphanedFile.split('/').slice(-1)[0];
      let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, fileHash));
      let fileMeta = JSON.parse((await fs.promises.readFile(fileMetaPath)).toString())[fileHash];
      
      if (fileMeta == null) {
        // level 2 orphaned file that doesnt have metadata entry even; called "undata'd file"
        let fileSize = (await fs.promises.stat(path.join(backupDir, 'files', orphanedFile))).size;
        filesUndatadSize += fileSize;
        filesUndatadCompressedSize += fileSize;
        filesUndatadNum++;
      } else {
        filesOrphanedSize += fileMeta.size;
        if ('compressedSize' in fileMeta) filesOrphanedCompressedSize += fileMeta.compressedSize;
        else filesOrphanedCompressedSize += fileMeta.size;
      }
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
          files: filesOrphaned.length - filesUndatadNum,
          size: filesOrphanedSize,
          compressedSize: filesOrphanedCompressedSize,
        }],
        ['undatad', {
          files: filesUndatadNum,
          size: filesUndatadSize,
          compressedSize: filesUndatadCompressedSize,
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
  } else {}
};
