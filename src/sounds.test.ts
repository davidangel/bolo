import * as sounds from './sounds';

describe('sounds constants', () => {
  test('exports stable network IDs from 0 to 11', () => {
    expect(sounds.BIG_EXPLOSION).toBe(0);
    expect(sounds.BUBBLES).toBe(1);
    expect(sounds.FARMING_TREE).toBe(2);
    expect(sounds.HIT_TANK).toBe(3);
    expect(sounds.MAN_BUILDING).toBe(4);
    expect(sounds.MAN_DYING).toBe(5);
    expect(sounds.MAN_LAY_MINE).toBe(6);
    expect(sounds.MINE_EXPLOSION).toBe(7);
    expect(sounds.SHOOTING).toBe(8);
    expect(sounds.SHOT_BUILDING).toBe(9);
    expect(sounds.SHOT_TREE).toBe(10);
    expect(sounds.TANK_SINKING).toBe(11);
  });

  test('all IDs are unique', () => {
    const values = [
      sounds.BIG_EXPLOSION,
      sounds.BUBBLES,
      sounds.FARMING_TREE,
      sounds.HIT_TANK,
      sounds.MAN_BUILDING,
      sounds.MAN_DYING,
      sounds.MAN_LAY_MINE,
      sounds.MINE_EXPLOSION,
      sounds.SHOOTING,
      sounds.SHOT_BUILDING,
      sounds.SHOT_TREE,
      sounds.TANK_SINKING,
    ];

    expect(new Set(values).size).toBe(values.length);
  });
});
