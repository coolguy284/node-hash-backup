import { performTest } from './test_func.mjs';

const args = new Set(process.argv.slice(2));

await performTest({
  testDeliberateModification: !args.has('nomodif'),
  doNotSaveLogIfTestPassed: !args.has('preserve'),
  doNotSaveTestDirIfTestPassed: !args.has('preserve'),
  memoryOnlySubTest: !args.has('nomem'),
  streamOnlySubTest: !args.has('nostream'),
  awaitUserInputAtEnd: !args.has('auto'),
});
