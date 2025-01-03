import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'fs/promises';
import { join } from 'path';
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
const TEST_DATA_DIR = join(import.meta.dirname, '../test_data');
const LOGS_DIR = join(TEST_DATA_DIR, 'logs');
const TESTS_DIR = join(TEST_DATA_DIR, 'tests');

async function removeDirIfEmpty(dirPath) {
  if ((await readdir(dirPath)).length == 0) {
    await rmdir(dirPath);
  }
}

class TestManager {
  // class vars
  
  #logger;
  #boundLogger;
  #logLines = [];
  #advancedPrng = new AdvancedPrng();;
  
  // public funcs
  
  constructor(logger = console.log) {
    this.#logger = logger;
    this.#boundLogger = this.timestampLog.bind(this);
  }
  
  getBoundLogger() {
    return this.#boundLogger;
  }
  
  timestampLog(...vals) {
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
    
    this.#logger(logLine);
    this.#logLines.push(logLine);
  }
  
  randomName() {
    let numSections = this.#advancedPrng.getRandomInteger(3) + 1;
    
    let sectionLengths = [];
    
    for (let i = 0; i < numSections; i++) {
      sectionLengths.push(this.#advancedPrng.getRandomInteger(11) + 5);
    }
    
    return sectionLengths
      .map(sectionLength =>
        this.#advancedPrng
          .getRandomIntegerArray(RANDOM_NAME_CHARS.length, sectionLength)
          .map(charIndex => RANDOM_NAME_CHARS[charIndex])
          .join('')
      ).join('.');
  }
  
  randomContent(notCompressible = false) {
    let length = this.#advancedPrng.getRandomInteger(16000);
    
    if (notCompressible == null) {
      notCompressible = this.#advancedPrng.getRandomInteger(2);
    }
    
    if (notCompressible) {
      return this.#advancedPrng.getRandomBytesCopy(length);
    } else {
      return Buffer.from(
        this.#advancedPrng
          .getRandomIntegerArray(RANDOM_CONTENT_CHARS.length, length)
          .map(charIndex => RANDOM_CONTENT_CHARS[charIndex])
          .join('')
      );
    }
  }
  
  async DirectoryCreationFuncs_manual1(basePath) {
    this.timestampLog(`starting manual1 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      await mkdir(join(basePath, 'folder')),
      await writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    await writeFile(join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder.'));
    
    this.timestampLog(`finished manual1 ${basePath}`);
  }
  
  async DirectoryCreationFuncs_manual2(basePath) {
    this.timestampLog(`starting manual2 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      await mkdir(join(basePath, 'emptyfolder')),
      await writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    
    this.timestampLog(`finished manual2 ${basePath}`);
  }
  
  async DirectoryCreationFuncs_manual3(basePath) {
    this.timestampLog(`starting manual3 ${basePath}`);
    
    await mkdir(basePath);
    
    this.timestampLog(`finished manual3 ${basePath}`);
  }
  
  async DirectoryCreationFuncs_manual4(basePath) {
    this.timestampLog(`starting manual4 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      await mkdir(join(basePath, 'folder')),
      await writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    await writeFile(join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder updated.'));
    
    this.timestampLog(`finished manual4 ${basePath}`);
  }
  
  async DirectoryCreationFuncs_random1(basePath) {
    this.timestampLog(`starting random1 ${basePath}`);
    
    await mkdir(basePath);
    for (let i = 0; i < 5; i++) {
      let dirNameJ = this.randomName();
      await mkdir(join(basePath, dirNameJ));
      let zeroFoldersJ = this.#advancedPrng.getRandomInteger(2);
      let numFoldersJ = zeroFoldersJ ? 0 : this.#advancedPrng.getRandomInteger(5) + 1;
      let zeroFilesJ = this.#advancedPrng.getRandomInteger(2);
      let numFilesJ = zeroFilesJ ? 0 : this.#advancedPrng.getRandomInteger(5) + 1;
      for (let j = 0; j < numFoldersJ; j++) {
        let dirNameK = this.randomName();
        await mkdir(join(basePath, dirNameJ, dirNameK));
        let zeroFilesK = this.#advancedPrng.getRandomInteger(2);
        let numFilesK = zeroFilesK ? 0 : this.#advancedPrng.getRandomInteger(5) + 1;
        for (let j = 0; j < numFilesK; j++) {
          await writeFile(join(basePath, dirNameJ, dirNameK, this.randomName()), Buffer.from(this.randomContent()));
        }
      }
      for (let j = 0; j < numFilesJ; j++) {
        await writeFile(join(basePath, dirNameJ, this.randomName()), Buffer.from(this.randomContent()));
      }
    }
    for (let i = 0; i < 5; i++) {
      await writeFile(join(basePath, this.randomName()), Buffer.from(this.randomContent()))
    }
    
    this.timestampLog(`finished random1 ${basePath}`);
  }

  async DirectoryModificationFuncs_modif(basePath) {
    this.timestampLog(`starting modif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoices = this.#advancedPrng.getRandomArrayOfUniqueIntegers(5, 2), folderChoice = this.#advancedPrng.getRandomInteger(5);
    
    await writeFile(join(basePath, dirContentsFiles[fileChoices[0]]), this.randomContent());
    await rename(join(basePath, dirContentsFiles[fileChoices[1]]), join(basePath, this.randomName()));
    await rename(join(basePath, dirContentsFolders[folderChoice]), join(basePath, this.randomName()));
    
    this.timestampLog(`finished modif ${basePath}`);
  }
  
  async DirectoryModificationFuncs_medModif(basePath) {
    this.timestampLog(`starting medmodif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = this.#advancedPrng.getRandomInteger(5);
    
    let fileToModif = join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await readFile(fileToModif);
    
    fileToModifBuf = Buffer.concat([fileToModifBuf, Buffer.from([this.#advancedPrng.getRandomInteger(256)])]);
    
    await writeFile(fileToModif, fileToModifBuf);
    
    this.timestampLog(`finished medmodif ${basePath}`);
  }
  
  async DirectoryModificationFuncs_mildModif(basePath) {
    this.timestampLog(`starting mildmodif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = this.#advancedPrng.getRandomInteger(5);
    
    let fileToModif = join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await readFile(fileToModif);
    
    if (fileToModifBuf.length == 0) throw new Error('Error: attempt to modify empty file.');
    
    let fileToModifBufIndex = this.#advancedPrng.getRandomInteger(fileToModifBuf.length);
    
    fileToModifBuf[fileToModifBufIndex] = (fileToModifBuf[fileToModifBufIndex] + 127) % 256;
    
    await writeFile(fileToModif, fileToModifBuf);
    
    this.timestampLog(`finished mildmodif ${basePath}`);
  }
  
  async DirectoryModificationFuncs_copyThenModif(basePathOrig, basePathCopy) {
    this.timestampLog(`starting copythenmodif ${basePathCopy}`);
    
    await cp(basePathOrig, basePathCopy, { recursive: true });
    await this.DirectoryModificationFuncs_modif(basePathCopy);
    
    this.timestampLog(`finished copythenmodif ${basePathCopy}`);
  }

  async BackupTestFuncs_performBackupWithArgs(tmpDir, backupDir, name) {
    this.timestampLog(`starting backup ${name}`);
    
    let returnValue = await performBackup({
      basePath: join(tmpDir, 'data', name),
      backupDir,
      name,
      logger: this.#boundLogger,
    });
    
    this.timestampLog(`finished backup ${name}`);
    
    return returnValue;
  }
  
  async BackupTestFuncs_performRestoreWithArgs(tmpDir, backupDir, name) {
    this.timestampLog(`starting restore ${name}`);
    
    let returnValue = await performRestore({
      backupDir,
      basePath: join(tmpDir, 'restore', name),
      name,
      logger: this.#boundLogger,
    });
    
    this.timestampLog(`finished restore ${name}`);
    
    return returnValue;
  }
  
  async BackupTestFuncs_checkRestoreAccuracy(tmpDir, name, ignoreMTime, verboseFinalValidationLog) {
    this.timestampLog(`checking validity of restore ${name}`);
    
    let dataObj = await getFilesAndMetaInDir(join(tmpDir, 'data', name));
    let restoreObj = await getFilesAndMetaInDir(join(tmpDir, 'restore', name));
    
    let valid = true;
    
    if (dataObj.length != restoreObj.length) {
      this.timestampLog(`restore length mismatch, data length ${dataObj.length}, restore length ${restoreObj.length}`);
      valid = false;
    }
    
    let stringProps = ['path', 'type', ...(ignoreMTime ? [] : ['mtime']), 'birthtime']; // atime ignored because it changes, ctime ignored because cannot be set
    
    let objLength = Math.min(dataObj.length, restoreObj.length);
    
    for (let i = 0; i < objLength; i++) {
      let dataEntry = dataObj[i], restoreEntry = restoreObj[i];
      
      for (let stringProp of stringProps) {
        if (dataEntry[stringProp] != restoreEntry[stringProp]) {
          this.timestampLog(`property mismatch, entry ${i}, property ${stringProp}, data value ${JSON.stringify(dataEntry[stringProp])}, restore value ${JSON.stringify(restoreEntry[stringProp])}`);
          this.timestampLog('dataentry\n', dataEntry);
          this.timestampLog('restoreentry\n', restoreEntry);
          valid = false;
        }
      }
      
      if (dataEntry.bytes && restoreEntry.bytes) {
        if (dataEntry.bytes.length != restoreEntry.bytes.length) {
          this.timestampLog(`file length mismatch, entry ${i}, data length ${dataEntry.bytes.length}, restore length ${restoreEntry.bytes.length}`);
          this.timestampLog('dataentry\n', dataEntry);
          this.timestampLog('restoreentry\n', restoreEntry);
          this.timestampLog('databytestring\n', JSON.stringify(dataEntry.bytes.toString()));
          this.timestampLog('restorebytestring\n', JSON.stringify(restoreEntry.bytes.toString()));
          valid = false;
        }
        
        let entryByteLength = Math.min(dataEntry.bytes.length, restoreEntry.bytes.length);
        
        for (let j = 0; j < entryByteLength; j++) {
          if (dataEntry.bytes[j] != restoreEntry.bytes[j]) {
            this.timestampLog(`file bytes mismatch, entry ${i}, byte ${j}, data byte ${dataEntry.bytes[j]}, restore byte ${restoreEntry.bytes[j]}`);
            this.timestampLog('dataentry\n', dataEntry);
            this.timestampLog('restoreentry\n', restoreEntry);
            this.timestampLog('databyteslice, 21 bytes, middle is altered byte\n', dataEntry.bytes.slice(Math.max(j - 10, 0), j + 11));
            this.timestampLog('restorebyteslice, 21 bytes, middle is altered byte\n', restoreEntry.bytes.slice(Math.max(j - 10, 0), j + 11));
            this.timestampLog('databytestring\n', JSON.stringify(dataEntry.bytes.toString()));
            this.timestampLog('restorebytestring\n', JSON.stringify(restoreEntry.bytes.toString()));
            valid = false;
            break;
          }
        }
      }
    }
    
    this.timestampLog(`validity of restore ${name} ${valid ? 'valid' : 'invalid'}`);
    
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
        this.timestampLog('error in validation logic, restore is not valid');
        this.timestampLog('data ' + JSON.stringify(dataObjString));
        this.timestampLog('restore ' + JSON.stringify(restoreObjString));
      } else {
        this.timestampLog('final stringify check passed');
        if (verboseFinalValidationLog) {
          this.timestampLog('data ' + JSON.stringify(dataObjString));
          this.timestampLog('restore ' + JSON.stringify(restoreObjString));
        }
      }
    }
    
    if (!valid) {
      this.timestampLog('data\n', dataObj);
      this.timestampLog('restore\n', restoreObj);
    }
  }
  
  async writeLogFile() {
    await writeFile(
      join(LOGS_DIR, `${new Date().toISOString().replaceAll(':', '-')}.log`),
      this.#logLines.join('\n') + '\n'
    );
  }
}

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
  let testMgr = new TestManager(logger);
  
  // TODO: check to ensure getFilesAndMetaInDir reversed is not an issue
  // TODO: check all imported funcs function, including getFilesAndMetaInDir
  
  if (testOnlyRandomName) {
    testMgr.timestampLog([
      new Array(10).fill().map(() => testMgr.randomName()),
      new Array(10).fill().map(() => testMgr.randomContent().toString()),
    ]);
    return;
  } else if (testOnlyGetFilesAndMetaDir) {
    testMgr.timestampLog(await getFilesAndMetaInDir('src'));
    return;
  }
  
  // create dirs
  await mkdir(LOGS_DIR, { recursive: true });
  await mkdir(TESTS_DIR, { recursive: true });
  
  // open logging file and redirect stdout and stderr
  //let oldProcStdoutWrite = process.stdout.write.bind(process.stdout);
  let oldProcStderrWrite = process.stderr.write.bind(process.stderr);
  //process.stdout.write = c => { loggingFile.write(c); oldProcStdoutWrite(c) };
  process.stderr.write = c => { testMgr.timestampLog(c); oldProcStderrWrite(c) };
  
  // make temp dir for tests
  const tmpDir = await mkdtemp(join(TESTS_DIR, 'nodehash-'));
  
  let errorOccurred = false;
  
  try {
    // create filetree
    await Promise.all([
      (async () => {
        await mkdir(join(tmpDir, 'data'));
        await Promise.all([
          testMgr.DirectoryCreationFuncs_manual1(join(tmpDir, 'data', 'manual1')),
          testMgr.DirectoryCreationFuncs_manual2(join(tmpDir, 'data', 'manual2')),
          testMgr.DirectoryCreationFuncs_manual3(join(tmpDir, 'data', 'manual3')),
          testMgr.DirectoryCreationFuncs_manual4(join(tmpDir, 'data', 'manual4')),
          (async () => {
            await testMgr.DirectoryCreationFuncs_random1(join(tmpDir, 'data', 'randomconstant'));
            for (let i = 0; i < 10; i++) {
              await testMgr.DirectoryCreationFuncs_random1(join(tmpDir, 'data', 'random' + i))
            }
            
            let fsOps = [];
            for (let i2 = 0; i2 < 10; i2++) {
              fsOps.push(cp(join(tmpDir, 'data', 'randomconstant'), join(tmpDir, 'data', 'random' + i2), { recursive: true }));
            }
            await Promise.all(fsOps);
            
            for (let i3 = 0; i3 < 10; i3++) {
              await testMgr.DirectoryModificationFuncs_copyThenModif(join(tmpDir, 'data', 'random' + i3), join(tmpDir, 'data', 'random' + i3 + '.1'));
            }
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
    testMgr.timestampLog('starting initbackupdir');
    await initBackupDir({
      backupDir,
      hash: 'sha256',
      hashSliceLength: 2,
      hashSlices: 1,
      compressAlgo: 'brotli',
      compressParams: { level: 11 },
      logger: testMgr.getBoundLogger(),
    });
    testMgr.timestampLog('finished initbackupdir');
    
    let printBackupInfo = async () => {
      testMgr.timestampLog('starting getbackupinfo');
      testMgr.timestampLog(await getBackupInfo({ backupDir }));
      testMgr.timestampLog('finished getbackupinfo');
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
    await backupOrRestore(testMgr.BackupTestFuncs_performBackupWithArgs.bind(testMgr));
    
    // print filled info
    await printBackupInfo();
    
    // perform restores
    await backupOrRestore(testMgr.BackupTestFuncs_performRestoreWithArgs.bind(testMgr));
    
    // check validity of restores
    await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual1', undefined, verboseFinalValidationLog);
    await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual2', undefined, verboseFinalValidationLog);
    await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual3', undefined, verboseFinalValidationLog);
    await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual4', undefined, verboseFinalValidationLog);
    for (let i = 0; i < 10; i++) {
      await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'random' + i, undefined, verboseFinalValidationLog);
      await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'random' + i + '.1', undefined, verboseFinalValidationLog);
    }
    
    if (testDeliberateModification) {
      testMgr.timestampLog('starting deliberate modifs');
      
      await DirectoryModificationFuncs_modif(join(tmpDir, 'restore', 'random7.1'));
      await DirectoryModificationFuncs_medModif(join(tmpDir, 'restore', 'random8.1'));
      await DirectoryModificationFuncs_mildModif(join(tmpDir, 'restore', 'random9.1'));
      
      testMgr.timestampLog('finished deliberate modifs');
      
      await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual1', true, verboseFinalValidationLog);
      await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual2', true, verboseFinalValidationLog);
      await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual3', true, verboseFinalValidationLog);
      await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'manual4', true, verboseFinalValidationLog);
      for (let i = 0; i < 10; i++) {
        await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'random' + i, true, verboseFinalValidationLog);
        await BackupTestFuncs_checkRestoreAccuracy(tmpDir, 'random' + i + '.1', true, verboseFinalValidationLog);
      }
    }
  } catch (err) {
    testMgr.timestampLog(err);
    errorOccurred = true;
  } finally {
    // after tests finished, close program on pressing enter
    console.log(`Press enter to continue${errorOccurred ? '' : ' (dirs will be deleted)'}`);
    await new Promise(r => process.stdin.once('data', r));
    if (!errorOccurred) {
      await rm(tmpDir, { recursive: true });
    } else {
      await testMgr.writeLogFile();
    }
    await removeDirIfEmpty(LOGS_DIR);
    await removeDirIfEmpty(TESTS_DIR);
    await removeDirIfEmpty(TEST_DATA_DIR);
    console.log('Done');
  }
}
