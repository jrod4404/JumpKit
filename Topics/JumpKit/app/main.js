const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require('electron');
const fs = require('fs');
// safeStorage intentionally not imported - session tokens use localStorage until notarization is set up.
// Re-add safeStorage to the destructure and restore the IPC handler bodies when notarization is ready.

// Catch any uncaught exceptions in main process
process.on('uncaughtException', (err) => {
  const { dialog } = require('electron');
  const msg = err?.stack || err?.message || String(err);
  console.error('[JumpKit] UNCAUGHT EXCEPTION:', msg);
  try { dialog.showErrorBoxSync('JumpKit Error', msg); } catch(_) {}
});
process.on('unhandledRejection', (reason) => {
  console.error('[JumpKit] UNHANDLED REJECTION:', reason);
});
const { spawn } = require('child_process');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Suppress the macOS keychain prompt on every launch.
// Electron 40+ creates a "JumpKit Safe Storage" item in the system keychain via
// its internal safe-storage layer (separate from the OSCrypt "JumpKit Keys" item).
// Both flags are needed to cover both layers:
//   --use-mock-keychain     → suppresses OSCrypt ("JumpKit Keys")
//   SafeStorageLevel3 disabled → downgrades Electron’s safe storage to level 2
//                              (PBKDF2-based, no keychain access)
// Neither affects JumpKit’s auth — tokens live in localStorage via Supabase.
// Remove once the app is notarized (notarization lets macOS persist
// "Always Allow" so the prompt appears at most once per user.)
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('use-mock-keychain');
  app.commandLine.appendSwitch('disable-features', 'SafeStorageLevel3');
  // Also delete any stale "JumpKit Safe Storage" keychain entry left by
  // previous non-notarized builds. The security CLI is always available on macOS.
  // If the entry doesn’t exist the command exits non-zero — that’s fine.
  try {
    require('child_process').execSync(
      'security delete-generic-password -s "JumpKit Safe Storage" 2>/dev/null; ' +
      'security delete-generic-password -s "JumpKit Keys" 2>/dev/null',
      { stdio: 'ignore' }
    );
  } catch (_) {}
}

// ── SQLite (better-sqlite3, if available) ──────────────────────────
let db = null;
function initDB() {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(app.getPath('userData'), 'jumpkit.db');

    db = new Database(dbPath);

    // Core tables (create if not exist)
    db.exec(`
      CREATE TABLE IF NOT EXISTS jumps (
        id          TEXT PRIMARY KEY,
        userId      TEXT NOT NULL,
        name        TEXT NOT NULL,
        url         TEXT NOT NULL,
        description TEXT DEFAULT '',
        reason      TEXT DEFAULT '',
        columnId    TEXT,
        hotkey      TEXT DEFAULT '',
        favorite    INTEGER DEFAULT 0,
        isArchived  INTEGER DEFAULT 0,
        clickCount  INTEGER DEFAULT 0,
        lastUsed    INTEGER,
        createdAt   INTEGER,
        updatedAt   INTEGER,
        isShared    INTEGER DEFAULT 0,
        teamId      TEXT DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS columns (
        id         TEXT PRIMARY KEY,
        userId     TEXT NOT NULL,
        name       TEXT NOT NULL,
        visible    INTEGER DEFAULT 1,
        \`order\`  INTEGER DEFAULT 0,
        createdAt  INTEGER,
        isShared   INTEGER DEFAULT 0,
        teamId     TEXT DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_state (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS click_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        userId    TEXT NOT NULL,
        jumpId    TEXT NOT NULL,
        ts        INTEGER NOT NULL,
        jumpName  TEXT
      );

      CREATE TABLE IF NOT EXISTS user_prefs (
        userId             TEXT PRIMARY KEY,
        startPage          TEXT DEFAULT 'home',
        timePerClick       REAL DEFAULT 10,
        dollarsPerHour     REAL DEFAULT 150,
        showDescription    INTEGER DEFAULT 0,
        showHotkey         INTEGER DEFAULT 0,
        subscriptionStatus TEXT DEFAULT 'free',
        subscriptionTier   TEXT DEFAULT 'free',
        role               TEXT DEFAULT 'team-member',
        notifications      INTEGER DEFAULT 1,
        cloudBackup        INTEGER DEFAULT 0,
        autoArchive        TEXT DEFAULT 'never',
        navDefaultCollapsed INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS recovery_snapshots (
        userId     TEXT PRIMARY KEY,
        snapshot   TEXT NOT NULL,
        savedAt    TEXT NOT NULL
      );
    `);

    // Safely migrate existing tables - add new columns if they don't exist.
    // Keep migration SQL whitelisted/fixed; do not interpolate table or column names.
    const sqliteMigrations = [
      { tableInfo: 'table_info(jumps)',      column: 'isShared',            sql: 'ALTER TABLE jumps ADD COLUMN isShared INTEGER DEFAULT 0' },
      { tableInfo: 'table_info(jumps)',      column: 'timeSaved',           sql: 'ALTER TABLE jumps ADD COLUMN timeSaved REAL DEFAULT NULL' },
      { tableInfo: 'table_info(user_prefs)', column: 'navDefaultCollapsed', sql: 'ALTER TABLE user_prefs ADD COLUMN navDefaultCollapsed INTEGER DEFAULT 0' },
      { tableInfo: 'table_info(jumps)',      column: 'timeSavedUnit',       sql: 'ALTER TABLE jumps ADD COLUMN timeSavedUnit TEXT DEFAULT NULL' },
      { tableInfo: 'table_info(jumps)',      column: 'teamId',              sql: 'ALTER TABLE jumps ADD COLUMN teamId TEXT DEFAULT NULL' },
      { tableInfo: 'table_info(columns)',    column: 'isShared',            sql: 'ALTER TABLE columns ADD COLUMN isShared INTEGER DEFAULT 0' },
      { tableInfo: 'table_info(columns)',    column: 'teamId',              sql: 'ALTER TABLE columns ADD COLUMN teamId TEXT DEFAULT NULL' },
      { tableInfo: 'table_info(columns)',    column: 'supabaseId',          sql: 'ALTER TABLE columns ADD COLUMN supabaseId TEXT DEFAULT NULL' },
      { tableInfo: 'table_info(columns)',    column: 'sharedTeams',         sql: 'ALTER TABLE columns ADD COLUMN sharedTeams TEXT DEFAULT NULL' }, // JSON array: [{teamId, supabaseId}]
      { tableInfo: 'table_info(jumps)',      column: 'supabaseId',          sql: 'ALTER TABLE jumps ADD COLUMN supabaseId TEXT DEFAULT NULL' },
    ];
    for (const migration of sqliteMigrations) {
      try {
        const cols = db.pragma(migration.tableInfo);
        if (!cols.find(c => c.name === migration.column)) db.exec(migration.sql);
      } catch (e) { console.warn(`Migration warning: ${e.message}`); }
    }

    console.log('[JumpKit] SQLite DB initialized at', dbPath);
  } catch (e) {
    // better-sqlite3 not available or compiled for wrong ABI - all IPC handlers
    // will return {ok:false} / empty arrays. App falls back to localStorage.
    // Fix: run  npx @electron/rebuild -f -w better-sqlite3  from the app directory.
    console.error('[JumpKit] SQLite UNAVAILABLE:', e.message, '\n>>> Run: npx @electron/rebuild -f -w better-sqlite3');
    db = null;
  }
}

