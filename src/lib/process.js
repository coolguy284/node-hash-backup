let cp = require('child_process');

module.exports = function _procPromisify(procName, args, envVars, stdin) {
  let proc = cp.spawn(procName, args, { stdio: 'pipe', timeout: 60000, ...(envVars != null ? { env: envVars } : {}) });
  
  if (stdin != null) proc.stdin.end(stdin);
  
  return new Promise((resolve, reject) => {
    let outputBufs = [], errorBufs = [];
    
    proc.stdout.on('data', c => outputBufs.push(c));
    proc.stderr.on('data', c => errorBufs.push(c));
    
    proc.on('close', code => {
      switch (code) {
        case 0:
          resolve(Buffer.concat(outputBufs).toString().trim());
          break;
        
        default:
          reject(new Error(Buffer.concat(errorBufs).toString().trim()));
          break;
      }
    });
  });
};
