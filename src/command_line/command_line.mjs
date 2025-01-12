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
  runInteractiveSession,
} from '../backup_manager/backup_helper_funcs.mjs';
import {
  formatWithEvenColumns,
  parseArgs,
} from '../lib/command_line.mjs';
import { humanReadableSizeString } from '../lib/fs.mjs';

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

// assumes that local time is always an integer number of seconds offset from UTC
function formatUnixSecStringAsDate(unixSecString) {
  // TODO: convert to 12hr format
  const [ intSecs, fracSecs ] = unixSecString.split('.');
  
  if (fracSecs != null) {
    const simplifiedFracSecs = fracSecs.replace(/0+$/, '');
    
    if (simplifiedFracSecs == '') {
      return new Date(parseInt(intSecs) * 1_000).toString();
    } else {
      let baseDateString;
      
      if (intSecs.startsWith('-')) {
        // intSecs as -4.3 secs since epoch should be treated as -5
        // with some decimals added to the seconds after stringification
        baseDateString = new Date((parseInt(intSecs) - 1) * 1_000).toString();
      } else {
        baseDateString = new Date(parseInt(intSecs) * 1_000).toString();
      }
      
      let match;
      
      if ((match = /^(.+\d{2}:\d{2}:\d{2})(.+)$/.exec(baseDateString)) != null) {
        const [ start, end ] = match.slice(1);
        
        return `${start}.${simplifiedFracSecs}${end}`;
      } else {
        // date string does not match format, abort and return base date stringification
        return baseDateString;
      }
    }
  } else {
    return new Date(parseInt(intSecs) * 1_000).toString();
  }
}

function getUIOutputOfBackupEntry(properties, entry) {
  properties.push(['Path', JSON.stringify(entry.path)]);
  properties.push(['Type', entry.type]);
  properties.push(['Attributes', entry.attributes != null ? entry.attributes.join(', ') : 'none']);
  properties.push(['Access Time', `${formatUnixSecStringAsDate(entry.atime)} (${entry.atime})`]);
  properties.push(['Modify Time', `${formatUnixSecStringAsDate(entry.mtime)} (${entry.mtime})`]);
  properties.push(['Change Time', `${formatUnixSecStringAsDate(entry.ctime)} (${entry.ctime})`]);
  properties.push(['Creation Time', `${formatUnixSecStringAsDate(entry.birthtime)} (${entry.birthtime})`]);
  
  switch (entry.type) {
    case 'directory':
      // no extra info
      break;
    
    case 'symbolic link':
      properties.push(['Symlink Type', `${entry.symlinkType ?? 'unspecified'}`]);
      properties.push(['Symlink Path (Base64)', `${entry.symlinkPath}`]);
      properties.push(['Symlink Path (Raw)', `${JSON.stringify(Buffer.from(entry.symlinkPath, 'base64').toString())}`]);
      break;
    
    case 'file':
      properties.push(['Hash', entry.hash]);
      properties.push(['Size', humanReadableSizeString(entry.size)]);
      properties.push(['Compressed Size', humanReadableSizeString(entry.compressedSize)]);
      break;
    
    default:
      throw new Error(`unknown type: ${entry.type}`);
  }
}

function formatTree(subtreePaths, formatParams) {
  const { indent = 2 } = formatParams ?? {};
  
  if (subtreePaths.length == 0) {
    return [];
  } else {
    // unicode chars definitely not taken from the windows "tree" command:
    // ─└├│
    
    const root = subtreePaths[0];
    const remainingEntries = subtreePaths.slice(1).map(subtreePath => {
      const [ base, ...restArray ] = subtreePath.split('/');
      return [base, restArray.length == 0 ? null : restArray.join('/')];
    });
    let groupedEntries = [];
    
    for (const [ base, rest ] of remainingEntries) {
      if (groupedEntries.length > 0) {
        let lastEntry = groupedEntries.at(-1);
        
        if (lastEntry.base == base) {
          if (rest != null) {
            lastEntry.contents.push(rest);
          }
        } else {
          groupedEntries.push({
            base,
            contents: rest != null ? [rest] : [],
          });
        }
      } else {
        groupedEntries.push({
          base,
          contents: rest != null ? [rest] : [],
        });
      }
    }
    
    return [
      root,
      ...groupedEntries.map(
        ({ base, contents }, groupIndex) =>
          formatTree([base, ...contents], formatParams)
            .map((formattedEntry, contentIndex) => {
              const lastGroup = groupIndex == groupedEntries.length - 1;
              const firstContent = contentIndex == 0;
              
              let addlCharacters;
              
              if (lastGroup) {
                if (firstContent) {
                  addlCharacters = '└' + '─'.repeat(indent - 1);
                } else {
                  addlCharacters = ' '.repeat(indent);
                }
              } else {
                if (firstContent) {
                  addlCharacters = '├' + '─'.repeat(indent - 1);
                } else {
                  addlCharacters = '│' + ' '.repeat(indent - 1);
                }
              }
              
              return addlCharacters + formattedEntry;
            })
      ),
    ].flat();
  }
}

