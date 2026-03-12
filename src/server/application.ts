// This module contains all the juicy code related to the server. It exposes a factory function
// that returns a Connect-based HTTP server. A single server is capable of hosting multiple games,
// sharing the interval timer and the lobby across these games.

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

import connect from 'connect';
import { createLoop } from 'villain/loop';
import ServerWorld from 'villain/world/net/server';
import { pack } from 'villain/struct';
import WebSocket from 'faye-websocket';
import MapIndex from './map_index';
import gameLogger from './game_logger';
import * as helpers from '../helpers';
import BoloWorldMixin from '../world_mixin';
import { registerWithWorld } from '../objects/all';
import Tank from '../objects/tank';
import WorldMap from '../world_map';
import { SELECTABLE_TEAM_COLORS } from '../team_colors';
import * as net from '../net';
import { TICK_LENGTH_MS } from '../constants';

interface GameSettings {
  hideEnemyMinesFromEnemyTanks: boolean;
  tournamentMode: boolean;
  public: boolean;
}

const defaultGameSettings = (): GameSettings => ({
  hideEnemyMinesFromEnemyTanks: true,
  tournamentMode: false,
  public: false,
});

const parseBooleanParam = (value: string | null, fallback: boolean): boolean => {
  if (value == null) {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return fallback;
};

const CLIENT_PING_INTERVAL_MS = 5000;
const CLIENT_PONG_TIMEOUT_MS = 15000;


//# Server world

class BoloServerWorld extends ServerWorld {
  authority: boolean = true;
  clients: WebSocket[] = [];
  oddTick: boolean = false;
  teamScoresTick: number = 0;
  gameOverTimer: number | null = null;
  gameEndLogged: boolean = false;
  winningTeam: string | null = null;
  gameSettings: GameSettings;
  gid: string = '';
  url: string = '';
  mapName: string = 'Unknown Map';
  lastActivity: number = 0;

  declare map: any;
  declare boloInit: () => void;
  declare spawnMapObjects: () => void;
  declare tanks: any[];

  constructor(map: any, gameSettings?: Partial<GameSettings>) {
    super();
    this.map = map;
    this.gameSettings = { ...defaultGameSettings(), ...(gameSettings || {}) };
    this.boloInit();
    this.clients = [];
    this.map.world = this;
    this.oddTick = false;
    this.spawnMapObjects();
  }

  close(): void {
    for (const client of this.clients) {
      client.close();
    }
  }

  //### Callbacks

  // Update, and then send packets to the client.
  tick(): void {
    super.tick();
    this.checkGameEnd();
    this.sendPackets();
  }

  checkGameEnd(): void {
    if (this.gameEndLogged || !this.map?.bases || this.map.bases.length === 0) {
      return;
    }

    const controllingTeams = new Set<number>();
    let hasNeutralOrInvalidBase = false;

    for (const base of this.map.bases as any[]) {
      if (typeof base.team === 'number' && base.team >= 0 && base.team < SELECTABLE_TEAM_COLORS.length) {
        controllingTeams.add(base.team);
      } else {
        hasNeutralOrInvalidBase = true;
      }
    }

    const winner = !hasNeutralOrInvalidBase && controllingTeams.size === 1
      ? SELECTABLE_TEAM_COLORS[Array.from(controllingTeams)[0]]?.name || null
      : null;

    if (!winner) {
      this.gameOverTimer = null;
      return;
    }

    if (this.gameOverTimer == null) {
      this.gameOverTimer = 50;
    }

    if (--this.gameOverTimer === 0) {
      this.gameEndLogged = true;
      this.winningTeam = winner;
      gameLogger.gameEnd(this.gid, winner);
      this.broadcast(JSON.stringify({ command: 'gameEnd', winner }));
    }
  }

  // Emit a sound effect from the given location. `owner` is optional.
  soundEffect(sfx: number, x: number, y: number, owner: any): void {
    const ownerIdx = owner != null ? owner.idx : 65535;
    (this.changes as any[]).push(['soundEffect', sfx, x, y, ownerIdx]);
  }

  // Record map changes.
  mapChanged(cell: any, _oldType: string, _hadMine: boolean, _oldLife: number): void {
    const { ascii } = cell.type;
    (this.changes as any[]).push(['mapChange', cell.x, cell.y, ascii, cell.life, cell.mine, cell.mineOwner]);
  }

  //### Connection handling.

  onConnect(ws: WebSocket): void {
    this.clients.push(ws);
    this.lastActivity = Date.now();
    (ws as any).lastPingAt = Date.now();
    (ws as any).lastPongAt = Date.now();
    (ws as any).awaitingPong = false;
    (ws as any).on('message', (e: any) => this.onMessage(ws, e.data));
    (ws as any).on('close', (e: any) => this.onEnd(ws, e.code, e.reason));

    // Send the current map state.
    const packet = Buffer.from(this.map.dump({ noPills: true, noBases: true }));
    ws.send(packet);

    // Send mineOwner info for all cells with non-neutral mines.
    const mineOwnerChanges: Array<[number, number, number]> = [];
    this.map.each((cell: any) => {
      if (cell.mine && cell.mineOwner !== 255) {
        mineOwnerChanges.push([cell.x, cell.y, cell.mineOwner]);
      }
    });
    if (mineOwnerChanges.length > 0) {
      let pkt: number[] = [net.MINEOWNER_MESSAGE];
      for (const [x, y, mineOwner] of mineOwnerChanges) {
        pkt = pkt.concat(pack('BBB', x, y, mineOwner));
      }
      ws.send(Buffer.from(pkt));
    }

    // Synchronize the object list to the client.
    let pkt: number[] = [];
    for (const obj of this.objects) {
      pkt = pkt.concat([net.CREATE_MESSAGE, (obj as any)._net_type_idx]);
    }
    pkt = pkt.concat([net.UPDATE_MESSAGE], this.dumpTick(true));
    ws.send(Buffer.from(pkt));

    // Synchronize all player names.
    const messages = this.tanks.map((tank: any) => ({ command: 'nick', idx: tank.idx, nick: tank.name }));
    ws.send(JSON.stringify(messages));

    ws.send(JSON.stringify({ command: 'settings', game: this.gameSettings }));

    // Finish with a 'sync' message.
    ws.send(Buffer.from([net.SYNC_MESSAGE]));

    if (this.gameEndLogged && this.winningTeam) {
      ws.send(JSON.stringify({ command: 'gameEnd', winner: this.winningTeam }));
    }
  }

  onEnd(ws: WebSocket, _code: number, _reason: string): void {
    if ((ws as any).tank) { this.destroy((ws as any).tank); }
    (ws as any).tank = null;
    const idx = this.clients.indexOf(ws);
    if (idx !== -1) { this.clients.splice(idx, 1); }
    this.lastActivity = Date.now();
    ws.close();
  }

  onMessage(ws: WebSocket, message: string): void {
    this.lastActivity = Date.now();
    (ws as any).lastPongAt = Date.now();
    (ws as any).awaitingPong = false;
    if (message === '') {
      return;
    } else if (message.charAt(0) === '{') {
      this.onJsonMessage(ws, message);
    } else {
      this.onSimpleMessage(ws, message);
    }
  }

  onSimpleMessage(ws: WebSocket, message: string): void {
    const tank = (ws as any).tank;
    if (!tank) {
      return this.onError(ws, new Error("Received a game command from a spectator"));
    }
    const command = message.charAt(0);
    switch (command) {
      case net.START_TURNING_CCW:  tank.turningCounterClockwise = true; return;
      case net.STOP_TURNING_CCW:   tank.turningCounterClockwise = false; return;
      case net.START_TURNING_CW:   tank.turningClockwise = true; return;
      case net.STOP_TURNING_CW:    tank.turningClockwise = false; return;
      case net.START_ACCELERATING: tank.accelerating = true; return;
      case net.STOP_ACCELERATING:  tank.accelerating = false; return;
      case net.START_BRAKING:      tank.braking = true; return;
      case net.STOP_BRAKING:       tank.braking = false; return;
      case net.START_SHOOTING:     tank.shooting = true; return;
      case net.STOP_SHOOTING:      tank.shooting = false; return;
      case net.INC_RANGE:          tank.increaseRange(); return;
      case net.DEC_RANGE:          tank.decreaseRange(); return;
      case net.BUILD_ORDER: {
        const parts = message.slice(2).split(',');
        const [action, treesStr, xStr, yStr] = parts;
        const trees = parseInt(treesStr);
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        const builder = tank.builder.$;
        if (trees < 0 || !builder.states.actions.hasOwnProperty(action)) {
          return this.onError(ws, new Error("Received invalid build order"));
        } else {
          builder.performOrder(action, trees, this.map.cellAtTile(x, y));
        }
        return;
      }
      default: {
        const sanitized = command.replace(/\W+/, '');
        return this.onError(ws, new Error(`Received an unknown command: ${sanitized}`));
      }
    }
  }

  onJsonMessage(ws: WebSocket, message: string): void {
    let parsed: any;
    try {
      parsed = JSON.parse(message);
      if (typeof parsed.command !== 'string') {
        throw new Error("Received an invalid JSON message");
      }
    } catch (e) {
      return this.onError(ws, e as Error);
    }
    if (parsed.command === 'join') {
      if ((ws as any).tank) {
        this.onError(ws, new Error("Client tried to join twice."));
      } else {
        this.onJoinMessage(ws, parsed);
      }
      return;
    }
    const tank = (ws as any).tank;
    if (!tank) {
      return this.onError(ws, new Error("Received a JSON message from a spectator"));
    }
    switch (parsed.command) {
      case 'msg':     this.onTextMessage(ws, tank, parsed); return;
      case 'teamMsg': this.onTeamTextMessage(ws, tank, parsed); return;
      case 'playerSettings': {
        if (typeof parsed.autoSlowdown === 'boolean') {
          tank.autoSlowdown = parsed.autoSlowdown;
        }
        return;
      }
      default: {
        const sanitized = parsed.command.slice(0, 10).replace(/\W+/, '');
        return this.onError(ws, new Error(`Received an unknown JSON command: ${sanitized}`));
      }
    }
  }

  // Creates a tank for a connection and synchronizes it to everyone.
  onJoinMessage(ws: WebSocket, message: any): void {
    if (typeof message.nick !== 'string' || message.nick.length > 20) {
      this.onError(ws, new Error("Client specified invalid nickname."));
      return;
    }
    if (typeof message.team !== 'number' || message.team < 0 || message.team >= SELECTABLE_TEAM_COLORS.length) {
      this.onError(ws, new Error("Client specified invalid team."));
      return;
    }

    (ws as any).tank = this.spawn(Tank, message.team);
    if (typeof message.autoSlowdown === 'boolean') {
      (ws as any).tank.autoSlowdown = message.autoSlowdown;
    }
    const teamName = SELECTABLE_TEAM_COLORS[message.team]?.name || 'unknown';
    gameLogger.playerJoined(this.gid, message.nick, teamName);
    const packet = Buffer.from(this.changesPacket(true));
    this.broadcast(packet);

    (ws as any).tank.name = message.nick;
    this.broadcast(JSON.stringify({ command: 'nick', idx: (ws as any).tank.idx, nick: message.nick }));

    const welcome = pack('BH', net.WELCOME_MESSAGE, (ws as any).tank.idx);
    ws.send(Buffer.from(welcome));
  }

  onTextMessage(ws: WebSocket, tank: any, message: any): void {
    if (typeof message.text !== 'string' || message.text.length > 140) {
      this.onError(ws, new Error("Client sent an invalid text message."));
      return;
    }
    this.broadcast(JSON.stringify({ command: 'msg', idx: tank.idx, text: message.text }));
  }

  onTeamTextMessage(ws: WebSocket, tank: any, message: any): void {
    if (typeof message.text !== 'string' || message.text.length > 140) {
      this.onError(ws, new Error("Client sent an invalid text message."));
      return;
    }
    if (tank.team === 255) { return; }
    const out = JSON.stringify({ command: 'teamMsg', idx: tank.idx, text: message.text });
    for (const client of this.clients) {
      if ((client as any).tank && (client as any).tank.team === tank.team) {
        client.send(out);
      }
    }
  }

  onError(ws: WebSocket, err: Error): void {
    gameLogger.gameError(this.gid, err.message);
  }

  //### Helpers

  calculateTeamScores(): number[] {
    const teamScores = [0, 0, 0, 0, 0, 0];
    const baseCounts = [0, 0, 0, 0, 0, 0];
    const pillCounts = [0, 0, 0, 0, 0, 0];
    let totalBases = 0;
    let totalPills = 0;

    for (const base of this.map.bases as any[]) {
      if (base.team != null && base.team !== 255 && base.team >= 0 && base.team <= 5) {
        baseCounts[base.team]++;
        totalBases++;
      }
    }

    for (const pill of this.map.pills as any[]) {
      if (pill.team != null && pill.team !== 255 && pill.team >= 0 && pill.team <= 5) {
        pillCounts[pill.team]++;
        totalPills++;
      }
    }

    const teamKills = [0, 0, 0, 0, 0, 0];
    const teamDeaths = [0, 0, 0, 0, 0, 0];
    for (const tank of this.tanks as any[]) {
      if (tank.team >= 0 && tank.team <= 5) {
        teamKills[tank.team] += tank.kills || 0;
        teamDeaths[tank.team] += tank.deaths || 0;
      }
    }

    for (let team = 0; team < 6; team++) {
      const baseScore = totalBases > 0 ? (baseCounts[team] / totalBases) * 100 : 0;
      const pillScore = totalPills > 0 ? (pillCounts[team] / totalPills) * 100 : 0;
      const kd = teamDeaths[team] > 0 ? (teamKills[team] / teamDeaths[team]) : teamKills[team];
      const combatScore = Math.min(kd / 3.0, 1.0) * 100;
      teamScores[team] = (baseScore * 0.50) + (pillScore * 0.30) + (combatScore * 0.20);
    }

    return teamScores;
  }

  // Simple helper to send a message to everyone.
  broadcast(message: string | Buffer): void {
    for (const client of this.clients) {
      client.send(message);
    }
  }

  maintainClientConnections(): void {
    const now = Date.now();
    for (const client of [...this.clients]) {
      const socket = client as any;
      if (socket.awaitingPong && (now - socket.lastPingAt) >= CLIENT_PONG_TIMEOUT_MS) {
        this.onError(client, new Error('Client heartbeat timed out.'));
        client.close(4000, 'Heartbeat timeout');
        continue;
      }
      if (socket.awaitingPong || (now - socket.lastPingAt) < CLIENT_PING_INTERVAL_MS) {
        continue;
      }

      socket.awaitingPong = true;
      socket.lastPingAt = now;
      socket.ping('hb', () => {
        socket.awaitingPong = false;
        socket.lastPongAt = Date.now();
      });
    }
  }

  // We send critical updates every frame, and non-critical updates every other frame.
  sendPackets(): void {
    this.maintainClientConnections();

    let packet: Buffer;
    if ((this.oddTick = !this.oddTick)) {
      packet = Buffer.from(this.changesPacket(true));
    } else {
      packet = Buffer.from(this.changesPacket(false).concat(this.updatePacket()));
    }

    this.teamScoresTick++;
    let teamScoresPacket: Buffer | null = null;
    if (this.teamScoresTick >= 25) {
      this.teamScoresTick = 0;
      const scores = this.calculateTeamScores();
      const packedScores = pack(
        'HHHHHH',
        Math.round(scores[0] * 100),
        Math.round(scores[1] * 100),
        Math.round(scores[2] * 100),
        Math.round(scores[3] * 100),
        Math.round(scores[4] * 100),
        Math.round(scores[5] * 100)
      );
      const teamScoresData = [net.TEAMSCORES_MESSAGE].concat(packedScores);
      teamScoresPacket = Buffer.from(teamScoresData);
    }

    for (const client of this.clients) {
      if ((client as any).readyState != null && (client as any).readyState !== 1) {
        continue;
      }
      client.send(packet);
      if (teamScoresPacket) {
        client.send(teamScoresPacket);
      }
    }
  }

  // Get a data stream for critical updates.
  changesPacket(fullCreate: boolean): number[] {
    if (!(this.changes.length > 0)) { return []; }

    let data: number[] = [];
    const needUpdate: any[] = [];

    for (const change of (this.changes as any[])) {
      const type = change.shift() as string;

      switch (type) {
        case 'create': {
          const [obj] = change;
          if (fullCreate) { needUpdate.push(obj); }
          data = data.concat([net.CREATE_MESSAGE], pack('B', obj._net_type_idx));
          break;
        }
        case 'destroy': {
          const [obj, idx] = change;
          const i = needUpdate.indexOf(obj);
          if (i !== -1) { needUpdate.splice(i, 1); }
          data = data.concat([net.DESTROY_MESSAGE], pack('H', idx));
          break;
        }
        case 'mapChange': {
          const [x, y, ascii, life, mine, mineOwner] = change;
          const asciiCode = (ascii as string).charCodeAt(0);
          data = data.concat([net.MAPCHANGE_MESSAGE], pack('BBBBBB', x, y, asciiCode, life, mine ? 1 : 0, mineOwner));
          break;
        }
        case 'soundEffect': {
          const [sfx, x, y, ownerIdx] = change;
          data = data.concat([net.SOUNDEFFECT_MESSAGE], pack('BHHH', sfx, x, y, ownerIdx));
          break;
        }
      }
    }

    for (const obj of needUpdate) {
      data = data.concat([net.TINY_UPDATE_MESSAGE], pack('H', obj.idx), this.dump(obj));
    }

    return data;
  }

  // Get a data stream for non-critical updates.
  updatePacket(): number[] {
    return [net.UPDATE_MESSAGE].concat(this.dumpTick());
  }
}

helpers.extend(BoloServerWorld.prototype as any, BoloWorldMixin);
registerWithWorld(BoloServerWorld.prototype as any);


//# HTTP server application

interface AppOptions {
  general: {
    base: string;
    maxgames: number;
    gameTimeout?: number;
  };
  web: {
    port: number;
    log?: boolean;
    allowedOrigins?: string[];
    rateLimit?: {
      create?: {
        windowMs?: number;
        maxRequests?: number;
      };
      websocket?: {
        windowMs?: number;
        maxRequests?: number;
      };
    };
  };
  irc?: Record<string, any>;
}

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CREATE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 20,
};

