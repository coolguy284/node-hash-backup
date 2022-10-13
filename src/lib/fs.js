let fs = require('fs');
let path = require('path');

let { _nsTimeToString,
      _stringToUTCTimeString } = require('./misc');
let _procPromisify = require('./process');

async function _checkPathIsDir(basePath) {
  let pathStats;
  try {
    pathStats = await fs.promises.stat(basePath);
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
  }
  
  if (pathStats == null)
    throw new Error(`Error: ${basePath} does not exist.`);
  
  if (!pathStats.isDirectory())
    throw new Error(`Error: ${basePath} not a directory.`);
}

async function _recursiveReaddir(basePath, excludedDirs, includeDirs) {
  if (!Array.isArray(excludedDirs)) excludedDirs = [];
  
  let currentExcludeDirs = excludedDirs.filter(x => !x.includes('/'));
  
  let contents = (await fs.promises.readdir(basePath, { withFileTypes: true }))
    .filter(x => !currentExcludeDirs.includes(x.name));
  
  var folders = [], files = [];
  
  contents.forEach(x => x.isDirectory() ? folders.push(x) : files.push(x));
  
  if (includeDirs) {
    return [
      '.',
      ...(await Promise.all(folders.map(async x =>
        (await _recursiveReaddir(
          basePath + '/' + x.name,
          excludedDirs
            .filter(x => x.startsWith(x))
            .map(x => x.split('/').slice(1).join('/')),
          includeDirs
        ))
        .map(y => (x.name + '/' + y).replace(/\/\.$/, ''))
      )))
      .reduce((a, c) => (a.push(...c), a), []),
      ...files.map(x => x.name),
    ];
  } else {
    return [
      ...(await Promise.all(folders.map(async x =>
        (await _recursiveReaddir(
          basePath + '/' + x.name,
          excludedDirs
            .filter(x => x.startsWith(x))
            .map(x => x.split('/').slice(1).join('/')),
          includeDirs
        ))
        .map(y => (x.name + '/' + y))
      )))
      .reduce((a, c) => (a.push(...c), a), []),
      ...files.map(x => x.name),
    ];
  }
}

async function _getAllEntriesInDir(basePath, excludedDirs) {
  return await Promise.all(
    (await _recursiveReaddir(basePath, excludedDirs, true))
      .map(async x => {
        let stat = await fs.promises.stat(path.join(basePath, x), { bigint: true });
        
        let entryType;
        if (stat.isDirectory()) entryType = 'directory';
        else if (stat.isFile()) entryType = 'file';
        else throw new Error(`Invalid entry type for ${basePath}/${x}: ${(stat.isBlockDevice() ? 'Block Device' : stat.isCharacterDevice() ? 'Character Device' : stat.isFIFO() ? 'FIFO' : stat.isSocket() ? 'Socket' : stat.isSymbolicLink() ? 'Symbolic Link' : stat.mode)}`);
        
        return {
          path: x,
          type: entryType,
          atime: _nsTimeToString(stat.atimeNs),
          mtime: _nsTimeToString(stat.mtimeNs),
          ctime: _nsTimeToString(stat.ctimeNs),
          birthtime: _nsTimeToString(stat.birthtimeNs),
        };
      })
  );
}

async function _setFileTimes(fileTimesArr) {
  if (process.platform == 'win32') {
    let envVars = {};
    
    let commandString =
      '$ErrorActionPreference = "Stop"\n' +
      fileTimesArr.map((x, i) => {
        let [ filePath, atime, mtime, birthtime ] = x;
        
        let atimeUTC = _stringToUTCTimeString(atime),
          mtimeUTC = _stringToUTCTimeString(mtime),
          birthtimeUTC = _stringToUTCTimeString(birthtime);
        
        envVars['C284_' + i + 'F'] = filePath;
        envVars['C284_' + i + 'C'] = birthtimeUTC;
        envVars['C284_' + i + 'M'] = mtimeUTC;
        envVars['C284_' + i + 'A'] = atimeUTC;
        
        return `$file = Get-Item $Env:C284_${i}F\n` +
          `$file.CreationTime = Get-Date $Env:C284_${i}C\n` +
          `$file.LastWriteTime = Get-Date $Env:C284_${i}M\n` +
          `$file.LastAccessTime = Get-Date $Env:C284_${i}A`;
      }).join('\n');
    
    return await _procPromisify('powershell', ['-Command', '-'], envVars, commandString);
  } else {
    let commandString =
      'set -e\n' +
      fileTimesArr.map(x => {
        let [ filePath, atime, mtime, birthtime ] = x;
        
        let atimeUTC = _stringToUTCTimeString(atime),
          mtimeUTC = _stringToUTCTimeString(mtime);
        
        envVars['C284_' + i + 'F'] = filePath;
        envVars['C284_' + i + 'M'] = mtimeUTC;
        envVars['C284_' + i + 'A'] = atimeUTC;
        
        return `touch -m -d $C284_${i}M $C284_${i}F\n` +
          `touch -a -d $C284_${i}A $C284_${i}F`;
      }).join('\n');
    
    return await _procPromisify('bash', ['-'], envVars, commandString);
  }
}

module.exports = {
  _checkPathIsDir,
  _recursiveReaddir,
  _getAllEntriesInDir,
  _setFileTimes,
};
