const path = require('node:path');

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];

function isMarkdownPath(filePath) {
  return MARKDOWN_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function notMarkdownMessage(filePath) {
  return `${path.basename(filePath)} is not a markdown file (${MARKDOWN_EXTENSIONS.join(', ')})`;
}

/**
 * Find the .md path in argv: null, { path } or { path, error }.
 * In dev, the first argument is the app folder. Relative paths resolve against `cwd`.
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