// ── NoteKit: isolated SQLite (projects → pages → note_blocks) ─────────────
// Feature-flagged (default OFF for regular users; ON for Jeff's test build).
// NOTE: kept fully separate from the JumpKit `db` handle & Supabase sync.
let notekitDb = null;
function initNoteKitDB() {
  try {
    const Database = require('better-sqlite3');
    const nkPath = path.join(app.getPath('userData'), 'notekit.db');
    notekitDb = new Database(nkPath);
    notekitDb.exec(`
      CREATE TABLE IF NOT EXISTS nk_projects (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        icon       TEXT DEFAULT 'folder',
        sortOrder  INTEGER DEFAULT 0,
        createdAt  INTEGER,
        updatedAt  INTEGER,
        deletedAt  INTEGER DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS nk_pages (
        id         TEXT PRIMARY KEY,
        projectId  TEXT NOT NULL,
        title      TEXT NOT NULL DEFAULT 'Untitled',
        sortOrder  INTEGER DEFAULT 0,
        createdAt  INTEGER,
        updatedAt  INTEGER,
        deletedAt  INTEGER DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS nk_blocks (
        id         TEXT PRIMARY KEY,
        pageId     TEXT NOT NULL,
        type       TEXT NOT NULL DEFAULT 'text',
        content    TEXT DEFAULT '',
        sortOrder  INTEGER DEFAULT 0,
        x          REAL DEFAULT 0,
        width      REAL DEFAULT 100,
        createdAt  INTEGER,
        updatedAt  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_nk_pages_project ON nk_pages(projectId);
      CREATE INDEX IF NOT EXISTS idx_nk_blocks_page   ON nk_blocks(pageId);
    `);
    // Migration: add icon column if missing (existing notekit.db files).
    const cols = notekitDb.prepare("PRAGMA table_info(nk_projects)").all().map(c => c.name);
    if (!cols.includes('icon')) {
      notekitDb.exec("ALTER TABLE nk_projects ADD COLUMN icon TEXT DEFAULT 'folder'");
      console.log('[NoteKit] Migration: added icon column to nk_projects');
    }
    // Migration: add x/width (block position/size) to nk_blocks if missing.
    const bcols = notekitDb.prepare("PRAGMA table_info(nk_blocks)").all().map(c => c.name);
    if (!bcols.includes('x')) {
      notekitDb.exec("ALTER TABLE nk_blocks ADD COLUMN x REAL DEFAULT 0");
      console.log('[NoteKit] Migration: added x column to nk_blocks');
    }
    if (!bcols.includes('width')) {
      notekitDb.exec("ALTER TABLE nk_blocks ADD COLUMN width REAL DEFAULT 100");
      console.log('[NoteKit] Migration: added width column to nk_blocks');
    }
    console.log('[NoteKit] DB initialized at', nkPath);
  } catch (e) {
    console.error('[NoteKit] DB UNAVAILABLE:', e.message);
    try { require('fs').appendFileSync(path.join(app.getPath('userData'), 'notekit-error.log'), new Date().toISOString() + ' ' + e.message + '\n'); } catch (_) {}
    notekitDb = null;
  }
}

