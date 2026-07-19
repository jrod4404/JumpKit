const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

// X OAuth + Publisher
const xOAuth = require('./x-oauth');
const linkedinOAuth = require('./linkedin-oauth');
const { renderImage, DEFAULT_BRAND } = require('./lib/image-renderer');

const PORT = 8788;
const MEDIA_DIR = path.join(__dirname, 'media');
const DB_PATH = path.join(__dirname, 'postkit.db');

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── Database Setup ──────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS seeds (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    tags TEXT DEFAULT '[]',
    campaign TEXT DEFAULT '',
    template TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS seed_media (
    id TEXT PRIMARY KEY,
    seed_id TEXT NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    seed_id TEXT REFERENCES seeds(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    post_text TEXT,
    media_paths TEXT DEFAULT '[]',
    scheduled_for INTEGER,
    status TEXT DEFAULT 'draft',
    posted_at INTEGER,
    version INTEGER DEFAULT 1,
    notes TEXT DEFAULT '',
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS analytics (
    id TEXT PRIMARY KEY,
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    recorded_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    seed_id TEXT REFERENCES seeds(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    error TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS brand_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'JumpKit',
    primary_color TEXT DEFAULT '#0F0F1A',
    accent_color TEXT DEFAULT '#00D4AA',
    text_color TEXT DEFAULT '#FFFFFF',
    logo_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Default settings
const defaultSettings = [
  ['app.port', '8788'],
  ['app.theme', 'dark'],
  ['hermes.config_path', ''],
  ['platform.x.frequency', '5'],
  ['platform.x.posts_per_root', '3'],
  ['platform.x.best_times', JSON.stringify(['9:00','12:00','17:00'])],
  ['platform.linkedin.frequency', '3'],
  ['platform.linkedin.posts_per_root', '1'],
  ['platform.linkedin.best_times', JSON.stringify(['8:00','12:00','17:30'])],
  ['platform.youtube.frequency', '1'],
  ['platform.youtube.posts_per_root', '1'],
  ['platform.youtube.best_times', JSON.stringify(['15:00','18:00'])],
  ['x.client_id', ''],
  ['x.client_secret', ''],
  ['x.access_token', ''],
  ['x.refresh_token', ''],
  ['linkedin.client_id', ''],
  ['linkedin.client_secret', ''],
  ['linkedin.access_token', ''],
  ['linkedin.refresh_token', ''],
  ['linkedin.member_urn', ''],
  ['x.connected', 'false'],
  ['image_gen.api_key', ''],
  ['image_gen.provider', 'openai'],
  ['brand.name', 'JumpKit'],
  ['brand.primary_color', '#0F0F1A'],
  ['brand.accent_color', '#00D4AA'],
  ['brand.text_color', '#FFFFFF'],
  ['image.auto_generate', 'true'],
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of defaultSettings) insertSetting.run(k, v);

// ── Helpers ──────────────────────────────────────────────────────────────────
function getSettingVal(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function generateImage(apiKey, prompt, size) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, quality: 'standard' });
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && json.data[0]) resolve({ url: json.data[0].url });
          else { console.error('DALL-E error:', json); resolve(null); }
        } catch(e) { console.error('DALL-E parse error:', e); resolve(null); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filePath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        resolve();
      });
    }).on('error', reject);
  });
}

// ── Original helpers below ─────────────────────────────────────────────────────
function uuid() { return crypto.randomUUID(); }
function now() { return Date.now(); }

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ── Route Handlers ───────────────────────────────────────────────────────────

