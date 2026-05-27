const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { autoUpdater } = require('electron-updater');

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
        ts        INTEGER NOT NULL
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
    addColumnIfMissing('jumps',   'timeSaved', 'REAL DEFAULT NULL');
    addColumnIfMissing('user_prefs', 'navDefaultCollapsed', 'INTEGER DEFAULT 0');
    addColumnIfMissing('jumps',   'timeSavedUnit', 'TEXT DEFAULT NULL');
    addColumnIfMissing('jumps',   'teamId',   'TEXT DEFAULT NULL');
    addColumnIfMissing('columns', 'isShared',   'INTEGER DEFAULT 0');
    addColumnIfMissing('columns', 'teamId',     'TEXT DEFAULT NULL');
    addColumnIfMissing('columns', 'supabaseId', 'TEXT DEFAULT NULL');
    addColumnIfMissing('jumps',   'supabaseId', 'TEXT DEFAULT NULL');

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
ipcMain.handle('save-backup', (_e, jsonStr) => {
  try {
    const fs = require('fs');
    const os = require('os');
    const backupDir = path.join(os.homedir(), 'Documents', 'JumpKit Backups');

    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filePath = path.join(backupDir, `jumpkit-backup-${ts}.json`);
    fs.writeFileSync(filePath, jsonStr, 'utf8');
    return { ok: true, path: filePath };
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
  return db.prepare('SELECT * FROM columns WHERE userId = ? ORDER BY `order` ASC').all(userId);
});

// ── IPC: save-columns (bulk replace) ──────────────────────────────
ipcMain.handle('save-columns', (_e, userId, cols) => {
  if (!db || !Array.isArray(cols)) return { ok: false };
  try {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO columns (id, userId, name, visible, \`order\`, createdAt, isShared, teamId, supabaseId)
      VALUES (@id, @userId, @name, @visible, @order, @createdAt, @isShared, @teamId, @supabaseId)
    `);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM columns WHERE userId = ?').run(userId);
      for (const col of cols) {
        insert.run({
          id:        col.id,
          userId:    userId,
          name:      col.name,
          visible:   col.visible ? 1 : 0,
          order:     col.order ?? 0,
          createdAt: col.createdAt || Date.now(),
          isShared:  col.isShared ? 1 : 0,
          teamId:    col.teamId || null,
          supabaseId: col.supabaseId || null,
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
    db.prepare(`
      INSERT OR REPLACE INTO columns (id, userId, name, visible, \`order\`, createdAt, isShared, teamId, supabaseId)
      VALUES (@id, @userId, @name, @visible, @order, @createdAt, @isShared, @teamId, @supabaseId)
    `).run({
      id:         col.id,
      userId:     userId,
      name:       col.name,
      visible:    col.visible ? 1 : 0,
      order:      col.order ?? 0,
      createdAt:  col.createdAt || Date.now(),
      isShared:   col.isShared ? 1 : 0,
      teamId:     col.teamId || null,
      supabaseId: col.supabaseId || null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── IPC: get-click-log ─────────────────────────────────────────────
ipcMain.handle('get-click-log', (_e, userId) => {
  if (!db) return [];
  return db.prepare('SELECT * FROM click_log WHERE userId = ? ORDER BY ts ASC').all(userId);
});

// ── IPC: log-click ─────────────────────────────────────────────────
ipcMain.handle('log-click', (_e, userId, jumpId, ts) => {
  if (!db) return { ok: false };
  try {
    db.prepare('INSERT INTO click_log (userId, jumpId, ts) VALUES (?, ?, ?)').run(userId, jumpId, ts || Date.now());
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

// ── IPC: seed-new-user ─────────────────────────────────────────────
ipcMain.handle('migrate-user-id', (_e, oldId, newId) => {
  if (!db) return { ok: false };
  try {
    db.transaction(() => {
      db.prepare('UPDATE jumps     SET userId = ? WHERE userId = ?').run(newId, oldId);
      db.prepare('UPDATE columns   SET userId = ? WHERE userId = ?').run(newId, oldId);
      db.prepare('UPDATE click_log SET userId = ? WHERE userId = ?').run(newId, oldId);
      // user_prefs has unique constraint — delete new if exists, then update old
      db.prepare('DELETE FROM user_prefs WHERE userId = ?').run(newId);
      db.prepare('UPDATE user_prefs SET userId = ? WHERE userId = ?').run(newId, oldId);
      // sync_state has no userId column — skip
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

  // Disable devtools in production
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
      // Expand ~ to actual home directory
      const resolvedPath = url.startsWith('~')
        ? url.replace('~', require('os').homedir())
        : url;
      // Local path — use shell.openPath for cross-platform support
      shell.openPath(resolvedPath).then(err => {
        if (err) console.error('[open-url] openPath error:', err);
      });
    }
  } catch (err) {
    console.error('[open-url] error:', err);
  }
});

// ── Auto-updater ──────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-downloaded', () => {
  if (win) win.webContents.send('update-ready');
});

autoUpdater.on('error', (err) => {
  console.error('[updater] error:', err?.message || err);
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
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
          "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://*.supabase.in"
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
  globalShortcut.unregisterAll();
});
