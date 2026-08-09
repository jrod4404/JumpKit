// PostKit — Electron main process
// Runs the PostKit Node server (server.js) as a child process and loads
// http://localhost:8788 in a BrowserWindow. This keeps the SQLite native
// module (better-sqlite3) on the system Node runtime and preserves all
// server functionality (REST API, OAuth flows, scheduler workers, media).

const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 8788;
const APP_DIR = __dirname;
const APP_URL = `http://localhost:${PORT}`;

let mainWindow = null;
let serverProcess = null;

// ── Server lifecycle ─────────────────────────────────────────────────────
function portInUse(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 800 }, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (await portInUse(port)) return resolve(true);
      if (Date.now() - start > timeoutMs) return reject(new Error(`Server on :${port} did not start in time`));
      setTimeout(check, 300);
    };
    check();
  });
}

async function startServer() {
  // If something is already listening on the port (e.g. dev server), reuse it.
  if (await portInUse(PORT)) {
    console.log(`PostKit: server already running on :${PORT}, reusing it`);
    return null;
  }
  serverProcess = spawn('node', [path.join(APP_DIR, 'server.js')], {
    cwd: APP_DIR,
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    console.log(`PostKit: server exited with code ${code}`);
    serverProcess = null;
  });
  await waitForServer(PORT);
  return serverProcess;
}

// ── Window ───────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0d0d14', // dark bg — no white flash
    title: 'PostKit',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links (OAuth consent, YouTube) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Same for target=_blank / anchor navigation to external hosts
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_URL)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('PostKit: failed to start server:', err.message);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS convention: keep app alive until Cmd+Q, but quit when server dies
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
