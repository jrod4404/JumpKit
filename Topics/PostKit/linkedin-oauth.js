// LinkedIn OAuth 2.0 + Publishing for PostKit
const https = require('https');
const crypto = require('crypto');

// ── Settings helpers ──────────────────────────────────────────────────────────

// App-level credentials live in the settings table (client_id/secret). Project-
// scoped tokens live in the channel config (passed as `projectId`). Legacy
// fallback keeps the old settings-table keys working for project-less calls.

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getChannelConfig(db, projectId, platform) {
  if (!projectId) {
    const cfg = {};
    const access = getSetting(db, `${platform}.access_token`);
    const refresh = getSetting(db, `${platform}.refresh_token`);
    const memberUrn = getSetting(db, `${platform}.member_urn`);
    if (access) cfg.access_token = access;
    if (refresh) cfg.refresh_token = refresh;
    if (memberUrn) cfg.member_urn = memberUrn;
    return cfg;
  }
  const row = db.prepare('SELECT config FROM channels WHERE project_id = ? AND platform = ?').get(projectId, platform);
  if (!row) return {};
  try { return JSON.parse(row.config || '{}'); } catch { return {}; }
}

function setChannelConfig(db, projectId, platform, configObj) {
  if (!projectId) {
    if (configObj.access_token !== undefined) setSetting(db, `${platform}.access_token`, configObj.access_token);
    if (configObj.refresh_token !== undefined) setSetting(db, `${platform}.refresh_token`, configObj.refresh_token);
    if (configObj.member_urn !== undefined) setSetting(db, `${platform}.member_urn`, configObj.member_urn);
    return;
  }
  const existing = getChannelConfig(db, projectId, platform);
  const merged = { ...existing, ...configObj };
  db.prepare(`UPDATE channels SET config = ?, updated_at = ? WHERE project_id = ? AND platform = ?`)
    .run(JSON.stringify(merged), Date.now(), projectId, platform);
}

// ── State management (in-memory, cleared on restart) ─────────────────────────

const _oauthStates = {};

function generateState(projectId) {
  const state = crypto.randomBytes(16).toString('hex');
  _oauthStates[state] = { createdAt: Date.now(), projectId: projectId || null };
  // Clean up old states (>10 min)
  for (const [k, v] of Object.entries(_oauthStates)) {
    if (Date.now() - v.createdAt > 600000) delete _oauthStates[k];
  }
  return state;
}

function consumeState(state) {
  const valid = _oauthStates[state];
  delete _oauthStates[state];
  if (!valid) return false;
  return valid.projectId || 'proj_default';
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

async function refreshAccessToken(db, projectId) {
  const creds = getChannelConfig(db, projectId, 'linkedin');
  const refreshToken = creds.refresh_token;
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
  setChannelConfig(db, projectId, 'linkedin', {
    access_token: tokens.access_token,
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
  });
  return tokens.access_token;
}

// ── Get LinkedIn member URN (required for posting) ────────────────────────────

async function getMemberUrn(db, accessToken, projectId) {
  // Check cache first (stored in channel config)
  const creds = getChannelConfig(db, projectId, 'linkedin');
  if (creds.member_urn) return creds.member_urn;

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
  setChannelConfig(db, projectId, 'linkedin', { member_urn: urn });
  return urn;
}

// ── Publishing ────────────────────────────────────────────────────────────────

async function publishPost(db, text, mediaPath, projectId) {
  const fs = require('fs');
  const path = require('path');
  const creds = getChannelConfig(db, projectId, 'linkedin');
  let accessToken = creds.access_token;
  if (!accessToken) throw new Error('LinkedIn not connected for this project. Connect your account in Channels.');

  const authorUrn = await getMemberUrn(db, accessToken, projectId);

  let shareMediaCategory = 'NONE';
  let mediaUrn = null;

  if (mediaPath) {
    // Register upload
    const registerBody = {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: authorUrn,
        serviceRelationships: [{
          relationshipType: 'PROJECTION',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    };
    const regResult = await httpsPostJson('https://api.linkedin.com/v2/assets?action=registerUpload', registerBody, {
      'Authorization': `Bearer ${accessToken}`,
    });
    if (regResult.status === 200 || regResult.status === 201) {
      const asset = regResult.json.value.asset;
      const uploadUrl = regResult.json.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;

      // Upload the binary
      const filePath = path.join(__dirname, 'media', mediaPath);
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath);
        await new Promise((resolve, reject) => {
          const urlObj = new URL(uploadUrl);
          const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': fileData.length },
          }, (res) => { res.on('end', resolve); res.on('data', ()=>{}); });
          req.on('error', reject);
          req.write(fileData);
          req.end();
        });
        mediaUrn = asset;
        shareMediaCategory = 'IMAGE';
      }
    }
  }

  const shareContent = {
    shareCommentary: { text },
    shareMediaCategory,
  };
  if (mediaUrn) {
    shareContent.media = [{
      status: 'READY',
      description: { text: text.substring(0, 200) },
      media: mediaUrn,
      title: { text: 'PostKit' },
    }];
  }

  const postBody = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
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
    const newToken = await refreshAccessToken(db, projectId);
    if (newToken) {
      const authorUrn2 = await getMemberUrn(db, newToken, projectId);
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
        let mediaPaths = [];
        try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
        // Resolve the post's owning project → its LinkedIn channel token
        const projectId = post.project_id || 'proj_default';
        const result = await publishPost(db, post.post_text, mediaPaths.length ? mediaPaths[0] : null, projectId);
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
  getChannelConfig,
  setChannelConfig,
};
