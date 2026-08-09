// PostKit — preload (context bridge)
// The renderer talks to the PostKit server over HTTP (localhost:8788),
// so no IPC bridge is required. This file exists to keep the Electron
// security posture explicit and to host any future safe bridges.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('postkitEnv', {
  appVersion: process.env.npm_package_version || '1.0.0',
  isElectron: true,
});
