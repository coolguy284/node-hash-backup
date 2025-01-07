import { splitLongLinesByWord } from '../lib/command_line.mjs';
import { getProgramVersion } from '../backup_manager/version.mjs';
import { COMMANDS } from './command_info.mjs';

export function getVersionString() {
  return `NodeJS Hash Backup Tool v${getProgramVersion()}`;
}

export const mainHelpText = splitLongLinesByWord([
  getVersionString(),
  '',
  'Usage: node hash_backup.js [command] [options]',
  '  Command is optional. Options can be specified in either the format "--argument=value" or "--argument value" (with the space in between meaning there are two separate command line arguments, i.e. ["--argument", "value"]).',
  '',
  'Warning:',
  '  Restoration of symbolic link timestamps is inaccurate, and the birthtime cannot be set. Additionally, on Windows, symbolic link type is not stored (i.e. file vs directory vs junction).',
  '',
  COMMANDS.get('init').helpMsg,
  '',
  COMMANDS.get('delete').helpMsg,
  '',
  COMMANDS.get('info').helpMsg,
  '',
  COMMANDS.get('backup').helpMsg,
  '',
  COMMANDS.get('restore').helpMsg,
  '',
  // COMMANDS.get('getSubtree').helpMsg,
  // '',
  // COMMANDS.get('getFolderContents').helpMsg,
  // '',
  // COMMANDS.get('getEntryInfo').helpMsg,
  // '',
  COMMANDS.get('help').helpMsg,
  '',
  COMMANDS.get('version').helpMsg,
  '',
  COMMANDS.get('none').helpMsg,
].join('\n'));
