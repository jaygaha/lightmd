const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Only the paths that exit before Electron starts are tested here; the
// launch itself is a manual check (see README, "Development").
const root = path.join(__dirname, '..');
const runLauncher = (binPath, ...args) => spawnSync(process.execPath, [binPath, ...args], { encoding: 'utf8' });

// Run the launcher from a temp copy of bin/ + lib/, with no node_modules above
// it, optionally adding a fake `electron` package that exports `electronPath`.
function runIsolated({ electronPath } = {}, ...args) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightmd-bin-'));
  try {
    for (const dir of ['bin', 'lib']) fs.cpSync(path.join(root, dir), path.join(tmp, dir), { recursive: true });
    if (electronPath) {
      const pkg = path.join(tmp, 'node_modules', 'electron');
      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, 'index.js'), `module.exports = ${JSON.stringify(electronPath)};`);
    }
    return runLauncher(path.join(tmp, 'bin', 'lightmd.js'), ...args);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('bin/lightmd', () => {
  const bin = path.join(root, 'bin', 'lightmd.js');

  it('prints usage for --help and exits 0', () => {
    const result = runLauncher(bin, '--help');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Usage: lightmd/);
  });

  it('refuses a non-markdown file with a message and exit code 1', () => {
    const result = runLauncher(bin, 'photo.png');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /lightmd: photo\.png is not a markdown file/);
  });

  it('explains how to fix a missing Electron instead of crashing', () => {
    const result = runIsolated({}, 'notes.md');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /lightmd: Electron is not installed\. Run `npm install` in /);
    assert.doesNotMatch(result.stderr, /at Module\._resolveFilename/); // no stack trace
  });

  it('reports a failed Electron launch with exit code 1', () => {
    const result = runIsolated({ electronPath: path.join(os.tmpdir(), 'lightmd-missing-binary') }, 'notes.md');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /lightmd: could not start Electron \(spawn .*lightmd-missing-binary ENOENT\)/);
  });
});
