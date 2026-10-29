#!/usr/bin/env node
// Terminal launcher (like PyCharm's ltedit.sh): start Electron, return the prompt.

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

// Node's argv looks like `electron .`, so isDefaultApp skips the script path.
const arg = getFileArg(process.argv, { isDefaultApp: true, cwd: process.cwd() });

if (arg?.error) {
  console.error(`lightmd: ${arg.error}`);
  process.exit(1);
}

const appDir = path.join(__dirname, '..');

// Exports the Electron binary path; missing until `npm install`.
let electron;
try {
  electron = require('electron');
} catch {
  console.error(`lightmd: Electron is not installed. Run \`npm install\` in ${appDir}`);
  process.exit(1);
}

// Set by some terminals (e.g. VS Code); it stops Electron opening a window.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [appDir, ...(arg ? [arg.path] : [])], {
  detached: true, // survives the terminal closing
  stdio: 'ignore', // no ties to this terminal
  env,
});
// Spawn errors arrive on the next tick, before exit, so they still print.
child.on('error', (err) => {
  console.error(`lightmd: could not start Electron (${err.message})`);
  process.exitCode = 1;
});
child.unref(); // don't wait for Electron
