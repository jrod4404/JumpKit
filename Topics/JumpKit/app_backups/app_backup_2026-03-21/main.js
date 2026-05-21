const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let win;
let tray;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'default',
    backgroundColor: '#0f1117',
    icon: path.join(__dirname, 'assets', 'icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // Hide menu bar on Windows/Linux
  if (process.platform !== 'darwin') win.setMenuBarVisibility(false);

  win.on('closed', () => { win = null; });
}

// Spawn a detached OS process and unref so it outlives the Electron main process
function fireAndForget(cmd, args) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

// Open URLs / local paths from renderer
ipcMain.handle('open-url', (_e, url) => {
  if (!url) return;

  const isWeb = /^(https?:\/\/|www\.)/i.test(url);
  const fullUrl = isWeb && url.startsWith('www.') ? 'https://' + url : url;

  if (process.platform === 'darwin') {
    if (isWeb) {
      // macOS: open new tab in Safari via AppleScript
      const script = `tell application "Safari" to open location "${fullUrl.replace(/"/g, '\\"')}"`;
      fireAndForget('/usr/bin/osascript', ['-e', script]);
    } else {
      // macOS: open in Finder or launch executable
      fireAndForget('/usr/bin/open', [url]);
    }
  } else if (process.platform === 'win32') {
    if (isWeb) {
      // Windows: open in default browser
      shell.openExternal(fullUrl);
    } else {
      // Windows: spawn native process — opens folder in Explorer, runs executables
      fireAndForget('cmd.exe', ['/c', 'start', '', url]);
    }
  } else {
    // Linux fallback
    shell.openExternal(isWeb ? fullUrl : url);
  }
});

app.whenReady().then(() => {
  createWindow();

  // macOS dock behavior
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
