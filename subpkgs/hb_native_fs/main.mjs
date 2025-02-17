import { createRequire } from 'node:module';

// https://medium.com/the-node-js-collection/how-to-import-native-modules-using-the-new-es6-module-syntax-426ca3c44bed
export const {
  getItemAttributes,
} = createRequire(import.meta.url)('./build/Release/hb_native_fs.node');
