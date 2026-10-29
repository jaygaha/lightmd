// Works in Node (tests) and the page (<script>, window.LightMDScrollMap); no build step.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LightMDScrollMap = api;
})(typeof self !== 'undefined' ? self : this, () => {
  /** Preview offset that puts source `line` at the top. `blocks` is sorted [{ line, top }]. */
  function offsetForLine(blocks, line) {
    if (blocks.length === 0 || line < blocks[0].line) return 0;

    // Last block at or before `line`, so next.line > line: no division by zero.
    let low = 0;
    let high = blocks.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (blocks[mid].line <= line) low = mid;
      else high = mid - 1;
    }

    const block = blocks[low];
    const next = blocks[low + 1];
    if (!next) return block.top;
    const fraction = (line - block.line) / (next.line - block.line);
    return block.top + fraction * (next.top - block.top);
  }

  /** Drop bad or out-of-order lines, then add start and end markers for interpolation. */
  function cleanBlocks(blocks, end) {
    const clean = [{ line: 1, top: 0 }];
    for (const block of blocks) {
      const valid = Number.isFinite(block.line) && block.line > 1 && block.line <= end.line;
      if (valid && block.line >= clean.at(-1).line) clean.push(block);
    }
    if (end.line > clean.at(-1).line) clean.push(end);
    return clean;
  }

  return { offsetForLine, cleanBlocks };
});
