const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Wrap a main -> renderer channel so the page gets the payload only, never the
// IPC event (whose `sender` would hand it ipcRenderer).
function subscribe(channel, callback) {
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
}

contextBridge.exposeInMainWorld('lightmd', {
  onRender: (callback) => subscribe('document:render', callback),
  onError: (callback) => subscribe('document:error', callback),
  openFile: (filePath) => ipcRenderer.send('document:open', filePath),
  // File.path was removed in Electron 32; webUtils is the supported way to get a dropped file's path.
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
