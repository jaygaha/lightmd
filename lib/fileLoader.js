const fs = require('node:fs');
const path = require('node:path');

const { isMarkdownPath, notMarkdownMessage } = require('./cli');

// Parsing blocks the main process (~0.4 s at 5 MB), so larger files are refused.
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

/** Read a .md file. Never throws: returns { ok, content } or { ok: false, code, message }. */
async function loadMarkdownFile(filePath, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!isMarkdownPath(filePath)) return failure('EXT', filePath);

  let handle;
  try {
    // One handle for size check and read, so the file can't change in between.
    handle = await fs.promises.open(filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) return failure('EISDIR', filePath);
    if (stat.size > maxBytes) return failure('ETOOBIG', filePath, { size: stat.size, maxBytes });

    const buffer = await handle.readFile();
    // NUL bytes mean binary (git's heuristic).
    if (buffer.includes(0)) return failure('EBINARY', filePath);
    return { ok: true, content: buffer.toString('utf8') };
  } catch (err) {
    return failure(err.code ?? 'EUNKNOWN', filePath, { reason: err.message });
  } finally {
    await handle?.close();
  }
}

/** Resolve symlinks and on-disk casing. For a missing file, only its folder. */
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
