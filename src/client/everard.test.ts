import EverardIsland from './everard';

describe('client/everard', () => {
  test('exports a newline-free base64 map blob', () => {
    expect(typeof EverardIsland).toBe('string');
    expect(EverardIsland.length).toBeGreaterThan(100);
    expect(EverardIsland.includes('\n')).toBe(false);
    expect(EverardIsland.startsWith('Qk1B')).toBe(true);
  });
});