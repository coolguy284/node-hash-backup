export const DEFAULT_APPROXIMATE_MAX_LINE_LENGTH = 90;

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
  let remainingArgs = null;
  
  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i];
    
    if (!/^--/.test(currentArg)) {
      subCommands.push(currentArg);
    } else {
      remainingArgs = args.slice(i);
      break;
    }
  }
  
  remainingArgs = remainingArgs ?? [];
  
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

export function splitLongLinesByWord(output, approximateMaxLineLength = DEFAULT_APPROXIMATE_MAX_LINE_LENGTH) {
  if (typeof output != 'string') {
    throw new Error(`output not string: ${typeof output}`);
  }
  
  return output
    .split('\n')
    .flatMap(line => {
      if (line.length > approximateMaxLineLength) {
        let startingSpaces;
        
        for (startingSpaces = 0; startingSpaces < line.length; startingSpaces++) {
          if (line[startingSpaces] != ' ') {
            break;
          }
        }
        
        const workingMaxLineLength = approximateMaxLineLength - startingSpaces;
        
        const words = line.slice(startingSpaces).split(' ');
        
        let lines = [];
        
        for (const word of words) {
          if (lines.length == 0) {
            lines.push(word);
          } else {
            if (lines.at(-1).length < workingMaxLineLength) {
              lines[lines.length - 1] = lines.at(-1) + ' ' + word;
            } else {
              lines.push(word);
            }
          }
        }
        
        return lines.map(subLine => ' '.repeat(startingSpaces) + subLine);
      } else {
        return [line];
      }
    })
    .join('\n');
}

export function formatWithEvenColumns(lines) {
  let outputLines = [];
  
  for (let line of lines) {
    if (line == null) {
      line = [];
    } else if (typeof line == 'string') {
      line = [line];
    }
    
    if (line.length == 0) {
      outputLines.push('');
    } else if (line.length == 1) {
      outputLines.push(line[0]);
    } else if (line.length == 2) {
      outputLines.push(line);
    } else {
      throw new Error(`line length over 2 (${line.length}) not supported`);
    }
  }
  
  const doubleOutputLines = outputLines.filter(line => Array.isArray(line));
  
  let maxPropertyLength;
  
  if (doubleOutputLines.length > 0) {
    maxPropertyLength =
      doubleOutputLines
        .map(([ propertyName, _ ]) => propertyName.length)
        .reduce((currentLength, newLength) => Math.max(currentLength, newLength));
  }
  
  return outputLines
    .map(line => {
      if (!Array.isArray(line)) {
        return line;
      } else {
        const [ propertyName, propertyValue ] = line;
        return `${`${propertyName}:`.padEnd(maxPropertyLength + 1)}  ${propertyValue}`;
      }
    })
    .join('\n');
}
