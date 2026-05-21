const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

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
    `);

    // Safely migrate existing tables — add new columns if they don't exist
    function addColumnIfMissing(table, col, def) {
      try {
        const cols = db.pragma(`table_info(${table})`);
        if (!cols.find(c => c.name === col)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        }
      } catch (e) { console.warn(`Migration warning: ${e.message}`); }
    }

    addColumnIfMissing('jumps',   'isShared', 'INTEGER DEFAULT 0');
    addColumnIfMissing('jumps',   'teamId',   'TEXT DEFAULT NULL');
    addColumnIfMissing('columns', 'isShared', 'INTEGER DEFAULT 0');
    addColumnIfMissing('columns', 'teamId',   'TEXT DEFAULT NULL');

    console.log('[JumpKit] SQLite DB initialized at', dbPath);
  } catch (e) {
    // better-sqlite3 not available (dev mode without native module) — skip
    console.warn('[JumpKit] SQLite not available:', e.message);
    db = null;
  }
}

// ── IPC: sync-jumps ────────────────────────────────────────────────
ipcMain.handle('sync-jumps', async (_e, payload) => {
  // The renderer passes the sync result; main process persists to SQLite
  if (!db || !payload) return { ok: false, reason: 'no db' };
  try {
    const { sharedColumns = [], sharedJumps = [] } = payload;
    const upsertCol = db.prepare(`
      INSERT INTO columns (id, userId, name, visible, \`order\`, createdAt, isShared, teamId)
      VALUES (@id, @userId, @name, @visible, @order, @createdAt, 1, @teamId)
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
    db.prepare(`INSERT OR REPLACE INTO sync_state (key, value) VALUES ('lastSync', ?)`).run(Date.now().toString());
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

// ── IPC: upsert-shared-jumps ───────────────────────────────────────
// Takes array of jump objects, upserts into jumps table.
// Preserves existing hotkey if the jump already exists locally.
ipcMain.handle('upsert-shared-jumps', (_e, jumps) => {
  if (!db || !Array.isArray(jumps)) return { ok: false, reason: 'no db or bad input' };
  try {
    const upsert = db.prepare(`
      INSERT INTO jumps (id, userId, name, url, description, reason, columnId, hotkey, favorite, isArchived, clickCount, lastUsed, createdAt, updatedAt, isShared, teamId)
      VALUES (@id, @userId, @name, @url, @description, @reason, @columnId, @hotkey, 0, 0, 0, NULL, @createdAt, @updatedAt, 1, @teamId)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, url=excluded.url, description=excluded.description,
        reason=excluded.reason, columnId=excluded.columnId,
        updatedAt=excluded.updatedAt, isShared=1, teamId=excluded.teamId
        -- hotkey NOT updated (preserve user's local hotkey assignment)
    `);
    // For each jump, pull existing hotkey first so we can pass it in for new rows
    const getHotkey = db.prepare('SELECT hotkey FROM jumps WHERE id = ?');
    const tx = db.transaction(() => {
      for (const j of jumps) {
        const existing = getHotkey.get(j.id);
        upsert.run({
          ...j,
          hotkey:      existing?.hotkey || j.hotkey || '',
          description: j.description || '',
          reason:      j.reason || '',
          createdAt:   j.createdAt || Date.now(),
          updatedAt:   j.updatedAt || Date.now(),
          teamId:      j.teamId || null,
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
// Takes array of jump IDs, deletes from jumps table where isShared=1
ipcMain.handle('delete-shared-jumps', (_e, ids) => {
  if (!db || !Array.isArray(ids)) return { ok: false, reason: 'no db or bad input' };
  try {
    const del = db.prepare('DELETE FROM jumps WHERE id = ? AND isShared = 1');
    const tx  = db.transaction(() => { for (const id of ids) del.run(id); });
    tx();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: write-test-results ────────────────────────────────────────
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

// ── IPC: update-sync-state ─────────────────────────────────────────
// Upserts a key/value pair into the sync_state table
ipcMain.handle('update-sync-state', (_e, key, value) => {
  if (!db) return { ok: false };
  try {
    db.prepare(`INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)`).run(key, String(value));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

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
  console.log('[open-url] received:', url);

  const isWeb = /^(https?:\/\/|www\.)/i.test(url);
  const fullUrl = isWeb && url.startsWith('www.') ? 'https://' + url : url;

  try {
    if (isWeb) {
      shell.openExternal(fullUrl);
    } else {
      // Local path — use shell.openPath for cross-platform support
      shell.openPath(url).then(err => {
        if (err) console.error('[open-url] openPath error:', err);
      });
    }
  } catch (err) {
    console.error('[open-url] error:', err);
  }
});

app.whenReady().then(() => {
  initDB();

  // Allow fetch() to Supabase and CDN resources from Electron renderer
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: app: https://*.supabase.co https://*.supabase.in https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com"
        ]
      }
    });
  });

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
