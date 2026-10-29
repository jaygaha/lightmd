const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { offsetForLine } = require('../lib/scroll-map');

// Preview blocks: the source line each starts on, and its top offset in px.
const blocks = [
  { line: 1, top: 30 },
  { line: 5, top: 130 },
  { line: 15, top: 630 },
];

describe('offsetForLine', () => {
  it('lands exactly on a block that starts at the line', () => {
    assert.equal(offsetForLine(blocks, 1), 30);
    assert.equal(offsetForLine(blocks, 5), 130);
    assert.equal(offsetForLine(blocks, 15), 630);
  });

  it('interpolates between blocks, including fractional lines', () => {
    assert.equal(offsetForLine(blocks, 3), 80); // halfway from line 1 to 5
    assert.equal(offsetForLine(blocks, 10), 380); // halfway from line 5 to 15
    assert.equal(offsetForLine(blocks, 6.5), 205);
  });

  it('scrolls to the very top for lines before the first block', () => {
    assert.equal(offsetForLine([{ line: 4, top: 50 }], 2), 0);
  });

  it('stays on the last block past the end', () => {
    assert.equal(offsetForLine(blocks, 99), 630);
  });

  it('returns 0 when there are no blocks', () => {
    assert.equal(offsetForLine([], 10), 0);
  });

  it('never divides by zero when blocks share a line', () => {
    const shared = [{ line: 1, top: 0 }, { line: 3, top: 100 }, { line: 3, top: 140 }, { line: 9, top: 400 }];
    assert.equal(offsetForLine(shared, 3), 140); // the later of the two
    assert.equal(offsetForLine(shared, 6), 270); // halfway from 140 to 400
  });
});

describe('cleanBlocks', () => {
  const { cleanBlocks } = require('../lib/scroll-map');

  it('appends an end marker so the last block can be interpolated through', () => {
    const blocks = cleanBlocks([{ line: 1, top: 0 }, { line: 10, top: 300 }], { line: 50, top: 2300 });
    assert.deepEqual(blocks.at(-1), { line: 50, top: 2300 });
    assert.equal(offsetForLine(blocks, 30), 1300); // halfway through the long last block
  });

  it('drops non-numeric and out-of-order entries (e.g. data-line in raw HTML)', () => {
    const blocks = cleanBlocks(
      [{ line: 1, top: 0 }, { line: NaN, top: 50 }, { line: 9999, top: 60 }, { line: 5, top: 100 }, { line: 3, top: 120 }, { line: 8, top: 200 }],
      { line: 20, top: 500 },
    );
    assert.deepEqual(blocks.map((b) => b.line), [1, 5, 8, 20]);
  });

  it('omits the end marker when it would not come after the last block', () => {
    assert.deepEqual(cleanBlocks([{ line: 4, top: 10 }], { line: 4, top: 90 }), [{ line: 1, top: 0 }, { line: 4, top: 10 }]);
  });

  it('starts at the very top of the preview for line 1, whatever the first block is', () => {
    // First block on line 1 (its top includes the page padding) or later: line 1 is always offset 0.
    assert.equal(offsetForLine(cleanBlocks([{ line: 1, top: 32 }, { line: 3, top: 120 }], { line: 9, top: 400 }), 1), 0);
    assert.equal(offsetForLine(cleanBlocks([{ line: 2, top: 32 }, { line: 4, top: 120 }], { line: 9, top: 400 }), 1), 0);
    // ...and moves smoothly from there to the next block.
    assert.equal(offsetForLine(cleanBlocks([{ line: 1, top: 32 }, { line: 3, top: 120 }], { line: 9, top: 400 }), 2), 60);
  });
});
