import { distance, heading, extend } from './helpers';

describe('helpers', () => {
  test('distance returns euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test('heading returns angle toward target', () => {
    expect(heading({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
  });

  test('extend shallow-copies own properties', () => {
    const object = { a: 1, b: 2 };
    expect(extend(object, { b: 3 })).toEqual({ a: 1, b: 3 });
  });
});
