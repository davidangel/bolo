const mockCreateLoop = jest.fn();
const mockExtend = jest.fn();
const mockRendererInstances: any[] = [];
const mockVignetteInstances: any[] = [];
const mockCreate = jest.fn();

jest.mock('villain/loop', () => ({
  createLoop: (...args: any[]) => mockCreateLoop(...args)
}));

jest.mock('../../helpers', () => ({
  extend: (...args: any[]) => mockExtend(...args)
}));

jest.mock('../../world_mixin', () => ({}));

jest.mock('../vignette', () => ({
  __esModule: true,
  default: jest.fn(() => {
    const instance = {
      message: jest.fn(),
      showProgress: jest.fn(),
      hideProgress: jest.fn(),
      progress: jest.fn()
    };
    mockVignetteInstances.push(instance);
    return instance;
  })
}));

jest.mock('../soundkit', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    load: jest.fn((_name: string, _src: string, cb?: () => void) => cb?.())
  }))
}));

jest.mock('../renderer/offscreen_2d', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((world: any) => {
    const renderer = {
      world,
      canvas: {
        parentNode: {
          insertBefore: jest.fn()
        }
      },
      draw: jest.fn(),
      initHud: jest.fn()
    };
    mockRendererInstances.push(renderer);
    return renderer;
  })
}));

jest.mock('../../dom', () => {
  const fn: any = jest.fn();
  fn.create = (...args: any[]) => mockCreate(...args);
  return {
    __esModule: true,
    default: fn
  };
});

import BoloClientWorldMixin from './mixin';
import SoundKit from '../soundkit';

