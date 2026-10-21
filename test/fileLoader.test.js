const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadMarkdownFile, realPath } = require('../lib/fileLoader');

const fixture = path.join(__dirname, 'fixtures', 'sample.md');

describe('loadMarkdownFile', () => {
  let tmp;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightmd-'));
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns the content of an existing markdown file', async () => {
    const result = await loadMarkdownFile(fixture);
    assert.equal(result.ok, true);
    assert.match(result.content, /^# LightMD sample/);
  });

  it('reports a missing file as ENOENT without throwing', async () => {
    const result = await loadMarkdownFile(path.join(tmp, 'does-not-exist.md'));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ENOENT');
    assert.match(result.message, /not found/i);
  });

  it('reports a directory as EISDIR without throwing', async () => {
    const dir = path.join(tmp, 'folder.md');
    fs.mkdirSync(dir);
    const result = await loadMarkdownFile(dir);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'EISDIR');
  });

  it('rejects a non-markdown extension before touching the disk', async () => {
    const result = await loadMarkdownFile(path.join(tmp, 'image.png'));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'EXT');
  });

  it('rejects binary content even with a .md name', async () => {
    const file = path.join(tmp, 'binary.md');
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]));
    const result = await loadMarkdownFile(file);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'EBINARY');
  });

  it('refuses a file over the size limit before reading it', async () => {
    const file = path.join(tmp, 'huge.md');
    fs.writeFileSync(file, '# big\n'.repeat(400)); // 2.4 KB
    const result = await loadMarkdownFile(file, { maxBytes: 1024 });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ETOOBIG');
    assert.match(result.message, /huge\.md is too large to preview \(2\.3 KB; the limit is 1\.0 KB\)/);
  });

  it('allows files up to 5 MB by default', async () => {
    const file = path.join(tmp, 'four-mb.md');
    fs.writeFileSync(file, 'x'.repeat(4 * 1024 * 1024));
    assert.equal((await loadMarkdownFile(file)).ok, true);
  });

  it('reports an unreadable file as EACCES without throwing', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async () => {
    const file = path.join(tmp, 'locked.md');
    fs.writeFileSync(file, '# secret');
    fs.chmodSync(file, 0o000);
    const result = await loadMarkdownFile(file);
    fs.chmodSync(file, 0o644);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'EACCES');
  });
});

describe('realPath', () => {
  let tmp;

  before(() => {
    // realpath of the temp dir itself, so expectations aren't thrown off by
    // macOS's /var -> /private/var symlink.
    tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'lightmd-real-')));
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns the on-disk spelling on a case-insensitive file system', (t) => {
    const actual = path.join(tmp, 'README.md');
    fs.writeFileSync(actual, '# hi');
    const typed = path.join(tmp, 'readme.md');
    if (!fs.existsSync(typed)) return t.skip('file system is case-sensitive');
    assert.equal(realPath(typed), actual);
  });

  it('resolves a symlinked file to its target, so the target is what gets watched', () => {
    const target = path.join(tmp, 'target.md');
    const link = path.join(tmp, 'link.md');
    fs.writeFileSync(target, '# target');
    fs.symlinkSync(target, link);
    assert.equal(realPath(link), target);
  });

  it('resolves only the folder for a file that does not exist yet', () => {
    const linkedDir = path.join(tmp, 'linked-dir');
    fs.symlinkSync(tmp, linkedDir);
    assert.equal(realPath(path.join(linkedDir, 'later.md')), path.join(tmp, 'later.md'));
  });

  it('returns the path unchanged when even the folder is missing', () => {
    const missing = path.join(tmp, 'no', 'such', 'doc.md');
    assert.equal(realPath(missing), missing);
  });
});
