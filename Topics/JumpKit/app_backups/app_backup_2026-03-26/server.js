const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app     = express();
const PORT    = 7823;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Ensure data dir + empty db if missing
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '{}', 'utf8');

app.get('/api/data', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))); }
  catch { res.json({}); }
});

app.post('/api/data', (req, res) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`JumpKit running → http://localhost:${PORT}`));
