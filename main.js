const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { app, BrowserWindow, Menu, ipcMain, nativeTheme, shell } = require('electron');

const { author } = require('./package.json');
const { getFileArg, isMarkdownPath } = require('./lib/cli');
const { loadMarkdownFile, realPath } = require('./lib/fileLoader');
const { render } = require('./lib/markdown');
const { watchFile } = require('./lib/watcher');

const startedAt = Date.now();
let firstRenderLogged = false;

// One entry per open window:
//   filePath    the file it shows (null = landing page)
//   pendingPath a file on its way in, so a second open doesn't claim the same window
//   watcher     { alive, close } from watchFile
//   loads       counter, so a slow, older load can't overwrite a newer one
//   ready       resolves true once index.html has loaded, false if it never will
const documents = new Map();

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 900,
    height: 1000,
    title: 'LightMD',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d1117' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // IPC messages sent before index.html has loaded are lost; loads await this.
  // It also settles when the page fails or the window closes, so no load hangs.
  const ready = new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => resolve(true));
    win.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => isMainFrame && resolve(false));
    win.once('closed', () => resolve(false));
  });

  documents.set(win, { filePath: null, pendingPath: filePath, watcher: null, loads: 0, ready });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    documents.get(win).watcher?.close();
    documents.delete(win);
  });

  // The window only ever shows index.html. Link clicks (and stray file drops)
  // would navigate it away, so intercept them and decide here instead.
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    handleLink(win, url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    handleLink(win, url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  if (filePath) showFile(win, filePath);
  return win;
}

// keepCurrentOnError: for drops and link clicks, a bad target shouldn't replace
// the document already on screen. CLI launches and reloads do switch, so a
// missing file still becomes this window's file (and can appear later).
async function showFile(win, requestedPath, { keepCurrentOnError = false } = {}) {
  const doc = documents.get(win);
  if (!doc) return; // window already closed
  const filePath = realPath(requestedPath);
  const load = ++doc.loads;
  const result = await loadMarkdownFile(filePath);
  if (!(await doc.ready) || load !== doc.loads) return; // window gone, or a newer load started

  if (!result.ok && keepCurrentOnError) {
    // Nothing will watch a refused target, so never promise it will appear.
    return sendError(win, filePath, result, { waiting: false });
  }

  // (Re)watch when the file changes, or when the old watcher died: the folder
  // was missing at launch, or was deleted and recreated (e.g. git checkout).
  if (doc.filePath !== filePath || !doc.watcher?.alive) {
    doc.watcher?.close();
    // Fires on save, atomic replace, delete and (for a missing file) creation.
    doc.watcher = watchFile(filePath, () => showFile(win, filePath));
  }
  doc.filePath = filePath;
  doc.pendingPath = null;
  win.setTitle(path.basename(filePath));
  if (process.platform === 'darwin') win.setRepresentedFilename(filePath);

  if (!result.ok) {
    return sendError(win, filePath, result, { waiting: result.code === 'ENOENT' && doc.watcher.alive });
  }
  const baseUrl = pathToFileURL(path.dirname(filePath) + path.sep).href;
  win.webContents.send('document:render', { filePath, baseUrl, html: render(result.content) });
  logFirstRender();
}

// waiting: the file is missing but watched, so it will render once it exists.
function sendError(win, filePath, { code, message }, { waiting }) {
  win.webContents.send('document:error', { filePath, code, message, waiting });
}

function handleLink(win, url) {
  const { protocol } = new URL(url);
  if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
    shell.openExternal(url);
  } else if (protocol === 'file:') {
    // A relative link to another .md file opens in this window; anything else is ignored.
    const target = fileURLToPath(url);
    if (isMarkdownPath(target)) showFile(win, target, { keepCurrentOnError: true });
  }
}

function logFirstRender() {
  if (firstRenderLogged || app.isPackaged) return;
  firstRenderLogged = true;
  console.log(`[lightmd] first render ${Date.now() - startedAt} ms after launch`);
}

function focusWindow(win) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// What a window shows or is about to show; null only for a truly empty window.
function targetOf(doc) {
  return doc.pendingPath ?? doc.filePath;
}

// Every way a file arrives ends here: CLI, relaunch, Finder, Dock.
function openPath(requestedPath) {
  const filePath = realPath(requestedPath);
  for (const [win, doc] of documents) {
    if (targetOf(doc) === filePath) return focusWindow(win);
  }
  // An empty landing window is reused rather than left behind.
  for (const [win, doc] of documents) {
    if (targetOf(doc) === null) {
      doc.pendingPath = filePath;
      focusWindow(win);
      return showFile(win, filePath);
    }
  }
  createWindow(filePath);
}

// A launch of this instance, or one forwarded from a second instance.
function openRequested(files) {
  if (files.length) return files.forEach(openPath);

  // `lightmd` with no file while windows are open: bring one forward, don't add an empty one.
  const [existing] = documents.keys();
  existing ? focusWindow(existing) : createWindow(null);
}

function reloadWindow(win) {
  const doc = win && documents.get(win);
  if (doc?.filePath) showFile(win, doc.filePath);
}

ipcMain.on('document:open', (event, filePath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && typeof filePath === 'string') showFile(win, filePath, { keepCurrentOnError: true });
});

function buildMenu() {
  const isMac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        // Replaces Electron's default View > Reload, which would reload index.html and blank the document.
        { label: 'Reload from Disk', accelerator: 'CmdOrCtrl+R', click: (_item, win) => reloadWindow(win) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ]);
}

// Files this launch was asked to open: one from argv, plus any macOS sends as
// 'open-file' (Finder double-click, "Open With", drop on the Dock icon).
// argv is parsed here, in the process that received it: only this process
// knows its own layout (`electron . file.md` in dev vs `LightMD file.md`
// packaged), and a dev launch can be handed to the packaged app since both
// share the "LightMD" lock.
const launchFile = getFileArg(process.argv, { isDefaultApp: Boolean(process.defaultApp), cwd: process.cwd() })?.path ?? null;
const pendingFiles = launchFile ? [launchFile] : [];
let isPrimary = false;

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (isPrimary && app.isReady()) openPath(filePath);
  else pendingFiles.push(filePath);
});

function claimInstance() {
  // If another LightMD holds the lock, it receives our files and we quit.
  isPrimary = app.requestSingleInstanceLock({ files: pendingFiles });
  if (!isPrimary) app.quit();
  return isPrimary;
}

// With a file on the command line, decide right away. A Finder launch has none
// in argv: its 'open-file' arrives during startup, before 'ready', so it waits
// for 'ready' to make sure the file travels with the handoff.
const decideEarly = launchFile !== null || process.platform !== 'darwin';
if (decideEarly) claimInstance();

app.on('second-instance', (_event, _argv, _workingDirectory, data) => {
  openRequested(data?.files ?? []);
});

app.whenReady().then(() => {
  if (!decideEarly) claimInstance();
  if (!isPrimary) return;

  Menu.setApplicationMenu(buildMenu());
  // App menu > About LightMD. Name, version and icon come from the app itself.
  app.setAboutPanelOptions({
    copyright: `© 2026 ${author.name}`,
    credits: [`Made by ${author.name}`, author.url.replace(/^https:\/\//, ''), author.email].join('\n'),
  });
  // The packaged app gets its icon from the bundle; a dev run would show Electron's.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
  openRequested(pendingFiles.splice(0));
});

// A file utility, not a dock app: quit with the last window, on macOS too.
app.on('window-all-closed', () => app.quit());
