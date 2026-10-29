const fs = require('node:fs');
const path = require('node:path');

/**
 * Call onChange when filePath changes, appears or disappears.
 * Watches the folder so atomic saves (write, then rename) still fire. Returns { alive, close }.
 */
function watchFile(filePath, onChange, { debounceMs = 100 } = {}) {
  const name = path.basename(filePath);
  const dir = path.dirname(filePath);
  let timer = null;
  let watcher = null;

  const handle = {
    alive: false,
    close() {
      handle.alive = false;
      clearTimeout(timer);
      watcher?.close();
    },
  };

  // Folder deleted (e.g. git checkout): macOS only sends an event named after it.
  const stopIfFolderGone = () => {
    if (fs.existsSync(dir)) return;
    handle.close();
    onChange(); // let the caller re-check
  };

  try {
    watcher = fs.watch(dir, (_eventType, changed) => {
      // No filename on some platforms: assume it's ours.
      if (changed && changed !== name) {
        stopIfFolderGone();
        return;
      }
      // collapse a save's burst of events
      clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    });
  } catch {
    return handle; // folder missing: dead but harmless
  }

  handle.alive = true;
  // Some platforms report a deleted folder as an error.
  watcher.on('error', () => {
    handle.close();
    onChange();
  });
  return handle;
}

module.exports = { watchFile };
