// Full overlay interaction test: sends REAL input events (mouseDown/move/up)
// to the overlay exactly like a user drag, and verifies:
//  1. The box div draws during drag (inline script runs)
//  2. captureBridge.region() fires on mouseup
//  3. Main receives 'clipkit-region' with the correct rect
// Uses the EXACT webPreferences + overlay HTML structure from main.js.
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '..');

let overlay = null;
let regionReceived = null;
let cancelReceived = false;

const overlayHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;overflow:hidden;background:transparent;cursor:crosshair;-webkit-user-select:none;user-select:none}
  #box{position:fixed;display:none;border:2px solid #fff;background:rgba(225,29,72,0.10);z-index:2;pointer-events:none}
</style></head><body>
  <div id="box"></div>
  <script>
    const box=document.getElementById('box');
    let sx=0,sy=0,drawing=false;
    document.addEventListener('mousemove',e=>{if(!drawing)return;const x=Math.min(sx,e.clientX),y=Math.min(sy,e.clientY),w=Math.abs(e.clientX-sx),h=Math.abs(e.clientY-sy);box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px'});
    document.addEventListener('mousedown',e=>{sx=e.clientX;sy=e.clientY;drawing=true;box.style.display='block';box.style.left=sx+'px';box.style.top=sy+'px';box.style.width='0px';box.style.height='0px'});
    document.addEventListener('mouseup',e=>{if(!drawing)return;drawing=false;const x=Math.min(sx,e.clientX),y=Math.min(sy,e.clientY),w=Math.abs(e.clientX-sx),h=Math.abs(e.clientY-sy);if(w<3||h<3){window.captureBridge.cancel();return} window.captureBridge.region(x,y,w,h)});
  </script>
</body></html>`;

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
    overlay.setAlwaysOnTop(true, 'screen-saver');

    ipcMain.on('clipkit-region', (e, rect) => { regionReceived = rect; });
    ipcMain.on('clipkit-cancel', () => { cancelReceived = true; });

    await overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml));
    await new Promise((r) => setTimeout(r, 200));

    // Simulate a real user drag: down at (100,100), move to (400,300), up.
    overlay.webContents.sendInputEvent({ type: 'mouseDown', x: 100, y: 100, button: 'left', clickCount: 1 });
    overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 300, button: 'left', buttons: 1 });
    overlay.webContents.sendInputEvent({ type: 'mouseUp', x: 400, y: 300, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 300));

    const boxState = await overlay.webContents.executeJavaScript(`({
      display: document.getElementById('box').style.display,
      left: document.getElementById('box').style.left,
      width: document.getElementById('box').style.width
    })`);

    console.log('OVERLAY: box after drag =', JSON.stringify(boxState));
    console.log('OVERLAY: main received region =', JSON.stringify(regionReceived));
    console.log('OVERLAY: cancel received =', cancelReceived);

    const ok = regionReceived && regionReceived.x === 100 && regionReceived.y === 100 &&
               regionReceived.w === 300 && regionReceived.h === 200;
    console.log(ok ? 'OVERLAY INTERACTION: PASS' : 'OVERLAY INTERACTION: FAIL');
    app.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('OVERLAY INTERACTION: ERROR', e);
    app.exit(2);
  }
});
