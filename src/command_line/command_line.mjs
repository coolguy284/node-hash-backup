import { parseArgs } from '../lib/command_line.mjs';

import { COMMANDS } from './command_info.mjs';
import {
  getVersionString,
  mainHelpText,
} from './help_info.mjs';
import { initBackupDir } from '../backup_manager/backup_helper_funcs.mjs';

function convertArgIfNeeded(argValue, conversionFunc) {
  if (conversionFunc != null) {
    return conversionFunc(argValue);
  } else {
    return argValue;
  }
}

function validateCommandArgCall({
  commandArgs,
  allPresentArgs,
  keyedArgs,
  presentOnlyArgs,
}) {
  let handledArgNames = new Set();
  let parsedKeyedArgs = new Map();
  let parsedPresentOnlyArgs = new Set();
  
  for (const argName of allPresentArgs) {
    if (!commandArgs.has(argName)) {
      throw new Error(`unrecognized argument: --${argName}`);
    }
    
    const {
      originalName,
      presenceOnly,
      required,
      defaultValue,
      conversion,
    } = commandArgs.get(argName);
    
    if (handledArgNames.has(originalName)) {
      throw new Error(`duplicate aliases of argument ${JSON.stringify(originalName)}`);
    }
    
    handledArgNames.add(originalName);
    
    if (presenceOnly) {
      if (keyedArgs.has(argName)) {
        throw new Error(`argument ${JSON.stringify(argName)} is a presence-only argument`);
      }
      
      parsedPresentOnlyArgs.add(originalName);
    } else {
      if (presentOnlyArgs.has(argName)) {
        throw new Error(`argument ${JSON.stringify(argName)} is a key-value argument`);
      }
      
      if (keyedArgs.has(argName)) {
        parsedKeyedArgs.set(originalName, convertArgIfNeeded(keyedArgs.get(argName), conversion));
      } else {
        if (required) {
          throw new Error(`argument ${JSON.stringify(argName)} | ${JSON.stringify(originalName)} is a required key-value argument`);
        } else {
          if (defaultValue != null) {
            parsedKeyedArgs.set(originalName, convertArgIfNeeded(defaultValue, conversion));
          }
        }
      }
    }
  }
  
  return {
    parsedKeyedArgs,
    parsedPresentOnlyArgs,
  };
}

function validateAndExtendedParseCommandCall({
  subCommands,
  allPresentArgs,
  keyedArgs,
  presentOnlyArgs,
}) {
  let commandName;
  let subCommand = null;
  let parsedKeyedArgs;
  let parsedPresentOnlyArgs;
  
  if (subCommands.length == 0) {
    commandName = null;
  } else {
    if (COMMANDS.has(subCommands[0])) {
      const {
        originalName,
        args,
        subCommandArgs,
      } = COMMANDS.get(subCommands[0]);
      
      commandName = originalName;
      
      if (commandName == 'help') {
        if (subCommands.length == 0) {
          (
            {
              parsedKeyedArgs,
              parsedPresentOnlyArgs,
            } = validateCommandArgCall({
              commandArgs: args,
              allPresentArgs,
              keyedArgs,
              presentOnlyArgs,
            })
          );
        } else if (subCommands.length == 1) {
          subCommand = subCommands[0];
          
          (
            {
              parsedKeyedArgs,
              parsedPresentOnlyArgs,
            } = validateCommandArgCall({
              commandArgs: subCommandArgs,
              allPresentArgs,
              keyedArgs,
              presentOnlyArgs,
            })
          );
        } else {
          throw new Error(`unrecognized command: ${JSON.stringify(subCommands)}`);
        }
      } else {
        if (subCommands.length == 0) {
          
          (
            {
              parsedKeyedArgs,
              parsedPresentOnlyArgs,
            } = validateCommandArgCall({
              commandArgs: args,
              allPresentArgs,
              keyedArgs,
              presentOnlyArgs,
            })
          );
        } else {
          throw new Error(`unrecognized command: ${JSON.stringify(subCommands)}`);
        }
      }
    } else {
      throw new Error(`unrecognized command: ${JSON.stringify(subCommands)}`);
    }
  }
  
  return {
    commandName,
    subCommand,
    keyedArgs: parsedKeyedArgs,
    presentOnlyArgs: parsedPresentOnlyArgs,
  };
}

function printHelp({
  subCommand = null,
  logger = console.log,
} = {}) {
  if (subCommand == null) {
    logger(mainHelpText);
  } else {
    if (subCommand == 'none') {
      subCommand = null;
    }
    
    if (COMMANDS.has(subCommand)) {
      logger(COMMANDS.get(subCommand).helpMsg);
    } else {
      throw new Error(`help lookup error: command unknown: ${JSON.stringify(subCommand)}`);
    }
  }
}

function printVersion({ logger = console.log }) {
  logger(getVersionString());
}

export async function executeCommandLine({
  args = process.argv.slice(2),
  logger = console.log,
} = {}) {
  const {
    commandName,
    subCommand,
    keyedArgs,
    presentOnlyArgs,
  } = validateAndExtendedParseCommandCall(parseArgs(args));
  
  logger();
  
  if (commandName == null) {
    // called without a command
    
    if (presentOnlyArgs.size == 2) {
      throw new Error('cannot have both --help and --version present');
    }
    
    if (presentOnlyArgs.size == 0 || presentOnlyArgs.has('help')) {
      printHelp({ logger });
    } else {
      // --version arg
      printVersion({ logger });
    }
  } else {
    switch (commandName) {
      case 'version':
        printVersion({ logger });
        break;
      
      case 'help':
        if (subCommand != null) {
          printHelp({ subCommand, logger });
        } else if (keyedArgs.has('command')) {
          printHelp({
            logger,
            subCommand: keyedArgs.get('command'),
          });
        } else {
          printHelp({ logger });
        }
        break;
      
      case 'init': {
        const compressAlgo = keyedArgs.get('compressAlgo');
        
        let compressParams;
        
        if (keyedArgs.has('compressParams')) {
          compressParams = keyedArgs.get('compressParams');
        }
        
        if (keyedArgs.has('compressLevel')) {
          if (compressParams == null) {
            compressParams = {};
          }
          
          compressParams.level = keyedArgs.get('compressLevel');
        }
        
        await initBackupDir({
          backupDir: keyedArgs.get('backupDir'),
          hash: keyedArgs.get('hashAlgo'),
          hashSlices: keyedArgs.get('hashSlices'),
          hashSliceLength: keyedArgs.get('hashSliceLength'),
          compressAlgo: compressAlgo == 'none' ? null : compressAlgo,
          compressParams,
          logger,
        });
        break;
      }
      
      case 'deleteAll':
        // TODO
        break;
      
      case 'backup':
        // TODO
        break;
      
      case 'restore':
        // TODO
        break;
      
      case 'info':
        // TODO
        break;
      
      default:
        throw new Error(`support for command ${JSON.stringify(commandName)} not implemented`);
    }
  }
  
  logger();
}
