// Pinterest OAuth 2.0 (PKCE) + Publishing for PostKit
const https = require('https');
const crypto = require('crypto');
const connections = require('./connections');

// ── Settings helpers ──────────────────────────────────────────────────────────
// App-level credentials live in the settings table (client_id/secret). Account
// tokens live in the GLOBAL connections table. Per-project channel configs hold
// only references (which board a project publishes to).

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getChannelConfig(db, projectId, platform) {
  if (!projectId) return {};
  const row = db.prepare('SELECT config FROM channels WHERE project_id = ? AND platform = ?').get(projectId, platform);
  if (!row) return {};
  try { return JSON.parse(row.config || '{}'); } catch { return {}; }
}

function setChannelConfig(db, projectId, platform, configObj) {
  if (!projectId) return;
  const existing = getChannelConfig(db, projectId, platform);
  const merged = { ...existing, ...configObj };
  db.prepare(`UPDATE channels SET config = ?, updated_at = ? WHERE project_id = ? AND platform = ?`)
    .run(JSON.stringify(merged), Date.now(), projectId, platform);
}

// ── OAuth 2.0 PKCE helpers ─────────────────────────────────────────────────

function generatePkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// Store PKCE state temporarily (in-memory, cleared on restart)
const _oauthSessions = {};

function createOAuthSession(projectId) {
  const { verifier, challenge } = generatePkce();
  const state = generateState();
  _oauthSessions[state] = { verifier, challenge, projectId: projectId || null, createdAt: Date.now() };
  // Clean up old sessions (older than 10 min)
  for (const [k, v] of Object.entries(_oauthSessions)) {
    if (Date.now() - v.createdAt > 600000) delete _oauthSessions[k];
  }
  return { state, challenge };
}

function consumeOAuthSession(state) {
  const session = _oauthSessions[state];
  if (!session) return null;
  delete _oauthSessions[state];
  return session;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpsPostJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── OAuth URL builder ───────────────────────────────────────────────────────

function buildAuthUrl(db, redirectUri, state, challenge) {
  const clientId = getSetting(db, 'pinterest.client_id');
  if (!clientId) throw new Error('Pinterest client_id not configured. Set it in Settings.');

  // Pinterest scopes: pins:read, pins:write, user_accounts:read
  const scopes = 'pins:read pins:write user_accounts:read';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return `https://www.pinterest.com/oauth/?${params.toString()}`;
}

// ── Token exchange ──────────────────────────────────────────────────────────

async function exchangeCodeForToken(db, code, redirectUri, verifier, projectId) {
  const clientId = getSetting(db, 'pinterest.client_id');
  const clientSecret = getSetting(db, 'pinterest.client_secret');
  if (!clientId) throw new Error('Pinterest client_id not configured');

  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  };

  const headers = {};
  if (clientSecret) {
    // Confidential client — use Basic auth (client_id:client_secret)
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  } else {
    // Public client — include client_id in body
    body.client_id = clientId;
  }

  const result = await httpsPost('https://api.pinterest.com/v5/oauth/token', body, headers);
  if (result.status !== 200) {
    throw new Error(`Pinterest token exchange failed: ${result.status} ${JSON.stringify(result.json || result.raw)}`);
  }

  return result.json; // { access_token, refresh_token?, expires_in, token_type, ... }
}

async function refreshAccessToken(db) {
  const conn = connections.getConnection(db, 'pinterest');
  const refreshToken = conn ? conn.refresh_token : null;
  const clientId = getSetting(db, 'pinterest.client_id');
  const clientSecret = getSetting(db, 'pinterest.client_secret');
  if (!refreshToken || !clientId) return null;

  const body = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  };

  const headers = {};
  if (clientSecret) {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  } else {
    body.client_id = clientId;
  }

  const result = await httpsPost('https://api.pinterest.com/v5/oauth/token', body, headers);
  if (result.status !== 200) {
    console.error('Pinterest token refresh failed:', result.status, result.json || result.raw);
    return null;
  }

  const tokens = result.json;
  connections.saveConnection(db, 'pinterest', {
    access_token: tokens.access_token,
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    ...(tokens.expires_in ? { token_expires_at: Date.now() + tokens.expires_in * 1000 } : {}),
  });
  return tokens.access_token;
}

// ── Get user boards ─────────────────────────────────────────────────────────

