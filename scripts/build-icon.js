// build/icon.svg -> icon.png (1024 px) + icon.icns:
// rasterized by Electron, packed with macOS sips and iconutil. Run: npm run icon

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');

const SIZE = 1024;
const buildDir = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');

// [points, scale] for every size in an .icns
const ICONSET = [16, 32, 128, 256, 512].flatMap((pt) => [[pt, 1], [pt, 2]]);

async function rasterize() {
  // Offscreen renders at scale 1: 1024 CSS px = 1024 px on any display.
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
    const iconset = path.join(tmp, 'icon.iconset'); // iconutil needs this suffix
    fs.mkdirSync(iconset);
    for (const [pt, scale] of ICONSET) {
      const px = String(pt * scale);
      const name = `icon_${pt}x${pt}${scale === 2 ? '@2x' : ''}.png`;
      execFileSync('sips', ['-z', px, px, pngPath, '--out', path.join(iconset, name)], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true }); // even on failure
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
