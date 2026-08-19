import { log } from "node:console";
import { inspect } from "node:util";

const INITIAL_CAPACITY_POWER = 5;
const MAX_CAPACITY_POWER = 20;
const COMPACT_THRESHOLD = 0.75;

function alignToPowerOfTwo(value) {
  return 1 << (32 - Math.clz32(value - 1));
}

export class DynamicBuffer {
  #capacity;
  #maxCapacity;
  #view;
  #uint8;
  #arrayBuffer;
  #readOffset;
  #writeOffset;
  #config;
  #frozen;

  constructor(data, options = {}) {
    const {
      initialCapacityPower = INITIAL_CAPACITY_POWER,
      maxCapacityPower = MAX_CAPACITY_POWER,
      growthFactor = DEFAULT_GROWTH_FACTOR,
      compactThreshold = COMPACT_THRESHOLD,
    } = options;

    this.#config = {
      maxCapacityPower,
      compactThreshold,
    };

    const source = this.#setDataType(data);
    const needed = source.length;

    this.#assertMaxCapacity(needed);

    const initialCapacity = 1 << initialCapacityPower;
    const alignedCapacity = alignToPowerOfTwo(needed);

    this.#capacity = Math.max(initialCapacity, alignedCapacity);
    this.#readOffset = 0;
    this.#writeOffset = alignedCapacity;

    this.#arrayBuffer = new ArrayBuffer(this.#capacity);
    this.#uint8 = new Uint8Array(this.#arrayBuffer);
    this.#view = new DataView(this.#arrayBuffer);

    if (alignedCapacity > 0) {
      this.#uint8.set(source, 0);
    }

    this.#frozen = false;
    this.#maxCapacity = 1 << maxCapacityPower;
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

  get maxCapacity() {
    return this.#maxCapacity;
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

  expand(additionalBytes = 0) {
    this.#assertMutable("expand");

    this.#assertNonNegativeInteger(additionalBytes);

    if (additionalBytes === 0) return this.#capacity;

    const newCapacity = this.#capacity + additionalBytes;
    this.#assertMaxCapacity(newCapacity);
  }

  fill(data, count) {
    this.#assertMutable("fill");

    if (!Number.isInteger(data) || data < 0 || data > 255) {
      // TODO: throw TypeError when byte value is out of 0-255 range
    }

    this.#assertNonNegativeInteger(count, "fill");

    if (count === 0) return this.#writeOffset;

    this.#uint8.fill(data, this.#writeOffset, this.#writeOffset + count);
    this.#writeOffset += count;
    return this.#writeOffset;
  }

  append(data) {
    this.#assertMutable("append");

    const source = this.#setDataType(data);
    const lengthSource = source.length;

    if (lengthSource === 0) return this.#writeOffset;

    this.#uint8.set(data, this.#writeOffset);
    this.#writeOffset += lengthSource;
    return this.#writeOffset;
  }

  write(data, offset = 0) {
    this.#assertMutable("write");

    const source = this.#setDataType(data);
    const lengthSource = source.length;

    if (lengthSource === 0) return this.#writeOffset;

    this.#assertReadable(lengthSource, offset, "write");

    const newOffset = this.#readOffset + offset;
    this.#uint8.set(data, newOffset);

    return this.#writeOffset;
  }

  peek(size = this.readableBytes, offset = 0) {
    this.#assertReadable(size, offset, "peek");

    const start = this.#readOffset + offset;
    const end = start + size;

    log(start, end);
    return this.#uint8.slice(start, end);
  }

  peekByte(offset = 0) {
    this.#assertReadable(0, offset, "peekByte");
    return this.#uint8[this.#readOffset + offset];
  }

  at(absoluteIndex = 0) {
    const finalIndexAbs =
      absoluteIndex < 0 ? absoluteIndex + this.#writeOffset : absoluteIndex;

    if (absoluteIndex < 0 || absoluteIndex > this.#writeOffset) {
      // TODO: Implement index out-of-bounds error
    }
    return this.#uint8[finalIndexAbs];
  }

  #assertReadable(
    size = this.#readOffset,
    offset = 0,
    operation = "operation",
  ) {
    this.#assertNonNegativeInteger(offset, operation);
    (this.#assertNonNegativeInteger(size), operation);

    if (size > this.readableBytes - offset) {
      // TODO: Throw error for out of range access
    }
  }

  #growToPower(needPower) {
    const newCapacity = 1 << needPower;

    this.#arrayBuffer = new ArrayBuffer(newCapacity);
    this.#view = new DataView(this.#arrayBuffer);

    const newUint8 = new Uint8Array(this.#arrayBuffer);
    this.#uint8 = newUint8.set(this.#uint8.subarray(0, this.#writeOffset));
    this.#capacity = newCapacity;
  }

  #maybeCompact() {
    const radio = this.readOffset / this.#capacity;
    if (radio >= this.#config.compactThreshold) {
      this.compact();
    }
  }

  #ensureCapacity(needBytes) {
    this.#maybeCompact();

    const requiredCapacity = this.#writeOffset + needBytes;
    if (this.capacity >= requiredCapacity) return;

    const newCapacityPower = alignToPowerOfTwo(requiredCapacity);
    this.#assertMaxCapacity(newCapacityPower);

    this.#growToPower(newCapacityPower);
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
    if (requiredLength > this.#maxCapacity) {
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
}