const DEFAULT_WEBSOCKET_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
};

class Application {
  options: AppOptions;
  connectServer: any;
  games: Record<string, BoloServerWorld> = {};
  ircClients: any[] = [];
  maps!: MapIndex;
  demo: BoloServerWorld | null = null;
  loop: any;
  httpServer!: http.Server;
  createRateLimitState: Map<string, RateLimitWindow> = new Map();
  websocketRateLimitState: Map<string, RateLimitWindow> = new Map();

  constructor(options: AppOptions) {
    this.tick = this.tick.bind(this);
    this.options = options;
    const webroot = path.join(path.dirname(fs.realpathSync(__filename)), '../../');

    this.connectServer = connect();
    if (this.options.web?.log) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const morgan = require('morgan');
      this.connectServer.use(morgan('dev'));
    }
    this.connectServer.use('/', redirector(this.options.general.base));

    // Endpoint to get list of available maps
    this.connectServer.use('/api/maps', (req: any, res: any, next: any) => {
      if (req.method !== 'GET') { return next(); }
      const names = Object.getOwnPropertyNames(this.maps.nameIndex);
      const maps = names.map(name => {
        const descr = this.maps.nameIndex[name];
        return { name, path: descr.path };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(maps));
    });

    // Endpoint to get list of active public games.
    this.connectServer.use('/api/public-games', (req: any, res: any, next: any) => {
      if (req.method !== 'GET') { return next(); }
      const publicGames = Object.values(this.games)
        .filter((game) => game.gameSettings.public && !game.gameEndLogged)
        .map((game) => {
          const playerNames = game.tanks
            .map((tank) => (typeof tank?.name === 'string' ? tank.name.trim() : ''))
            .filter((name) => name.length > 0);
          return {
            gid: game.gid,
            url: game.url,
            mapName: game.mapName,
            players: game.tanks.length,
            playerNames,
          };
        });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(publicGames));
    });

