#!/usr/bin/env node
/* ===========================
   TodoKit local JSON server
   =========================== */

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'todokit-data.json');
const LEGACY_DATA_FILE = path.join(ROOT, 'taskit-data.json');
const PORT = Number(process.env.PORT || 8787);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const EMPTY_STATE = { projects: [], tasks: [] };

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    try {
      // One-time migration from the old prototype filename.
      await fs.copyFile(LEGACY_DATA_FILE, DATA_FILE);
    } catch {
      await writeJsonAtomic(EMPTY_STATE);
    }
  }
}

async function readState() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.basename(DATA_FILE)}: ${error.message}`);
  }
}

async function writeJsonAtomic(data) {
  const clean = {
    projects: Array.isArray(data.projects) ? data.projects : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await fs.readFile(filePath));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/state' && req.method === 'GET') {
      sendJson(res, 200, await readState());
      return;
    }

    if (req.url === '/api/state' && req.method === 'POST') {
      const body = await readRequestBody(req);
      const data = JSON.parse(body || '{}');
      await writeJsonAtomic(data);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url === '/api/state' && req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  await ensureDataFile();
  console.log(`TodoKit running at http://127.0.0.1:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
