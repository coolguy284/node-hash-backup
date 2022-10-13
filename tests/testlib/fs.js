let fs = require('fs');
let path = require('path');

let { _getAllEntriesInDir } = require('../../src/lib/fs');

module.exports = async function getFilesAndMetaInDir(basePath, excludedDirs) {
  let dirContents = await _getAllEntriesInDir(basePath, excludedDirs);
  
  return await Promise.all(
    dirContents
      .sort((a, b) => a > b ? 1 : a < b ? -1 : 0)
      .map(async x => {
        x.bytes = x.type == 'file' ? await fs.promises.readFile(path.join(basePath, x.path)) : null;
        return x;
      })
  );
};
