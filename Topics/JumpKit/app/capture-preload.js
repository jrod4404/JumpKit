// Capture overlay preload: expose a bridge to send the chosen region to main.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('captureBridge', {
  region: (x, y, w, h) => ipcRenderer.send('clipkit-region', { x, y, w, h }),
});
