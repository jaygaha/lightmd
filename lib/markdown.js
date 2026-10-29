const { Marked } = require('marked');

// GitHub-style heading ids so #anchor links work (marked dropped ids in v8).
let slugCounts = new Map();

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function slugify(html) {
  const text = html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
  const seen = slugCounts.get(base) ?? 0;
  slugCounts.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen}`;
}

// Private instance: options don't leak to other marked users.
const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(html)}">${html}</h${depth}>\n`;
    },
    // ```markdown / ```md fences render as Markdown;
    // other fences stay code (returning false falls back to marked's default code block).
    code({ text, lang }) {
      const language = (lang ?? '').match(/^\S*/)[0].toLowerCase();
      if (language !== 'markdown' && language !== 'md') return false;
      return `<div class="markdown-block">\n${marked.parse(text)}</div>\n`;
    },
  },
});

/** Markdown to HTML. Top-level blocks get data-line for scroll sync. */
function render(markdown) {
  slugCounts = new Map(); // per-document numbering
  const tokens = marked.lexer(markdown ?? '');
  const parser = new marked.Parser(marked.defaults); // one instance: as fast as a single parse
  let line = 1;
  let html = '';
  for (const token of tokens) {
    // Tag names run to whitespace, / or > (custom elements contain hyphens).
    html += parser.parse([token]).replace(/^<([a-z][^\s/>]*)/i, `<$1 data-line="${line}"`);
    line += token.raw.split('\n').length - 1;
  }
  return html;
}

module.exports = { render };
