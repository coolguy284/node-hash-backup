import { splitLongLinesByWord } from '../lib/command_line.mjs';
import {
  getLzmaInstalled,
  getProgramVersion,
} from '../backup_manager/version.mjs';
import {
  COMMANDS,
  ORIGINAL_COMMAND_NAMES,
} from './command_info.mjs';

export function getVersionString() {
  return `NodeJS Hash Backup Tool v${getProgramVersion()}\n` +
    `LZMA Support: ${getLzmaInstalled() ? 'Installed' : 'Not Installed'}`;
}

export const mainHelpText = splitLongLinesByWord([
  getVersionString(),
  '',
  'Usage: node <path to folder of hash backup code> [command] [options]',
  '  Command is optional. Options can be specified in either the format "--argument=value" or "--argument value" (with the space in between meaning there are two separate command line arguments, i.e. ["--argument", "value"]).',
  '',
  'Warning:',
  '  Restoration of symbolic link timestamps is inaccurate (for the last decimal place or two (or maybe more) on Windows\'s 7 decimal-digit precision timestamps), and the birthtime cannot be set.',
  '',
  ORIGINAL_COMMAND_NAMES.map(commandName => COMMANDS.get(commandName).helpMsg).join('\n\n'),
].join('\n'));
