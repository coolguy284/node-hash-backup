/*
  returned format:
  {
    subCommands: Array<String>,
    keyedArgs: Map<String, String>,
    presentOnlyArgs: Set<String>,
    allPresentArgs: Set<String>,
  }
*/
export function parseArgs(args) {
  let subCommands = [];
  let remainingArgs;
  
  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i];
    
    if (!/^--/.test(currentArg)) {
      subCommands.push(currentArg);
    } else {
      remainingArgs = args.slice(i);
      break;
    }
  }
  
  let keyedArgs = new Map();
  let presentOnlyArgs = new Set();
  let allPresentArgs = new Set();
  
  while (remainingArgs.length > 0) {
    const currentArg = remainingArgs.shift();
    
    let match;
    
    if ((match = /^--([^=]*)=(.*)$/s.exec(currentArg)) != null) {
      // --key=value format
      const [ key, value ] = match.slice(1);
      
      if (allPresentArgs.has(key)) {
        throw new Error(`duplicate argument key: ${JSON.stringify(key)}`);
      }
      
      keyedArgs.set(key, value);
      allPresentArgs.add(key);
    } else if ((match = /^--([^=]*)$/s.exec(currentArg)) != null) {
      // --key format, possibly followed by a value as the next arg or just a key only property
      const [ key ] = match.slice(1);
      
      if (allPresentArgs.has(key)) {
        throw new Error(`duplicate argument key: ${JSON.stringify(key)}`);
      }
      
      if (remainingArgs.length == 0 || /^--(?:[^=]*)(?:=(.*))?$/s.test(remainingArgs[0])) {
        // arg is a key only property
        presentOnlyArgs.add(key);
      } else {
        // arg is followed by a value
        const value = remainingArgs.shift();
        keyedArgs.set(key, value);
      }
      
      allPresentArgs.add(key);
    } else {
      throw new Error(`unrecognized or misplaced command line parameter: ${JSON.stringify(currentArg)}`);
    }
  }
  
  return {
    subCommands,
    keyedArgs,
    presentOnlyArgs,
    allPresentArgs,
  };
}
