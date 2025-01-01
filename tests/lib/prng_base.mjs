// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript

// seed generator, input a string and call generate function repeatedly for 32-bit seeds

export class Xmur3 {
  #h;
  
  constructor(string) {
    if (typeof string != 'string') {
      throw new Error(`xmur3 must be initialized with a string but was given: ${typeof string}`);
    }
    
    let i, h;
    
    for (i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = h << 13 | h >>> 19;
    }
    
    this.#h = h;
  }
  
  generate() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  
  getState() {
    return {
      h: this.#h,
    };
  }
}

// simple, fast prng with 4 32-bit ints as seeds, outputs 32-bit int

export class Sfc32 {
  #a;
  #b;
  #c;
  #d;
  
  constructor(a, b, c, d) {
    if (!Number.isSafeInteger(a)) {
      throw new Error(`a not safe integer: ${a}`);
    }
    
    if (!Number.isSafeInteger(b)) {
      throw new Error(`b not safe integer: ${b}`);
    }
    
    if (!Number.isSafeInteger(c)) {
      throw new Error(`c not safe integer: ${c}`);
    }
    
    if (!Number.isSafeInteger(d)) {
      throw new Error(`d not safe integer: ${d}`);
    }
    
    this.#a = a;
    this.#b = b;
    this.#c = c;
    this.#d = d;
  }
  
  generateUInt32() {
    this.#a >>>= 0; this.#b >>>= 0; this.#c >>>= 0; this.#d >>>= 0;
    
    let t = (this.#a + this.#b) | 0;
    
    this.#a = this.#b ^ this.#b >>> 9;
    this.#b = this.#c + (this.#c << 3) | 0;
    this.#c = (this.#c << 21 | this.#c >>> 11);
    this.#d = this.#d + 1 | 0;
    t = t + this.#d | 0;
    this.#c = this.#c + t | 0;
    
    return t >>> 0;
  }
  
  // Generates a float in range [0, 1)
  generateFloat0to1Coarse() {
    return this.generateUInt32() / 4_294_967_296;
  }
  
  fillWithRandomBytes(buffer) {
    let i;
    
    for (i = 0; i + 4 < bytes; i += 4) {
      buffer.writeUInt32BE(this.generateUInt32(), i);
    }
    
    if (i < bytes) {
      let val = obj.uint32();
      for (; i < bytes; i++, val <<= 8) buffer[i] = val >> 24;
    }
  }
  
  randomBytes() {
    let buffer = Buffer.alloc(bytes);
    
    this.fillWithRandomBytes(buffer);
    
    return buffer;
  }
  
  getState() {
    return {
      a: this.#a,
      b: this.#b,
      c: this.#c,
      d: this.#d,
    };
  }
}

export function sfc32FromInts(a, b, c, d) {
  return new Sfc32(
    a,
    b,
    c,
    d
  );
}

export function sfc32FromString(string) {
  let seeder = new Xmur3(string);
  
  return new Sfc32(
    seeder.generate(),
    seeder.generate(),
    seeder.generate(),
    seeder.generate()
  );
}
