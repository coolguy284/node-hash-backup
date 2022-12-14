let TEST_RANDOMNAME = false,
    TEST_GETFILESANDMETADIR = false,
    TEST_DELIBERATEMODIF = false, // mtime change ignored when doing verification after modification since folders will get modified
    VERBOSE_FINAL_VALID_LOG = false;

let fs = require('fs');
let path = require('path');
let os = require('os');
let { formatWithOptions: utilFormatWithOptions } = require('util');

let getBackupInfo = require('../src/main/get_backup_info');
let initBackupDir = require('../src/main/init_backup_dir');
let performBackup = require('../src/main/perform_backup');
let performRestore = require('../src/main/perform_restore');

let getFilesAndMetaInDir = require('./testlib/fs');

let { getRandBytesCopy, getRandInt, getRandIntArray, getRandIntOneChoiceArray } = require('./testlib/rnglib');

let loggingFile;

async function timestampLog(...vals) {
  let str = utilFormatWithOptions(
    {
      depth: Infinity,
      colors: true,
      maxArrayLength: Infinity,
      maxStringLength: Infinity,
      numericSeparator: true,
    },
    `[${new Date().toISOString()}]`,
    ...vals
  );
  console.log(str);
}

let randomNameChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let randomContentChars = 'abcdef0123';

function randomName() {
  let numSections = getRandInt(3) + 1;
  let lenSections = [];
  for (let i = 0; i < numSections; i++) {
    lenSections.push(getRandInt(11) + 5);
  }
  return lenSections.map(x =>
    getRandIntArray(randomNameChars.length, x).map(y => randomNameChars[y]).join('')
  ).join('.');
}

function randomContent(notCompressible) {
  let len = getRandInt(16000);
  if (notCompressible == null) notCompressible = getRandInt(2);
  if (notCompressible) return getRandBytesCopy(len);
  return Buffer.from(getRandIntArray(randomContentChars.length, len).map(x => randomContentChars[x]).join(''));
}

