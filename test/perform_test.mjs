import {
  performMainTest,
  performMinorTests,
} from './test_func.mjs';

/*
  known args:
  onlyminor = perform minor test instead
  preserve = keep test dir even if tests successful
  symlink | nosymlink = enables or disables testing of symlinks
  nomodif = no deliberate modification testing
  nomem = no testing of in-memory-only mode
  nostream = no testing of stream-only mode
  notimestamp = no testing of timestamp mode
  nocontents = no testing of file contents only mode
  auto | noauto = do not pause (auto) or pause (noauto) at end of each test for user input
*/

const KNOWN_ARGS = new Set([
  'onlyminor',
  'preserve',
  'symlink',
  'nosymlink',
  'nomodif',
  'nomem',
  'nostream',
  'notimestamp',
  'nocontents',
  'auto',
  'noauto',
]);

const args = new Set(process.argv.slice(2));

for (const arg of args) {
  if (!KNOWN_ARGS.has(arg)) {
    throw new Error(`unrecognized arg: ${JSON.stringify(arg)}`);
  }
}

if (args.has('onlyminor')) {
  performMinorTests();
} else {
  await performMainTest({
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
    timestampOnlySubtest: !args.has('notimestamp'),
    contentsOnlySubtest: !args.has('nocontents'),
    ...(
      args.has('auto') || args.has('noauto') ?
        {
          awaitUserInputAtEnd: args.has('noauto'),
        } :
        {}
    ),
  });
}
