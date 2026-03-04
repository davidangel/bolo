import {
  PIXEL_SIZE_WORLD,
  TILE_SIZE_PIXELS,
  TILE_SIZE_WORLD,
  MAP_SIZE_TILES,
  MAP_SIZE_PIXELS,
  MAP_SIZE_WORLD,
  TICK_LENGTH_MS,
} from './constants';

describe('constants', () => {
  test('exposes expected base values', () => {
    expect(PIXEL_SIZE_WORLD).toBe(8);
    expect(TILE_SIZE_PIXELS).toBe(32);
    expect(MAP_SIZE_TILES).toBe(256);
    expect(TICK_LENGTH_MS).toBe(20);
  });

  test('derives world and map sizes consistently', () => {
    expect(TILE_SIZE_WORLD).toBe(TILE_SIZE_PIXELS * PIXEL_SIZE_WORLD);
    expect(MAP_SIZE_PIXELS).toBe(MAP_SIZE_TILES * TILE_SIZE_PIXELS);
    expect(MAP_SIZE_WORLD).toBe(MAP_SIZE_TILES * TILE_SIZE_WORLD);
  });
});
