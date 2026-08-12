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
  #frozen;

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

    this.#assertMaxCapacity(needed);

    this.#capacity = Math.max(initialCapacity, needed);
    this.#readOffset = 0;
    this.#writeOffset = needed;

    this.#arrayBuffer = new ArrayBuffer(this.#capacity);
    this.#uint8 = new Uint8Array(this.#arrayBuffer);
    this.#view = new DataView(this.#arrayBuffer);

    this.#frozen = false;
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
  get isFrozen() {
    return this.#frozen;
  }

  freeze() {
    this.#frozen = true;
    return this;
  }

  compact() {
    this.#assertMutable("compact");

    if (this.#readOffset === 0) return;

    const readable = this.readableBytes;

    if (readable > 0) {
      this.#uint8.copyWithin(0, this.#readOffset, this.#writeOffset);
    }

    this.#readOffset = 0;
    this.#writeOffset = readable;
  }

  write(data) {
    this.#assertMutable("write");

    const source = this.#setDataType(data);
    const lengthSource = source.length;

    if (lengthSource === 0) return this.#writeOffset;

    this.#ensureWritable(source.length);

    this.#uint8.set(data, this.#writeOffset);
    this.#writeOffset += lengthSource;
    return this.#writeOffset;
  }

  #ensureWritable(length) {
    if (this.writableSpace >= length) return;

    // TODO: Implement compaction

    const required = this.#writeOffset + length;

    this.#assertMaxCapacity(required);
    this.#grow(required);
  }

  #grow(requiredCapacity) {
    const newCapacity = Math.max(
      requiredCapacity,
      this.#capacity * this.#config.growthFactor,
    );

    this.#assertMaxCapacity(newCapacity);

    this.#arrayBuffer = new ArrayBuffer(newCapacity);
    this.#view = new DataView(this.#arrayBuffer);

    const newUint8 = new Uint8Array(this.#arrayBuffer);
    this.#uint8 = newUint8.set(this.#uint8.subarray(0, this.#writeOffset));
    this.#capacity = newCapacity;
  }

  #setDataType(data) {
    // -- Uint8Array --
    if (data instanceof Uint8Array) {
      return data;
    }
    //  -- ArrayBuffer --
    else if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    // -- Array --
    else if (Array.isArray(data)) {
      return Uint8Array.from(data);
    }
    // -- number --
    else if (Number.isInteger(data) && data >= 0 && data <= 255) {
      return Uint8Array.of(data);

      // -- no data supplied --
    } else if (data == null) {
      return new Uint8Array(0);
    }
    // TODO: Implement error handling for invalid data types
  }

  #assertMaxCapacity(requiredLength) {
    if (requiredLength > this.#config.maxCapacity) {
      // TODO: Implement overflow handling
    }
  }

  #assertMutable(operation = "operation") {
    if (this.#frozen) {
      // TODO: Throw error when buffer is frozen
    }
  }
}
