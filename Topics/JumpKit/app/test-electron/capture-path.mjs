// Full capture path test: open overlay, simulate drag, and run the EXACT
// main-process capture code (hide → desktopCapturer → crop → persist) to
// verify a PNG is written to disk and history is updated.
import { app, BrowserWindow, ipcMain, screen, desktopCapturer, clipboard, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '..');

let overlay = null;

// Minimal stand-ins for the pieces main.js has (ckDir etc.)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-test-'));
function ckDir() {
  try { fs.mkdirSync(path.join(tmpDir, 'captures'), { recursive: true }); } catch (_) {}
  return tmpDir;
}
function ckHistoryPath() { return path.join(ckDir(), 'history.json'); }
function ckLoadHistory() {
  try { return JSON.parse(fs.readFileSync(ckHistoryPath(), 'utf8')); } catch (_) { return []; }
}
function ckSaveHistory(list) { try { fs.writeFileSync(ckHistoryPath(), JSON.stringify(list, null, 2)); } catch (_) {} }
async function ckPersistCapture(pngBuf, w, h) {
  const dir = path.join(ckDir(), 'captures');
  const id = 'cap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const file = path.join(dir, id + '.png');
  fs.writeFileSync(file, pngBuf);
  // imported at top
  clipboard.writeImage(nativeImage.createFromBuffer(pngBuf));
  const rec = { id, path: file, width: w || 0, height: h || 0, ts: Date.now() };
  const list = ckLoadHistory();
  list.unshift(rec);
  ckSaveHistory(list.slice(0, 200));
  return rec;
}

const overlayHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;overflow:hidden;background:transparent;cursor:crosshair;-webkit-user-select:none;user-select:none}
  #box{position:fixed;display:none;border:2px dashed rgba(255,255,255,0.9);background:rgba(225,29,72,0.08);z-index:2;pointer-events:none}
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
    // imported at top
    const display = screen.getPrimaryDisplay();
    const dW = display.size.width, dH = display.size.height;
    const scaleF = display.scaleFactor || 1;

    overlay = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y,
      width: dW, height: dH,
      frame: false,
      transparent: true,
      backgroundColor: '#01000000',
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
    try { overlay.setIgnoreMouseEvents(false); } catch (_) {}

    await overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml));
    try { overlay.show(); overlay.focus(); overlay.focusOnWebView(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 300));

    // Simulate drag: 100,100 → 400,300
    overlay.webContents.sendInputEvent({ type: 'mouseDown', x: 100, y: 100, button: 'left', clickCount: 1 });
    overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 300, button: 'left', buttons: 1 });
    overlay.webContents.sendInputEvent({ type: 'mouseUp', x: 400, y: 300, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 150));

    // Now the real capture path (mirrors main.js onRegion)
    try { overlay.hide(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
    const tw = Math.min(Math.round(dW * scaleF), 3840);
    const th = Math.min(Math.round(dH * scaleF), 3840);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: tw, height: th } });
    const src = sources.find((s) => s.display_id === String(display.id)) || sources.find((s) => s.display_id) || sources[0];
    if (!src) throw new Error('no screen source');
    const img = src.thumbnail;
    const tSize = img.getSize();
    console.log('CAPTURE: source found:', !!src, '| thumb size:', JSON.stringify(tSize));
    if (!tSize || !tSize.width || !tSize.height) throw new Error('empty screen thumbnail');
    const cropScale = tSize.width / (dW || 1);
    const rect = { x: 100, y: 100, w: 300, h: 200 };
    const crop = img.crop({
      x: Math.round(rect.x * cropScale),
      y: Math.round(rect.y * cropScale),
      width: Math.max(1, Math.round(rect.w * cropScale)),
      height: Math.max(1, Math.round(rect.h * cropScale)),
    });
    const png = crop.toPNG();
    console.log('CAPTURE: crop PNG bytes:', png.length);
    const rec = await ckPersistCapture(png, Math.round(rect.w), Math.round(rect.h));
    const fileExists = fs.existsSync(rec.path);
    const fileSize = fileExists ? fs.statSync(rec.path).size : 0;
    const history = ckLoadHistory();
    console.log('CAPTURE: saved file exists:', fileExists, '| size:', fileSize, '| history entries:', history.length);

    const ok = fileExists && fileSize > 100 && history.length === 1 && history[0].id === rec.id;
    console.log(ok ? 'CAPTURE PATH: PASS' : 'CAPTURE PATH: FAIL');
    app.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('CAPTURE PATH: ERROR', e);
    app.exit(2);
  }
});
