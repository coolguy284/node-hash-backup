import { performTest } from './test_func.mjs';

const args = new Set(process.argv.slice(2));

await performTest({
  awaitUserInputAtEnd: !args.has('auto'),
  doNotSaveLogIfTestPassed: !args.has('preserve'),
  doNotSaveTestDirIfTestPassed: !args.has('preserve'),
});
