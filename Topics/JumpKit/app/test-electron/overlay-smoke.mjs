// Overlay smoke test: boots a real Electron window using the EXACT same
// webPreferences as the capture overlay and verifies:
//  1. capture-preload.js loads and exposes window.captureBridge
//  2. The inline overlay script can call captureBridge.region()
//  3. An IPC 'clipkit-region' message arrives in main
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '..');

let overlay = null;
let regionReceived = null;

app.whenReady().then(async () => {
  try {
    overlay = new BrowserWindow({
      x: 0, y: 0,
      width: 800,
      height: 600,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      fullscreen: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(appDir, 'capture-preload.js'),
      },
    });

    ipcMain.on('clipkit-region', (e, rect) => { regionReceived = rect; });
    ipcMain.on('clipkit-cancel', () => { console.log('OVERLAY: cancel received'); });

    const html = `<!doctype html><html><body style="background:transparent">
      <div id="box" style="position:fixed;left:10px;top:20px;width:300px;height:200px;border:2px solid #fff"></div>
      <script>
        window.__bridge = window.captureBridge ? 'EXISTS' : 'MISSING';
        window.__ipcTest = null;
        try {
          window.captureBridge.region(10, 20, 300, 200);
          window.__ipcTest = 'SENT';
        } catch (e) {
          window.__ipcTest = 'THREW: ' + e.message;
        }
      </script>
    </body></html>`;

    await overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 300));

    const result = await overlay.webContents.executeJavaScript('({ bridge: window.__bridge, ipc: window.__ipcTest })');
    console.log('OVERLAY: bridge =', result.bridge);
    console.log('OVERLAY: region call =', result.ipc);
    console.log('OVERLAY: main received region =', JSON.stringify(regionReceived));

    const ok = result.bridge === 'EXISTS' && result.ipc === 'SENT' && regionReceived && regionReceived.w === 300;
    console.log(ok ? 'OVERLAY SMOKE: PASS' : 'OVERLAY SMOKE: FAIL');
    app.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('OVERLAY SMOKE: ERROR', e);
    app.exit(2);
  }
});
