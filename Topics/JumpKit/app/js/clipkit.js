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
          <p style="margin:4px 0 0;color:var(--text-muted);font-size:0.85rem">Grab a region of your screen — it's copied to your clipboard and saved here.</p>
        </div>
        <button id="ckNewCapture" class="btn" style="display:inline-flex;align-items:center;gap:7px;background:var(--grad);color:#fff;border:none;border-radius:10px;padding:9px 18px;font-size:0.88rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.18)">
          <svg class="ti ti-clipboard" style="width:1rem;height:1rem"><use href="img/tabler-sprite.min.svg#tabler-clipboard"/></svg>
          New Capture
        </button>
      </div>
      <div id="ckMessage"></div>
      <div id="ckGrid">
        ${CK.history.length === 0 ? `<div style="padding:60px 20px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:14px">
          No captures yet. Click <strong>New Capture</strong> to grab your first one.</div>` : CK.history.map(ckCard).join('')}
      </div>
    </div>`;

    const btn = document.getElementById('ckNewCapture');
    if (btn) btn.addEventListener('click', doCapture);
    const grid = document.getElementById('ckGrid');
    if (grid) {
      grid.querySelectorAll('[data-ck-copy]').forEach((node) => {
        node.addEventListener('click', () => reCopy(node.dataset.ckCopy));
      });
      grid.querySelectorAll('[data-ck-del]').forEach((node) => {
        node.addEventListener('click', (e) => { e.stopPropagation(); del(node.dataset.ckDel); });
      });
    }
  }

  function ckCard(rec) {
    const d = new Date(rec.ts);
    const stamp = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="ck-card" data-ck-copy="${esc(rec.id)}" title="Copy to clipboard">
      <div class="ck-thumb" style="background-image:url('${fileUrl(rec.path)}')"></div>
      <div class="ck-meta">
        <span class="ck-time">${esc(stamp)}</span>
        <span class="ck-size">${rec.width}×${rec.height}</span>
      </div>
      <button class="ck-del" data-ck-del="${esc(rec.id)}" title="Delete capture">✕</button>
    </div>`;
  }

  async function doCapture() {
    const msg = document.getElementById('ckMessage');
    const api = window.electronAPI;
    if (!api) return;
    // Hide the capture button state, then start.
    if (msg) msg.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem">Select a region on screen… (Esc to cancel)</div>`;
    const r = await api.clipkitCapture();
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
    if (grid) grid.innerHTML = CK.history.length === 0
      ? `<div style="padding:60px 20px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:14px">No captures yet.</div>`
      : CK.history.map(ckCard).join('');
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

  window.ClipKit = { init, render, clearSelection: () => {} };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  else setTimeout(init, 300);
})();
