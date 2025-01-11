import { parseArgs } from '../lib/command_line.mjs';

import { COMMANDS } from './command_info.mjs';
import {
  getVersionString,
  mainHelpText,
} from './help_info.mjs';
import {
  deleteBackup,
  deleteBackupDir,
  getBackupInfo,
  getEntryInfo,
  getFolderContents,
  getSubtree,
  getFileStreamByBackupPath,
  initBackupDir,
  performBackup,
  performRestore,
  pruneUnreferencedFiles,
  renameBackup,
  startInteractiveSession,
} from '../backup_manager/backup_helper_funcs.mjs';

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
    if (!commandArgs.data.has(argName)) {
      throw new Error(`unrecognized argument: --${argName}`);
    }
    
    const {
      originalName,
      presenceOnly,
      conversion,
    } = commandArgs.data.get(argName);
    
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
      
      // keyedArgs must have argName property here
      
      parsedKeyedArgs.set(originalName, convertArgIfNeeded(keyedArgs.get(argName), conversion));
    }
  }
  
  for (const keyedArgName of commandArgs.keyedArgs) {
    if (!parsedKeyedArgs.has(keyedArgName)) {
      const {
        required,
        defaultValue,
        conversion,
      } = commandArgs.data.get(keyedArgName);
      
      if (required) {
        throw new Error(`argument ${JSON.stringify(keyedArgName)} is a required key-value argument`);
      } else {
        if (defaultValue != null) {
          parsedKeyedArgs.set(keyedArgName, convertArgIfNeeded(defaultValue, conversion));
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
    const { args } = COMMANDS.get(null);
    
    commandName = null;
    
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
    if (COMMANDS.has(subCommands[0])) {
      const {
        originalName,
        args,
        subCommandArgs,
      } = COMMANDS.get(subCommands[0]);
      
      commandName = originalName;
      
      if (commandName == 'help') {
        if (subCommands.length == 1) {
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
        } else if (subCommands.length == 2) {
          subCommand = subCommands[1];
          
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
        if (subCommands.length == 1) {
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
        if (keyedArgs.get('confirm') != 'yes') {
          throw new Error(`confirm must be set to "yes" to allow backup dir deletion, but was: ${JSON.stringify(keyedArgs.get('confirm'))}`);
        }
        
        await deleteBackupDir({
          backupDir: keyedArgs.get('backupDir'),
          confirm: true,
          logger,
        });
        break;
      
      case 'info': {
        const info = await getBackupInfo({
          backupDir: keyedArgs.get('backupDir'),
          name: keyedArgs.get('name'),
        });
        
        if (keyedArgs.has('name')) {
          // single backup info
          // TODO
        } else {
          // full backup dir info
          // TODO
        }
        break;
      }
      
      case 'backup':
        await performBackup({
          backupDir: keyedArgs.get('backupDir'),
          name: keyedArgs.get('name'),
          basePath: keyedArgs.get('basePath'),
          excludedFilesOrFolders: keyedArgs.get('excludedItems'),
          allowBackupDirSubPathOfFileOrFolderPath: keyedArgs.get('allowBackupDirSubPathOfFileOrFolderPath'),
          symlinkMode: keyedArgs.get('symlinkHandling').toUpperCase(),
          inMemoryCutoffSize: keyedArgs.get('inMemoryCutoff'),
          compressionMinimumSizeThreshold: keyedArgs.get('compressionMinimumSizeThreshold'),
          compressionMaximumSizeThreshold: keyedArgs.get('compressionMaximumSizeThreshold'),
          checkForDuplicateHashes: keyedArgs.get('checkDuplicateHashes'),
          ignoreErrors: keyedArgs.get('ignoreErrors'),
          logger,
        });
        break;
      
      case 'restore':
        await performRestore({
          backupDir: keyedArgs.get('backupDir'),
          name: keyedArgs.get('name'),
          basePath: keyedArgs.get('restorePath'),
          backupFileOrFolderPath: keyedArgs.get('pathToEntry'),
          excludedFilesOrFolders: keyedArgs.get('excludedItems'),
          symlinkMode: keyedArgs.get('symlinkHandling').toUpperCase(),
          inMemoryCutoffSize: keyedArgs.get('imMemoryCutoff'),
          setFileTimes: keyedArgs.get('setFileTimes'),
          createParentFolders: keyedArgs.get('createParentFolders'),
          overwriteExistingRestoreFolderOrFile: keyedArgs.get('overwriteExisting'),
          verifyFileHashOnRetrieval: keyedArgs.get('verify'),
          logger,
        });
        break;
      
      case 'deleteBackup':
        await deleteBackup({
          backupDir: keyedArgs.get('backupDir'),
          name: keyedArgs.get('name'),
          pruneReferencedFilesAfter: keyedArgs.get('pruneFilesAfter'),
          confirm: keyedArgs.get('confirm') == 'yes',
          logger,
        });
        break;
      
      case 'renameBackup':
        await renameBackup({
          backupDir: keyedArgs.get('backupDir'),
          oldName: keyedArgs.get('oldName'),
          newName: keyedArgs.get('newName'),
          logger,
        });
        break;
      
      case 'getFolderContents':
        // TODO
        break;
      
      case 'getEntryInfo':
        // TODO
        break;
      
      case 'getSubtree':
        // TODO
        break;
      
      case 'getRawFileContents':
        // TODO
        break;
      
      case 'pruneBackupDir':
        // TODO
        break;
      
      case 'interactive':
        // TODO
        break;
      
      default:
        throw new Error(`support for command ${JSON.stringify(commandName)} not implemented`);
    }
  }
  
  logger();
}
