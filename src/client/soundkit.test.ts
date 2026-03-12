import SoundKit from './soundkit';

describe('client/soundkit', () => {
  const originalAudio = global.Audio;

  afterEach(() => {
    global.Audio = originalAudio;
    jest.restoreAllMocks();
  });

  test('handles unsupported audio environments', () => {
    // @ts-expect-error test override
    global.Audio = undefined;
    const kit = new SoundKit();
    const callback = jest.fn();

    const registered = kit.register('shoot', '/shoot.ogg');
    kit.load('shoot', '/shoot.ogg', callback);

    expect(registered()).toBeUndefined();
    expect(kit.isSupported).toBe(false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('loads and plays supported audio with caching', () => {
    const loaderListeners: Record<string, Function> = {};
    const clonePlay = jest.fn();
    const clone = { volume: 0, play: clonePlay };
    const cachedAudio = {
      src: '',
      preload: '',
      load: jest.fn(),
      cloneNode: jest.fn(() => clone)
    };
    const loaderAudio = {
      canPlayType: jest.fn(() => 'probably'),
      addEventListener: jest.fn((name: string, cb: Function) => {
        loaderListeners[name] = cb;
      }),
      load: jest.fn(),
      src: ''
    };
    const audioCtor = jest.fn()
      .mockImplementationOnce(() => ({ canPlayType: jest.fn(() => 'probably') }))
      .mockImplementationOnce(() => loaderAudio)
      .mockImplementationOnce(() => cachedAudio);
    global.Audio = audioCtor as any;

    const kit = new SoundKit();
    kit.setVolume(0.75);
    const callback = jest.fn();
    kit.load('shoot', '/shoot.ogg', callback);
    loaderListeners.canplaythrough();

    const played = kit.play('shoot');
    expect(played).toBe(clone);
    expect(clone.volume).toBe(0.75);
    expect(clonePlay).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(kit.getVolume()).toBe(0.75);

    const playedAgain = kit.play('shoot');
    expect(playedAgain).toBe(clone);
    expect(audioCtor).toHaveBeenCalledTimes(3);
  });

  test('disables support when the source format is not supported', () => {
    const listeners: Record<string, Function> = {};
    const loaderAudio = {
      canPlayType: jest.fn(() => 'probably'),
      addEventListener: jest.fn((name: string, cb: Function) => {
        listeners[name] = cb;
      }),
      load: jest.fn(),
      src: ''
    };
    global.Audio = jest.fn()
      .mockImplementationOnce(() => ({ canPlayType: jest.fn(() => 'probably') }))
      .mockImplementationOnce(() => loaderAudio) as any;

    const kit = new SoundKit();
    const callback = jest.fn();
    kit.load('bad', '/bad.ogg', callback);
    listeners.error({ code: 'SRC', MEDIA_ERR_SRC_NOT_SUPPORTED: 'SRC' });

    expect(kit.isSupported).toBe(false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('loads without a callback when supported', () => {
    const listeners: Record<string, Function> = {};
    const loaderAudio = {
      canPlayType: jest.fn(() => 'probably'),
      addEventListener: jest.fn((name: string, cb: Function) => {
        listeners[name] = cb;
      }),
      load: jest.fn(),
      src: ''
    };
    global.Audio = jest.fn()
      .mockImplementationOnce(() => ({ canPlayType: jest.fn(() => 'probably') }))
      .mockImplementationOnce(() => loaderAudio) as any;

    const kit = new SoundKit();
    expect(() => kit.load('ambient', '/ambient.ogg')).not.toThrow();
    expect(loaderAudio.load).toHaveBeenCalledTimes(1);
    expect(listeners.canplaythrough).toBeUndefined();
  });
});