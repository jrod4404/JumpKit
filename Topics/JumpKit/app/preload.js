const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openUrl:           (url, isShared)   => ipcRenderer.invoke('open-url', url, isShared),
  syncJumps:         (payload)         => ipcRenderer.invoke('sync-jumps', payload),
  getSyncState:      (userId, key)     => key === undefined
    ? ipcRenderer.invoke('get-sync-state', userId)
    : ipcRenderer.invoke('get-sync-state-scoped', userId, key),
  upsertSharedJumps: (jumps)           => ipcRenderer.invoke('upsert-shared-jumps', jumps),
  deleteSharedJumps: (userId, ids)     => ipcRenderer.invoke('delete-shared-jumps', userId, ids),
  updateSyncState:   (userId, key, value) => value === undefined
    ? ipcRenderer.invoke('update-sync-state', userId, key)
    : ipcRenderer.invoke('update-sync-state', userId, key, value),
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
  logClick:          (userId, jumpId, ts, jumpName) => ipcRenderer.invoke('log-click', userId, jumpId, ts, jumpName),
  logClickName:      (userId, id, jumpName) => ipcRenderer.invoke('log-click-name', userId, id, jumpName),
  getPrefs:          (userId)          => ipcRenderer.invoke('get-prefs', userId),
  savePrefs:         (userId, prefs)   => ipcRenderer.invoke('save-prefs', userId, prefs),
  saveRecoverySnapshot:   (userId, snapshot) => ipcRenderer.invoke('save-recovery-snapshot', userId, snapshot),
  getRecoverySnapshot:    (userId)           => ipcRenderer.invoke('get-recovery-snapshot', userId),
  deleteRecoverySnapshot: (userId)           => ipcRenderer.invoke('delete-recovery-snapshot', userId),
  seedNewUser:       (userId, platform) => ipcRenderer.invoke('seed-new-user', userId, platform),
  migrateUserId:     (oldId, newId)     => ipcRenderer.invoke('migrate-user-id', oldId, newId),

  secureAuthGet:    (key)        => ipcRenderer.invoke('secure-auth-get', key),
  secureAuthSet:    (key, value) => ipcRenderer.invoke('secure-auth-set', key, value),
  secureAuthRemove: (key)        => ipcRenderer.invoke('secure-auth-remove', key),

  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', cb),

  platform:   process.platform,
  isElectron: true,
  isPackaged: () => ipcRenderer.invoke('is-packaged'),
  exportPDF:  (html) => ipcRenderer.invoke('export-pdf', html),

  // Release testing file helpers
  showReleaseTestingDialog: (version, osPart) => ipcRenderer.invoke('show-release-testing-dialog', version, osPart),
  openFileDialog: (opts) => ipcRenderer.invoke('open-file-dialog', opts),
  checkMigrations: (filenames)         => ipcRenderer.invoke('check-migrations', filenames),
  readFile:        (filePath)          => ipcRenderer.invoke('read-file', filePath),
  writeFileDirect: (filePath, content) => ipcRenderer.invoke('write-file-direct', filePath, content),
  getAppVersion:   ()                  => ipcRenderer.invoke('get-app-version'),
  getLatestCommitId:          () => ipcRenderer.invoke('get-latest-commit-id'),
  checkAdminFilesExcluded:    () => ipcRenderer.invoke('check-admin-files-excluded'),
  readBuildConfig:            () => ipcRenderer.invoke('read-build-config'),
});
