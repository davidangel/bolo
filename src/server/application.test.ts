import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import Map, { Base } from '../map';

jest.mock('villain/loop', () => ({
  createLoop: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

jest.mock('./map_index', () => ({
  __esModule: true,
  default: class MockMapIndex {
    nameIndex: Record<string, { path: string }> = {};

    constructor(_path: string, _onReady: () => void) {}

    get(_name: string): { path: string } | undefined {
      return undefined;
    }
  },
}));

jest.mock('./game_logger', () => ({
  __esModule: true,
  default: {
    gameCreated: jest.fn(),
    playerJoined: jest.fn(),
    gameClosed: jest.fn(),
    gameExpired: jest.fn(),
    gameEnd: jest.fn(),
    gameError: jest.fn(),
  },
}));

import createBoloApp from './application';
import gameLogger from './game_logger';

const requestJson = (port: number, requestPath: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: requestPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
};

const request = (port: number, requestPath: string): Promise<{ statusCode: number; body: string }> => {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: requestPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body });
      });
    });
    req.on('error', reject);
  });
};

describe('server application game end', () => {
  test('logs gameEnd once with single-team control', () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 4000, log: false },
    }) as any;

    const map = new Map();
    map.bases = [new Base(map, 32, 32, 255, 10, 10, 10)];
    const game = app.createGame(Buffer.from(map.dump())) as any;

    const logger = gameLogger as jest.Mocked<typeof gameLogger>;
    logger.gameEnd.mockClear();

    game.map.bases[0].team = 0;

    for (let i = 0; i < 50; i++) {
      game.tick();
    }

    expect(logger.gameEnd).toHaveBeenCalledTimes(1);
    expect(logger.gameEnd).toHaveBeenCalledWith(game.gid, 'red');

    for (let i = 0; i < 20; i++) {
      game.tick();
    }

    expect(logger.gameEnd).toHaveBeenCalledTimes(1);
  });
});

