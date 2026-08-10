// Global platform connections (Option B model)
//
// Tokens live HERE — one row per platform — and are shared across all
// projects. Per-project channel configs hold only *references* to these
// connections (which account/board/channel that project publishes to).
//
// Table schema:
//   platform         TEXT PRIMARY KEY   -- 'x' | 'linkedin' | 'youtube' | 'pinterest'
//   access_token     TEXT
//   refresh_token    TEXT
//   token_expires_at INTEGER
//   account_id       TEXT               -- platform account id (X user id, LinkedIn org id, ...)
//   account_name     TEXT               -- display name
//   meta             TEXT               -- JSON (e.g. LinkedIn orgs list, Pinterest boards)
//   created_at       TEXT
//   updated_at       TEXT

function ensureConnectionsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      platform         TEXT PRIMARY KEY,
      access_token     TEXT,
      refresh_token    TEXT,
      token_expires_at INTEGER,
      account_id       TEXT,
      account_name     TEXT,
      meta             TEXT,
      created_at       TEXT,
      updated_at       TEXT
    )
  `);
}

function getConnection(db, platform) {
  const row = db.prepare('SELECT * FROM connections WHERE platform = ?').get(platform);
  if (!row) return null;
  try { row.meta = JSON.parse(row.meta || '{}'); } catch (_) { row.meta = {}; }
  return row;
}

function getAccessToken(db, platform) {
  const conn = getConnection(db, platform);
  return conn && conn.access_token ? conn.access_token : null;
}

function saveConnection(db, platform, fields) {
  const now = Date.now();
  const existing = db.prepare('SELECT platform FROM connections WHERE platform = ?').get(platform);
  const meta = fields.meta !== undefined
    ? (typeof fields.meta === 'string' ? fields.meta : JSON.stringify(fields.meta))
    : undefined;

  if (existing) {
    const sets = [];
    const vals = [];
    for (const key of ['access_token', 'refresh_token', 'token_expires_at', 'account_id', 'account_name', 'meta']) {
      if (fields[key] !== undefined) { sets.push(`${key} = ?`); vals.push(fields[key]); }
    }
    sets.push('updated_at = ?'); vals.push(now);
    db.prepare(`UPDATE connections SET ${sets.join(', ')} WHERE platform = ?`).run(...vals, platform);
  } else {
    db.prepare(`
      INSERT INTO connections (platform, access_token, refresh_token, token_expires_at, account_id, account_name, meta, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      platform,
      fields.access_token || null,
      fields.refresh_token || null,
      fields.token_expires_at || null,
      fields.account_id || null,
      fields.account_name || null,
      meta || '{}',
      now,
      now
    );
  }
  return getConnection(db, platform);
}

function clearConnection(db, platform) {
  db.prepare('DELETE FROM connections WHERE platform = ?').run(platform);
}

// Migrate legacy credentials into the global connections table.
// Sources, in priority order:
//   1. Legacy global settings keys (x.access_token etc.)
//   2. First non-empty per-project channel config that holds a token
// This runs once at startup and is idempotent (only fills empty platforms).
function migrateLegacyConnections(db, getSetting) {
  const platforms = ['x', 'linkedin', 'youtube', 'pinterest'];
  for (const platform of platforms) {
    if (getConnection(db, platform)) continue; // already connected globally

    // 1. Legacy settings keys
    const legacyAccess = getSetting(`${platform}.access_token`);
    const legacyRefresh = getSetting(`${platform}.refresh_token`);
    const legacyMemberUrn = getSetting(`${platform}.member_urn`);
    const legacyBoard = getSetting(`${platform}.board`);
    if (legacyAccess) {
      const meta = {};
      if (platform === 'linkedin') {
        if (legacyMemberUrn) {
          meta.orgs = [{ id: legacyMemberUrn, name: legacyMemberUrn.replace(/^urn:li:organization:/, '') || legacyMemberUrn }];
        }
      }
      if (platform === 'pinterest' && legacyBoard) {
        meta.boards = [{ id: legacyBoard, name: legacyBoard }];
      }
      saveConnection(db, platform, {
        access_token: legacyAccess,
        refresh_token: legacyRefresh || undefined,
        account_name: legacyAccess ? `Legacy ${platform} account` : undefined,
        meta,
      });
      continue;
    }

    // 2. First project channel config that has an access_token
    const rows = db.prepare(`SELECT config FROM channels WHERE platform = ? AND config != '{}'`).all(platform);
    for (const row of rows) {
      let cfg = {};
      try { cfg = JSON.parse(row.config || '{}'); } catch (_) { continue; }
      if (!cfg.access_token) continue;
      const meta = {};
      if (platform === 'linkedin' && cfg.member_urn) {
        meta.orgs = [{ id: cfg.member_urn, name: cfg.member_urn.replace(/^urn:li:organization:/, '') || cfg.member_urn }];
      }
      if (platform === 'pinterest') {
        if (cfg.boards && cfg.boards.length) meta.boards = cfg.boards;
        else if (cfg.board) meta.boards = [{ id: cfg.board, name: cfg.board }];
      }
      saveConnection(db, platform, {
        access_token: cfg.access_token,
        refresh_token: cfg.refresh_token || undefined,
        token_expires_at: cfg.expiry || undefined,
        account_name: cfg.account_name || `Legacy ${platform} account`,
        meta,
      });
      break;
    }
  }
}

module.exports = {
  ensureConnectionsTable,
  getConnection,
  getAccessToken,
  saveConnection,
  clearConnection,
  migrateLegacyConnections,
};
