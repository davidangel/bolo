import * as fs from 'fs';
import * as path from 'path';
import createBoloApp from './application';
import createBoloIrcClient from './irc';

export function run(): void {
  if (process.argv.length !== 3) {
    console.log("Usage: bolo-server <config.json>");
    console.log("If the file does not exist, a sample will be created.");
    return;
  }

  let content: string;
  try {
    content = fs.readFileSync(process.argv[2], 'utf-8');
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      console.log("I was unable to read that file.");
      throw e;
    }

    const samplefile = path.join(path.dirname(fs.realpathSync(__filename)), '../../config.json.sample');
    const sample = fs.readFileSync(samplefile, 'utf-8');
    try {
      fs.writeFileSync(process.argv[2], sample, 'utf-8');
    } catch (e2) {
      console.log("Oh snap! I want to create a sample configuration, but can't.");
      throw e2;
    }
    console.log("I created a sample configuration for you.");
    console.log("Please edit the file, then run the same command again.");
    return;
  }

  let config: any;
  try {
    config = JSON.parse(content);
  } catch (e) {
    console.log("I don't understand the contents of that file.");
    throw e;
  }

  const app = createBoloApp(config);
  app.listen(config.web.port);
  console.log(`Bolo server started: http://localhost:${config.web.port}/`);

  if (config.irc) {
    for (const link in config.irc) {
      const options = config.irc[link];
      app.registerIrcClient(createBoloIrcClient(app, options));
    }
  }
}
