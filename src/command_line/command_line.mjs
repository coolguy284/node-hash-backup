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
function unixSecStringToDateString(unixSecString) {
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

function dateToDateString(date) {
  return unixSecStringToDateString(date.getTime() / 1_000 + '');
}

function getUIOutputOfBackupEntry(properties, entry) {
  properties.push(['Path:', JSON.stringify(entry.path)]);
  properties.push(['Type:', entry.type]);
  properties.push(['Attributes:', entry.attributes.length > 0 ? entry.attributes.join(', ') : 'none']);
  properties.push(['Access Time:', `${unixSecStringToDateString(entry.atime)} (${entry.atime})`]);
  properties.push(['Modify Time:', `${unixSecStringToDateString(entry.mtime)} (${entry.mtime})`]);
  properties.push(['Change Time:', `${unixSecStringToDateString(entry.ctime)} (${entry.ctime})`]);
  properties.push(['Creation Time:', `${unixSecStringToDateString(entry.birthtime)} (${entry.birthtime})`]);
  
  switch (entry.type) {
    case 'directory':
      // no extra info
      break;
    
    case 'symbolic link':
      properties.push(['Symlink Type:', `${entry.symlinkType ?? 'unspecified'}`]);
      properties.push(['Symlink Path (Base64):', `${entry.symlinkPath}`]);
      properties.push(['Symlink Path (Raw):', `${JSON.stringify(Buffer.from(entry.symlinkPath, 'base64').toString())}`]);
      break;
    
    case 'file':
      properties.push(['Hash:', entry.hash]);
      properties.push(['Size:', humanReadableSizeString(entry.size)]);
      properties.push(['Compressed Size:', humanReadableSizeString(entry.compressedSize)]);
      break;
    
    default:
      throw new Error(`unknown type: ${entry.type}`);
  }
}

/**
 * The type of a subtree entry.
 * @typedef {Object} SubtreeEntry
 * @property {string} path
 * @property {string} type
 */

/**
 * The output of recursiveSplitSubtree.
 * @typedef {Object} RecursiveSplitResult
 * @property {SubtreeEntry} rootEntry
 * @property {RecursiveSplitResult[]} subEntries
 */

/**
 * Recursively split a list of subtree entries into a split subtree.
 * @param {SubtreeEntry[]} subtreeEntries
 * @return {RecursiveSplitResult}
 */
function recursiveSplitSubtree(subtreeEntries) {
  if (subtreeEntries.length == 0) {
    throw new Error('cannot recursively split no subtree');
  }
  
  const rootEntry = subtreeEntries[0];
  
  let remainingEntries = [];
  
  for (const subtreeEntry of subtreeEntries.slice(1)) {
    const [ base, ...rest ] = subtreeEntry.path.split('/');
    
    if (remainingEntries.length == 0 || remainingEntries.at(-1).base != base) {
      remainingEntries.push({
        base,
        contents: [{
          ...subtreeEntry,
          path: base,
        }],
      });
    } else {
      remainingEntries.at(-1).contents.push({
        ...subtreeEntry,
        path: rest.join('/'),
      });
    }
  }
  
  return {
    rootEntry,
    subEntries:
      remainingEntries
        .map(({ contents }) => recursiveSplitSubtree(contents)),
  };
}

/**
 * Sorts a RecursiveSplitResult
 * @param {RecursiveSplitResult} splitSubtree
 * @return {void}
 */
function sortSubtree(splitSubtree) {
  splitSubtree.subEntries.sort((subSplitSubtreeA, subSplitSubtreeB) => {
    const {
      rootEntry: {
        path: pathA, type: typeA,
      },
    } = subSplitSubtreeA;
    
    const {
      rootEntry: {
        path: pathB, type: typeB,
      },
    } = subSplitSubtreeB;
    
    sortSubtree(subSplitSubtreeA);
    sortSubtree(subSplitSubtreeB);
    
    if (typeA == 'directory' && typeB != 'directory') {
      return -1;
    } else if (typeA != 'directory' && typeB == 'directory') {
      return 1;
    } else if (pathA < pathB) {
      return -1;
    } else if (pathA > pathB) {
      return 1;
    } else {
      return 0;
    }
  });
}

/**
 * Formats a tree of files/folders nicely.
 * @param {RecursiveSplitResult} splitSubtree
 * @param {Object} [formatParams={}]
 * @param {number} [formatParams.indent=2]
 * @return {string[]}
 */
function formatTree(splitSubtree, formatParams = {}) {
  const { indent = 2 } = formatParams;
  
  // unicode chars definitely not taken from the windows "tree" command:
  // ─└├│
  
  const {
    rootEntry: {
      path: rootPath,
      type: rootType,
    },
    subEntries: rootSubEntries,
  } = splitSubtree;
  
  const rootString = `${rootPath} [${rootType}]`;
  
  if (splitSubtree.subEntries.length > 0) {
    return [
      rootString,
      
      ...rootSubEntries.map(
        (subSplitSubtree, groupIndex) => {
          return formatTree(subSplitSubtree, formatParams)
            .map((formattedEntry, contentIndex) => {
              const lastGroup = groupIndex == rootSubEntries.length - 1;
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
            });
        }
      ),
    ].flat();
  } else {
    return [rootString];
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
        const backupDir = keyedArgs.get('backupDir');
        const name = keyedArgs.get('name');
        const info = await getBackupInfo({
          backupDir,
          name,
          logger: extraneousLogger,
        });
        
        if (keyedArgs.has('name')) {
          // single backup info
          
          let propertyLines = [];
          
          logger(`Information about backup ${JSON.stringify(name)} in backup dir ${JSON.stringify(backupDir)}:`);
          logger();
          
          propertyLines.push(['Created At:', `${dateToDateString(info.createdAt)} (${info.createdAt.toISOString()})`]);
          propertyLines.push(['Files:', info.files]);
          propertyLines.push(['Folders:', info.folders]);
          propertyLines.push(['Symbolic Links:', info.symbolicLinks]);
          propertyLines.push(['Total Items:', info.items]);
          propertyLines.push(['Unique Files:', info.referencedFileCount]);
          propertyLines.push(['File Raw Size:', humanReadableSizeString(info.sizeBytes)]);
          propertyLines.push(['File Compressed Size:', humanReadableSizeString(info.compressedSizeBytes)]);
          propertyLines.push(['Backup Metadata Size:', humanReadableSizeString(info.backupOnlyMetaSizeBytes)]);
          
          logger(formatWithEvenColumns(propertyLines));
        } else {
          // full backup dir info
          
          logger(`Information about backup dir ${JSON.stringify(backupDir)}:`);
          logger();
          
          // print topology information
          {
            logger('Backup topology:');
            
            let propertyLines = [];
            
            propertyLines.push(['Hash Algorithm:', info.fullBackupInfo.topology.hashAlgo]);
            propertyLines.push(['Hash Slices:', info.fullBackupInfo.topology.hashSlices]);
            propertyLines.push([
              'Hash Slice Length:',
              info.fullBackupInfo.topology.hashSlices > 0 ?
                info.fullBackupInfo.topology.hashSliceLength :
                'N/A',
            ]);
            propertyLines.push(['Compression Algorithm:', info.fullBackupInfo.topology.compressionAlgo ?? 'None']);
            propertyLines.push([
              'Compression Parameters:',
              info.fullBackupInfo.topology.compressionAlgo != null ?
                JSON.stringify(info.fullBackupInfo.topology.compressionParams) :
                'N/A',
            ]);
            
            logger(formatWithEvenColumns(propertyLines));
            logger();
          }
          
          // print backup specific information
          {
            let propertyLines = [];
            
            propertyLines.push([
              'Name',
              'Created',
              'Files', 'Folders', 'Symlinks', 'Items', 'Unique Files',
              'Size', 'Compressed Size', 'Metadata Size',
            ]);
            
            for (const [ backupName, backupData ] of info.individualBackupsInfo.backups) {
              propertyLines.push([
                backupName,
                backupData.createdAt.toISOString(),
                backupData.files,
                backupData.folders,
                backupData.symbolicLinks,
                backupData.items,
                backupData.referencedFileCount,
                humanReadableSizeString(backupData.sizeBytes),
                humanReadableSizeString(backupData.compressedSizeBytes),
                humanReadableSizeString(backupData.backupOnlyMetaSizeBytes),
              ]);
            }
            
            propertyLines.push([
              'TOTAL',
              '-',
              info.individualBackupsInfo.naiveSum.files,
              info.individualBackupsInfo.naiveSum.folders,
              info.individualBackupsInfo.naiveSum.symbolicLinks,
              info.individualBackupsInfo.naiveSum.items,
              info.fullBackupInfo.nonMeta.referenced.fileCount,
              humanReadableSizeString(info.individualBackupsInfo.naiveSum.sizeBytes),
              humanReadableSizeString(info.individualBackupsInfo.naiveSum.compressedSizeBytes),
              humanReadableSizeString(info.fullBackupInfo.meta.backupMeta.fileSizeTotal),
            ]);
            
            logger(formatWithEvenColumns(propertyLines));
            logger();
          }
          
          // print totals
          {
            logger('Summary:');
            
            let propertyLines = [];
            
            propertyLines.push(['Type', 'Files', 'Uncompressed Size', 'Compressed / Natural Size']);
            
            propertyLines.push([
              'Backup Metadata',
              info.fullBackupInfo.meta.backupMeta.fileCount,
              humanReadableSizeString(info.fullBackupInfo.meta.backupMeta.fileSizeTotal),
              humanReadableSizeString(info.fullBackupInfo.meta.backupMeta.fileSizeTotal),
            ]);
            
            propertyLines.push([
              'File Metadata',
              info.fullBackupInfo.meta.filesMeta.fileCount,
              humanReadableSizeString(info.fullBackupInfo.meta.filesMeta.fileSizeTotal),
              humanReadableSizeString(info.fullBackupInfo.meta.filesMeta.fileSizeTotal),
            ]);
            
            propertyLines.push([
              'Total Metadata',
              info.fullBackupInfo.meta.totalMeta.fileCount,
              humanReadableSizeString(info.fullBackupInfo.meta.totalMeta.fileSizeTotal),
              humanReadableSizeString(info.fullBackupInfo.meta.totalMeta.fileSizeTotal),
            ]);
            
            propertyLines.push('');
            
            propertyLines.push([
              'Referenced Files',
              info.fullBackupInfo.nonMeta.referenced.fileCount,
              humanReadableSizeString(info.fullBackupInfo.nonMeta.referenced.fileSizeTotal),
              humanReadableSizeString(info.fullBackupInfo.nonMeta.referenced.fileCompressedSizeTotal),
            ]);
            
            propertyLines.push([
              'Non Referenced Files',
              info.fullBackupInfo.nonMeta.nonReferenced.fileCount,
              humanReadableSizeString(info.fullBackupInfo.nonMeta.nonReferenced.fileSizeTotal),
              humanReadableSizeString(info.fullBackupInfo.nonMeta.nonReferenced.fileCompressedSizeTotal),
            ]);
            
            propertyLines.push([
              'Total Non-Meta Files',
              info.fullBackupInfo.nonMeta.total.fileCount,
              humanReadableSizeString(info.fullBackupInfo.nonMeta.total.fileSizeTotal),
              humanReadableSizeString(info.fullBackupInfo.nonMeta.total.fileCompressedSizeTotal),
            ]);
            
            propertyLines.push('');
            
            propertyLines.push([
              'All Files',
              info.fullBackupInfo.total.fileCount,
              humanReadableSizeString(info.fullBackupInfo.total.fileSizeTotal),
              humanReadableSizeString(info.fullBackupInfo.total.fileCompressedSizeTotal),
            ]);
            
            logger(formatWithEvenColumns(propertyLines));
          }
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
        
        properties.push(['Backup:', JSON.stringify(backupDir)]);
        properties.push(['Name:', JSON.stringify(name)]);
        
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
            
            properties.push(['Backup:', JSON.stringify(backupDir)]);
            properties.push(['Name:', JSON.stringify(name)]);
            
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
            
            properties.push(['Backup:', JSON.stringify(backupDir)]);
            properties.push(['Name:', JSON.stringify(name)]);
            
            logger('Backup Info:');
            logger(formatWithEvenColumns(properties));
            logger();
          }
          
          logger(`Tree of ${JSON.stringify(pathToEntry)}:`);
          logger();
          const splitSubtree = recursiveSplitSubtree(subtreeEntries);
          sortSubtree(splitSubtree);
          const treeLines = formatTree(splitSubtree, { indent: treeIndent });
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
