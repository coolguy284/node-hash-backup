// https://typescript-eslint.io/getting-started/

import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

///** @type {import('eslint').Linter.Config[]} */
export default tseslint.config(
  {
    files: ['**/*.mjs'],
    extends: [
      eslint.configs.recommended,
      //tseslint.configs.recommendedTypeChecked,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      // globals: globals.nodeBuiltin,
      parserOptions: {
        project: './tsconfig.json',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // https://stackoverflow.com/questions/41685693/how-to-warn-when-you-forget-to-await-an-async-function-in-javascript/63437779#63437779
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
);
