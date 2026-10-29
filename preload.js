const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Pass the payload only: the IPC event's sender would expose ipcRenderer.
function subscribe(channel, callback) {
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
}

contextBridge.exposeInMainWorld('lightmd', {
  onRender: (callback) => subscribe('document:render', callback),
  onError: (callback) => subscribe('document:error', callback),
  openFile: (filePath) => ipcRenderer.send('document:open', filePath),
  onViewCommand: (callback) => subscribe('view:command', callback),
  reportViewState: (view) => ipcRenderer.send('view:state', view),
  // Replaces File.path, removed in Electron 32.
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
