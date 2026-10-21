const fs = require('node:fs');
const path = require('node:path');

const { isMarkdownPath, notMarkdownMessage } = require('./cli');

// Parsing blocks the main process (~0.4 s at 5 MB, ~1 s at 10 MB) and the
// window must then lay out about twice that much HTML, so bigger files are refused.
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

const MESSAGES = {
  ENOENT: (filePath) => `${path.basename(filePath)} was not found`,
  EISDIR: (filePath) => `${path.basename(filePath)} is a directory, not a file`,
  EACCES: (filePath) => `${path.basename(filePath)} cannot be read (permission denied)`,
  EBINARY: (filePath) => `${path.basename(filePath)} is a binary file, not markdown`,
  ETOOBIG: (filePath, { size, maxBytes }) =>
    `${path.basename(filePath)} is too large to preview (${formatSize(size)}; the limit is ${formatSize(maxBytes)})`,
  EXT: notMarkdownMessage,
};

function failure(code, filePath, detail = {}) {
  const describe = MESSAGES[code];
  return { ok: false, code, message: describe ? describe(filePath, detail) : `${path.basename(filePath)}: ${detail.reason}` };
}

/**
 * Read a markdown file for display. Never throws: every problem comes back as
 * { ok: false, code, message } so the UI can show a banner instead of crashing.
 */
async function loadMarkdownFile(filePath, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!isMarkdownPath(filePath)) return failure('EXT', filePath);

  let handle;
  try {
    // One open handle for both the size check and the read, so the file can't
    // be swapped for a bigger one in between.
    handle = await fs.promises.open(filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) return failure('EISDIR', filePath);
    if (stat.size > maxBytes) return failure('ETOOBIG', filePath, { size: stat.size, maxBytes });

    const buffer = await handle.readFile();
    // Text files don't contain NUL bytes; this is the same heuristic git uses.
    if (buffer.includes(0)) return failure('EBINARY', filePath);
    return { ok: true, content: buffer.toString('utf8') };
  } catch (err) {
    return failure(err.code ?? 'EUNKNOWN', filePath, { reason: err.message });
  } finally {
    await handle?.close();
  }
}

/**
 * The canonical path for a file: symlinks resolved and, on case-insensitive
 * file systems, the spelling actually on disk. Watching and duplicate checks
 * compare paths as strings, so `readme.md` and `README.md` must agree.
 * A file that doesn't exist yet keeps its name; only its folder is resolved.
 */
function realPath(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    try {
      return path.join(fs.realpathSync.native(path.dirname(filePath)), path.basename(filePath));
    } catch {
      return filePath;
    }
  }
}

module.exports = { loadMarkdownFile, realPath };
