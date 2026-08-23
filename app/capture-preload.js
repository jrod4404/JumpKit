// Capture overlay preload: expose a bridge to send the chosen region to main.
// Also forwards debug/log messages to main so they show in the terminal AND in
// the main app window's DevTools console (where the capture is being tested).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('captureBridge', {
  region: (x, y, w, h) => ipcRenderer.send('clipkit-region', { x, y, w, h }),
  cancel: () => ipcRenderer.send('clipkit-cancel'),
  dbg: (msg) => ipcRenderer.send('clipkit-dbg', String(msg)),
});
