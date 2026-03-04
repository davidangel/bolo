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

describe('server application game end', () => {
  test('logs gameEnd once with winning red team', () => {
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