export async function executeCommandLine({
  args = process.argv.slice(2),
  logger = console.log,
  extraneousLogger = console.error,
} = {}) {
  const {
    commandName,
    subCommand,
    keyedArgs,
    presentOnlyArgs,
  } = validateAndExtendedParseCommandCall(parseArgs(args));
  
  extraneousLogger();
  
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
            subCommand: keyedArgs.get('command'),
            logger,
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
          logger: extraneousLogger,
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
      
      case 'getFolderContents': {
        const backupDir = keyedArgs.get('backupDir');
        const name = keyedArgs.get('name');
        const pathToFolder = keyedArgs.get('pathToFolder');
        
        const folderContents = await getFolderContents({
          backupDir,
          name,
          pathToFolder,
          logger: extraneousLogger,
        });
        
        logger(`Contents of backup ${JSON.stringify(backupDir)}, name ${JSON.stringify(name)}, path ${JSON.stringify(pathToFolder)}:`);
        logger(
          folderContents
            .map(fileName => JSON.stringify(fileName))
            .join('\n')
        );
        break;
      }
      
      case 'getEntryInfo': {
        const backupDir = keyedArgs.get('backupDir');
        const name = keyedArgs.get('name');
        const pathToEntry = keyedArgs.get('pathToEntry');
        
        const entry = await getEntryInfo({
          backupDir,
          name,
          pathToEntry,
          logger: extraneousLogger,
        });
        
        let properties = [];
        
        properties.push(['Backup', JSON.stringify(backupDir)]);
        properties.push(['Name', JSON.stringify(name)]);
        
        getUIOutputOfBackupEntry(properties, entry);
        
        logger(formatWithEvenColumns(properties));
        break;
      }
      
      case 'getSubtree': {
        const backupDir = keyedArgs.get('backupDir');
        const name = keyedArgs.get('name');
        const pathToEntry = keyedArgs.get('pathToEntry');
        const treeIndent = keyedArgs.get('treeIndent');
        if (treeIndent < 1) {
          throw new Error(`treeIndent must be >= 1 but was: ${treeIndent}`);
        }
        
        const subtreeEntries = await getSubtree({
          backupDir,
          name,
          pathToEntry,
          logger,
        });
        
        const withEntries = keyedArgs.get('withEntries');
        
        if (withEntries) {
          {
            let properties = [];
            
            properties.push(['Backup', JSON.stringify(backupDir)]);
            properties.push(['Name', JSON.stringify(name)]);
            
            logger('Backup Info:');
            logger(formatWithEvenColumns(properties));
            logger();
          }
          
          let subtreeProperties = [];
          
          for (const entry of subtreeEntries) {
            let entryProperties = [];
            getUIOutputOfBackupEntry(entryProperties, entry);
            subtreeProperties.push(entryProperties);
          }
          
          let newSubtreeProperties = [];
          
          for (let i = 0; i < subtreeProperties.length; i++) {
            const lastElem = i == subtreeProperties.length - 1;
            
            newSubtreeProperties.push(subtreeProperties[i]);
            
            if (!lastElem) {
              newSubtreeProperties.push('');
            }
          }
          
          logger('Subtree Entry Info:');
          logger();
          logger(formatWithEvenColumns(newSubtreeProperties.flat()));
        } else {
          {
            let properties = [];
            
            properties.push(['Backup', JSON.stringify(backupDir)]);
            properties.push(['Name', JSON.stringify(name)]);
            
            logger('Backup Info:');
            logger(formatWithEvenColumns(properties));
            logger();
          }
          
          logger(`Tree of ${JSON.stringify(pathToEntry)}:`);
          logger();
          const treeLines = formatTree(subtreeEntries.map(({ path }) => path), { indent: treeIndent });
          logger(treeLines.join('\n'));
        }
        break;
      }
      
      case 'getRawFileContents': {
        const stream = await getFileStreamByBackupPath({
          backupDir: keyedArgs.get('backupDir'),
          name: keyedArgs.get('name'),
          pathToFile: keyedArgs.get('pathToFile'),
          verify: keyedArgs.get('verify'),
          logger: extraneousLogger,
        });
        
        stream.pipe(process.stdout);
        break;
      }
      
      case 'pruneBackupDir':
        await pruneUnreferencedFiles({
          backupDir: keyedArgs.get('backupDir'),
          logger,
        });
        break;
      
      case 'interactive':
        await runInteractiveSession({
          backupDir: keyedArgs.get('backupDir'),
          custom: keyedArgs.get('custom'),
          logger: extraneousLogger,
        });
        break;
      
      default:
        throw new Error(`support for command ${JSON.stringify(commandName)} not implemented`);
    }
  }
  
  extraneousLogger();
}

export async function executeCommandLineCollectOutput(args, {
  mergeArraysIntoStrings = true,
} = {}) {
  let logLines = [];
  let extraneousLogLines = [];
  
  await executeCommandLine({
    args,
    logger: data => {
      logLines.push(data);
    },
    extraneousLogger: data => {
      extraneousLogLines.push(data);
    },
  });
  
  return {
    logLines:
      mergeArraysIntoStrings ?
        logLines.join('\n') :
        logLines,
    extraneousLogLines:
      mergeArraysIntoStrings ?
        extraneousLogLines.join('\n') :
        extraneousLogLines,
  };
}
