import { DEFAULT_IN_MEMORY_CUTOFF_SIZE } from '../backup_manager/backup_manager.mjs';
import { splitLongLinesByWord } from '../lib/command_line.mjs';
import { integerToStringWithSeparator } from '../lib/number.mjs';

function toBool(string) {
  switch (string.toLowerCase()) {
    case 'true':
      return true;
    
    case 'false':
      return false;
    
    default:
      throw new Error(`string not valid boolean: ${JSON.stringify(string)}`);
  }
}

function toInteger(string) {
  const cleanedString = string.replaceAll(/[_,.]/g, '');
  
  let match;
  
  if ((match = /^(-)?(\d+|Infinity)$/.exec(cleanedString)) == null) {
    throw new Error(`string not valid integer: ${JSON.stringify(string)}`);
  }
  
  const [ signString, intString ] = match.slice(1);
  
  const unsignedInt = intString == 'Infinity' ? Infinity : parseInt(intString);
  
  const signMultiplier = signString != null ? -1 : 1;
  
  return signMultiplier * unsignedInt;
}

function toJSONObject(value) {
  let jsonValue;
  
  try {
    jsonValue = JSON.parse(value);
  } catch {
    throw new Error(`value not valid JSON: ${JSON.stringify(value)}`);
  }
  
  if (typeof jsonValue != 'object' || jsonValue == null) {
    throw new Error(`value not a JSON object: ${jsonValue}`);
  }
  
  return jsonValue;
}

export let ORIGINAL_COMMAND_NAMES = [];