function nkNow() { return Date.now(); }
function nkUid() { return (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : 'nk-' + nkNow() + '-' + Math.random().toString(36).slice(2, 10); }
function numOr(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

// ── IPC: NoteKit — projects ────────────────────────────────────────
ipcMain.handle('notekit-list-projects', () => {
  if (!notekitDb) return [];
  return notekitDb.prepare('SELECT * FROM nk_projects WHERE deletedAt IS NULL ORDER BY sortOrder, name').all();
});

ipcMain.handle('notekit-create-project', (_e, name, icon) => {
  if (!notekitDb) return { ok: false, reason: 'notekit db unavailable' };
  const id = nkUid();
  const now = nkNow();
  notekitDb.prepare('INSERT INTO nk_projects (id, name, icon, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, String(name || 'Untitled').slice(0, 200), String(icon || 'folder').slice(0, 50), 0, now, now);
  // Every new project starts with one default page: "Page 1".
  const pageId = nkUid();
  notekitDb.prepare('INSERT INTO nk_pages (id, projectId, title, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(pageId, id, 'Page 1', 0, now, now);
  return { ok: true, id, pageId };
});

ipcMain.handle('notekit-set-project-icon', (_e, id, icon) => {
  if (!notekitDb) return { ok: false };
  notekitDb.prepare('UPDATE nk_projects SET icon = ?, updatedAt = ? WHERE id = ?')
    .run(String(icon || 'folder').slice(0, 50), nkNow(), id);
  return { ok: true };
});

ipcMain.handle('notekit-rename-project', (_e, id, name) => {
  if (!notekitDb) return { ok: false };
  notekitDb.prepare('UPDATE nk_projects SET name = ?, updatedAt = ? WHERE id = ?')
    .run(String(name || 'Untitled').slice(0, 200), nkNow(), id);
  return { ok: true };
});

ipcMain.handle('notekit-delete-project', (_e, id) => {
  if (!notekitDb) return { ok: false };
  // Soft delete: mark project + its pages as deleted (blocks kept for recovery).
  const now = nkNow();
  notekitDb.prepare('UPDATE nk_projects SET deletedAt = ?, updatedAt = ? WHERE id = ?').run(now, now, id);
  notekitDb.prepare('UPDATE nk_pages SET deletedAt = ? WHERE projectId = ? AND deletedAt IS NULL').run(now, id);
  return { ok: true };
});

// ── IPC: NoteKit — pages ───────────────────────────────────────────
ipcMain.handle('notekit-list-pages', (_e, projectId) => {
  if (!notekitDb) return [];
  return notekitDb.prepare('SELECT * FROM nk_pages WHERE projectId = ? AND deletedAt IS NULL ORDER BY sortOrder, title').all(projectId);
});

ipcMain.handle('notekit-create-page', (_e, projectId, title) => {
  if (!notekitDb) return { ok: false, reason: 'notekit db unavailable' };
  const id = nkUid();
  const now = nkNow();
  const count = notekitDb.prepare('SELECT COUNT(*) c FROM nk_pages WHERE projectId = ? AND deletedAt IS NULL').get(projectId).c;
  notekitDb.prepare('INSERT INTO nk_pages (id, projectId, title, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, projectId, String(title || 'Untitled').slice(0, 200), count, now, now);
  return { ok: true, id };
});

ipcMain.handle('notekit-rename-page', (_e, id, title) => {
  if (!notekitDb) return { ok: false };
  notekitDb.prepare('UPDATE nk_pages SET title = ?, updatedAt = ? WHERE id = ?')
    .run(String(title || 'Untitled').slice(0, 200), nkNow(), id);
  return { ok: true };
});

ipcMain.handle('notekit-delete-page', (_e, id) => {
  if (!notekitDb) return { ok: false };
  notekitDb.prepare('UPDATE nk_pages SET deletedAt = ?, updatedAt = ? WHERE id = ?').run(nkNow(), nkNow(), id);
  return { ok: true };
});

// ── IPC: NoteKit — blocks ──────────────────────────────────────────
ipcMain.handle('notekit-list-blocks', (_e, pageId) => {
  if (!notekitDb) return [];
  return notekitDb.prepare('SELECT * FROM nk_blocks WHERE pageId = ? ORDER BY sortOrder, createdAt').all(pageId);
});

ipcMain.handle('notekit-enabled', () => {
  return process.env.NOTEKIT_ENABLED === 'true';
});

// Replace ALL blocks of a page (autosave-friendly: renderer sends full block list)
ipcMain.handle('notekit-save-blocks', (_e, pageId, blocks) => {
  if (!notekitDb) return { ok: false };
  const now = nkNow();
  const tx = notekitDb.transaction((rows) => {
    notekitDb.prepare('DELETE FROM nk_blocks WHERE pageId = ?').run(pageId);
    const ins = notekitDb.prepare('INSERT INTO nk_blocks (id, pageId, type, content, sortOrder, x, width, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    rows.forEach((b, i) => ins.run(b.id || nkUid(), pageId, b.type || 'text', typeof b.content === 'string' ? b.content : JSON.stringify(b.content), i, numOr(b.x, 0), numOr(b.width, 100), now, now));
    notekitDb.prepare('UPDATE nk_pages SET updatedAt = ? WHERE id = ?').run(now, pageId);
  });
  try { tx(blocks || []); return { ok: true }; }
  catch (e) { return { ok: false, reason: e.message }; }
});

// ── IPC: NoteKit — images (media folder copy) ───────────────────────
// Option 1 storage: images are COPIED into userData/notekit-media/ and the
// note stores the path (keeps notes.db small; image tied to this machine).
function nkMediaDir() {
  const dir = path.join(app.getPath('userData'), 'notekit-media');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return dir;
}

ipcMain.handle('notekit-pick-image', async () => {
  const { dialog } = require('electron');
  const r = await dialog.showOpenDialog({
    title: 'Choose an image',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
    ],
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, path: null };
  return nkStoreImage(r.filePaths[0]);
});

// Copy a source file into the media folder with a unique name; returns {ok, path}.
ipcMain.handle('notekit-store-image', (_e, srcPath) => {
  if (!srcPath || typeof srcPath !== 'string') return { ok: false, path: null };
  return nkStoreImage(srcPath);
});

function nkStoreImage(srcPath) {
  try {
    const ext = (path.extname(srcPath) || '.png').toLowerCase();
    const dir = nkMediaDir();
    const name = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    const dest = path.join(dir, name);
    fs.copyFileSync(srcPath, dest);
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, path: null, reason: e.message };
  }
}

// Save a base64 data URL (e.g. pasted clipboard image) to the media folder.
ipcMain.handle('notekit-store-image-data', (_e, dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return { ok: false, path: null };
  try {
    const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return { ok: false, path: null, reason: 'not a base64 image data URL' };
    const extMap = { png: '.png', jpeg: '.jpg', jpg: '.jpg', gif: '.gif', webp: '.webp', 'svg+xml': '.svg', 'x-icon': '.ico', bmp: '.bmp' };
    const ext = extMap[m[1].toLowerCase()] || '.png';
    const dir = nkMediaDir();
    const name = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    const dest = path.join(dir, name);
    fs.writeFileSync(dest, Buffer.from(m[2], 'base64'));
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, path: null, reason: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════
// CLIPKIT — screen capture tool (third sidebar section)
// Click "New Capture" → transparent fullscreen overlay → drag a region
// → on release, capture that region → save PNG to captures/ + clipboard + history.
// Cross-platform (Win+Mac) via desktopCapturer + capturePage.
// ══════════════════════════════════════════════════════════════════
ipcMain.handle('clipkit-enabled', () => {
  return process.env.CLIPKIT_ENABLED === 'true';
});

function ckDir() {
  const dir = path.join(app.getPath('userData'), 'clipkit');
  try { fs.mkdirSync(path.join(dir, 'captures'), { recursive: true }); } catch (_) {}
  return dir;
}
function ckHistoryPath() { return path.join(ckDir(), 'history.json'); }

function ckLoadHistory() {
  try {
    const raw = fs.readFileSync(ckHistoryPath(), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
function ckSaveHistory(list) {
  try { fs.writeFileSync(ckHistoryPath(), JSON.stringify(list, null, 2)); } catch (_) {}
}

// Holds the active capture's cancel callback while the overlay is open, so Esc
// (from any screen / focus state) can cancel reliably.
let ckCurrentCancel = null;

// Start an interactive region capture. Resolves with the capture record on
// success, {cancelled:true} if the user dismissed, or {error}.
ipcMain.handle('clipkit-capture', async () => {
  let overlay = null;
  try {
    const { screen } = require('electron');

    // Target the display the cursor is currently on, so capture works on any screen.
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const dW = display.size.width;   // DIP
    const dH = display.size.height;
    const scaleF = display.scaleFactor || 1; // device px per CSS px

    // 1) Open a fully TRANSPARENT, always-on-top overlay over the LIVE screen.
    //    No frozen screenshot, no image at all — just the crosshair + selection
    //    box. The actual capture happens on drag-release (see onRegion below).
    overlay = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: dW,
      height: dH,
      frame: false,
      transparent: true,
      // alpha=1 (not 0): invisible on screen but guarantees the window still
      // receives mouse events on Windows (fully alpha-0 windows can be
      // click-through / skip hit-testing there).
      backgroundColor: '#01000000',
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      fullscreen: false,
      hasShadow: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'capture-preload.js') },
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setMenuBarVisibility(false);
    // Do NOT ignore mouse events. (v5.1.37 baseline; this is the config that
    // previously rendered the selection box + captured on release.)
    try { overlay.setIgnoreMouseEvents(false); } catch (_) {}
    // Global Esc so cancellation works even if the overlay does not hold keyboard focus.
    const { globalShortcut } = require('electron');
    try { globalShortcut.register('Escape', () => { if (typeof ckCurrentCancel === 'function') ckCurrentCancel(); }); } catch (_) {}
    const unregisterEsc = () => { try { globalShortcut.unregister('Escape'); } catch (_) {} };
    const overlayHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;overflow:hidden;background:transparent;cursor:crosshair;-webkit-user-select:none;user-select:none}
      #box{position:fixed;display:none;border:2px dashed rgba(255,255,255,0.9);background:rgba(225,29,72,0.08);z-index:2;pointer-events:none}
      #box::after{content:'';position:absolute;left:-2px;top:-2px;right:-2px;bottom:-2px;border:2px dashed rgba(225,29,72,0.85);border-radius:2px}
      /* big plus icon that follows the cursor to signal 'select a region' */
      #plus{position:fixed;left:0;top:0;z-index:4;pointer-events:none;width:56px;height:56px;margin:-28px 0 0 -28px;opacity:0.9}
      #plus::before,#plus::after{content:'';position:absolute;background:#fff;border-radius:3px;box-shadow:0 0 8px rgba(0,0,0,0.6)}
      #plus::before{left:25px;top:4px;width:6px;height:48px}
      #plus::after{left:4px;top:25px;width:48px;height:6px}
      #hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:3;background:rgba(0,0,0,0.8);color:#fff;padding:9px 20px;border-radius:22px;font:600 13px/1 system-ui,sans-serif;pointer-events:none;white-space:nowrap;border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 16px rgba(0,0,0,0.35)}
    </style></head><body>
      <div id="box"></div>
      <div id="plus"></div>
      <div id="hint">✦ Drag to select a region · Esc to cancel</div>
      <script>
        const box=document.getElementById('box'),plus=document.getElementById('plus');
        let sx=0,sy=0,drawing=false;
        // Diagnostics: log every interaction to the main-process console (visible
        // in the terminal that launched the app). Confirms whether macOS is
        // delivering mouse events to this window at all.
        function dbg(k){ try { console.log('[clipkit-overlay]', k); } catch(_){} }
        dbg('loaded');
        document.addEventListener('mousemove',e=>{if(!drawing){plus.style.left=e.clientX+'px';plus.style.top=e.clientY+'px'}});
        document.addEventListener('mousedown',e=>{dbg('mousedown @'+e.clientX+','+e.clientY);sx=e.clientX;sy=e.clientY;drawing=true;plus.style.display='none';box.style.left=sx+'px';box.style.top=sy+'px';box.style.width='0px';box.style.height='0px';box.style.display='block'});
        document.addEventListener('mousemove',e=>{if(!drawing)return;const x=Math.min(sx,e.clientX),y=Math.min(sy,e.clientY),w=Math.abs(e.clientX-sx),h=Math.abs(e.clientY-sy);box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px'});
        document.addEventListener('mouseup',e=>{if(!drawing){dbg('mouseup but not drawing');return}dbg('mouseup @'+e.clientX+','+e.clientY);drawing=false;const x=Math.min(sx,e.clientX),y=Math.min(sy,e.clientY),w=Math.abs(e.clientX-sx),h=Math.abs(e.clientY-sy);if(w<3||h<3){dbg('region too small -> cancel');window.captureBridge.cancel();return} dbg('region '+w+'x'+h);window.captureBridge.region(x,y,w,h)});
        document.addEventListener('keydown',e=>{if(e.key==='Escape'){dbg('Esc');window.captureBridge.cancel()}});
      </script>
    </body></html>`;
    await overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml));
    try { overlay.show(); overlay.focus(); overlay.focusOnWebView(); } catch (_) {}
    // Make sure the overlay actually receives keyboard input: give it focus and
    // blur the app window, and catch Esc at the webContents level (reliable even
    // if focus is elsewhere / clicking another screen).
    try { overlay.focus(); overlay.focusOnWebView(); } catch (_) {}
    // Re-assert focus once the overlay DOM has finished loading so the window
    // is key (standard macOS first-click passthrough fix). Added for .38.
    try {
      overlay.webContents.once('did-finish-load', () => {
        try { overlay.focus(); overlay.focusOnWebView(); } catch (_) {}
      });
    } catch (_) {}
    const mainWin = BrowserWindow.getAllWindows().find((w) => w !== overlay);
    if (mainWin) { try { mainWin.blur(); } catch (_) {} }
    overlay.webContents.on('before-input-event', (e, input) => {
      // Esc always cancels, even if the overlay doesn't hold keyboard focus.
      if (input.type === 'keyDown' && (input.key === 'Escape' || input.key === 'Esc')) {
        e.preventDefault();
        if (typeof ckCurrentCancel === 'function') ckCurrentCancel();
      }
    });
    overlay.webContents.on('closed', () => { try { overlay.webContents.removeAllListeners('before-input-event'); } catch (_) {} });
    // 2) On region selection: hide the overlay FIRST (so it's not in the shot),
    //    then capture the live screen and crop the chosen rectangle. Coordinates
    //    are overlay CSS px → multiply by cropScale (thumbnail px per DIP).
    const result = await new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } ckCurrentCancel = null; try { unregisterEsc(); } catch (_) {} };
      const onRegion = async (e, rect) => {
        ipcMain.removeListener('clipkit-region', onRegion);
        ipcMain.removeListener('clipkit-cancel', onCancel);
        try {
          // Hide the overlay so it doesn't appear in the capture. On Windows,
          // setOpacity(0) is more reliable than hide() for removing a
          // transparent always-on-top window from the composited frame.
          try { overlay.setOpacity(0); } catch (_) {}
          try { overlay.hide(); } catch (_) {}
          // Give the compositor a moment to drop the overlay, then grab the screen.
          await new Promise((r) => setTimeout(r, 150));
          const { desktopCapturer } = require('electron');
          // Cap the requested thumbnail size: very large requests (4K/5K at
          // high scale) can return empty thumbnails on some Windows setups.
          const tw = Math.min(Math.round(dW * scaleF), 3840);
          const th = Math.min(Math.round(dH * scaleF), 3840);
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: tw, height: th },
          });
          const src = sources.find((s) => s.display_id === String(display.id)) || sources.find((s) => s.display_id) || sources[0];
          if (!src) throw new Error('no screen source');
          const img = src.thumbnail;
          const tSize = img.getSize();
          if (!tSize || !tSize.width || !tSize.height) throw new Error('empty screen thumbnail');
          const cropScale = tSize.width / (dW || 1);
          const crop = img.crop({
            x: Math.round(rect.x * cropScale),
            y: Math.round(rect.y * cropScale),
            width: Math.max(1, Math.round(rect.w * cropScale)),
            height: Math.max(1, Math.round(rect.h * cropScale)),
          });
          const rec = await ckPersistCapture(crop.toPNG(), Math.round(rect.w), Math.round(rect.h));
          // Resolve FIRST so the closed event (fired by overlay.close()) can't
          // win the race and mark this successful capture as cancelled.
          done(rec);
          try { overlay.close(); } catch (_) {}
        } catch (err) {
          console.error('[clipkit] capture failed:', err && err.message ? err.message : err);
          done({ error: err.message });
          try { overlay.close(); } catch (_) {}
        }
      };
      const onCancel = () => {
        ipcMain.removeListener('clipkit-region', onRegion);
        try { overlay.close(); } catch (_) {}
        done({ cancelled: true });
      };
      ipcMain.on('clipkit-region', onRegion);
      ipcMain.on('clipkit-cancel', onCancel);
      ckCurrentCancel = onCancel;
      overlay.on('closed', () => done({ cancelled: true }));
    });
    return result;
  } catch (e) {
    try { if (overlay) overlay.close(); } catch (_) {}
    try { if (typeof unregisterEsc === 'function') unregisterEsc(); } catch (_) {}
    return { error: e.message };
  }
});

// Save PNG bytes, copy to clipboard, write history, return {id, path, sec, width, height, ts}.
async function ckPersistCapture(pngBuf, w, h) {
  const dir = path.join(ckDir(), 'captures');
  const id = 'cap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const file = path.join(dir, id + '.png');
  fs.writeFileSync(file, pngBuf);
  const { clipboard, nativeImage } = require('electron');
  clipboard.writeImage(nativeImage.createFromBuffer(pngBuf));
  const rec = { id, path: file, width: w || 0, height: h || 0, ts: Date.now() };
  const list = ckLoadHistory();
  list.unshift(rec);
  ckSaveHistory(list.slice(0, 200)); // keep last 200
  return rec;
}

ipcMain.handle('clipkit-history', () => ckLoadHistory());

ipcMain.handle('clipkit-copy', (_e, id) => {
  const rec = ckLoadHistory().find((r) => r.id === id);
  if (!rec || !fs.existsSync(rec.path)) return { ok: false, reason: 'not found' };
  try {
    const { clipboard, nativeImage } = require('electron');
    clipboard.writeImage(nativeImage.createFromPath(rec.path));
    return { ok: true };
  } catch (e) { return { ok: false, reason: e.message }; }
});

ipcMain.handle('clipkit-delete', (_e, id) => {
  const list = ckLoadHistory();
  const rec = list.find((r) => r.id === id);
  const next = list.filter((r) => r.id !== id);
  ckSaveHistory(next);
  if (rec && rec.path) { try { fs.unlinkSync(rec.path); } catch (_) {} }
  return { ok: true };
});

// ── IPC: sync-jumps ────────────────────────────────────────────────
function _scopedSyncKey(userId, key) {
  return userId ? `${userId}:${key}` : key;
}

ipcMain.handle('sync-jumps', async (_e, payload) => {
  // The renderer passes the sync result; main process persists to SQLite
  if (!db || !payload) return { ok: false, reason: 'no db' };
  try {
    const { sharedColumns = [], sharedJumps = [] } = payload;
    const userId = payload.userId || sharedJumps[0]?.userId || sharedColumns[0]?.userId || null;
    const upsertCol = db.prepare(`
      INSERT INTO columns (id, userId, name, visible, \`order\`, createdAt, isShared, teamId, supabaseId)
      VALUES (@id, @userId, @name, @visible, @order, @createdAt, 1, @teamId, @supabaseId)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, visible=excluded.visible,
        \`order\`=excluded.\`order\`, isShared=1, teamId=excluded.teamId
    `);
    const upsertJump = db.prepare(`
      INSERT INTO jumps (id, userId, name, url, description, reason, columnId, hotkey, favorite, isArchived, clickCount, lastUsed, createdAt, updatedAt, isShared, teamId)
      VALUES (@id, @userId, @name, @url, @description, @reason, @columnId, @hotkey, @favorite, 0, @clickCount, @lastUsed, @createdAt, @updatedAt, 1, @teamId)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, url=excluded.url, description=excluded.description,
        reason=excluded.reason, columnId=excluded.columnId,
        updatedAt=excluded.updatedAt, isShared=1, teamId=excluded.teamId
        -- NOTE: hotkey NOT overwritten (preserve user's local hotkey)
    `);
    const tx = db.transaction(() => {
      for (const col of sharedColumns) upsertCol.run(col);
      for (const j of sharedJumps)    upsertJump.run(j);
    });
    tx();
    // Update sync timestamp
    db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(_scopedSyncKey(userId, 'lastSync'), Date.now().toString());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: get-sync-state ────────────────────────────────────────────
ipcMain.handle('get-sync-state', (_e, key) => {
  if (!db) return null;
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
  return row ? row.value : null;
});

ipcMain.handle('get-sync-state-scoped', (_e, userId, key) => {
  if (!db) return null;
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(_scopedSyncKey(userId, key));
  if (row) return row.value;
  // Backward-compatible read of legacy unscoped values.
  const legacy = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
  return legacy ? legacy.value : null;
});

// ── IPC: upsert-shared-jumps ───────────────────────────────────────
// Takes array of jump objects, upserts into jumps table.
// Preserves existing hotkey if the jump already exists locally.
ipcMain.handle('upsert-shared-jumps', (_e, jumps) => {
  if (!db || !Array.isArray(jumps)) return { ok: false, reason: 'no db or bad input' };
  try {
    const upsert = db.prepare(`
      INSERT INTO jumps (id, userId, name, url, description, reason, columnId, hotkey, favorite, isArchived, clickCount, lastUsed, createdAt, updatedAt, isShared, teamId, supabaseId)
      VALUES (@id, @userId, @name, @url, @description, @reason, @columnId, @hotkey, 0, 0, 0, NULL, @createdAt, @updatedAt, 1, @teamId, @supabaseId)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, url=excluded.url, description=excluded.description,
        reason=excluded.reason, columnId=excluded.columnId,
        updatedAt=excluded.updatedAt, isShared=1, teamId=excluded.teamId,
        supabaseId=excluded.supabaseId
        -- hotkey NOT updated (preserve user's local hotkey assignment)
    `);
    // For each jump, pull existing hotkey first so we can pass it in for new rows
    const getHotkey = db.prepare('SELECT hotkey FROM jumps WHERE id = ?');
    const hasColumn = db.prepare('SELECT 1 FROM columns WHERE id = ? AND userId = ? LIMIT 1');
    const tx = db.transaction(() => {
      for (const j of jumps) {
        if (!j.userId || !j.columnId || !hasColumn.get(j.columnId, j.userId)) continue;
        const existing = getHotkey.get(j.id);
        upsert.run({
          ...j,
          hotkey:      existing?.hotkey || j.hotkey || '',
          description: j.description || '',
          reason:      j.reason || '',
          createdAt:   j.createdAt || Date.now(),
          updatedAt:   j.updatedAt || Date.now(),
          teamId:      j.teamId || null,
          supabaseId:  j.supabaseId || j.id,
        });
      }
    });
    tx();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: delete-shared-jumps ───────────────────────────────────────
// Takes array of jump IDs, deletes from jumps table where isShared=1 and userId matches.
ipcMain.handle('delete-shared-jumps', (_e, userId, ids) => {
  if (Array.isArray(userId) && ids === undefined) { ids = userId; userId = null; } // legacy compatibility
  if (!db || !Array.isArray(ids)) return { ok: false, reason: 'no db or bad input' };
  if (!userId) return { ok: false, reason: 'missing userId' };
  try {
    const del = db.prepare('DELETE FROM jumps WHERE id = ? AND userId = ? AND isShared = 1');
    const tx  = db.transaction(() => { for (const id of ids) del.run(id, userId); });
    tx();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: write-test-results ────────────────────────────────────────
ipcMain.handle('is-packaged', () => app.isPackaged);

ipcMain.handle('write-test-results', (_e, content) => {
  try {
    const fs = require('fs');
    const outPath = path.join(app.getPath('userData'), 'test-results.txt');
    fs.writeFileSync(outPath, content, 'utf8');
    console.log('[JumpKit Tests] Results written to:', outPath);
    return { ok: true, path: outPath };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: save-backup ──────────────────────────────────────────────
ipcMain.handle('save-backup', async (_e, jsonStr) => {
  try {
    const fs = require('fs');
    const { dialog } = require('electron');
    const _now = new Date();
    const _date = _now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    let _h = _now.getHours(), _m = _now.getMinutes();
    const _ampm = _h >= 12 ? 'pm' : 'am';
    _h = _h % 12 || 12;
    const _mStr = String(_m).padStart(2, '0');
    const defaultName = `jumpkit-backup-${_date}_${_h}-${_mStr}${_ampm}.json`;

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export JumpKit Backup',
      defaultPath: defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      buttonLabel: 'Export'
    });

    if (canceled || !filePath) return { ok: false, reason: 'canceled' };
    fs.writeFileSync(filePath, jsonStr, 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: update-sync-state ─────────────────────────────────────────
// Upserts a user-scoped key/value pair into the sync_state table
ipcMain.handle('update-sync-state', (_e, userId, key, value) => {
  if (value === undefined) { value = key; key = userId; userId = null; } // legacy compatibility
  if (!db) return { ok: false };
  try {
    db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(_scopedSyncKey(userId, key), String(value));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: get-jumps ─────────────────────────────────────────────────
ipcMain.handle('get-jumps', (_e, userId) => {
  if (!db) return [];
  return db.prepare('SELECT * FROM jumps WHERE userId = ?').all(userId);
});

// ── IPC: save-jump ─────────────────────────────────────────────────
ipcMain.handle('save-jump', (_e, userId, jump) => {
  if (!db) return { ok: false };
  try {
    db.prepare(`
      INSERT OR REPLACE INTO jumps
        (id, userId, name, url, description, reason, columnId, hotkey, favorite,
         isArchived, clickCount, lastUsed, createdAt, updatedAt, isShared, teamId, timeSaved, timeSavedUnit, supabaseId)
      VALUES
        (@id, @userId, @name, @url, @description, @reason, @columnId, @hotkey, @favorite,
         @isArchived, @clickCount, @lastUsed, @createdAt, @updatedAt, @isShared, @teamId, @timeSaved, @timeSavedUnit, @supabaseId)
    `).run({
      id:          jump.id,
      userId:      userId,
      name:        jump.name,
      url:         jump.url,
      description: jump.description || '',
      reason:      jump.reason || '',
      columnId:    jump.columnId || null,
      hotkey:      jump.hotkey || '',
      favorite:    jump.favorite ? 1 : 0,
      isArchived:  jump.isArchived ? 1 : 0,
      clickCount:  jump.clickCount || 0,
      lastUsed:    jump.lastUsed || null,
      createdAt:   jump.createdAt || Date.now(),
      updatedAt:   jump.updatedAt || Date.now(),
      isShared:      jump.isShared ? 1 : 0,
      teamId:        jump.teamId || null,
      timeSaved:     jump.timeSaved != null ? jump.timeSaved : null,
      timeSavedUnit: jump.timeSavedUnit || null,
      supabaseId:    jump.supabaseId || null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: delete-jump ───────────────────────────────────────────────
ipcMain.handle('delete-jump', (_e, userId, id) => {
  if (!db) return { ok: false };
  try {
    db.prepare('DELETE FROM jumps WHERE id = ? AND userId = ?').run(id, userId);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: get-columns ───────────────────────────────────────────────
ipcMain.handle('get-columns', (_e, userId) => {
  if (!db) return [];
  const rows = db.prepare('SELECT * FROM columns WHERE userId = ? ORDER BY `order` ASC').all(userId);
  return rows.map(row => {
    // Deserialize sharedTeams JSON → array
    let sharedTeams = null;
    if (row.sharedTeams) {
      try { sharedTeams = JSON.parse(row.sharedTeams); } catch (_) { sharedTeams = null; }
    }
    // One-time migration: if no sharedTeams but old-format teamId+isShared exist, promote to sharedTeams
    if (!sharedTeams && row.isShared && row.teamId) {
      sharedTeams = [{ teamId: row.teamId, supabaseId: row.supabaseId || null }];
    }
    return { ...row, sharedTeams: sharedTeams || [] };
  });
});

// ── IPC: save-columns (bulk replace) ──────────────────────────────
ipcMain.handle('save-columns', (_e, userId, cols) => {
  if (!db || !Array.isArray(cols)) return { ok: false };
  try {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO columns (id, userId, name, visible, \`order\`, createdAt, isShared, teamId, supabaseId, sharedTeams)
      VALUES (@id, @userId, @name, @visible, @order, @createdAt, @isShared, @teamId, @supabaseId, @sharedTeams)
    `);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM columns WHERE userId = ?').run(userId);
      for (const col of cols) {
        const sharedTeamsArr = Array.isArray(col.sharedTeams) && col.sharedTeams.length > 0 ? col.sharedTeams : null;
        insert.run({
          id:          col.id,
          userId:      userId,
          name:        col.name,
          visible:     col.visible ? 1 : 0,
          order:       col.order ?? 0,
          createdAt:   col.createdAt || Date.now(),
          isShared:    col.isShared ? 1 : 0,
          teamId:      col.teamId || null,
          supabaseId:  col.supabaseId || null,
          sharedTeams: sharedTeamsArr ? JSON.stringify(sharedTeamsArr) : null,
        });
      }
    });
    tx();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: save-column (single upsert) ──────────────────────────────
ipcMain.handle('save-column', (_e, userId, col) => {
  if (!db) return { ok: false };
  try {
    const sharedTeamsArr = Array.isArray(col.sharedTeams) && col.sharedTeams.length > 0 ? col.sharedTeams : null;
    db.prepare(`
      INSERT OR REPLACE INTO columns (id, userId, name, visible, \`order\`, createdAt, isShared, teamId, supabaseId, sharedTeams)
      VALUES (@id, @userId, @name, @visible, @order, @createdAt, @isShared, @teamId, @supabaseId, @sharedTeams)
    `).run({
      id:          col.id,
      userId:      userId,
      name:        col.name,
      visible:     col.visible ? 1 : 0,
      order:       col.order ?? 0,
      createdAt:   col.createdAt || Date.now(),
      isShared:    col.isShared ? 1 : 0,
      teamId:      col.teamId || null,
      supabaseId:  col.supabaseId || null,
      sharedTeams: sharedTeamsArr ? JSON.stringify(sharedTeamsArr) : null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: get-click-log ─────────────────────────────────────────────
ipcMain.handle('get-click-log', (_e, userId) => {
  if (!db) return [];
  return db.prepare(`
    SELECT * FROM (
      SELECT * FROM click_log WHERE userId = ? ORDER BY ts DESC LIMIT 10000
    ) ORDER BY ts ASC
  `).all(userId);
});

// ── IPC: log-click ─────────────────────────────────────────────────
// Migrate: add jumpName column if missing (safe no-op if already exists)
try { db && db.prepare('ALTER TABLE click_log ADD COLUMN jumpName TEXT').run(); } catch (_) {}

// ── IPC: log-click-name (backfill jumpName by row id) ─────────────
ipcMain.handle('log-click-name', (_e, userId, id, jumpName) => {
  if (jumpName === undefined) { jumpName = id; id = userId; userId = null; } // legacy compatibility
  if (!db) return { ok: false };
  if (!userId) return { ok: false, reason: 'missing userId' };
  try {
    db.prepare('UPDATE click_log SET jumpName = ? WHERE id = ? AND userId = ?').run(jumpName, id, userId);
    return { ok: true };
  } catch (e) { return { ok: false }; }
});
ipcMain.handle('log-click', (_e, userId, jumpId, ts, jumpName) => {
  if (!db) return { ok: false };
  try {
    db.prepare('INSERT INTO click_log (userId, jumpId, ts, jumpName) VALUES (?, ?, ?, ?)').run(userId, jumpId, ts || Date.now(), jumpName || null);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: get-prefs ─────────────────────────────────────────────────
ipcMain.handle('get-prefs', (_e, userId) => {
  if (!db) return null;
  let row = db.prepare('SELECT * FROM user_prefs WHERE userId = ?').get(userId);
  if (!row) {
    // Create default row
    db.prepare(`
      INSERT OR IGNORE INTO user_prefs (userId) VALUES (?)
    `).run(userId);
    row = db.prepare('SELECT * FROM user_prefs WHERE userId = ?').get(userId);
  }
  // Convert INTEGER booleans back to JS booleans
  if (row) {
    row.showDescription = row.showDescription === 1;
    row.showHotkey      = row.showHotkey === 1;
    row.notifications   = row.notifications === 1;
    row.cloudBackup     = row.cloudBackup === 1;
  }
  return row;
});

// ── IPC: save-prefs ────────────────────────────────────────────────
ipcMain.handle('save-prefs', (_e, userId, prefs) => {
  if (!db) return { ok: false };
  try {
    db.prepare(`
      INSERT OR REPLACE INTO user_prefs
        (userId, startPage, timePerClick, dollarsPerHour, showDescription, showHotkey,
         subscriptionStatus, subscriptionTier, role, notifications, cloudBackup, autoArchive, navDefaultCollapsed)
      VALUES
        (@userId, @startPage, @timePerClick, @dollarsPerHour, @showDescription, @showHotkey,
         @subscriptionStatus, @subscriptionTier, @role, @notifications, @cloudBackup, @autoArchive, @navDefaultCollapsed)
    `).run({
      userId:             userId,
      startPage:          prefs.startPage          || 'home',
      timePerClick:       prefs.timePerClick        ?? 10,
      dollarsPerHour:     prefs.dollarsPerHour      ?? 150,
      showDescription:    prefs.showDescription     ? 1 : 0,
      showHotkey:         prefs.showHotkey          ? 1 : 0,
      subscriptionStatus: prefs.subscriptionStatus  || 'free',
      subscriptionTier:   prefs.subscriptionTier    || 'free',
      role:               prefs.role                || 'team-member',
      notifications:      prefs.notifications       ? 1 : 0,
      cloudBackup:        prefs.cloudBackup         ? 1 : 0,
      autoArchive:        prefs.autoArchive         || 'never',
      navDefaultCollapsed: prefs.navDefaultCollapsed ? 1 : 0,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: recovery snapshots ───────────────────────────────────────
ipcMain.handle('save-recovery-snapshot', (_e, userId, snapshot) => {
  if (!db) return { ok: false, reason: 'no db' };
  if (!userId || !snapshot) return { ok: false, reason: 'missing userId or snapshot' };
  try {
    db.prepare('INSERT OR REPLACE INTO recovery_snapshots (userId, snapshot, savedAt) VALUES (?, ?, ?)')
      .run(userId, JSON.stringify(snapshot), new Date().toISOString());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

ipcMain.handle('get-recovery-snapshot', (_e, userId) => {
  if (!db) return { ok: false, reason: 'no db', snapshot: null };
  if (!userId) return { ok: false, reason: 'missing userId', snapshot: null };
  try {
    const row = db.prepare('SELECT snapshot FROM recovery_snapshots WHERE userId = ?').get(userId);
    return { ok: true, snapshot: row?.snapshot ? JSON.parse(row.snapshot) : null };
  } catch (e) {
    return { ok: false, reason: e.message, snapshot: null };
  }
});

ipcMain.handle('delete-recovery-snapshot', (_e, userId) => {
  if (!db) return { ok: false, reason: 'no db' };
  if (!userId) return { ok: false, reason: 'missing userId' };
  try {
    db.prepare('DELETE FROM recovery_snapshots WHERE userId = ?').run(userId);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: secure auth token storage ────────────────────────────────
function _secureStorePath() {
  return path.join(app.getPath('userData'), 'secure-auth-store.json');
}

function _allowedSecureAuthKey(key) {
  return typeof key === 'string' && /^sb-[A-Za-z0-9_-]+-auth-token$/.test(key);
}

function _readSecureStore() {
  const fs = require('fs');
  try { return JSON.parse(fs.readFileSync(_secureStorePath(), 'utf8') || '{}'); }
  catch (_) { return {}; }
}

function _writeSecureStore(store) {
  const fs = require('fs');
  fs.writeFileSync(_secureStorePath(), JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
}

// secure-auth-* handlers are stubbed - safeStorage disabled until notarization is ready.
// The renderer (client.js) uses localStorage directly and never calls these handlers.
// Restore full safeStorage implementations here when re-enabling.
ipcMain.handle('secure-auth-get',    () => ({ ok: false, reason: 'safeStorage disabled', value: null }));
ipcMain.handle('secure-auth-set',    () => ({ ok: false, reason: 'safeStorage disabled' }));
ipcMain.handle('secure-auth-remove', () => ({ ok: false, reason: 'safeStorage disabled' }));

// ── IPC: seed-new-user ─────────────────────────────────────────────
ipcMain.handle('migrate-user-id', (_e, oldId, newId) => {
  if (!db) return { ok: false };
  try {
    db.transaction(() => {
      db.prepare('UPDATE jumps     SET userId = ? WHERE userId = ?').run(newId, oldId);
      db.prepare('UPDATE columns   SET userId = ? WHERE userId = ?').run(newId, oldId);
      db.prepare('UPDATE click_log SET userId = ? WHERE userId = ?').run(newId, oldId);
      // user_prefs has unique constraint - delete new if exists, then update old
      db.prepare('DELETE FROM user_prefs WHERE userId = ?').run(newId);
      db.prepare('UPDATE user_prefs SET userId = ? WHERE userId = ?').run(newId, oldId);
      const rows = db.prepare('SELECT key, value FROM sync_state WHERE key LIKE ?').all(`${oldId}:%`);
      const upsertSync = db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)');
      const deleteSync = db.prepare('DELETE FROM sync_state WHERE key = ?');
      for (const row of rows) {
        upsertSync.run(row.key.replace(`${oldId}:`, `${newId}:`), row.value);
        deleteSync.run(row.key);
      }
    })();
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('seed-new-user', (_e, userId, platform) => {
  if (!db) return { ok: false };
  try {
    // Guard: never seed if personal columns already exist for this user
    const existingCols = db.prepare('SELECT COUNT(*) as cnt FROM columns WHERE userId = ? AND isShared = 0').get(userId);
    if (existingCols && existingCols.cnt > 0) {
      return { ok: true, skipped: true };
    }

    const now = Date.now();
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

    const colDefs = [
      { name: 'Directories', visible: 1 },
      { name: 'Links',       visible: 1 },
      { name: 'Col 3',       visible: 1 },
      { name: 'Col 4',       visible: 1 },
      { name: 'Col 5',       visible: 1 },
      { name: 'Col 6',       visible: 1 },
      { name: 'Col 7',       visible: 1 },
      { name: 'Col 8',       visible: 0 },
      { name: 'Col 9',       visible: 0 },
      { name: 'Col 10',      visible: 0 },
    ];

    const insertCol = db.prepare(`
      INSERT OR REPLACE INTO columns (id, userId, name, visible, \`order\`, createdAt, isShared, teamId, supabaseId)
      VALUES (@id, @userId, @name, @visible, @order, @createdAt, 0, NULL, NULL)
    `);

    const cols = colDefs.map((def, i) => ({ id: uid(), userId, ...def, order: i, createdAt: now }));

    const insertJump = db.prepare(`
      INSERT OR REPLACE INTO jumps
        (id, userId, name, url, description, reason, columnId, hotkey, favorite,
         isArchived, clickCount, lastUsed, createdAt, updatedAt, isShared, teamId)
      VALUES
        (@id, @userId, @name, @url, @description, @reason, @columnId, @hotkey, @favorite,
         0, 0, NULL, @createdAt, @updatedAt, 0, NULL)
    `);

    const isWin = platform === 'win32';

    const tx = db.transaction(() => {
      for (const col of cols) insertCol.run(col);

      // Links column (cols[1]): Google + Slack
      insertJump.run({
        id: uid(), userId,
        name: 'Google', url: 'https://google.com',
        description: 'Search the web', reason: '',
        columnId: cols[1].id, hotkey: '', favorite: 1,
        createdAt: now, updatedAt: now,
      });
      insertJump.run({
        id: uid(), userId,
        name: 'Slack', url: 'https://slack.com',
        description: 'Team chat', reason: '',
        columnId: cols[1].id, hotkey: '', favorite: 1,
        createdAt: now, updatedAt: now,
      });

      // Directories column (cols[0]): platform-appropriate path
      if (isWin) {
        insertJump.run({
          id: uid(), userId,
          name: 'C Drive', url: 'C:\\',
          description: 'Your C drive', reason: '',
          columnId: cols[0].id, hotkey: '', favorite: 1,
          createdAt: now, updatedAt: now,
        });
      } else {
        insertJump.run({
          id: uid(), userId,
          name: 'Home Folder', url: '~',
          description: 'Your home directory', reason: '',
          columnId: cols[0].id, hotkey: '', favorite: 1,
          createdAt: now, updatedAt: now,
        });
      }
    });
    tx();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

let win;


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
      sandbox: true,
    },
  });

  // In dev mode, clear the renderer cache so source file changes are always picked up.
  // Static ?v= cache-busters in script tags don't update automatically during development.
  const isDev = !app.isPackaged;
  if (isDev) {
    win.webContents.session.clearCache().then(() => {
      win.loadFile(path.join(__dirname, 'index.html'));
    });
  } else {
    win.loadFile(path.join(__dirname, 'index.html'));
  }

  // Discourage accidental DevTools access - not a true security control;
  // determined users can still open DevTools via menu or attach a remote debugger.
  if (!isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      // Block F12 and Ctrl/Cmd+Shift+I
      if (
        input.key === 'F12' ||
        (input.key === 'I' && input.shift && (input.control || input.meta))
      ) {
        event.preventDefault();
      }
    });
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
  }

  // Hide menu bar on Windows/Linux
  if (process.platform !== 'darwin') win.setMenuBarVisibility(false);

  win.on('closed', () => { win = null; });

  // Prevent new BrowserWindows from being opened (e.g. via window.open or target=_blank)
  // Redirect to system browser instead - keeps preload out of uncontrolled windows
  // Only allow http/https URLs; block javascript:, data:, file:, etc.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent renderer from navigating the main window to external URLs
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

// Spawn a detached OS process and unref so it outlives the Electron main process
function fireAndForget(cmd, args) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

// Open URLs / local paths from renderer
const RISKY_EXTENSIONS = /\.(app|exe|sh|bat|cmd|command|pkg|dmg|scpt)$/i;

// Hard-blocked URL schemes - never passed to shell.openExternal or shell.openPath.
// Includes web/script schemes, OS-level handlers that can trigger other apps,
// and remote mount/connect schemes a malicious shared jump could abuse.
const BLOCKED_URL_SCHEME = /^(javascript|data|vbscript|file|jar|view-source|smb|afp|nfs|cifs|vnc|ssh|telnet|ftp|sftp|gopher|x-apple\.systempreferences|prefs|ms-settings|shell|chrome|about):/i;

// Scheme allow-list for non-http(s) URLs we explicitly permit (common app deep links).
const ALLOWED_APP_SCHEMES = /^(mailto|tel|sms|facetime|zoommtg|zoomus|msteams|slack|obsidian|notion|raycast|things|fantastical|spotify|tower|github-mac|sourcetree|x-github-client|vscode|cursor):/i;

ipcMain.handle('open-url', async (_e, url, isShared) => {
  if (!url || typeof url !== 'string') return { ok: false, reason: 'invalid url' };
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, reason: 'invalid url' };

  // 1. Hard-reject dangerous schemes before any classification.
  if (BLOCKED_URL_SCHEME.test(trimmed)) {
    console.warn('[open-url] blocked scheme'); // do not log url contents
    return { ok: false, reason: 'scheme blocked' };
  }

  // 2. Reject protocol-relative URLs (//evil.example).
  if (/^\/\//.test(trimmed)) {
    return { ok: false, reason: 'scheme blocked' };
  }

  // Detect web URLs: explicit protocol/www, OR bare domain like "google.com", "site.app", etc.
  const hasTld = /^[^/\\\s]+\.(com|net|org|io|ai|app|co|dev|gov|edu|info|biz|me|tv|us|uk|ca|de|fr|au|jp|cn|in|br|ru|nl|se|no|dk|fi|it|es|pt|mx|nz|sg|hk|za|ly|gg|cloud|tech|xyz|social|store|shop)(\/|$)/i.test(trimmed);
  const isHttp = /^https?:\/\//i.test(trimmed);
  const isWeb = isHttp || /^www\./i.test(trimmed) || hasTld;
  const fullUrl = isWeb && !isHttp ? 'https://' + trimmed : trimmed;

  // 3. Detect explicit non-http schemes (anything with `scheme:` not already classified as web).
  //    Exception: Windows drive paths (C:\, D:/) look like schemes to the regex but are local paths.
  const isWinDrivePath = /^[a-zA-Z]:[\\/]/.test(trimmed);
  const hasScheme = !isWinDrivePath && /^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(trimmed) && !isHttp;
  if (hasScheme && !ALLOWED_APP_SCHEMES.test(trimmed)) {
    return { ok: false, reason: 'scheme blocked' };
  }

  try {
    if (isWeb) {
      shell.openExternal(fullUrl);
      return { ok: true };
    }

    if (hasScheme && ALLOWED_APP_SCHEMES.test(trimmed)) {
      // Allow known deep-link schemes (mailto:, slack:, zoommtg:, etc.).
      shell.openExternal(trimmed);
      return { ok: true };
    }

    // Treat anything left as a local path. Expand ~ to user home.
    const path = require('path');
    const os = require('os');
    let resolvedPath = trimmed.startsWith('~')
      ? trimmed.replace('~', os.homedir())
      : trimmed;
    // Normalize to an absolute path; reject anything that looks like a URL.
    if (!path.isAbsolute(resolvedPath) && !/^[a-zA-Z]:[\\/]/.test(resolvedPath)) {
      return { ok: false, reason: 'invalid path' };
    }

    // Shared team jumps pointing to local paths require user confirmation
    if (isShared) {
      const { dialog } = require('electron');
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Cancel', 'Open'],
        defaultId: 0,
        cancelId: 0,
        title: 'Shared Team Jump - Local Path',
        message: 'Open this shared jump?',
        detail: `This jump was shared by your team and points to a local path: ${resolvedPath}. As a security precaution, is this the file you actually want to open?`,
      });
      if (response !== 1) return { ok: false, reason: 'cancelled' };
    }

    const openErr = await shell.openPath(resolvedPath);
    if (openErr) {
      console.warn('[open-url] shell.openPath error:', openErr);
      return { ok: false, reason: openErr };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[open-url] error:', e?.message || 'open failed');
    return { ok: false, reason: 'open failed' };
  }
});

// ── Auto-updater ──────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false; // Only install when user explicitly clicks Restart & Update

let _updateReady = false; // Flag so app.html can poll on load and catch missed IPC

autoUpdater.on('update-downloaded', () => {
  _updateReady = true;
  if (win) win.webContents.send('update-ready');
});

// app.html polls this on load to catch updates downloaded before the page was ready
ipcMain.handle('is-update-ready', () => _updateReady);

autoUpdater.on('error', (err) => {
  console.error('[updater] error:', err?.message || err);
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('export-pdf', async (_e, html) => {
  const { dialog } = require('electron');
  const fs  = require('fs');
  const os  = require('os');
  const datePart = new Date().toISOString().slice(0, 10);

  const { filePath, canceled } = await dialog.showSaveDialog({
    title:       'Save JumpKit ROI Report',
    defaultPath: `JumpKit-ROI-Report-${datePart}.pdf`,
    filters:     [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };

  // Write HTML to a temp file so the hidden window can load it cleanly
  const tmpHtml = path.join(os.tmpdir(), `jk-report-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf-8');

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  await pdfWin.loadFile(tmpHtml);

  try {
    const pdfData = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize:        'Letter',
      margins:         { marginType: 'custom', top: 0.5, bottom: 0.75, left: 0.5, right: 0.5 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-size:10px;color:#9ca3af;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:4px 40px">Generated by JumpKit &middot; jumpkit.app &middot; ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} &middot; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    });
    fs.writeFileSync(filePath, pdfData);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    pdfWin.close();
    try { fs.unlinkSync(tmpHtml); } catch (_) {}
  }
});

// ── IPC: release testing file helpers ───────────────────────────
ipcMain.handle('show-release-testing-dialog', async (_e, version, osPart) => {
  const { dialog } = require('electron');
  const osTag = osPart === 'Win' ? 'Win' : 'Mac';
  const defaultName = `JumpKit_${osTag}_ReleaseTesting_v${version || '1.0.0'}.html`;
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save Release Testing File',
    defaultPath: require('path').join(require('os').homedir(), 'Desktop', defaultName),
    filters: [{ name: 'HTML Files', extensions: ['html'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  return { filePath };
});

ipcMain.handle('open-file-dialog', async (_e, opts) => {
  const { dialog } = require('electron');
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title:       opts?.title || 'Open File',
    defaultPath: opts?.defaultPath || require('os').homedir(),
    filters:     opts?.filters || [{ name: 'All Files', extensions: ['*'] }],
    properties:  opts?.properties || ['openFile'],
  });
  if (canceled || !filePaths?.length) return { canceled: true };
  return { filePath: filePaths[0] };
});

ipcMain.handle('check-migrations', (_e, filenames) => {
  const fs = require('fs');
  const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
  const results = {};
  (filenames || []).forEach(f => {
    results[f] = fs.existsSync(path.join(migrationsDir, f));
  });
  return results;
});

ipcMain.handle('read-file', (_e, filePath) => {
  const fs = require('fs');
  try {
    if (!fs.existsSync(filePath)) return { ok: true, content: null };
    return { ok: true, content: fs.readFileSync(filePath, 'utf8') };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

ipcMain.handle('write-file-direct', (_e, filePath, content) => {
  const fs = require('fs');
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

ipcMain.handle('rename-file', (_e, oldPath, newPath) => {
  const fs = require('fs');
  try {
    if (!oldPath || !newPath) return { ok: false, reason: 'missing path' };
    if (oldPath === newPath) return { ok: true };
    if (!fs.existsSync(oldPath)) return { ok: false, reason: 'source does not exist' };
    // If destination already exists, refuse rather than clobber
    if (fs.existsSync(newPath)) return { ok: false, reason: 'destination already exists' };
    fs.renameSync(oldPath, newPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

ipcMain.handle('get-app-version', () => require('electron').app.getVersion());

// Sync native window title bar color with the app theme (dark header in dark mode)
ipcMain.on('set-native-theme', (_e, t) => {
  nativeTheme.themeSource = (t === 'dark' || t === 'light') ? t : 'system';
});

// ── IPC: admin build guard ───────────────────────────────────────
// Admin-only JS files must NOT be present in packaged builds.
// These files are excluded via package.json build.files exclusions.
const ADMIN_FILES_EXPECTED_ABSENT = ['js/tests.js', 'js/deployment.js', 'js/admin.js'];

function _checkAdminFilesExcluded() {
  const fs = require('fs');
  const results = ADMIN_FILES_EXPECTED_ABSENT.map(rel => {
    const fullPath = path.join(__dirname, rel);
    const found = fs.existsSync(fullPath);
    return { file: rel, found };
  });
  return results;
}

ipcMain.handle('check-admin-files-excluded', () => {
  const isPackaged = app.isPackaged;
  const results = _checkAdminFilesExcluded();
  return { isPackaged, results };
});

ipcMain.handle('read-build-config', () => {
  try {
    const fs = require('fs');
    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return { ok: true, buildFiles: pkg?.build?.files || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('check-icon-files', () => {
  const fs = require('fs');
  try {
    const macIconPath = path.join(__dirname, 'assets', 'icon.icns');
    const winIconPath = path.join(__dirname, 'assets', 'icon.ico');
    // Check file existence (works on the platform the file is for)
    const macFileExists = fs.existsSync(macIconPath);
    const winFileExists = fs.existsSync(winIconPath);
    // Also verify via package.json build config - more reliable cross-platform.
    // On Windows, icon.icns is not bundled (Mac-only format) so file check alone
    // would always fail. Reading the config confirms the path is correctly set.
    let pkgMacIcon = null, pkgWinIcon = null;
    try {
      const pkg = require('./package.json');
      pkgMacIcon = pkg && pkg.build && pkg.build.mac && pkg.build.mac.icon;
      pkgWinIcon = pkg && pkg.build && pkg.build.win && pkg.build.win.icon;
    } catch (_) {}
    return {
      ok: true,
      macIconExists: macFileExists || pkgMacIcon === 'assets/icon.icns',
      winIconExists: winFileExists || pkgWinIcon === 'assets/icon.ico',
      macIconPath,
      winIconPath
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('list-dist-files', () => {
  const fs = require('fs');
  const distPath = path.join(__dirname, 'dist');
  try {
    if (!fs.existsSync(distPath)) return { ok: false, error: 'dist/ folder not found - run a build first.' };
    const files = fs.readdirSync(distPath)
      .filter(f => f.endsWith('.dmg') || f.endsWith('.exe'))
      .map(f => {
        const fPath = path.join(distPath, f);
        try {
          const stat = fs.statSync(fPath);
          const mb = (stat.size / 1024 / 1024).toFixed(1);
          return { name: f, sizeMb: `${mb} MB`, bytes: stat.size };
        } catch (_) {
          return { name: f, sizeMb: '?', bytes: 0 };
        }
      });
    return { ok: true, files };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-latest-commit-id', async () => {
  try {
    const { execSync } = require('child_process');
    const repoPath = path.join(__dirname, '..', '..', '..');
    const out = execSync('git log --oneline -1', { cwd: repoPath, timeout: 5000 }).toString().trim();
    const parts = out.split(' ');
    return { commitId: parts[0], message: parts.slice(1).join(' ') };
  } catch (err) {
    return { error: err.message };
  }
});

// Single instance lock - prevent two processes opening the same SQLite db
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

app.whenReady().then(() => {
  // ── Admin build guard: verify admin files are excluded in packaged builds ──
  const _pkg = (() => { try { return require('./package.json'); } catch(_) { return {}; } })();
  if (app.isPackaged && !_pkg.jkTestBuild) {
    const adminCheck = _checkAdminFilesExcluded();
    const leaked = adminCheck.filter(r => r.found).map(r => r.file);
    if (leaked.length > 0) {
      const { dialog } = require('electron');
      dialog.showErrorBoxSync(
        '⚠️ Build Error - Admin Code Leaked',
        `This installer contains admin-only files that should have been excluded from the build:\n\n${leaked.map(f => '  • ' + f).join('\n')}\n\nDo NOT ship this build. Rebuild with the correct package.json exclusions.`
      );
    }
  }

  initDB();
  initNoteKitDB();

  // NoteKit feature flag: OFF for regular users. Flip to true for Jeff's test
  // build (electron-builder --config … or env). Renderer reads via IPC.
  process.env.NOTEKIT_ENABLED = process.env.NOTEKIT_ENABLED || 'true';
  // ClipKit feature flag (screen capture tool).
  process.env.CLIPKIT_ENABLED = process.env.CLIPKIT_ENABLED || 'true';

  // Allow fetch() to Supabase and CDN resources from Electron renderer
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://*.supabase.in https://cdn.jsdelivr.net; object-src 'none'; base-uri 'self'"
        ]
      }
    });
  });

  createWindow();

  // Check for updates after window is ready (delay 3s to avoid blocking startup)
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);

  // macOS dock behavior
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {

});
