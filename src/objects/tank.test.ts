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
        pills: [],
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

  test('awards kill when shell impact sinks tank in deep water', () => {
    const world = createWorld(false);
    const attacker = new Tank(world as any);
    const victim = new Tank(world as any);

    victim.armour = 40;
    victim.onBoat = true;
    victim.cell = {
      isType: (tile: string) => tile === '^',
    } as any;

    victim.takeShellHit({ direction: 0, attribution: { $: attacker } } as any);

    expect(attacker.kills).toBe(1);
    expect(victim.deaths).toBe(1);
    expect(victim.armour).toBe(255);
  });

  test('awards kill when tank sinks within 200ms after shell hit', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);

    const world = createWorld(false);
    const attacker = new Tank(world as any);
    const victim = new Tank(world as any);

    victim.armour = 40;
    victim.onBoat = false;
    victim.cell = { isType: () => false } as any;

    victim.takeShellHit({ direction: 0, attribution: { $: attacker } } as any);
    expect(attacker.kills).toBe(0);

    nowSpy.mockReturnValue(1100);
    victim.sink();

    expect(attacker.kills).toBe(1);
    expect(victim.deaths).toBe(1);
    expect(victim.armour).toBe(255);

    nowSpy.mockRestore();
  });
});
