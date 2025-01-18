export class ReadOnlySet {
  #set;
  
  constructor(iterable) {
    this.#set = new Set(iterable);
  }
  
  has(value) {
    return this.#set.has(value);
  }
  
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  add(_value) {
    throw new Error('ReadOnlySet is not editable');
  }
  
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  delete(_value) {
    throw new Error('ReadOnlySet is not editable');
  }
  
  get size() {
    return this.#set.size;
  }
  
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  clear() {
    throw new Error('ReadOnlySet is not editable');
  }
  
  [Symbol.iterator]() {
    return this.#set[Symbol.iterator]();
  }
  
  [Symbol.for('nodejs.util.inspect.custom')](_, inspectOptions, inspect) {
    return `ReadOnly${inspect(this.#set, inspectOptions)}`;
  }
}
