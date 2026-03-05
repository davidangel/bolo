import TEAM_COLORS, { MAX_SELECTABLE_TEAMS, SELECTABLE_TEAM_COLORS } from './team_colors';

describe('team_colors', () => {
  test('exports eight expected team color entries in order', () => {
    expect(TEAM_COLORS).toHaveLength(8);
    expect(TEAM_COLORS.map(c => c.name)).toEqual([
      'red',
      'blue',
      'green',
      'cyan',
      'yellow',
      'magenta',
      'orange',
      'brown'
    ]);
  });

  test('selectable colors match configured max', () => {
    expect(SELECTABLE_TEAM_COLORS).toHaveLength(MAX_SELECTABLE_TEAMS);
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
