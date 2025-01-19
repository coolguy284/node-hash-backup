import { Transform } from 'node:stream';

export class CounterStream extends Transform {
  #lengthCounted = 0;
  
  constructor(options) {
    super(options);
  }
  
  _transform(chunk, _, callback) {
    this.#lengthCounted += chunk.length;
    callback(null, chunk);
  }
  
  getLengthCounted() {
    return this.#lengthCounted;
  }
}
