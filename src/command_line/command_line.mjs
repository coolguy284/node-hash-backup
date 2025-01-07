import { parseArgs } from '../lib/command_line.mjs';

import {
  commandsHelpText,
  getVersionString,
  mainHelpText,
} from './help_info.mjs';

function printHelp({
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

function printVersion({ logger = console.log }) {
  logger(getVersionString());
}

export async function executeCommandLine({
  args = process.argv.slice(2),
  logger = console.log,
} = {}) {
  // TODO: for parsing integers, strip _,. characters
  
  const {
    subCommands,
    keyedArgs,
    presentOnlyArgs,
    allPresentArgs,
  } = parseArgs(args);
  
  logger();
  
  if (subCommands.length == 0) {
    // called without a command
    
    const recognizedArgs = new Set(['help', 'version']);
    
    for (const argName in allPresentArgs) {
      if (!recognizedArgs.has(argName)) {
        throw new Error(`unrecognized argument: --${argName}`);
      }
    }
    
    if (allPresentArgs.size == 2) {
      throw new Error('cannot have both --help and --version present');
    }
    
    if (keyedArgs.size != 0) {
      throw new Error(`argument --${keyedArgs.keys().next().value} cannot have value`);
    }
    
    if (presentOnlyArgs.size == 0 || presentOnlyArgs.has('help')) {
      printHelp({ logger });
    } else {
      // --version arg
      printVersion({ logger });
    }
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
  
  logger();
}
