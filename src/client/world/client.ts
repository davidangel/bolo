import ClientWorld from 'villain/world/net/client';
import WorldMap from '../../world_map';
import { registerWithWorld } from '../../objects/all';
import WorldPillbox from '../../objects/world_pillbox';
import WorldBase from '../../objects/world_base';
import { unpack } from '../../struct';
import { decodeBase64 } from '../base64';
import * as net from '../../net';
import * as helpers from '../../helpers';
import $ from '../../dom';
import { SELECTABLE_TEAM_COLORS } from '../../team_colors';
import { SettingsManager, DEFAULT_KEY_MAPPINGS, KEY_DISPLAY_NAMES, getKeyCode } from '../settings';
import BoloClientWorldMixin from './mixin';

interface ModalElementWrapper {
  _el: Element | null;
  focus(): ModalElementWrapper;
  keydown(fn: (e: KeyboardEvent) => void): ModalElementWrapper;
  click(fn: (e: MouseEvent) => void): ModalElementWrapper;
  addEventListener(evt: string, fn: EventListener): ModalElementWrapper;
  value: string;
  innerHTML: string;
  textContent: string | null;
  checked: boolean;
  parentElement: ModalElementWrapper;
  querySelector(s: string): ModalElementWrapper;
  classList: DOMTokenList;
  readonly 0: Element | null;
}

interface ModalAPI {
  find(selector: string): ModalElementWrapper;
  findAll(selector: string): ModalElementWrapper[];
  close(): void;
}

interface ModalOptions {
  title?: string;
  persistent?: boolean;
  onClose?: () => void;
  dialogClass?: string;
}

