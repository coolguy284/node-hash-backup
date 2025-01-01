export class ReadOnlyMap {
  #map;
  
  constructor(iterable) {
    this.#map = new Map(iterable);
  }
  
  has(key) {
    return this.#map.has(key);
  }
  
  get(key) {
    return this.#map.get(key);
  }
  
  set(_key, _value) {
    throw new Error('ReadOnlyMap is not editable');
  }
  
  delete(_key) {
    throw new Error('ReadOnlyMap is not editable');
  }
  
  get size() {
    return this.#map.size;
  }
  
  clear() {
    throw new Error('ReadOnlyMap is not editable');
  }
  
  keys() {
    return this.#map.keys();
  }
  
  values() {
    return this.#map.values();
  }
  
  entries() {
    return this.#map.entries();
  }
  
  [Symbol.for('nodejs.util.inspect.custom')](_, inspectOptions, inspect) {
    return `ReadOnly${inspect(this.#map, inspectOptions)}`;
  }
}
