const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openUrl:           (url)             => ipcRenderer.invoke('open-url', url),
  syncJumps:         (payload)         => ipcRenderer.invoke('sync-jumps', payload),
  getSyncState:      (key)             => ipcRenderer.invoke('get-sync-state', key),
  upsertSharedJumps: (jumps)           => ipcRenderer.invoke('upsert-shared-jumps', jumps),
  deleteSharedJumps: (ids)             => ipcRenderer.invoke('delete-shared-jumps', ids),
  updateSyncState:   (key, value)      => ipcRenderer.invoke('update-sync-state', key, value),
  writeTestResults:  (content)         => ipcRenderer.invoke('write-test-results', content),
  saveBackup:        (jsonStr)         => ipcRenderer.invoke('save-backup', jsonStr),

  // SQLite data access
  getJumps:          (userId)          => ipcRenderer.invoke('get-jumps', userId),
  saveJump:          (userId, jump)    => ipcRenderer.invoke('save-jump', userId, jump),
  deleteJump:        (userId, id)      => ipcRenderer.invoke('delete-jump', userId, id),
  getColumns:        (userId)          => ipcRenderer.invoke('get-columns', userId),
  saveColumns:       (userId, cols)    => ipcRenderer.invoke('save-columns', userId, cols),
  saveColumn:        (userId, col)     => ipcRenderer.invoke('save-column', userId, col),
  getClickLog:       (userId)          => ipcRenderer.invoke('get-click-log', userId),
  logClick:          (userId, jumpId, ts) => ipcRenderer.invoke('log-click', userId, jumpId, ts),
  getPrefs:          (userId)          => ipcRenderer.invoke('get-prefs', userId),
  savePrefs:         (userId, prefs)   => ipcRenderer.invoke('save-prefs', userId, prefs),
  seedNewUser:       (userId, platform) => ipcRenderer.invoke('seed-new-user', userId, platform),

  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', cb),

  platform:   process.platform,
  homeDir:    process.env.HOME || process.env.USERPROFILE || '~',
  isElectron: true,
  isPackaged: () => ipcRenderer.invoke('is-packaged'),
});
