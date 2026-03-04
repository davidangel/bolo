import TEAM_COLORS from './team_colors';

describe('team_colors', () => {
  test('exports six expected team color entries in order', () => {
    expect(TEAM_COLORS).toHaveLength(6);
    expect(TEAM_COLORS.map(c => c.name)).toEqual([
      'red',
      'blue',
      'green',
      'cyan',
      'yellow',
      'magenta'
    ]);
  });

  test('each color channel is within byte range', () => {
    for (const color of TEAM_COLORS) {
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(255);
      expect(color.g).toBeGreaterThanOrEqual(0);
      expect(color.g).toBeLessThanOrEqual(255);
      expect(color.b).toBeGreaterThanOrEqual(0);
      expect(color.b).toBeLessThanOrEqual(255);
    }
  });
});
