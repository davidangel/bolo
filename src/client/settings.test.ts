import { SettingsManager, DEFAULT_KEY_MAPPINGS, KEY_DISPLAY_NAMES, getKeyCode } from './settings';

describe('client/settings', () => {
  const originalLocalStorage = global.localStorage;
  const originalWarn = console.warn;

  const makeStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      })
    };
  };

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    console.warn = originalWarn;
    jest.restoreAllMocks();
  });

  test('loads persisted settings and migrates legacy pill view mappings', () => {
    const storage = makeStorage();
    storage.getItem.mockReturnValue(JSON.stringify({
      keyMappings: { up: 'KeyW', teamChat: 'KeyY', pillView: 'KeyT' },
      volume: 0.8,
      nickname: 'Pilot',
      team: 'blue',
      autoSlowdown: false,
      autoGunsight: true,
      launchOtherSettingsOpen: false
    }));
    global.localStorage = storage as any;

    const settings = new SettingsManager();

    expect(settings.getKeyMapping('up')).toBe('KeyW');
    expect(settings.getKeyMapping('teamChat')).toBe(DEFAULT_KEY_MAPPINGS.teamChat);
    expect(settings.getKeyMapping('pillView')).toBe(DEFAULT_KEY_MAPPINGS.pillView);
    expect(settings.getVolume()).toBe(0.8);
    expect(settings.getNickname()).toBe('Pilot');
    expect(settings.getTeam()).toBe('blue');
    expect(settings.getAutoSlowdown()).toBe(false);
    expect(settings.getAutoGunsight()).toBe(true);
    expect(settings.getLaunchOtherSettingsOpen()).toBe(false);
  });

  test('falls back to defaults and warns on invalid storage payloads', () => {
    const storage = makeStorage();
    storage.getItem.mockReturnValue('{not-json');
    global.localStorage = storage as any;
    console.warn = jest.fn();

    const settings = new SettingsManager();

    expect(settings.getKeyMapping('up')).toBe(DEFAULT_KEY_MAPPINGS.up);
    expect(settings.getTeam()).toBe('red');
    expect(console.warn).toHaveBeenCalledWith('Failed to load settings:', expect.any(Error));
  });

  test('saves, reverses, and resets mappings', () => {
    const storage = makeStorage();
    global.localStorage = storage as any;

    const settings = new SettingsManager();
    settings.setNickname('Commander');
    settings.setTeam('green');
    settings.setKeyMapping('chat', 'KeyC');
    settings.setAutoSlowdown(false);
    settings.setAutoGunsight(true);
    settings.setLaunchOtherSettingsOpen(false);
    settings.setVolume(0.25);

    expect(settings.getReverseMapping('KeyC')).toBe('chat');
    expect(settings.getReverseKeyCode(getKeyCode('KeyC'))).toBe('chat');
    expect(settings.getKeyCode('chat')).toBe(67);
    expect(settings.getKeyMapping('unknown')).toBeUndefined();
    expect(settings.getReverseMapping('KeyZ')).toBeNull();
    expect(settings.getReverseKeyCode(999)).toBeNull();
    settings.setKeyMapping('custom', '?');
    expect(settings.getKeyCode('custom')).toBe('?'.charCodeAt(0));
    expect(KEY_DISPLAY_NAMES.chat).toBe('Chat');
    expect(storage.setItem).toHaveBeenCalled();

    settings.reset();
    expect(settings.getKeyMapping('chat')).toBe(DEFAULT_KEY_MAPPINGS.chat);
    expect(settings.getAutoSlowdown()).toBe(true);
    expect(settings.getAutoGunsight()).toBe(false);
    expect(settings.getLaunchOtherSettingsOpen()).toBe(true);
  });

  test('warns when save fails', () => {
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => {
        throw new Error('disk full');
      })
    } as any;
    console.warn = jest.fn();

    const settings = new SettingsManager();
    settings.save();

    expect(console.warn).toHaveBeenCalledWith('Failed to save settings:', expect.any(Error));
  });
});