async function getUserBoards(db) {
  let accessToken = connections.getAccessToken(db, 'pinterest');
  if (!accessToken) throw new Error('Pinterest not connected. Connect your account in App Settings.');

  const result = await httpsGet('https://api.pinterest.com/v5/boards', {
    'Authorization': `Bearer ${accessToken}`,
  });

  if (result.status === 401) {
    const newToken = await refreshAccessToken(db);
    if (newToken) {
      const retry = await httpsGet('https://api.pinterest.com/v5/boards', {
        'Authorization': `Bearer ${newToken}`,
      });
      if (retry.status === 200) {
        return (retry.json?.items || []).map(b => ({ id: b.id, name: b.name }));
      }
    }
    throw new Error('Pinterest token expired or invalid. Reconnect your account.');
  }

  if (result.status !== 200) {
    throw new Error(`Pinterest boards fetch failed: ${result.status} ${JSON.stringify(result.json || result.raw)}`);
  }

  return (result.json?.items || []).map(b => ({ id: b.id, name: b.name }));
}

// ── Publishing (create a pin) ──────────────────────────────────────────────

/**
 * Publish a pin to Pinterest.
 * @param {object} db
 * @param {string} text      - pin description
 * @param {string} imageUrl  - public URL of the image (Pinterest fetches remote URLs)
 * @param {string} boardId   - destination board id (from getUserBoards / channel config)
 * @param {string} projectId - owning project
 * @param {string} [link]    - optional destination link for the pin
 * @param {string} [title]   - optional pin title
 */
async function publishPin(db, text, imageUrl, boardId, link, title) {
  let accessToken = connections.getAccessToken(db, 'pinterest');
  if (!accessToken) throw new Error('Pinterest not connected. Connect your account in App Settings.');
  if (!boardId) throw new Error('No Pinterest board configured. Pick a board in Channels.');
  if (!imageUrl) throw new Error('A Pinterest pin requires an image.');

  const pinBody = {
    board_id: boardId,
    media_source: { source_type: 'image_url', url: imageUrl },
    description: text || '',
  };
  if (title) pinBody.title = title;
  if (link) pinBody.link = link;
  pinBody.alt_text = (text || '').slice(0, 500);

  let result = await httpsPostJson('https://api.pinterest.com/v5/pins', pinBody, {
    'Authorization': `Bearer ${accessToken}`,
  });

  if (result.status === 401) {
    // Token expired — try refresh once
    const newToken = await refreshAccessToken(db);
    if (newToken) {
      const retry = await httpsPostJson('https://api.pinterest.com/v5/pins', pinBody, {
        'Authorization': `Bearer ${newToken}`,
      });
      if (retry.status === 200 || retry.status === 201) {
        return { id: retry.json?.id, url: `https://www.pinterest.com/pin/${retry.json?.id}/` };
      }
    }
    throw new Error('Pinterest token expired or invalid. Reconnect your account.');
  }

  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Pinterest publish failed: ${result.status} ${JSON.stringify(result.json || result.raw)}`);
  }

  return { id: result.json?.id, url: `https://www.pinterest.com/pin/${result.json?.id}/` };
}

// ── Scheduler Worker ────────────────────────────────────────────────────────

function startSchedulerWorker(db) {
  const CHECK_INTERVAL = 60000; // 1 minute

  setInterval(async () => {
    const now = Date.now();
    const duePosts = db.prepare(`
      SELECT * FROM posts
      WHERE platform = 'pinterest' AND status = 'scheduled' AND scheduled_for <= ?
    `).all(now);

    for (const post of duePosts) {
      try {
        console.log(`[scheduler] Pinterest post ${post.id}...`);
        const projectId = post.project_id || 'proj_default';
        const creds = getChannelConfig(db, projectId, 'pinterest');
        const boardId = creds.board || (creds.boards && creds.boards[0] && creds.boards[0].id) || null;
        if (!boardId) {
          console.error(`[scheduler] Pinterest post ${post.id} skipped: no board configured for project ${projectId}`);
          continue;
        }

        let mediaPaths = [];
        try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
        if (!mediaPaths.length) {
          console.error(`[scheduler] Pinterest post ${post.id} has no image; pins require media. Skipping.`);
          continue;
        }

        const imageUrl = `http://localhost:${getPort(db)}/media/${mediaPaths[0]}`;
        const result = await publishPin(db, post.post_text, imageUrl, boardId, post.link || '', post.title || '');
        db.prepare('UPDATE posts SET status = ?, posted_at = ?, updated_at = ? WHERE id = ?')
          .run('posted', now, now, post.id);
        console.log(`[scheduler] Pinterest published: ${result.url}`);
      } catch(err) {
        console.error(`[scheduler] Pinterest publish failed for ${post.id}:`, err.message);
      }
    }
  }, CHECK_INTERVAL);

  console.log('[scheduler] Pinterest publishing worker started (checking every 60s)');
}

// The scheduler needs the local server port to build media URLs. Read it from
// the app.port setting (defaults 8788). Kept small and independent.
function getPort(db) {
  return getSetting(db, 'app.port') || '8788';
}

module.exports = {
  createOAuthSession,
  consumeOAuthSession,
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserBoards,
  publishPin,
  startSchedulerWorker,
  getSetting,
  setSetting,
  getChannelConfig,
  setChannelConfig,
};
