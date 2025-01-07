import { splitLongLinesByWord } from '../lib/command_line.mjs';
import { integerToStringWithSeparator } from '../lib/number.mjs';
import { ReadOnlyMap } from '../lib/read_only_map.mjs';
import { getProgramVersion } from '../backup_manager/version.mjs';
import { DEFAULT_IN_MEMORY_CUTOFF_SIZE } from '../backup_manager/backup_manager.mjs';

export function getVersionString() {
  return `NodeJS Hash Backup Tool v${getProgramVersion()}`;
}

export const commandsHelpText = new ReadOnlyMap([
  [
    'init',
    
    splitLongLinesByWord([
      'Command `init`:',
      '  Initalizes an empty hash backup in backup dir.',
      '  ',
      '  Options:',
      '    --backupDir=<backupDir> (required): The hash backup dir to initialize.',
      '        aliases: --backup-dir, --to',
      '    --hashAlgo=<algorithm> (default `sha256`): The hash algorithm to use on the files.',
      '        aliases: --hash-algo, --hash',
      '    --hashSlices=<number> (default `1`): The number of nested subfolders of hash slices each file should be under.',
      '        aliases: --hash-slices',
      '    --hashSliceLength=<number> (default `2`): The length of the hash slice used to split files into folders.',
      '        aliases: --hash-slice-length',
      '    --compressAlgo=<string> (default `brotli`): The algorithm to compress files (`none` for no algo).',
      '        aliases: --compress-algo',
      '    --compressParams=<JSON object, i.e. "{level:9}"> (default `{}`): Parameters for the compressor.',
      '        aliases: --compress-params',
      '    --compressLevel=<integer> (default `6` if compression algorthm is `deflate-raw`, `deflate`, `gzip`, or `brotli`, and --compress-params is left at default (but not if explicitly set to "{}"), unspecified otherwise): The amount to compress files (valid is 1 through 9). Overwrites --compress-params\'s level parameter',
      '        aliases: --compress-level',
    ].join('\n')),
  ],
  
  [
    'delete',
    
    splitLongLinesByWord([
      'Command `delete`:',
      '  Removes all files in hash backup dir.',
      '  ',
      '  Options:',
      '    --backupDir=<backupDir> (required): The hash backup dir to remove contents of.',
      '        aliases: --backup-dir, --to',
      '    --confirm=yes (required): Must be set to allow deletion.',
    ].join('\n')),
  ],
  
  [
    'info',
    
    splitLongLinesByWord([
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
    ].join('\n')),
  ],
  
  [
    'backup',
    
    splitLongLinesByWord([
      'Command `backup`:',
      '  Backs up a folder to the hash backup.',
      '  ',
      '  Options:',
      '    --backupPath=<basePath> (required): The directory to backup.',
      '        aliases: --backup-path, --basePath, --base-path, --from',
      '    --name=<name> (required): The name of the backup.',
      '    --backupDir=<backupDir> (required): The hash backup folder to use.',
      '        aliases: --backup-dir, --to',
      '    --excludedItems=<excludedItems> (default "[]"): The relative paths to exclude from the backup dir.',
      '        aliases: --excluded-items',
      '    --allowBackupDirSubPathOfFileOrFolderPath (default false): If true, backup folder can be subpath of the folder you are taking a backup of.',
      '        aliases: --allow-backup-dir-sub-path-of-file-or-folder-path',
      '    --symlink-handling=<value> (default "preserve"):',
      '        If "ignore", symlinks will be ignored.',
      '        If "passthrough", symlinks will be copied over as regular files (and the modtime of the destination file will be used).',
      '        If "preserve", symlinks will be added to the backup as-is, storing their path.',
      `    --inMemoryCutoff=<integer >= -1 | Infinity> (default \`${integerToStringWithSeparator(DEFAULT_IN_MEMORY_CUTOFF_SIZE)}\`): Below the cutoff, read file into memory and calculate hash and compressed forms in memory, to minimize hard drive reads/writes.`,
      '        aliases: --in-memory-cutoff',
      '    --compressionMinimumSizeThreshold (default -1): The file size must be greater than or equal to this for compression to activate.',
      '        aliases: --compression-minimum-size-threshold',
      '    --compressionMaximumSizeThreshold (default -1): The file size must be greater than or equal to this for compression to activate.',
      '        aliases: --compression-maximum-size-threshold',
      '    --checkDuplicateHashes (default true): If true, if a file\'s hash already exists in the backup dir, the file in the backup dir will be compared against the file to be added to be backup to see if they are not the same, in which case a hash collision occurred.',
      '        aliases: --check-duplicate-hashes',
      '    --ignoreErrors (default false): If true, errors when adding a file to the backup will be ignored and the file will not be added to the backup.',
      '        aliases: --ignore-errors',
    ].join('\n')),
  ],
  
  [
    'restore',
    
    splitLongLinesByWord([
      'Command `restore`:',
      '  Restores a folder from the hash backup.',
      '  ',
      '  Options:',
      '    --backupDir=<backupDir> (required): The hash backup folder to use.',
      '        aliases: --backup-dir, --from',
      '    --name=<name> (required): The name of the backup.',
      '    --backupPath=<basePath> (required): The directory to restore to.',
      '        aliases: --backup-path, --basePath, --base-path, --to',
      '    --backupInternalPath=<relativePath> (default `.`): The directory inside the backup to restore to the given folder.',
      '        aliases: --backup-internal-path',
      '    --excludedItems=<excludedItems> (default "[]"): The relative paths to exclude from the backup dir.',
      '        aliases: --excluded-items',
      '    --symlink-handling=<value> (default "preserve"): If "ignore", symlinks in backup will not be copied. If "passthrough", symlinks will be created as regular files, copying in their contents (and the modtime of the destination file will be set). If "preserve", symlinks will be added to the backup as-is, including their path.',
      `    --inMemoryCutoff=<integer >= -1 | Infinity> (default \`${integerToStringWithSeparator(DEFAULT_IN_MEMORY_CUTOFF_SIZE)}\`): Below the cutoff, read file into memory and calculate hash and decompressed forms in memory, to minimize hard drive reads/writes.`,
      '        aliases: --in-memory-cutoff',
      '    --setFileTimes=<boolean> (default true): If true, file access, modification, and creation times (creation time only on supported systems) will be set at end of restore.',
      '        aliases: --set-file-times',
      '    --createParentFolders=<boolean> (default false): If true, the parent folders of the restore folder will be created.',
      '        aliases: --create-parent-folders',
      '    --overwriteExisting=<boolean> (default false): If true, overwrite the existing restore location with the restore contents.',
      '        aliases: --overwrite-existing',
      '    --verify=<value> (default true): If true, file checksums will be verified as files are copied out.',
    ].join('\n')),
  ],
  
  [
    'getSubtree',
    
    splitLongLinesByWord([
      'Command `getSubtree`:',
      '  Gets a listing of the files in a given subtree of the backup.',
      '  ',
      '  Aliases:',
      '    get-subtree',
      '  ',
      '  Options:',
      '    --backupDir=<backupDir> (required): The hash backup folder to get information from.',
      '        aliases: --backup-dir, --from',
      // TODO
    ].join('\n')),
  ],
  
  [
    'getFolderContents',
    
    splitLongLinesByWord([
      'Command `getFolderContents`:',
      '  Gets a listing of the files in a given folder of the backup.',
      '  ',
      '  Aliases:',
      '    get-folder-contents',
      '  ',
      '  Options:',
      '    --backupDir=<backupDir> (required): The hash backup folder to get information from.',
      '        aliases: --backup-dir, --from',
      // TODO
    ].join('\n')),
  ],
  
  [
    'getEntryInfo',
    
    splitLongLinesByWord([
      'Command `getEntryInfo`:',
      '  Gets detailed information about an entry of the backup.',
      '  ',
      '  Aliases:',
      '    get-entry-info',
      '  ',
      '  Options:',
      '    --backupDir=<backupDir> (required): The hash backup folder to get information from.',
      '        aliases: --backup-dir, --from',
      // TODO
    ].join('\n')),
  ],
  
  [
    'help',
    
    splitLongLinesByWord([
      'Command `help`:',
      '  Prints this help message.',
      '  ',
      '  Subcommand <commandName>:',
      '    If specified, only show help for the particular subcommand. Use special value "none" to show help for the main "No command" section.',
      '  ',
      '  No subcommand:',
      '    Options:',
      '      --command=<commandName>: If specified, only show help for the particular subcommand. Use special value "none" to show help for the main "No command" section.',
    ].join('\n')),
  ],
  
  [
    'version',
    
    splitLongLinesByWord([
      'Command `version`:',
      '  Prints the version of the hash backup program.',
    ].join('\n')),
  ],
  
  [
    'none',
    
    splitLongLinesByWord([
      'No command:',
      '  Options:',
      '    --help (mutually exclusive with --version): Prints this help message.',
      '    --version (mutually exclusive with --help): Prints the version of the hash backup program.',
      '    No option passed: Prints this help message.',
    ].join('\n')),
  ],
]);

export const mainHelpText = splitLongLinesByWord([
  getVersionString(),
  '',
  'Usage: node hash_backup.js [command] [options]',
  '  Command is optional. Options can be specified in either the format "--argument=value" or "--argument value" (with the space in between meaning there are two separate command line arguments, i.e. ["--argument", "value"])',
  '',
  'Warning:',
  '  Restoration of symbolic link timestamps is inaccurate, and the birthtime cannot be set. Additionally, on Windows, symbolic link type is not stored (i.e. file vs directory vs junction).',
  '',
  commandsHelpText.get('init'),
  '',
  commandsHelpText.get('delete'),
  '',
  commandsHelpText.get('list'),
  '',
  commandsHelpText.get('backup'),
  '',
  commandsHelpText.get('restore'),
  '',
  commandsHelpText.get('getSubtree'),
  '',
  commandsHelpText.get('getDirContents'),
  '',
  commandsHelpText.get('getEntryInfo'),
  '',
  commandsHelpText.get('help'),
  '',
  commandsHelpText.get('version'),
  '',
  commandsHelpText.get('none'),
].join('\n'));
