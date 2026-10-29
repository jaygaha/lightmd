// Bundle src/source-view.mjs (CodeMirror) into vendor/source-view.js.
//   --if-stale             skip when the bundle is newer than its inputs (npm start)
//   --skip-without-esbuild skip quietly when dev dependencies aren't installed (postinstall)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'src', 'source-view.mjs');
const outfile = path.join(root, 'vendor', 'source-view.js');
const flags = new Set(process.argv.slice(2));

const mtime = (file) => (fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0);
const inputs = [entry, path.join(root, 'package-lock.json')];
if (flags.has('--if-stale') && mtime(outfile) > Math.max(...inputs.map(mtime))) process.exit(0);

let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  if (flags.has('--skip-without-esbuild')) {
    console.log('lightmd: dev dependencies not installed; skipping the source view build');
    process.exit(0);
  }
  console.error('lightmd: esbuild is missing. Run `npm install` (with dev dependencies) first.');
  process.exit(1);
}

esbuild.buildSync({
  entryPoints: [entry],
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'LightMDSource',
  logLevel: 'warning',
});
