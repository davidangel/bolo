const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const markerPath = path.join(root, 'js', '.dev-build-id');

let building = false;
let queued = false;
let debounceTimer = null;

function writeMarker() {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${Date.now()}\n`, 'utf8');
}

function runBuild() {
  if (building) {
    queued = true;
    return;
  }

  building = true;
  const result = spawnSync('npm', ['run', 'build:js'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status === 0) {
    writeMarker();
  }

  building = false;

  if (queued) {
    queued = false;
    runBuild();
  }
}

function scheduleBuild() {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuild();
  }, 120);
}

function watchDirectory(dirPath) {
  fs.watch(dirPath, { recursive: true }, (_event, fileName) => {
    const changed = (fileName || '').toString();
    if (!changed) {
      scheduleBuild();
      return;
    }

    if (
      changed.includes('node_modules') ||
      changed.includes('.git') ||
      changed.endsWith('.swp') ||
      changed.endsWith('.tmp')
    ) {
      return;
    }

    scheduleBuild();
  });
}

console.log('[dev-hot] initial build');
runBuild();

console.log('[dev-hot] watching src/ for changes');
watchDirectory(sourceRoot);

process.on('SIGINT', () => {
  process.exit(0);
});
