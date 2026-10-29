const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { render } = require('../lib/markdown');

describe('render', () => {
  it('returns an HTML string', () => {
    assert.equal(typeof render('hello'), 'string');
    assert.equal(render('hello').trim(), '<p data-line="1">hello</p>');
  });

  it('renders headings and inline formatting', () => {
    const html = render('# Title\n\nSome **bold** and `code`.');
    assert.match(html, /<h1 data-line="1" id="title">Title<\/h1>/);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<code>code<\/code>/);
  });

  it('renders GFM tables', () => {
    const html = render('| a | b |\n|---|---|\n| 1 | 2 |');
    assert.match(html, /<table data-line="1">/);
    assert.match(html, /<th>a<\/th>/);
    assert.match(html, /<td>2<\/td>/);
  });

  it('renders GFM task lists as checkboxes', () => {
    const html = render('- [x] done\n- [ ] todo');
    assert.match(html, /<input checked="" disabled="" type="checkbox">/);
  });

  it('tags fenced code with its language and escapes its content', () => {
    const html = render('```js\nif (a < b) {}\n```');
    assert.match(html, /<pre data-line="1"><code class="language-js">/);
    assert.match(html, /a &lt; b/);
  });

  it('gives headings GitHub-style ids so #anchor links work', () => {
    const html = render('## Getting Started!\n\n### `npm` & Node.js\n\n## 日本語 見出し');
    assert.match(html, /<h2 data-line="1" id="getting-started">Getting Started!<\/h2>/);
    assert.match(html, /<h3 data-line="3" id="npm--nodejs"><code>npm<\/code> &amp; Node.js<\/h3>/);
    assert.match(html, /<h2 data-line="5" id="日本語-見出し">/);
  });

  it('numbers duplicate heading ids, and restarts numbering for every document', () => {
    const md = '# Notes\n\n## Notes\n\n## Notes';
    const ids = (html) => [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids(render(md)), ['notes', 'notes-1', 'notes-2']);
    assert.deepEqual(ids(render(md)), ['notes', 'notes-1', 'notes-2']);
  });

  it('marks every top-level block with its 1-based source line (for scroll sync)', () => {
    const md = [
      '# Title', //               1
      '', //                      2
      'A paragraph', //           3
      'over two lines.', //       4
      '', //                      5
      '- one', //                 6
      '- two', //                 7
      '', //                      8
      '```js', //                 9
      'code();', //               10
      '```', //                   11
      '', //                      12
      '> quote', //               13
      '', //                      14
      '| a | b |', //             15
      '|---|---|', //             16
      '| 1 | 2 |', //             17
    ].join('\n');
    const html = render(md);
    assert.match(html, /<h1 data-line="1" id="title">/);
    assert.match(html, /<p data-line="3">A paragraph/);
    assert.match(html, /<ul data-line="6">/);
    assert.match(html, /<pre data-line="9">/);
    assert.match(html, /<blockquote data-line="13">/);
    assert.match(html, /<table data-line="15">/);
    // Only top-level blocks are marked, not the list items or cells inside them.
    assert.equal([...html.matchAll(/data-line=/g)].length, 6);
  });

  it('leaves raw HTML that does not start with a tag untouched', () => {
    const html = render('<!-- note -->\n\n# After');
    assert.match(html, /^<!-- note -->/);
    assert.match(html, /<h1 data-line="3" id="after">/);
  });

  it('keeps custom-element tag names intact when adding data-line', () => {
    const html = render('<my-widget foo="1">\nhi\n</my-widget>');
    assert.match(html, /^<my-widget data-line="1" foo="1">/);
  });

  it('resolves reference-style links defined in another block', () => {
    const html = render('See [the docs][docs].\n\n[docs]: https://example.com/docs');
    assert.match(html, /<a href="https:\/\/example\.com\/docs">the docs<\/a>/);
  });

  it('renders ```markdown fences as Markdown (tables, lists) instead of code', () => {
    const html = render('```markdown\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n```');
    assert.match(html, /^<div data-line="1" class="markdown-block">/);
    assert.match(html, /<table>[\s\S]*<td>2<\/td>/);
    assert.match(html, /<ul>\s*<li>one<\/li>/);
    assert.doesNotMatch(html, /<pre>|<code/);
  });

  it('accepts md and any letter case, ignoring extra info after the language', () => {
    assert.match(render('```md\n- item\n```'), /<li>item<\/li>/);
    assert.match(render('```MarkDown title="x"\n**bold**\n```'), /<strong>bold<\/strong>/);
  });

  it('keeps every other fence as a code block', () => {
    assert.match(render('```js\n- not a list\n```'), /<pre data-line="1"><code class="language-js">- not a list/);
    assert.match(render('```\n| a | b |\n```'), /<pre data-line="1"><code>\| a \| b \|/);
    assert.match(render('```markdownish\n- x\n```'), /<code class="language-markdownish">/);
  });

  it('numbers heading ids across the document and its markdown blocks', () => {
    const html = render('# Intro\n\n```markdown\n# Intro\n```');
    assert.deepEqual([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]), ['intro', 'intro-1']);
  });

  it('treats empty or missing input as an empty document', () => {
    assert.equal(render(''), '');
    assert.equal(render(undefined), '');
  });
});
