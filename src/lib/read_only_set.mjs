export class ReadOnlySet {
  #set;
  
  constructor(iterable) {
    this.#set = new Set(iterable);
  }
  
  has(value) {
    return this.#set.has(value);
  }
  
  add(_value) {
    throw new Error('ReadOnlySet is not editable');
  }
  
  delete(_value) {
    throw new Error('ReadOnlySet is not editable');
  }
  
  get size() {
    return this.#set.size;
  }
  
  clear() {
    throw new Error('ReadOnlySet is not editable');
  }
  
  [Symbol.for('nodejs.util.inspect.custom')](_, inspectOptions, inspect) {
    return `ReadOnly${inspect(this.#set, inspectOptions)}`;
  }
}
