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

// Per window: filePath (null = landing), pendingPath (file being loaded),
// watcher, loads (drops stale loads), ready (index.html loaded), view (split state).
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

  // Loads await this (IPC before page load is lost); false if the page fails or closes.
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

  // Keep the window on index.html; links and stray drops go to handleLink.
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

// keepCurrentOnError (drops, links): a bad target keeps the current document.
// Launches and reloads switch anyway, so a missing file can appear later.
async function showFile(win, requestedPath, { keepCurrentOnError = false } = {}) {
  const doc = documents.get(win);
  if (!doc) return; // window already closed
  const filePath = realPath(requestedPath);
  const load = ++doc.loads;
  const result = await loadMarkdownFile(filePath);
  if (!(await doc.ready) || load !== doc.loads) return; // window gone or superseded

  if (!result.ok && keepCurrentOnError) {
    // Not watched, so don't promise it will appear.
    return sendError(win, filePath, result, { waiting: false });
  }

  // Re-watch on a new file or a dead watcher (folder missing, or recreated by git).
  if (doc.filePath !== filePath || !doc.watcher?.alive) {
    doc.watcher?.close();
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
  win.webContents.send('document:render', { filePath, baseUrl, html: render(result.content), source: result.content });
  logFirstRender();
}

// waiting: missing but watched, so it renders once created.
function sendError(win, filePath, { code, message }, { waiting }) {
  win.webContents.send('document:error', { filePath, code, message, waiting });
}

function handleLink(win, url) {
  const { protocol } = new URL(url);
  if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
    shell.openExternal(url);
  } else if (protocol === 'file:') {
    // Relative .md links open here; other file links are ignored.
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

// What a window shows or is loading; null = empty.
function targetOf(doc) {
  return doc.pendingPath ?? doc.filePath;
}

// Every route ends here: CLI, relaunch, Finder, Dock.
function openPath(requestedPath) {
  const filePath = realPath(requestedPath);
  for (const [win, doc] of documents) {
    if (targetOf(doc) === filePath) return focusWindow(win);
  }
  // Reuse an empty landing window.
  for (const [win, doc] of documents) {
    if (targetOf(doc) === null) {
      doc.pendingPath = filePath;
      focusWindow(win);
      return showFile(win, filePath);
    }
  }
  createWindow(filePath);
}

// This launch, or one forwarded by a second instance.
function openRequested(files) {
  if (files.length) return files.forEach(openPath);

  // No file: focus an existing window rather than add an empty one.
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

function sendViewCommand(win, command) {
  win?.webContents.send('view:command', command);
}

const VIEW_MODES = ['source', 'split', 'preview'];

// Tick the View menu for the focused window's split-view state.
function updateViewMenu(view) {
  const menu = Menu.getApplicationMenu();
  if (!menu || !view) return;
  menu.getMenuItemById(`mode:${view.mode}`).checked = true;
  const vertical = menu.getMenuItemById('vertical-split');
  const autoScroll = menu.getMenuItemById('auto-scroll');
  vertical.checked = view.orientation === 'vertical';
  autoScroll.checked = view.autoScroll;
  vertical.enabled = autoScroll.enabled = view.mode === 'split'; // only matter in split mode
}

ipcMain.on('view:state', (event, view) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const doc = win && documents.get(win);
  const valid = VIEW_MODES.includes(view?.mode) && ['horizontal', 'vertical'].includes(view?.orientation) && typeof view?.autoScroll === 'boolean';
  if (!doc || !valid) return;
  doc.view = view;
  if (BrowserWindow.getFocusedWindow() === win) updateViewMenu(view);
});

app.on('browser-window-focus', (_event, win) => updateViewMenu(documents.get(win)?.view));

function buildMenu() {
  const isMac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        // Replaces the default View > Reload, which would blank the page.
        { label: 'Reload from Disk', accelerator: 'CmdOrCtrl+R', click: (_item, win) => reloadWindow(win) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // Split view (handled in renderer.js).
        { id: 'mode:source', type: 'radio', label: 'Source Only', accelerator: 'Alt+CmdOrCtrl+1', click: (_item, win) => sendViewCommand(win, 'mode:source') },
        { id: 'mode:split', type: 'radio', label: 'Source and Preview', accelerator: 'Alt+CmdOrCtrl+2', click: (_item, win) => sendViewCommand(win, 'mode:split') },
        { id: 'mode:preview', type: 'radio', label: 'Preview Only', accelerator: 'Alt+CmdOrCtrl+3', checked: true, click: (_item, win) => sendViewCommand(win, 'mode:preview') },
        { id: 'vertical-split', type: 'checkbox', label: 'Vertical Split', enabled: false, click: (_item, win) => sendViewCommand(win, 'toggle-orientation') },
        { id: 'auto-scroll', type: 'checkbox', label: 'Auto-Scroll Preview', checked: true, enabled: false, click: (_item, win) => sendViewCommand(win, 'toggle-autoscroll') },
        { type: 'separator' },
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

// Files to open: argv plus macOS 'open-file' (Finder, Open With, Dock). 
// argv is parsed here because only this process knows its layout;
// dev and packaged builds share the "LightMD" lock, so either may receive the other's files.
const launchFile = getFileArg(process.argv, { isDefaultApp: Boolean(process.defaultApp), cwd: process.cwd() })?.path ?? null;
const pendingFiles = launchFile ? [launchFile] : [];
let isPrimary = false;

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (isPrimary && app.isReady()) openPath(filePath);
  else pendingFiles.push(filePath);
});

function claimInstance() {
  // Another LightMD holds the lock: it gets our files, we quit.
  isPrimary = app.requestSingleInstanceLock({ files: pendingFiles });
  if (!isPrimary) app.quit();
  return isPrimary;
}

// Finder launches deliver files via 'open-file' before 'ready',
// so wait for it before claiming the lock; launches with a CLI file decide immediately.
const decideEarly = launchFile !== null || process.platform !== 'darwin';
if (decideEarly) claimInstance();

app.on('second-instance', (_event, _argv, _workingDirectory, data) => {
  openRequested(data?.files ?? []);
});

app.whenReady().then(() => {
  if (!decideEarly) claimInstance();
  if (!isPrimary) return;

  Menu.setApplicationMenu(buildMenu());
  // App menu > About LightMD (name, version and icon are automatic).
  app.setAboutPanelOptions({
    copyright: `© 2026 ${author.name}`,
    credits: [`Made by ${author.name}`, author.url.replace(/^https:\/\//, ''), author.email].join('\n'),
  });
  // Packaged builds use the bundle icon; dev would show Electron's.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
  openRequested(pendingFiles.splice(0));
});

// Quit with the last window, on macOS too: a utility, not a dock app.
app.on('window-all-closed', () => app.quit());
