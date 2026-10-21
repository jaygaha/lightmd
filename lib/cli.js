const path = require('node:path');

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];

function isMarkdownPath(filePath) {
  return MARKDOWN_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function notMarkdownMessage(filePath) {
  return `${path.basename(filePath)} is not a markdown file (${MARKDOWN_EXTENSIONS.join(', ')})`;
}

/**
 * Pick the markdown file out of an Electron argv.
 *
 * Dev:      [electron, ...flags, '.', ...flags, file]  -> first positional is the app dir
 * Packaged: [LightMD, ...flags, file]
 *
 * Call it in the process that received the argv: only that process knows its
 * own layout. `cwd` is the directory the command was typed in.
 *
 * Returns null (no file), { path } (valid), or { path, error } (not markdown).
 */
function getFileArg(argv, { isDefaultApp = false, cwd = process.cwd() } = {}) {
  const positionals = argv.slice(1).filter((arg) => !arg.startsWith('-'));
  if (isDefaultApp) positionals.shift();

  const [candidate] = positionals;
  if (!candidate) return null;

  const filePath = path.resolve(cwd, candidate);
  if (!isMarkdownPath(filePath)) return { path: filePath, error: notMarkdownMessage(filePath) };
  return { path: filePath };
}

module.exports = { getFileArg, isMarkdownPath, notMarkdownMessage };
