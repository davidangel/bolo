jest.mock('villain/world/net/local', () => ({
  __esModule: true,
  default: class MockNetLocalWorld {
    tick(): void {}
  }
}));

jest.mock('../../world_map', () => ({
  __esModule: true,
  default: { load: jest.fn(() => ({ loadedMap: true })) }
}));

jest.mock('../everard', () => ({ __esModule: true, default: 'ZXZlcmFyZA==' }));
jest.mock('../../objects/all', () => ({ registerWithWorld: jest.fn() }));
jest.mock('../../objects/tank', () => ({ __esModule: true, default: class Tank {} }));
jest.mock('../base64', () => ({ decodeBase64: jest.fn(() => [1, 2, 3]) }));
jest.mock('../../helpers', () => ({ extend: jest.fn() }));
jest.mock('./mixin', () => ({ __esModule: true, default: {} }));

import BoloLocalWorld from './local';
import WorldMap from '../../world_map';
import { decodeBase64 } from '../base64';

describe('client/world/local', () => {
  test('loads a local map and starts the local game loop', () => {
    const world = new BoloLocalWorld() as any;
    const vignette = { destroy: jest.fn() };
    world.commonInitialization = jest.fn();
    world.spawnMapObjects = jest.fn();
    world.spawn = jest.fn(() => ({ id: 'player' }));
    world.renderer = { initHud: jest.fn(), playSound: jest.fn() };
    world.loop = { start: jest.fn() };

    world.loaded(vignette);

    expect(decodeBase64).toHaveBeenCalled();
    expect(WorldMap.load).toHaveBeenCalledWith([1, 2, 3]);
    expect(world.commonInitialization).toHaveBeenCalledTimes(1);
    expect(world.spawnMapObjects).toHaveBeenCalledTimes(1);
    expect(world.spawn).toHaveBeenCalled();
    expect(world.renderer.initHud).toHaveBeenCalledTimes(1);
    expect(vignette.destroy).toHaveBeenCalledTimes(1);
    expect(world.loop.start).toHaveBeenCalledTimes(1);
  });

  test('adjusts range, plays sounds, and handles input state', () => {
    const world = new BoloLocalWorld() as any;
    world.player = {
      shooting: false,
      turningCounterClockwise: false,
      accelerating: false,
      turningClockwise: false,
      braking: false,
      increaseRange: jest.fn(),
      decreaseRange: jest.fn(),
      builder: { $: { performOrder: jest.fn() } }
    };
    world.renderer = { playSound: jest.fn() };

    world.increasingRange = true;
    for (let i = 0; i < 6; i++) {
      world.tick();
    }
    expect(world.player.increaseRange).toHaveBeenCalledTimes(1);

    world.increasingRange = false;
    world.decreasingRange = true;
    for (let i = 0; i < 6; i++) {
      world.tick();
    }
    expect(world.player.decreaseRange).toHaveBeenCalledTimes(1);

    world.increasingRange = false;
    world.decreasingRange = false;
    world.rangeAdjustTimer = 3;
    world.tick();
    expect(world.rangeAdjustTimer).toBe(0);

    world.soundEffect(1, 2, 3, 4);
    expect(world.renderer.playSound).toHaveBeenCalledWith(1, 2, 3, 4);

    const down = { which: 32, preventDefault: jest.fn() } as any;
    world.handleKeydown(down);
    world.handleKeydown({ which: 37, preventDefault: jest.fn() } as any);
    world.handleKeydown({ which: 38, preventDefault: jest.fn() } as any);
    world.handleKeydown({ which: 39, preventDefault: jest.fn() } as any);
    world.handleKeydown({ which: 40, preventDefault: jest.fn() } as any);
    world.handleKeyup({ which: 32 } as any);
    world.handleKeyup({ which: 37 } as any);
    world.handleKeyup({ which: 38 } as any);
    world.handleKeyup({ which: 39 } as any);
    world.handleKeyup({ which: 40 } as any);

    expect(down.preventDefault).toHaveBeenCalledTimes(1);
    expect(world.player.shooting).toBe(false);
    expect(world.player.turningCounterClockwise).toBe(false);
    expect(world.player.accelerating).toBe(false);
    expect(world.player.turningClockwise).toBe(false);
    expect(world.player.braking).toBe(false);

    const cell = { x: 1, y: 2 };
    world.buildOrder('mine', 2, cell);
    expect(world.player.builder.$.performOrder).toHaveBeenCalledWith('mine', 2, cell);
    expect(world.mapChanged({}, 'a', false, 0)).toBeUndefined();
  });
});