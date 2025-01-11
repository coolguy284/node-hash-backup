import { performTest } from './test_func.mjs';

/*
  known args:
  preserve = keep test dir even if tests successful
  symlink | nosymlink = enables or disables testing of symlinks
  nomodif = no deliberate modification testing
  nomem = no testing of in-memory-only mode
  nostream = no testing of stream-only mode
  auto = do not pause at end of each test for user input
*/

const args = new Set(process.argv.slice(2));

await performTest({
  testDeliberateModification: !args.has('nomodif'),
  doNotSaveLogIfTestPassed: !args.has('preserve'),
  doNotSaveTestDirIfTestPassed: !args.has('preserve'),
  ...(
    args.has('symlink') || args.has('nosymlink') ?
      {
        testSymlink: args.has('symlink'),
      } :
      {}
  ),
  memoryOnlySubTest: !args.has('nomem'),
  streamOnlySubTest: !args.has('nostream'),
  awaitUserInputAtEnd: !args.has('auto'),
});
