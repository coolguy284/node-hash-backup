let fs = require('fs');
let path = require('path');
let zlib = require('zlib');

function _getFileHashSlices(fileHash, hashSlices, hashSliceLength) {
  let slices = [];
  
  for (let i = 0; i < hashSlices; i++)
    slices.push(fileHash.slice(i * hashSliceLength, (i + 1) * hashSliceLength));
  
  return slices;
}

function _getFilePathFromBackup(backupDirInfo, fileHash, slices) {
  if (!Array.isArray(slices))
    slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  
  return path.join('files', ...slices, fileHash);
}

function _getFileMetaPathFromBackup(backupDirInfo, fileHash, slices) {
  if (!Array.isArray(slices))
    slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  
  return path.join('files_meta', ...slices.slice(0, -1), slices[slices.length - 1] + '.json');
}

async function _getFileFromBackup(backupDir, backupDirInfo, fileHash) {
  let slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  let filePath = path.join(backupDir, _getFilePathFromBackup(backupDirInfo, fileHash, slices));
  let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, fileHash, slices));
  
  let fileMetaJSON;
  try {
    fileMetaJSON = JSON.parse((await fs.promises.readFile(fileMetaPath)).toString());
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
    return null;
  }
  
  let fileMeta = fileMetaJSON[fileHash];
  
  if (fileMeta == null) return null;
  
  let processedFileBytes = await fs.promises.readFile(filePath);
  
  if (fileMeta.compression) {
    let fileBytes;
    switch (fileMeta.compression.algorithm) {
      case 'deflate':
        fileBytes = await new Promise((r, j) => {
          zlib.inflate(
            processedFileBytes,
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'gzip':
        fileBytes = await new Promise((r, j) => {
          zlib.gunzip(
            processedFileBytes,
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'brotli':
        fileBytes = await new Promise((r, j) => {
          zlib.brotliDecompress(
            processedFileBytes,
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      default:
        throw new Error(`Error: invalid compression algorithm ${backupDirInfo.compression.algorithm}`);
    }
    return fileBytes;
  } else {
    return processedFileBytes;
  }
}

async function _setFileToBackup(backupDir, backupDirInfo, fileHash, fileBytes) {
  let slices = _getFileHashSlices(fileHash, backupDirInfo.hashSlices, backupDirInfo.hashSliceLength);
  let filePath = path.join(backupDir, _getFilePathFromBackup(backupDirInfo, fileHash, slices));
  let fileMetaPath = path.join(backupDir, _getFileMetaPathFromBackup(backupDirInfo, fileHash, slices));
  
  let fileMetaJSON;
  try {
    fileMetaJSON = Object.entries(JSON.parse((await fs.promises.readFile(fileMetaPath)).toString()));
  } catch (e) {
    if (e.code != 'ENOENT') throw e;
    fileMetaJSON = [];
  }
  
  let storeBytes, resultAlgo;
  if (backupDirInfo.compression) {
    switch (backupDirInfo.compression.algorithm) {
      case 'deflate':
        storeBytes = await new Promise((r, j) => {
          zlib.deflate(
            fileBytes,
            { level: backupDirInfo.compression.level },
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'gzip':
        storeBytes = await new Promise((r, j) => {
          zlib.gzip(
            fileBytes,
            { level: backupDirInfo.compression.level },
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      case 'brotli':
        storeBytes = await new Promise((r, j) => {
          zlib.brotliCompress(
            fileBytes,
            { level: backupDirInfo.compression.level },
            (err, res) => { if (err) j(err); else r(res); }
          );
        });
        break;
      default:
        throw new Error(`Error: invalid compression algorithm ${backupDirInfo.compression.algorithm}`);
    }
    
    if (storeBytes.length >= fileBytes.length) {
      console.debug(`Not compressed with ${backupDirInfo.compression.algorithm} as file increases or stays the same size from ${fileBytes.length} to ${storeBytes.length} bytes`);
      storeBytes = fileBytes;
      resultAlgo = null;
    } else {
      console.debug(`Compressed with ${backupDirInfo.compression.algorithm} from ${fileBytes.length} to ${storeBytes.length} bytes`);
      resultAlgo = { algorithm: backupDirInfo.compression.algorithm };
    }
  } else {
    console.debug(`File size ${fileBytes.length}.`);
    storeBytes = fileBytes;
  }
  
  fileMetaJSON.push([
    fileHash,
    {
      size: fileBytes.length,
      ...(resultAlgo ? {
        compressedSize: storeBytes.length,
        compression: resultAlgo,
      } : {}),
    }
  ]);
  
  fileMetaJSON.sort((a, b) => a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0);
  
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, storeBytes);
  
  await fs.promises.mkdir(path.dirname(fileMetaPath), { recursive: true });
  await fs.promises.writeFile(fileMetaPath + '_new', JSON.stringify(Object.fromEntries(fileMetaJSON), null, 2));
  await fs.promises.rename(fileMetaPath + '_new', fileMetaPath);
}

module.exports = {
  _getFileHashSlices,
  _getFilePathFromBackup,
  _getFileMetaPathFromBackup,
  _getFileFromBackup,
  _setFileToBackup,
};
