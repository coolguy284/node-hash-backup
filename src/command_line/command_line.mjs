import { parseArgs } from '../lib/command_line.mjs';
import { getProgramVersion } from '../backup_manager/version.mjs';

export function printHelp(logger = console.log) {
  logger([
    'Node Hash Backup Tool',
    '',
    'Usage: node hash_backup.js [command] [options]',
    '',
    'Command `init`:',
    '  Initalizes empty hash backup in backup dir.',
    '  ',
    '  Options:',
    '    --to <backupDir> (required): The hash backup dir to initialize.',
    '    --hash <algorithm> (default `sha384`): The hash algorithm to use on the files.',
    '    --hash-slice-length (default `2`): The length of the hash slice used to split files into folders.',
    '    --hash-slices (default `2`): The number of nested subfolders of hash slices each file should be under.',
    '    --compress-algo (default `brotli`): The algorithm to compress files (`none` for no algo).',
    '    --compress-level (default 6): The amount to compress files (valid is 1 through 9).',
    '',
    'Command `delete`:',
    '  Removes all files at hash backup dir.',
    '  ',
    '  Options:',
    '    --to <backupDir> (required): The hash backup dir to remove contents of.',
    '    --confirm=yes (required): Must be set to allow deletion.',
    '',
    'Command `list`:',
    '  Lists the backups in a given hash backup folder.',
    '  ',
    '  Options:',
    '    --to <backupDir> (required): The hash backup folder to use.',
    '    --name <name> (optional): The name of the backup to show information about specifically.',
    '',
    'Command `backup`:',
    '  Backs up a folder to the hash backup.',
    '  ',
    '  Options:',
    '    --from <basePath> (required): The directory to backup.',
    '    --to <backupDir> (required): The hash backup folder to use.',
    '    --name <name> (required): The name of the backup.',
    '    --symlink-handling <value> (default \'\'): If \'ignore\', symlinks will be ignored. If \'passthrough\', symlinks will be copied over as regular files (and the modtime of the destination file will be used). If \'true\', symlinks will be added to the backup as-is, storing their path.',
    '    --in-memory <value> (default true): Read file into memory and store hash and compressed forms into memory. Minimizes hard drive reads/writes. Turn off for files too large to fit in memory.',
    '',
    'Command `restore`:',
    '  Restores a folder from the hash backup.',
    '  ',
    '  Options:',
    '    --from <backupDir> (required): The hash backup folder to use.',
    '    --to <basePath> (required): The directory to restore to.',
    '    --name <name> (required): The name of the backup.',
    '    --symlink-handling <value> (default \'\'): If \'ignore\', symlinks in backup will not be copied. If \'passthrough\', symlinks will be created as regular files, copying in their contents (and the modtime of the destination file will be set). If \'true\', symlinks will be added to the backup as-is, including their path.',
    '    --setFileTimes <boolean> (default true): If true, file access, modification, and create times will be set at end of restore.',
    '    --verify <value> (default true): If true, file checksums will be verified as they are copied out.'
  ].join('\n'));
}

export async function executeCommandLine({
  args = process.argv.slice(2),
  logger = console.log,
} = {}) {
  const {
    subCommands,
    keyedArgs,
    presentOnlyArgs,
    allPresentArgs,
  } = parseArgs(args);
  
  if (subCommands.length == 0) {
    
  } else if (subCommands.length == 1) {
    const subCommand = subCommands[0];
    
    switch (subCommand) {
      default:
        throw new Error(`unrecognized subcommand: ${JSON.stringify(subCommands)}`);
    }
  } else {
    throw new Error(`unrecognized subcommand: ${JSON.stringify(subCommands)}`);
  }
}
