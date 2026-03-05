type GameEventContext = {
  gid?: string;
  [key: string]: unknown;
};

class GameLogger {
  private emit(level: 'log' | 'error', event: string, context: GameEventContext = {}): void {
    const { gid, ...details } = context;
    const scope = gid ? `Game ${gid}` : 'Game';
    const parts = Object.entries(details).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
    const suffix = parts.length > 0 ? ` ${parts.join(' ')}` : '';
    const line = `${scope}: ${event}${suffix}`;
    if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  gameCreated(gid: string, url: string): void {
    this.emit('log', `created: ${url}`, { gid });
  }

  playerJoined(gid: string, nick: string, team: string): void {
    this.emit('log', `${nick} joined the ${team} team.`, { gid, nick, team });
  }

  gameClosed(gid: string): void {
    this.emit('log', 'Game closed', { gid });
  }

  gameExpired(gid: string, inactiveForSeconds: number): void {
    this.emit('log', `Game expired due to inactivity for ${inactiveForSeconds} seconds.`, { gid, inactiveForSeconds });
  }

  gameEnd(gid: string, winningTeam: string): void {
    this.emit('log', `Game ended. Winning team: ${winningTeam}.`, { gid, winningTeam });
  }

  gameError(gid: string, error: string): void {
    this.emit('error', `Error: ${error}`, { gid, error });
  }
}

const gameLogger = new GameLogger();

export default gameLogger;