// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
module.exports = exports = {
  // seed generator, input a string and call returned function repeatedly for 32-bit seeds
  xmur3: function (str) {
    for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353),
      h = h << 13 | h >>> 19;
    return function () {
      h = Math.imul(h ^ h >>> 16, 2246822507);
      h = Math.imul(h ^ h >>> 13, 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  },
  // simple, fast prng with 4 32-bit ints as seeds, outputs 32-bit int
  sfc32_multifunc: function (a, b, c, d) {
    let obj = {
      uint32: function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        var t = (a + b) | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        d = d + 1 | 0;
        t = t + d | 0;
        c = c + t | 0;
        return (t >>> 0);
      },
      random: function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        var t = (a + b) | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        d = d + 1 | 0;
        t = t + d | 0;
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
      },
      randomBytes: function (bytes) {
        let buf = Buffer.allocUnsafe(bytes), i;
        for (i = 0; i + 4 < bytes; i += 4) {
          buf.writeUInt32BE(obj.uint32(), i);
        }
        if (i < bytes) {
          let val = obj.uint32();
          for (; i < bytes; i++, val <<= 8) buf[i] = val >> 24;
        }
        return buf;
      },
      randomBytesFill: function (buf) {
        let i;
        for (i = 0; i + 4 < buf.length; i += 4) {
          buf.writeUInt32BE(obj.uint32(), i);
        }
        if (i < buf.length) {
          let val = obj.uint32();
          for (; i < buf.length; i++, val <<= 8) buf[i] = val >> 24;
        }
        return buf;
      },
    };
    return obj;
  },
};
