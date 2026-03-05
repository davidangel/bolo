import Tank from './tank';

describe('Tank tournament mode spawn behavior', () => {
  const createWorld = (tournamentMode: boolean) => {
    const world: any = {
      authority: true,
      gameSettings: { tournamentMode },
      tanks: [],
      destroy: jest.fn(),
      spawn: jest.fn(() => ({ on: jest.fn() })),
      soundEffect: jest.fn(),
      addTank: jest.fn(),
      removeTank: jest.fn(),
      map: {
        getRandomStart: () => ({
          cell: {
            getWorldCoordinates: () => [128, 128],
          },
          direction: 0,
        }),
        cellAtWorld: () => ({
          isType: () => false,
          getTankTurn: () => 1,
          getTankSpeed: () => 1,
        }),
      },
    };
    return world;
  };

  test('gives full ammo on first spawn and no full ammo on respawn in tournament mode', () => {
    const world = createWorld(true);
    const tank = new Tank(world as any);

    tank.spawn(0);
    expect(tank.shells).toBe(40);

    tank.armour = 255;
    tank.respawnTimer = 1;
    tank.death();

    expect(tank.shells).toBe(0);
    expect(tank.mines).toBe(0);
    expect(tank.armour).toBe(40);
  });

  test('keeps full ammo on respawn when tournament mode is disabled', () => {
    const world = createWorld(false);
    const tank = new Tank(world as any);

    tank.spawn(0);
    tank.armour = 255;
    tank.respawnTimer = 1;
    tank.death();

    expect(tank.shells).toBe(40);
    expect(tank.mines).toBe(0);
    expect(tank.armour).toBe(40);
  });
});
