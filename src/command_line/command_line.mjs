import {
  parseArgs,
  splitLongLinesByWord,
} from '../lib/command_line.mjs';
import { integerToStringWithSeparator } from '../lib/number.mjs';
import { ReadOnlyMap } from '../lib/read_only_map.mjs';
import { getProgramVersion } from '../backup_manager/version.mjs';
import { DEFAULT_IN_MEMORY_CUTOFF_SIZE } from '../backup_manager/backup_manager.mjs';

const commandsHelpText = new ReadOnlyMap([
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
    'list',
    
    splitLongLinesByWord([
      'Command `list`:',
      '  Lists the backups in a given hash backup folder along with detailed information about them.',
      '  ',
      '  Options:',
      '    --backupDir=<backupDir> (required): The hash backup folder to get data from.',
      '        aliases: --backup-dir, --to',
      '    --name=<name> (optional): If present, only show information about one backup.',
    ].join('\n'))
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
      '    --symlink-handling=<value> (default "preserve"):',
      '        If "ignore", symlinks will be ignored.',
      '        If "passthrough", symlinks will be copied over as regular files (and the modtime of the destination file will be used).',
      '        If "preserve", symlinks will be added to the backup as-is, storing their path.',
      `    --in-memory-cutoff=<integer >= -1 | Infinity> (default ${integerToStringWithSeparator(DEFAULT_IN_MEMORY_CUTOFF_SIZE)}): Read file into memory and store hash and compressed forms into memory. Minimizes hard drive reads/writes. Turn off for files too large to fit in memory.`,
    ].join('\n'))
  ],
  
  [
    'restore',
    
    splitLongLinesByWord([
      'Command `restore`:',
      '  Restores a folder from the hash backup.',
      '  ',
      '  Options:',
      '    --from=<backupDir> (required): The hash backup folder to use.',
      '    --to=<basePath> (required): The directory to restore to.',
      '    --name <name> (required): The name of the backup.',
      '    --symlink-handling <value> (default "preserve"): If "ignore", symlinks in backup will not be copied. If "passthrough", symlinks will be created as regular files, copying in their contents (and the modtime of the destination file will be set). If "preserve", symlinks will be added to the backup as-is, including their path.',
      '    --setFileTimes <boolean> (default true): If true, file access, modification, and create times will be set at end of restore.',
      '    --verify <value> (default true): If true, file checksums will be verified as they are copied out.',
    ].join('\n'))
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
    ].join('\n'))
  ],
  
  [
    'version',
    
    splitLongLinesByWord([
      'Command `version`:',
      '  Prints the version of the hash backup program.',
    ].join('\n'))
  ],
  
  [
    'none',
    
    splitLongLinesByWord([
      'No command:',
      '  Options:',
      '    --help (mutually exclusive with --version): Prints this help message.',
      '    --version (mutually exclusive with --help): Prints the version of the hash backup program.',
      '    No option passed: Prints this help message.',
    ].join('\n'))
  ],
  
  // TODO: remove
  [
    '',
    
    splitLongLinesByWord([
      
    ].join('\n'))
  ],
]);

const mainHelpText = splitLongLinesByWord([
  `NodeJS Hash Backup Tool v${getProgramVersion()}`,
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
  commandsHelpText.get('help'),
  '',
  commandsHelpText.get('version'),
  '',
  commandsHelpText.get('none'),
].join('\n'));

export function printHelp({
  logger = console.log,
  subCommand = null,
} = {}) {
  if (subCommand == null) {
    logger(mainHelpText);
  } else {
    if (commandsHelpText.has(subCommand)) {
      logger(commandsHelpText.get(subCommand));
    } else {
      throw new Error(`subcommand unknown: ${JSON.stringify(subCommand)}`);
    }
  }
}

export async function executeCommandLine({
  args = process.argv.slice(2),
  logger = console.log,
} = {}) {
  // TODO: add newline at start and end
  // TODO: for parsing integers, strip _,. characters
  
  const {
    subCommands,
    keyedArgs,
    presentOnlyArgs,
    allPresentArgs,
  } = parseArgs(args);
  
  if (subCommands.length == 0) {
    // TODO
    // TODO: ensure help and version are mutually exclusive
  } else if (subCommands.length == 1) {
    const subCommand = subCommands[0];
    
    switch (subCommand) {
      // TODO
      // TODO: get aliases using helper func that errors out if more than one of a given alias group
      
      default:
        throw new Error(`unrecognized subcommand: ${JSON.stringify(subCommands)}`);
    }
  } else {
    throw new Error(`unrecognized subcommand: ${JSON.stringify(subCommands)}`);
  }
}
