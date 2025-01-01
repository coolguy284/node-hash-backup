// random number library for node-server
// uses a cache buffer for small requests

let CACHE_SIZE = 65536;

let { xmur3, sfc32_multifunc } = require('./prnglib');

let xmurObj = xmur3('testing string');
let sfcObj = sfc32_multifunc(xmurObj(), xmurObj(), xmurObj(), xmurObj());

function getPrngBytes(amt) {
  return sfcObj.randomBytes(amt);
}

function fillPrngBytes(buf) {
  return sfcObj.randomBytesFill(buf);
}

// random cache with current index for fresh bytes
let RandomCache = Buffer.alloc(CACHE_SIZE);
let RandomCacheIndex = 0;

// fills the random cache
function fillCacheInternal() {
  fillPrngBytes(RandomCache);
}
fillCacheInternal();

// getRandBytesInternal(Integer/BigInt: amt >= 0) -> { buf: Buffer, raw: Boolean }
// Returns an object with a Buffer "buf" containing "amt" bytes and a bool
// "raw" indicating whether "buf" is directly sliced from the cache.
// WARNING: raw == true buffers will change contents when cache is reset, so use synchronously!
function getRandBytesInternal(amt) {
  if (typeof amt == 'bigint') amt = Number(amt);
  
  if (!Number.isSafeInteger(amt)) throw new TypeError('Random bytes amount must be integer');
  if (amt < 0) throw new RangeError('Random bytes amount cannot be negative');
  
  if (amt == 0) return Buffer.alloc(0);
  
  let start = RandomCacheIndex;
  let end = RandomCacheIndex + amt;
  
  if (end < CACHE_SIZE) {
    RandomCacheIndex += amt;
    
    return {
      buf: RandomCache.subarray(start, end),
      raw: true,
    };
  } else if (end == CACHE_SIZE) {
    let returnBuf = Buffer.from(RandomCache.subarray(start, end));
    
    fillCacheInternal();
    
    RandomCacheIndex = 0;
    
    return {
      buf: returnBuf,
      raw: false,
    };
  } else if (amt < CACHE_SIZE) {
    let returnBuf = Buffer.allocUnsafe(amt);
    
    RandomCache.copy(returnBuf, 0, start, CACHE_SIZE);
    
    fillCacheInternal();
    
    RandomCache.copy(returnBuf, CACHE_SIZE - start, 0, amt - (CACHE_SIZE - start));
    
    RandomCacheIndex = (RandomCacheIndex + amt) % CACHE_SIZE;
    
    return {
      buf: returnBuf,
      raw: false,
    };
  } else {
    return {
      buf: getPrngBytes(amt),
      raw: false,
    };
  }
}

// getRandBytesRaw(Integer/BigInt: amt >= 0) -> Buffer
// Returns a buffer of amt random bytes sliced directly from the cache when possible.
function getRandBytesRaw(amt) {
  let randomBytes = getRandBytesInternal(amt);
  return randomBytes.buf;
}

// getRandBytesCopy(Integer/BigInt: amt >= 0) -> Buffer
// Returns a buffer of amt random bytes copied from the cache, safe to modify.
function getRandBytesCopy(amt) {
  let randomBytes = getRandBytesInternal(amt);
  if (randomBytes.raw)
    return Buffer.from(randomBytes.buf);
  else
    return randomBytes.buf;
}

// getIntSizeInternal(Integer/BigInt: int >= 0) -> Integer
// Returns the length of the binary string of an integer
function getIntSizeInternal(int) {
  if (int < 0) throw new RangeError('Integer cannot be negative');
  
  if (int == 0) return 1;
  
  int = BigInt(int);
  
  let bits = 0;
  
  while (int > 0) {
    int >>= 1n;
    bits++;
  }
  
  return bits;
}

// getRandInt(Integer/BigInt: max >= 0) -> Integer/BigInt
// Returns a random integer from 0 up to but not including max.
function getRandInt(max) {
  if (typeof max == 'bigint') {
    if (max < 0n) throw new RangeError('Random integer array max cannot be negative');
  } else {
    if (!Number.isSafeInteger(max)) throw new TypeError('Random integer array max must be an integer');
    if (max < 0) throw new RangeError('Random integer array max cannot be negative');
  }
  
  if (max == 0 || max == 1) return typeof max == 'bigint' ? 0n : 0;
  
  let bitSize = getIntSizeInternal(max - (typeof max == 'bigint' ? 1n : 1));
  
  let byteSize = Math.ceil(bitSize / 8);
  
  let trimBitsInLastByte = BigInt(byteSize * 8 - bitSize);
  
  let testInt;
  
  do {
    let randomBytes = getRandBytesRaw(byteSize);
    
    testInt = 0n;
    
    for (let i = randomBytes.length - 2; i >= 0; i--) {
      testInt += BigInt(randomBytes.readUInt8(i)) << BigInt(i) * 8n;
    }
    
    testInt += BigInt(randomBytes.readUInt8(randomBytes.length - 1)) >> trimBitsInLastByte << BigInt(randomBytes.length - 1) * 8n;
  } while (testInt >= max);
  
  return typeof max == 'bigint' ? testInt : Number(testInt);
}

