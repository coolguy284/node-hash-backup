import { spawn } from 'node:child_process';

export async function callProcess({
  processName,
  processArguments = [],
  environmentVars = null,
  stdin = Buffer.alloc(0),
  timeout = 60_000,
}) {
  if (typeof processName != 'string') {
    throw new Error(`processName not string: ${typeof processName}`);
  }
  
  if (!Array.isArray(processArguments)) {
    throw new Error(`processArguments not array: ${processArguments}`);
  }
  
  for (let i = 0; i < processArguments.length; i++) {
    if (typeof processArguments[i] != 'string') {
      throw new Error(`processArguments[${i}] not string: ${typeof processArguments[i]}`);
    }
  }
  
  if (!Array.isArray(processArguments)) {
    throw new Error(`processArguments not array: ${processArguments}`);
  }
  
  for (let i = 0; i < processArguments.length; i++) {
    if (typeof processArguments[i] != 'string') {
      throw new Error(`processArguments[${i}] not string: ${typeof processArguments[i]}`);
    }
  }
  
  for (const key in environmentVars) {
    if (typeof environmentVars[key] != 'string') {
      throw new Error(`environmentVars[${key}] not string: ${typeof environmentVars[key]}`);
    }
  }
  
  if (!(stdin instanceof Uint8Array) && typeof stdin != 'string') {
    throw new Error(`stdin not Uint8Array or string: ${stdin}`);
  }
  
  if (!Number.isFinite(timeout) || timeout < 0 && timeout != null) {
    throw new Error(`timeout invalid: ${timeout}`);
  }
  
  return await new Promise((r, j) => {
    const childProcess = spawn(
      processName,
      processArguments,
      {
        stdio: 'pipe',
        ...(
          timeout != null ?
            { timeout } :
            {}
        ),
        ...(
          environmentVars ?
            { env: environmentVars } :
            {}
        ),
      }
    );
    
    childProcess.stdin.end(stdin);
    
    let stdoutBufs = [], stderrBufs = [];
    
    childProcess.stdout.on('data', c => stdoutBufs.push(c));
    childProcess.stderr.on('data', c => stderrBufs.push(c));
    
    childProcess.on('close', code => {
      const stdout =
        Buffer.concat(stdoutBufs)
          .toString()
          .trim();
      
      if (code == 0) {
        r(stdout);
      } else {
        const stderr =
          Buffer.concat(stderrBufs)
            .toString()
            .trim();
        
        j(new Error(
          `process failed with exit code ${code}\n` +
          `stdout:\n${stdout}\n` +
          `stderr:\n${stderr}`
        ));
      }
    });
  });
}
