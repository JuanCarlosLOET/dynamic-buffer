import { log } from "node:console";
import { inspect } from "node:util";

const INITIAL_EXPONENTE = 5;
const MAX_CAPACITY_POWER = 9;
const COMPACT_THRESHOLD = 0.75;

const TYPE_SIZES = Object.freeze({
  int8: 1,
  uint8: 1,

  int16: 2,
  uint16: 2,

  int32: 4,
  uint32: 4,

  float16: 2,
  float32: 4,
  float64: 8,

  bigint64: 8,
  biguint64: 8,
});

function alignToPowerOfTwo(value) {
  return 1 << (32 - Math.clz32(value - 1));
}

export class DynamicBuffer {
  #capacityExponent;
  #view;
  #uint8;
  #arrayBuffer;
  #readOffset;
  #writeOffset;
  #config;
  #frozen;

  constructor(data, options = {}) {
    const {
      initialExponent = INITIAL_EXPONENTE,
      maxCapacityExponent = MAX_CAPACITY_POWER,
      compactThreshold = COMPACT_THRESHOLD,
    } = options;

    this.#config = {
      initialExponent,
      maxCapacityExponent,
      compactThreshold,
    };

    const source = this.#toUint8Array(data);
    const needed = source.length;

    const needExponent = alignToPowerOfTwo(needed);

    this.#assertMaxCapacity(needExponent);

    this.#capacityExponent = Math.max(initialExponent, needExponent);

    this.#readOffset = 0;
    this.#writeOffset = needed;

    const capacityBytes = 1 << this.#capacityExponent;

