// Page logic. Sandboxed: everything outside goes through window.lightmd (preload.js).

const landing = document.getElementById('landing');
const workspace = document.getElementById('workspace');
const sourcePane = document.getElementById('source-pane');
const previewPane = document.getElementById('preview-pane');
const divider = document.getElementById('divider');
const article = document.getElementById('document');
const banner = document.getElementById('banner');
const dropOverlay = document.getElementById('drop-overlay');

let currentPath = null;
let currentSource = '';
let currentLineCount = 1; // counted like marked and CodeMirror: \r\n, \r or \n

// --- Rendering -------------------------------------------------------------

// marked emits URLs relative to the .md file; resolve them before anything loads.
function resolveUrl(value, baseUrl) {
  if (!value || value.startsWith('#')) return value; // in-page anchor
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value; // malformed: keep as is
  }
}

function resolveRelativeUrls(fragment, baseUrl) {
  // img/source/video/audio src, a/area href, video poster
  for (const attr of ['src', 'href', 'poster']) {
    for (const el of fragment.querySelectorAll(`[${attr}]`)) {
      el.setAttribute(attr, resolveUrl(el.getAttribute(attr), baseUrl));
    }
  }
  // srcset: "url descriptor, url descriptor"
  for (const el of fragment.querySelectorAll('[srcset]')) {
    const candidates = el.getAttribute('srcset').split(',').map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/);
      return [resolveUrl(url, baseUrl), ...descriptor].join(' ');
    });
    el.setAttribute('srcset', candidates.join(', '));
  }
}

// --- Copy buttons on code blocks ----------------------------------------------

const COPY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="1.75" width="9" height="9" rx="1.75"/><path d="M2.75 5.5v7.25c0 .97.78 1.75 1.75 1.75h7.25"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.25 3.25L13 5"/></svg>';
const copyResetTimers = new WeakMap();

// On a wrapper, so the button doesn't scroll away with wide code.
function addCopyButtons(fragment) {
  for (const pre of fragment.querySelectorAll('pre')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);
    wrapper.append(pre, createCopyButton());
  }
}

function createCopyButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  setCopyState(button, false);
  return button;
}

function setCopyState(button, copied) {
  button.classList.toggle('copied', copied);
  button.innerHTML = copied ? CHECK_ICON : COPY_ICON;
  button.title = copied ? 'Copied!' : 'Copy';
  button.setAttribute('aria-label', copied ? 'Copied' : 'Copy code');
}

// One listener for all buttons, including future ones.
article.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-button');
  if (!button) return;

  // drop marked's trailing newline
  const code = button.parentElement.querySelector('pre').textContent.replace(/\n$/, '');
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    button.title = 'Copy failed';
    return;
  }
  setCopyState(button, true);
  clearTimeout(copyResetTimers.get(button));
  copyResetTimers.set(button, setTimeout(() => setCopyState(button, false), 1500));
});

window.lightmd.onRender(({ filePath, baseUrl, html, source }) => {
  const sameFile = filePath === currentPath;
  const previewScroll = previewPane.scrollTop;

  // <template> parses without loading images, so URLs are fixed first.
  const template = document.createElement('template');
  template.innerHTML = html;
  resolveRelativeUrls(template.content, baseUrl);
  addCopyButtons(template.content);
  article.replaceChildren(template.content);

  currentPath = filePath;
  currentSource = source;
  currentLineCount = source.split(/\r\n|\r|\n/).length;
  hideBanner();
  landing.hidden = true;
  workspace.hidden = false;

  // Same file keeps its place, a new one starts at the top. Chromium's scroll
  // anchoring corrects for loading images; a second restore would fight it.
  previewPane.scrollTop = sameFile ? previewScroll : 0;

  sourceView?.setText(source, { keepScroll: sameFile });
  blocks = null; // re-measured on the next sync
  // In split view the preview follows the source, not its old pixel offset.
  if (sameFile && sourceView) syncPreview(sourceView.topLine());
  // Keyboard scrolling needs a focused scroller now that the page itself doesn't scroll.
  if (document.activeElement === document.body) previewPane.focus({ preventScroll: true });
});

window.lightmd.onError(({ message, waiting }) => {
  // Missing but watched: "not there yet", not a failure (as in LightEdit).
  if (waiting) {
    showBanner('waiting', `${message}. LightMD will show it as soon as it exists.`);
  } else {
    showBanner('error', message);
  }
  // The current view (landing or last render) stays.
});

function showBanner(kind, text) {
  banner.dataset.kind = kind;
  banner.textContent = text;
  banner.title = kind === 'error' ? 'Click to dismiss' : '';
  banner.hidden = false;
}

function hideBanner() {
  banner.hidden = true;
}

banner.addEventListener('click', () => {
  if (banner.dataset.kind === 'error') hideBanner();
});

// --- Drag and drop -----------------------------------------------------------

// dragenter/dragleave fire per child element, so track depth.
let dragDepth = 0;

function isFileDrag(event) {
  return event.dataTransfer?.types.includes('Files');
}

function setDragging(active) {
  document.body.classList.toggle('dragging', active);
  dropOverlay.hidden = !active || currentPath === null;
}

window.addEventListener('dragenter', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  if (dragDepth++ === 0) setDragging(true);
});

window.addEventListener('dragleave', (event) => {
  if (!isFileDrag(event)) return;
  if (--dragDepth === 0) setDragging(false);
});