// Seeds
function getSeeds(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const campaign = url.searchParams.get('campaign') || '';

  let query = 'SELECT * FROM seeds WHERE 1=1';
  const params = [];

  if (search) { query += ` AND (title LIKE ? OR body LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (status) { query += ` AND status = ?`; params.push(status); }
  if (campaign) { query += ` AND campaign = ?`; params.push(campaign); }
  query += ' ORDER BY created_at DESC';

  const seeds = db.prepare(query).all(...params);
  // Attach media count and posts count
  const getMediaCount = db.prepare('SELECT COUNT(*) as c FROM seed_media WHERE seed_id = ?');
  const getPostsCount = db.prepare('SELECT COUNT(*) as c FROM posts WHERE seed_id = ?');
  const getPostPlatforms = db.prepare('SELECT DISTINCT platform FROM posts WHERE seed_id = ?');
  const getPlatformCount = db.prepare('SELECT platform, COUNT(*) as c FROM posts WHERE seed_id = ? GROUP BY platform');

  const enriched = seeds.map(s => ({
    ...s,
    tags: tryParse(s.tags, []),
    media_count: getMediaCount.get(s.id).c,
    posts_count: getPostsCount.get(s.id).c,
    platforms: getPostPlatforms.all(s.id).map(r => r.platform),
    platform_counts: Object.fromEntries(getPlatformCount.all(s.id).map(r => [r.platform, r.c])),
  }));
  send(res, 200, enriched);
}

async function createSeed(req, res) {
  const body = await parseBody(req);
  const id = uuid();
  const ts = now();
  db.prepare(`INSERT INTO seeds (id, title, body, tags, campaign, template, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
    .run(id, body.title || 'Untitled', body.body || '', JSON.stringify(body.tags || []),
      body.campaign || '', body.template || '', ts, ts);
  send(res, 201, db.prepare('SELECT * FROM seeds WHERE id = ?').get(id));
}

function getSeed(req, res, id) {
  const seed = db.prepare('SELECT * FROM seeds WHERE id = ?').get(id);
  if (!seed) return send(res, 404, { error: 'Not found' });
  seed.tags = tryParse(seed.tags, []);
  seed.media = db.prepare('SELECT * FROM seed_media WHERE seed_id = ? ORDER BY created_at ASC').all(id);
  const posts = db.prepare('SELECT * FROM posts WHERE seed_id = ? ORDER BY platform, scheduled_for ASC').all(id);
  seed.posts = posts.map(p => ({ ...p, media_paths: tryParse(p.media_paths, []) }));
  seed.jobs = db.prepare('SELECT * FROM jobs WHERE seed_id = ? ORDER BY created_at DESC').all(id);
  send(res, 200, seed);
}

async function updateSeed(req, res, id) {
  const body = await parseBody(req);
  const seed = db.prepare('SELECT * FROM seeds WHERE id = ?').get(id);
  if (!seed) return send(res, 404, { error: 'Not found' });
  const fields = [];
  const params = [];
  for (const [k, v] of Object.entries(body)) {
    if (['title','body','tags','campaign','template','status'].includes(k)) {
      fields.push(`${k} = ?`);
      params.push(k === 'tags' ? JSON.stringify(v) : v);
    }
  }
  fields.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE seeds SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  send(res, 200, db.prepare('SELECT * FROM seeds WHERE id = ?').get(id));
}

function deleteSeed(req, res, id) {
  db.prepare('DELETE FROM seeds WHERE id = ?').run(id);
  send(res, 200, { ok: true });
}

async function finalizeSeed(req, res, id) {
  const seed = db.prepare('SELECT * FROM seeds WHERE id = ?').get(id);
  if (!seed) return send(res, 404, { error: 'Not found' });
  const jobId = uuid();
  const ts = now();
  db.prepare(`INSERT INTO jobs (id, seed_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)`)
    .run(jobId, id, ts, ts);
  db.prepare(`UPDATE seeds SET status = 'processing', updated_at = ? WHERE id = ?`).run(ts, id);
  send(res, 201, { job_id: jobId, seed_id: id, status: 'processing' });

  // Auto-trigger Auri in background
  const { spawn } = require('child_process');
  const hermes = '/Users/jeffroder/.hermes/hermes-agent/venv/bin/hermes';
  const proc = spawn(hermes, ['--profile', 'auri', 'chat', '-q', 'Please process all pending PostKit jobs now.'], {
    detached: true,
    stdio: 'ignore'
  });
  proc.unref();
  console.log(`[auri] Auto-triggered for job ${jobId}`);
}

async function uploadMedia(req, res, seedId) {
  const seed = db.prepare('SELECT * FROM seeds WHERE id = ?').get(seedId);
  if (!seed) return send(res, 404, { error: 'Seed not found' });
  const body = await parseBody(req);
  if (!body.data || !body.filename) return send(res, 400, { error: 'Missing data or filename' });
  
  const id = uuid();
  const ext = path.extname(body.filename) || '.bin';
  // Build date-time prefix from seed's creation timestamp
  const seedTs = new Date(seed.created_at);
  const pad = n => String(n).padStart(2, '0');
  const dtPrefix = `${seedTs.getFullYear()}-${pad(seedTs.getMonth()+1)}-${pad(seedTs.getDate())}_${pad(seedTs.getHours())}-${pad(seedTs.getMinutes())}`;
  const folderName = `${dtPrefix}_${seedId}`;
  const seedDir = path.join(MEDIA_DIR, folderName);
  if (!fs.existsSync(seedDir)) fs.mkdirSync(seedDir, { recursive: true });
  const relFilename = `${folderName}/${id}${ext}`;
  const filePath = path.join(MEDIA_DIR, relFilename);
  
  // Strip data URL prefix if present
  const base64Data = body.data.replace(/^data:[^;]+;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  
  const stat = fs.statSync(filePath);
  db.prepare(`INSERT INTO seed_media (id, seed_id, filename, original_name, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, seedId, relFilename, body.filename, body.mime_type || 'application/octet-stream', stat.size, now());
  
  send(res, 201, db.prepare('SELECT * FROM seed_media WHERE id = ?').get(id));
}

function deleteMedia(req, res, seedId, mediaId) {
  const media = db.prepare('SELECT * FROM seed_media WHERE id = ? AND seed_id = ?').get(mediaId, seedId);
  if (!media) return send(res, 404, { error: 'Not found' });
  const filePath = path.join(MEDIA_DIR, media.filename);
  try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  db.prepare('DELETE FROM seed_media WHERE id = ?').run(mediaId);
  send(res, 200, { ok: true });
}

// Posts
function getPosts(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const platform = url.searchParams.get('platform') || '';
  const status = url.searchParams.get('status') || '';
  const seed_id = url.searchParams.get('seed_id') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';

  let query = 'SELECT p.*, s.title as seed_title FROM posts p LEFT JOIN seeds s ON p.seed_id = s.id WHERE 1=1';
  const params = [];

  if (platform) { query += ` AND p.platform = ?`; params.push(platform); }
  if (status) { query += ` AND p.status = ?`; params.push(status); }
  if (seed_id) { query += ` AND p.seed_id = ?`; params.push(seed_id); }
  if (from) { query += ` AND p.scheduled_for >= ?`; params.push(parseInt(from)); }
  if (to) { query += ` AND p.scheduled_for <= ?`; params.push(parseInt(to)); }

  query += ' ORDER BY p.scheduled_for ASC';
  const posts = db.prepare(query).all(...params);
  send(res, 200, posts.map(p => ({ ...p, media_paths: tryParse(p.media_paths, []) })));
}

function getPostsToday(req, res) {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);
  const posts = db.prepare(
    `SELECT p.*, s.title as seed_title FROM posts p 
     LEFT JOIN seeds s ON p.seed_id = s.id
     WHERE p.scheduled_for >= ? AND p.scheduled_for <= ? AND p.status != 'posted'
     ORDER BY p.platform, p.scheduled_for ASC`
  ).all(start.getTime(), end.getTime());
  send(res, 200, posts.map(p => ({ ...p, media_paths: tryParse(p.media_paths, []) })));
}

async function createPost(req, res) {
  const body = await parseBody(req);
  if (!body.platform) return send(res, 400, { error: 'platform is required' });
  const id = uuid();
  const ts = now();
  db.prepare(`INSERT INTO posts (id, seed_id, platform, post_text, media_paths, scheduled_for, status, notes, version, title, image_prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      body.seed_id || null,
      body.platform,
      body.post_text || '',
      JSON.stringify(body.media_paths || []),
      body.scheduled_for || null,
      body.status || 'draft',
      body.notes || '',
      body.version || 1,
      body.title || '',
      body.image_prompt || '',
      ts, ts
    );
  send(res, 201, db.prepare('SELECT * FROM posts WHERE id = ?').get(id));
}

async function updatePost(req, res, id) {
  const body = await parseBody(req);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return send(res, 404, { error: 'Not found' });
  const fields = [];
  const params = [];
  const allowed = ['post_text','media_paths','scheduled_for','status','posted_at','notes','version','title','image_prompt'];
  for (const [k, v] of Object.entries(body)) {
    if (allowed.includes(k)) {
      fields.push(`${k} = ?`);
      params.push(k === 'media_paths' ? JSON.stringify(v) : v);
    }
  }
  if (!fields.length) return send(res, 400, { error: 'No valid fields' });
  fields.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  send(res, 200, db.prepare('SELECT * FROM posts WHERE id = ?').get(id));
}

function deletePost(req, res, id) {
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  send(res, 200, { ok: true });
}

// Calendar
function getCalendar(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const from = parseInt(url.searchParams.get('from') || '0');
  const to = parseInt(url.searchParams.get('to') || String(Date.now() + 86400000 * 365));
  const posts = db.prepare(
    `SELECT p.*, s.title as seed_title FROM posts p 
     LEFT JOIN seeds s ON p.seed_id = s.id
     WHERE p.scheduled_for >= ? AND p.scheduled_for <= ?
     AND p.status = 'scheduled'
     ORDER BY p.scheduled_for ASC`
  ).all(from, to);
  send(res, 200, posts.map(p => ({ ...p, media_paths: tryParse(p.media_paths, []) })));
}

// Analytics
function getAnalytics(req, res) {
  const rows = db.prepare(
    `SELECT a.*, p.platform, p.post_text, p.status as post_status, s.title as seed_title
     FROM analytics a
     LEFT JOIN posts p ON a.post_id = p.id
     LEFT JOIN seeds s ON p.seed_id = s.id
     ORDER BY a.recorded_at DESC`
  ).all();
  send(res, 200, rows);
}

async function createAnalytics(req, res) {
  const body = await parseBody(req);
  if (!body.post_id) return send(res, 400, { error: 'post_id required' });
  const id = uuid();
  db.prepare(`INSERT INTO analytics (id, post_id, likes, comments, views, shares, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, body.post_id, body.likes || 0, body.comments || 0, body.views || 0, body.shares || 0, now());
  send(res, 201, db.prepare('SELECT * FROM analytics WHERE id = ?').get(id));
}

async function updateAnalytics(req, res, id) {
  const body = await parseBody(req);
  const row = db.prepare('SELECT * FROM analytics WHERE id = ?').get(id);
  if (!row) return send(res, 404, { error: 'Not found' });
  const fields = []; const params = [];
  for (const [k, v] of Object.entries(body)) {
    if (['likes','comments','views','shares'].includes(k)) {
      fields.push(`${k} = ?`); params.push(v);
    }
  }
  if (fields.length) {
    params.push(id);
    db.prepare(`UPDATE analytics SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }
  send(res, 200, db.prepare('SELECT * FROM analytics WHERE id = ?').get(id));
}

// Jobs
function getJobs(req, res) {
  const jobs = db.prepare(
    `SELECT j.*, s.title as seed_title FROM jobs j
     LEFT JOIN seeds s ON j.seed_id = s.id
     ORDER BY j.created_at DESC LIMIT 50`
  ).all();
  send(res, 200, jobs);
}

function getPendingJobs(req, res) {
  const jobs = db.prepare(
    `SELECT j.*, s.title as seed_title, s.body as seed_body, s.tags as seed_tags, s.campaign as seed_campaign
     FROM jobs j
     LEFT JOIN seeds s ON j.seed_id = s.id
     WHERE j.status = 'pending'
     ORDER BY j.created_at ASC`
  ).all();

  const getMedia = db.prepare('SELECT * FROM seed_media WHERE seed_id = ?');
  const enriched = jobs.map(j => ({
    ...j,
    seed_tags: tryParse(j.seed_tags, []),
    media: getMedia.all(j.seed_id),
  }));
  send(res, 200, enriched);
}

// Auto-generate images for all posts in a seed (called when Auri finishes)
function autoGenerateImages(db, seedId) {
  const autoGen = getSettingVal(db, 'image.auto_generate');
  if (autoGen === 'false') {
    console.log('[image-gen] Auto-generate disabled, skipping seed', seedId);
    return;
  }

  const seedPosts = db.prepare('SELECT * FROM posts WHERE seed_id = ?').all(seedId);
  if (!seedPosts.length) return;

  const brand = {
    name: getSettingVal(db, 'brand.name') || DEFAULT_BRAND.name,
    primary_color: getSettingVal(db, 'brand.primary_color') || DEFAULT_BRAND.primary_color,
    accent_color: getSettingVal(db, 'brand.accent_color') || DEFAULT_BRAND.accent_color,
    text_color: getSettingVal(db, 'brand.text_color') || DEFAULT_BRAND.text_color,
    logo_path: getSettingVal(db, 'brand.logo_path') || null,
  };

  const seed = db.prepare('SELECT created_at FROM seeds WHERE id = ?').get(seedId);
  const seedTs = seed ? new Date(seed.created_at) : new Date();
  const pad = n => String(n).padStart(2, '0');
  const dtPrefix = `${seedTs.getFullYear()}-${pad(seedTs.getMonth()+1)}-${pad(seedTs.getDate())}_${pad(seedTs.getHours())}-${pad(seedTs.getMinutes())}`;
  const folderName = `${dtPrefix}_${seedId}`;

  let generated = 0;
  for (const post of seedPosts) {
    // YouTube gets a cover image using the title/headline
    let template = 'tip';
    let variables = {};
    if (post.image_prompt) {
      try {
        const parsed = JSON.parse(post.image_prompt);
        if (parsed.template) template = parsed.template;
        if (parsed.variables) variables = parsed.variables;
      } catch(_) {
        // Not JSON — pick template based on platform
        if (post.platform === 'youtube') {
          template = 'announcement';
          variables = {
            BADGE_TEXT: 'VIDEO',
            HEADLINE: post.title || (post.post_text || '').slice(0, 60),
            SUBTEXT: 'Watch now',
          };
        } else {
          variables = { TIP_TEXT: post.post_text || '', CATEGORY_LABEL: (post.platform || '').toUpperCase() };
        }
      }
    } else {
      if (post.platform === 'youtube') {
        template = 'announcement';
        variables = {
          BADGE_TEXT: 'VIDEO',
          HEADLINE: post.title || (post.post_text || '').slice(0, 60),
          SUBTEXT: 'Watch now',
        };
      } else {
        variables = { TIP_TEXT: post.post_text || '', CATEGORY_LABEL: (post.platform || '').toUpperCase() };
      }
    }

    const filename = `${folderName}/${post.id}_${post.platform}.png`;
    const outputPath = path.join(MEDIA_DIR, filename);

    try {
      renderImage({ template, variables, outputPath, brand });
      let mediaPaths = [];
      try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
      mediaPaths = mediaPaths.filter(p => !p.includes(`${post.id}_${post.platform}`));
      mediaPaths.push(filename);
      db.prepare('UPDATE posts SET media_paths = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(mediaPaths), Date.now(), post.id);
      generated++;
    } catch(e) {
      console.error(`[image-gen] Failed for post ${post.id}:`, e.message);
    }
  }
  console.log(`[image-gen] Auto-generated ${generated}/${seedPosts.length} images for seed ${seedId}`);
}

async function updateJob(req, res, id) {
  const body = await parseBody(req);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) return send(res, 404, { error: 'Not found' });
  const ts = now();
  const status = body.status || job.status;
  db.prepare('UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?')
    .run(status, body.error || null, ts, id);
  if (status === 'done' && job.seed_id) {
    db.prepare(`UPDATE seeds SET status = 'done', updated_at = ? WHERE id = ?`).run(ts, job.seed_id);

    // Auto-generate images for all posts in this seed
    autoGenerateImages(db, job.seed_id);
  }
  if (status === 'error' && job.seed_id) {
    db.prepare(`UPDATE seeds SET status = 'error', updated_at = ? WHERE id = ?`).run(ts, job.seed_id);
  }
  send(res, 200, db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
}

// Settings
function getSettings(req, res) {
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  for (const r of rows) {
    // Always return override flags as strings to match JS === 'true' checks
    if (r.key.endsWith('_override')) {
      obj[r.key] = r.value === 'true' || r.value === true ? 'true' : 'false';
    } else {
      obj[r.key] = tryParse(r.value, r.value);
    }
  }
  send(res, 200, obj);
}

async function updateSettings(req, res) {
  const body = await parseBody(req);
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const update = db.transaction((data) => {
    for (const [k, v] of Object.entries(data)) {
      upsert.run(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  });
  update(body);
  send(res, 200, { ok: true });
}

function getHermesConfig(req, res) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('hermes.config_path');
  const configPath = row ? row.value.replace(/^"|"$/g, '') : '';
  if (!configPath) return send(res, 200, { error: 'No Hermes config path set', config: null });
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    send(res, 200, { config: JSON.parse(data), path: configPath });
  } catch (e) {
    send(res, 200, { error: e.message, config: null, path: configPath });
  }
}

const STRATEGY_BASE = '/Users/jeffroder/.hermes/profiles/auri/skills/social-media/social_media_marketer/references';
const STRATEGY_FILES = { youtube: 'youtube_strategy.md', x: 'x_strategy.md', linkedin: 'linkedin_strategy.md' };

function getStrategyFile(req, res, platform) {
  const file = STRATEGY_FILES[platform];
  if (!file) return send(res, 404, { error: 'Unknown platform' });
  try {
    const content = fs.readFileSync(`${STRATEGY_BASE}/${file}`, 'utf8');
    send(res, 200, { platform, content });
  } catch (e) {
    send(res, 200, { platform, content: null, error: e.message });
  }
}

function getStrategyDefaults(req, res) {
  const cfgs = {
    youtube: { file: 'youtube_strategy.md', freq: 5,  times: ['15:00','17:00'] },
    x:       { file: 'x_strategy.md',       freq: 28, times: ['09:00','13:00','18:00'] },
    linkedin:{ file: 'linkedin_strategy.md', freq: 3,  times: ['09:00','12:00'] }
  };
  const result = {};
  for (const [platform, cfg] of Object.entries(cfgs)) {
    try {
      const content = fs.readFileSync(`${STRATEGY_BASE}/${cfg.file}`, 'utf8');
      const versionMatch  = content.match(/\*\*Version:\*\*\s*([\d.]+)/);
      const updatedMatch  = content.match(/\*\*Last Updated:\*\*\s*(\S+)/);
      let freq = cfg.freq;
      if (platform === 'x') {
        const m = content.match(/(\d+)[\u2013\-](\d+)\s*posts?\/day/i);
        if (m) freq = Math.round((parseInt(m[1]) + parseInt(m[2])) / 2) * 7;
      } else if (platform === 'linkedin') {
        const m = content.match(/(\d+)[\u2013\-](\d+)\s*posts?\/week/i);
        if (m) freq = Math.round((parseInt(m[1]) + parseInt(m[2])) / 2);
      }
      result[platform] = { frequency: freq, times: cfg.times, version: versionMatch?.[1] || null, lastUpdated: updatedMatch?.[1] || null };
    } catch(e) {
      result[platform] = { frequency: cfg.freq, times: cfg.times, version: null, lastUpdated: null };
    }
  }
  send(res, 200, result);
}

function getPlatformSettings(req, res) {
  const platforms = ['x', 'linkedin', 'youtube'];
  const result = {};
  for (const p of platforms) {
    const freqOverride = getSettingVal(db, `platform.${p}.freq_override`) === 'true';
    const timesOverride = getSettingVal(db, `platform.${p}.times_override`) === 'true';
    const rootOverride = getSettingVal(db, `platform.${p}.root_override`) === 'true';
    const storedFreq = getSettingVal(db, `platform.${p}.frequency`);
    const storedTimes = getSettingVal(db, `platform.${p}.best_times`);
    const storedRoot = getSettingVal(db, `platform.${p}.posts_per_root`);
    result[p] = {
      frequency: freqOverride && storedFreq ? parseInt(storedFreq) : null,
      frequency_overridden: freqOverride,
      best_times: timesOverride && storedTimes ? tryParse(storedTimes, []) : null,
      times_overridden: timesOverride,
      posts_per_root: storedRoot ? parseInt(storedRoot) : null,
      posts_per_root_overridden: rootOverride
    };
  }
  send(res, 200, result);
}

function tryParse(str, fallback) {
  if (typeof str !== 'string') return str ?? fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const urlObj = new URL(req.url, `http://localhost`);
  const pathname = urlObj.pathname;
  const query = urlObj.searchParams;
  const method = req.method;

  // ── Static files ─────────────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/index.html') {
    return sendFile(res, path.join(__dirname, 'index.html'));
  }
  if (pathname === '/style.css') return sendFile(res, path.join(__dirname, 'style.css'));
  if (pathname === '/app.js') return sendFile(res, path.join(__dirname, 'app.js'));

  // Assets (logos, images, etc.)
  const assetsMatch = pathname.match(/^\/assets\/(.+)$/);
  if (assetsMatch) {
    const safePath = path.normalize(assetsMatch[1]).replace(/^\.\.\//, '');
    return sendFile(res, path.join(__dirname, 'assets', safePath));
  }

  // Media files
  const mediaMatch = pathname.match(/^\/media\/(.+)$/);
  if (mediaMatch) {
    return sendFile(res, path.join(MEDIA_DIR, mediaMatch[1]));
  }

  // ── OAuth Callback (X) ───────────────────────────────────────────────────
  if (pathname === '/oauth/x/callback') {
    try {
      const code = urlObj.searchParams.get('code');
      const state = urlObj.searchParams.get('state');
      const error = urlObj.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`<html><body><h2>Connection cancelled</h2><p>${error}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
      }
      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('Missing code or state');
      }

      const session = xOAuth.consumeOAuthSession(state);
      if (!session) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('Invalid or expired OAuth session');
      }

      const redirectUri = `http://localhost:${PORT}/oauth/x/callback`;
      const tokens = await xOAuth.exchangeCodeForToken(db, code, redirectUri, session.verifier);

      xOAuth.setSetting(db, 'x.access_token', tokens.access_token || '');
      xOAuth.setSetting(db, 'x.refresh_token', tokens.refresh_token || '');
      xOAuth.setSetting(db, 'x.connected', 'true');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>✓ X account connected!</h2><p>You can close this window.</p><script>window.close()</script></body></html>');
    } catch(err) {
      console.error('OAuth callback error:', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h2>Connection failed</h2><p>${err.message}</p></body></html>`);
    }
    return;
  }

  // ── API Routes ────────────────────────────────────────────────────────────

  // OAuth Callback (LinkedIn)
  if (pathname === '/oauth/linkedin/callback') {
    const code = query.get('code');
    const state = query.get('state');
    const error = query.get('error');
    console.log('[linkedin oauth] callback received:', { code: !!code, state, error });
    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html><body style="font-family:sans-serif;padding:20px"><h2>LinkedIn Auth Failed</h2><p>' + error + '</p><script>setTimeout(()=>window.close(),3000)</script></body></html>');
    }
    const stateValid = linkedinOAuth.consumeState(state);
    console.log('[linkedin oauth] state valid:', stateValid);
    if (!code || !stateValid) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html><body style="font-family:sans-serif;padding:20px"><h2>LinkedIn Auth Failed</h2><p>Invalid or expired state. Please try connecting again.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>');
    }
    try {
      const redirectUri = 'http://localhost:' + PORT + '/oauth/linkedin/callback';
      const tokens = await linkedinOAuth.exchangeCodeForToken(db, code, redirectUri);
      linkedinOAuth.setSetting(db, 'linkedin.access_token', tokens.access_token || '');
      if (tokens.refresh_token) linkedinOAuth.setSetting(db, 'linkedin.refresh_token', tokens.refresh_token);
      linkedinOAuth.setSetting(db, 'linkedin.member_urn', '');
      linkedinOAuth.setSetting(db, 'linkedin.connected', 'true');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html><body style="font-family:sans-serif;padding:20px"><h2 style="color:#4ade80">Connected to LinkedIn!</h2><p>You can close this window.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>');
    } catch(err) {
      console.error('[linkedin oauth] token exchange error:', err);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html><body style="font-family:sans-serif;padding:20px"><h2>Connection Failed</h2><p>' + err.message + '</p><script>setTimeout(()=>window.close(),4000)</script></body></html>');
    }
  }

  if (!pathname.startsWith('/api/')) {
    res.writeHead(404); return res.end('Not found');
  }

  try {
    // Seeds
    if (pathname === '/api/seeds') {
      if (method === 'GET') return getSeeds(req, res);
      if (method === 'POST') return createSeed(req, res);
    }

    const seedMatch = pathname.match(/^\/api\/seeds\/([^\/]+)$/);
    if (seedMatch) {
      const id = seedMatch[1];
      if (method === 'GET') return getSeed(req, res, id);
      if (method === 'PUT') return updateSeed(req, res, id);
      if (method === 'DELETE') return deleteSeed(req, res, id);
    }

    const finalizeMatch = pathname.match(/^\/api\/seeds\/([^\/]+)\/finalize$/);
    if (finalizeMatch && method === 'POST') return finalizeSeed(req, res, finalizeMatch[1]);

    const mediaUploadMatch = pathname.match(/^\/api\/seeds\/([^\/]+)\/media$/);
    if (mediaUploadMatch) {
      if (method === 'POST') return uploadMedia(req, res, mediaUploadMatch[1]);
    }

    const mediaDeleteMatch = pathname.match(/^\/api\/seeds\/([^\/]+)\/media\/([^\/]+)$/);
    if (mediaDeleteMatch && method === 'DELETE') return deleteMedia(req, res, mediaDeleteMatch[1], mediaDeleteMatch[2]);

    // Posts
    if (pathname === '/api/posts/today' && method === 'GET') return getPostsToday(req, res);
    if (pathname === '/api/posts') {
      if (method === 'GET') return getPosts(req, res);
      if (method === 'POST') return createPost(req, res);
    }

    const postMatch = pathname.match(/^\/api\/posts\/([^\/]+)$/);
    if (postMatch) {
      const id = postMatch[1];
      if (method === 'PUT') return updatePost(req, res, id);
      if (method === 'DELETE') return deletePost(req, res, id);
    }

    // Calendar
    if (pathname === '/api/calendar' && method === 'GET') return getCalendar(req, res);

    // Analytics
    if (pathname === '/api/analytics') {
      if (method === 'GET') return getAnalytics(req, res);
      if (method === 'POST') return createAnalytics(req, res);
    }
    const analyticsMatch = pathname.match(/^\/api\/analytics\/([^\/]+)$/);
    if (analyticsMatch && method === 'PUT') return updateAnalytics(req, res, analyticsMatch[1]);

    // Jobs
    if (pathname === '/api/jobs/pending' && method === 'GET') return getPendingJobs(req, res);
    if (pathname === '/api/jobs' && method === 'GET') return getJobs(req, res);
    const jobMatch = pathname.match(/^\/api\/jobs\/([^\/]+)$/);
    if (jobMatch && method === 'PUT') return updateJob(req, res, jobMatch[1]);

    // Settings
    if (pathname === '/api/settings') {
      if (method === 'GET') return getSettings(req, res);
      if (method === 'PUT') return updateSettings(req, res);
    }

    if (pathname === '/api/hermes/config' && method === 'GET') return getHermesConfig(req, res);
    const strategyMatch = pathname.match(/^\/api\/strategy\/(youtube|x|linkedin)$/);
    if (strategyMatch && method === 'GET') return getStrategyFile(req, res, strategyMatch[1]);
    if (pathname === '/api/strategy/defaults' && method === 'GET') return getStrategyDefaults(req, res);
    if (pathname === '/api/platform-settings' && method === 'GET') return getPlatformSettings(req, res);

    // ── X OAuth Routes ──────────────────────────────────────────────────────
    // Start OAuth flow
    if (pathname === '/api/x/connect' && method === 'GET') {
      try {
        const redirectUri = `http://localhost:${PORT}/oauth/x/callback`;
        const { state, challenge } = xOAuth.createOAuthSession();
        const authUrl = xOAuth.buildAuthUrl(db, redirectUri, state, challenge);
        send(res, 200, { authUrl });
      } catch(err) {
        send(res, 500, { error: err.message });
      }
      return;
    }

    // Publish a post now
    if (pathname === '/api/x/publish' && method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!body.post_id) return send(res, 400, { error: 'post_id required' });
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(body.post_id);
        if (!post) return send(res, 404, { error: 'Post not found' });
        let mediaPaths = [];
        try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
        const result = await xOAuth.publishTweet(db, post.post_text, mediaPaths);
        db.prepare('UPDATE posts SET status = ?, posted_at = ?, updated_at = ? WHERE id = ?')
          .run('posted', Date.now(), Date.now(), post.id);
        send(res, 200, result);
      } catch(err) {
        send(res, 500, { error: err.message });
      }
      return;
    }

    // Check X connection status
    if (pathname === '/api/x/status' && method === 'GET') {
      const connected = xOAuth.getSetting(db, 'x.connected') === 'true';
      const hasToken = !!xOAuth.getSetting(db, 'x.access_token');
      send(res, 200, { connected: connected && hasToken });
      return;
    }

    // Disconnect
    if (pathname === '/api/x/disconnect' && method === 'POST') {
      xOAuth.setSetting(db, 'x.access_token', '');
      xOAuth.setSetting(db, 'x.refresh_token', '');
      xOAuth.setSetting(db, 'x.connected', 'false');
      send(res, 200, { ok: true });
      return;
    }

    // ── LinkedIn OAuth ───────────────────────────────────────────────────────
    if (pathname === '/oauth/linkedin/callback') {
      const code = query.get('code');
      const state = query.get('state');
      const error = query.get('error');
      console.log('[linkedin oauth] callback received:', { code: !!code, state, error });
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`<html><body style="font-family:sans-serif;padding:20px"><h2>LinkedIn Auth Failed</h2><p>${error}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
      }
      const stateValid = linkedinOAuth.consumeState(state);
      console.log('[linkedin oauth] state valid:', stateValid);
      if (!code || !stateValid) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`<html><body style="font-family:sans-serif;padding:20px"><h2>LinkedIn Auth Failed</h2><p>Invalid or expired state. Please try connecting again.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
      }
      try {
        const redirectUri = `http://localhost:${PORT}/oauth/linkedin/callback`;
        const tokens = await linkedinOAuth.exchangeCodeForToken(db, code, redirectUri);
        linkedinOAuth.setSetting(db, 'linkedin.access_token', tokens.access_token || '');
        if (tokens.refresh_token) linkedinOAuth.setSetting(db, 'linkedin.refresh_token', tokens.refresh_token);
        linkedinOAuth.setSetting(db, 'linkedin.member_urn', ''); // clear cache so it re-fetches
        linkedinOAuth.setSetting(db, 'linkedin.connected', 'true');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;padding:20px"><h2 style="color:#4ade80">✓ LinkedIn Connected!</h2><p>You can close this window.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`);
      } catch(err) {
        console.error('[linkedin oauth] token exchange error:', err);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;padding:20px"><h2>Connection Failed</h2><p>${err.message}</p><script>setTimeout(()=>window.close(),4000)</script></body></html>`);
      }
      return;
    }

    // LinkedIn: start OAuth
    if (pathname === '/api/linkedin/connect' && method === 'POST') {
      try {
        const redirectUri = `http://localhost:${PORT}/oauth/linkedin/callback`;
        const state = linkedinOAuth.generateState();
        const url = linkedinOAuth.buildAuthUrl(db, redirectUri, state);
        send(res, 200, { url });
      } catch(err) {
        send(res, 400, { error: err.message });
      }
      return;
    }

    // LinkedIn: publish
    if (pathname === '/api/linkedin/publish' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { post_id } = body;
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(post_id);
        if (!post) return send(res, 404, { error: 'Post not found' });
        let mediaPaths = [];
        try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
        const result = await linkedinOAuth.publishPost(db, post.post_text, mediaPaths.length ? mediaPaths[0] : null);
        const now = Date.now();
        db.prepare('UPDATE posts SET status = ?, posted_at = ?, updated_at = ? WHERE id = ?')
          .run('posted', now, now, post_id);
        send(res, 200, { ok: true, url: result.url });
      } catch(err) {
        send(res, 500, { error: err.message });
      }
      return;
    }

    // LinkedIn: status
    if (pathname === '/api/linkedin/status' && method === 'GET') {
      const connected = linkedinOAuth.getSetting(db, 'linkedin.connected') === 'true';
      const hasToken = !!linkedinOAuth.getSetting(db, 'linkedin.access_token');
      send(res, 200, { connected: connected && hasToken });
      return;
    }

    // LinkedIn: disconnect
    if (pathname === '/api/linkedin/disconnect' && method === 'POST') {
      linkedinOAuth.setSetting(db, 'linkedin.access_token', '');
      linkedinOAuth.setSetting(db, 'linkedin.refresh_token', '');
      linkedinOAuth.setSetting(db, 'linkedin.member_urn', '');
      linkedinOAuth.setSetting(db, 'linkedin.connected', 'false');
      send(res, 200, { ok: true });
      return;
    }

    // ── Image Generation ─────────────────────────────────────────────────────
    const imgGenMatch = pathname.match(/^\/api\/posts\/([^\/]+)\/generate-image$/);
    if (imgGenMatch && method === 'POST') {
      try {
        const postId = imgGenMatch[1];
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
        if (!post) return send(res, 404, { error: 'Post not found' });

        const prompt = post.image_prompt || post.notes || '';
        if (!prompt) return send(res, 400, { error: 'No image prompt found for this post' });

        const apiKey = getSettingVal(db, 'image_gen.api_key') || getSettingVal(db, 'openai.api_key');
        if (!apiKey) return send(res, 400, { error: 'No image generation API key configured. Set image_gen.api_key in Settings.' });

        // Call OpenAI DALL-E 3 API
        const isThumbnail = post.platform === 'youtube';
        const size = isThumbnail ? '1792x1024' : '1024x1024';
        const imgResult = await generateImage(apiKey, prompt, size);

        if (!imgResult || !imgResult.url) return send(res, 500, { error: 'Image generation failed' });

        // Download the image and save to media folder
        const seedId = post.seed_id;
        const seed = db.prepare('SELECT created_at FROM seeds WHERE id = ?').get(seedId);
        const seedTs = seed ? new Date(seed.created_at) : new Date();
        const pad = n => String(n).padStart(2,'0');
        const dtPrefix = `${seedTs.getFullYear()}-${pad(seedTs.getMonth()+1)}-${pad(seedTs.getDate())}_${pad(seedTs.getHours())}-${pad(seedTs.getMinutes())}`;
        const folderName = `${dtPrefix}_${seedId}`;
        const seedDir = path.join(MEDIA_DIR, folderName);
        if (!fs.existsSync(seedDir)) fs.mkdirSync(seedDir, { recursive: true });

        const imgId = uuid();
        const filename = `${folderName}/${imgId}.png`;
        const filePath = path.join(MEDIA_DIR, filename);

        await downloadImage(imgResult.url, filePath);

        // Attach to post
        let mediaPaths = [];
        try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
        mediaPaths.push(filename);
        db.prepare('UPDATE posts SET media_paths = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(mediaPaths), Date.now(), postId);

        send(res, 200, { ok: true, filename, media_paths: mediaPaths });
      } catch(err) {
        send(res, 500, { error: err.message });
      }
      return;
    }

    // ── Brand Config ────────────────────────────────────────────────────────
    if (pathname === '/api/brand' && method === 'GET') {
      const brand = {
        name: getSettingVal(db, 'brand.name') || DEFAULT_BRAND.name,
        primary_color: getSettingVal(db, 'brand.primary_color') || DEFAULT_BRAND.primary_color,
        accent_color: getSettingVal(db, 'brand.accent_color') || DEFAULT_BRAND.accent_color,
        text_color: getSettingVal(db, 'brand.text_color') || DEFAULT_BRAND.text_color,
        logo_path: getSettingVal(db, 'brand.logo_path') || null,
      };
      return send(res, 200, brand);
    }

    if (pathname === '/api/brand' && method === 'PUT') {
      const body = await parseBody(req);
      const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      if (body.name) upsert.run('brand.name', body.name);
      if (body.primary_color) upsert.run('brand.primary_color', body.primary_color);
      if (body.accent_color) upsert.run('brand.accent_color', body.accent_color);
      if (body.text_color) upsert.run('brand.text_color', body.text_color);
      return send(res, 200, { ok: true });
    }

    // Brand logo upload
    if (pathname === '/api/brand/logo' && method === 'POST') {
      const body = await parseBody(req);
      const ext = body.filename.match(/\.(png|svg|jpg|jpeg)$/i)?.[0] || '.png';
      const logoFilename = 'brand-logo' + ext;
      const logoPath = path.join(MEDIA_DIR, logoFilename);
      // Ensure media dir exists
      if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
      fs.writeFileSync(logoPath, Buffer.from(body.data, 'base64'));
      const storedPath = 'media/' + logoFilename;
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('brand.logo_path', storedPath);
      return send(res, 200, { ok: true, path: storedPath });
    }

    // Brand logo delete
    if (pathname === '/api/brand/logo' && method === 'DELETE') {
      const logoPath = getSettingVal(db, 'brand.logo_path');
      if (logoPath) {
        const fullPath = path.join(__dirname, logoPath);
        if (fs.existsSync(fullPath)) { try { fs.unlinkSync(fullPath); } catch(_) {} }
        db.prepare('DELETE FROM settings WHERE key = ?').run('brand.logo_path');
      }
      return send(res, 200, { ok: true });
    }

    // ── Templates List ──────────────────────────────────────────────────────
    if (pathname === '/api/templates' && method === 'GET') {
      const templates = [
        { id: 'quote', name: 'Quote', description: 'Inspirational quotes and hot takes' },
        { id: 'stat', name: 'Stat / Number', description: 'Data points and metrics' },
        { id: 'tip', name: 'Tip', description: 'Quick tips and advice' },
        { id: 'announcement', name: 'Announcement', description: 'Product updates and news' },
        { id: 'list-cover', name: 'Thread Cover', description: 'Thread starters and lists' },
      ];
      return send(res, 200, templates);
    }

    // ── Generate image from template for a specific post ────────────────────
    const imgTplMatch = pathname.match(/^\/api\/posts\/([^\/]+)\/generate-template-image$/);
    if (imgTplMatch && method === 'POST') {
      const postId = imgTplMatch[1];
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
      if (!post) return send(res, 404, { error: 'Post not found' });

      const body = await parseBody(req);
      const template = body.template || 'tip';
      const variables = body.variables || {};

      // Build brand config from settings
      const brand = {
        name: getSettingVal(db, 'brand.name') || DEFAULT_BRAND.name,
        primary_color: getSettingVal(db, 'brand.primary_color') || DEFAULT_BRAND.primary_color,
        accent_color: getSettingVal(db, 'brand.accent_color') || DEFAULT_BRAND.accent_color,
        text_color: getSettingVal(db, 'brand.text_color') || DEFAULT_BRAND.text_color,
        logo_path: getSettingVal(db, 'brand.logo_path') || null,
      };

      // Build output path
      const seedId = post.seed_id || 'orphan';
      const seed = post.seed_id ? db.prepare('SELECT created_at FROM seeds WHERE id = ?').get(post.seed_id) : null;
      const seedTs = seed ? new Date(seed.created_at) : new Date();
      const pad = n => String(n).padStart(2, '0');
      const dtPrefix = `${seedTs.getFullYear()}-${pad(seedTs.getMonth()+1)}-${pad(seedTs.getDate())}_${pad(seedTs.getHours())}-${pad(seedTs.getMinutes())}`;
      const folderName = `${dtPrefix}_${seedId}`;
      const filename = `${folderName}/${postId}_${post.platform}.png`;
      const outputPath = path.join(MEDIA_DIR, filename);

      renderImage({ template, variables, outputPath, brand });

      // Attach to post
      let mediaPaths = [];
      try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
      mediaPaths.push(filename);
      db.prepare('UPDATE posts SET media_paths = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(mediaPaths), Date.now(), postId);

      return send(res, 200, { ok: true, filename, media_paths: mediaPaths });
    }

    // ── Generate images for ALL posts in a seed ──────────────────────────────
    const seedImgMatch = pathname.match(/^\/api\/seeds\/([^\/]+)\/generate-all-images$/);
    if (seedImgMatch && method === 'POST') {
      const seedId = seedImgMatch[1];
      const seedPosts = db.prepare('SELECT * FROM posts WHERE seed_id = ?').all(seedId);
      if (!seedPosts.length) return send(res, 200, { ok: true, generated: 0, message: 'No posts found' });

      const brand = {
        name: getSettingVal(db, 'brand.name') || DEFAULT_BRAND.name,
        primary_color: getSettingVal(db, 'brand.primary_color') || DEFAULT_BRAND.primary_color,
        accent_color: getSettingVal(db, 'brand.accent_color') || DEFAULT_BRAND.accent_color,
        text_color: getSettingVal(db, 'brand.text_color') || DEFAULT_BRAND.text_color,
        logo_path: getSettingVal(db, 'brand.logo_path') || null,
      };

      const seed = db.prepare('SELECT created_at FROM seeds WHERE id = ?').get(seedId);
      const seedTs = seed ? new Date(seed.created_at) : new Date();
      const pad = n => String(n).padStart(2, '0');
      const dtPrefix = `${seedTs.getFullYear()}-${pad(seedTs.getMonth()+1)}-${pad(seedTs.getDate())}_${pad(seedTs.getHours())}-${pad(seedTs.getMinutes())}`;
      const folderName = `${dtPrefix}_${seedId}`;

      let generated = 0;
      for (const post of seedPosts) {
        // Pick template for each post (including YouTube)
        let template = 'tip';
        let variables = {};
        if (post.image_prompt) {
          try {
            const parsed = JSON.parse(post.image_prompt);
            if (parsed.template) template = parsed.template;
            if (parsed.variables) variables = parsed.variables;
          } catch(_) {
            if (post.platform === 'youtube') {
              template = 'announcement';
              variables = { BADGE_TEXT: 'VIDEO', HEADLINE: post.title || (post.post_text||'').slice(0,60), SUBTEXT: 'Watch now' };
            } else {
              variables = { TIP_TEXT: post.post_text || '', CATEGORY_LABEL: post.platform.toUpperCase() };
            }
          }
        } else {
          if (post.platform === 'youtube') {
            template = 'announcement';
            variables = { BADGE_TEXT: 'VIDEO', HEADLINE: post.title || (post.post_text||'').slice(0,60), SUBTEXT: 'Watch now' };
          } else {
            variables = { TIP_TEXT: post.post_text || '', CATEGORY_LABEL: post.platform.toUpperCase() };
          }
        }

        const filename = `${folderName}/${post.id}_${post.platform}.png`;
        const outputPath = path.join(MEDIA_DIR, filename);

        try {
          renderImage({ template, variables, outputPath, brand });
          let mediaPaths = [];
          try { mediaPaths = JSON.parse(post.media_paths || '[]'); } catch(_) {}
          // Replace any existing generated image (same naming pattern)
          mediaPaths = mediaPaths.filter(p => !p.includes(`${post.id}_${post.platform}`));
          mediaPaths.push(filename);
          db.prepare('UPDATE posts SET media_paths = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(mediaPaths), Date.now(), post.id);
          generated++;
        } catch(e) {
          console.error(`Image gen failed for post ${post.id}:`, e.message);
        }
      }

      return send(res, 200, { ok: true, generated, total: seedPosts.length });
    }

    // Template preview (renders to media/preview.png and returns URL)
    if (pathname === '/api/templates/preview' && method === 'POST') {
      const body = await parseBody(req);
      const template = body.template || 'tip';
      const variables = body.variables || {};
      const brand = {
        name: getSettingVal(db, 'brand.name') || DEFAULT_BRAND.name,
        primary_color: getSettingVal(db, 'brand.primary_color') || DEFAULT_BRAND.primary_color,
        accent_color: getSettingVal(db, 'brand.accent_color') || DEFAULT_BRAND.accent_color,
        text_color: getSettingVal(db, 'brand.text_color') || DEFAULT_BRAND.text_color,
        logo_path: getSettingVal(db, 'brand.logo_path') || null,
      };
      const previewPath = path.join(MEDIA_DIR, 'preview.png');
      renderImage({ template, variables, outputPath: previewPath, brand });
      return send(res, 200, { ok: true, url: '/media/preview.png' });
    }

    send(res, 404, { error: 'Route not found' });
  } catch (err) {
    console.error('API error:', err);
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`PostKit running at http://localhost:${PORT}`);
  xOAuth.startSchedulerWorker(db);
linkedinOAuth.startSchedulerWorker(db);
});
