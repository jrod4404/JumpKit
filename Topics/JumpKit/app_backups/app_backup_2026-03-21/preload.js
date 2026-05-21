const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  platform: process.platform,
  homeDir: process.env.HOME || process.env.USERPROFILE || '~',
  isElectron: true,
});
