const fs = require('node:fs');
const path = require('node:path');

/**
 * Call onChange (debounced) whenever filePath is written, replaced, created or
 * deleted. Returns { alive, close() }: `alive` is false when watching could not
 * start (folder missing) or has stopped (folder deleted), so callers can retry.
 *
 * Watches the parent directory, not the file: editors that save atomically
 * (write a temp file, rename it over the original) replace the file's inode,
 * and a watch on the old inode goes silent after the first save. Watching the
 * directory also lets a not-yet-existing file be picked up when it appears.
 * Pass a canonical path (see realPath in fileLoader.js): names are compared
 * exactly, as the file system reports them.
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

  // The folder itself is gone (e.g. git checkout). macOS reports that only as
  // an event named after the folder, never as an 'error', so check for it.
  const stopIfFolderGone = () => {
    if (fs.existsSync(dir)) return;
    handle.close();
    onChange(); // let the caller re-check the file now
  };

  try {
    watcher = fs.watch(dir, (_eventType, changed) => {
      // Some platforms omit the filename; then we can't filter, so assume it's ours.
      if (changed && changed !== name) {
        stopIfFolderGone();
        return;
      }
      // One save produces a burst of events; collapse them into one reload.
      clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    });
  } catch {
    return handle; // folder doesn't exist or isn't readable: dead, but harmless
  }

  handle.alive = true;
  // Other platforms may surface a deleted folder as an error instead.
  watcher.on('error', () => {
    handle.close();
    onChange();
  });
  return handle;
}

module.exports = { watchFile };
