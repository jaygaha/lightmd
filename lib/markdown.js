const { Marked } = require('marked');

// Heading ids, so `[Install](#install)` links and README tables of contents
// work. marked stopped generating ids in v8; this follows GitHub's slugs:
// lower-case, punctuation dropped, spaces to dashes, duplicates numbered.
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

// A private instance, so options set here never leak into other users of `marked`.
const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(html)}">${html}</h${depth}>\n`;
    },
  },
});

function render(markdown) {
  slugCounts = new Map(); // ids are numbered per document
  return marked.parse(markdown ?? '');
}

module.exports = { render };