// getRandIntArray(Integer/BigInt: max >= 0, Integer/BigInt: len >= 0) -> [ 0 <= Integer/BigInt < max, ... ]
// Returns an array of len random integers, ranging from 0 to max - 1, inclusive.
function getRandIntArray(max, len) {
  if (typeof max == 'bigint') {
    if (max < 0n) throw new RangeError('Random integer array max cannot be negative');
  } else {
    if (!Number.isSafeInteger(max)) throw new TypeError('Random integer array max must be an integer');
    if (max < 0) throw new RangeError('Random integer array max cannot be negative');
  }
  if (typeof len == 'bigint') {
    if (len < 0n) throw new RangeError('Random integer array length cannot be negative');
  } else {
    if (!Number.isSafeInteger(len)) throw new TypeError('Random integer array length must be an integer');
    if (len < 0) throw new RangeError('Random integer array length cannot be negative');
  }
  
  if (len == 0) return [];
  
  if (max == 0 || max == 1) return new Array(len).fill(typeof max == 'bigint' ? 0n : 0);
  
  let maxBigInt = BigInt(max);
  
  let totalMax = maxBigInt ** BigInt(len);
  
  let randomInt = getRandInt(totalMax);
  
  let returnArr = [];
  
  if (typeof max == 'bigint') {
    for (let i = 0; i < len; i++) {
      returnArr.push(randomInt % maxBigInt);
      randomInt /= maxBigInt;
    }
  } else {
    for (let i = 0; i < len; i++) {
      returnArr.push(Number(randomInt % maxBigInt));
      randomInt /= maxBigInt;
    }
  }
  
  return returnArr;
}

// getRandIntOneChoiceArray(Integer/BigInt: max >= 0, Integer/BigInt: len >= 0) -> [ 0 <= Integer/BigInt < max, ... ]
// Returns an array of len random integers, ranging from 0 to max - 1, inclusive, without repeats.
function getRandIntOneChoiceArray(max, len) {
  if (typeof max == 'bigint') {
    if (max < 0n) throw new RangeError('Random integer array max cannot be negative');
  } else {
    if (!Number.isSafeInteger(max)) throw new TypeError('Random integer array max must be an integer');
    if (max < 0) throw new RangeError('Random integer array max cannot be negative');
  }
  if (len == null) len = max;
  if (typeof len == 'bigint') {
    if (len < 0n) throw new RangeError('Random integer array length cannot be negative');
  } else {
    if (!Number.isSafeInteger(len)) throw new TypeError('Random integer array length must be an integer');
    if (len < 0) throw new RangeError('Random integer array length cannot be negative');
    if (len > max) throw new RangeError('Random integer array len cannot be over max');
  }
  
  if (len == 0) return [];
  
  if (max == 0 || max == 1) return new Array(len).fill(typeof max == 'bigint' ? 0n : 0);
  
  let maxBigInt = BigInt(max);
  
  let totalMax = 1n;
  for (var i = 0n; i < len; i++) {
    totalMax *= maxBigInt - i;
  }
  
  let randomInt = getRandInt(totalMax);
  
  let returnArr = [];
  
  let choicesArr = [];
  
  if (typeof max == 'bigint') {
    for (let i = 0n; i < maxBigInt; i++)
      choicesArr.push(i);
    
    for (let i = 0n; i < len; i++) {
      let arrIndex = maxBigInt - i;
      returnArr.push(choicesArr.splice(Number(randomInt % arrIndex), 1)[0]);
      randomInt /= arrIndex;
    }
  } else {
    for (let i = 0; i < max; i++)
      choicesArr.push(i);
    
    for (let i = 0n; i < len; i++) {
      let arrIndex = maxBigInt - i;
      returnArr.push(choicesArr.splice(Number(randomInt % arrIndex), 1)[0]);
      randomInt /= arrIndex;
    }
  }
  
  return returnArr;
}

module.exports = {
  fillCacheInternal, getRandBytesInternal, getIntSizeInternal,
  getRandBytesRaw, getRandBytesCopy,
  getRandInt, getRandIntArray, getRandIntOneChoiceArray,
};
