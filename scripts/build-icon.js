// Render build/icon.svg to build/icon.png (1024 px) and build/icon.icns.
// Run with `npm run icon`. Uses Electron's own Chromium to rasterize the SVG,
// then macOS's sips (resize) and iconutil (pack .icns), so no extra packages.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');

const SIZE = 1024;
const buildDir = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');

// Every size macOS looks for in an .icns: [points, scale].
const ICONSET = [16, 32, 128, 256, 512].flatMap((pt) => [[pt, 1], [pt, 2]]);

async function rasterize() {
  // Offscreen rendering paints at scale 1, so 1024 CSS px = 1024 image px
  // regardless of the display's Retina factor.
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    svg { display: block; width: ${SIZE}px; height: ${SIZE}px; }
  </style></head><body>${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 300)); // let filters paint

  let image = await win.webContents.capturePage();
  if (image.getSize().width !== SIZE) image = image.resize({ width: SIZE, height: SIZE, quality: 'best' });
  win.destroy();
  return image.toPNG();
}

function packIcns(pngPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightmd-icon-'));
  try {
    const iconset = path.join(tmp, 'icon.iconset'); // iconutil requires this suffix
    fs.mkdirSync(iconset);
    for (const [pt, scale] of ICONSET) {
      const px = String(pt * scale);
      const name = `icon_${pt}x${pt}${scale === 2 ? '@2x' : ''}.png`;
      execFileSync('sips', ['-z', px, px, pngPath, '--out', path.join(iconset, name)], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true }); // also when sips/iconutil fail
  }
}

app.whenReady().then(async () => {
  try {
    const pngPath = path.join(buildDir, 'icon.png');
    fs.writeFileSync(pngPath, await rasterize());
    packIcns(pngPath);
    console.log('Wrote build/icon.png and build/icon.icns');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
  app.quit();
});
