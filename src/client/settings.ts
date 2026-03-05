const DEFAULT_KEY_MAPPINGS: Record<string, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  fire: 'Space',
  dropMine: 'KeyS',
  build: 'KeyB',
  chat: 'KeyR',
  teamChat: 'KeyT',
};

const DEFAULT_AUTO_SLOWDOWN = true;
const DEFAULT_AUTO_GUNSIGHT = false;

const KEY_DISPLAY_NAMES: Record<string, string> = {
  up: 'Move Up',
  down: 'Move Down',
  left: 'Move Left',
  right: 'Move Right',
  fire: 'Fire',
  dropMine: 'Drop Mine',
  build: 'Build Wall',
  chat: 'Chat',
  teamChat: 'Team Chat',
};

const KEY_NAME_TO_CODE: Record<string, number> = {
  'ArrowUp': 38,
  'ArrowDown': 40,
  'ArrowLeft': 37,
  'ArrowRight': 39,
  'Space': 32,
  'Enter': 13,
  'Tab': 9,
  'Escape': 27,
  'KeyA': 65,
  'KeyB': 66,
  'KeyC': 67,
  'KeyD': 68,
  'KeyE': 69,
  'KeyF': 70,
  'KeyG': 71,
  'KeyH': 72,
  'KeyI': 73,
  'KeyJ': 74,
  'KeyK': 75,
  'KeyL': 76,
  'KeyM': 77,
  'KeyN': 78,
  'KeyO': 79,
  'KeyP': 80,
  'KeyQ': 81,
  'KeyR': 82,
  'KeyS': 83,
  'KeyT': 84,
  'KeyU': 85,
  'KeyV': 86,
  'KeyW': 87,
  'KeyX': 88,
  'KeyY': 89,
  'KeyZ': 90,
  'Digit0': 48,
  'Digit1': 49,
  'Digit2': 50,
  'Digit3': 51,
  'Digit4': 52,
  'Digit5': 53,
  'Digit6': 54,
  'Digit7': 55,
  'Digit8': 56,
  'Digit9': 57,
};

function getKeyCode(keyName: string): number {
  return KEY_NAME_TO_CODE[keyName] || keyName.charCodeAt(0);
}

class SettingsManager {
  keyMappings: Record<string, string>;
  volume: number;
  nickname: string;
  team: string;
  autoSlowdown: boolean;
  autoGunsight: boolean;

  constructor() {
    this.keyMappings = { ...DEFAULT_KEY_MAPPINGS };
    this.volume = 0.5;
    this.nickname = '';
    this.team = 'red';
    this.autoSlowdown = DEFAULT_AUTO_SLOWDOWN;
    this.autoGunsight = DEFAULT_AUTO_GUNSIGHT;
    this.load();
  }

  load(): void {
    try {
      const saved = localStorage.getItem('bolo-settings');
      if (saved) {
        const data = JSON.parse(saved);
        this.keyMappings = { ...DEFAULT_KEY_MAPPINGS, ...(data.keyMappings || {}) };
        this.volume = data.volume ?? 0.5;
        this.nickname = data.nickname || '';
        this.team = data.team || 'red';
        this.autoSlowdown = typeof data.autoSlowdown === 'boolean' ? data.autoSlowdown : DEFAULT_AUTO_SLOWDOWN;
        this.autoGunsight = typeof data.autoGunsight === 'boolean' ? data.autoGunsight : DEFAULT_AUTO_GUNSIGHT;
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  save(): void {
    try {
      localStorage.setItem('bolo-settings', JSON.stringify({
        keyMappings: this.keyMappings,
        volume: this.volume,
        nickname: this.nickname,
        team: this.team,
        autoSlowdown: this.autoSlowdown,
        autoGunsight: this.autoGunsight
      }));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  setNickname(value: string): void {
    this.nickname = value;
  }

  getNickname(): string {
    return this.nickname;
  }

  setTeam(value: string): void {
    this.team = value;
  }

  getTeam(): string {
    return this.team;
  }

  setKeyMapping(action: string, key: string): void {
    this.keyMappings[action] = key;
  }

  getKeyMapping(action: string): string {
    return this.keyMappings[action] || DEFAULT_KEY_MAPPINGS[action];
  }

  getKeyCode(action: string): number {
    return getKeyCode(this.getKeyMapping(action));
  }

  getReverseMapping(key: string): string | null {
    for (const [action, mappedKey] of Object.entries(this.keyMappings)) {
      if (mappedKey === key) return action;
    }
    return null;
  }

  getReverseKeyCode(keyCode: number): string | null {
    for (const [action, mappedKey] of Object.entries(this.keyMappings)) {
      if (getKeyCode(mappedKey) === keyCode) return action;
    }
    return null;
  }

  setVolume(value: number): void {
    this.volume = value;
    this.save();
  }

  getVolume(): number {
    return this.volume;
  }

  setAutoSlowdown(value: boolean): void {
    this.autoSlowdown = value;
  }

  getAutoSlowdown(): boolean {
    return this.autoSlowdown;
  }

  setAutoGunsight(value: boolean): void {
    this.autoGunsight = value;
  }

  getAutoGunsight(): boolean {
    return this.autoGunsight;
  }

  reset(): void {
    this.keyMappings = { ...DEFAULT_KEY_MAPPINGS };
    this.autoSlowdown = DEFAULT_AUTO_SLOWDOWN;
    this.autoGunsight = DEFAULT_AUTO_GUNSIGHT;
    this.save();
  }
}

export { SettingsManager, DEFAULT_KEY_MAPPINGS, KEY_DISPLAY_NAMES, getKeyCode };
