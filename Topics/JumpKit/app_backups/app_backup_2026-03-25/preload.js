const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openUrl:           (url)        => ipcRenderer.invoke('open-url', url),
  syncJumps:         (payload)    => ipcRenderer.invoke('sync-jumps', payload),
  getSyncState:      (key)        => ipcRenderer.invoke('get-sync-state', key),
  upsertSharedJumps: (jumps)      => ipcRenderer.invoke('upsert-shared-jumps', jumps),
  deleteSharedJumps: (ids)        => ipcRenderer.invoke('delete-shared-jumps', ids),
  updateSyncState:   (key, value) => ipcRenderer.invoke('update-sync-state', key, value),
  platform:  process.platform,
  homeDir:   process.env.HOME || process.env.USERPROFILE || '~',
  isElectron: true,
});
