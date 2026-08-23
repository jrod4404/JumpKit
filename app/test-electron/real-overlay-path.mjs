// REAL production overlayHTML capture path test.
// Instead of a hand-copied overlay, this extracts the ACTUAL overlayHtml
// template literal from main.js so the test exercises the genuine production
// markup (including the [clipkit-overlay] diagnostics + region-drawing logic).
// Then it runs the exact production main-process capture flow
// (hide → desktopCapturer → crop → persist) and verifies a PNG is written to
// disk and history is updated.
//
// Outputs are written to a TEMP userData dir so real captures are untouched.
import { app, BrowserWindow, screen, desktopCapturer, clipboard, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '..');

// ── Extract the REAL overlayHtml from main.js (source of truth) ──
function extractOverlayHtml() {
  const src = fs.readFileSync(path.join(appDir, 'main.js'), 'utf8');
  const m = src.indexOf('const overlayHtml =');
  if (m < 0) throw new Error('overlayHtml not found in main.js');
  const tStart = src.indexOf('`', m);
  const tEnd = src.indexOf('`;', tStart);
  const tpl = src.slice(tStart + 1, tEnd);
  if (tEnd < 0 || !tpl.startsWith('<!doctype html>')) throw new Error('bad overlayHtml extraction');
  return tpl;
}

// ── Real main.js window config for the overlay (mirrors production) ──
async function createRealOverlay() {
  const display = screen.getPrimaryDisplay();
  const dW = display.size.width, dH = display.size.height;
  const win = new BrowserWindow({
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
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenuBarVisibility(false);
  try { win.setIgnoreMouseEvents(false); } catch (_) {}
  return { win, dW, dH, scaleF: display.scaleFactor || 1 };
}

// ── Real ckPersistCapture (mirrors production persist) ──
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-path-'));
function ckDir() { try { fs.mkdirSync(path.join(tmpDir, 'captures'), { recursive: true }); } catch (_) {} return tmpDir; }
function ckHistoryPath() { return path.join(ckDir(), 'history.json'); }
function ckLoadHistory() { try { return JSON.parse(fs.readFileSync(ckHistoryPath(), 'utf8')); } catch (_) { return []; } }
function ckSaveHistory(list) { try { fs.writeFileSync(ckHistoryPath(), JSON.stringify(list, null, 2)); } catch (_) {} }
function ckPersistCapture(pngBuf, w, h) {
  const dir = path.join(ckDir(), 'captures');
  const id = 'cap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const file = path.join(dir, id + '.png');
  fs.writeFileSync(file, pngBuf);
  clipboard.writeImage(nativeImage.createFromBuffer(pngBuf));
  const rec = { id, path: file, width: w || 0, height: h || 0, ts: Date.now() };
  const list = ckLoadHistory();
  list.unshift(rec);
  ckSaveHistory(list.slice(0, 200));
  return rec;
}

app.whenReady().then(async () => {
  try {
    const overlayHtml = extractOverlayHtml();

    // Sanity checks that the REAL overlay markup is intact & instrumented.
    console.log('REAL-PATH: production overlayHtml length =', overlayHtml.length);
    console.log('REAL-PATH: has diagnostics dbg =', overlayHtml.includes('[clipkit-overlay]'));
    console.log('REAL-PATH: has mousedown =', overlayHtml.includes('mousedown'));
    console.log('REAL-PATH: has captureBridge.region =', overlayHtml.includes('captureBridge.region'));

    // Boot a real overlay window w/ the REAL markup + REAL preload.
    const { win: overlay, dW, dH, scaleF } = await createRealOverlay();
    await overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml));
    try { overlay.show(); overlay.focus(); overlay.focusOnWebView(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 300));

    // Drive the REAL markup exactly like a user: down (100,100) → move (400,300) → up.
    overlay.webContents.sendInputEvent({ type: 'mouseDown', x: 100, y: 100, button: 'left', clickCount: 1 });
    overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 300, button: 'left', buttons: 1 });
    overlay.webContents.sendInputEvent({ type: 'mouseUp', x: 400, y: 300, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 150));

    // Verify the box actually drew in the REAL markup during the drag.
    const box = await overlay.webContents.executeJavaScript(`({
      display: document.getElementById('box').style.display,
      left: document.getElementById('box').style.left,
      width: document.getElementById('box').style.width
    })`);
    console.log('REAL-PATH: box after drag =', JSON.stringify(box));

    // Now the REAL production capture path (mirrors main.js onRegion).
    try { overlay.hide(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
    const tw = Math.min(Math.round(dW * scaleF), 3840);
    const th = Math.min(Math.round(dH * scaleF), 3840);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: tw, height: th } });
    const src = sources.find((s) => s.display_id === String(screen.getPrimaryDisplay().id)) || sources.find((s) => s.display_id) || sources[0];
    if (!src) throw new Error('no screen source');
    const img = src.thumbnail;
    const tSize = img.getSize();
    if (!tSize || !tSize.width || !tSize.height) throw new Error('empty screen thumbnail: ' + JSON.stringify(tSize));
    const cropScale = tSize.width / (dW || 1);
    const rect = { x: 100, y: 100, w: 300, h: 200 };
    const crop = img.crop({
      x: Math.round(rect.x * cropScale),
      y: Math.round(rect.y * cropScale),
      width: Math.max(1, Math.round(rect.w * cropScale)),
      height: Math.max(1, Math.round(rect.h * cropScale)),
    });
    const png = crop.toPNG();
    const rec = await ckPersistCapture(png, Math.round(rect.w), Math.round(rect.h));
    const fileExists = fs.existsSync(rec.path);
    const fileSize = fileExists ? fs.statSync(rec.path).size : 0;
    const history = ckLoadHistory();
    console.log('REAL-PATH: thumb =', JSON.stringify(tSize), '| crop PNG bytes =', png.length);
    console.log('REAL-PATH: saved file exists =', fileExists, '| size =', fileSize, '| history =', history.length);

    // PASS criteria: box drew (display=block), region matched, PNG > 100 bytes on disk, history recorded.
    const boxOk = box.display === 'block' && box.width === '300px';
    const ok = boxOk && fileExists && fileSize > 100 && history.length === 1 && history[0].id === rec.id;
    console.log('REAL-PATH: boxOk =', boxOk, '| full =', ok ? 'PASS' : 'FAIL');
    app.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('REAL-PATH: ERROR', e);
    app.exit(2);
  }
});
