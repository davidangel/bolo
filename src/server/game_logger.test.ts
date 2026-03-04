import gameLogger from './game_logger';

describe('game_logger', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('logs game creation', () => {
    gameLogger.gameCreated('abc-def-ghi', 'http://localhost:4000?abc-def-ghi');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      'Game abc-def-ghi: created: http://localhost:4000?abc-def-ghi'
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('logs player join, close, expire, and end events', () => {
    gameLogger.playerJoined('abc-def-ghi', 'david', 'red');
    gameLogger.gameClosed('abc-def-ghi');
    gameLogger.gameExpired('abc-def-ghi', 123);
    gameLogger.gameEnd('abc-def-ghi', 'blue');

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      'Game abc-def-ghi: david joined the red team. nick="david" team="red"'
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, 'Game abc-def-ghi: Game closed');
    expect(logSpy).toHaveBeenNthCalledWith(
      3,
      'Game abc-def-ghi: Game expired due to inactivity for 123 seconds. inactiveForSeconds=123'
    );
    expect(logSpy).toHaveBeenNthCalledWith(
      4,
      'Game abc-def-ghi: Game ended. Winning team: blue. winningTeam="blue"'
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('logs errors to console.error', () => {
    gameLogger.gameError('abc-def-ghi', 'bad payload');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Game abc-def-ghi: Error: bad payload error="bad payload"'
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('falls back to generic scope when gid is missing', () => {
    (gameLogger as any).emit('log', 'heartbeat');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Game: heartbeat');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});