import { decodeBase64 } from './base64';

describe('client/base64', () => {
  test('decodes base64 payloads with and without padding', () => {
    expect(decodeBase64('TWFu')).toEqual([77, 97, 110]);
    expect(decodeBase64('TWE=')).toEqual([77, 97]);
    expect(decodeBase64('TQ==')).toEqual([77]);
    expect(decodeBase64('/w==')).toEqual([255]);
    expect(decodeBase64('+g==')).toEqual([250]);
  });

  test('throws on invalid base64 length', () => {
    expect(() => decodeBase64('abc')).toThrow(/Invalid base64 input length/);
  });

  test('throws on invalid base64 characters', () => {
    expect(() => decodeBase64('AAA!')).toThrow(/Invalid base64 input character/);
  });
});