function createModal(content: string, options: ModalOptions = {}): ModalAPI {
  const overlay = $.create('div', { class: 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center' });
  const dialog = document.createElement('div');
  dialog.className = 'bg-gray-800 rounded-lg shadow-2xl p-6 min-w-[320px] border border-gray-700';
  if (options.dialogClass) {
    dialog.className += ` ${options.dialogClass}`;
  }
  dialog.innerHTML = content;

  if (options.title) {
    const title = document.createElement('h2');
    title.className = 'text-xl font-bold text-gray-100 mb-4';
    title.textContent = options.title;
    dialog.prepend(title);
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const wrap = (el: Element | null): ModalElementWrapper => {
    if (!el) {
      return {
        _el: null,
        focus() { return this; },
        keydown() { return this; },
        click() { return this; },
        addEventListener() { return this; },
        get value() { return ''; },
        set value(_v: string) {},
        get innerHTML() { return ''; },
        set innerHTML(_v: string) {},
        get textContent() { return null; },
        set textContent(_v: string | null) {},
        get checked() { return false; },
        set checked(_v: boolean) {},
        get parentElement() { return wrap(null); },
        querySelector(_s: string) { return wrap(null); },
        get classList() { return document.createElement('div').classList; },
        get 0() { return null; }
      };
    }
    const w: ModalElementWrapper = {
      _el: el,
      focus() { (el as HTMLElement).focus(); return this; },
      keydown(fn) { el.addEventListener('keydown', fn as EventListener); return this; },
      click(fn) { el.addEventListener('click', fn as EventListener); return this; },
      addEventListener(evt, fn) { el.addEventListener(evt, fn); return this; },
      get value() { return (el as HTMLInputElement).value; },
      set value(v: string) { (el as HTMLInputElement).value = v; },
      get innerHTML() { return (el as HTMLElement).innerHTML; },
      set innerHTML(v: string) { (el as HTMLElement).innerHTML = v; },
      get textContent() { return el.textContent; },
      set textContent(v: string | null) { el.textContent = v; },
      get checked() { return (el as HTMLInputElement).checked; },
      set checked(v: boolean) { (el as HTMLInputElement).checked = v; },
      get parentElement() { return wrap(el.parentElement); },
      querySelector(s: string) { return wrap(el.querySelector(s)); },
      get classList() { return (el as HTMLElement).classList; },
      get 0() { return el; }
    };
    return w;
  };

  const api: ModalAPI = {
    find: (selector) => wrap(dialog.querySelector(selector)),
    findAll: (selector) => {
      const els = dialog.querySelectorAll(selector);
      return Array.from(els).map(el => wrap(el));
    },
    close: () => {
      overlay.remove();
      if (options.onClose) options.onClose();
    }
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !options.persistent) {
      api.close();
    }
  });

  return api;
}

// FIXME: Better error handling all around.


const JOIN_DIALOG_TEMPLATE = `
<div>
  <p class="text-gray-300 mb-3">What is your name?</p>
  <input type="text" id="join-nick-field" name="join-nick-field" maxlength=20 autoComplete="off"
         class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white mb-4 focus:outline-none focus:border-blue-500"></input>
  <p class="text-gray-300 mb-2">Choose a side:</p>
  <div id="join-team" class="grid grid-cols-2 gap-2 mb-2">
  </div>
  <button id="join-submit" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">Join Game</button>
</div>`;

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function teamNameForIndex(teamIndex: number): string | null {
  if (teamIndex < 0 || teamIndex >= SELECTABLE_TEAM_COLORS.length) {
    return null;
  }
  return SELECTABLE_TEAM_COLORS[teamIndex].name;
}

function teamIndexForName(teamName: string): number {
  if (!teamName) {
    return -1;
  }
  return SELECTABLE_TEAM_COLORS.findIndex(color => color.name === teamName);
}

function winnerColorHex(winner: string): string {
  const teamIndex = teamIndexForName(winner);
  if (teamIndex < 0) {
    return '#9ca3af';
  }
  const color = SELECTABLE_TEAM_COLORS[teamIndex];
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function buildJoinTeamOptions(): string {
  return SELECTABLE_TEAM_COLORS.map((teamColor) => {
    const safeName = teamColor.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const label = toTitleCase(teamColor.name);
    const color = `rgb(${teamColor.r}, ${teamColor.g}, ${teamColor.b})`;
    return `
    <label class="flex items-center cursor-pointer p-2">
      <input type="radio" id="join-team-${safeName}" name="join-team" value="${teamColor.name}" class="sr-only">
      <span class="w-8 h-8 rounded-full border-2 border-transparent hover:border-white transition-colors team-radio" style="background: ${color}"></span>
      <span class="ml-2 text-gray-300">${label}</span>
      <span id="join-team-${safeName}-count" class="ml-1 text-gray-500 text-sm"></span>
    </label>`;
  }).join('');
}

function teamSafeName(teamName: string): string {
  return teamName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

const LAUNCH_TEMPLATE = `
<div>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4/5">
    <div>
      <p class="text-gray-300 mb-4">Create a new game:</p>
      <div id="map-selector" class="mb-6">
        <label class="block text-gray-400 text-sm mb-2">Select Map:</label>
        <div class="flex gap-3 items-start mb-4">
          <div class="flex-1">
            <select id="map-select" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 mb-3">
              <option value="">Loading maps...</option>
            </select>
            <details id="create-other-settings" class="group border border-gray-700 rounded" open>
              <summary class="px-3 py-2 cursor-pointer text-gray-300 select-none">Other game settings</summary>
              <div class="px-3 pb-3 pt-1 overflow-hidden max-h-0 opacity-0 transition-all duration-500 group-open:max-h-96 group-open:opacity-100">
                <label class="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
                  <input id="create-hide-enemy-mines" type="checkbox" checked>
                  <span>Mines are hidden from enemy tanks</span>
                </label>
                <label class="flex items-center gap-2 text-gray-300 text-sm cursor-pointer mt-2">
                  <input id="create-tournament-mode" type="checkbox">
                  <span>Tournament Mode (full ammo only on first spawn)</span>
                </label>
                <label class="flex items-center gap-2 text-gray-300 text-sm cursor-pointer mt-2">
                  <input id="create-public-game" type="checkbox">
                  <span>Public - show in active game list</span>
                </label>
              </div>
            </details>
          </div>
          <div id="map-preview" class="map-preview w-32 h-32 rounded border border-gray-600 bg-gray-900 flex items-center justify-center overflow-hidden"></div>
        </div>
        <button id="create-game-submit" class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors">Create Game</button>
      </div>

      <div class="relative my-6">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-700"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-3 bg-gray-800 text-gray-500">or</span>
        </div>
      </div>

      <p class="text-gray-300 mb-3 font-medium">Join with game code:</p>
      <input type="text" id="join-code-field" name="join-code-field" 
             class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white mb-4 focus:outline-none focus:border-blue-500" 
             placeholder="e.g. happy-pizza-tiger"></input>
      <button id="join-code-submit" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors mb-4">Join Game</button>
    </div>

    <div>
      <p class="text-gray-300 mb-4">Join public game:</p>
      <div id="public-games-list" class="border border-gray-700 rounded p-3 min-h-[180px] max-h-[360px] overflow-y-auto">
        <p class="text-gray-500 text-sm">Loading active public games...</p>
      </div>
    </div>
  </div>
</div>`;

function keyToDisplayLabel(key: string): string {
  const normalized = key.trim();
  const mapping: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Spc',
    Enter: 'Ret',
    Escape: 'Esc',
  };
  if (mapping[normalized]) {
    return mapping[normalized];
  }
  if (normalized.length === 1) {
    return /[a-z]/i.test(normalized) ? normalized.toUpperCase() : normalized;
  }
  if (normalized.startsWith('Key') && normalized.length === 4) {
    return normalized.substring(3).toUpperCase();
  }
  if (normalized.startsWith('Digit') && normalized.length === 6) {
    return normalized.substring(5);
  }
  return normalized;
}

function keyDisplayToCanonicalKey(key: string): string {
  const normalized = key.trim();
  const mapping: Record<string, string> = {
    '↑': 'ArrowUp',
    '↓': 'ArrowDown',
    '←': 'ArrowLeft',
    '→': 'ArrowRight',
    Spc: 'Space',
    Space: 'Space',
    Ret: 'Enter',
    Enter: 'Enter',
    Esc: 'Escape',
    Escape: 'Escape',
  };
  if (mapping[normalized]) {
    return mapping[normalized];
  }
  if (normalized.length === 1 && /[a-z]/i.test(normalized)) {
    return normalized.toUpperCase();
  }
  return normalized;
}

function canonicalKeyFromCode(code: string): string {
  if (code.startsWith('Key')) {
    return code.substring(3).toUpperCase();
  }
  if (code.startsWith('Digit')) {
    return code.substring(5);
  }
  if (code === 'Space') {
    return 'Space';
  }
  if (code === 'Semicolon') {
    return ';';
  }
  return code;
}

function eventKeyCode(e: KeyboardEvent): number {
  if (e.which && e.which > 0) {
    return e.which;
  }
  const keyCode = (e as unknown as { keyCode?: number }).keyCode;
  if (keyCode && keyCode > 0) {
    return keyCode;
  }
  if (e.code) {
    return getKeyCode(canonicalKeyFromCode(e.code));
  }
  if (e.key && e.key.length === 1) {
    return e.key.toUpperCase().charCodeAt(0);
  }
  return 0;
}
//# Networked game

// The `BoloClientWorld` class implements a networked game using a WebSocket.

class BoloClientWorld extends ClientWorld {
  authority: boolean = false;
  mapChanges: Record<number, any> = {};
  processingServerMessages: boolean = false;

  ws: WebSocket | null = null;
  vignette: any = null;
  heartbeatTimer: number = 0;
  settingsManager: SettingsManager | null = null;
  launchDialog: ModalAPI | null = null;
  joinDialog: ModalAPI | null = null;
  settingsDialog: ModalAPI | null = null;
  gameOver: boolean = false;
  _messageHandler: ((e: MessageEvent) => void) | null = null;
  chatMessages: HTMLElement | null = null;
  chatContainer: HTMLElement | null = null;
  chatInput: HTMLInputElement & { team?: boolean } | null = null;
  hideEnemyMinesFromEnemyTanks: boolean = true;
  tournamentMode: boolean = false;

  declare map: any;
  declare soundkit: any;
  declare commonInitialization: () => void;
  declare boloInit: () => void;
  declare spawnMapObjects: () => void;
  declare renderer: any;
  declare player: any;
  declare loop: any;
  declare input: any;
  declare tanks: any[];
  declare increasingRange: boolean;
  declare decreasingRange: boolean;
  declare rangeAdjustTimer: number;


  constructor() {
    super();
    this.mapChanges = {};
    this.processingServerMessages = false;
  }

  // Callback after resources have been loaded.
  loaded(vignette: any): void {
    this.vignette = vignette;
    this.vignette.message('Connecting to the multiplayer game');
    this.heartbeatTimer = 0;

    this.settingsManager = new SettingsManager();
    if (this.soundkit) {
      this.soundkit.setVolume(this.settingsManager.getVolume());
    }

    // If a silly word code is present in the querystring, connect to that match.
    const m = /^\?([a-z]+-[a-z]+-[a-z]+)$/i.exec(location.search);
    if (m) {
      const path = `/${m[1]}`;
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${wsProtocol}//${location.host}${path}`);
      this.ws.addEventListener('open', () => this.connected());
      this.ws.addEventListener('close', () => this.failure('Connection lost'));
      return;
    }

    // If an invalid querystring exists, show message.
    if (location.search) { return this.vignette.message('Invalid game code'); }

    // Otherwise present a launch dialog allowing create/join by code.
    this.vignette.message('Choose Create or Join');
    this.launchDialog = createModal(LAUNCH_TEMPLATE, { persistent: true });
    const launchOtherSettingsEl = this.launchDialog.find('#create-other-settings')._el as HTMLDetailsElement | null;
    if (launchOtherSettingsEl) {
      launchOtherSettingsEl.open = this.settingsManager ? this.settingsManager.getLaunchOtherSettingsOpen() : true;
      launchOtherSettingsEl.addEventListener('toggle', () => {
        if (!this.settingsManager) { return; }
        this.settingsManager.setLaunchOtherSettingsOpen(launchOtherSettingsEl.open);
        this.settingsManager.save();
      });
    }
    this.launchDialog.find('#join-code-field').focus();
    this.launchDialog.find('#join-code-field').keydown((e: KeyboardEvent) => { if (e.which === 13) { this.launchJoin(); } });
    this.launchDialog.find('#join-code-submit').click(() => this.launchJoin());
    this.launchDialog.find('#create-game-submit').click(() => this.launchCreate());

    // Load maps list
    this.loadMapsList();
    this.loadPublicGamesList();
  }

  async loadPublicGamesList(): Promise<void> {
    try {
      const res = await fetch('/api/public-games');
      const games: Array<{ gid: string; url: string; players: number; mapName?: string; playerNames?: string[] }> = await res.json();
      const container = this.launchDialog!.find('#public-games-list')._el as HTMLElement | null;
      if (!container) return;

      if (!games.length) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No active public games right now.</p>';
        return;
      }

      container.innerHTML = '';
      for (const game of games) {
        const row = document.createElement('div');
        row.className = 'group w-full p-2 mb-2 last:mb-0 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer';
        const mapName = (game.mapName || 'Unknown Map').trim() || 'Unknown Map';
        const titlePlayers = Array.isArray(game.playerNames) ? game.playerNames.filter((name) => !!name && name.trim().length > 0) : [];
        row.title = titlePlayers.length > 0 ? titlePlayers.join(', ') : 'No players yet';
        row.innerHTML = `<div class="flex items-center justify-between gap-3"><div class="min-w-0"><div class="text-gray-200 font-medium truncate">${mapName} (${game.players})</div><div class="text-gray-400 text-xs truncate">${game.gid}</div></div><button type="button" class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white">Join</button></div>`;
        const joinButton = row.querySelector('button');
        if (joinButton) {
          joinButton.addEventListener('click', (e) => {
            e.stopPropagation();
            location.search = `?${game.gid}`;
          });
        }
        row.addEventListener('click', () => {
          location.search = `?${game.gid}`;
        });
        container.appendChild(row);
      }
    } catch (e) {
      const container = this.launchDialog!.find('#public-games-list')._el as HTMLElement | null;
      if (container) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Unable to load public games.</p>';
      }
    }
  }

  async loadMapsList(): Promise<void> {
    try {
      const res = await fetch('/api/maps');
      const maps: Array<{ name: string; path: string }> = await res.json();
      const select = this.launchDialog!.find('#map-select')._el as HTMLSelectElement | null;
      if (!select) return;
      select.innerHTML = '';

      for (const map of maps) {
        const opt = document.createElement('option');
        opt.value = map.name;
        opt.textContent = map.name;
        select.appendChild(opt);
      }

      select.addEventListener('change', (e) => {
        this.updateMapPreview((e.target as HTMLSelectElement).value);
      });

      const defaultMap = maps.find(m => m.name === 'Everard Island') || maps[0];
      if (defaultMap) {
        select.value = defaultMap.name;
        this.updateMapPreview(defaultMap.name);
      }
    } catch (e) {
      console.error('Failed to load maps:', e);
    }
  }

  updateMapPreview(mapName: string): void {
    const preview = this.launchDialog!.find('#map-preview')._el as HTMLElement | null;
    if (!preview) return;

    const previewName = mapName.replace(/\.map$/, '') + '.jpg';

    const img = document.createElement('img');
    img.src = '/maps/' + previewName;
    img.alt = mapName;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.onerror = function() {
      preview.innerHTML = '<span class="text-gray-500 text-xs">no preview</span>';
    };

    preview.innerHTML = '';
    preview.appendChild(img);

    preview.style.cursor = 'pointer';
    preview.onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-8';
      overlay.onclick = () => overlay.remove();

      const fullImg = document.createElement('img');
      fullImg.src = '/maps/' + previewName;
      fullImg.alt = mapName;
      fullImg.className = 'max-w-full max-h-full object-contain rounded-lg shadow-2xl';
      fullImg.onerror = () => {
        overlay.innerHTML = '<span class="text-gray-500 text-xl">no preview</span>';
      };

      overlay.appendChild(fullImg);
      document.body.appendChild(overlay);
    };
  }

  launchJoin(): void {
    const code = (this.launchDialog!.find('#join-code-field').value || '').toLowerCase().trim();
    if (!/^[a-z]+-[a-z]+-[a-z]+$/.test(code)) { return this.vignette.message('Invalid code'); }
    location.search = `?${code}`;
  }

  launchCreate(): void {
    this.vignette.message('Creating game...');
    const mapSelect = this.launchDialog!.find('#map-select');
    const mapName = mapSelect ? mapSelect.value : '';
    const hideEnemyMinesEl = this.launchDialog!.find('#create-hide-enemy-mines')._el as HTMLInputElement | null;
    const tournamentModeEl = this.launchDialog!.find('#create-tournament-mode')._el as HTMLInputElement | null;
    const publicGameEl = this.launchDialog!.find('#create-public-game')._el as HTMLInputElement | null;
    const hideEnemyMinesFromEnemyTanks = hideEnemyMinesEl ? hideEnemyMinesEl.checked : true;
    const tournamentMode = tournamentModeEl ? tournamentModeEl.checked : false;
    const isPublicGame = publicGameEl ? publicGameEl.checked : false;
    const params = new URLSearchParams();
    if (mapName) {
      params.set('map', mapName);
    }
    params.set('hideEnemyMinesFromEnemyTanks', hideEnemyMinesFromEnemyTanks ? '1' : '0');
    params.set('tournamentMode', tournamentMode ? '1' : '0');
    params.set('public', isPublicGame ? '1' : '0');
    const url = `/create?${params.toString()}`;
    fetch(url).then(res => res.json()).then((data: any) => {
      if (data && data.gid) {
        if (data.url) {
          navigator.clipboard.writeText(data.url).then(() => {
            this.vignette.message('Game URL copied to clipboard!');
          }).catch(() => {});
        }
        location.search = `?${data.gid}`;
      } else {
        this.vignette.message('Create failed');
      }
    }).catch(() => this.vignette.message('Create failed'));
  }

  connected(): void {
    this.vignette.message('Waiting for the game map');
    const oneTimeHandler = (e: MessageEvent) => {
      this.ws!.removeEventListener('message', oneTimeHandler);
      this.receiveMap(e);
    };
    this.ws!.addEventListener('message', oneTimeHandler);
  }

  // Callback after the map was received.
  receiveMap(e: MessageEvent): void {
    this.map = WorldMap.load(decodeBase64(e.data));
    this.commonInitialization();
    this.vignette.message('Waiting for the game state');
    this._messageHandler = (e: MessageEvent) => this.handleMessage(e);
    this.ws!.addEventListener('message', this._messageHandler);
  }

  // Callback after the server tells us we are synchronized.
  synchronized(): void {
    this.rebuildMapObjects();
    this.vignette.destroy();
    this.vignette = null;
    this.loop.start();

    const teamCounts = new Array(SELECTABLE_TEAM_COLORS.length).fill(0);
    for (const tank of this.tanks) {
      if (tank.team >= 0 && tank.team < teamCounts.length) {
        teamCounts[tank.team]++;
      }
    }

    let disadvantagedTeamIndex = 0;
    for (let i = 1; i < teamCounts.length; i++) {
      if (teamCounts[i] < teamCounts[disadvantagedTeamIndex]) {
        disadvantagedTeamIndex = i;
      }
    }
    const disadvantagedTeamName = teamNameForIndex(disadvantagedTeamIndex) || SELECTABLE_TEAM_COLORS[0].name;

    this.joinDialog = createModal(JOIN_DIALOG_TEMPLATE, { persistent: true });

    const joinTeamContainer = this.joinDialog.find('#join-team');
    joinTeamContainer.innerHTML = buildJoinTeamOptions();

    for (let i = 0; i < SELECTABLE_TEAM_COLORS.length; i++) {
      const name = SELECTABLE_TEAM_COLORS[i].name;
      const safeName = teamSafeName(name);
      const countSpan = this.joinDialog.find(`#join-team-${safeName}-count`);
      if (countSpan) {
        countSpan.textContent = `(${teamCounts[i]})`;
      }
    }

    const nickField = this.joinDialog.find('#join-nick-field');
    nickField.value = this.settingsManager!.getNickname() || '';
    nickField.focus();
    nickField.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).which === 13) { this.join(); }
    });

    const savedTeam = this.settingsManager!.getTeam();
    const teamToSelect = teamIndexForName(savedTeam) >= 0 ? savedTeam : disadvantagedTeamName;
    const teamRadio = this.joinDialog.find(`#join-team-${teamSafeName(teamToSelect)}`);
    if (teamRadio && teamRadio._el) {
      teamRadio.checked = true;
      const label = teamRadio._el.closest('label');
      if (label) {
        const radioSpan = label.querySelector('.team-radio');
        if (radioSpan) radioSpan.classList.add('border-white');
      }
    }

    this.joinDialog.find('#join-submit').addEventListener('click', () => this.join());
  }

  join(): void {
    const nick = this.joinDialog!.find('#join-nick-field').value;
    const teamRadio = this.joinDialog!.find('#join-team input:checked');
    const teamValue = teamRadio ? teamRadio.value : '';
    const team = teamIndexForName(teamValue);
    if (!nick || team === -1) { return; }

    this.settingsManager!.setNickname(nick);
    this.settingsManager!.setTeam(teamValue);
    this.settingsManager!.save();
    this.joinDialog!.close();
    this.joinDialog = null;
    this.ws!.send(JSON.stringify({
      command: 'join',
      nick,
      team,
      autoSlowdown: this.settingsManager!.getAutoSlowdown(),
    }));
    this.input.focus();
  }

  // Callback after the welcome message was received.
  receiveWelcome(tank: any): void {
    this.player = tank;
    if (this.settingsManager) {
      this.player.autoSlowdown = this.settingsManager.getAutoSlowdown();
    }
    this.renderer.initHud();
    this.initChat();
    this.map.retile();
  }

  // Send the heartbeat (an empty message) every 10 ticks / 400ms.
  tick(): void {
    super.tick();

    if (this.gameOver) return;

    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) { this.ws!.send(net.INC_RANGE);
        } else { this.ws!.send(net.DEC_RANGE); }
        this.rangeAdjustTimer = 0;
      }
    } else {
      this.rangeAdjustTimer = 0;
    }

    if (++this.heartbeatTimer === 10) {
      this.heartbeatTimer = 0;
      this.ws!.send('');
    }
  }

  failure(message: string): void {
    if (this.ws) {
      this.ws.close();
      if (this._messageHandler) {
        this.ws.removeEventListener('message', this._messageHandler);
      }
      this.ws = null;
    }
    Object.getPrototypeOf(BoloClientWorld.prototype).failure?.call(this, message);
  }

  // On the client, this is a no-op.
  soundEffect(_sfx: number, _x: number, _y: number, _owner: any): void {}

  // Keep track of map changes that we made locally. We only remember the last state of a cell
  // that the server told us about, so we can restore it to that state before processing
  // server updates.
  mapChanged(cell: any, oldType: string, hadMine: boolean, oldLife: number): void {
    if (this.processingServerMessages) { return; }
    if (this.mapChanges[cell.idx] == null) {
      cell._net_oldType = oldType;
      cell._net_hadMine = hadMine;
      cell._net_oldLife = oldLife;
      this.mapChanges[cell.idx] = cell;
    }
  }

  //### Chat handlers

  initChat(): void {
    this.chatMessages = $.create('div', { id: 'chat-messages' }) as HTMLElement;
    this.renderer.hud.appendChild(this.chatMessages);
    this.chatContainer = $.create('div', { id: 'chat-input' }) as HTMLElement;
    this.chatContainer.style.display = 'none';
    this.renderer.hud.appendChild(this.chatContainer);
    this.chatInput = $.create('input', { type: 'text', name: 'chat', maxlength: '140' }) as HTMLInputElement & { team?: boolean };
    this.chatContainer.appendChild(this.chatInput);
    this.chatInput.addEventListener('keydown', (e: KeyboardEvent) => this.handleChatKeydown(e));
  }

  openChat(options?: { team?: boolean }): void {
    if (!options) { options = {}; }
    this.chatContainer!.style.display = 'block';
    this.chatInput!.value = '';
    this.chatInput!.focus();
    this.chatInput!.team = options.team;
  }

  commitChat(): void {
    this.ws!.send(JSON.stringify({
      command: this.chatInput!.team ? 'teamMsg' : 'msg',
      text: this.chatInput!.value
    }));
    this.closeChat();
  }

  closeChat(): void {
    this.chatContainer!.style.display = 'none';
    this.input.focus();
  }

  receiveChat(who: any, text: string, options?: { team?: boolean }): void {
    if (!options) { options = {}; }
    const element = document.createElement('p');
    element.className = options.team ? 'msg-team' : 'msg';
    element.textContent = `<${who.name}> ${text}`;
    this.chatMessages!.appendChild(element);
    window.setTimeout(() => element.remove(), 7000);
  }

  //### Input handlers.

  selectBuildTool(toolType: 'forest' | 'road' | 'building' | 'pillbox' | 'mine'): void {
    const selector = `#tool-${toolType}`;
    const toolInput = document.querySelector(selector) as HTMLInputElement | null;
    if (toolInput) {
      toolInput.click();
      return;
    }
    if (this.renderer) {
      this.renderer.currentTool = toolType;
    }
    if (this.input) {
      this.input.focus();
    }
  }

  dropMineAtCurrentTile(): void {
    if (!this.player) { return; }
    const currentCell = this.player.cell || this.map?.cellAtWorld?.(this.player.x, this.player.y);
    if (!currentCell) { return; }
    this.buildOrder('mine', 0, currentCell);
  }

  handleKeydown(e: KeyboardEvent): void {
    if (!this.ws || !this.player) { return; }
    const keyCode = eventKeyCode(e);
    const action = this.settingsManager ? this.settingsManager.getReverseKeyCode(keyCode) : null;
    switch (action || keyCode) {
      case 49: return this.selectBuildTool('forest');
      case 50: return this.selectBuildTool('road');
      case 51: return this.selectBuildTool('building');
      case 52: return this.selectBuildTool('pillbox');
      case 53: return this.selectBuildTool('mine');
      case 'up':
      case 38: return this.ws.send(net.START_ACCELERATING);
      case 'down':
      case 40: return this.ws.send(net.START_BRAKING);
      case 'left':
      case 37: return this.ws.send(net.START_TURNING_CCW);
      case 'right':
      case 39: return this.ws.send(net.START_TURNING_CW);
      case 'fire':
      case 32: return this.ws.send(net.START_SHOOTING);
      case 'build': return this.selectBuildTool('building');
      case 'dropMine':
        if (e.repeat) { return; }
        return this.dropMineAtCurrentTile();
      case 'chat': return this.openChat();
      case 'teamChat': return this.openChat({ team: true });
    }
  }

  handleKeyup(e: KeyboardEvent): void {
    if (!this.ws || !this.player) { return; }
    const keyCode = eventKeyCode(e);
    const action = this.settingsManager ? this.settingsManager.getReverseKeyCode(keyCode) : null;
    switch (action || keyCode) {
      case 'up':
      case 38: return this.ws.send(net.STOP_ACCELERATING);
      case 'down':
      case 40: return this.ws.send(net.STOP_BRAKING);
      case 'left':
      case 37: return this.ws.send(net.STOP_TURNING_CCW);
      case 'right':
      case 39: return this.ws.send(net.STOP_TURNING_CW);
      case 'fire':
      case 32: return this.ws.send(net.STOP_SHOOTING);
    }
  }

  handleChatKeydown(e: KeyboardEvent): void {
    if (!this.ws || !this.player) { return; }
    switch (e.which) {
      case 13: this.commitChat(); break;
      case 27: this.closeChat(); break;
      default: return;
    }
    e.preventDefault();
  }

  buildOrder(action: string, trees?: number, cell?: any): void {
    if (!this.ws || !this.player) { return; }
    if (!trees) { trees = 0; }
    this.ws.send([net.BUILD_ORDER, action, trees, cell.x, cell.y].join(','));
  }

  //### Network message handlers.

  handleMessage(e: MessageEvent): void {
    let error: Error | null = null;
    if (e.data.charAt(0) === '{') {
      try {
        this.handleJsonCommand(JSON.parse(e.data));
      } catch (err) {
        error = err as Error;
      }
    } else if (e.data.charAt(0) === '[') {
      try {
        for (const message of JSON.parse(e.data)) {
          this.handleJsonCommand(message);
        }
      } catch (err) {
        error = err as Error;
      }
    } else {
      this.netRestore();
      try {
        const dataRaw = decodeBase64(e.data);
        const data = Array.from(dataRaw) as number[];
        let pos = 0;
        const { length } = data;
        this.processingServerMessages = true;
        while (pos < length) {
          const command = data[pos++];
          const ate = this.handleBinaryCommand(command, data, pos);
          pos += ate;
        }
        this.processingServerMessages = false;
        if (pos !== length) {
          error = new Error(`Message length mismatch, processed ${pos} out of ${length} bytes`);
        }
      } catch (err) {
        error = err as Error;
      }
    }
    if (error) {
      this.failure('Connection lost (protocol error)');
      if (typeof console !== 'undefined' && console !== null) {
        console.log("Following exception occurred while processing message:", e.data);
      }
      throw error;
    }
  }

  handleBinaryCommand(command: number, data: number[], offset: number): number {
    const dataArr = data;
    switch (command) {
      case net.SYNC_MESSAGE:
        this.synchronized();
        return 0;

      case net.WELCOME_MESSAGE: {
        const [[tank_idx], bytes] = unpack('H', dataArr, offset);
        this.receiveWelcome(this.objects[tank_idx as number]);
        return bytes;
      }

      case net.CREATE_MESSAGE:
        return this.netSpawn(dataArr, offset);

      case net.DESTROY_MESSAGE:
        return this.netDestroy(dataArr, offset);

      case net.MAPCHANGE_MESSAGE: {
        const [[x, y, code, life, mine, mineOwner], bytes] = unpack('BBBBBB', dataArr, offset);
        const ascii = String.fromCharCode(code as number);
        const cell = this.map.cells[y as number][x as number];
        cell.mineOwner = mineOwner as number;
        cell.setType(ascii, mine ? true : false);
        cell.life = life;
        return bytes;
      }

      case net.SOUNDEFFECT_MESSAGE: {
        const [[sfx, x, y, owner], bytes] = unpack('BHHH', dataArr, offset);
        this.renderer.playSound(sfx, x, y, this.objects[owner as number]);
        return bytes;
      }

      case net.MINEOWNER_MESSAGE: {
        let startOffset = offset;
        while (offset < dataArr.length) {
          const [[x, y, mineOwner], bytes] = unpack('BBB', dataArr, offset);
          this.map.cells[y as number][x as number].mineOwner = mineOwner as number;
          this.map.cells[y as number][x as number].retile();
          offset += bytes;
        }
        return offset - startOffset;
      }

      case net.TINY_UPDATE_MESSAGE: {
        const [[idx], bytes] = unpack('H', dataArr, offset);
        return bytes + this.netUpdate(this.objects[idx as number], dataArr, offset + bytes);
      }

      case net.UPDATE_MESSAGE:
        return this.netTick(dataArr, offset);

      default:
        throw new Error(`Bad command '${command}' from server, at offset ${offset - 1}`);
    }
  }

  handleJsonCommand(data: any): void {
    switch (data.command) {
      case 'nick':
        (this.objects[data.idx] as any).name = data.nick;
        break;
      case 'msg':
        this.receiveChat(this.objects[data.idx], data.text);
        break;
      case 'teamMsg':
        this.receiveChat(this.objects[data.idx], data.text, { team: true });
        break;
      case 'settings':
        if (data.game) {
          if (typeof data.game.hideEnemyMinesFromEnemyTanks === 'boolean') {
            this.hideEnemyMinesFromEnemyTanks = data.game.hideEnemyMinesFromEnemyTanks;
            this.map?.retile?.();
          }
          if (typeof data.game.tournamentMode === 'boolean') {
            this.tournamentMode = data.game.tournamentMode;
          }
        }
        break;
      case 'gameEnd':
        if (typeof data.winner === 'string' && teamIndexForName(data.winner) !== -1 && !this.gameOver) {
          this.showGameOverDialog(data.winner);
        }
        break;
      default:
        throw new Error(`Bad JSON command '${data.command}' from server.`);
    }
  }

  //### Helpers

  // Fill `@map.pills` and `@map.bases` based on the current object list.
  rebuildMapObjects(): void {
    this.map.pills = [];
    this.map.bases = [];
    for (const obj of this.objects) {
      if (obj instanceof WorldPillbox) { this.map.pills.push(obj); }
      else if (obj instanceof WorldBase) { this.map.bases.push(obj); }
      else { continue; }
      if (obj.cell != null) { obj.cell.retile(); }
    }
  }

  // Override that reverts map changes as well.
  netRestore(): void {
    super.netRestore();
    for (const idx in this.mapChanges) {
      const cell = this.mapChanges[idx];
      cell.setType(cell._net_oldType, cell._net_hadMine);
      cell.life = cell._net_oldLife;
    }
    this.mapChanges = {};
  }

  showSettings(): void {
    if (this.settingsDialog) {
      this.settingsDialog.close();
      this.settingsDialog = null;
      return;
    }

    if (!this.settingsManager) {
      this.settingsManager = new SettingsManager();
    }

    const actions = Object.keys(DEFAULT_KEY_MAPPINGS);
    const keyBindingGroups: Array<{ title: string; actions: string[] }> = [
      { title: 'Drive tank', actions: ['up', 'down'] },
      { title: 'Rotate tank', actions: ['left', 'right'] },
      { title: 'Weapons', actions: ['fire', 'dropMine'] },
      { title: 'Build', actions: ['build'] },
      { title: 'Communication', actions: ['chat', 'teamChat'] },
    ];

    const groupedActions = new Set(keyBindingGroups.flatMap((g) => g.actions));
    const remainingActions = actions.filter((action) => !groupedActions.has(action));
    if (remainingActions.length > 0) {
      keyBindingGroups.push({ title: 'Other', actions: remainingActions });
    }

    let rowsHtml = '';
    for (const group of keyBindingGroups) {
      rowsHtml += `<div class="settings-key-group"><div class="settings-key-group-title">${group.title}</div>`;
      for (const action of group.actions) {
        const currentKey = this.settingsManager.getKeyMapping(action);
        const displayName = (KEY_DISPLAY_NAMES as Record<string, string>)[action] || action;
        rowsHtml += `
          <div class="settings-key-row">
            <span class="settings-key-label">${displayName}:</span>
            <input type="text" class="settings-override settings-key-input" data-action="${action}" data-keycanonical="${currentKey}" value="${keyToDisplayLabel(currentKey)}" maxlength="20">
          </div>
        `;
      }
      rowsHtml += '</div>';
    }

    const currentVolume = Math.round((this.settingsManager.getVolume() || 0.5) * 100);
    const currentAutoSlowdown = this.settingsManager.getAutoSlowdown();
    const currentAutoGunsight = this.settingsManager.getAutoGunsight();
    const content = `
    <div class="settings-wrapper">
      <div class="settings-content settings-two-column-layout">
        <div class="settings-left-column">
          <div class="settings-section">
            <div class="settings-section-title">SFX Volume</div>
            <div class="settings-volume">
              <input type="range" class="settings-volume-slider" min="0" max="100" value="${currentVolume}">
              <span class="settings-volume-value">${currentVolume}%</span>
            </div>
            <div class="mt-3 space-y-2">
              <label class="flex items-center gap-2 text-gray-200 text-sm cursor-pointer">
                <input type="checkbox" class="settings-auto-slowdown" ${currentAutoSlowdown ? 'checked' : ''}>
                <span>Auto Slowdown</span>
              </label>
              <label class="flex items-center gap-2 text-gray-200 text-sm cursor-pointer">
                <input type="checkbox" class="settings-auto-gunsight" ${currentAutoGunsight ? 'checked' : ''}>
                <span>Enable automatic show & hide of gunsight</span>
              </label>
            </div>
          </div>
        </div>
        <div class="settings-right-column">
          <div class="settings-section">
            <div class="settings-section-title">Key Bindings</div>
            <p class="settings-instructions">Press a key to remap. Press Backspace to reset that action.</p>
            ${rowsHtml}
          </div>
        </div>
        <div class="settings-buttons">
          <button class="settings-reset">Reset to Defaults</button>
          <div class="settings-actions">
            <button class="settings-cancel">Cancel</button>
            <button class="settings-save">Save</button>
          </div>
        </div>
      </div>
      <div class="pt-8 pb-4 mx-auto color-white text-center"><a href="https://github.com/davidangel/bolo" class="text-gray-400 hover:text-gray-300" target="_blank">★ Bolo on GitHub</a></div>
      </div>
    `;

    this.settingsDialog = createModal(content, { title: 'Settings', dialogClass: 'settings-modal-dialog' });

    const dialog = this.settingsDialog;
    const sm = this.settingsManager;

    const inputs = dialog.findAll('.settings-override');
    for (const input of inputs) {
      input.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        ke.preventDefault();
        ke.stopPropagation();

        if (ke.code === 'Backspace') {
          const action = (ke.target as HTMLInputElement).getAttribute('data-action')!;
          const canonicalDefault = (DEFAULT_KEY_MAPPINGS as Record<string, string>)[action] || '';
          (ke.target as HTMLInputElement).setAttribute('data-keycanonical', canonicalDefault);
          (ke.target as HTMLInputElement).value = keyToDisplayLabel(canonicalDefault);
          return;
        }

        const canonical = canonicalKeyFromCode(ke.code);
        (ke.target as HTMLInputElement).setAttribute('data-keycanonical', canonical);
        (ke.target as HTMLInputElement).value = keyToDisplayLabel(canonical);
      });
      input.addEventListener('keyup', (e: Event) => {
        e.preventDefault();
      });
    }

    dialog.find('.settings-cancel').addEventListener('click', () => {
      dialog.close();
      this.settingsDialog = null;
    });

    dialog.find('.settings-reset').addEventListener('click', () => {
      sm.reset();
      for (const action of actions) {
        const input = dialog.find(`input[data-action="${action}"]`);
        const canonicalDefault = (DEFAULT_KEY_MAPPINGS as Record<string, string>)[action];
        (input._el as HTMLInputElement | null)?.setAttribute('data-keycanonical', canonicalDefault);
        input.value = keyToDisplayLabel(canonicalDefault);
      }
      const volumeSlider = dialog.find('.settings-volume-slider');
      volumeSlider.value = String(Math.round((sm.getVolume() || 0.5) * 100));
      dialog.find('.settings-volume-value').textContent = volumeSlider.value + '%';
      const autoSlowdownInput = dialog.find('.settings-auto-slowdown');
      autoSlowdownInput.checked = sm.getAutoSlowdown();
      const autoGunsightInput = dialog.find('.settings-auto-gunsight');
      autoGunsightInput.checked = sm.getAutoGunsight();
    });

    const volumeSlider = dialog.find('.settings-volume-slider');
    const volumeValue = dialog.find('.settings-volume-value');
    volumeSlider.addEventListener('input', (e: Event) => {
      const value = parseInt((e.target as HTMLInputElement).value) / 100;
      sm.setVolume(value);
      volumeValue.innerHTML = Math.round(value * 100) + '%';
      if (this.soundkit) { this.soundkit.setVolume(value); }
    });

    dialog.find('.settings-save').addEventListener('click', () => {
      const newMappings: Record<string, string> = {};
      const usedKeys = new Map<string, string>();

      for (const action of actions) {
        const input = dialog.find(`input[data-action="${action}"]`);
        let key = ((input._el as HTMLInputElement | null)?.getAttribute('data-keycanonical') || input.value || '').trim();
        key = keyDisplayToCanonicalKey(key);
        if (!key) { key = (DEFAULT_KEY_MAPPINGS as Record<string, string>)[action]; }
        newMappings[action] = key;
      }

      for (const action of actions) {
        const key = newMappings[action];
        const normalizedKey = key.toLowerCase();
        if (usedKeys.has(normalizedKey)) {
          const prevAction = usedKeys.get(normalizedKey)!;
          newMappings[prevAction] = (DEFAULT_KEY_MAPPINGS as Record<string, string>)[prevAction];
          const prevInput = dialog.find(`input[data-action="${prevAction}"]`);
          const canonicalDefault = (DEFAULT_KEY_MAPPINGS as Record<string, string>)[prevAction];
          (prevInput._el as HTMLInputElement | null)?.setAttribute('data-keycanonical', canonicalDefault);
          prevInput.value = keyToDisplayLabel(canonicalDefault);
        } else {
          usedKeys.set(normalizedKey, action);
        }
      }

      for (const [action, key] of Object.entries(newMappings)) {
        sm.setKeyMapping(action, key);
      }

      const autoSlowdownInput = dialog.find('.settings-auto-slowdown');
      sm.setAutoSlowdown(autoSlowdownInput.checked);
      if (this.player) {
        this.player.autoSlowdown = autoSlowdownInput.checked;
      }
      if (this.ws) {
        this.ws.send(JSON.stringify({
          command: 'playerSettings',
          autoSlowdown: autoSlowdownInput.checked,
        }));
      }
      const autoGunsightInput = dialog.find('.settings-auto-gunsight');
      sm.setAutoGunsight(autoGunsightInput.checked);

      sm.save();
      dialog.close();
      this.settingsDialog = null;
    });
  }

  showGameOverDialog(winner: string): void {
    this.gameOver = true;

    const color = winnerColorHex(winner);
    const teamName = toTitleCase(winner);

    const overlay = $.create('div', {
      class: 'fixed inset-0 z-50 flex items-center justify-center',
      style: 'background: rgba(0,0,0,0.8);'
    });

    const dialog = document.createElement('div');
    dialog.className = 'bg-gray-800 rounded-lg shadow-2xl p-8 text-center border-4';
    dialog.style.borderColor = color;
    dialog.innerHTML = `
      <h2 class="text-4xl font-bold mb-4" style="color: ${color}">${teamName} Wins!</h2>
      <p class="text-gray-300 mb-6">All bases are under ${teamName} team control</p>
      <a href="/" class="inline-block px-6 py-3 rounded font-medium transition-colors" 
         style="background: ${color}; color: white;">Create New Game</a>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    this.startConfetti(winner);
  }

  startConfetti(team: string): void {
    const color = winnerColorHex(team);
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    interface Particle {
      x: number; y: number; size: number;
      speedY: number; speedX: number;
      rotation: number; rotationSpeed: number;
      color: string;
    }

    const particles: Particle[] = [];
    const particleCount = 150;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 8 + 4,
        speedY: Math.random() * 3 + 2,
        speedX: Math.random() * 4 - 2,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 10 - 5,
        color: Math.random() > 0.5 ? color : '#ffffff'
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();

        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotationSpeed;

        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      }

      if (this.gameOver) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }
}

helpers.extend(BoloClientWorld.prototype as any, BoloClientWorldMixin as any);
registerWithWorld(BoloClientWorld.prototype as any);


//# Exports
export default BoloClientWorld;