let dirFuncs = {
  manual1: async basePath => {
    await timestampLog(`starting manual1 ${basePath}`);
    
    await fs.promises.mkdir(basePath);
    await Promise.all([
      await fs.promises.mkdir(path.join(basePath, 'folder')),
      await fs.promises.writeFile(path.join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    await fs.promises.writeFile(path.join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder.'));
    
    await timestampLog(`finished manual1 ${basePath}`);
  },
  
  manual2: async basePath => {
    await timestampLog(`starting manual2 ${basePath}`);
    
    await fs.promises.mkdir(basePath);
    await Promise.all([
      await fs.promises.mkdir(path.join(basePath, 'emptyfolder')),
      await fs.promises.writeFile(path.join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    
    await timestampLog(`finished manual2 ${basePath}`);
  },
  
  manual3: async basePath => {
    await timestampLog(`starting manual3 ${basePath}`);
    
    await fs.promises.mkdir(basePath);
    
    await timestampLog(`finished manual3 ${basePath}`);
  },
  
  manual4: async basePath => {
    await timestampLog(`starting manual4 ${basePath}`);
    
    await fs.promises.mkdir(basePath);
    await Promise.all([
      await fs.promises.mkdir(path.join(basePath, 'folder')),
      await fs.promises.writeFile(path.join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    await fs.promises.writeFile(path.join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder updated.'));
    
    await timestampLog(`finished manual4 ${basePath}`);
  },
  
  random1: async basePath => {
    await timestampLog(`starting random1 ${basePath}`);
    
    await fs.promises.mkdir(basePath);
    let fsOps = [];
    for (let i = 0; i < 5; i++) {
      let dirNameJ = randomName();
      fsOps.push((async () => {
        await fs.promises.mkdir(path.join(basePath, dirNameJ));
        let zeroFoldersJ = getRandInt(2);
        let numFoldersJ = zeroFoldersJ ? 0 : getRandInt(5) + 1;
        let zeroFilesJ = getRandInt(2);
        let numFilesJ = zeroFilesJ ? 0 : getRandInt(5) + 1;
        let fsOpsJ = [];
        for (let j = 0; j < numFoldersJ; j++) {
          let dirNameK = randomName();
          fsOpsJ.push((async () => {
            await fs.promises.mkdir(path.join(basePath, dirNameJ, dirNameK));
            let zeroFilesK = getRandInt(2);
            let numFilesK = zeroFilesK ? 0 : getRandInt(5) + 1;
            let fsOpsK = [];
            for (let j = 0; j < numFilesK; j++) {
              fsOpsK.push(fs.promises.writeFile(path.join(basePath, dirNameJ, dirNameK, randomName()), Buffer.from(randomContent())));
            }
          })());
        }
        for (let j = 0; j < numFilesJ; j++) {
          fsOpsJ.push(fs.promises.writeFile(path.join(basePath, dirNameJ, randomName()), Buffer.from(randomContent())));
        }
        await Promise.all(fsOpsJ);
      })());
    }
    for (let i = 0; i < 5; i++) {
      fsOps.push(fs.promises.writeFile(path.join(basePath, randomName()), Buffer.from(randomContent())));
    }
    await Promise.all(fsOps);
    
    await timestampLog(`finished random1 ${basePath}`);
  },
  
  modif: async (basePath) => {
    await timestampLog(`starting modif ${basePath}`);
    
    let dirContents = await fs.promises.readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoices = getRandIntOneChoiceArray(5, 2), folderChoice = getRandInt(5);
    
    await Promise.all([
      fs.promises.writeFile(path.join(basePath, dirContentsFiles[fileChoices[0]]), randomContent()),
      fs.promises.rename(path.join(basePath, dirContentsFiles[fileChoices[1]]), path.join(basePath, randomName())),
      fs.promises.rename(path.join(basePath, dirContentsFolders[folderChoice]), path.join(basePath, randomName())),
    ]);
    
    await timestampLog(`finished modif ${basePath}`);
  },
  
  medModif: async (basePath) => {
    await timestampLog(`starting medmodif ${basePath}`);
    
    let dirContents = await fs.promises.readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = getRandInt(5);
    
    let fileToModif = path.join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await fs.promises.readFile(fileToModif);
    
    fileToModifBuf = Buffer.concat([fileToModifBuf, Buffer.from([getRandInt(256)])]);
    
    await fs.promises.writeFile(fileToModif, fileToModifBuf);
    
    await timestampLog(`finished medmodif ${basePath}`);
  },
  
  mildModif: async (basePath) => {
    await timestampLog(`starting mildmodif ${basePath}`);
    
    let dirContents = await fs.promises.readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = getRandInt(5);
    
    let fileToModif = path.join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await fs.promises.readFile(fileToModif);
    
    if (fileToModifBuf.length == 0) throw new Error('Error: attempt to modify empty file.');
    
    let fileToModifBufIndex = getRandInt(fileToModifBuf.length);
    
    fileToModifBuf[fileToModifBufIndex] = (fileToModifBuf[fileToModifBufIndex] + 127) % 256;
    
    await fs.promises.writeFile(fileToModif, fileToModifBuf);
    
    await timestampLog(`finished mildmodif ${basePath}`);
  },
  
  copyThenModif: async (basePathOrig, basePathCopy) => {
    await timestampLog(`starting copythenmodif ${basePathCopy}`);
    
    await fs.promises.cp(basePathOrig, basePathCopy, { recursive: true });
    await dirFuncs.modif(basePathCopy);
    
    await timestampLog(`finished copythenmodif ${basePathCopy}`);
  },
  
  performBackupWithArgs: async (tmpDir, backupDir, name) => {
    await timestampLog(`starting backup ${name}`);
    
    let returnValue = await performBackup({
      basePath: path.join(tmpDir, 'data', name),
      backupDir,
      name,
    });
    
    await timestampLog(`finished backup ${name}`);
    
    return returnValue;
  },
  
  performRestoreWithArgs: async (tmpDir, backupDir, name) => {
    await timestampLog(`starting restore ${name}`);
    
    let returnValue = await performRestore({
      backupDir,
      basePath: path.join(tmpDir, 'restore', name),
      name,
    });
    
    await timestampLog(`finished restore ${name}`);
    
    return returnValue;
  },
  
  checkRestoreAccuracy: async (tmpDir, name, ignoreMTime) => {
    await timestampLog(`checking validity of restore ${name}`);
    
    let dataObj = await getFilesAndMetaInDir(path.join(tmpDir, 'data', name));
    let restoreObj = await getFilesAndMetaInDir(path.join(tmpDir, 'restore', name));
    
    let valid = true;
    
    if (dataObj.length != restoreObj.length) {
      await timestampLog(`restore length mismatch, data length ${dataObj.length}, restore length ${restoreObj.length}`);
      valid = false;
    }
    
    let stringProps = ['path', 'type', ...(ignoreMTime ? [] : ['mtime']), 'birthtime']; // atime ignored because it changes, ctime ignored because cannot be set
    
    let objLength = Math.min(dataObj.length, restoreObj.length);
    
    for (let i = 0; i < objLength; i++) {
      let dataEntry = dataObj[i], restoreEntry = restoreObj[i];
      
      for (let stringProp of stringProps) {
        if (dataEntry[stringProp] != restoreEntry[stringProp]) {
          await timestampLog(`property mismatch, entry ${i}, property ${stringProp}, data value ${JSON.stringify(dataEntry[stringProp])}, restore value ${JSON.stringify(restoreEntry[stringProp])}`);
          await timestampLog('dataentry\n', dataEntry);
          await timestampLog('restoreentry\n', restoreEntry);
          valid = false;
        }
      }
      
      if (dataEntry.bytes && restoreEntry.bytes) {
        if (dataEntry.bytes.length != restoreEntry.bytes.length) {
          await timestampLog(`file length mismatch, entry ${i}, data length ${dataEntry.bytes.length}, restore length ${restoreEntry.bytes.length}`);
          await timestampLog('dataentry\n', dataEntry);
          await timestampLog('restoreentry\n', restoreEntry);
          await timestampLog('databytestring\n', JSON.stringify(dataEntry.bytes.toString()));
          await timestampLog('restorebytestring\n', JSON.stringify(restoreEntry.bytes.toString()));
          valid = false;
        }
        
        let entryByteLength = Math.min(dataEntry.bytes.length, restoreEntry.bytes.length);
        
        for (let j = 0; j < entryByteLength; j++) {
          if (dataEntry.bytes[j] != restoreEntry.bytes[j]) {
            await timestampLog(`file bytes mismatch, entry ${i}, byte ${j}, data byte ${dataEntry.bytes[j]}, restore byte ${restoreEntry.bytes[j]}`);
            await timestampLog('dataentry\n', dataEntry);
            await timestampLog('restoreentry\n', restoreEntry);
            await timestampLog('databyteslice, 21 bytes, middle is altered byte\n', dataEntry.bytes.slice(Math.max(j - 10, 0), j + 11));
            await timestampLog('restorebyteslice, 21 bytes, middle is altered byte\n', restoreEntry.bytes.slice(Math.max(j - 10, 0), j + 11));
            await timestampLog('databytestring\n', JSON.stringify(dataEntry.bytes.toString()));
            await timestampLog('restorebytestring\n', JSON.stringify(restoreEntry.bytes.toString()));
            valid = false;
            break;
          }
        }
      }
    }
    
    await timestampLog(`validity of restore ${name} ${valid ? 'valid' : 'invalid'}`);
    
    if (valid) {
      let stringifyObj = obj =>
        JSON.stringify(obj.map(x => ({
          path: x.path,
          type: x.type,
          mtime: x.mtime,
          birthtime: x.birthtime,
          bytes: x.bytes ? x.bytes.toString('base64') : null,
        })));
      let dataObjString = stringifyObj(dataObj), restoreObjString = stringifyObj(restoreObj);
      if (dataObjString != restoreObjString) {
        await timestampLog('error in validation logic, restore is not valid');
        await timestampLog('data ' + JSON.stringify(dataObjString));
        await timestampLog('restore ' + JSON.stringify(restoreObjString));
      } else {
        await timestampLog('final stringify check passed');
        if (VERBOSE_FINAL_VALID_LOG) {
          await timestampLog('data ' + JSON.stringify(dataObjString));
          await timestampLog('restore ' + JSON.stringify(restoreObjString));
        }
      }
    }
    
    if (!valid) {
      await timestampLog('data\n', dataObj);
      await timestampLog('restore\n', restoreObj);
    }
  },
};

(async () => {
  // open logging file and redirect stdout and stderr
  loggingFile = await fs.promises.open(path.join(__dirname, `../logs/${new Date().toISOString().replaceAll(':', '-')}.log`), 'a');
  let oldProcStdoutWrite = process.stdout.write.bind(process.stdout),
    oldProcStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = c => { loggingFile.write(c); oldProcStdoutWrite(c) };
  process.stderr.write = c => { loggingFile.write(c); oldProcStderrWrite(c) };
  
  // "test" random name and content functions by printing to console their results 10x
  if (TEST_RANDOMNAME) {
    await timestampLog([
      [randomName(), randomName(), randomName(), randomName(), randomName(), randomName(), randomName(), randomName(), randomName(), randomName()],
      [randomContent(), randomContent(), randomContent(), randomContent(), randomContent(), randomContent(), randomContent(), randomContent(), randomContent(), randomContent()].map(x=>x.toString()),
    ]);
    return;
  }
  
  if (TEST_GETFILESANDMETADIR) {
    await timestampLog(await getFilesAndMetaInDir('src'));
    return;
  }
  
  // make temp dir for tests
  let tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nodehash-'));
  
  try {
    // create filetree
    await Promise.all([
      (async () => {
        await fs.promises.mkdir(path.join(tmpDir, 'data'));
        await Promise.all([
          dirFuncs.manual1(path.join(tmpDir, 'data', 'manual1')),
          dirFuncs.manual2(path.join(tmpDir, 'data', 'manual2')),
          dirFuncs.manual3(path.join(tmpDir, 'data', 'manual3')),
          dirFuncs.manual4(path.join(tmpDir, 'data', 'manual4')),
          (async () => {
            await dirFuncs.random1(path.join(tmpDir, 'data', 'randomconstant'));
            let fsOps = [];
            for (let i = 0; i < 10; i++) {
              fsOps.push(dirFuncs.random1(path.join(tmpDir, 'data', 'random' + i)));
            }
            await Promise.all(fsOps);
            
            let fsOps2 = [];
            for (let i2 = 0; i2 < 10; i2++) {
              fsOps2.push(fs.promises.cp(path.join(tmpDir, 'data', 'randomconstant'), path.join(tmpDir, 'data', 'random' + i2), { recursive: true }));
            }
            await Promise.all(fsOps2);
            
            let fsOps3 = [];
            for (let i3 = 0; i3 < 10; i3++) {
              fsOps3.push(dirFuncs.copyThenModif(path.join(tmpDir, 'data', 'random' + i3), path.join(tmpDir, 'data', 'random' + i3 + '.1')));
            }
            await Promise.all(fsOps3);
          })(),
        ]);
      })(),
      fs.promises.mkdir(path.join(tmpDir, 'backup')),
      (async () => {
        await fs.promises.mkdir(path.join(tmpDir, 'restore'));
        let dirArr = ['manual1', 'manual2', 'manual3', 'manual4'];
        for (let i = 0; i < 10; i++) {
          dirArr.push('random' + i);
          dirArr.push('random' + i + '.1');
        }
        await Promise.all(dirArr.map(x => fs.promises.mkdir(path.join(tmpDir, 'restore', x))));
      })(),
    ]);
    
    let backupDir = path.join(tmpDir, 'backup');
    
    // init backup dir
    await timestampLog('starting initbackupdir');
    await initBackupDir({
      backupDir,
      hash: 'sha384',
      hashSliceLength: 2,
      hashSlices: 2,
      compressAlgo: 'brotli',
      compressLevel: 11,
    });
    await timestampLog('finished initbackupdir');
    
    let printBackupInfo = async () => {
      await timestampLog('starting getbackupinfo');
      await timestampLog(await getBackupInfo({ backupDir }));
      await timestampLog('finished getbackupinfo');
    };
    
    // print empty info
    await printBackupInfo();
    
    let backupOrRestore = async backupOrRestoreFunc => {
      await backupOrRestoreFunc(tmpDir, backupDir, 'manual1');
      await backupOrRestoreFunc(tmpDir, backupDir, 'manual2');
      await backupOrRestoreFunc(tmpDir, backupDir, 'manual3');
      await backupOrRestoreFunc(tmpDir, backupDir, 'manual4');
      for (let i = 0; i < 10; i++) {
        await backupOrRestoreFunc(tmpDir, backupDir, 'random' + i);
        await backupOrRestoreFunc(tmpDir, backupDir, 'random' + i + '.1');
      }
    };
    
    // perform backups
    await backupOrRestore(dirFuncs.performBackupWithArgs);
    
    // print filled info
    await printBackupInfo();
    
    // perform restores
    await backupOrRestore(dirFuncs.performRestoreWithArgs);
    
    // check validity of restores
    await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual1');
    await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual2');
    await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual3');
    await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual4');
    for (let i = 0; i < 10; i++) {
      await dirFuncs.checkRestoreAccuracy(tmpDir, 'random' + i);
      await dirFuncs.checkRestoreAccuracy(tmpDir, 'random' + i + '.1');
    }
    
    // do deliberate modif and check validity again if var set
    if (TEST_DELIBERATEMODIF) {
      await timestampLog('starting deliberate modifs');
      
      await dirFuncs.modif(path.join(tmpDir, 'restore', 'random7.1'));
      await dirFuncs.medModif(path.join(tmpDir, 'restore', 'random8.1'));
      await dirFuncs.mildModif(path.join(tmpDir, 'restore', 'random9.1'));
      
      await timestampLog('finished deliberate modifs');
      
      await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual1', true);
      await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual2', true);
      await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual3', true);
      await dirFuncs.checkRestoreAccuracy(tmpDir, 'manual4', true);
      for (let i = 0; i < 10; i++) {
        await dirFuncs.checkRestoreAccuracy(tmpDir, 'random' + i, true);
        await dirFuncs.checkRestoreAccuracy(tmpDir, 'random' + i + '.1', true);
      }
    }
  } catch (e) {
    await timestampLog(e);
  } finally {
    // after tests finished, close program on pressing enter
    await new Promise(r => process.stdin.once('data', r));
    await fs.promises.rm(tmpDir, { recursive: true });
    process.exit();
  }
})();
