import BoloWorldMixin from './world_mixin';

type FakeMapObject = {
  owner_idx: number;
  world: unknown;
  spawn: jest.Mock;
  anySpawn: jest.Mock;
  ref: jest.Mock;
  cell: { retile: jest.Mock } | null;
};

const makeMapObj = (owner_idx: number, withCell = true): FakeMapObject => ({
  owner_idx,
  world: null,
  spawn: jest.fn(),
  anySpawn: jest.fn(),
  ref: jest.fn(),
  cell: withCell ? { retile: jest.fn() } : null,
});

const makeWorld = () => ({
  tanks: [] as any[],
  authority: false,
  map: { pills: [] as any[], bases: [] as any[] },
  resolveMapObjectOwners: jest.fn(),
  insert: jest.fn((obj: unknown) => obj),
  getAllMapObjects: BoloWorldMixin.getAllMapObjects,
});

describe('BoloWorldMixin', () => {
  test('boloInit resets tanks', () => {
    const world = makeWorld();
    world.tanks = [{ tank_idx: 99 } as any];

    BoloWorldMixin.boloInit.call(world as any);

    expect(world.tanks).toEqual([]);
  });

  test('addTank indexes and appends tank, optionally resolves owners', () => {
    const world = makeWorld();
    const tankA: any = {};
    const tankB: any = {};

    BoloWorldMixin.addTank.call(world as any, tankA);
    expect(tankA.tank_idx).toBe(0);
    expect(world.tanks).toEqual([tankA]);
    expect(world.resolveMapObjectOwners).not.toHaveBeenCalled();

    world.authority = true;
    BoloWorldMixin.addTank.call(world as any, tankB);
    expect(tankB.tank_idx).toBe(1);
    expect(world.resolveMapObjectOwners).toHaveBeenCalledTimes(1);
  });

  test('removeTank compacts indexes, optionally resolves owners', () => {
    const world = makeWorld();
    const tank0: any = { tank_idx: 0 };
    const tank1: any = { tank_idx: 1 };
    const tank2: any = { tank_idx: 2 };
    world.tanks = [tank0, tank1, tank2];

    BoloWorldMixin.removeTank.call(world as any, tank1);
    expect(world.tanks).toEqual([tank0, tank2]);
    expect(tank2.tank_idx).toBe(1);
    expect(world.resolveMapObjectOwners).not.toHaveBeenCalled();

    world.authority = true;
    BoloWorldMixin.removeTank.call(world as any, tank0);
    expect(world.resolveMapObjectOwners).toHaveBeenCalledTimes(1);
  });

  test('getAllMapObjects returns pills followed by bases', () => {
    const world = makeWorld();
    const pill = makeMapObj(0);
    const base = makeMapObj(0);
    world.map.pills = [pill];
    world.map.bases = [base];

    const all = BoloWorldMixin.getAllMapObjects.call(world as any);
    expect(all).toEqual([pill, base]);
  });

  test('spawnMapObjects sets world, inserts and spawns each object', () => {
    const world = makeWorld();
    const objA = makeMapObj(0);
    const objB = makeMapObj(1);
    world.map.pills = [objA];
    world.map.bases = [objB];

    BoloWorldMixin.spawnMapObjects.call(world as any);

    for (const obj of [objA, objB]) {
      expect(obj.world).toBe(world);
      expect(obj.spawn).toHaveBeenCalledTimes(1);
      expect(obj.anySpawn).toHaveBeenCalledTimes(1);
    }
    expect(world.insert).toHaveBeenCalledTimes(2);
  });

  test('resolveMapObjectOwners wires owner refs and retiles when cell exists', () => {
    const world = makeWorld();
    const tank0: any = { tank_idx: 0 };
    const tank1: any = { tank_idx: 1 };
    world.tanks = [tank0, tank1];

    const objWithCell = makeMapObj(1, true);
    const objNoCell = makeMapObj(0, false);
    world.map.pills = [objWithCell];
    world.map.bases = [objNoCell];

    BoloWorldMixin.resolveMapObjectOwners.call(world as any);

    expect(objWithCell.ref).toHaveBeenCalledWith('owner', tank1);
    expect(objNoCell.ref).toHaveBeenCalledWith('owner', tank0);
    expect(objWithCell.cell?.retile).toHaveBeenCalledTimes(1);
  });
});