export const COMMANDS = new Map(
  [
    [
      'init',
      
      {
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'to'],
              required: true,
            },
          ],
          
          [
            'hashAlgo',
            
            {
              aliases: ['hash-algo', 'hash'],
              defaultValue: 'sha256',
            },
          ],
          
          [
            'hashParams',
            
            {
              aliases: ['hash-params'],
              conversion: toJSONObject,
            },
          ],
          
          [
            'hashOutputTrimLength',
            
            {
              aliases: ['hash-output-trim-length'],
              conversion: toInteger,
            },
          ],
          
          [
            'hashSlices',
            
            {
              aliases: ['hash-slices'],
              defaultValue: '1',
              conversion: toInteger,
            },
          ],
          
          [
            'hashSliceLength',
            
            {
              aliases: ['hash-slice-length'],
              conversion: toInteger,
            },
          ],
          
          [
            'compressAlgo',
            
            {
              aliases: ['compress-algo'],
              defaultValue: 'brotli',
            },
          ],
          
          [
            'compressParams',
            
            {
              aliases: ['compress-params'],
              conversion: toJSONObject,
            },
          ],
          
          [
            'compressLevel',
            
            {
              aliases: ['compress-level'],
              conversion: toInteger,
            },
          ],
          
          [
            'treatWarningsAsErrors',
            
            {
              aliases: ['treat-warnings-as-errors'],
              defaultValue: 'false',
              conversion: toBool,
            },
          ],
        ],
        
        helpMsg: [
          'Command `init`:',
          '  Initalizes an empty hash backup in backup dir.',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup dir to initialize.',
          '        aliases: --backup-dir, --to',
          '    --hashAlgo=<algorithm> (default `sha256`): The hash algorithm to use on the files.',
          '        aliases: --hash-algo, --hash',
          '    --hashParams=<JSON object, i.e. \'{"outputLength":32}\'>: If necessary, provides parameters for the hash function (such as length of an extensible-output hashing function).',
          '        aliases: --hash-params',
          '    --hashOutputTrimLength=<integer >= 1>: If provided, trim hash hex output to the provided length in hex chars.',
          '        aliases: --hash-output-trim-length',
          '    --hashSlices=<integer >= 0> (default `1`): The number of nested subfolders of hash slices each file should be under.',
          '        aliases: --hash-slices',
          '    --hashSliceLength=<integer >= 0> (default `2`): The length of the hash slice used to split files into folders.',
          '        aliases: --hash-slice-length',
          '    --compressAlgo=<string> (default `brotli`): The algorithm to compress files (`none` for no compression).',
          '        aliases: --compress-algo',
          '    --compressParams=<JSON object, i.e. \'{"level":9}\'> (default `{}`): Parameters for the compressor.',
          '        aliases: --compress-params',
          '    --compressLevel=<integer> (default `6` if compression algorthm is `deflate-raw`, `deflate`, `gzip`, or `brotli`, and --compress-params is left at default (but not if explicitly set to "{}"); unspecified otherwise): The amount to compress files (valid is 1 through 9). Overwrites --compress-params\'s level parameter.',
          '        aliases: --compress-level',
          '    --treatWarningsAsErrors=<true|false> (default `false`): If true, warnings (about insecure hash or too small hash output trim) during hash backup dir creation will be treated as errors preventing backup dir creation.',
          '        aliases: --treat-warnings-as-errors',
        ].join('\n'),
      },
    ],
    
    [
      'deleteAll',
      
      {
        aliases: ['delete-all'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'to'],
              required: true,
            },
          ],
          
          [
            'confirm',
            
            {
              required: true,
            },
          ],
        ],
        
        helpMsg: [
          'Command `delete`:',
          '  Removes all files in hash backup dir.',
          '  ',
          '  Aliases:',
          '    delete-all',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup dir to remove contents of.',
          '        aliases: --backup-dir, --to',
          '    --confirm=yes (required): Must be set to allow deletion.',
        ].join('\n'),
      },
    ],
    
    [
      'info',
      
      {
        aliases: ['list'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'from'],
              required: true,
            },
          ],
          
          [
            'name',
            
            undefined,
          ],
        ],
        
        helpMsg: [
          'Command `info`:',
          '  Lists the backups in a given hash backup folder along with detailed information about them.',
          '  ',
          '  Aliases:',
          '    list',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to get data from.',
          '        aliases: --backup-dir, --from',
          '    --name=<name> (optional): If present, only show information about one backup.',
        ].join('\n'),
      },
    ],
    
    [
      'backup',
      
      {
        args: [
          [
            'pathToBackup',
            
            {
              aliases: ['path-to-backup', 'basePath', 'base-path', 'from'],
              required: true,
            },
          ],
          
          [
            'name',
            
            {
              required: true,
            },
          ],
          
          [
            'backupDir',
            
            {
              aliases: ['backup-dir'],
              required: true,
            },
          ],
          
          [
            'excludedItems',
            
            {
              aliases: ['excluded-items'],
              defaultValue: '[]',
              conversion: toJSONObject,
            },
          ],
          
          [
            'allowBackupDirSubPathOfFileOrFolderPath',
            
            {
              aliases: ['allow-backup-dir-sub-path-of-file-or-folder-path'],
              defaultValue: 'false',
              conversion: toBool,
            },
          ],
          
          [
            'symlinkHandling',
            
            {
              aliases: ['symlink-handling'],
              defaultValue: 'preserve',
            },
          ],
          
          [
            'storeSymlinkType',
            
            {
              aliases: ['store-symlink-type'],
              defaultValue: 'true',
              conversion: toBool,
            },
          ],
          
          [
            'inMemoryCutoff',
            
            {
              aliases: ['in-memory-cutoff'],
              defaultValue: DEFAULT_IN_MEMORY_CUTOFF_SIZE + '',
              conversion: toInteger,
            },
          ],
          
          [
            'compressionMinimumSizeThreshold',
            
            {
              aliases: ['compression-minimum-size-threshold'],
              defaultValue: '-1',
              conversion: toInteger,
            },
          ],
          
          [
            'compressionMaximumSizeThreshold',
            
            {
              aliases: ['compression-maximum-size-threshold'],
              defaultValue: 'Infinity',
              conversion: toInteger,
            },
          ],
          
          [
            'checkDuplicateHashes',
            
            {
              aliases: ['check-duplicate-hashes'],
              defaultValue: 'true',
              conversion: toBool,
            },
          ],
          
          [
            'ignoreErrors',
            
            {
              aliases: ['ignore-errors'],
              defaultValue: 'false',
              conversion: toBool,
            },
          ],
        ],
        
        helpMsg: [
          'Command `backup`:',
          '  Backs up a folder to the hash backup.',
          '  ',
          '  Options:',
          '    --pathToBackup=<basePath> (required): The directory to backup.',
          '        aliases: --path-to-backup, --basePath, --base-path, --from',
          '    --name=<name> (required): The name of the backup.',
          '    --backupDir=<backupDir> (required): The hash backup folder to use.',
          '        aliases: --backup-dir, --to',
          '    --excludedItems=<excludedItems> (default "[]"): The relative paths to exclude from the backup dir.',
          '        aliases: --excluded-items',
          '    --allowBackupDirSubPathOfFileOrFolderPath (default false): If true, backup folder can be subpath of the folder you are taking a backup of.',
          '        aliases: --allow-backup-dir-sub-path-of-file-or-folder-path',
          '    --symlinkHandling=<value> (default "preserve"):',
          '        aliases: --symlink-handling',
          '        If "ignore", symlinks will be ignored.',
          '        If "passthrough", symlinks will be copied over as regular files (and the modtime of the destination file will be used).',
          '        If "preserve", symlinks will be added to the backup as-is, storing their path.',
          '    --storeSymlinkType=<true|false> (default `true`): If true, on Windows, the type of a symbolic link will be stored (i.e. whether the symbolic link is a file or directory symbolic link or a directory junction).',
          '        aliases: --store-symlink-type',
          `    --inMemoryCutoff=<integer >= -1 | Infinity> (default \`${integerToStringWithSeparator(DEFAULT_IN_MEMORY_CUTOFF_SIZE)}\`): Below the cutoff, read file into memory and calculate hash and compressed forms in memory, to minimize hard drive reads/writes.`,
          '        aliases: --in-memory-cutoff',
          '    --compressionMinimumSizeThreshold (default -1): The file size must be greater than or equal to this for compression to activate.',
          '        aliases: --compression-minimum-size-threshold',
          '    --compressionMaximumSizeThreshold (default Infinity): The file size must be greater than or equal to this for compression to activate.',
          '        aliases: --compression-maximum-size-threshold',
          '    --checkDuplicateHashes (default true): If true, if a file\'s hash already exists in the backup dir, the file in the backup dir will be compared against the file to be added to be backup to see if they are not the same, in which case a hash collision occurred.',
          '        aliases: --check-duplicate-hashes',
          '    --ignoreErrors (default false): If true, errors when adding a file to the backup will be ignored and the file will not be added to the backup.',
          '        aliases: --ignore-errors',
        ].join('\n'),
      },
    ],
    
    [
      'restore',
      
      {
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'from'],
              required: true,
            },
          ],
          
          [
            'name',
            
            {
              required: true,
            },
          ],
          
          [
            'restorePath',
            
            {
              aliases: ['restore-path', 'basePath', 'base-path', 'to'],
              required: true,
            },
          ],
          
          [
            'pathToEntry',
            
            {
              aliases: ['path-to-entry'],
              defaultValue: '.',
            },
          ],
          
          [
            'excludedItems',
            
            {
              aliases: ['excluded-items'],
              defaultValue: '[]',
              conversion: toJSONObject,
            },
          ],
          
          [
            'symlinkHandling',
            
            {
              aliases: ['symlink-handling'],
              defaultValue: 'preserve',
            },
          ],
          
          [
            'inMemoryCutoff',
            
            {
              aliases: ['in-memory-cutoff'],
              defaultValue: DEFAULT_IN_MEMORY_CUTOFF_SIZE + '',
              conversion: toInteger,
            },
          ],
          
          [
            'setFileTimes',
            
            {
              aliases: ['set-file-times'],
              defaultValue: 'true',
              conversion: toBool,
            },
          ],
          
          [
            'createParentFolders',
            
            {
              aliases: ['create-parent-folders'],
              defaultValue: 'false',
              conversion: toBool,
            },
          ],
          
          [
            'overwriteExisting',
            
            {
              aliases: ['overwrite-existing'],
              defaultValue: 'false',
              conversion: toBool,
            },
          ],
          
          [
            'preserveOutputFolder',
            
            {
              aliases: ['preserve-output-folder'],
              defaultValue: 'true',
              conversion: toBool,
            },
          ],
          
          [
            'verify',
            
            {
              defaultValue: 'true',
              conversion: toBool,
            },
          ],
        ],
        
        helpMsg: [
          'Command `restore`:',
          '  Restores a folder from the hash backup.',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to use.',
          '        aliases: --backup-dir, --from',
          '    --name=<name> (required): The name of the backup.',
          '    --restorePath=<basePath> (required): The directory to restore to.',
          '        aliases: --restore-path, --basePath, --base-path, --to',
          '    --pathToEntry=<relativePath> (default `.`): The path inside the backup of the file or folder to be restored.',
          '        aliases: --path-to-entry',
          '    --excludedItems=<excludedItems> (default "[]"): The relative paths to exclude from the backup dir.',
          '        aliases: --excluded-items',
          '    --symlinkHandling=<value> (default "preserve"):',
          '        aliases: --symlink-handling',
          '        If "ignore", symlinks in backup will not be copied.',
          '        If "passthrough", symlinks will be created as regular files, copying in their contents (and the modtime of the destination file will be set).',
          '        If "preserve", symlinks will be added to the backup as-is, including their path.',
          `    --inMemoryCutoff=<integer >= -1 | Infinity> (default \`${integerToStringWithSeparator(DEFAULT_IN_MEMORY_CUTOFF_SIZE)}\`): Below the cutoff, read file into memory and calculate hash and decompressed forms in memory, to minimize hard drive reads/writes.`,
          '        aliases: --in-memory-cutoff',
          '    --setFileTimes=<boolean> (default true): If true, file access, modification, and creation times (creation time only on supported systems) will be set at end of restore.',
          '        aliases: --set-file-times',
          '    --createParentFolders=<boolean> (default false): If true, the parent folders of the restore folder will be created.',
          '        aliases: --create-parent-folders',
          '    --overwriteExisting=<boolean> (default false): If true, overwrite the existing restore location with the restore contents.',
          '        aliases: --overwrite-existing',
          '    --preserveOutputFolder=<boolean> (default true): If true, output folder will not be deleted and re-created if it already exists and the backup contains a folder at the top-level.',
          '    --verify=<value> (default true): If true, file checksums will be verified as files are copied out.',
        ].join('\n'),
      },
    ],
    
    [
      'deleteBackup',
      
      {
        aliases: ['delete-backup'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'to'],
              required: true,
            },
          ],
          
          [
            'name',
            
            {
              required: true,
            },
          ],
          
          [
            'pruneFilesAfter',
            
            {
              aliases: ['prune-files-after'],
              defaultValue: 'true',
              conversion: toBool,
            },
          ],
          
          [
            'confirm',
            
            {
              required: true,
            },
          ],
        ],
        
        helpMsg: [
          'Command `deleteBackup`:',
          '  Deletes a given backup from the backup dir.',
          '  ',
          '  Aliases:',
          '    delete-backup',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to delete the backup from.',
          '        aliases: --backup-dir, --to',
          '    --name=<name> (required): The name of the backup to delete.',
          '    --confirm=yes (required): Must be set to allow deletion.',
          '    --pruneFilesAfter=<true|false> (default `true`): If true, prune unused files in the hash backup afterward.',
        ].join('\n'),
      },
    ],
    
    [
      'renameBackup',
      
      {
        aliases: ['rename-backup', 'rename'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'to'],
              required: true,
            },
          ],
          
          [
            'oldName',
            
            {
              aliases: ['old-name'],
              required: true,
            },
          ],
          
          [
            'newName',
            
            {
              aliases: ['new-name'],
              required: true,
            },
          ],
        ],
        
        helpMsg: [
          'Command `renameBackup`:',
          '  Renames a given backup in the backup dir.',
          '  ',
          '  Aliases:',
          '    rename-backup, rename',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to get information from.',
          '        aliases: --backup-dir, --to',
          '    --oldName=<name> (required): The current name of the backup.',
          '    --newName=<name> (required): The new name of the backup.',
        ].join('\n'),
      },
    ],
    
    [
      'getFolderContents',
      
      {
        aliases: ['get-folder-contents'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'from'],
              required: true,
            },
          ],
          
          [
            'name',
            
            {
              required: true,
            },
          ],
          
          [
            'pathToFolder',
            
            {
              aliases: ['path-to-folder'],
              required: true,
            },
          ],
        ],
        
        helpMsg: [
          'Command `getFolderContents`:',
          '  Gets a listing of the files/folders in a given folder of the backup.',
          '  ',
          '  Aliases:',
          '    get-folder-contents',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to get information from.',
          '        aliases: --backup-dir, --from',
          '    --name=<name> (required): The name of the backup to get the file from.',
          '    --pathToFolder=<relativePath> (required): The path inside the backup of the folder to get the contents of.',
          '        aliases: path-to-folder',
        ].join('\n'),
      },
    ],
    
    [
      'getEntryInfo',
      
      {
        aliases: ['get-entry-info'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'from'],
              required: true,
            },
          ],
          
          [
            'name',
            
            {
              required: true,
            },
          ],
          
          [
            'pathToEntry',
            
            {
              aliases: ['path-to-entry'],
              required: true,
            },
          ],
        ],
        
        helpMsg: [
          'Command `getEntryInfo`:',
          '  Gets detailed information about an entry of the backup.',
          '  ',
          '  Aliases:',
          '    get-entry-info',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to get information from.',
          '        aliases: --backup-dir, --from',
          '    --name=<name> (required): The name of the backup to get the file from.',
          '    --pathToEntry=<relativePath> (required): The path inside the backup of the item to get information from.',
          '        aliases: path-to-entry',
        ].join('\n'),
      },
    ],
    
    [
      'getSubtree',
      
      {
        aliases: ['get-subtree'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'from'],
              required: true,
            },
          ],
          
          [
            'name',
            
            {
              required: true,
            },
          ],
          
          [
            'pathToEntry',
            
            {
              aliases: ['path-to-entry'],
              defaultValue: '.',
            },
          ],
          
          [
            'withEntries',
            
            {
              aliases: ['with-entries'],
              defaultValue: 'false',
              conversion: toBool,
            },
          ],
          
          [
            'treeIndent',
            
            {
              aliases: ['tree-indent'],
              defaultValue: '2',
              conversion: toInteger,
            },
          ],
        ],
        
        helpMsg: [
          'Command `getSubtree`:',
          '  Gets a listing of the files in a given subtree of the backup.',
          '  ',
          '  Aliases:',
          '    get-subtree',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to get information from.',
          '        aliases: --backup-dir, --from',
          '    --name=<name> (required): The name of the backup to get the file from.',
          '    --pathToEntry=<relativePath> (default `.`): The path inside the backup of the file or folder to get information from.',
          '        aliases: path-to-entry',
          '    --withEntries=<true|false> (default `false`): If false, a tree of files in backup will be shown. If true, a tree will not be shown and instead detailed information about each entry in the backup will be shown.',
          '    --treeIndent=<integer >= 1> (default `2`): If tree mode is active, the number of spaces to the right to indent each level of the tree.',
        ].join('\n'),
      },
    ],
    
    [
      'getRawFileContents',
      
      {
        aliases: ['get-raw-file-contents'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'from'],
              required: true,
            },
          ],
          
          [
            'name',
            
            {
              required: true,
            },
          ],
          
          [
            'pathToFile',
            
            {
              aliases: ['path-to-file'],
              required: true,
            },
          ],
          
          [
            'verify',
            
            {
              defaultValue: 'true',
              conversion: toBool,
            },
          ],
        ],
        
        helpMsg: [
          'Command `getRawFileContents`:',
          '  Directly prints the contents of a file to console.',
          '  ',
          '  Aliases:',
          '    get-raw-file-contents',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to prune.',
          '        aliases: --backup-dir, --to',
          '    --name=<name> (required): The name of the backup to get the file from.',
          '    --pathToFile=<relativePath> (required): The path inside the backup of the file to access.',
          '        aliases: path-to-file',
          '    --verify=<value> (default true): If true, file checksum will be verified before the file is output.',
        ].join('\n'),
      },
    ],
    
    [
      'pruneBackupDir',
      
      {
        aliases: ['prune-backup-dir'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'to'],
              required: true,
            },
          ],
        ],
        
        helpMsg: [
          'Command `pruneBackupDir`:',
          '  Removes unreferenced files from the backup dir.',
          '  ',
          '  Aliases:',
          '    prune-backup-dir',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to prune.',
          '        aliases: --backup-dir, --to',
        ].join('\n'),
      },
    ],
    
    [
      'interactive',
      
      {
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'to'],
            },
          ],
          
          [
            'customData',
            
            {
              aliases: ['custom-data', 'custom'],
            },
          ],
          
          [
            'stringToEval',
            
            undefined,
          ],
        ],
        
        helpMsg: [
          'Command `interactive`:',
          '  Opens an interactive NodeJS REPL with all exported hash backup functions in the global scope. If a hash backup location is provided, a "hb" variable will be set to a BackupManager initialized to the backup dir. If the custom parameter is set, a variable called "data" will be set to the value of the custom parameter.',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir>: The hash backup folder to open as a BackupManager object bound to the variable "hb".',
          '        aliases: --backup-dir, --to',
          '    --customData=<anything>: Custom data to pass to the NodeJS REPL.',
          '        aliases: --custom-data, --custom',
          '    --stringToEval=<anything>: A string to evaluate (as the body of an async function) before starting the NodeJS REPL.',
        ].join('\n'),
      },
    ],
    
    [
      'getKnownHashCompress',
      
      {
        aliases: ['get-known-hash-compress'],
        
        args: [
          [
            'showHashes',
            
            {
              aliases: ['show-hashes'],
              conversion: toBool,
              defaultValue: 'true',
            },
          ],
          
          [
            'showCompressionAlgos',
            
            {
              aliases: ['show-compression-algos'],
              conversion: toBool,
              defaultValue: 'true',
            },
          ],
        ],
        
        helpMsg: [
          'Command `getKnownHashCompress`:',
          '  Prints the known hash algorithms and compress algorithms.',
          '  ',
          '  Aliases:',
          '    get-known-hash-compress',
          '  ',
          '  Options:',
          '    --showHashes=<true|false> (default `true`): If true, will show supported hash algorithms.',
          '        aliases: --show-hashes',
          '    --showCompressionAlgos=<true|false> (default `true`): If true, will show supported compression algorithms.',
          '        aliases: --show-compression-algos',
        ].join('\n'),
      },
    ],
    
    /*
    [
      'verifyBackupDir',
      
      {
        aliases: ['verify-backup-dir'],
        
        args: [
          [
            'backupDir',
            
            {
              aliases: ['backup-dir', 'to'],
              required: true,
            },
          ],
        ],
        
        helpMsg: [
          'Command `verifyBackupDir`:',
          '  Fully checks all aspects of a given hash backup dir.',
          '  ',
          '  Aliases:',
          '    verify-backup-dir',
          '  ',
          '  Options:',
          '    --backupDir=<backupDir> (required): The hash backup folder to check.',
          '        aliases: --backup-dir, --to',
        ].join('\n'),
      },
    ],
    */
    
    [
      'help',
      
      {
        args: [
          [
            'command',
            
            undefined,
          ],
        ],
        
        subCommandArgs: [],
        
        helpMsg: [
          'Command `help`:',
          '  Prints this help message.',
          '  ',
          '  Subcommand <commandName>:',
          '    If specified, only show help for the particular subcommand. Use special value "none" to show help for the main "No command" section.',
          '  ',
          '  No subcommand:',
          '    Options:',
          '      --command=<commandName>: If specified, only show help for the particular subcommand. Use special value "none" to show help for the main "No command" section.',
        ].join('\n'),
      },
    ],
    
    [
      'version',
      
      {
        helpMsg: [
          'Command `version`:',
          '  Prints the version of the hash backup program.',
        ].join('\n'),
      },
    ],
    
    [
      null,
      
      {
        args: [
          [
            'help',
            
            {
              presenceOnly: true,
            },
          ],
          
          [
            'version',
            
            {
              presenceOnly: true,
            },
          ],
        ],
        
        helpMsg: [
          'No command:',
          '  Options:',
          '    --help (mutually exclusive with --version): Prints this help message.',
          '    --version (mutually exclusive with --help): Prints the version of the hash backup program.',
          '    No option passed: Prints this help message.',
        ].join('\n'),
      },
    ],
  ]
    .flatMap((
      [
        commandName,
        {
          aliases = [],
          args = [],
          subCommandArgs = null,
          helpMsg,
        },
      ]
    ) => {
      ORIGINAL_COMMAND_NAMES.push(commandName);
      
      const commandNames = [commandName, ...aliases];
      
      const commandParams = {
        originalName: commandName,
        args: convertCommandArgs(args),
        subCommandArgs: subCommandArgs != null ? convertCommandArgs(subCommandArgs) : null,
        helpMsg: splitLongLinesByWord(helpMsg),
      };
      
      return commandNames.map(aliasCommandName => [aliasCommandName, commandParams]);
    })
);

Object.freeze(ORIGINAL_COMMAND_NAMES);

function convertCommandArgs(args) {
  let keyedArgs = new Set();
  
  const argData = new Map(
    args
      .flatMap((
        [
          argName,
          {
            aliases = [],
            presenceOnly = false,
            required = false,
            defaultValue = null,
            conversion = null,
          } = {},
        ]
      ) => {
        const argNames = [argName, ...aliases];
        
        const argParams = {
          originalName: argName,
          presenceOnly,
          required,
          defaultValue,
          conversion,
        };
        
        if (!presenceOnly) {
          keyedArgs.add(argName);
        }
        
        return argNames.map(aliasArgName => [aliasArgName, argParams]);
      })
  );
  
  return {
    data: argData,
    keyedArgs,
  };
}
