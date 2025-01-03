// random number library for node-server
// uses a cache buffer for small requests

import { sfc32FromString } from './prng_base.mjs';

const DEFAULT_CACHE_SIZE = 65536;
export const DEFAULT_SEED_STRING = 'testing string';

// getIntegerBinaryStringSize(Integer/BigInt: int >= 0) -> Integer
// Returns the length of the binary string of an integer
function getIntegerBinaryStringSize(int) {
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

export class AdvancedPrng {
  #prng;
  #randomCache;
  #randomCacheIndex;
  
  constructor({
    cacheSize = DEFAULT_CACHE_SIZE,
    seedString = DEFAULT_SEED_STRING,
  } = {}) {
    if (!Number.isSafeInteger(cacheSize) || cacheSize < 0) {
      throw new Error(`cacheSize not nonnegative integer: ${cacheSize}`);
    }
    
    this.#prng = sfc32FromString(seedString);
    
    // setup random cache with current index for fresh bytes
    this.#randomCache = Buffer.alloc(cacheSize);
    this.#randomCacheIndex = 0;
    
    // fills the random cache
    this.#fillRandomCache();
  }
  
  #getPrngBytes(numBytes) {
    return this.#prng.randomBytes(numBytes);
  }
  
  #fillPrngBytes(buffer) {
    this.#prng.fillWithRandomBytes(buffer);
  }
  
  #fillRandomCache() {
    this.#fillPrngBytes(this.#randomCache);
  }
  
  // getRandomBytesInternal(Integer/BigInt: numBytes >= 0) -> { buf: Buffer, raw: Boolean }
  // Returns an object with a Buffer "buf" containing "numBytes" bytes and a bool
  // "raw" indicating whether "buf" is directly sliced from the cache.
  // WARNING: raw == true buffers will change contents when cache is reset, so use synchronously!
  #getRandomBytesInternal(numBytes) {
    if (typeof numBytes == 'bigint') numBytes = Number(numBytes);
    
    if (!Number.isSafeInteger(numBytes)) throw new TypeError('Random bytes amount must be integer');
    if (numBytes < 0) throw new RangeError('Random bytes amount cannot be negative');
    
    if (numBytes == 0) return Buffer.alloc(0);
    
    let start = this.#randomCacheIndex;
    let end = this.#randomCacheIndex + numBytes;
    
    if (end < this.#randomCache.length) {
      this.#randomCacheIndex += numBytes;
      
      return {
        buf: this.#randomCache.subarray(start, end),
        raw: true,
      };
    } else if (end == this.#randomCache.length) {
      let returnBuf = Buffer.from(this.#randomCache.subarray(start, end));
      
      this.#fillRandomCache();
      
      this.#randomCacheIndex = 0;
      
      return {
        buf: returnBuf,
        raw: false,
      };
    } else if (numBytes < this.#randomCache.length) {
      let returnBuf = Buffer.allocUnsafe(numBytes);
      
      this.#randomCache.copy(returnBuf, 0, start, this.#randomCache.length);
      
      this.#fillRandomCache();
      
      this.#randomCache.copy(returnBuf, this.#randomCache.length - start, 0, numBytes - (this.#randomCache.length - start));
      
      this.#randomCacheIndex = (this.#randomCacheIndex + numBytes) % this.#randomCache.length;
      
      return {
        buf: returnBuf,
        raw: false,
      };
    } else {
      return {
        buf: this.#getPrngBytes(numBytes),
        raw: false,
      };
    }
  }
  
  // getRandomBytesRaw(Integer/BigInt: numBytes >= 0) -> Buffer
  // Returns a buffer of numBytes random bytes sliced directly from the cache when possible.
  getRandomBytesRaw(numBytes) {
    let randomBytes = this.#getRandomBytesInternal(numBytes);
    
    return randomBytes.buf;
  }
  
  // getRandomBytesCopy(Integer/BigInt: numBytes >= 0) -> Buffer
  // Returns a buffer of numBytes random bytes copied from the cache, safe to modify.
  getRandomBytesCopy(numBytes) {
    const randomBytes = this.#getRandomBytesInternal(numBytes);
    
    if (randomBytes.raw)
      return Buffer.from(randomBytes.buf);
    else
      return randomBytes.buf;
  }
  
  // getRandomInteger(Integer/BigInt: max >= 0) -> Integer/BigInt
  // Returns a random integer from 0 up to but not including max.
  getRandomInteger(max) {
    if (typeof max == 'bigint') {
      if (max < 0n) throw new RangeError('Random integer array max cannot be negative');
    } else {
      if (!Number.isSafeInteger(max)) throw new TypeError('Random integer array max must be an integer');
      if (max < 0) throw new RangeError('Random integer array max cannot be negative');
    }
    
    if (max == 0 || max == 1) return typeof max == 'bigint' ? 0n : 0;
    
    let bitSize = getIntegerBinaryStringSize(max - (typeof max == 'bigint' ? 1n : 1));
    
    let byteSize = Math.ceil(bitSize / 8);
    
    let trimBitsInLastByte = BigInt(byteSize * 8 - bitSize);
    
    let testInt;
    
    do {
      let randomBytes = this.getRandomBytesRaw(byteSize);
      
      testInt = 0n;
      
      for (let i = randomBytes.length - 2; i >= 0; i--) {
        testInt += BigInt(randomBytes.readUInt8(i)) << BigInt(i) * 8n;
      }
      
      testInt += BigInt(randomBytes.readUInt8(randomBytes.length - 1)) >> trimBitsInLastByte << BigInt(randomBytes.length - 1) * 8n;
    } while (testInt >= max);
    
    return typeof max == 'bigint' ? testInt : Number(testInt);
  }
  
  // getRandomIntegerArray(Integer/BigInt: max >= 0, Integer/BigInt: len >= 0) -> [ 0 <= Integer/BigInt < max, ... ]
  // Returns an array of len random integers, ranging from 0 to max - 1, inclusive.
  getRandomIntegerArray(max, len) {
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
    
    let randomInt = this.getRandomInteger(totalMax);
    
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
  
  // getRandomArrayOfUniqueIntegers(Integer/BigInt: max >= 0, Integer/BigInt: len >= 0) -> [ 0 <= Integer/BigInt < max, ... ]
  // Returns an array of len random integers, ranging from 0 to max - 1, inclusive, without repeats.
  getRandomArrayOfUniqueIntegers(max, len) {
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
    
    let randomInt = this.getRandomInteger(totalMax);
    
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
}
