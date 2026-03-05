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
  test('propagates hidden-mine setting from create endpoint to connect payload', async () => {
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
      const created = await requestJson(port, '/create?hideEnemyMinesFromEnemyTanks=0&tournamentMode=1');
      const game = app.games[created.gid];

      expect(game.gameSettings.hideEnemyMinesFromEnemyTanks).toBe(false);
      expect(game.gameSettings.tournamentMode).toBe(true);

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
        },
      });
    } finally {
      app.shutdown();
      fs.rmSync(tmpMapPath, { force: true });
    }
  });
});