import {
  readFile,
  writeFile,
} from 'node:fs/promises';

import { executeCommandLineCollectOutput } from '../../src/command_line/command_line.mjs';

const README_FILE = 'README.md';

const helpOutput = (await executeCommandLineCollectOutput(['help'])).logLines;

const oldReadmeText = (await readFile(README_FILE)).toString();

const newReadmeText =
  oldReadmeText.replace(
    /## Help\n\n```.*```\n\n## Warning/s,
    `## Help\n\n\`\`\`\n${helpOutput}\n\`\`\`\n\n## Warning`
  );

await writeFile(README_FILE, newReadmeText);
