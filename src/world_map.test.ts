import { TILE_SIZE_PIXELS, TILE_SIZE_WORLD } from './constants';
import { TERRAIN_TYPES } from './map';
import WorldMap from './world_map';
import * as sounds from './sounds';

describe('world_map module', () => {
  test('extends terrain attributes', () => {
    expect((TERRAIN_TYPES['='] as any).tankSpeed).toBe(16);
    expect((TERRAIN_TYPES['='] as any).tankTurn).toBe(1);
    expect((TERRAIN_TYPES['#'] as any).manSpeed).toBe(8);
  });

  test('coordinates and map lookup helpers work', () => {
    const map = new WorldMap();
    const cell = map.cellAtTile(12, 34) as any;

    expect(map.cellAtPixel(12 * TILE_SIZE_PIXELS + 1, 34 * TILE_SIZE_PIXELS + 1)).toBe(cell);
    expect(map.cellAtWorld(12 * TILE_SIZE_WORLD + 1, 34 * TILE_SIZE_WORLD + 1)).toBe(cell);
    expect(cell.getPixelCoordinates()).toEqual([(12.5) * TILE_SIZE_PIXELS, (34.5) * TILE_SIZE_PIXELS]);
    expect(cell.getWorldCoordinates()).toEqual([(12.5) * TILE_SIZE_WORLD, (34.5) * TILE_SIZE_WORLD]);

    const center = map.findCenterCell();
    expect(center.x).toBe(128);
    expect(center.y).toBe(128);
  });

  test('speed/turn/man movement accounts for pill, base and boat', () => {
    const map = new WorldMap();
    const cell = map.cellAtTile(100, 100) as any;

    cell.setType('^', false, -1);

    const allyTank = { onBoat: false, isAlly: () => true } as any;
    const enemyTank = { onBoat: false, isAlly: () => false } as any;
    const man = { owner: { $: allyTank } } as any;

    expect(cell.getTankSpeed(allyTank)).toBe(3);
    expect(cell.getTankTurn(allyTank)).toBe(0.5);
    expect(cell.getManSpeed(man)).toBe(0);

    cell.pill = { armour: 1 };
    expect(cell.getTankSpeed(allyTank)).toBe(0);
    expect(cell.getTankTurn(allyTank)).toBe(0);
    expect(cell.getManSpeed(man)).toBe(0);

    cell.pill = undefined;
    cell.base = { owner: { $: enemyTank }, armour: 10 };
    expect(cell.getTankSpeed(allyTank)).toBe(0);
    expect(cell.getTankTurn(allyTank)).toBe(0);
    expect(cell.getManSpeed(man)).toBe(0);

    cell.base = undefined;
    cell.setType(' ', false, -1);
    allyTank.onBoat = true;
    expect(cell.getTankSpeed(allyTank)).toBe(16);
    expect(cell.getTankTurn(allyTank)).toBe(1);
  });

  test('setType updates life and emits mapChanged with old values', () => {
    const map = new WorldMap() as any;
    map.world = { mapChanged: jest.fn() };
    const cell = map.cellAtTile(101, 101) as any;

    cell.setType('.', false, -1);
    expect(cell.life).toBe(5);

    cell.setType('~', true, -1);
    expect(cell.life).toBe(4);
    expect(map.world.mapChanged).toHaveBeenLastCalledWith(cell, TERRAIN_TYPES['.'], false, 5);
  });

  test('takeShellHit handles terrain damage and flood fill spawn', () => {
    const map = new WorldMap() as any;
    map.world = { mapChanged: jest.fn(), spawn: jest.fn(), tanks: [] };
    const cell = map.cellAtTile(110, 110) as any;

    cell.setType('#', false, -1);
    expect(cell.takeShellHit({ direction: 0 })).toBe(sounds.SHOT_TREE);
    expect(cell.type.ascii).toBe('.');

    cell.setType('|', false, -1);
    expect(cell.takeShellHit({ direction: 0 })).toBe(sounds.SHOT_BUILDING);
    expect(cell.type.ascii).toBe('}');

    cell.setType('b', false, -1);
    cell.takeShellHit({ direction: 0 });
    expect(cell.type.ascii).toBe(' ');
    expect(map.world.spawn).toHaveBeenCalled();

    cell.setType('=', false, -1);
    const right = cell.neigh(1, 0) as any;
    right.setType(' ', false, -1);
    cell.takeShellHit({ direction: 0 });
    expect(cell.type.ascii).toBe(' ');

    cell.setType('=', false, -1);
    const left = cell.neigh(-1, 0) as any;
    left.setType('^', false, -1);
    cell.takeShellHit({ direction: 100 });
    expect(cell.type.ascii).toBe(' ');

    cell.setType('=', false, -1);
    const up = cell.neigh(0, -1) as any;
    up.setType(' ', false, -1);
    cell.takeShellHit({ direction: 40 });
    expect(cell.type.ascii).toBe(' ');

    cell.setType('=', false, -1);
    const down = cell.neigh(0, 1) as any;
    down.setType('^', false, -1);
    cell.takeShellHit({ direction: 200 });
    expect(cell.type.ascii).toBe(' ');
  });

  test('takeShellHit covers degradable terrain transitions and non-destroy mapChanged path', () => {
    const map = new WorldMap() as any;
    map.world = { mapChanged: jest.fn(), spawn: jest.fn(), tanks: [] };
    const cell = map.cellAtTile(140, 140) as any;

    cell.setType('.', false, -1);
    const beforeCalls = map.world.mapChanged.mock.calls.length;
    cell.takeShellHit({ direction: 0 });
    expect(cell.type.ascii).toBe('.');
    expect(map.world.mapChanged.mock.calls.length).toBeGreaterThan(beforeCalls);

    const transitions: Array<[string, string]> = [['.', '~'], ['}', ':'], [':', ' '], ['~', ' ']];
    for (const [from, to] of transitions) {
      cell.setType(from, false, -1);
      cell.life = 1;
      cell.takeShellHit({ direction: 0 });
      expect(cell.type.ascii).toBe(to);
    }
  });

  test('takeExplosionHit delegates to pill and transforms terrain', () => {
    const map = new WorldMap() as any;
    map.world = { spawn: jest.fn(), tanks: [] };
    const cell = map.cellAtTile(120, 120) as any;

    const pill = { takeExplosionHit: jest.fn() };
    cell.pill = pill;
    cell.takeExplosionHit();
    expect(pill.takeExplosionHit).toHaveBeenCalledTimes(1);

    cell.pill = undefined;
    cell.setType('b', false, -1);
    cell.takeExplosionHit();
    expect(cell.type.ascii).toBe(' ');

    cell.setType('=', false, -1);
    cell.takeExplosionHit();
    expect(cell.type.ascii).toBe('%');

    cell.setType('^', false, -1);
    const callsBefore = map.world.spawn.mock.calls.length;
    cell.takeExplosionHit();
    expect(map.world.spawn.mock.calls.length).toBe(callsBefore);
  });

  test('hasTankOnBoat, isObstacle, and random start selection', () => {
    const map = new WorldMap() as any;
    const cell = map.cellAtTile(130, 130) as any;
    map.world = { tanks: [{ armour: 255, cell, onBoat: true }, { armour: 5, cell, onBoat: true }] };

    expect(cell.hasTankOnBoat()).toBe(true);

    cell.setType('|', false, -1);
    expect(cell.isObstacle()).toBe(true);

    cell.pill = { armour: 5 };
    cell.setType('^', false, -1);
    expect(cell.isObstacle()).toBe(true);

    cell.pill = undefined;
    cell.setType('^', false, -1);
    expect(cell.isObstacle()).toBe(false);

    map.starts = [{ direction: 128 }];
    expect(map.getRandomStart()).toBe(map.starts[0]);

    map.world = { tanks: [{ armour: 255, cell, onBoat: false }] };
    expect(cell.hasTankOnBoat()).toBe(false);
  });
});
