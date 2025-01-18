import { splitLongLinesByWord } from '../lib/command_line.mjs';
import {
  getLzmaInstalled,
  getProgramVersion,
} from '../backup_manager/version.mjs';
import { COMMANDS } from './command_info.mjs';

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
  '  Restoration of symbolic link timestamps is inaccurate, and the birthtime cannot be set.',
  '',
  Array.from(COMMANDS.values()).map(({ helpMsg }) => helpMsg).join('\n\n'),
].join('\n'));
