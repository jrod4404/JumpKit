const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
