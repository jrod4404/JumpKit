/**
 * clipkit.js — JumpKit screen capture tool (third sidebar section: CLIPKIT).
 * No-op unless CLIPKIT_ENABLED=true (mirrors NoteKit feature-flag pattern).
 * Flow: New Capture → main opens a transparent fullscreen overlay → drag a
 * region → main captures, saves PNG to userData/clipkit/captures/, copies to
 * clipboard, writes history.json. The CAPTURES page lists history (thumb +
 * time), click = re-copy, right-click/✕ = delete.
 */
(function () {
  'use strict';

  let CK = { enabled: false, history: [] };

  async function init() {
    const api = window.electronAPI;
    if (!api || typeof api.clipkitEnabled !== 'function') return;
    try { CK.enabled = !!(await api.clipkitEnabled()); } catch { CK.enabled = false; }
    if (!CK.enabled) return;
    const label = document.getElementById('clipkitNavLabel');
    const btn = document.getElementById('clipkitNavBtn');
    if (label) label.style.display = 'block';
    if (btn) btn.style.display = 'flex';
  }

  // Render the CAPTURES page (called by the router).
  async function render() {
    const el = document.getElementById('pageContent');
    if (!el) return;
    await refreshHistory();
    el.innerHTML = `<div style="max-width:860px;margin:0 auto;padding:24px 20px 60px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px">
        <div>
          <h1 style="font-size:1.4rem;font-weight:800;margin:0;color:var(--text)">Captures</h1>
          <p style="margin:4px 0 0;color:var(--text-muted);font-size:0.85rem">Grab a region of your screen — it's copied to your clipboard and saved here. Click a capture to view full size; right-click to copy or delete.</p>
        </div>
        <button id="ckNewCapture" class="btn" style="display:inline-flex;align-items:center;gap:7px;background:var(--grad);color:#fff;border:none;border-radius:10px;padding:9px 18px;font-size:0.88rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.18)">
          <svg class="ti ti-clipboard" style="width:1rem;height:1rem;color:inherit;stroke:currentColor;fill:none"><use href="img/tabler-sprite.min.svg#tabler-clipboard"/></svg>
          New Capture
        </button>
      </div>
      <div id="ckMessage"></div>
      <div id="ckGrid">
        ${CK.history.length === 0 ? `<div style="padding:60px 20px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:14px">
          No captures yet. Click <strong>New Capture</strong> to grab your first one.</div>` : CK.history.map(ckCard).join('')}
      </div>
      <div id="ckViewer" style="display:none"></div>
      <div id="ckMenu" style="display:none"></div>
    </div>`;

    const btn = document.getElementById('ckNewCapture');
    if (btn) btn.addEventListener('click', doCapture);
    const grid = document.getElementById('ckGrid');
    if (grid) {
      grid.querySelectorAll('.ck-card').forEach((node) => {
        node.addEventListener('click', () => view(node.dataset.ckId));
        node.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showMenu(e.clientX, e.clientY, node.dataset.ckId);
        });
      });
      grid.querySelectorAll('[data-ck-del]').forEach((node) => {
        node.addEventListener('click', (e) => { e.stopPropagation(); del(node.dataset.ckDel); });
      });
      grid.querySelectorAll('[data-ck-copy]').forEach((node) => {
        node.addEventListener('click', (e) => { e.stopPropagation(); reCopy(node.dataset.ckCopy); });
      });
    }
  }

  function ckCard(rec) {
    const d = new Date(rec.ts);
    const stamp = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="ck-card" data-ck-id="${esc(rec.id)}">
      <div class="ck-thumb" style="background-image:url('${fileUrl(rec.path)}')"></div>
      <div class="ck-main">
        <div class="ck-meta">
          <span class="ck-time">${esc(stamp)}</span>
          <span class="ck-size">${rec.width}×${rec.height} px</span>
        </div>
        <div class="ck-actions">
          <button class="ck-btn" data-ck-copy="${esc(rec.id)}" title="Copy to clipboard">📋 Copy</button>
          <button class="ck-btn" data-ck-del="${esc(rec.id)}" title="Delete capture">🗑 Delete</button>
        </div>
      </div>
    </div>`;
  }

  // ── Full-size viewer modal ─────────────────────────────────────────
  function view(id) {
    const rec = CK.history.find((r) => r.id === id);
    const v = document.getElementById('ckViewer');
    if (!v || !rec) return;
    v.style.display = 'flex';
    v.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:900;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px" onclick="if(event.target===this)ClipKit.closeViewer()">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <button class="btn" style="background:rgba(255,255,255,0.14);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:0.82rem;font-weight:700;cursor:pointer" onclick="ClipKit.copyFromViewer()">📋 Copy to clipboard</button>
        <button class="btn" style="background:rgba(239,68,68,0.85);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:0.82rem;font-weight:700;cursor:pointer" onclick="ClipKit.delFromViewer()">🗑 Delete</button>
        <button class="btn" style="background:rgba(255,255,255,0.14);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:0.82rem;font-weight:700;cursor:pointer" onclick="ClipKit.closeViewer()">✕ Close</button>
      </div>
      <img src="${fileUrl(rec.path)}" data-ck-copy-id="${esc(rec.id)}" style="max-width:100%;max-height:calc(100vh - 110px);border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,0.6);background:#fff" alt="capture"/>
      <div style="color:rgba(255,255,255,0.75);font-size:0.78rem;margin-top:10px">${rec.width}×${rec.height} px · ${esc(new Date(rec.ts).toLocaleString())}</div>
    </div>`;
    document.addEventListener('keydown', ckViewerEsc);
  }
  function ckViewerEsc(e) {
    if (e.key === 'Escape') { document.removeEventListener('keydown', ckViewerEsc); closeViewer(); }
  }
  function closeViewer() {
    const v = document.getElementById('ckViewer');
    if (!v) return;
    v.style.display = 'none';
    v.innerHTML = '';
    document.removeEventListener('keydown', ckViewerEsc);
  }
  function copyFromViewer() {
    const id = document.querySelector('#ckViewer [data-ck-copy-id]')?.dataset.ckCopyId;
    if (id) reCopy(id);
  }
  function delFromViewer() {
    const id = document.querySelector('#ckViewer [data-ck-copy-id]')?.dataset.ckCopyId;
    closeViewer();
    if (id) del(id);
  }

  // ── Right-click context menu ──────────────────────────────────────
  function showMenu(x, y, id) {
    const m = document.getElementById('ckMenu');
    if (!m) return;
    m.style.display = 'block';
    m.innerHTML = `<div style="position:fixed;z-index:950;background:var(--card);border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.35);overflow:hidden;min-width:170px" onclick="event.stopPropagation()">
      <button data-ck-menu-copy="${esc(id)}" style="display:flex;align-items:center;gap:9px;width:100%;padding:10px 14px;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:0.83rem;font-weight:600;cursor:pointer;text-align:left">📋 Copy to clipboard</button>
      <button data-ck-menu-del="${esc(id)}" style="display:flex;align-items:center;gap:9px;width:100%;padding:10px 14px;background:none;border:none;color:#f87171;font-size:0.83rem;font-weight:600;cursor:pointer;text-align:left">🗑 Delete</button>
    </div>`;
    const box = m.firstElementChild;
    box.style.left = Math.min(x, window.innerWidth - 190) + 'px';
    box.style.top = Math.min(y, window.innerHeight - 90) + 'px';
    box.querySelector('[data-ck-menu-copy]').addEventListener('click', () => { hideMenu(); reCopy(id); });
    box.querySelector('[data-ck-menu-del]').addEventListener('click', () => { hideMenu(); del(id); });
    setTimeout(() => document.addEventListener('click', hideMenu), 10);
  }
  function hideMenu() {
    const m = document.getElementById('ckMenu');
    if (!m) return;
    m.style.display = 'none';
    m.innerHTML = '';
    document.removeEventListener('click', hideMenu);
  }

  async function doCapture() {
    const msg = document.getElementById('ckMessage');
    const api = window.electronAPI;
    if (!api) return;
    if (msg) msg.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem">Select a region on screen… (Esc to cancel)</div>`;
    // Defensive timeout so the UI can't hang forever if the capture IPC stalls.
    const timeout = new Promise((res) => setTimeout(() => res({ error: 'Capture timed out waiting for the overlay.' }), 120000));
    let r;
    try { r = await Promise.race([api.clipkitCapture(), timeout]); }
    catch (err) { r = { error: err.message }; }
    if (r && r.error) {
      if (msg) msg.innerHTML = `<div style="color:#f87171;font-size:0.85rem">Capture failed: ${esc(r.error)}</div>`;
    } else if (r && r.id) {
      if (msg) msg.innerHTML = `<div style="color:#34d399;font-size:0.85rem">✓ Captured and copied to clipboard.</div>`;
      CK.history.unshift(r);
      await render();
    } else if (r && r.cancelled) {
      if (msg) msg.innerHTML = '';
    }
  }

  async function refreshHistory() {
    const api = window.electronAPI;
    if (!api || typeof api.clipkitHistory !== 'function') return;
    try { CK.history = (await api.clipkitHistory()) || []; } catch { CK.history = []; }
  }

  async function reCopy(id) {
    const api = window.electronAPI;
    if (!api) return;
    const r = await api.clipkitCopy(id);
    const msg = document.getElementById('ckMessage');
    if (msg) msg.innerHTML = r && r.ok
      ? `<div style="color:#34d399;font-size:0.85rem">✓ Copied to clipboard.</div>`
      : `<div style="color:#f87171;font-size:0.85rem">Could not copy (file may have been deleted).</div>`;
  }

  async function del(id) {
    const api = window.electronAPI;
    if (!api) return;
    await api.clipkitDelete(id);
    await refreshHistory();
    const grid = document.getElementById('ckGrid');
    if (grid) {
      grid.innerHTML = CK.history.length === 0
        ? `<div style="padding:60px 20px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:14px">No captures yet.</div>`
        : CK.history.map(ckCard).join('');
      grid.querySelectorAll('.ck-card').forEach((node) => {
        node.addEventListener('click', () => view(node.dataset.ckId));
        node.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showMenu(e.clientX, e.clientY, node.dataset.ckId);
        });
      });
      grid.querySelectorAll('[data-ck-del]').forEach((node) => {
        node.addEventListener('click', (e) => { e.stopPropagation(); del(node.dataset.ckDel); });
      });
      grid.querySelectorAll('[data-ck-copy]').forEach((node) => {
        node.addEventListener('click', (e) => { e.stopPropagation(); reCopy(node.dataset.ckCopy); });
      });
    }
  }

  function fileUrl(p) {
    if (/^(https?:|data:)/i.test(p)) return p;
    if (/^file:\/\//i.test(p)) return p;
    const norm = p.replace(/\\/g, '/');
    return 'file://' + (norm.startsWith('/') ? norm : '/' + norm);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.ClipKit = { init, render, clearSelection: () => {}, closeViewer, copyFromViewer, delFromViewer };
  // Also expose on window for inline onclick handlers in viewer HTML.
  window.ClipKit.closeViewer = closeViewer;
  window.ClipKit.copyFromViewer = copyFromViewer;
  window.ClipKit.delFromViewer = delFromViewer;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  else setTimeout(init, 300);
})();
