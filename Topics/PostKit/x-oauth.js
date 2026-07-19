// X (Twitter) OAuth 2.0 + Publishing for PostKit
const https = require('https');
const crypto = require('crypto');

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

function createOAuthSession(redirectAfter) {
  const { verifier, challenge } = generatePkce();
  const state = generateState();
  _oauthSessions[state] = { verifier, challenge, createdAt: Date.now() };
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

// ── Settings helpers (passed in from server) ─────────────────────────────────

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── OAuth URL builder ───────────────────────────────────────────────────────

function buildAuthUrl(db, redirectUri, state, challenge) {
  const clientId = getSetting(db, 'x.client_id');
  if (!clientId) throw new Error('X client_id not configured. Set it in Settings.');

  const scopes = 'tweet.read tweet.write users.read offline.access';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

// ── Token exchange ──────────────────────────────────────────────────────────

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
    req.write(typeof body === 'string' ? body : new URLSearchParams(body).toString());
    req.end();
  });
}

function httpsPostJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function exchangeCodeForToken(db, code, redirectUri, verifier) {
  const clientId = getSetting(db, 'x.client_id');
  const clientSecret = getSetting(db, 'x.client_secret');
  if (!clientId) throw new Error('X client_id not configured');

  const body = {
    code,
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  };

  const headers = {};
  if (clientSecret) {
    // Confidential client — use Basic auth
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  } else {
    // Public client — include client_id in body
    body.client_id = clientId;
  }

  const result = await httpsPost('https://api.twitter.com/2/oauth2/token', body, headers);
  if (result.status !== 200) {
    throw new Error(`Token exchange failed: ${result.status} ${JSON.stringify(result.json || result.raw)}`);
  }

  return result.json; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(db) {
  const refreshToken = getSetting(db, 'x.refresh_token');
  const clientId = getSetting(db, 'x.client_id');
  if (!refreshToken || !clientId) return null;

  const body = {
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: clientId,
  };

  const result = await httpsPost('https://api.twitter.com/2/oauth2/token', body);
  if (result.status !== 200) {
    console.error('Token refresh failed:', result.status, result.json || result.raw);
    return null;
  }

  const tokens = result.json;
  setSetting(db, 'x.access_token', tokens.access_token);
  if (tokens.refresh_token) setSetting(db, 'x.refresh_token', tokens.refresh_token);
  return tokens.access_token;
}

// ── Publishing ──────────────────────────────────────────────────────────────

async function publishTweet(db, text, mediaPaths) {
  let accessToken = getSetting(db, 'x.access_token');
  if (!accessToken) throw new Error('X not connected. Connect your account in Settings.');

  // Upload media if any
  const mediaIds = [];
  if (mediaPaths && mediaPaths.length) {
    for (const mediaPath of mediaPaths.slice(0, 4)) { // max 4 images per tweet
      const mediaId = await uploadMedia(db, accessToken, mediaPath);
      if (mediaId) mediaIds.push(mediaId);
    }
  }

  // Create tweet
  const tweetBody = { text };
  if (mediaIds.length) tweetBody.media = { media_ids: mediaIds };

  const result = await httpsPostJson('https://api.twitter.com/2/tweets', tweetBody, {
    'Authorization': `Bearer ${accessToken}`,
  });

  if (result.status === 401) {
    // Token expired — try refresh once
    const newToken = await refreshAccessToken(db);
    if (newToken) {
      const retry = await httpsPostJson('https://api.twitter.com/2/tweets', tweetBody, {
        'Authorization': `Bearer ${newToken}`,
      });
      if (retry.status === 201 || retry.status === 200) {
        return { id: retry.json?.data?.id, url: `https://x.com/i/web/status/${retry.json?.data?.id}` };
      }
    }
    throw new Error('X token expired or invalid. Reconnect your account.');
  }

  if (result.status !== 201 && result.status !== 200) {
    throw new Error(`X publish failed: ${result.status} ${JSON.stringify(result.json || result.raw)}`);
  }

  return { id: result.json?.data?.id, url: `https://x.com/i/web/status/${result.json?.data?.id}` };
}

async function uploadMedia(db, accessToken, mediaPath) {
  // Media upload uses v1.1 endpoint — requires reading the file
  const fs = require('fs');
  const path = require('path');
  const MEDIA_DIR = path.join(__dirname, 'media');

  const filePath = path.join(MEDIA_DIR, mediaPath);
  if (!fs.existsSync(filePath)) {
    console.error('Media file not found:', filePath);
    return null;
  }

  const fileData = fs.readFileSync(filePath);
  const ext = path.extname(mediaPath).toLowerCase();
  const mimeType = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.mp4': 'video/mp4',
  }[ext] || 'application/octet-stream';

  // Step 1: INIT
  const initBody = new URLSearchParams({
    command: 'INIT',
    total_bytes: String(fileData.length),
    media_type: mimeType,
  });

  const initResult = await httpsPost('https://upload.twitter.com/1.1/media/upload.json', initBody, {
    'Authorization': `Bearer ${accessToken}`,
  });

  if (initResult.status !== 202 && initResult.status !== 200) {
    console.error('Media INIT failed:', initResult.status, initResult.json);
    return null;
  }

  const mediaId = initResult.json.media_id_string;

  // Step 2: APPEND
  const appendBody = new URLSearchParams({
    command: 'APPEND',
    media_id: mediaId,
    segment_index: '0',
  });

  // For binary upload, we need raw multipart — use a different approach
  return new Promise((resolve) => {
    const urlObj = new URL('https://upload.twitter.com/1.1/media/upload.json');
    const params = new URLSearchParams({
      command: 'APPEND',
      media_id: mediaId,
      segment_index: '0',
    });

    const boundary = '----PostKit' + crypto.randomBytes(8).toString('hex');
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n`);
    const fileB64 = Buffer.from(fileData).toString('base64');
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

    const postBody = Buffer.concat([header, Buffer.from(fileB64), footer]);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + '?' + params.toString(),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': postBody.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        if (res.statusCode !== 204 && res.statusCode !== 200) {
          console.error('Media APPEND failed:', res.statusCode);
          resolve(null);
          return;
        }
        // Step 3: FINALIZE
        const finalizeBody = new URLSearchParams({
          command: 'FINALIZE',
          media_id: mediaId,
        });
        const finResult = await httpsPost('https://upload.twitter.com/1.1/media/upload.json', finalizeBody, {
          'Authorization': `Bearer ${accessToken}`,
        });
        if (finResult.status !== 200 && finResult.status !== 201) {
          console.error('Media FINALIZE failed:', finResult.status);
          resolve(null);
          return;
        }
        resolve(mediaId);
      });
    });
    req.on('error', (e) => { console.error('Media upload error:', e); resolve(null); });
    req.write(postBody);
    req.end();
  });
}

// ── Scheduler Worker ────────────────────────────────────────────────────────

function startSchedulerWorker(db) {
  const CHECK_INTERVAL = 60000; // 1 minute

  setInterval(async () => {
    const now = Date.now();
    // Find due posts: scheduled, scheduled_for in the past, platform = x
    const duePosts = db.prepare(`
      SELECT * FROM posts
      WHERE platform = 'x' AND status = 'scheduled' AND scheduled_for <= ?
    `).all(now);

    for (const post of duePosts) {
      try {
        console.log(`[scheduler] Publishing X post ${post.id}...`);
        let mediaPaths = [];
        try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
        const result = await publishTweet(db, post.post_text, mediaPaths);
        db.prepare('UPDATE posts SET status = ?, posted_at = ?, updated_at = ? WHERE id = ?')
          .run('posted', now, now, post.id);
        console.log(`[scheduler] Published: ${result.url}`);
      } catch(err) {
        console.error(`[scheduler] Failed to publish post ${post.id}:`, err.message);
        // Don't change status — will retry next cycle
      }
    }
  }, CHECK_INTERVAL);

  console.log('[scheduler] X publishing worker started (checking every 60s)');
}

module.exports = {
  createOAuthSession,
  consumeOAuthSession,
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  publishTweet,
  startSchedulerWorker,
  getSetting,
  setSetting,
};
