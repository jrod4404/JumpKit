// LinkedIn OAuth 2.0 + Publishing for PostKit
const https = require('https');
const crypto = require('crypto');

// ── Settings helpers ──────────────────────────────────────────────────────────

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── State management (in-memory, cleared on restart) ─────────────────────────

const _oauthStates = {};

function generateState() {
  const state = crypto.randomBytes(16).toString('hex');
  _oauthStates[state] = { createdAt: Date.now() };
  // Clean up old states (>10 min)
  for (const [k, v] of Object.entries(_oauthStates)) {
    if (Date.now() - v.createdAt > 600000) delete _oauthStates[k];
  }
  return state;
}

function consumeState(state) {
  const valid = !!_oauthStates[state];
  delete _oauthStates[state];
  return valid;
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

// ── OAuth URL builder ─────────────────────────────────────────────────────────

function buildAuthUrl(db, redirectUri, state) {
  const clientId = getSetting(db, 'linkedin.client_id');
  if (!clientId) throw new Error('LinkedIn client_id not configured. Set it in Settings.');

  const scopes = 'openid profile email w_member_social';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes,
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

async function exchangeCodeForToken(db, code, redirectUri) {
  const clientId = getSetting(db, 'linkedin.client_id');
  const clientSecret = getSetting(db, 'linkedin.client_secret');
  if (!clientId || !clientSecret) throw new Error('LinkedIn credentials not configured');

  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  };

  const result = await httpsPost('https://www.linkedin.com/oauth/v2/accessToken', body);
  if (result.status !== 200) {
    throw new Error(`LinkedIn token exchange failed: ${result.status} ${JSON.stringify(result.json || result.raw)}`);
  }

  return result.json; // { access_token, expires_in, refresh_token?, ... }
}

async function refreshAccessToken(db) {
  const refreshToken = getSetting(db, 'linkedin.refresh_token');
  const clientId = getSetting(db, 'linkedin.client_id');
  const clientSecret = getSetting(db, 'linkedin.client_secret');
  if (!refreshToken || !clientId || !clientSecret) return null;

  const body = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  };

  const result = await httpsPost('https://www.linkedin.com/oauth/v2/accessToken', body);
  if (result.status !== 200) {
    console.error('LinkedIn token refresh failed:', result.status, result.json || result.raw);
    return null;
  }

  const tokens = result.json;
  setSetting(db, 'linkedin.access_token', tokens.access_token);
  if (tokens.refresh_token) setSetting(db, 'linkedin.refresh_token', tokens.refresh_token);
  return tokens.access_token;
}

// ── Get LinkedIn member URN (required for posting) ────────────────────────────

async function getMemberUrn(db, accessToken) {
  // Check cache first
  const cached = getSetting(db, 'linkedin.member_urn');
  if (cached) return cached;

  const result = await httpsGet('https://api.linkedin.com/v2/userinfo', {
    'Authorization': `Bearer ${accessToken}`,
  });

  if (result.status !== 200) {
    throw new Error(`Failed to get LinkedIn profile: ${result.status}`);
  }

  // OpenID userinfo returns 'sub' as the member ID
  const sub = result.json?.sub;
  if (!sub) throw new Error('LinkedIn profile missing sub/id');
  const urn = `urn:li:person:${sub}`;
  setSetting(db, 'linkedin.member_urn', urn);
  return urn;
}

// ── Publishing ────────────────────────────────────────────────────────────────

async function publishPost(db, text) {
  let accessToken = getSetting(db, 'linkedin.access_token');
  if (!accessToken) throw new Error('LinkedIn not connected. Connect your account in Settings.');

  const authorUrn = await getMemberUrn(db, accessToken);

  const postBody = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const result = await httpsPostJson('https://api.linkedin.com/v2/ugcPosts', postBody, {
    'Authorization': `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
  });

  if (result.status === 401) {
    // Token expired — try refresh once
    const newToken = await refreshAccessToken(db);
    if (newToken) {
      const authorUrn2 = await getMemberUrn(db, newToken);
      postBody.author = authorUrn2;
      const retry = await httpsPostJson('https://api.linkedin.com/v2/ugcPosts', postBody, {
        'Authorization': `Bearer ${newToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      });
      if (retry.status === 201 || retry.status === 200) {
        const postId = retry.json?.id || retry.json?.['id'];
        return { id: postId, url: `https://www.linkedin.com/feed/update/${postId}/` };
      }
    }
    throw new Error('LinkedIn token expired or invalid. Reconnect your account.');
  }

  if (result.status !== 201 && result.status !== 200) {
    throw new Error(`LinkedIn publish failed: ${result.status} ${JSON.stringify(result.json || result.raw)}`);
  }

  const postId = result.json?.id;
  return { id: postId, url: `https://www.linkedin.com/feed/update/${postId}/` };
}

// ── Scheduler Worker ──────────────────────────────────────────────────────────

function startSchedulerWorker(db) {
  const CHECK_INTERVAL = 60000; // 1 minute

  setInterval(async () => {
    const now = Date.now();
    const duePosts = db.prepare(`
      SELECT * FROM posts
      WHERE platform = 'linkedin' AND status = 'scheduled' AND scheduled_for <= ?
    `).all(now);

    for (const post of duePosts) {
      try {
        console.log(`[scheduler] Publishing LinkedIn post ${post.id}...`);
        const result = await publishPost(db, post.post_text);
        db.prepare('UPDATE posts SET status = ?, posted_at = ?, updated_at = ? WHERE id = ?')
          .run('posted', now, now, post.id);
        console.log(`[scheduler] LinkedIn published: ${result.url}`);
      } catch(err) {
        console.error(`[scheduler] LinkedIn publish failed for ${post.id}:`, err.message);
      }
    }
  }, CHECK_INTERVAL);

  console.log('[scheduler] LinkedIn publishing worker started (checking every 60s)');
}

module.exports = {
  generateState,
  consumeState,
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  publishPost,
  startSchedulerWorker,
  getSetting,
  setSetting,
};
