// https://typescript-eslint.io/getting-started/

import globals from 'globals';
import pluginJs from '@eslint/js';
// import eslint from '@eslint/js';
// import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // https://stackoverflow.com/questions/41685693/how-to-warn-when-you-forget-to-await-an-async-function-in-javascript/63437779#63437779
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    }
  },
  pluginJs.configs.recommended,
];

// export default tseslint.config(
//   eslint.configs.recommended,
//   tseslint.configs.recommended,
//   {
//     rules: {
//       '@typescript-eslint/no-floating-promises': 'error',
//       '@typescript-eslint/no-misused-promises': 'error',
//     },
//   }
// );
