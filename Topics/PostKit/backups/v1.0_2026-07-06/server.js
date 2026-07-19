const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

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
`);

// Default settings
const defaultSettings = [
  ['app.port', '8788'],
  ['app.theme', 'dark'],
  ['hermes.config_path', ''],
  ['platform.x.frequency', '5'],
  ['platform.x.best_times', JSON.stringify(['9:00','12:00','17:00'])],
  ['platform.linkedin.frequency', '3'],
  ['platform.linkedin.best_times', JSON.stringify(['8:00','12:00','17:30'])],
  ['platform.youtube.frequency', '1'],
  ['platform.youtube.best_times', JSON.stringify(['15:00','18:00'])],
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of defaultSettings) insertSetting.run(k, v);

// ── Helpers ──────────────────────────────────────────────────────────────────
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

  const enriched = seeds.map(s => ({
    ...s,
    tags: tryParse(s.tags, []),
    media_count: getMediaCount.get(s.id).c,
    posts_count: getPostsCount.get(s.id).c,
    platforms: getPostPlatforms.all(s.id).map(r => r.platform),
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
}

async function uploadMedia(req, res, seedId) {
  const seed = db.prepare('SELECT * FROM seeds WHERE id = ?').get(seedId);
  if (!seed) return send(res, 404, { error: 'Seed not found' });
  const body = await parseBody(req);
  if (!body.data || !body.filename) return send(res, 400, { error: 'Missing data or filename' });
  
  const id = uuid();
  const ext = path.extname(body.filename) || '.bin';
  const filename = `${id}${ext}`;
  const filePath = path.join(MEDIA_DIR, filename);
  
  // Strip data URL prefix if present
  const base64Data = body.data.replace(/^data:[^;]+;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  
  const stat = fs.statSync(filePath);
  db.prepare(`INSERT INTO seed_media (id, seed_id, filename, original_name, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, seedId, filename, body.filename, body.mime_type || 'application/octet-stream', stat.size, now());
  
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

async function updatePost(req, res, id) {
  const body = await parseBody(req);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return send(res, 404, { error: 'Not found' });
  const fields = [];
  const params = [];
  const allowed = ['post_text','media_paths','scheduled_for','status','posted_at','notes','version'];
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
    obj[r.key] = tryParse(r.value, r.value);
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

  // ── API Routes ────────────────────────────────────────────────────────────
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
    if (pathname === '/api/posts' && method === 'GET') return getPosts(req, res);

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

    send(res, 404, { error: 'Route not found' });
  } catch (err) {
    console.error('API error:', err);
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`PostKit running at http://localhost:${PORT}`);
});
