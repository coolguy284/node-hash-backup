import {
  cp,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { formatWithOptions as utilFormatWithOptions } from 'util';

import {
  getBackupInfo,
  initBackupDir,
  performBackup,
  performRestore,
} from '../src/backup_manager/backup_helper_funcs.mjs';

import { getFilesAndMetaInDir } from './lib/fs.mjs'; 
import { AdvancedPrng } from './lib/prng_extended.mjs';

export const DEFAULT_TEST_RANDOM_NAME = false;
export const DEFAULT_TEST_GET_FILES_AND_META_DIR = false;
export const DEFAULT_TEST_DELIBERATE_MODIFICATION = false;
export const DEFAULT_VERBOSE_FINAL_VALIDATION_LOG = false;
export const DEFAULT_DO_NOT_SAVE_LOG_IF_TEST_PASSED = true;

const RANDOM_NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const RANDOM_CONTENT_CHARS = 'abcdef0123';

async function timestampLog(logger, logLines, ...vals) {
  let logLine = utilFormatWithOptions(
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
  
  logger(logLine);
  logLines.push(logLine);
}

function randomName(advancedPrng) {
  let numSections = advancedPrng.getRandomInteger(3) + 1;
  
  let sectionLengths = [];
  
  for (let i = 0; i < numSections; i++) {
    sectionLengths.push(advancedPrng.getRandomInteger(11) + 5);
  }
  
  return sectionLengths
    .map(sectionLength =>
      advancedPrng
        .getRandomIntegerArray(RANDOM_NAME_CHARS.length, sectionLength)
        .map(charIndex => RANDOM_NAME_CHARS[charIndex])
        .join('')
    ).join('.');
}

function randomContent(advancedPrng, notCompressible = null) {
  let length = advancedPrng.getRandomInteger(16000);
  
  if (notCompressible == null) {
    notCompressible = advancedPrng.getRandomInteger(2);
  }
  
  if (notCompressible) {
    return advancedPrng.getRandomBytesCopy(length);
  } else {
    return Buffer.from(
      advancedPrng
        .getRandomIntegerArray(RANDOM_CONTENT_CHARS.length, length)
        .map(charIndex => RANDOM_CONTENT_CHARS[charIndex])
        .join('')
    );
  }
}

const DirectoryCreationFuncs = {
  manual1: async (logger, logLines, basePath) => {
    await timestampLog(logger, logLines, `starting manual1 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      await mkdir(join(basePath, 'folder')),
      await writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    await writeFile(join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder.'));
    
    await timestampLog(logger, logLines, `finished manual1 ${basePath}`);
  },
  
  manual2: async (logger, logLines, basePath) => {
    await timestampLog(logger, logLines, `starting manual2 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      await mkdir(join(basePath, 'emptyfolder')),
      await writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    
    await timestampLog(logger, logLines, `finished manual2 ${basePath}`);
  },
  
  manual3: async (logger, logLines, basePath) => {
    await timestampLog(logger, logLines, `starting manual3 ${basePath}`);
    
    await mkdir(basePath);
    
    await timestampLog(logger, logLines, `finished manual3 ${basePath}`);
  },
  
  manual4: async (logger, logLines, basePath) => {
    await timestampLog(logger, logLines, `starting manual4 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      await mkdir(join(basePath, 'folder')),
      await writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    await writeFile(join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder updated.'));
    
    await timestampLog(logger, logLines, `finished manual4 ${basePath}`);
  },
  
  random1: async (logger, logLines, advancedPrng, basePath) => {
    await timestampLog(logger, logLines, `starting random1 ${basePath}`);
    
    await mkdir(basePath);
    let fsOps = [];
    for (let i = 0; i < 5; i++) {
      let dirNameJ = randomName(advancedPrng);
      fsOps.push((async () => {
        await mkdir(join(basePath, dirNameJ));
        let zeroFoldersJ = advancedPrng.getRandomInteger(2);
        let numFoldersJ = zeroFoldersJ ? 0 : advancedPrng.getRandomInteger(5) + 1;
        let zeroFilesJ = advancedPrng.getRandomInteger(2);
        let numFilesJ = zeroFilesJ ? 0 : advancedPrng.getRandomInteger(5) + 1;
        let fsOpsJ = [];
        for (let j = 0; j < numFoldersJ; j++) {
          let dirNameK = randomName(advancedPrng);
          fsOpsJ.push((async () => {
            await mkdir(join(basePath, dirNameJ, dirNameK));
            let zeroFilesK = advancedPrng.getRandomInteger(2);
            let numFilesK = zeroFilesK ? 0 : advancedPrng.getRandomInteger(5) + 1;
            let fsOpsK = [];
            for (let j = 0; j < numFilesK; j++) {
              fsOpsK.push(writeFile(join(basePath, dirNameJ, dirNameK, randomName(advancedPrng)), Buffer.from(randomContent(advancedPrng))));
            }
          })());
        }
        for (let j = 0; j < numFilesJ; j++) {
          fsOpsJ.push(writeFile(join(basePath, dirNameJ, randomName(advancedPrng)), Buffer.from(randomContent(advancedPrng))));
        }
        await Promise.all(fsOpsJ);
      })());
    }
    for (let i = 0; i < 5; i++) {
      fsOps.push(writeFile(join(basePath, randomName(advancedPrng)), Buffer.from(randomContent(advancedPrng))));
    }
    await Promise.all(fsOps);
    
    await timestampLog(logger, logLines, `finished random1 ${basePath}`);
  },
};

const DirectoryModificationFuncs = {
  modif: async (logger, logLines, advancedPrng, basePath) => {
    await timestampLog(logger, logLines, `starting modif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoices = advancedPrng.getRandomArrayOfUniqueIntegers(5, 2), folderChoice = advancedPrng.getRandomInteger(5);
    
    await Promise.all([
      writeFile(join(basePath, dirContentsFiles[fileChoices[0]]), randomContent(advancedPrng)),
      rename(join(basePath, dirContentsFiles[fileChoices[1]]), join(basePath, randomName(advancedPrng))),
      rename(join(basePath, dirContentsFolders[folderChoice]), join(basePath, randomName(advancedPrng))),
    ]);
    
    await timestampLog(logger, logLines, `finished modif ${basePath}`);
  },
  
  medModif: async (logger, logLines, advancedPrng, basePath) => {
    await timestampLog(logger, logLines, `starting medmodif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = advancedPrng.getRandomInteger(5);
    
    let fileToModif = join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await readFile(fileToModif);
    
    fileToModifBuf = Buffer.concat([fileToModifBuf, Buffer.from([advancedPrng.getRandomInteger(256)])]);
    
    await writeFile(fileToModif, fileToModifBuf);
    
    await timestampLog(logger, logLines, `finished medmodif ${basePath}`);
  },
  
  mildModif: async (logger, logLines, advancedPrng, basePath) => {
    await timestampLog(logger, logLines, `starting mildmodif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = advancedPrng.getRandomInteger(5);
    
    let fileToModif = join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await readFile(fileToModif);
    
    if (fileToModifBuf.length == 0) throw new Error('Error: attempt to modify empty file.');
    
    let fileToModifBufIndex = advancedPrng.getRandomInteger(fileToModifBuf.length);
    
    fileToModifBuf[fileToModifBufIndex] = (fileToModifBuf[fileToModifBufIndex] + 127) % 256;
    
    await writeFile(fileToModif, fileToModifBuf);
    
    await timestampLog(logger, logLines, `finished mildmodif ${basePath}`);
  },
  
  copyThenModif: async (logger, logLines, advancedPrng, basePathOrig, basePathCopy) => {
    await timestampLog(logger, logLines, `starting copythenmodif ${basePathCopy}`);
    
    await cp(basePathOrig, basePathCopy, { recursive: true });
    await DirectoryModificationFuncs.modif(advancedPrng, basePathCopy);
    
    await timestampLog(logger, logLines, `finished copythenmodif ${basePathCopy}`);
  },
};

const BackupTestFuncs = {
  performBackupWithArgs: async (logger, logLines, tmpDir, backupDir, name) => {
    await timestampLog(logger, logLines, `starting backup ${name}`);
    
    let returnValue = await performBackup({
      basePath: join(tmpDir, 'data', name),
      backupDir,
      name,
    });
    
    await timestampLog(logger, logLines, `finished backup ${name}`);
    
    return returnValue;
  },
  
  performRestoreWithArgs: async (logger, logLines, tmpDir, backupDir, name) => {
    await timestampLog(logger, logLines, `starting restore ${name}`);
    
    let returnValue = await performRestore({
      backupDir,
      basePath: join(tmpDir, 'restore', name),
      name,
    });
    
    await timestampLog(logger, logLines, `finished restore ${name}`);
    
    return returnValue;
  },
  
  checkRestoreAccuracy: async (logger, logLines, tmpDir, name, ignoreMTime, verboseFinalValidationLog) => {
    await timestampLog(logger, logLines, `checking validity of restore ${name}`);
    
    let dataObj = await getFilesAndMetaInDir(join(tmpDir, 'data', name));
    let restoreObj = await getFilesAndMetaInDir(join(tmpDir, 'restore', name));
    
    let valid = true;
    
    if (dataObj.length != restoreObj.length) {
      await timestampLog(logger, logLines, `restore length mismatch, data length ${dataObj.length}, restore length ${restoreObj.length}`);
      valid = false;
    }
    
    let stringProps = ['path', 'type', ...(ignoreMTime ? [] : ['mtime']), 'birthtime']; // atime ignored because it changes, ctime ignored because cannot be set
    
    let objLength = Math.min(dataObj.length, restoreObj.length);
    
    for (let i = 0; i < objLength; i++) {
      let dataEntry = dataObj[i], restoreEntry = restoreObj[i];
      
      for (let stringProp of stringProps) {
        if (dataEntry[stringProp] != restoreEntry[stringProp]) {
          await timestampLog(logger, logLines, `property mismatch, entry ${i}, property ${stringProp}, data value ${JSON.stringify(dataEntry[stringProp])}, restore value ${JSON.stringify(restoreEntry[stringProp])}`);
          await timestampLog(logger, logLines, 'dataentry\n', dataEntry);
          await timestampLog(logger, logLines, 'restoreentry\n', restoreEntry);
          valid = false;
        }
      }
      
      if (dataEntry.bytes && restoreEntry.bytes) {
        if (dataEntry.bytes.length != restoreEntry.bytes.length) {
          await timestampLog(logger, logLines, `file length mismatch, entry ${i}, data length ${dataEntry.bytes.length}, restore length ${restoreEntry.bytes.length}`);
          await timestampLog(logger, logLines, 'dataentry\n', dataEntry);
          await timestampLog(logger, logLines, 'restoreentry\n', restoreEntry);
          await timestampLog(logger, logLines, 'databytestring\n', JSON.stringify(dataEntry.bytes.toString()));
          await timestampLog(logger, logLines, 'restorebytestring\n', JSON.stringify(restoreEntry.bytes.toString()));
          valid = false;
        }
        
        let entryByteLength = Math.min(dataEntry.bytes.length, restoreEntry.bytes.length);
        
        for (let j = 0; j < entryByteLength; j++) {
          if (dataEntry.bytes[j] != restoreEntry.bytes[j]) {
            await timestampLog(logger, logLines, `file bytes mismatch, entry ${i}, byte ${j}, data byte ${dataEntry.bytes[j]}, restore byte ${restoreEntry.bytes[j]}`);
            await timestampLog(logger, logLines, 'dataentry\n', dataEntry);
            await timestampLog(logger, logLines, 'restoreentry\n', restoreEntry);
            await timestampLog(logger, logLines, 'databyteslice, 21 bytes, middle is altered byte\n', dataEntry.bytes.slice(Math.max(j - 10, 0), j + 11));
            await timestampLog(logger, logLines, 'restorebyteslice, 21 bytes, middle is altered byte\n', restoreEntry.bytes.slice(Math.max(j - 10, 0), j + 11));
            await timestampLog(logger, logLines, 'databytestring\n', JSON.stringify(dataEntry.bytes.toString()));
            await timestampLog(logger, logLines, 'restorebytestring\n', JSON.stringify(restoreEntry.bytes.toString()));
            valid = false;
            break;
          }
        }
      }
    }
    
    await timestampLog(logger, logLines, `validity of restore ${name} ${valid ? 'valid' : 'invalid'}`);
    
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
        await timestampLog(logger, logLines, 'error in validation logic, restore is not valid');
        await timestampLog(logger, logLines, 'data ' + JSON.stringify(dataObjString));
        await timestampLog(logger, logLines, 'restore ' + JSON.stringify(restoreObjString));
      } else {
        await timestampLog(logger, logLines, 'final stringify check passed');
        if (verboseFinalValidationLog) {
          await timestampLog(logger, logLines, 'data ' + JSON.stringify(dataObjString));
          await timestampLog(logger, logLines, 'restore ' + JSON.stringify(restoreObjString));
        }
      }
    }
    
    if (!valid) {
      await timestampLog(logger, logLines, 'data\n', dataObj);
      await timestampLog(logger, logLines, 'restore\n', restoreObj);
    }
  },
};

export async function performTest({
  // "test" random name and content functions by printing to console their results 10x
  testOnlyRandomName = DEFAULT_TEST_RANDOM_NAME,
  testOnlyGetFilesAndMetaDir = DEFAULT_TEST_GET_FILES_AND_META_DIR,
  // do a deliberate modification and check validity again (TODO: check that this means the validity should fail here, if it doesnt there is issues)
  // mtime change ignored when doing verification after modification since folders will get modified
  testDeliberateModification = DEFAULT_TEST_DELIBERATE_MODIFICATION,
  verboseFinalValidationLog = DEFAULT_VERBOSE_FINAL_VALIDATION_LOG,
  doNotSaveLogIfTestPassed = DEFAULT_DO_NOT_SAVE_LOG_IF_TEST_PASSED,
  logger = console.log,
  logFile = null, // TODO: set properly
} = {}) {
  let advancedPrng = new AdvancedPrng();
  
  let logLines = [];
  
  // TODO: check to ensure getFilesAndMetaInDir reversed is not an issue
  // TODO: check all imported funcs function, including getFilesAndMetaInDir
  
  // open logging file and redirect stdout and stderr
  await mkdir(join(import.meta.dirname, '../logs'), { recursive: true });
  let loggingFile = await open(join(import.meta.dirname, `../logs/${new Date().toISOString().replaceAll(':', '-')}.log`), 'a');
  let oldProcStdoutWrite = process.stdout.write.bind(process.stdout),
    oldProcStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = c => { loggingFile.write(c); oldProcStdoutWrite(c) };
  process.stderr.write = c => { loggingFile.write(c); oldProcStderrWrite(c) };
  
  if (testOnlyRandomName) {
    await timestampLog(logger, logLines, [
      new Array(10).fill().map(() => randomName(advancedPrng)),
      new Array(10).fill().map(() => randomContent(advancedPrng).toString()),
    ]);
    return;
  } else if (testOnlyGetFilesAndMetaDir) {
    await timestampLog(logger, logLines, await getFilesAndMetaInDir('src'));
    return;
  }
  
  // make temp dir for tests
  const tmpDir = await mkdtemp(join(tmpdir(), 'nodehash-'));
  
  try {
    // create filetree
    await Promise.all([
      (async () => {
        await mkdir(join(tmpDir, 'data'));
        await Promise.all([
          DirectoryCreationFuncs.manual1(logger, logLines, join(tmpDir, 'data', 'manual1')),
          DirectoryCreationFuncs.manual2(logger, logLines, join(tmpDir, 'data', 'manual2')),
          DirectoryCreationFuncs.manual3(logger, logLines, join(tmpDir, 'data', 'manual3')),
          DirectoryCreationFuncs.manual4(logger, logLines, join(tmpDir, 'data', 'manual4')),
          (async () => {
            await DirectoryCreationFuncs.random1(logger, logLines, advancedPrng, join(tmpDir, 'data', 'randomconstant'));
            let fsOps = [];
            for (let i = 0; i < 10; i++) {
              fsOps.push(DirectoryCreationFuncs.random1(logger, logLines, advancedPrng, join(tmpDir, 'data', 'random' + i)));
            }
            await Promise.all(fsOps);
            
            let fsOps2 = [];
            for (let i2 = 0; i2 < 10; i2++) {
              fsOps2.push(cp(join(tmpDir, 'data', 'randomconstant'), join(tmpDir, 'data', 'random' + i2), { recursive: true }));
            }
            await Promise.all(fsOps2);
            
            let fsOps3 = [];
            for (let i3 = 0; i3 < 10; i3++) {
              fsOps3.push(DirectoryModificationFuncs.copyThenModif(logger, logLines, advancedPrng, join(tmpDir, 'data', 'random' + i3), join(tmpDir, 'data', 'random' + i3 + '.1')));
            }
            await Promise.all(fsOps3);
          })(),
        ]);
      })(),
      mkdir(join(tmpDir, 'backup')),
      (async () => {
        await mkdir(join(tmpDir, 'restore'));
        let dirArr = ['manual1', 'manual2', 'manual3', 'manual4'];
        for (let i = 0; i < 10; i++) {
          dirArr.push('random' + i);
          dirArr.push('random' + i + '.1');
        }
        await Promise.all(dirArr.map(x => mkdir(join(tmpDir, 'restore', x))));
      })(),
    ]);
    
    let backupDir = join(tmpDir, 'backup');
    
    // init backup dir
    await timestampLog(logger, logLines, 'starting initbackupdir');
    await initBackupDir({
      backupDir,
      hash: 'sha384',
      hashSliceLength: 2,
      hashSlices: 2,
      compressAlgo: 'brotli',
      compressLevel: 11,
    });
    await timestampLog(logger, logLines, 'finished initbackupdir');
    
    let printBackupInfo = async () => {
      await timestampLog(logger, logLines, 'starting getbackupinfo');
      await timestampLog(logger, logLines, await getBackupInfo({ backupDir }));
      await timestampLog(logger, logLines, 'finished getbackupinfo');
    };
    
    // print empty info
    await printBackupInfo();
    
    let backupOrRestore = async backupOrRestoreFunc => {
      await backupOrRestoreFunc(logger, logLines, tmpDir, backupDir, 'manual1');
      await backupOrRestoreFunc(logger, logLines, tmpDir, backupDir, 'manual2');
      await backupOrRestoreFunc(logger, logLines, tmpDir, backupDir, 'manual3');
      await backupOrRestoreFunc(logger, logLines, tmpDir, backupDir, 'manual4');
      for (let i = 0; i < 10; i++) {
        await backupOrRestoreFunc(logger, logLines, tmpDir, backupDir, 'random' + i);
        await backupOrRestoreFunc(logger, logLines, tmpDir, backupDir, 'random' + i + '.1');
      }
    };
    
    // perform backups
    await backupOrRestore(BackupTestFuncs.performBackupWithArgs);
    
    // print filled info
    await printBackupInfo();
    
    // perform restores
    await backupOrRestore(BackupTestFuncs.performRestoreWithArgs);
    
    // check validity of restores
    await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual1', undefined, verboseFinalValidationLog);
    await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual2', undefined, verboseFinalValidationLog);
    await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual3', undefined, verboseFinalValidationLog);
    await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual4', undefined, verboseFinalValidationLog);
    for (let i = 0; i < 10; i++) {
      await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'random' + i, undefined, verboseFinalValidationLog);
      await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'random' + i + '.1', undefined, verboseFinalValidationLog);
    }
    
    if (testDeliberateModification) {
      await timestampLog(logger, logLines, 'starting deliberate modifs');
      
      await DirectoryModificationFuncs.modif(logger, logLines, advancedPrng, join(tmpDir, 'restore', 'random7.1'));
      await DirectoryModificationFuncs.medModif(logger, logLines, advancedPrng, join(tmpDir, 'restore', 'random8.1'));
      await DirectoryModificationFuncs.mildModif(logger, logLines, advancedPrng, join(tmpDir, 'restore', 'random9.1'));
      
      await timestampLog(logger, logLines, 'finished deliberate modifs');
      
      await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual1', true, verboseFinalValidationLog);
      await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual2', true, verboseFinalValidationLog);
      await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual3', true, verboseFinalValidationLog);
      await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'manual4', true, verboseFinalValidationLog);
      for (let i = 0; i < 10; i++) {
        await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'random' + i, true, verboseFinalValidationLog);
        await BackupTestFuncs.checkRestoreAccuracy(logger, logLines, tmpDir, 'random' + i + '.1', true, verboseFinalValidationLog);
      }
    }
  } catch (err) {
    await timestampLog(logger, logLines, err);
  } finally {
    // after tests finished, close program on pressing enter
    await new Promise(r => process.stdin.once('data', r));
    await rm(tmpDir, { recursive: true });
    // TODO: check graceful close works
    //process.exit();
  }
}
