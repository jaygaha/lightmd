#!/usr/bin/env node
// Terminal launcher, the LightMD counterpart of PyCharm's bin/ltedit.sh:
// resolve the file, start Electron in the background, give the prompt back.

const { spawn } = require('node:child_process');
const path = require('node:path');

const { getFileArg } = require('../lib/cli');

const USAGE = `Usage: lightmd [file.md]

Open a Markdown file in LightMD. With no file, opens the drop zone.
If LightMD is already running, the file opens in a new window of that instance.`;

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}

// Node's argv has the same shape as `electron .`: [runtime, script, ...args],
// so isDefaultApp skips the script path just like it skips the app folder.
const arg = getFileArg(process.argv, { isDefaultApp: true, cwd: process.cwd() });

if (arg?.error) {
  console.error(`lightmd: ${arg.error}`);
  process.exit(1);
}

const appDir = path.join(__dirname, '..');

// Required from plain Node, the electron package exports the binary's path.
// It's a devDependency of this folder, so it's missing until `npm install`.
let electron;
try {
  electron = require('electron');
} catch {
  console.error(`lightmd: Electron is not installed. Run \`npm install\` in ${appDir}`);
  process.exit(1);
}

// Some terminals (e.g. inside VS Code) export this, which would make Electron
// behave as plain Node and never open a window.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [appDir, ...(arg ? [arg.path] : [])], {
  detached: true, // own process group: closing the terminal doesn't kill the viewer
  stdio: 'ignore', // no handles back to this terminal
  env,
});
// A failed spawn (binary missing, not executable) is reported on the next
// tick, before this script exits, so it still reaches the terminal.
child.on('error', (err) => {
  console.error(`lightmd: could not start Electron (${err.message})`);
  process.exitCode = 1;
});
child.unref(); // let this script exit without waiting for Electron