describe('server application game settings', () => {
  test('propagates game settings from create endpoint to connect payload', async () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 0, log: false },
    }) as any;

    const map = new Map();
    const tmpMapPath = path.join(os.tmpdir(), `bolo-test-${Date.now()}-${Math.random()}.map`);
    fs.writeFileSync(tmpMapPath, Buffer.from(map.dump()));
    app.maps.nameIndex = { 'Test Map': { path: tmpMapPath } };

    try {
      app.listen(0);
      const port = (app.httpServer.address() as any).port as number;
      const created = await requestJson(port, '/create?hideEnemyMinesFromEnemyTanks=0&tournamentMode=1&public=1');
      const game = app.games[created.gid];

      expect(game.gameSettings.hideEnemyMinesFromEnemyTanks).toBe(false);
      expect(game.gameSettings.tournamentMode).toBe(true);
      expect(game.gameSettings.public).toBe(true);

      const sent: string[] = [];
      const ws: any = {
        send: (msg: string) => sent.push(msg),
        on: jest.fn(),
        close: jest.fn(),
      };
      game.onConnect(ws);

      const settingsMessage = sent
        .map((msg) => {
          try {
            return JSON.parse(msg);
          } catch {
            return null;
          }
        })
        .find((msg) => msg && msg.command === 'settings');

      expect(settingsMessage).toEqual({
        command: 'settings',
        game: {
          hideEnemyMinesFromEnemyTanks: false,
          tournamentMode: true,
          public: true,
        },
      });
    } finally {
      app.shutdown();
      fs.rmSync(tmpMapPath, { force: true });
    }
  });

  test('applies player autoSlowdown from join and runtime playerSettings updates', () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 0, log: false },
    }) as any;

    const map = new Map();
    const game = app.createGame(Buffer.from(map.dump())) as any;

    const ws: any = {
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
    };

    const fakeTank: any = {
      idx: 123,
      autoSlowdown: true,
      name: '',
      team: 0,
    };
    const spawnSpy = jest.spyOn(game, 'spawn').mockReturnValue(fakeTank);

    try {
      game.onJoinMessage(ws, { nick: 'Tester', team: 0, autoSlowdown: false });
      expect(ws.tank).toBeTruthy();
      expect(ws.tank.autoSlowdown).toBe(false);

      game.onJsonMessage(ws, JSON.stringify({ command: 'playerSettings', autoSlowdown: true }));
      expect(ws.tank.autoSlowdown).toBe(true);
    } finally {
      spawnSpy.mockRestore();
      game.close();
    }
  });

  test('rejects invalid join messages without spawning a tank', () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 0, log: false },
    }) as any;

    const map = new Map();
    const game = app.createGame(Buffer.from(map.dump())) as any;
    const ws: any = {
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
    };
    const spawnSpy = jest.spyOn(game, 'spawn');

    try {
      game.onJoinMessage(ws, { nick: 'x'.repeat(21), team: 0 });
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(ws.tank).toBeUndefined();

      game.onJoinMessage(ws, { nick: 'Tester', team: 99 });
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(ws.tank).toBeUndefined();
    } finally {
      spawnSpy.mockRestore();
      game.close();
    }
  });

  test('rejects invalid chat messages without broadcasting them', () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 0, log: false },
    }) as any;

    const map = new Map();
    const game = app.createGame(Buffer.from(map.dump())) as any;
    const broadcastSpy = jest.spyOn(game, 'broadcast');
    const ws: any = { send: jest.fn(), on: jest.fn(), close: jest.fn() };
    const tank: any = { idx: 7, team: 1 };

    try {
      game.onTextMessage(ws, tank, { text: 'x'.repeat(141) });
      game.onTeamTextMessage(ws, tank, { text: 12345 });
      expect(broadcastSpy).not.toHaveBeenCalled();
    } finally {
      broadcastSpy.mockRestore();
      game.close();
    }
  });

  test('lists only active public games and excludes ended games', async () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 0, log: false },
    }) as any;

    const map = new Map();
    const publicGame = app.createGame(Buffer.from(map.dump()), { public: true }) as any;
    const emptyPublicGame = app.createGame(Buffer.from(map.dump()), { public: true }) as any;
    app.createGame(Buffer.from(map.dump()), { public: false });
    publicGame.tanks = [{ name: 'Alice' }, { name: 'Bob' }];
    emptyPublicGame.gameEndLogged = true;

    try {
      app.listen(0);
      const port = (app.httpServer.address() as any).port as number;
      const listed = await requestJson(port, '/api/public-games');
      expect(Array.isArray(listed)).toBe(true);
      expect(listed.length).toBe(1);
      const byGid: Record<string, any> = {};
      for (const game of listed) {
        byGid[game.gid] = game;
      }
      expect(byGid[publicGame.gid]).toBeTruthy();
      expect(byGid[emptyPublicGame.gid]).toBeFalsy();
      expect(typeof byGid[publicGame.gid].mapName).toBe('string');
      expect(Array.isArray(byGid[publicGame.gid].playerNames)).toBe(true);
      expect(byGid[publicGame.gid].playerNames).toEqual(['Alice', 'Bob']);
    } finally {
      app.shutdown();
    }
  });

  test('rejects create requests when max game slots are full', async () => {
    const app = createBoloApp({
      general: { base: 'http://localhost:8124', maxgames: 1 },
      web: { port: 0, log: false },
    }) as any;

    const map = new Map();
    const tmpMapPath = path.join(os.tmpdir(), `bolo-test-${Date.now()}-${Math.random()}.map`);
    fs.writeFileSync(tmpMapPath, Buffer.from(map.dump()));
    app.maps.nameIndex = { 'Test Map': { path: tmpMapPath } };
    app.createGame(Buffer.from(map.dump()));

    try {
      app.listen(0);
      const port = (app.httpServer.address() as any).port as number;
      const response = await request(port, '/create?map=Test%20Map');
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({ error: 'All game slots are full.' });
    } finally {
      app.shutdown();
      fs.rmSync(tmpMapPath, { force: true });
    }
  });

  test('rate limits repeated create requests from the same client', async () => {
    const app = createBoloApp({
      general: { base: 'http://localhost:8124', maxgames: 10 },
      web: {
        port: 0,
        log: false,
        rateLimit: {
          create: { windowMs: 60000, maxRequests: 1 },
        },
      },
    }) as any;

    const map = new Map();
    const tmpMapPath = path.join(os.tmpdir(), `bolo-test-${Date.now()}-${Math.random()}.map`);
    fs.writeFileSync(tmpMapPath, Buffer.from(map.dump()));
    app.maps.nameIndex = { 'Test Map': { path: tmpMapPath } };

    try {
      app.listen(0);
      const port = (app.httpServer.address() as any).port as number;
      const first = await request(port, '/create?map=Test%20Map');
      const second = await request(port, '/create?map=Test%20Map');
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
      expect(JSON.parse(second.body)).toEqual({ error: 'Too many create requests. Please try again later.' });
    } finally {
      app.shutdown();
      fs.rmSync(tmpMapPath, { force: true });
    }
  });

  test('rejects websocket upgrades from disallowed origins', () => {
    const app = createBoloApp({
      general: { base: 'http://localhost:8124', maxgames: 10 },
      web: { port: 8124, log: false },
    }) as any;

    const request = {
      method: 'GET',
      url: '/demo',
      headers: {
        host: 'localhost:8124',
        origin: 'https://evil.example',
      },
      socket: { encrypted: false },
    } as any;
    const connection = {
      write: jest.fn(),
      destroy: jest.fn(),
    };

    app.handleWebsocket(request, connection, Buffer.alloc(0));

    expect(connection.write).toHaveBeenCalledWith(expect.stringContaining('403 Forbidden'));
    expect(connection.destroy).toHaveBeenCalledTimes(1);
  });

  test('allows websocket upgrades from configured allowed origins', () => {
    const app = createBoloApp({
      general: { base: 'http://localhost:8124', maxgames: 10 },
      web: { port: 8124, log: false, allowedOrigins: ['https://play.example.com'] },
    }) as any;

    const allowed = app.isWebsocketOriginAllowed({
      headers: { origin: 'https://play.example.com', host: 'localhost:8124' },
      socket: { encrypted: false },
    } as any);
    const denied = app.isWebsocketOriginAllowed({
      headers: { origin: 'https://evil.example', host: 'localhost:8124' },
      socket: { encrypted: false },
    } as any);

    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });

  test('allows websocket upgrades from matching wildcard subdomains', () => {
    const app = createBoloApp({
      general: { base: 'http://localhost:8124', maxgames: 10 },
      web: { port: 8124, log: false, allowedOrigins: ['https://*.example.com'] },
    }) as any;

    expect(app.isWebsocketOriginAllowed({
      headers: { origin: 'https://play.example.com', host: 'localhost:8124' },
      socket: { encrypted: false },
    } as any)).toBe(true);
    expect(app.isWebsocketOriginAllowed({
      headers: { origin: 'https://staging.play.example.com', host: 'localhost:8124' },
      socket: { encrypted: false },
    } as any)).toBe(true);
    expect(app.isWebsocketOriginAllowed({
      headers: { origin: 'https://example.com', host: 'localhost:8124' },
      socket: { encrypted: false },
    } as any)).toBe(false);
  });

  test('rate limits repeated websocket upgrades from the same client', () => {
    const app = createBoloApp({
      general: { base: 'http://localhost:8124', maxgames: 10 },
      web: {
        port: 8124,
        log: false,
        rateLimit: {
          websocket: { windowMs: 60000, maxRequests: 1 },
        },
      },
    }) as any;

    const connection1 = { write: jest.fn(), destroy: jest.fn() };
    const connection2 = { write: jest.fn(), destroy: jest.fn() };
    const request = {
      method: 'GET',
      url: '/demo',
      headers: {
        host: 'localhost:8124',
        origin: 'http://localhost:8124',
      },
      socket: { encrypted: false, remoteAddress: '127.0.0.1' },
    } as any;
    const getSocketPathHandlerSpy = jest.spyOn(app, 'getSocketPathHandler').mockReturnValue(() => undefined);

    try {
      app.handleWebsocket(request, connection1, Buffer.alloc(0));
      app.handleWebsocket(request, connection2, Buffer.alloc(0));
      expect(connection2.write).toHaveBeenCalledWith(expect.stringContaining('429 Too Many Requests'));
      expect(connection2.destroy).toHaveBeenCalledTimes(1);
    } finally {
      getSocketPathHandlerSpy.mockRestore();
    }
  });

  test('prunes expired rate limit entries', () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 0, log: false },
    }) as any;

    app.createRateLimitState.set('expired', { count: 3, resetAt: 100 });
    app.createRateLimitState.set('active', { count: 1, resetAt: 1000 });
    app.websocketRateLimitState.set('expired-ws', { count: 2, resetAt: 100 });

    app.pruneRateLimitState(500);

    expect(app.createRateLimitState.has('expired')).toBe(false);
    expect(app.createRateLimitState.has('active')).toBe(true);
    expect(app.websocketRateLimitState.has('expired-ws')).toBe(false);
  });

  test('closes clients that stop responding to ping requests', () => {
    const app = createBoloApp({
      general: { base: '', maxgames: 10 },
      web: { port: 0, log: false },
    }) as any;

    const map = new Map();
    const game = app.createGame(Buffer.from(map.dump())) as any;
    const ws: any = {
      awaitingPong: false,
      lastPingAt: Date.now() - 6000,
      lastPongAt: Date.now() - 6000,
      ping: jest.fn(),
      close: jest.fn(),
      send: jest.fn(),
    };
    game.clients = [ws];

    game.maintainClientConnections();
    expect(ws.ping).toHaveBeenCalledTimes(1);
    expect(ws.awaitingPong).toBe(true);

    ws.lastPingAt = Date.now() - 16000;
    game.maintainClientConnections();
    expect(ws.close).toHaveBeenCalledWith(4000, 'Heartbeat timeout');
  });
});