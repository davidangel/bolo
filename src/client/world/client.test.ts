import BoloClientWorld from './client';

describe('client world settings command', () => {
  test('applies hideEnemyMinesFromEnemyTanks and retiles map', () => {
    const world = Object.create(BoloClientWorld.prototype) as any;
    world.hideEnemyMinesFromEnemyTanks = true;
    world.map = { retile: jest.fn() };

    world.handleJsonCommand({
      command: 'settings',
      game: { hideEnemyMinesFromEnemyTanks: false }
    });

    expect(world.hideEnemyMinesFromEnemyTanks).toBe(false);
    expect(world.map.retile).toHaveBeenCalledTimes(1);
  });

  test('ignores malformed settings payload', () => {
    const world = Object.create(BoloClientWorld.prototype) as any;
    world.hideEnemyMinesFromEnemyTanks = true;
    world.map = { retile: jest.fn() };

    world.handleJsonCommand({
      command: 'settings',
      game: { hideEnemyMinesFromEnemyTanks: 'nope' }
    });

    expect(world.hideEnemyMinesFromEnemyTanks).toBe(true);
    expect(world.map.retile).not.toHaveBeenCalled();
  });
});
