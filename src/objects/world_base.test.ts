import WorldBase from './world_base';

describe('WorldBase ownership regeneration', () => {
  const createWorld = () => ({
    authority: true,
    tanks: [],
    map: { pills: [] },
    destroy: jest.fn(),
    spawn: jest.fn(),
  });

  const createOwnerRef = (team: number, tank_idx: number = team + 1): any => ({
    $: {
      team,
      tank_idx,
      cell: null,
      armour: 40,
      shells: 40,
      mines: 40,
      isAlly: () => true,
    },
    on: jest.fn(),
  });

  test('regenerates armour, shells, and mines after 30 seconds of continuous ownership', () => {
    const world = createWorld();
    const base = new WorldBase(world as any);

    base.owner = createOwnerRef(0);
    base.updateOwner();
    base.armour = 1;
    base.shells = 2;
    base.mines = 3;

    for (let i = 0; i < 1500; i++) base.update();
    expect(base.armour).toBe(1);
    expect(base.shells).toBe(2);
    expect(base.mines).toBe(3);

    for (let i = 0; i < 50; i++) base.update();
    expect(base.armour).toBe(2);
    expect(base.shells).toBe(3);
    expect(base.mines).toBe(4);
  });

  test('resets ownership timer when team ownership changes', () => {
    const world = createWorld();
    const base = new WorldBase(world as any);

    base.owner = createOwnerRef(0);
    base.updateOwner();

    for (let i = 0; i < 1549; i++) base.update();
    expect(base.armour).toBe(1);
    expect(base.shells).toBe(1);
    expect(base.mines).toBe(1);

    base.owner = createOwnerRef(1);
    base.updateOwner();

    for (let i = 0; i < 1499; i++) base.update();
    expect(base.armour).toBe(1);
    expect(base.shells).toBe(1);
    expect(base.mines).toBe(1);

    for (let i = 0; i < 50; i++) base.update();
    expect(base.armour).toBe(2);
    expect(base.shells).toBe(2);
    expect(base.mines).toBe(2);
  });
});
