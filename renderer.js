// UI logic. Runs sandboxed with no Node access: everything outside this page
// goes through the window.lightmd bridge from preload.js.

const landing = document.getElementById('landing');
const article = document.getElementById('document');
const banner = document.getElementById('banner');
const dropOverlay = document.getElementById('drop-overlay');

let currentPath = null;

// --- Rendering -------------------------------------------------------------

// marked emits URLs relative to the .md file, but this page lives in the app
// folder. Rewrite them against the file's folder before anything loads.
function resolveUrl(value, baseUrl) {
  if (!value || value.startsWith('#')) return value; // in-page anchor
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value; // malformed: leave it be rather than fail the whole render
  }
}

function resolveRelativeUrls(fragment, baseUrl) {
  // Covers img/source/video/audio src, a/area href and video poster.
  for (const attr of ['src', 'href', 'poster']) {
    for (const el of fragment.querySelectorAll(`[${attr}]`)) {
      el.setAttribute(attr, resolveUrl(el.getAttribute(attr), baseUrl));
    }
  }
  // srcset is a list: "url [descriptor], url [descriptor]", e.g. in <picture>.
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

// The <pre> scrolls sideways for wide code, so the button sits on a wrapper
// around it instead; otherwise it would scroll out of view with the code.
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

// One listener for every button, including ones added by later re-renders.
article.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-button');
  if (!button) return;

  // marked ends every code block with a newline; leave it out of the copy.
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

window.lightmd.onRender(({ filePath, baseUrl, html }) => {
  const sameFile = filePath === currentPath;
  const scrollY = window.scrollY;

  // A <template> parses HTML without loading images, so URLs are fixed first.
  const template = document.createElement('template');
  template.innerHTML = html;
  resolveRelativeUrls(template.content, baseUrl);
  addCopyButtons(template.content);
  article.replaceChildren(template.content);

  currentPath = filePath;
  hideBanner();
  landing.hidden = true;
  article.hidden = false;

  // Live reload of the same file keeps your place; a new file starts at the top.
  // Images above have no height yet, so this can be clamped at first, but
  // Chromium's scroll anchoring restores the position as they load. Measured:
  // a second scrollTo after the images load fights it and lands off target.
  window.scrollTo(0, sameFile ? scrollY : 0);
});

window.lightmd.onError(({ message, waiting }) => {
  // A watched missing file is "not there yet", not a failure: LightEdit opens
  // missing files too. main.js only sets `waiting` when it really is watching.
  if (waiting) {
    showBanner('waiting', `${message}. LightMD will show it as soon as it exists.`);
  } else {
    showBanner('error', message);
  }
  // Whatever was on screen (landing page or last good render) stays visible.
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

// dragenter/dragleave fire for every child element crossed, so count depth
// instead of toggling on each event.
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

// Without preventDefault here, Chromium navigates the window to the dropped file.
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