    this.#arrayBuffer = new ArrayBuffer(capacityBytes);
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
    return 1 << this.#capacityExponent;
  }

  get readableBytes() {
    return this.#writeOffset - this.#readOffset;
  }

  get writableSpace() {
    return this.capacity - this.#writeOffset;
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

  expand(steps = 1) {
    this.#assertMutable("expand");

    this.#assertNonNegativeInteger(steps);

    if (steps === 0) return this.capacity;

    const nextExponent = this.#capacityExponent + steps;
    this.#assertMaxCapacity(nextExponent);

    this.#growToExponent(nextExponent);
  }

  write(bytes) {
    this.#assertMutable("write");

    if (bytes instanceof Uint8Array) {
      // TODO: Implement error handling for invalid Uint8Array.
      throw new Error("Not implemented");
    }

    const byteLength = bytes.length;
    if (byteLength === 0) return this;

    this.#ensureCapacity(byteLength);

    this.#uint8.set(bytes, this.#writeOffset);
    this.#writeOffset += byteLength;

    return this;
  }

  writeInt8(offset, value) {
    this.#writeType(offset, "int8", value);
  }

  writeUint8(offset, value) {
    this.#writeType(offset, "uint8", value);
  }
  writeInt16(offset, value, le = false) {
    this.#writeType(offset, "int16", value, le);
  }
  writeUint16(offset, value, le = false) {
    this.#writeType(offset, "uint16", value, le);
  }
  writeInt32(offset, value, le = false) {
    this.#writeType(offset, "int32", value, le);
  }
  writeUint32(offset, value, le = false) {
    this.#writeType(offset, "uint32", value, le);
  }
  writeFloat16(offset, value, le = false) {
    this.#writeType(offset, "float16", value, le);
  }
  writeFloat32(offset, value, le = false) {
    this.#writeType(offset, "float32", value, le);
  }
  writeFloat64(offset, value, le = false) {
    this.#writeType(offset, "float64", value, le);
  }
  writeBigInt64(offset, value, le = false) {
    this.#writeType(offset, "bigint64", value, le);
  }
  writeBigUint64(offset, value, le = false) {
    this.#writeType(offset, "biguint64", value, le);
  }

  append(data) {
    this.#assertMutable("append");

    const uint8 = this.#toUint8Array(data);

    return this.write(uint8);
  }

  fill(byte, count) {
    this.#assertMutable("fill");

    const data = this.#toUint8Array(Number(byte));

    this.#assertNonNegativeInteger(count, "fill");

    if (count === 0) return this;

    const bytes = new Uint8Array(count);
    bytes.fill(data[0]);

    this.write(bytes);
  }

  peek(size = this.readableBytes, offset = 0) {
    this.#assertReadable(size, offset, "peek");

    const start = this.#readOffset + offset;
    const end = start + size;

    return this.#uint8.slice(start, end);
  }

  peekByte(offset = 0) {
    this.#assertReadable(0, offset, "peekByte");
    return this.#uint8[this.#readOffset + offset];
  }

  read(offset = 0) {
    this.#assertMutable("read");
    this.#assertReadable(offset);

    const start = this.#readOffset + offset;
    const end = this.#writeOffset;

    const data = this.#uint8.slice(start, end);
    this.#readOffset += offset;

    return data;
  }

  readInt8(offset = 0) {
    this.#assertNonNegativeInteger(offset);
    return this.#readType(offset, "int8");
  }

  readUint8(offset = 0) {
    return this.#readType(offset, "uint8");
  }

  readInt16(offset = 0, littleEndian = false) {
    return this.#readType(offset, "int16", littleEndian);
  }

  readUint16(offset = 0, littleEndian = false) {
    return this.#readType(offset, "uint16", littleEndian);
  }

  readInt32(offset = 0, littleEndian = false) {
    return this.#readType(offset, "int32", littleEndian);
  }

  readUint32(offset = 0, littleEndian = false) {
    return this.#readType(offset, "uint32", littleEndian);
  }

  readFloat16(offset = 0, littleEndian = false) {
    return this.#readType(offset, "float16", littleEndian);
  }

  readFloat32(offset = 0, littleEndian = false) {
    return this.#readType(offset, "float32", littleEndian);
  }

  readFloat64(offset = 0, littleEndian = false) {
    return this.#readType(offset, "float64", littleEndian);
  }

  readBigInt64(offset = 0, littleEndian = false) {
    return this.#readType(offset, "bigint64", littleEndian);
  }

  readBigUint64(offset = 0, littleEndian = false) {
    return this.#readType(offset, "biguint64", littleEndian);
  }

  clear(clear = false) {
    this.#assertMutable("clear");

    const discarded = this.#writeOffset;

    if (clear) {
      this.#uint8.fill(0, 0, this.capacity);
    }
    this.#writeOffset = 0;
    this.#readOffset = 0;

    return discarded;
  }

  reset() {
    this.#capacityExponent = this.#config.initialExponent;
    this.#arrayBuffer = new ArrayBuffer(1 << this.#capacityExponent);
    this.#view = new DataView(this.#arrayBuffer);
    this.#uint8 = new Uint8Array(this.#arrayBuffer);
    this.#uint8.fill(0);

    this.#frozen = false;
    this.#writeOffset = 0;
    this.#readOffset = 0;
  }

  #writeType(offset, type, value, littleEndian) {
    this.#assertNonNegativeInteger(offset);
    this.#assertMutable("writeType");

    if (
      !Number.isFinite(value) &&
      typeof value !== "bigint" &&
      !(Array.isArray(value) && value.length === 1)
    ) {
      // TODO: Implement error handling.
      throw new Error("Not implemented");
    }

    const size = TYPE_SIZES[type];

    const needBytes = size + offset;

    this.#ensureCapacity(needBytes);

    const TYPE = {
      int8: (value) => this.#view.setInt8(offset, value),
      uint8: (value) => this.#view.setUint8(offset, value),

      int16: (value) => this.#view.setInt16(offset, value, littleEndian),
      uint16: (value) => this.#view.setUint16(offset, value, littleEndian),

      int32: (value) => this.#view.setInt32(offset, value, littleEndian),
      uint32: (value) => this.#view.setUint32(offset, value, littleEndian),

      float16: (value) => this.#view.setFloat16(offset, value, littleEndian),
      float32: (value) => this.#view.setFloat32(offset, value, littleEndian),
      float64: (value) => this.#view.setFloat64(offset, value, littleEndian),

      bigint64: (value) => this.#view.setBigInt64(offset, value, littleEndian),
      biguint64: (value) =>
        this.#view.setBigUint64(offset, value, littleEndian),
    };

    TYPE[type](value);
    this.#writeOffset += needBytes;
  }

  #readType(offset, type, littleEndian = false) {
    const size = TYPE_SIZES[type];

    this.#assertNonNegativeInteger(offset);

    this.#assertReadable(size, offset);

    const finalOffset = this.#readOffset + offset;

    const TYPE = {
      int8: () => this.#view.getInt8(finalOffset),
      uint8: () => this.#view.getUint8(finalOffset),

      int16: () => this.#view.getInt16(finalOffset, littleEndian),
      uint16: () => this.#view.getUint16(finalOffset, littleEndian),

      int32: () => this.#view.getInt32(finalOffset, littleEndian),
      uint32: () => this.#view.getUint32(finalOffset, littleEndian),

      float16: () => this.#view.getFloat16(finalOffset, littleEndian),
      float32: () => this.#view.getFloat32(finalOffset, littleEndian),
      float64: () => this.#view.getFloat64(finalOffset, littleEndian),

      bigint64: () => this.#view.getBigInt64(finalOffset, littleEndian),
      biguint64: () => this.#view.getBigUint64(finalOffset, littleEndian),
    };

    return TYPE[type]();
  }

  #assertReadable(
    size = this.#readOffset,
    offset = 0,
    operation = "operation",
  ) {
    this.#assertNonNegativeInteger(offset, operation);
    (this.#assertNonNegativeInteger(size), operation);

    if (offset <= size - 1) {
      // TODO: Throw error for out of range access
      throw new Error("not implemented");
    }

    if (size > this.readableBytes - offset) {
      // TODO: Throw error for out of range access
      throw new Error("not implemented");
    }
  }

  #growToExponent(needExponent) {
    const newCapacity = 1 << needExponent;

    this.#arrayBuffer = new ArrayBuffer(newCapacity);
    this.#view = new DataView(this.#arrayBuffer);

    const newUint8 = new Uint8Array(this.#arrayBuffer);
    this.#uint8 = newUint8.set(this.#uint8.subarray(0, this.#writeOffset));

    this.#capacityExponent = needExponent;
  }

  #maybeCompact() {
    const radio = this.readOffset / this.capacity;
    if (radio >= this.#config.compactThreshold) {
      this.compact();
    }
  }

  #ensureCapacity(needBytes) {
    this.#maybeCompact();

    const requiredExponent = alignToPowerOfTwo(this.#writeOffset + needBytes);
    if (requiredExponent <= this.#capacityExponent) return;

    this.#assertMaxCapacity(requiredExponent);

    this.#growToExponent(requiredExponent);
  }

  #toUint8Array(data) {
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

  #assertMaxCapacity(newExponent) {
    if (newExponent > this.#config.maxCapacityExponent) {
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
