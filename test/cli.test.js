const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { getFileArg, isMarkdownPath } = require('../lib/cli');

const cwd = path.resolve('/home/user/notes');

describe('getFileArg', () => {
  it('reads the file after the app path in dev mode (electron . file.md)', () => {
    const result = getFileArg(['/bin/electron', '.', 'README.md'], { isDefaultApp: true, cwd });
    assert.deepEqual(result, { path: path.join(cwd, 'README.md') });
  });

  it('reads the first argument in a packaged app (LightMD file.md)', () => {
    const result = getFileArg(['/Applications/LightMD.app/Contents/MacOS/LightMD', 'README.md'], { isDefaultApp: false, cwd });
    assert.deepEqual(result, { path: path.join(cwd, 'README.md') });
  });

  it('keeps absolute paths as they are', () => {
    const absolute = path.resolve('/tmp/doc.md');
    const result = getFileArg(['/bin/electron', '.', absolute], { isDefaultApp: true, cwd });
    assert.deepEqual(result, { path: absolute });
  });

  it('skips Electron/Chromium flags wherever they appear', () => {
    const argv = ['/bin/electron', '--inspect=5858', '.', '--enable-logging', 'docs/guide.md'];
    const result = getFileArg(argv, { isDefaultApp: true, cwd });
    assert.deepEqual(result, { path: path.join(cwd, 'docs/guide.md') });
  });

  it('returns null when no file is given (landing page case)', () => {
    assert.equal(getFileArg(['/bin/electron', '.'], { isDefaultApp: true, cwd }), null);
    assert.equal(getFileArg(['/bin/electron', '.', '--enable-logging'], { isDefaultApp: true, cwd }), null);
  });

  it('flags a non-markdown file with an error instead of a bare path', () => {
    const result = getFileArg(['/bin/electron', '.', 'photo.png'], { isDefaultApp: true, cwd });
    assert.equal(result.path, path.join(cwd, 'photo.png'));
    assert.match(result.error, /not a markdown file/i);
  });
});

describe('isMarkdownPath', () => {
  it('accepts .md and .markdown in any case', () => {
    for (const name of ['a.md', 'a.markdown', 'A.MD', 'notes.Markdown']) {
      assert.equal(isMarkdownPath(name), true, name);
    }
  });

  it('rejects other extensions and extensionless names', () => {
    for (const name of ['a.txt', 'a.mdx', 'README', 'md', 'a.md.bak']) {
      assert.equal(isMarkdownPath(name), false, name);
    }
  });
});
