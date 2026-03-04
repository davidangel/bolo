import { buildPacker, buildUnpacker, pack, unpack } from './struct';

describe('struct helpers', () => {
  test('packs single false bit as zero byte', () => {
    expect(pack('f', false)).toEqual([0]);
  });

  test('packs bytes in network order for B/H/I', () => {
    expect(pack('BHI', 0xAB, 0xCDEF, 0x12345678)).toEqual([
      0xAB,
      0xCD, 0xEF,
      0x12, 0x34, 0x56, 0x78,
    ]);
  });

  test('packs and unpacks bitfields with f format', () => {
    const data = pack('ffffffff', true, false, true, false, true, false, true, false);
    expect(data).toEqual([0b01010101]);

    const [values, bytes] = unpack('ffffffff', data);
    expect(values).toEqual([true, false, true, false, true, false, true, false]);
    expect(bytes).toBe(1);
  });

  test('flushes partial bitfield before numeric values', () => {
    const data = pack('ffB', true, true, 0x99);
    expect(data).toEqual([0b00000011, 0x99]);

    const [values, bytes] = unpack('ffB', data);
    expect(values).toEqual([true, true, 0x99]);
    expect(bytes).toBe(2);
  });

  test('unpacker supports non-zero offset and finish byte count', () => {
    const data = [0x00, ...pack('BH', 0x7F, 0x1234), 0xFF];
    const unpacker = buildUnpacker(data, 1);
    expect(unpacker('B')).toBe(0x7F);
    expect(unpacker('H')).toBe(0x1234);
    expect(unpacker.finish()).toBe(3);
  });

  test('unpacks I format and finish rounds up partial bitfield byte', () => {
    const [values, bytes] = unpack('I', [0x12, 0x34, 0x56, 0x78]);
    expect(values).toEqual([0x12345678]);
    expect(bytes).toBe(4);

    const unpacker = buildUnpacker([0b00000001]);
    expect(unpacker('f')).toBe(true);
    expect(unpacker.finish()).toBe(1);
  });

  test('throws on unknown format characters in packer/unpacker', () => {
    const packer = buildPacker();
    expect(() => packer('X' as any, 1)).toThrow('Unknown format character X');

    const unpacker = buildUnpacker([0]);
    expect(() => unpacker('X' as any)).toThrow('Unknown format character X');
  });
});
