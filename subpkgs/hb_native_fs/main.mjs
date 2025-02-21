import { createRequire } from 'node:module';

const NUM_100NS_IN_SEC = 10000000n;
const NUM_100NS_IN_SEC_LOG10 = 7;
const UNIX_TO_MS_SEC_OFFSET = 11644473600n;
const FILETIME_MIN = 0n;
const FILETIME_MAX = 2n ** 64n - 2n;
const UINT64_MAX_LENGTH = String(FILETIME_MAX).length;

function unixSecStringToWindowsFiletimeBigint(unixSecString) {
  // unix string is string with decimal point (optional) represening seconds since Jan 1, 1970 UTC
  // windows file time is 64 bit value representing 100-ns ticks since Jan 1, 1601 UTC
  // unix is 134774 days or 11644473600 seconds later (python: datetime.date(1970,1,1)-datetime.date(1601,1,1))
  // info: https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-filetime
  
  let match;
  if ((match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(unixSecString)) == null) {
    throw new Error(`unixSecString invalid format: ${unixSecString}`);
  }
  
  const [ signString, intString, fractionString ] = match.slice(1);
  
  if (intString.length > UINT64_MAX_LENGTH) {
    throw new Error(`unixSecString too large: ${unixSecString}`);
  }
  
  const negative = signString != null;
  
  const int = BigInt(intString);
  
  let fraction;
  if (fractionString != null) {
    const processedFractionString = fractionString.padEnd(NUM_100NS_IN_SEC_LOG10, '0').slice(0, NUM_100NS_IN_SEC_LOG10);
    fraction = BigInt(processedFractionString);
  } else {
    fraction = 0n;
  }
  
  const unix100NSInt = (int * NUM_100NS_IN_SEC + fraction) * (negative ? -1n : 1n);
  const ms100NSInt = unix100NSInt + (UNIX_TO_MS_SEC_OFFSET * NUM_100NS_IN_SEC);
  
  if (ms100NSInt < FILETIME_MIN) {
    throw new Error(`unixSecString too small: ${unixSecString}, converts to 100ns int of: ${ms100NSInt} < ${FILETIME_MIN}`);
  }
  
  if (ms100NSInt > FILETIME_MAX) {
    throw new Error(`unixSecString too large: ${unixSecString}, converts to 100ns int of: ${ms100NSInt} > ${FILETIME_MAX}`);
  }
  
  return ms100NSInt;
}

export const _unixSecStringToWindowsFiletimeBigint = unixSecStringToWindowsFiletimeBigint;

// https://medium.com/the-node-js-collection/how-to-import-native-modules-using-the-new-es6-module-syntax-426ca3c44bed
const hbNativeFs = createRequire(import.meta.url)('./build/Release/hb_native_fs.node');

export const {
  getItemMeta,
  getSymlinkType,
} = hbNativeFs;
const {
  setItemMeta: setItemMetaInternal,
} = hbNativeFs;

export function setItemMeta(itemPath, itemMeta) {
  if (typeof itemMeta != 'object' || Array.isArray(itemMeta)) {
    throw new Error(`itemMeta not object: ${typeof itemMeta}`);
  }
  
  const newItemMeta = {
    ...(itemMeta.readonly != null ? { readonly: itemMeta.readonly } : {}),
    ...(itemMeta.hidden != null ? { hidden: itemMeta.hidden } : {}),
    ...(itemMeta.system != null ? { system: itemMeta.system } : {}),
    ...(itemMeta.archive != null ? { archive: itemMeta.archive } : {}),
    ...(itemMeta.compressed != null ? { compressed: itemMeta.compressed } : {}),
    ...(itemMeta.accessTime != null ? { accessTime: unixSecStringToWindowsFiletimeBigint(itemMeta.accessTime) } : {}),
    ...(itemMeta.modifyTime != null ? { modifyTime: unixSecStringToWindowsFiletimeBigint(itemMeta.modifyTime) } : {}),
    ...(itemMeta.createTime != null ? { createTime: unixSecStringToWindowsFiletimeBigint(itemMeta.createTime) } : {}),
  };
  
  setItemMetaInternal(itemPath, newItemMeta);
}
