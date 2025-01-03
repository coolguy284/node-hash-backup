import { performTest } from './test_func.mjs';

await performTest({
  awaitUserInputAtEnd: process.argv[2] == 'auto' ? false : true,
});
