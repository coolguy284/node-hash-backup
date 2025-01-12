import {
  AssertionError,
  deepStrictEqual,
} from 'node:assert/strict';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {
  join,
  resolve,
} from 'node:path';
import { formatWithOptions as utilFormatWithOptions } from 'node:util';

import {
  getBackupInfo,
  initBackupDir,
  performBackup,
  performRestore,
} from '../src/backup_manager/backup_helper_funcs.mjs';
import { parseArgs } from '../src/lib/command_line.mjs';
import { setReadOnly } from '../src/lib/fs.mjs';

import { getFilesAndMetaInDir } from './lib/fs.mjs'; 
import { AdvancedPrng } from './lib/prng_extended.mjs';

export const DEFAULT_TEST_RANDOM_NAME = false;
export const DEFAULT_TEST_GET_FILES_AND_META_DIR = false;
export const DEFAULT_TEST_DELIBERATE_MODIFICATION = true;
export const DEFAULT_VERBOSE_FINAL_VALIDATION_LOG = false;
export const DEFAULT_DO_NOT_SAVE_LOG_IF_TEST_PASSED = true;
export const DEFAULT_DO_NOT_SAVE_TEST_DIR_IF_TEST_PASSED = true;

const RANDOM_NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const RANDOM_CONTENT_CHARS = 'abcdef0123';
const TEST_DATA_DIR = join(import.meta.dirname, '../test_data');
const LOGS_DIR = join(TEST_DATA_DIR, 'logs');
const TESTS_DIR = join(TEST_DATA_DIR, 'tests');
//const FORCE_QUIT_TIMEOUT = 10_000;

async function removeDirIfEmpty(dirPath) {
  if ((await readdir(dirPath)).length == 0) {
    await rmdir(dirPath);
  }
}

class RestoreInaccurateError extends Error {}

class RandomManager {
  #advancedPrng = new AdvancedPrng();
  