    // Endpoint to create a new game and return its id.
    this.connectServer.use('/create', (req: any, res: any, next: any) => {
      if (req.method !== 'GET') { return next(); }
      if (this.isRateLimited(req, 'create')) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many create requests. Please try again later.' }));
        return;
      }
      if (!this.haveOpenSlots()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'All game slots are full.' }));
        return;
      }

      const urlObj = new URL(req.url, 'http://localhost');
      const mapName = urlObj.searchParams.get('map');
      const gameSettings: GameSettings = {
        hideEnemyMinesFromEnemyTanks: parseBooleanParam(
          urlObj.searchParams.get('hideEnemyMinesFromEnemyTanks'),
          true
        ),
        tournamentMode: parseBooleanParam(
          urlObj.searchParams.get('tournamentMode'),
          false
        ),
        public: parseBooleanParam(
          urlObj.searchParams.get('public'),
          false
        ),
      };

      const names = Object.getOwnPropertyNames(this.maps.nameIndex);
      let mapDescr = mapName ? this.maps.get(mapName) : undefined;

      if (!mapDescr) {
        mapDescr = this.maps.get('Oil Rigette') || this.maps.get('Everard Island');
      }
      if (!mapDescr && names.length > 0) { mapDescr = this.maps.nameIndex[names[0]]; }
      if (!mapDescr && this.demo) {
        try {
          const packet = this.demo.map.dump({ noPills: true, noBases: true });
          const mapData = Buffer.from(packet);
          const game = this.createGame(mapData, gameSettings, this.demo?.mapName || 'Everard Island');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ gid: game.gid, url: game.url }));
          return;
        } catch (e) {
          res.writeHead(500);
          res.end('error');
          return;
        }
      }
      if (!mapDescr) { res.writeHead(500); res.end('no maps'); return; }
      fs.readFile(mapDescr.path, (err, data) => {
        if (err) { res.writeHead(500); res.end('error'); return; }
        const game = this.createGame(data, gameSettings, mapDescr!.name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ gid: game.gid, url: game.url }));
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serveStatic = require('serve-static');
    this.connectServer.use('/', serveStatic(webroot));

    this.games = {};
    this.ircClients = [];

    const mapPath = path.join(path.dirname(fs.realpathSync(__filename)), '../../maps');
    this.maps = new MapIndex(mapPath, () => {
      this.resetDemo((err) => {
        if (err) { console.log(err); }
      });
    });

    this.loop = createLoop({ rate: TICK_LENGTH_MS, tick: this.tick });
  }

  // FIXME: this is for the demo
  resetDemo(cb?: (err?: string) => void): void {
    if (this.demo) { this.closeGame(this.demo); }
    const everard = this.maps.get('Everard Island');
    if (!everard) {
      cb?.("Could not find Everard Island.");
      return;
    }
    fs.readFile(everard.path, (err, data) => {
      if (err) { cb?.(`Unable to start demo game: ${err.toString()}`); return; }
      this.demo = this.createGame(data, undefined, everard.name);
      cb?.();
    });
  }

  haveOpenSlots(): boolean {
    return Object.getOwnPropertyNames(this.games).length < this.options.general.maxgames;
  }

  createGameId(): string {
    const words = [
      'apple', 'banana', 'carrot', 'donut', 'elephant', 'flower', 'grape', 'happy',
      'igloo', 'jelly', 'kite', 'lemon', 'mango', 'noodle', 'orange', 'pizza',
      'quack', 'rainbow', 'snack', 'tiger', 'umbrella', 'violet', 'watermelon', 'xylophone',
      'yellow', 'zebra', 'bubble', 'cookie', 'doodle', 'egg', 'fuzzle', 'giggle',
      'hummus', 'jigsaw', 'kangaroo', 'lollipop', 'muffin', 'ninja', 'oyster', 'panda',
      'quilt', 'raccoon', 'salsa', 'tofu', 'unicorn', 'voxel', 'waffle', 'xenon',
      'yogurt', 'zippy', 'anchor', 'boulder', 'cactus', 'dragon', 'echo', 'falcon',
      'glacier', 'harbor', 'island', 'jungle', 'kindle', 'lagoon', 'meadow', 'nebula',
      'oasis', 'pyramid', 'quicksand', 'reef', 'spectrum', 'tornado', 'utopia', 'vortex',
      'waterfall', 'xeric', 'yonder', 'zenith', 'cloud', 'dune', 'fern', 'geyser',
      'hill', 'iceberg', 'jay', 'koala', 'lake', 'meow', 'nest', 'owl',
      'pear', 'quill', 'rose', 'sea', 'tree', 'ufo', 'valley', 'wolf',
      'xray', 'yarn', 'zinc', 'avocado', 'broccoli', 'cucumber', 'daikon', 'edamame'
    ];
    let gid: string;
    while (true) {
      gid = Array.from({ length: 3 }).map(() => words[Math.floor(Math.random() * words.length)]).join('-');
      if (!Object.prototype.hasOwnProperty.call(this.games, gid)) { break; }
    }
    return gid;
  }

  createGame(mapData: Buffer, gameSettings?: Partial<GameSettings>, mapName?: string): BoloServerWorld {
    const map = WorldMap.load(mapData);
    const gid = this.createGameId();
    const game = new BoloServerWorld(map, gameSettings);
    this.games[gid] = game;
    game.gid = gid;
    game.url = `${this.options.general.base}/match/${gid}`;
    game.mapName = mapName || game.mapName;
    game.lastActivity = Date.now();
    gameLogger.gameCreated(gid, `http://localhost:${this.options.web.port}?${gid}`);
    this.startLoop();
    return game;
  }

  closeGame(game: BoloServerWorld): void {
    delete this.games[game.gid];
    this.possiblyStopLoop();
    game.close();
    gameLogger.gameClosed(game.gid);
  }

  registerIrcClient(irc: any): void {
    this.ircClients.push(irc);
  }

  listen(...args: any[]): void {
    this.httpServer = this.connectServer.listen(...args);

    // FIXME: There's no good way to deal with upgrades in Connect, yet.
    this.httpServer.on('upgrade', (request: http.IncomingMessage, connection: any, initialData: Buffer) => {
      this.handleWebsocket(request, connection, initialData);
    });
  }

  shutdown(): void {
    for (const client of this.ircClients) { client.shutdown(); }
    for (const gid in this.games) { this.games[gid].close(); }
    this.loop.stop();
    this.httpServer.close();
  }

  //### Loop control

  startLoop(): void {
    this.loop.start();
  }

  possiblyStopLoop(): void {
    if (!this.haveOpenSlots()) { this.loop.stop(); }
  }

  tick(): void {
    this.pruneRateLimitState();
    for (const gid in this.games) {
      this.games[gid].tick();
    }
    this.checkGameExpiration();
  }

  checkGameExpiration(): void {
    const timeout = (this.options.general.gameTimeout || 900) * 1000;
    const now = Date.now();
    for (const gid in this.games) {
      const game = this.games[gid];
      if ((now - game.lastActivity) > timeout && game.clients.length === 0) {
        gameLogger.gameExpired(gid, Math.round((now - game.lastActivity) / 1000));
        this.closeGame(game);
      }
    }
  }

  //### WebSocket handling

  normalizeRateLimitConfig(config: { windowMs?: number; maxRequests?: number } | undefined, fallback: RateLimitConfig): RateLimitConfig {
    return {
      windowMs: typeof config?.windowMs === 'number' && config.windowMs > 0 ? config.windowMs : fallback.windowMs,
      maxRequests: typeof config?.maxRequests === 'number' && config.maxRequests > 0 ? config.maxRequests : fallback.maxRequests,
    };
  }

  getRateLimitConfig(kind: 'create' | 'websocket'): RateLimitConfig {
    if (kind === 'create') {
      return this.normalizeRateLimitConfig(this.options.web.rateLimit?.create, DEFAULT_CREATE_RATE_LIMIT);
    }
    return this.normalizeRateLimitConfig(this.options.web.rateLimit?.websocket, DEFAULT_WEBSOCKET_RATE_LIMIT);
  }

  getClientAddress(request: http.IncomingMessage): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return request.socket.remoteAddress || 'unknown';
  }

  pruneRateLimitBucket(bucket: Map<string, RateLimitWindow>, now: number = Date.now()): void {
    for (const [key, entry] of bucket.entries()) {
      if (entry.resetAt <= now) {
        bucket.delete(key);
      }
    }
  }

  pruneRateLimitState(now: number = Date.now()): void {
    this.pruneRateLimitBucket(this.createRateLimitState, now);
    this.pruneRateLimitBucket(this.websocketRateLimitState, now);
  }

  consumeRateLimit(bucket: Map<string, RateLimitWindow>, key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    this.pruneRateLimitBucket(bucket, now);
    const current = bucket.get(key);
    if (!current || current.resetAt <= now) {
      bucket.set(key, { count: 1, resetAt: now + config.windowMs });
      return false;
    }
    current.count += 1;
    if (current.count > config.maxRequests) {
      return true;
    }
    bucket.set(key, current);
    return false;
  }

  isRateLimited(request: http.IncomingMessage, kind: 'create' | 'websocket'): boolean {
    const key = this.getClientAddress(request);
    const config = this.getRateLimitConfig(kind);
    const bucket = kind === 'create' ? this.createRateLimitState : this.websocketRateLimitState;
    return this.consumeRateLimit(bucket, key, config);
  }

  originPatternMatches(pattern: string, origin: string): boolean {
    const trimmed = pattern.trim();
    if (trimmed === '*') {
      return true;
    }

    if (!trimmed.includes('*')) {
      try {
        return new URL(trimmed).origin === origin;
      } catch (_err) {
        // Fall through to wildcard matching.
      }
    }

    const wildcardMatch = /^(https?):\/\/\*\.([^/:]+)(?::(\d+))?$/.exec(trimmed);
    if (!wildcardMatch) {
      return false;
    }

    const [, protocol, domainSuffix, port] = wildcardMatch;
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch (_err) {
      return false;
    }

    if (parsedOrigin.protocol !== `${protocol}:`) {
      return false;
    }
    if (!parsedOrigin.hostname.endsWith(`.${domainSuffix}`) || parsedOrigin.hostname === domainSuffix) {
      return false;
    }
    if (port && parsedOrigin.port !== port) {
      return false;
    }
    return true;
  }

  websocketAllowedOrigins(request: http.IncomingMessage): string[] {
    const configured = Array.isArray(this.options.web.allowedOrigins)
      ? this.options.web.allowedOrigins.map((origin) => origin.trim()).filter((origin) => origin.length > 0)
      : [];
    if (configured.length > 0) {
      return configured;
    }

    const allowedOrigins = new Set<string>();
    const addOrigin = (value?: string): void => {
      if (!value) {
        return;
      }
      try {
        allowedOrigins.add(new URL(value).origin);
      } catch (_err) {
        return;
      }
    };

    addOrigin(this.options.general.base);
    const host = request.headers.host;
    if (typeof host === 'string' && host.length > 0) {
      const protocol = (request.socket as any)?.encrypted ? 'https' : 'http';
      addOrigin(`${protocol}://${host}`);
    }
    if (this.options.web.port > 0) {
      addOrigin(`http://localhost:${this.options.web.port}`);
      addOrigin(`http://127.0.0.1:${this.options.web.port}`);
      addOrigin(`https://localhost:${this.options.web.port}`);
      addOrigin(`https://127.0.0.1:${this.options.web.port}`);
    }

    return Array.from(allowedOrigins);
  }

  isWebsocketOriginAllowed(request: http.IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || origin.length === 0) {
      return true;
    }

    let normalizedOrigin: string;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch (_err) {
      return false;
    }

    return this.websocketAllowedOrigins(request).some((allowedOrigin) => this.originPatternMatches(allowedOrigin, normalizedOrigin));
  }

  rejectWebsocket(connection: any, statusCode: number, reason: string): void {
    if (typeof connection?.write === 'function') {
      connection.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
    }
    connection.destroy();
  }

  getSocketPathHandler(urlPath: string): ((ws: WebSocket) => void) | false {
    let m: RegExpExecArray | null;
    if (urlPath === '/lobby') {
      return false;
    } else if ((m = /^\/match\/([a-z]+-[a-z]+-[a-z]+)$/.exec(urlPath))) {
      if (Object.prototype.hasOwnProperty.call(this.games, m[1])) {
        return (ws: WebSocket) => this.games[m![1]].onConnect(ws);
      } else {
        return false;
      }
    } else if ((m = /^\/([a-z]+-[a-z]+-[a-z]+)$/.exec(urlPath))) {
      if (Object.prototype.hasOwnProperty.call(this.games, m[1])) {
        return (ws: WebSocket) => this.games[m![1]].onConnect(ws);
      } else {
        return false;
      }
    } else if (urlPath === '/demo' && this.demo) {
      return (ws: WebSocket) => this.demo!.onConnect(ws);
    } else {
      return false;
    }
  }

  handleWebsocket(request: http.IncomingMessage, connection: any, initialData: Buffer): void {
    if (request.method !== 'GET') { this.rejectWebsocket(connection, 405, 'Method Not Allowed'); return; }
    if (this.isRateLimited(request, 'websocket')) {
      this.rejectWebsocket(connection, 429, 'Too Many Requests');
      return;
    }
    if (!this.isWebsocketOriginAllowed(request)) {
      this.rejectWebsocket(connection, 403, 'Forbidden');
      return;
    }

    const urlPath = request.url || '';
    const handler = this.getSocketPathHandler(urlPath);
    if (handler === false) { this.rejectWebsocket(connection, 404, 'Not Found'); return; }

    const ws = new WebSocket(request, connection, initialData);
    handler(ws);
  }
}


//# Entry point

// Helper middleware to redirect from '/match/*' or '/<code>' to '?<code>'.
const redirector = (base: string) => (req: any, res: any, next: () => void) => {
  let m: RegExpExecArray | null;
  let query: string;
  if ((m = /^\/match\/([a-z]+-[a-z]+-[a-z]+)$/.exec(req.url))) {
    query = `?${m[1]}`;
  } else if ((m = /^\/([a-z]+-[a-z]+-[a-z]+)$/.exec(req.url))) {
    query = `?${m[1]}`;
  } else {
    return next();
  }
  res.writeHead(301, { 'Location': `${base}/${query}` });
  res.end();
};

// Factory function — don't export a server directly.
const createBoloApp = (options: AppOptions): Application => new Application(options);


//# Exports
export default createBoloApp;
