import * as fs from 'fs';
import ircLib from 'irc';


interface IrcOptions {
  nick: string;
  server?: string;
  user?: { username?: string; realname?: string };
  channels?: string[];
  admin?: string;
}

interface IrcMessage {
  channel: string;
  params: string[];
  text: string;
  person: { nick: string; user: string; host: string; ident: string };
  match_data: RegExpMatchArray | null;
  say(reply: string): void;
}

interface Watcher {
  re: RegExp;
  callback: (m: IrcMessage) => void;
  onlyAdmin?: boolean;
}

// This mimics basic Jerk functionality, but only accepts commands in channels,
// and only when the bot is addressed by its nickname. It also automatically reconnects.
class BoloIrc {
  didAddressMe: RegExp;
  watchers: Watcher[] = [];
  client: any;
  shuttingDown: boolean = false;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: IrcOptions) {
    this.didAddressMe = new RegExp(`^${options.nick}[:, ]+(.+?)\\s*$`, 'i');

    const server = options.server || 'localhost';
    const nick = options.nick || 'OronaBot';
    const clientOptions = {
      userName: options.user?.username,
      realName: options.user?.realname,
      channels: [],
      autoRejoin: true,
      autoConnect: false
    };

    this.client = new ircLib.Client(server, nick, clientOptions);

    // Join channels once registered
    this.client.addListener('registered', () => {
      if (Array.isArray(options.channels) && options.channels.length) {
        for (const ch of options.channels) { this.client.join(ch); }
      }
    });

    // Handle channel messages
    this.client.addListener('message', (from: string, to: string, text: string, message: any) => {
      if (typeof to !== 'string' || to.charAt(0) !== '#') { return; }
      const match = this.didAddressMe.exec(text);
      if (!match) { return; }
      const m: IrcMessage = {
        channel: to,
        params: [to, text],
        text: match[1],
        person: {
          nick: from,
          user: message?.user ?? '',
          host: message?.host ?? '',
          ident: ''
        },
        match_data: null,
        say: (reply) => this.client.say(m.channel, `${m.person.nick}: ${reply}`)
      };
      m.person.ident = `${m.person.user}@${m.person.host}`;

      for (const watcher of this.watchers) {
        m.match_data = m.text.match(watcher.re);
        if (m.match_data) {
          if (watcher.onlyAdmin && m.person.ident !== (options as any).admin) {
            m.say("I can't let you do that.");
          } else {
            watcher.callback(m);
          }
          break;
        }
      }
    });

    // Try to reconnect on error if not shutting down
    this.client.addListener('error', (_err: any) => {
      if (this.shuttingDown) { return; }
      if (this.reconnectTimer) { return; }
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        try { this.client.connect(); } catch (e) {}
      }, 10000);
    });

    try {
      this.client.connect();
    } catch (e) {
      // ignore connect errors; error event will handle reconnecting
    }
  }

  shutdown(): void {
    this.shuttingDown = true;
    try {
      this.client.disconnect('Augh, they got me!', () => {});
    } catch (e) {}
  }

  watch_for(re: RegExp, callback: (m: IrcMessage) => void): void {
    this.watchers.push({ re, callback });
  }

  watch_for_admin(re: RegExp, callback: (m: IrcMessage) => void): void {
    this.watchers.push({ re, callback, onlyAdmin: true });
  }
}


// The gist of the IRC functionality we provide.
const createBoloIrcClient = (app: any, options: IrcOptions): BoloIrc => {
  const irc = new BoloIrc(options);

  const findHisGame = (ident: string): any => {
    for (const gid in app.games) {
      const game = app.games[gid];
      if (game.owner === ident) { return game; }
    }
    return undefined;
  };

  irc.watch_for(/^map\s+(.+?)$/, (m) => {
    if (findHisGame(m.person.ident)) { return m.say("You already have a game open."); }
    if (!app.haveOpenSlots()) { return m.say("All game slots are full at the moment."); }

    const matches = app.maps.fuzzy(m.match_data![1]);
    if (matches.length === 1) {
      const [descr] = matches;
      fs.readFile(descr.path, (err: any, data: Buffer) => {
        if (err) { return m.say("Having some trouble loading that map, sorry."); }
        const game = app.createGame(data);
        game.owner = m.person.ident;
        m.say(`Started game "${descr.name}" at: ${game.url}`);
      });
    } else if (matches.length === 0) {
      m.say("I can't find any map like that.");
    } else if (matches.length > 4) {
      m.say("You need to be a bit more specific than that.");
    } else {
      const names = matches.map((descr: any) => `"${descr.name}"`);
      m.say(`Did you mean one of these: ${names.join(', ')}`);
    }
  });

  irc.watch_for(/^close$/, (m) => {
    const game = findHisGame(m.person.ident);
    if (!game) { return m.say("You don't have a game open."); }
    app.closeGame(game);
    m.say("Your game was closed.");
  });

  irc.watch_for_admin(/^reindex$/, (m) => app.maps.reindex(() => m.say("Index rebuilt.")));

  irc.watch_for_admin(/^reset demo$/, (m) => app.resetDemo((err?: string) => m.say(err != null ? err : 'Demo game reset.')));

  irc.watch_for_admin(/^shutdown$/, (_m) => app.shutdown());

  return irc;
};


//# Exports
export default createBoloIrcClient;
