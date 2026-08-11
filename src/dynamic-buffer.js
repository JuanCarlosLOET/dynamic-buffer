const DEFAULT_INITIAL_CAPACITY = 1024 * 2;

export class DynamicBuffer {
  #capacity;
  #view;
  #uint8;
  #arrayBuffer;
  #readOffset;
  #writeOffset;

  constructor(options = {}) {
    const { data, initialCapacity = DEFAULT_INITIAL_CAPACITY } = options;

    const source = this.#setDataType(data);

    const needed = source.length;
    this.#capacity = Math.max(initialCapacity, needed);
    this.#readOffset = 0;
    this.#writeOffset = needed;

    this.#arrayBuffer = new ArrayBuffer(this.#capacity);
    this.#uint8 = new Uint8Array(this.#arrayBuffer);
    this.#view = new DataView(this.#arrayBuffer);
  }

  get capacity() {
    return this.#capacity;
  }

  get readableBytes() {
    return this.#writeOffset - this.#readOffset;
  }

  get writableSpace() {
    return this.#capacity - this.#writeOffset;
  }

  get consumedBytes() {
    return this.#readOffset;
  }

  #setDataType(data) {
    if (data instanceof Uint8Array) {
      return data;
    } else if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    } else if (Array.isArray(data)) {
      return Uint8Array.from(data);
    } else if (typeof data === "string") {
      return Uint8Array.from(data);
    }

    return new Uint8Array();
  }
}
