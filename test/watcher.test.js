const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const { watchFile } = require('../lib/watcher');

const DEBOUNCE_MS = 30;
// File-system events are asynchronous (FSEvents on macOS batches them), so
// tests poll for the expected count instead of assuming a fixed latency.
async function waitForCalls(counter, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (counter.calls < expected && Date.now() < deadline) await sleep(20);
  return counter.calls;
}

describe('watchFile', () => {
  let tmp;
  let file;
  let watcher;
  let counter;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightmd-watch-'));
    file = path.join(tmp, 'doc.md');
    counter = { calls: 0 };
    watcher = null;
  });

  afterEach(() => {
    watcher?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function startWatching() {
    // Let events from creating the fixture flush before the watcher starts.
    await sleep(150);
    watcher = watchFile(file, () => counter.calls++, { debounceMs: DEBOUNCE_MS });
  }

  it('fires once for a burst of writes (debounced)', async () => {
    fs.writeFileSync(file, '# v1');
    await startWatching();

    fs.writeFileSync(file, '# v2');
    fs.appendFileSync(file, '\nmore');
    fs.appendFileSync(file, '\neven more');

    assert.equal(await waitForCalls(counter, 1), 1);
    await sleep(DEBOUNCE_MS * 5);
    assert.equal(counter.calls, 1);
  });

  it('survives an atomic save (write temp file, rename over original)', async () => {
    fs.writeFileSync(file, '# v1');
    await startWatching();

    for (const version of ['v2', 'v3']) {
      const before = counter.calls;
      const temp = path.join(tmp, `.doc.md.${version}.tmp`);
      fs.writeFileSync(temp, `# ${version}`);
      fs.renameSync(temp, file);
      assert.ok(await waitForCalls(counter, before + 1) > before, `no event for ${version}`);
      await sleep(DEBOUNCE_MS * 3);
    }
  });

  it('fires when a missing file is created later', async () => {
    await startWatching();
    fs.writeFileSync(file, '# finally here');
    assert.equal(await waitForCalls(counter, 1), 1);
  });

  it('ignores other files in the same folder', async () => {
    fs.writeFileSync(file, '# v1');
    await startWatching();

    fs.writeFileSync(path.join(tmp, 'other.md'), 'unrelated');
    fs.writeFileSync(path.join(tmp, '.doc.md.swp'), 'editor swap file');
    await sleep(400);
    assert.equal(counter.calls, 0);
  });

  it('reports itself alive while watching, and not after close()', async () => {
    fs.writeFileSync(file, '# v1');
    await startWatching();
    assert.equal(watcher.alive, true);
    watcher.close();
    assert.equal(watcher.alive, false);
  });

  it('stops firing after close()', async () => {
    fs.writeFileSync(file, '# v1');
    await startWatching();
    watcher.close();

    fs.writeFileSync(file, '# v2');
    await sleep(400);
    assert.equal(counter.calls, 0);
  });

  it('reports itself dead and notifies once its folder is deleted', async () => {
    const dir = path.join(tmp, 'drafts');
    fs.mkdirSync(dir);
    file = path.join(dir, 'doc.md');
    fs.writeFileSync(file, '# v1');
    await startWatching();

    fs.rmSync(dir, { recursive: true });
    assert.ok((await waitForCalls(counter, 1)) >= 1, 'no notification for the deleted folder');
    assert.equal(watcher.alive, false);
  });

  it('does not throw when the folder does not exist, and reports itself dead', () => {
    const dead = watchFile(path.join(tmp, 'no', 'such', 'dir', 'doc.md'), () => counter.calls++);
    assert.equal(dead.alive, false);
    dead.close(); // still safe to call
  });
});
