const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { render } = require('../lib/markdown');

describe('render', () => {
  it('returns an HTML string', () => {
    assert.equal(typeof render('hello'), 'string');
    assert.equal(render('hello').trim(), '<p>hello</p>');
  });

  it('renders headings and inline formatting', () => {
    const html = render('# Title\n\nSome **bold** and `code`.');
    assert.match(html, /<h1 id="title">Title<\/h1>/);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<code>code<\/code>/);
  });

  it('renders GFM tables', () => {
    const html = render('| a | b |\n|---|---|\n| 1 | 2 |');
    assert.match(html, /<table>/);
    assert.match(html, /<th>a<\/th>/);
    assert.match(html, /<td>2<\/td>/);
  });

  it('renders GFM task lists as checkboxes', () => {
    const html = render('- [x] done\n- [ ] todo');
    assert.match(html, /<input checked="" disabled="" type="checkbox">/);
  });

  it('tags fenced code with its language and escapes its content', () => {
    const html = render('```js\nif (a < b) {}\n```');
    assert.match(html, /<pre><code class="language-js">/);
    assert.match(html, /a &lt; b/);
  });

  it('gives headings GitHub-style ids so #anchor links work', () => {
    const html = render('## Getting Started!\n\n### `npm` & Node.js\n\n## 日本語 見出し');
    assert.match(html, /<h2 id="getting-started">Getting Started!<\/h2>/);
    assert.match(html, /<h3 id="npm--nodejs"><code>npm<\/code> &amp; Node.js<\/h3>/);
    assert.match(html, /<h2 id="日本語-見出し">/);
  });

  it('numbers duplicate heading ids, and restarts numbering for every document', () => {
    const md = '# Notes\n\n## Notes\n\n## Notes';
    const ids = (html) => [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids(render(md)), ['notes', 'notes-1', 'notes-2']);
    assert.deepEqual(ids(render(md)), ['notes', 'notes-1', 'notes-2']);
  });

  it('treats empty or missing input as an empty document', () => {
    assert.equal(render(''), '');
    assert.equal(render(undefined), '');
  });
});
