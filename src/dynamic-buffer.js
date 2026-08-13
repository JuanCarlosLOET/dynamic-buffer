import { log } from "node:console";
import { inspect } from "node:util";
const DEFAULT_INITIAL_CAPACITY = 256 * 1;
const DEFAULT_MAX_CAPACITY = 256 * 2;
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

  constructor(data, options = {}) {
    const {
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

    if (needed > 0) {
      this.#uint8.set(source, 0);
    }

    this.#frozen = false;
  }

  // Test-only setter for readOffset.
  set readOffset(value) {
    this.#readOffset = value;
  }

  // Test-only getter for dataBuffer.
  get dataBuffer() {
    return this.#uint8;
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

  [inspect.custom](depth, options, inspect) {
    const rows = [
      ["capacity", this.capacity],
      ["readOffset", this.#readOffset],
      ["writeOffset", this.#writeOffset],
      ["readableBytes", this.readableBytes],
      ["consumedBytes", this.consumedBytes],
      ["writableSpace", this.writableSpace],
    ];

    const keyWidth = Math.max(...rows.map(([key]) => key.length));

    const body = rows
      .map(
        ([key, value]) =>
          `  ${key.padEnd(keyWidth)} : ${inspect(value, options)}`,
      )
      .join("\n");

    return `DynamicBuffer {\n${body}\n}`;
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

  reserve(minCapacity) {
    this.#assertMutable("reserve");

    if (!Number.isInteger(minCapacity) || minCapacity < 0) {
      // TODO: Throw an error for invalid capacity
    }

    if (minCapacity <= this.#capacity) return;
    this.#grow(minCapacity);
  }

  fill(data, count) {
    this.#assertMutable("fill");

    if (!Number.isInteger(data) || data < 0 || data > 255) {
      // TODO: throw TypeError when byte value is out of 0-255 range
    }

    this.#assertNonNegativeInteger(count, "fill");

    if (count === 0) return this.#writeOffset;

    this.#ensureWritable(count);
    this.#uint8.fill(data, this.#writeOffset, this.#writeOffset + count);
    this.#writeOffset += count;
    return this.#writeOffset;
  }

  append(data) {
    this.#assertMutable("append");

    const source = this.#setDataType(data);
    const lengthSource = source.length;

    if (lengthSource === 0) return this.#writeOffset;

    this.#ensureWritable(source.length);

    this.#uint8.set(data, this.#writeOffset);
    this.#writeOffset += lengthSource;
    return this.#writeOffset;
  }

  write(data, offset) {
    this.#assertMutable("write");

    const source = this.#setDataType(data);
    const lengthSource = source.length;

    if (lengthSource === 0) return this.#writeOffset;

    this.#assertRange(offset, lengthSource, "write");

    const finalOffset = this.#readOffset + offset;
    this.#uint8.set(data, finalOffset);

    return this.#writeOffset;
  }

  peek(offset, length) {}

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
      // TODO: Implement frozen buffer handling
    }
  }
  #assertNonNegativeInteger(value, operación = "operation") {
    if (!Number.isSafeInteger(value) || value < 0) {
      // TODO: Throw error for invalid non-negative integer
    }
  }

  #assertRange(offset, size, operation = "operation") {
    this.#assertNonNegativeInteger(offset, operation);
    (this.#assertNonNegativeInteger(size), operation);
    log(size, offset);
    if (size > this.readableBytes - offset) {
      // TODO: Throw error for out of range access
    }
  }
}
