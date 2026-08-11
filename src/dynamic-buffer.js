const DEFAULT_INITIAL_CAPACITY = 1024 * 2;
const DEFAULT_MAX_CAPACITY = 1024 * 4;
const DEFAULT_GROWTH_FACTOR = 2.0;

export class DynamicBuffer {
  #capacity;
  #view;
  #uint8;
  #arrayBuffer;
  #readOffset;
  #writeOffset;
  #config;

  constructor(options = {}) {
    const {
      data,
      initialCapacity = DEFAULT_INITIAL_CAPACITY,
      maxCapacity = DEFAULT_MAX_CAPACITY,
      growthFactor = DEFAULT_GROWTH_FACTOR,
    } = options;

    this.#config = {
      initialCapacity,
      maxCapacity,
      growthFactor,
    };
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
  write(data) {
    const source = this.#setDataType(data);
    this.#ensureWritable(source.length);
  }

  #ensureWritable(length) {
    if (this.writableSpace >= length) return;

    // TODO: Implement compaction

    const required = this.#writeOffset + length;
    this.#assertCapacity(required);

    this.#grow(required);
  }

  #grow(required) {
    const newCapacity = Math.max(
      required,
      this.#capacity * this.#config.growthFactor,
    );

    this.#assertCapacity(newCapacity);

    this.#arrayBuffer = new ArrayBuffer(newCapacity);
    this.#view = new DataView(this.#arrayBuffer);

    const newUint8 = new Uint8Array(this.#arrayBuffer);
    this.#uint8 = newUint8.set(this.#uint8.subarray(0, this.#writeOffset));
    this.#capacity = newCapacity;
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
  #assertCapacity(required) {
    if (required > this.#config.maxCapacity) {
      // TODO: Implement overflow handling
    }
  }
}