describe('client/world/mixin', () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalImage = global.Image;
  const originalConsoleError = console.error;
  let pendingImageLoads: Array<() => void> = [];

  const makeElement = () => {
    const listeners: Record<string, Function> = {};
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      parentNode: null as any,
      children: [] as any[],
      appendChild(child: any) {
        child.parentNode = this;
        this.children.push(child);
      },
      addEventListener: jest.fn((name: string, cb: Function) => {
        listeners[name] = cb;
      }),
      querySelector: jest.fn(() => ({ addEventListener: jest.fn((name: string, cb: Function) => {
        listeners.button = cb;
      }) })),
      remove: jest.fn(),
      focus: jest.fn(),
      setAttribute: jest.fn(),
      listeners,
    };
  };

  beforeEach(() => {
    mockCreateLoop.mockReset();
    mockExtend.mockClear();
    mockRendererInstances.length = 0;
    mockVignetteInstances.length = 0;
    mockCreate.mockReset();
    console.error = jest.fn();

    global.window = {} as any;
    global.document = {
      body: { appendChild: jest.fn() },
      createElement: jest.fn(() => makeElement())
    } as any;
    pendingImageLoads = [];
    global.Image = class {
      onload: (() => void) | null = null;
      set src(_value: string) {
        if (this.onload) {
          pendingImageLoads.push(this.onload);
        }
      }
    } as any;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    global.Image = originalImage;
    console.error = originalConsoleError;
    jest.clearAllMocks();
  });

  test('starts by waiting for cache, loading resources, and then calling loaded', () => {
    const world = {
      waitForCache: jest.fn((_v: any, cb: () => void) => cb()),
      loadResources: jest.fn((_v: any, cb: () => void) => cb()),
      loaded: jest.fn()
    };

    BoloClientWorldMixin.start.call(world);

    expect(world.waitForCache).toHaveBeenCalledTimes(1);
    expect(world.loadResources).toHaveBeenCalledTimes(1);
    expect(world.loaded).toHaveBeenCalledTimes(1);
    expect(mockVignetteInstances).toHaveLength(1);
  });

  test('waitForCache immediately invokes the callback', () => {
    const callback = jest.fn();
    BoloClientWorldMixin.waitForCache.call({}, {}, callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('loads images and sounds while updating vignette progress', () => {
    const vignette = {
      message: jest.fn(),
      showProgress: jest.fn(),
      hideProgress: jest.fn(),
      progress: jest.fn()
    };
    const pendingSoundLoads: Array<() => void> = [];
    const world: any = {
      loadImages: BoloClientWorldMixin.loadImages,
      loadSounds: BoloClientWorldMixin.loadSounds
    };
    const callback = jest.fn();

    (SoundKit as unknown as jest.Mock).mockImplementationOnce(() => ({
      load: jest.fn((_name: string, _src: string, cb?: () => void) => {
        if (cb) {
          pendingSoundLoads.push(cb);
        }
      })
    }));

    BoloClientWorldMixin.loadResources.call(world, vignette, callback);
    for (const complete of pendingImageLoads) {
      complete();
    }
    for (const complete of pendingSoundLoads) {
      complete();
    }

    expect(vignette.message).toHaveBeenCalledWith('Loading resources');
    expect(vignette.showProgress).toHaveBeenCalledTimes(1);
    expect(vignette.progress).toHaveBeenCalled();
    expect(vignette.hideProgress).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(Object.keys(world.images)).toEqual(['base', 'styled', 'overlay']);
    expect(world.soundkit.load).toHaveBeenCalled();
  });

  test('enumerates image and sound resources', () => {
    const images: string[] = [];
    const sounds: string[] = [];

    BoloClientWorldMixin.loadImages(images.push.bind(images));
    BoloClientWorldMixin.loadSounds(sounds.push.bind(sounds));

    expect(images).toEqual(['base', 'styled', 'overlay']);
    expect(sounds).toContain('big_explosion_far');
    expect(sounds).toContain('tank_sinking_near');
    expect(sounds).toHaveLength(24);
  });

  test('performs common initialization and handles render failures', () => {
    const loop = { stop: jest.fn(), start: jest.fn() };
    let frameFn: (() => void) | null = null;
    mockCreateLoop.mockImplementation((config: any) => {
      frameFn = config.frame;
      return loop;
    });

    const input = makeElement();
    mockCreate.mockReturnValue(input);
    const map: any = { setView: jest.fn() };
    const world: any = {
      map,
      boloInit: jest.fn(),
      tick: jest.fn(),
      handleKeydown: jest.fn(),
      handleKeyup: jest.fn(),
      failure: jest.fn()
    };

    BoloClientWorldMixin.commonInitialization.call(world);

    expect(mockRendererInstances).toHaveLength(1);
    expect(map.setView).toHaveBeenCalledWith(world.renderer);
    expect(map.world).toBe(world);
    expect(world.boloInit).toHaveBeenCalledTimes(1);
    expect(world.renderer.canvas.parentNode.insertBefore).toHaveBeenCalledWith(input, world.renderer.canvas);
    expect(input.focus).toHaveBeenCalledTimes(1);

    input.listeners.keydown({ which: 90, preventDefault: jest.fn() });
    input.listeners.keydown({ which: 65, preventDefault: jest.fn() });
    input.listeners.keyup({ which: 88, preventDefault: jest.fn() });
    input.listeners.keyup({ which: 66, preventDefault: jest.fn() });

    expect(world.increasingRange).toBe(true);
    expect(world.decreasingRange).toBe(false);
    expect(world.handleKeydown).toHaveBeenCalled();
    expect(world.handleKeyup).toHaveBeenCalled();

    frameFn!();
    expect(world.renderer.draw).toHaveBeenCalledTimes(1);

    world.renderer.draw.mockImplementation(() => {
      throw new Error('boom');
    });
    frameFn!();
    expect(loop.stop).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Renderer failure:', expect.any(Error));
    expect(world.failure).toHaveBeenCalledWith('Rendering failed. Please reload the page.');
  });

  test('renders failure overlays and removes them when dismissed', () => {
    const overlay = makeElement();
    const dialog = makeElement();
    const button = { addEventListener: jest.fn() };
    dialog.querySelector.mockReturnValue(button);
    mockCreate.mockReturnValue(overlay);
    (global.document.createElement as jest.Mock).mockReturnValue(dialog);
    const loop = { stop: jest.fn() };

    BoloClientWorldMixin.failure.call({ loop }, 'Connection lost');

    expect(loop.stop).toHaveBeenCalledTimes(1);
    expect(global.document.body.appendChild).toHaveBeenCalledWith(overlay);
    expect(dialog.innerHTML).toContain('Back to lobby');

    const dismiss = (button.addEventListener as jest.Mock).mock.calls[0][1];
    dismiss();
    expect(overlay.remove).toHaveBeenCalledTimes(1);
  });

  test('rewrites and validates build orders', () => {
    const builder = { order: 'inTank', states: { inTank: 'inTank' } };
    const ownCell = {
      base: false,
      pill: null,
      mine: false,
      isType: jest.fn(() => false),
      hasTankOnBoat: jest.fn(() => false)
    };
    const world: any = {
      player: {
        builder: { $: builder },
        cell: ownCell,
        trees: 3,
        mines: 1,
        getCarryingPillboxes: jest.fn(() => [])
      }
    };

    const cell = (type: string, extra: Record<string, any> = {}) => ({
      type,
      base: false,
      pill: null,
      mine: false,
      x: 1,
      y: 1,
      hasTankOnBoat: jest.fn(() => false),
      isType: jest.fn((...types: string[]) => types.includes(type)),
      ...extra,
    });

    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'forest', cell('#'))).toEqual(['forest', 0, undefined]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'forest', cell('=', { base: true }))).toEqual([false]);

    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'road', cell('#'))).toEqual(['forest', 0, undefined]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'road', cell('='))).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'road', cell(' ', { hasTankOnBoat: jest.fn(() => true) }))).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'road', cell('.'))).toEqual(['road', 2, undefined]);

    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'building', cell('}'))).toEqual(['repair', 1, undefined]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'building', cell(' ', { hasTankOnBoat: jest.fn(() => false) }))).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'building', { ...cell('.'), x: 0, y: 0, isType: jest.fn(() => false) })).toEqual(['building', 2, undefined]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'building', { ...cell('.'), base: true })).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'building', world.player.cell)).toEqual([false]);

    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', cell('.', { pill: { armour: 16 } }))).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', cell('.', { pill: { armour: 12 } }))).toEqual(['repair', 1, true]);
    world.player.trees = 1;
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', cell('.', { pill: { armour: 1 } }))).toEqual(['repair', 1, true]);
    world.player.trees = 3;
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', cell('#'))).toEqual(['forest', 0, undefined]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', { ...cell('.'), base: true })).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', world.player.cell)).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', cell('.'))).toEqual([false]);
    world.player.trees = 5;
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'pillbox', cell('.'))).toEqual(['pillbox', 4, undefined]);

    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'mine', { ...cell('.'), base: true })).toEqual([false]);
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'mine', cell('.'))).toEqual(['mine']);
    world.player.mines = 0;
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'mine', cell('.'))).toEqual([false]);
    builder.order = 'walking';
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'forest', cell('#'))).toEqual([false]);
    builder.order = 'inTank';
    expect(BoloClientWorldMixin.checkBuildOrder.call(world, 'unknown', cell('.'))).toEqual([false]);
  });
});