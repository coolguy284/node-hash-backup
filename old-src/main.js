let getBackupInfo = require('./main/get_backup_info');

async function runIfMain() {
  let argvSliced = process.argv.slice(2);
  
  let commandArgs = new Map();
  
  switch (argvSliced[0]) {
    case 'list': {
      let backupDir = commandArgs.get('to');
      
      if (backupDir == null || backupDir == '') throw new Error('Error: to dir must be specified.');
      
      let name = commandArgs.get('name');
      
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
  }
}
