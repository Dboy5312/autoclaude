#!/usr/bin/env node
// Launches `electron-vite dev` with ELECTRON_RUN_AS_NODE removed from the
// environment. When that variable is set (some shells / parent processes set
// it for tooling), Electron behaves as plain Node and the app's `require('electron')`
// returns the binary path string instead of the Electron API, causing
// `electron.app` to be undefined at module load time.
//
// Removing the variable here is local to the spawned process and its children,
// leaving the parent shell environment unchanged.

'use strict';

const { spawn } = require('child_process');
const path = require('path');

delete process.env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
const isWindows = process.platform === 'win32';

// Resolve electron-vite's CLI directly so we don't depend on PATH lookups
// inside spawned shells, which behave inconsistently across npm versions.
let electronViteBin;
try {
  const pkgPath = require.resolve('electron-vite/package.json');
  const pkg = require(pkgPath);
  const binEntry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin['electron-vite'];
  if (!binEntry) {
    throw new Error('electron-vite bin not declared in package.json');
  }
  electronViteBin = path.resolve(path.dirname(pkgPath), binEntry);
} catch (err) {
  console.error('[dev-wrapper] Could not locate electron-vite:', err.message);
  process.exit(1);
}

const child = spawn(process.execPath, [electronViteBin, 'dev', ...args], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: false,
});

const forward = (signal) => {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
};
forward('SIGINT');
forward('SIGTERM');
if (!isWindows) forward('SIGHUP');

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
