// villain/struct.ts
// Functions that provide functionality somewhat like Python's `struct` module: packing and
// unpacking a bunch of values to and from binary data.
//
// Because there's no standard way for dealing with binary data in JavaScript (yet), these functions
// deal with arrays of byte values instead.

type FormatChar = 'B' | 'H' | 'I' | 'f';

// Helpers: pack numbers to byte arrays in network byte order.
const toUint8  = (n: number): number[] => [n & 0xFF];
const toUint16 = (n: number): number[] => [(n & 0xFF00) >> 8, n & 0x00FF];
const toUint32 = (n: number): number[] => [
  (n & 0xFF000000) >> 24,
  (n & 0x00FF0000) >> 16,
  (n & 0x0000FF00) >> 8,
   n & 0x000000FF,
];

// And the reverse.
const fromUint8  = (d: number[], o: number): number => d[o];
const fromUint16 = (d: number[], o: number): number => (d[o] << 8) + d[o + 1];
const fromUint32 = (d: number[], o: number): number =>
  (d[o] << 24) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3];


// Packer function type — callable with (type, value) and has a .finish() method.
export interface Packer {
  (type: FormatChar, value: number | boolean): void;
  finish(): number[];
}

// Unpacker function type — callable with (type) and has a .finish() method.
export interface Unpacker {
  (type: FormatChar): number | boolean;
  finish(): number;
}

export function buildPacker(): Packer {
  let data: number[] = [];
  let bits: number | null = null;
  let bitIndex = 0;

  const flushBitFields = () => {
    if (bits === null) return;
    data.push(bits);
    bits = null;
  };

  const retval = function(type: FormatChar, value: number | boolean): void {
    if (type === 'f') {
      if (bits === null) {
        bits = value ? 1 : 0;
        bitIndex = 1;
      } else {
        if (value) bits |= 1 << bitIndex;
        bitIndex++;
        if (bitIndex === 8) flushBitFields();
      }
    } else {
      flushBitFields();
      const n = value as number;
      switch (type) {
        case 'B': data = data.concat(toUint8(n)); break;
        case 'H': data = data.concat(toUint16(n)); break;
        case 'I': data = data.concat(toUint32(n)); break;
        default: throw new Error(`Unknown format character ${type}`);
      }
    }
  } as Packer;

  retval.finish = (): number[] => {
    flushBitFields();
    return data;
  };

  return retval;
}

export function buildUnpacker(data: number[], offset?: number): Unpacker {
  if (!offset) offset = 0;
  let idx = offset;
  let bitIndex = 0;

  const retval = function(type: FormatChar): number | boolean {
    if (type === 'f') {
      const bit = (1 << bitIndex) & data[idx];
      const value = bit > 0;
      bitIndex++;
      if (bitIndex === 8) {
        idx++;
        bitIndex = 0;
      }
      return value;
    } else {
      if (bitIndex !== 0) {
        idx++;
        bitIndex = 0;
      }
      let value: number;
      let bytes: number;
      switch (type) {
        case 'B': value = fromUint8(data, idx);  bytes = 1; break;
        case 'H': value = fromUint16(data, idx); bytes = 2; break;
        case 'I': value = fromUint32(data, idx); bytes = 4; break;
        default: throw new Error(`Unknown format character ${type}`);
      }
      idx += bytes;
      return value;
    }
  } as Unpacker;

  retval.finish = (): number => {
    if (bitIndex !== 0) idx++;
    return idx - offset!;
  };

  return retval;
}

export function pack(fmt: string, ...values: (number | boolean)[]): number[] {
  const packer = buildPacker();
  for (let i = 0; i < fmt.length; i++) {
    packer(fmt[i] as FormatChar, values[i]);
  }
  return packer.finish();
}

export function unpack(fmt: string, data: number[], offset?: number): [Array<number | boolean>, number] {
  const unpacker = buildUnpacker(data, offset);
  const values = Array.from(fmt).map(type => unpacker(type as FormatChar));
  return [values, unpacker.finish()];
}