  randomName() {
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    let numSections = this.#advancedPrng.getRandomInteger(3) + 1;
    
    let sectionLengths = [];
    
    for (let i = 0; i < numSections; i++) {
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
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
  
  getPrng() {
    return this.#advancedPrng;
  }
}

function isDeepEqual(obj1, obj2) {
  try {
    deepStrictEqual(obj1, obj2);
    return true;
  } catch (err) {
    if (err instanceof AssertionError) {
      return false;
    } else {
      throw err;
    }
  }
}

class TestManager {
  // class vars
  
  #logger;
  #boundLogger;
  #logLines = [];
  #randomMgr = new RandomManager();
  #inMemoryCutoffSize;
  #testSymlink;
  
  // public funcs
  
  constructor({
    logger = console.log,
    inMemoryCutoffSize = Infinity,
    testSymlink = false,
  } = {}) {
    this.#logger = logger;
    this.#boundLogger = this.timestampLog.bind(this);
    this.#inMemoryCutoffSize = inMemoryCutoffSize;
    this.#testSymlink = testSymlink;
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
      ...vals,
    );
    
    this.#logger(logLine);
    this.#logLines.push(logLine);
  }
  
  async DirectoryCreationFuncs_manual1(basePath) {
    this.timestampLog(`starting manual1 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      mkdir(join(basePath, 'folder')),
      writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
    ]);
    await writeFile(join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder.'));
    
    this.timestampLog(`finished manual1 ${basePath}`);
  }
  
  async DirectoryCreationFuncs_manual2(basePath) {
    this.timestampLog(`starting manual2 ${basePath}`);
    
    await mkdir(basePath);
    await Promise.all([
      mkdir(join(basePath, 'emptyfolder')),
      writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
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
      mkdir(join(basePath, 'folder')),
      mkdir(join(basePath, 'folder-readonly')),
      writeFile(join(basePath, 'file.txt'), Buffer.from('Test file.')),
      writeFile(join(basePath, 'file-readonly.txt'), Buffer.from('Test readonly file.')),
    ]);
    await Promise.all([
      writeFile(join(basePath, 'folder', 'file.txt'), Buffer.from('Test file in folder updated.')),
      mkdir(join(basePath, 'folder', 'subfolder')),
      setReadOnly(join(basePath, 'file-readonly.txt')),
    ]);
    await writeFile(join(basePath, 'folder', 'subfolder', 'file.txt'), Buffer.from('Test file in sub folder.'));
    
    if (this.#testSymlink) {
      await symlink(resolve(join(basePath, 'folder', 'file.txt')), join(basePath, 'file-symlink-absolute.txt'), 'file');
      await Promise.all([
        symlink('./folder/file.txt', join(basePath, 'file-symlink-relative.txt'), 'file'),
        symlink('./folder/file.txt', join(basePath, 'file-symlink-relative-readonly.txt'), 'file'),
        symlink(resolve(join(basePath, 'folder')), join(basePath, 'dir-symlink-absolute'), 'dir'),
        symlink('./folder', join(basePath, 'dir-symlink-relative'), 'dir'),
        symlink('./folder', join(basePath, 'dir-symlink-relative-readonly'), 'dir'),
        symlink(join(basePath, 'folder'), join(basePath, 'dir-junction-absolute'), 'junction'),
        symlink(join(basePath, 'folder'), join(basePath, 'dir-junction-absolute-readonly'), 'junction'),
      ]);
      await Promise.all([
        setReadOnly(join(basePath, 'file-symlink-relative-readonly.txt')),
        setReadOnly(join(basePath, 'dir-symlink-relative-readonly')),
        setReadOnly(join(basePath, 'dir-junction-absolute-readonly')),
      ]);
    }
    
    this.timestampLog(`finished manual4 ${basePath}`);
  }
  
  async DirectoryCreationFuncs_manual5(basePath) {
    this.timestampLog(`starting manual5 ${basePath}`);
    
    await writeFile(basePath, Buffer.from('Test raw file exists.'));
    
    this.timestampLog(`finished manual5 ${basePath}`);
  }
  
  async DirectoryCreationFuncs_random1(basePath) {
    this.timestampLog(`starting random1 ${basePath}`);
    
    await mkdir(basePath);
    for (let i = 0; i < 5; i++) {
      let dirNameJ = this.#randomMgr.randomName();
      await mkdir(join(basePath, dirNameJ));
      let zeroFoldersJ = this.#randomMgr.getPrng().getRandomInteger(2);
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      let numFoldersJ = zeroFoldersJ ? 0 : this.#randomMgr.getPrng().getRandomInteger(5) + 1;
      let zeroFilesJ = this.#randomMgr.getPrng().getRandomInteger(2);
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      let numFilesJ = zeroFilesJ ? 0 : this.#randomMgr.getPrng().getRandomInteger(5) + 1;
      for (let j = 0; j < numFoldersJ; j++) {
        let dirNameK = this.#randomMgr.randomName();
        await mkdir(join(basePath, dirNameJ, dirNameK));
        let zeroFilesK = this.#randomMgr.getPrng().getRandomInteger(2);
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        let numFilesK = zeroFilesK ? 0 : this.#randomMgr.getPrng().getRandomInteger(5) + 1;
        for (let j = 0; j < numFilesK; j++) {
          await writeFile(join(basePath, dirNameJ, dirNameK, this.#randomMgr.randomName()), Buffer.from(this.#randomMgr.randomContent()));
        }
      }
      for (let j = 0; j < numFilesJ; j++) {
        await writeFile(join(basePath, dirNameJ, this.#randomMgr.randomName()), Buffer.from(this.#randomMgr.randomContent()));
      }
    }
    for (let i = 0; i < 5; i++) {
      await writeFile(join(basePath, this.#randomMgr.randomName()), Buffer.from(this.#randomMgr.randomContent()));
    }
    
    this.timestampLog(`finished random1 ${basePath}`);
  }

  async DirectoryModificationFuncs_modif(basePath) {
    this.timestampLog(`starting modif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoices = this.#randomMgr.getPrng().getRandomArrayOfUniqueIntegers(5, 2), folderChoice = this.#randomMgr.getPrng().getRandomInteger(5);
    
    await writeFile(join(basePath, dirContentsFiles[fileChoices[0]]), this.#randomMgr.randomContent());
    await rename(join(basePath, dirContentsFiles[fileChoices[1]]), join(basePath, this.#randomMgr.randomName()));
    await rename(join(basePath, dirContentsFolders[folderChoice]), join(basePath, this.#randomMgr.randomName()));
    
    this.timestampLog(`finished modif ${basePath}`);
  }
  
  async DirectoryModificationFuncs_medModif(basePath) {
    this.timestampLog(`starting medmodif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = this.#randomMgr.getPrng().getRandomInteger(5);
    
    let fileToModif = join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await readFile(fileToModif);
    
    fileToModifBuf = Buffer.concat([fileToModifBuf, Buffer.from([this.#randomMgr.getPrng().getRandomInteger(256)])]);
    
    await writeFile(fileToModif, fileToModifBuf);
    
    this.timestampLog(`finished medmodif ${basePath}`);
  }
  
  async DirectoryModificationFuncs_mildModif(basePath) {
    this.timestampLog(`starting mildmodif ${basePath}`);
    
    let dirContents = await readdir(basePath, { withFileTypes: true });
    
    let dirContentsFiles = [], dirContentsFolders = [];
    dirContents.forEach(x => x.isDirectory() ? dirContentsFolders.push(x.name) : dirContentsFiles.push(x.name));
    
    let fileChoice = this.#randomMgr.getPrng().getRandomInteger(5);
    
    let fileToModif = join(basePath, dirContentsFiles[fileChoice]);
    
    let fileToModifBuf = await readFile(fileToModif);
    
    if (fileToModifBuf.length == 0) throw new Error('Error: attempt to modify empty file.');
    
    let fileToModifBufIndex = this.#randomMgr.getPrng().getRandomInteger(fileToModifBuf.length);
    
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
      inMemoryCutoffSize: this.#inMemoryCutoffSize,
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
      inMemoryCutoffSize: this.#inMemoryCutoffSize,
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
    
    // atime ignored because it changes, ctime ignored because cannot be set
    // symlinkType ignored for now
    const propsToCheck = [
      'path',
      'type',
      'attributes',
      'symlinkPath',
      ...(ignoreMTime ? [] : ['mtime']),
      'birthtime',
    ];
    
    let objLength = Math.min(dataObj.length, restoreObj.length);
    
    for (let i = 0; i < objLength; i++) {
      let dataEntry = dataObj[i], restoreEntry = restoreObj[i];
      
      for (let stringProp of propsToCheck) {
        if (!isDeepEqual(dataEntry[stringProp], restoreEntry[stringProp])) {
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
          symlinkPath: x.symlinkPath,
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
      throw new RestoreInaccurateError('restore inaccurate');
    }
  }
  
  async writeLogFile() {
    await writeFile(
      join(LOGS_DIR, `${new Date().toISOString().replaceAll(':', '-')}.log`),
      this.#logLines.join('\n') + '\n'
    );
  }
}

// includeSymlinks not an argument here because it is a part of testMgr
async function createTestDirectoryContents(testMgr, testDir) {
  await Promise.all([
    (async () => {
      await Promise.all([
        mkdir(join(testDir, 'data')),
        mkdir(join(testDir, 'data-build')),
      ]);
      await Promise.all([
        testMgr.DirectoryCreationFuncs_manual1(join(testDir, 'data', 'manual1')),
        testMgr.DirectoryCreationFuncs_manual2(join(testDir, 'data', 'manual2')),
        testMgr.DirectoryCreationFuncs_manual3(join(testDir, 'data', 'manual3')),
        testMgr.DirectoryCreationFuncs_manual4(join(testDir, 'data', 'manual4')),
        testMgr.DirectoryCreationFuncs_manual5(join(testDir, 'data', 'manual5')),
        (async () => {
          await testMgr.DirectoryCreationFuncs_random1(join(testDir, 'data-build', 'randomconstant'));
          for (let i = 0; i < 10; i++) {
            await testMgr.DirectoryCreationFuncs_random1(join(testDir, 'data', 'random' + i));
          }
          
          let fsOps = [];
          for (let i2 = 0; i2 < 10; i2++) {
            fsOps.push(cp(join(testDir, 'data-build', 'randomconstant'), join(testDir, 'data', 'random' + i2), { recursive: true }));
          }
          await Promise.all(fsOps);
          
          for (let i3 = 0; i3 < 10; i3++) {
            await testMgr.DirectoryModificationFuncs_copyThenModif(join(testDir, 'data', 'random' + i3), join(testDir, 'data', 'random' + i3 + '.1'));
          }
        })(),
      ]);
    })(),
    mkdir(join(testDir, 'backup')),
    (async () => {
      await mkdir(join(testDir, 'restore'));
      let dirArr = ['manual1', 'manual2', 'manual3', 'manual4'];
      for (let i = 0; i < 10; i++) {
        dirArr.push('random' + i);
        dirArr.push('random' + i + '.1');
      }
      await Promise.all(dirArr.map(async x => await mkdir(join(testDir, 'restore', x))));
    })(),
  ]);
}

async function performSubTest({
  testDeliberateModification,
  verboseFinalValidationLog,
  doNotSaveLogIfTestPassed,
  doNotSaveTestDirIfTestPassed,
  testSymlink,
  logger,
  doLogFile,
  awaitUserInputAtEnd,
  inMemoryCutoffSize,
}) {
  let testMgr = new TestManager({
    logger,
    inMemoryCutoffSize,
    testSymlink,
  });
  
  testMgr.timestampLog(`inMemoryCutoffSize: ${inMemoryCutoffSize}`);
  
  // create dirs
  await mkdir(LOGS_DIR, { recursive: true });
  await mkdir(TESTS_DIR, { recursive: true });
  
  // open logging file and redirect stdout and stderr
  //let oldProcStdoutWrite = process.stdout.write.bind(process.stdout);
  let oldProcStderrWrite = process.stderr.write.bind(process.stderr);
  //process.stdout.write = c => { loggingFile.write(c); oldProcStdoutWrite(c); };
  process.stderr.write = c => { testMgr.timestampLog(c); oldProcStderrWrite(c); };
  
  try {
    // make temp dir for tests
    const testDir = join(TESTS_DIR, `test-${Date.now() - new Date('2025-01-01T00:00:00.000Z').getTime()}`);
    await mkdir(testDir);
    
    let errorOccurred = false;
    let errorValue;
    
    try {
      // create filetree
      await createTestDirectoryContents(testMgr, testDir, testSymlink);
      
      let backupDir = join(testDir, 'backup');
      
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
        testMgr.timestampLog(await getBackupInfo({ backupDir, logger: testMgr.getBoundLogger() }));
        testMgr.timestampLog('finished getbackupinfo');
      };
      
      // print empty info
      await printBackupInfo();
      
      let backupOrRestore = async backupOrRestoreFunc => {
        await backupOrRestoreFunc(testDir, backupDir, 'manual1');
        await backupOrRestoreFunc(testDir, backupDir, 'manual2');
        await backupOrRestoreFunc(testDir, backupDir, 'manual3');
        await backupOrRestoreFunc(testDir, backupDir, 'manual4');
        for (let i = 0; i < 10; i++) {
          await backupOrRestoreFunc(testDir, backupDir, 'random' + i);
          await backupOrRestoreFunc(testDir, backupDir, 'random' + i + '.1');
        }
      };
      
      // perform backups
      await backupOrRestore(testMgr.BackupTestFuncs_performBackupWithArgs.bind(testMgr));
      
      // print filled info
      await printBackupInfo();
      
      // perform restores
      await backupOrRestore(testMgr.BackupTestFuncs_performRestoreWithArgs.bind(testMgr));
      
      // check validity of restores
      await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual1', undefined, verboseFinalValidationLog);
      await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual2', undefined, verboseFinalValidationLog);
      await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual3', undefined, verboseFinalValidationLog);
      await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual4', undefined, verboseFinalValidationLog);
      for (let i = 0; i < 10; i++) {
        await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'random' + i, undefined, verboseFinalValidationLog);
        await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'random' + i + '.1', undefined, verboseFinalValidationLog);
      }
      
      if (testDeliberateModification) {
        testMgr.timestampLog('starting deliberate modifs');
        
        await testMgr.DirectoryModificationFuncs_modif(join(testDir, 'restore', 'random7.1'));
        await testMgr.DirectoryModificationFuncs_medModif(join(testDir, 'restore', 'random8.1'));
        await testMgr.DirectoryModificationFuncs_mildModif(join(testDir, 'restore', 'random9.1'));
        
        testMgr.timestampLog('finished deliberate modifs');
        
        await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual1', true, verboseFinalValidationLog);
        await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual2', true, verboseFinalValidationLog);
        await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual3', true, verboseFinalValidationLog);
        await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'manual4', true, verboseFinalValidationLog);
        for (let i = 0; i < 10; i++) {
          await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'random' + i, true, verboseFinalValidationLog);
          
          if (i >= 7 && i <= 9) {
            let passed = false;
            
            try {
              await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'random' + i + '.1', true, verboseFinalValidationLog);
            } catch (err) {
              if (err instanceof RestoreInaccurateError) {
                passed = true;
              } else {
                throw err;
              }
            }
            
            if (!passed) {
              throw new Error('deliberate modification failed to cause a validation error');
            }
          } else {
            await testMgr.BackupTestFuncs_checkRestoreAccuracy(testDir, 'random' + i + '.1', true, verboseFinalValidationLog);
          }
        }
      }
    } catch (err) {
      testMgr.timestampLog(err);
      errorOccurred = true;
      errorValue = err;
    } finally {
      if (awaitUserInputAtEnd) {
        // after tests finished, close program on pressing enter
        console.log(`Press enter to continue${errorOccurred ? '' : ' (dirs will be deleted)'}`);
        await new Promise(r => process.stdin.once('data', r));
        // stdin gets set into flowing mode by the above, must pause after or else process will remain open
        process.stdin.pause();
      }
      
      if (errorOccurred) {
        if (doLogFile) {
          await testMgr.writeLogFile();
        }
      } else {
        if (doNotSaveTestDirIfTestPassed) {
          await rm(testDir, { recursive: true });
        }
        
        if (!doNotSaveLogIfTestPassed) {
          if (doLogFile) {
            await testMgr.writeLogFile();
          }
        }
      }
      
      await removeDirIfEmpty(LOGS_DIR);
      await removeDirIfEmpty(TESTS_DIR);
      await removeDirIfEmpty(TEST_DATA_DIR);
      
      logger('Done');
      
      // setTimeout(() => {
      //   logger(`Resources keeping process alive:\n` + process.getActiveResourcesInfo().join(', '));
      //   process.exit();
      // }, FORCE_QUIT_TIMEOUT).unref();
    }
      
    if (errorOccurred) {
      throw errorValue;
    }
  } finally {
    process.stderr.write = oldProcStderrWrite;
  }
}

export async function performMainTest({
  // "test" random name and content functions by printing to console their results 10x
  testOnlyRandomName = DEFAULT_TEST_RANDOM_NAME,
  testOnlyGetFilesAndMetaDir = DEFAULT_TEST_GET_FILES_AND_META_DIR,
  // mtime change ignored when doing verification after modification since folders will get modified
  testDeliberateModification = DEFAULT_TEST_DELIBERATE_MODIFICATION,
  verboseFinalValidationLog = DEFAULT_VERBOSE_FINAL_VALIDATION_LOG,
  doNotSaveLogIfTestPassed = DEFAULT_DO_NOT_SAVE_LOG_IF_TEST_PASSED,
  doNotSaveTestDirIfTestPassed = DEFAULT_DO_NOT_SAVE_TEST_DIR_IF_TEST_PASSED,
  testSymlink = process.platform != 'win32' ? true : false,
  logger = console.log,
  doLogFile = true,
  awaitUserInputAtEnd = false,
  memoryOnlySubTest = true,
  streamOnlySubTest = true,
} = {}) {
  if (testOnlyRandomName) {
    let randomMgr = new RandomManager();
    
    logger([
      new Array(10).fill().map(() => randomMgr.randomName()),
      new Array(10).fill().map(() => randomMgr.randomContent().toString()),
    ]);
    return;
  } else if (testOnlyGetFilesAndMetaDir) {
    logger(await getFilesAndMetaInDir('src'));
    return;
  }
  
  if (memoryOnlySubTest) {
    await performSubTest({
      testDeliberateModification,
      verboseFinalValidationLog,
      doNotSaveLogIfTestPassed,
      doNotSaveTestDirIfTestPassed,
      testSymlink,
      logger,
      doLogFile,
      awaitUserInputAtEnd,
      inMemoryCutoffSize: Infinity,
    });
  }
  
  if (streamOnlySubTest) {
    await performSubTest({
      testDeliberateModification,
      verboseFinalValidationLog,
      doNotSaveLogIfTestPassed,
      doNotSaveTestDirIfTestPassed,
      testSymlink,
      logger,
      doLogFile,
      awaitUserInputAtEnd,
      inMemoryCutoffSize: -1,
    });
  }
}

function arrayParseArgs(args) {
  const {
    subCommands,
    keyedArgs,
    presentOnlyArgs,
    allPresentArgs,
  } = parseArgs(args);
  
  return {
    subCommands,
    keyedArgs: Array.from(keyedArgs),
    presentOnlyArgs: Array.from(presentOnlyArgs),
    allPresentArgs: Array.from(allPresentArgs),
  };
}

export function performMinorTests({
  logger = console.log,
} = {}) {
  // test parseArgs
  
  deepStrictEqual(
    arrayParseArgs([]),
    
    {
      subCommands: [],
      keyedArgs: [],
      presentOnlyArgs: [],
      allPresentArgs: [],
    }
  );
  
  deepStrictEqual(
    arrayParseArgs(['--to=val']),
    
    {
      subCommands: [],
      keyedArgs: [
        ['to', 'val'],
      ],
      presentOnlyArgs: [],
      allPresentArgs: ['to'],
    }
  );
  
  deepStrictEqual(
    arrayParseArgs(['--to', 'val']),
    
    {
      subCommands: [],
      keyedArgs: [
        ['to', 'val'],
      ],
      presentOnlyArgs: [],
      allPresentArgs: ['to'],
    }
  );
  
  deepStrictEqual(
    arrayParseArgs(['--arg1', '--to=val']),
    
    {
      subCommands: [],
      keyedArgs: [
        ['to', 'val'],
      ],
      presentOnlyArgs: ['arg1'],
      allPresentArgs: ['arg1', 'to'],
    }
  );
  
  deepStrictEqual(
    arrayParseArgs(['--to=val', '--arg1']),
    
    {
      subCommands: [],
      keyedArgs: [
        ['to', 'val'],
      ],
      presentOnlyArgs: [
        'arg1',
      ],
      allPresentArgs: ['to', 'arg1'],
    }
  );
  
  deepStrictEqual(
    arrayParseArgs(['--arg1']),
    
    {
      subCommands: [],
      keyedArgs: [],
      presentOnlyArgs: [
        'arg1',
      ],
      allPresentArgs: ['arg1'],
    }
  );
  
  logger('Parseargs test successful');
}
