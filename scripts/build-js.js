const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'js');
const indexPath = path.join(root, 'index.html');

function run(command, args, cwd) {
  const res = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

function getShortCommit() {
  const provided = (process.env.GIT_COMMIT_SHORT || process.env.BOLO_BUILD_HASH || '').trim();
  if (provided) {
    return provided;
  }

  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    return 'nogit';
  }
  return (res.stdout || '').trim() || 'nogit';
}

function removeOldBundles() {
  if (!fs.existsSync(jsDir)) { return; }
  for (const name of fs.readdirSync(jsDir)) {
    if (/^bolo-bundle(\.[a-z0-9]+)?\.js(\.map)?$/i.test(name)) {
      fs.unlinkSync(path.join(jsDir, name));
    }
  }
}

function updateIndex(bundleName) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const next = html.replace(/js\/bolo-bundle(?:\.[a-z0-9]+)?\.js/ig, `js/${bundleName}`);
  fs.writeFileSync(indexPath, next);
}

const shortCommit = getShortCommit();
const bundleName = `bolo-bundle.${shortCommit}.js`;
const outFile = path.join('js', bundleName);

removeOldBundles();
run('npx', [
  'esbuild',
  'src/client/index.ts',
  '--bundle',
  '--global-name=World',
  '--footer:js=World=World.default',
  `--outfile=${outFile}`,
], root);
updateIndex(bundleName);