// Without this, Chromium navigates to the dropped file.
window.addEventListener('dragover', (event) => {
  if (isFileDrag(event)) event.preventDefault();
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  setDragging(false);

  const [file] = event.dataTransfer.files;
  if (!file) return;
  const filePath = window.lightmd.getPathForFile(file);
  if (filePath) window.lightmd.openFile(filePath);
});

// --- Split view -----------------------------------------------------------------
// Like PyCharm: source, split or preview; the preview follows the source.

let sourceView = null; // loaded on first use
let sourceViewLoading = null;
let autoScroll = true;
let blocks = null; // [{ line, top }] for scroll sync; null = measure on next use

// The ~500 KB CodeMirror bundle loads on first use, not at launch.
function loadSourceView() {
  sourceViewLoading ??= new Promise((resolve, reject) => {
    if (window.LightMDSource) return resolve(window.LightMDSource.createSourceView(sourcePane));
    const script = document.createElement('script');
    script.src = 'vendor/source-view.js';
    script.onload = () => {
      try {
        resolve(window.LightMDSource.createSourceView(sourcePane));
      } catch (err) {
        reject(err); // e.g. a stale bundle: never leave the promise pending
      }
    };
    script.onerror = () => reject(new Error('vendor/source-view.js is missing'));
    document.head.append(script);
  }).then((view) => {
    sourceView = view;
    view.setText(currentSource, { keepScroll: false });
    view.onTopLineChange(syncPreview);
    if (workspace.dataset.mode === 'source') view.focus();
    syncPreview(view.topLine());
    return view;
  });
  return sourceViewLoading;
}

function setMode(mode) {
  workspace.dataset.mode = mode;
  for (const button of document.querySelectorAll('[data-mode-button]')) {
    button.setAttribute('aria-pressed', String(button.dataset.modeButton === mode));
  }
  if (mode === 'preview') {
    previewPane.focus({ preventScroll: true });
  } else if (sourceView) {
    if (mode === 'source') sourceView.focus();
    syncPreview(sourceView.topLine()); // line the preview up on entering split
  } else {
    loadSourceView().catch((err) => {
      console.error('lightmd: source view failed to load', err);
      // Usually the app was replaced while open (its bundle loads lazily), or vendor/ isn't built.
      showBanner('error', 'The source view could not load. If LightMD was just updated, restart it; otherwise run `npm run build`.');
      sourceViewLoading = null; // allow a retry
      setMode('preview');
    });
  }
  reportViewState();
}

function toggleOrientation() {
  const vertical = workspace.dataset.orientation === 'vertical';
  workspace.dataset.orientation = vertical ? 'horizontal' : 'vertical';
  divider.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  reportViewState();
}

function toggleAutoScroll() {
  autoScroll = !autoScroll;
  document.getElementById('autoscroll-button').setAttribute('aria-pressed', String(autoScroll));
  if (autoScroll && sourceView) syncPreview(sourceView.topLine());
  reportViewState();
}

// Lets main.js tick the View menu items for the focused window.
function reportViewState() {
  const { mode, orientation } = workspace.dataset;
  window.lightmd.reportViewState({ mode, orientation, autoScroll });
}


// Top-level [data-line] block positions in the preview, plus an end marker.
function measureBlocks() {
  const origin = previewPane.getBoundingClientRect().top - previewPane.scrollTop;
  const measured = [...article.querySelectorAll(':scope > [data-line], :scope > .code-block > [data-line]')].map((el) => ({
    line: Number(el.dataset.line),
    top: el.getBoundingClientRect().top - origin,
  }));
  const end = { line: currentLineCount + 1, top: article.getBoundingClientRect().bottom - origin };
  return window.LightMDScrollMap.cleanBlocks(measured, end);
}

// One way, like PyCharm: the source drives the preview. Measures lazily.
function syncPreview(line) {
  if (!autoScroll || workspace.dataset.mode !== 'split') return;
  blocks ??= measureBlocks();
  previewPane.scrollTop = window.LightMDScrollMap.offsetForLine(blocks, line);
}

// Any size change (images loading, divider, mode, orientation) moves the blocks:
// mark them stale, then re-sync once resizing settles (not on every drag frame).
let resizeTimer = 0;
new ResizeObserver(() => {
  blocks = null;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => sourceView && syncPreview(sourceView.topLine()), 100);
}).observe(article);

document.querySelector('.view-toolbar').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.modeButton) setMode(button.dataset.modeButton);
  else if (button.id === 'orientation-button') toggleOrientation();
  else if (button.id === 'autoscroll-button') toggleAutoScroll();
});

// View menu commands (main.js).
window.lightmd.onViewCommand((command) => {
  if (command.startsWith('mode:')) setMode(command.slice('mode:'.length));
  else if (command === 'toggle-orientation') toggleOrientation();
  else if (command === 'toggle-autoscroll') toggleAutoScroll();
});

// Divider: drag to resize (20–80%), double-click to reset.
divider.addEventListener('pointerdown', (event) => {
  divider.setPointerCapture(event.pointerId);
  workspace.classList.add('resizing');
});

divider.addEventListener('pointermove', (event) => {
  if (!divider.hasPointerCapture(event.pointerId)) return;
  const rect = workspace.getBoundingClientRect();
  const vertical = workspace.dataset.orientation === 'vertical';
  const share = vertical ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width;
  workspace.style.setProperty('--split', `${Math.min(80, Math.max(20, share * 100))}%`);
});

divider.addEventListener('lostpointercapture', () => workspace.classList.remove('resizing'));
divider.addEventListener('dblclick', () => workspace.style.setProperty('--split', '50%'));

setMode('preview');
