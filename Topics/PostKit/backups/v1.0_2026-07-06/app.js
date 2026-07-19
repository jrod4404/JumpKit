/* =========================================================
   PostKit — app.js
   Vanilla JS, no framework, no imports, no bundler.
   Runs directly in browser via <script src="app.js">
   ========================================================= */

'use strict';

/* ---------------------------------------------------------
   Constants & State
   --------------------------------------------------------- */
const API = 'http://localhost:8788/api';

const PLATFORM_COLORS = {
  x:        'var(--text)',
  linkedin: '#0077b5',
  youtube:  '#c0392b'
};

const PLATFORM_LABELS = { x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube' };

// Global state used by inline onclick handlers in index.html
window._currentSeedId   = null;
window._currentPostId   = null;       // for edit-post modal
window._analyticsRecord = null;       // {postId, recordId} for analytics modal

/* ---------------------------------------------------------
   Utility helpers
   --------------------------------------------------------- */
function apiUrl(path) { return API + path; }

async function apiFetch(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); msg = body.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDatetime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toLocalDatetimeInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeInput(val) {
  if (!val) return null;
  return new Date(val).getTime();
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function platformChip(platform) {
  const color = PLATFORM_COLORS[platform] || '#888';
  const label = PLATFORM_LABELS[platform] || platform;
  return `<span class="platform-chip" style="background:${color};color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">${escHtml(label)}</span>`;
}

function statusBadge(status) {
  const map = {
    draft:      'badge-muted',
    processing: 'badge-warning',
    done:       'badge-success',
    error:      'badge-danger',
    scheduled:  'badge-info',
    posted:     'badge-success',
    pending:    'badge-warning'
  };
  const cls = map[status] || 'badge-muted';
  return `<span class="badge ${cls}">${escHtml(status || '—')}</span>`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast('Copied to clipboard'),
    () => showToast('Copy failed', 'error')
  );
}
// Expose globally for inline usage
window.copyToClipboard = copyToClipboard;

/* ---------------------------------------------------------
   Modal helpers
   --------------------------------------------------------- */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
window.closeModal = closeModal;

// Close modal when clicking the overlay backdrop
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
  }
});

/* ---------------------------------------------------------
   Theme
   --------------------------------------------------------- */
function initTheme() {
  const saved = localStorage.getItem('postkit-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('postkit-theme', next);
}

/* ---------------------------------------------------------
   Tab Navigation
   --------------------------------------------------------- */
const TAB_PANES = ['content', 'calendar', 'today', 'analytics', 'settings'];

const TAB_META = {
  content:   {
    title: 'Content',
    desc: 'Create and manage seed content packages for Hermes to process',
    icon: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`
  },
  calendar:  {
    title: 'Calendar',
    desc: 'View and manage your scheduled posts across all platforms',
    icon: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="14" height="12" rx="2"/><line x1="5" y1="1" x2="5" y2="5"/><line x1="11" y1="1" x2="11" y2="5"/><line x1="1" y1="7" x2="15" y2="7"/></svg>`
  },
  today:     {
    title: 'Today',
    desc: 'Posts scheduled for today — copy, review, and mark as posted',
    icon: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><polyline points="8,4 8,8 11,10"/></svg>`
  },
  analytics: {
    title: 'Analytics',
    desc: 'Track performance metrics for your posted content',
    icon: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="9" width="3" height="5" fill="currentColor" opacity="0.7" stroke="none"/><rect x="6.5" y="5" width="3" height="9" fill="currentColor" opacity="0.7" stroke="none"/><rect x="11" y="2" width="3" height="12" fill="currentColor" opacity="0.7" stroke="none"/></svg>`
  },
  settings:  {
    title: 'Settings',
    desc: 'Configure app preferences, Hermes connection, and platform criteria',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
  },
};

function switchTab(tab) {
  TAB_PANES.forEach(t => {
    const pane = document.getElementById(`tab-${t}`);
    if (pane) pane.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Update topbar
  const meta = TAB_META[tab] || {};
  const iconEl = document.getElementById('topbarIcon');
  const titleEl = document.getElementById('topbarTitle');
  const subEl = document.getElementById('topbarSubtitle');
  if (iconEl) iconEl.innerHTML = meta.icon || '';
  if (titleEl) titleEl.textContent = meta.title || tab;
  if (subEl) subEl.textContent = meta.desc || '';
  // Load tab content
  switch(tab) {
    case 'content':   loadContent();   break;
    case 'calendar':  loadCalendar();  break;
    case 'today':     loadToday();     break;
    case 'analytics': loadAnalytics(); break;
    case 'settings':  loadSettings();  break;
  }
}

function initNav() {
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  // Theme toggle
  const tt = document.getElementById('theme-toggle');
  if (tt) tt.addEventListener('click', toggleTheme);

  // Sidebar collapse/expand
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebar = document.querySelector('.sidebar');
  if (sidebarToggleBtn && sidebar) {
    // Restore saved state
    if (localStorage.getItem('pk_sidebar_collapsed') === '1') {
      sidebar.classList.add('collapsed');
      sidebarToggleBtn.title = 'Expand sidebar';
    }
    sidebarToggleBtn.addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('collapsed');
      localStorage.setItem('pk_sidebar_collapsed', isCollapsed ? '1' : '0');
      sidebarToggleBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    });
  }
}

/* =========================================================
   CONTENT TAB
   ========================================================= */
let _seedFilters = { search: '', status: '', campaign: '' };

function loadContent() {
  const pane = document.getElementById('tab-content');
  pane.innerHTML = `
    <div class="tab-header">
      <button class="btn-primary" onclick="openNewSeedModal()">+ New Seed</button>
    </div>
    <div class="filter-row">
      <input type="text" class="form-input filter-search" id="seed-search" placeholder="Search seeds..." value="${escHtml(_seedFilters.search)}">
      <select class="form-input filter-select" id="seed-status-filter">
        <option value="">All Status</option>
        <option value="draft" ${_seedFilters.status==='draft'?'selected':''}>Draft</option>
        <option value="processing" ${_seedFilters.status==='processing'?'selected':''}>Processing</option>
        <option value="done" ${_seedFilters.status==='done'?'selected':''}>Done</option>
        <option value="error" ${_seedFilters.status==='error'?'selected':''}>Error</option>
      </select>
      <input type="text" class="form-input filter-campaign" id="seed-campaign-filter" placeholder="Filter by campaign..." value="${escHtml(_seedFilters.campaign)}">
    </div>
    <div id="seeds-grid" class="card-grid">
      <div class="loading">Loading seeds…</div>
    </div>`;

  // Wire filters
  let debounce;
  pane.querySelector('#seed-search').addEventListener('input', e => {
    _seedFilters.search = e.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(fetchSeeds, 300);
  });
  pane.querySelector('#seed-status-filter').addEventListener('change', e => {
    _seedFilters.status = e.target.value;
    fetchSeeds();
  });
  pane.querySelector('#seed-campaign-filter').addEventListener('input', e => {
    _seedFilters.campaign = e.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(fetchSeeds, 300);
  });

  fetchSeeds();
}

async function fetchSeeds() {
  const params = new URLSearchParams();
  if (_seedFilters.search)   params.set('search', _seedFilters.search);
  if (_seedFilters.status)   params.set('status', _seedFilters.status);
  if (_seedFilters.campaign) params.set('campaign', _seedFilters.campaign);
  const qs = params.toString();

  try {
    const seeds = await apiFetch('/seeds' + (qs ? '?' + qs : ''));
    renderSeedsGrid(seeds);
  } catch(err) {
    const grid = document.getElementById('seeds-grid');
    if (grid) grid.innerHTML = `<div class="error-msg">Failed to load seeds: ${escHtml(err.message)}</div>`;
  }
}

function renderSeedsGrid(seeds) {
  const grid = document.getElementById('seeds-grid');
  if (!grid) return;
  if (!seeds || seeds.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>No seeds yet. Create your first one!</p></div>`;
    return;
  }
  grid.innerHTML = seeds.map(seed => {
    let tags = [];
    try { tags = JSON.parse(seed.tags || '[]'); } catch(_) {}
    const platforms = []; // seeds don't have platforms directly — shown via posts
    const bodyPreview = (seed.body || '').slice(0, 120) + ((seed.body || '').length > 120 ? '…' : '');
    return `
    <div class="card seed-card" onclick="openSeedDetail('${escHtml(seed.id)}')">
      <div class="card-header">
        <span class="seed-title">${escHtml(seed.title)}</span>
        ${statusBadge(seed.status)}
      </div>
      <p class="card-body-preview">${escHtml(bodyPreview)}</p>
      <div class="card-footer">
        <div class="tag-chips">
          ${tags.slice(0,3).map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')}
        </div>
        <span class="card-date">${formatDate(seed.created_at)}</span>
      </div>
      ${seed.campaign ? `<div class="card-campaign">📁 ${escHtml(seed.campaign)}</div>` : ''}
    </div>`;
  }).join('');
}

/* New Seed Modal */
function openNewSeedModal() {
  // Reset form
  const form = document.getElementById('form-new-seed');
  if (form) form.reset();
  openModal('modal-new-seed');
}
window.openNewSeedModal = openNewSeedModal;

async function submitNewSeed(event) {
  event.preventDefault();
  const title    = document.getElementById('new-seed-title').value.trim();
  const body     = document.getElementById('new-seed-body').value.trim();
  const tagsRaw  = document.getElementById('new-seed-tags').value.trim();
  const campaign = document.getElementById('new-seed-campaign').value.trim();

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  try {
    await apiFetch('/seeds', {
      method: 'POST',
      body: JSON.stringify({ title, body, tags: JSON.stringify(tags), campaign })
    });
    showToast('Seed created!');
    closeModal('modal-new-seed');
    fetchSeeds();
  } catch(err) {
    showToast('Failed to create seed: ' + err.message, 'error');
  }
}
window.submitNewSeed = submitNewSeed;

/* Seed Detail Modal */
async function openSeedDetail(seedId) {
  window._currentSeedId = seedId;
  openModal('modal-seed-detail');
  // Show loading state
  document.getElementById('seed-detail-title').textContent = 'Loading…';
  document.getElementById('seed-detail-posts').innerHTML = '<div class="loading">Loading posts…</div>';

  try {
    const seed = await apiFetch(`/seeds/${seedId}`);
    populateSeedDetail(seed);
  } catch(err) {
    showToast('Failed to load seed: ' + err.message, 'error');
  }
}
window.openSeedDetail = openSeedDetail;

function populateSeedDetail(seed) {
  document.getElementById('seed-detail-title').textContent = seed.title || 'Untitled';
  document.getElementById('seed-detail-status-badge').innerHTML = statusBadge(seed.status);
  document.getElementById('seed-detail-campaign').textContent = seed.campaign || '—';
  document.getElementById('seed-detail-created').textContent = formatDate(seed.created_at);
  document.getElementById('seed-detail-body').value = seed.body || '';

  // Tags
  let tags = [];
  try { tags = JSON.parse(seed.tags || '[]'); } catch(_) {}
  const tagsEl = document.getElementById('seed-detail-tags');
  tagsEl.innerHTML = tags.length
    ? tags.map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')
    : '<span class="text-muted">No tags</span>';

  // Media gallery
  renderMediaGallery(seed.id, seed.media || []);

  // Jobs
  renderJobStatus(seed.jobs || []);

  // Posts grouped by platform
  renderSeedPosts(seed.posts || []);

  // Finalize button state
  const btnFinalize = document.getElementById('btn-finalize');
  if (btnFinalize) {
    const canFinalize = seed.status === 'draft' || seed.status === 'error';
    btnFinalize.disabled = !canFinalize;
    btnFinalize.textContent = canFinalize ? '⚡ Finalize & Send to Hermes' : '✓ Sent to Hermes';
  }
}

function renderMediaGallery(seedId, mediaItems) {
  const gallery = document.getElementById('seed-detail-media');
  if (!gallery) return;
  if (!mediaItems.length) {
    gallery.innerHTML = '<span class="text-muted">No media attached</span>';
    return;
  }
  gallery.innerHTML = mediaItems.map(m => `
    <div class="media-thumb-wrapper" data-mid="${escHtml(m.id)}">
      ${m.mime_type && m.mime_type.startsWith('image/')
        ? `<img class="media-thumb" src="http://localhost:8788/media/${escHtml(m.filename)}" alt="${escHtml(m.original_name)}" title="${escHtml(m.original_name)}">`
        : `<div class="media-thumb media-file-icon">📎 ${escHtml(m.original_name)}</div>`
      }
      <button class="media-delete-btn" onclick="deleteMedia('${escHtml(seedId)}','${escHtml(m.id)}')" title="Remove">✕</button>
    </div>`).join('');
}

function renderJobStatus(jobs) {
  const el = document.getElementById('seed-detail-jobs');
  if (!el) return;
  if (!jobs.length) {
    el.innerHTML = '<span class="text-muted">No jobs yet</span>';
    return;
  }
  el.innerHTML = jobs.map(j => `
    <div class="job-row">
      ${statusBadge(j.status)}
      <span class="text-muted" style="font-size:12px;margin-left:8px">${formatDatetime(j.updated_at)}</span>
      ${j.error ? `<span class="error-inline" style="color:var(--danger);margin-left:8px;font-size:12px">${escHtml(j.error)}</span>` : ''}
    </div>`).join('');
}

function renderSeedPosts(posts) {
  const el = document.getElementById('seed-detail-posts');
  const countEl = document.getElementById('seed-posts-count');
  if (!el) return;
  if (countEl) countEl.textContent = `${posts.length} post${posts.length !== 1 ? 's' : ''}`;

  if (!posts.length) {
    el.innerHTML = '<div class="empty-state"><p>No generated posts yet.<br>Finalize this seed to send it to Hermes.</p></div>';
    return;
  }

  // Group by platform
  const byPlatform = {};
  posts.forEach(p => {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
    byPlatform[p.platform].push(p);
  });

  el.innerHTML = Object.entries(byPlatform).map(([platform, platformPosts]) => `
    <div class="platform-group">
      <div class="platform-group-header">
        ${platformChip(platform)}
        <span class="text-muted" style="font-size:12px;margin-left:8px">${platformPosts.length} post${platformPosts.length !== 1 ? 's' : ''}</span>
      </div>
      ${platformPosts.map(post => `
        <div class="post-card card">
          <div class="post-card-top">
            ${statusBadge(post.status)}
            <span class="post-scheduled text-muted">${post.scheduled_for ? formatDatetime(post.scheduled_for) : 'Unscheduled'}</span>
          </div>
          <p class="post-text">${escHtml((post.post_text || '').slice(0, 200))}${(post.post_text||'').length > 200 ? '…' : ''}</p>
          ${post.notes ? `<p class="post-notes text-muted"><em>${escHtml(post.notes)}</em></p>` : ''}
          <div class="post-card-actions">
            <button class="btn-secondary btn-sm" onclick="copyToClipboard(${JSON.stringify(post.post_text || '')})">Copy</button>
            <button class="btn-secondary btn-sm" onclick="openEditPost(${JSON.stringify(post)})">Edit</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

/* Media upload */
async function handleMediaUpload(event) {
  const files = event.target.files;
  if (!files.length) return;
  const seedId = window._currentSeedId;
  if (!seedId) return;

  for (const file of files) {
    try {
      const base64 = await fileToBase64(file);
      await apiFetch(`/seeds/${seedId}/media`, {
        method: 'POST',
        body: JSON.stringify({
          filename:      file.name,
          mime_type:     file.type,
          size:          file.size,
          data:          base64
        })
      });
      showToast(`Uploaded ${file.name}`);
    } catch(err) {
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  }
  // Refresh seed detail
  try {
    const seed = await apiFetch(`/seeds/${seedId}`);
    renderMediaGallery(seedId, seed.media || []);
  } catch(_) {}
  // Reset file input
  event.target.value = '';
}
window.handleMediaUpload = handleMediaUpload;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]); // strip data URL prefix
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

async function deleteMedia(seedId, mid) {
  if (!confirm('Remove this media file?')) return;
  try {
    await apiFetch(`/seeds/${seedId}/media/${mid}`, { method: 'DELETE' });
    showToast('Media removed');
    const seed = await apiFetch(`/seeds/${seedId}`);
    renderMediaGallery(seedId, seed.media || []);
  } catch(err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}
window.deleteMedia = deleteMedia;

/* Finalize seed */
async function finalizeSeed(seedId) {
  if (!seedId) return;
  const btn = document.getElementById('btn-finalize');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await apiFetch(`/seeds/${seedId}/finalize`, { method: 'POST' });
    showToast('Seed sent to Hermes!');
    // Refresh seed detail
    const seed = await apiFetch(`/seeds/${seedId}`);
    populateSeedDetail(seed);
    fetchSeeds();
  } catch(err) {
    showToast('Finalize failed: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Finalize & Send to Hermes'; }
  }
}
window.finalizeSeed = finalizeSeed;

/* Delete seed */
async function deleteSeed(seedId) {
  if (!seedId) return;
  if (!confirm('Delete this seed and all its posts? This cannot be undone.')) return;
  try {
    await apiFetch(`/seeds/${seedId}`, { method: 'DELETE' });
    showToast('Seed deleted');
    closeModal('modal-seed-detail');
    fetchSeeds();
  } catch(err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}
window.deleteSeed = deleteSeed;

/* Edit post modal */
function openEditPost(post) {
  window._currentPostId = post.id;
  document.getElementById('edit-post-id').value       = post.id;
  document.getElementById('edit-post-text').value     = post.post_text || '';
  document.getElementById('edit-post-scheduled').value = toLocalDatetimeInput(post.scheduled_for);
  document.getElementById('edit-post-status').value   = post.status || 'draft';
  document.getElementById('edit-post-notes').value    = post.notes || '';
  openModal('modal-edit-post');
}
window.openEditPost = openEditPost;

async function saveEditPost() {
  const id        = document.getElementById('edit-post-id').value;
  const post_text = document.getElementById('edit-post-text').value.trim();
  const scheduled = document.getElementById('edit-post-scheduled').value;
  const status    = document.getElementById('edit-post-status').value;
  const notes     = document.getElementById('edit-post-notes').value.trim();

  if (!id) return;
  try {
    await apiFetch(`/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        post_text,
        scheduled_for: fromLocalDatetimeInput(scheduled),
        status,
        notes
      })
    });
    showToast('Post saved');
    closeModal('modal-edit-post');
    // Refresh seed detail if open
    if (window._currentSeedId) {
      const seed = await apiFetch(`/seeds/${window._currentSeedId}`);
      renderSeedPosts(seed.posts || []);
    }
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}
window.saveEditPost = saveEditPost;

/* =========================================================
   CALENDAR TAB
   ========================================================= */
let _calView = 'month'; // month | week | day
let _calDate = new Date();  // current focal date

function loadCalendar() {
  const pane = document.getElementById('tab-calendar');
  pane.innerHTML = `
    <div class="tab-header">
      <div class="cal-controls">
        <div class="btn-group">
          <button class="btn-secondary btn-sm ${_calView==='month'?'active':''}" onclick="setCalView('month')">Month</button>
          <button class="btn-secondary btn-sm ${_calView==='week'?'active':''}" onclick="setCalView('week')">Week</button>
          <button class="btn-secondary btn-sm ${_calView==='day'?'active':''}" onclick="setCalView('day')">Day</button>
        </div>
        <div class="cal-nav">
          <button class="btn-secondary btn-sm" onclick="calNav(-1)">‹</button>
          <span id="cal-period-label" class="cal-period-label"></span>
          <button class="btn-secondary btn-sm" onclick="calNav(1)">›</button>
        </div>
      </div>
    </div>
    <div id="calendar-grid"></div>
    <div id="cal-day-panel" class="cal-day-panel" style="display:none"></div>`;

  fetchCalendar();
}

function setCalView(view) {
  _calView = view;
  loadCalendar();
}
window.setCalView = setCalView;

function calNav(dir) {
  if (_calView === 'month') {
    _calDate = new Date(_calDate.getFullYear(), _calDate.getMonth() + dir, 1);
  } else if (_calView === 'week') {
    _calDate = new Date(_calDate.getTime() + dir * 7 * 86400000);
  } else {
    _calDate = new Date(_calDate.getTime() + dir * 86400000);
  }
  fetchCalendar();
}
window.calNav = calNav;

function getCalRange() {
  if (_calView === 'month') {
    const first = new Date(_calDate.getFullYear(), _calDate.getMonth(), 1);
    const last  = new Date(_calDate.getFullYear(), _calDate.getMonth() + 1, 0, 23, 59, 59);
    return { from: first.getTime(), to: last.getTime() };
  } else if (_calView === 'week') {
    const day  = _calDate.getDay(); // 0=Sun
    const sun  = new Date(_calDate.getTime() - day * 86400000);
    sun.setHours(0,0,0,0);
    const sat  = new Date(sun.getTime() + 6 * 86400000);
    sat.setHours(23,59,59,999);
    return { from: sun.getTime(), to: sat.getTime() };
  } else {
    const d = new Date(_calDate);
    d.setHours(0,0,0,0);
    const e = new Date(_calDate);
    e.setHours(23,59,59,999);
    return { from: d.getTime(), to: e.getTime() };
  }
}

async function fetchCalendar() {
  const { from, to } = getCalRange();
  updateCalPeriodLabel();
  try {
    const posts = await apiFetch(`/calendar?from=${from}&to=${to}`);
    renderCalendar(posts || []);
  } catch(err) {
    const g = document.getElementById('calendar-grid');
    if (g) g.innerHTML = `<div class="error-msg">Failed to load calendar: ${escHtml(err.message)}</div>`;
  }
}

function updateCalPeriodLabel() {
  const lbl = document.getElementById('cal-period-label');
  if (!lbl) return;
  if (_calView === 'month') {
    lbl.textContent = _calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else if (_calView === 'week') {
    const { from, to } = getCalRange();
    const f = new Date(from); const t = new Date(to);
    lbl.textContent = `${f.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${t.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  } else {
    lbl.textContent = _calDate.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  }
}

function renderCalendar(posts) {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  // Build a map: dateStr → [posts]
  const postsByDate = {};
  posts.forEach(p => {
    if (!p.scheduled_for) return;
    const d   = new Date(p.scheduled_for);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!postsByDate[key]) postsByDate[key] = [];
    postsByDate[key].push(p);
  });

  if (_calView === 'month') {
    renderMonthGrid(postsByDate);
  } else if (_calView === 'week') {
    renderWeekGrid(postsByDate);
  } else {
    renderDayGrid(posts);
  }
}

function renderMonthGrid(postsByDate) {
  const grid = document.getElementById('calendar-grid');
  const year  = _calDate.getFullYear();
  const month = _calDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = `<div class="month-grid">`;
  // Day-of-week headers
  html += DAYS.map(d => `<div class="month-header-cell">${d}</div>`).join('');

  // Leading blanks
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="month-day-cell month-day-empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayPosts = postsByDate[key] || [];
    const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===day;

    const dots = dayPosts.slice(0,5).map(p => {
      const color = PLATFORM_COLORS[p.platform] || '#888';
      return `<span class="cal-dot" style="background:${color}" title="${escHtml(PLATFORM_LABELS[p.platform]||p.platform)}: ${escHtml((p.post_text||'').slice(0,40))}"></span>`;
    }).join('');

    html += `<div class="month-day-cell${isToday?' month-day-today':''}" onclick="calShowDay('${key}',${JSON.stringify(dayPosts).replace(/"/g,'&quot;')})">
      <span class="day-num">${day}</span>
      <div class="cal-dots">${dots}</div>
      ${dayPosts.length > 5 ? `<span class="cal-overflow">+${dayPosts.length-5}</span>` : ''}
    </div>`;
  }

  html += '</div>';
  grid.innerHTML = html;
}

function renderWeekGrid(postsByDate) {
  const grid = document.getElementById('calendar-grid');
  const { from } = getCalRange();
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(from + i * 86400000);
    week.push(d);
  }
  const today = new Date();

  let html = `<div class="week-grid">`;
  week.forEach(d => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayPosts = postsByDate[key] || [];
    const isToday = today.toDateString() === d.toDateString();
    const dayLabel = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

    html += `<div class="week-day-col${isToday?' week-day-today':''}">
      <div class="week-day-header">${dayLabel}</div>
      <div class="week-day-posts">
        ${dayPosts.length ? dayPosts.map(p => `
          <div class="cal-post-chip" style="border-left:3px solid ${PLATFORM_COLORS[p.platform]||'#888'}">
            <span class="cal-chip-platform" style="color:${PLATFORM_COLORS[p.platform]||'#888'}">${PLATFORM_LABELS[p.platform]||p.platform}</span>
            <span class="cal-chip-text">${escHtml((p.post_text||'').slice(0,60))}</span>
          </div>`).join('')
          : '<div class="cal-empty-day">—</div>'}
      </div>
    </div>`;
  });
  html += '</div>';
  grid.innerHTML = html;
}

function renderDayGrid(posts) {
  const grid = document.getElementById('calendar-grid');
  const label = _calDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  if (!posts.length) {
    grid.innerHTML = `<div class="empty-state"><p>No posts scheduled for ${label}</p></div>`;
    return;
  }
  grid.innerHTML = `<div class="day-posts-list">
    ${posts.map(p => `
      <div class="card post-cal-card">
        <div class="post-cal-meta">
          ${platformChip(p.platform)}
          ${statusBadge(p.status)}
          <span class="text-muted" style="font-size:12px;margin-left:8px">${p.scheduled_for ? formatDatetime(p.scheduled_for) : ''}</span>
        </div>
        <p class="post-text" style="margin-top:8px">${escHtml(p.post_text||'')}</p>
      </div>`).join('')}
  </div>`;
}

function calShowDay(dateKey, posts) {
  // posts may be a JSON-stringified object from onclick attr encoding — handle gracefully
  let dayPosts = posts;
  if (typeof posts === 'string') {
    try { dayPosts = JSON.parse(posts); } catch(_) { dayPosts = []; }
  }
  const panel = document.getElementById('cal-day-panel');
  if (!panel) return;
  if (!dayPosts || !dayPosts.length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="cal-day-panel-header">
      <strong>${dateKey}</strong>
      <button class="btn-secondary btn-sm" onclick="document.getElementById('cal-day-panel').style.display='none'">✕</button>
    </div>
    ${dayPosts.map(p => `
      <div class="card" style="margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          ${platformChip(p.platform)}
          ${statusBadge(p.status)}
          <span class="text-muted" style="font-size:12px">${p.scheduled_for ? formatDatetime(p.scheduled_for) : 'Unscheduled'}</span>
        </div>
        <p style="margin:0;font-size:14px">${escHtml(p.post_text||'')}</p>
      </div>`).join('')}`;
}
window.calShowDay = calShowDay;

/* =========================================================
   TODAY TAB
   ========================================================= */
function loadToday() {
  const pane = document.getElementById('tab-today');
  pane.innerHTML = `

    <div id="today-content"><div class="loading">Loading today's posts…</div></div>`;
  fetchToday();
}

async function fetchToday() {
  try {
    const posts = await apiFetch('/posts/today');
    renderToday(posts || []);
  } catch(err) {
    const el = document.getElementById('today-content');
    if (el) el.innerHTML = `<div class="error-msg">Failed to load: ${escHtml(err.message)}</div>`;
  }
}

function renderToday(posts) {
  const el = document.getElementById('today-content');
  if (!el) return;
  if (!posts.length) {
    el.innerHTML = `<div class="empty-state"><p>Nothing scheduled for today. Enjoy the day! 🎉</p></div>`;
    return;
  }

  // Group by platform
  const byPlatform = {};
  posts.forEach(p => {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
    byPlatform[p.platform].push(p);
  });

  el.innerHTML = Object.entries(byPlatform).map(([platform, platformPosts]) => `
    <div class="platform-section">
      <div class="platform-section-header">${platformChip(platform)}</div>
      <div class="today-posts-list">
        ${platformPosts.map(post => `
          <div class="card today-post-card" id="today-post-${escHtml(post.id)}">
            <div class="today-post-meta">
              ${statusBadge(post.status)}
              <span class="text-muted" style="font-size:13px">${post.scheduled_for ? formatDatetime(post.scheduled_for) : 'Unscheduled'}</span>
            </div>
            <p class="post-text">${escHtml(post.post_text||'')}</p>
            <div class="today-post-actions">
              <button class="btn-secondary btn-sm" onclick="copyToClipboard(${JSON.stringify(post.post_text||'')})">Copy</button>
              ${post.status !== 'posted'
                ? `<button class="btn-primary btn-sm" onclick="markAsPosted('${escHtml(post.id)}')">Mark as Posted</button>`
                : `<span class="badge badge-success">Posted</span>`}
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

async function markAsPosted(postId) {
  try {
    await apiFetch(`/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'posted', posted_at: Date.now() })
    });
    showToast('Marked as posted!');
    fetchToday();
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  }
}
window.markAsPosted = markAsPosted;

/* =========================================================
   ANALYTICS TAB
   ========================================================= */
function loadAnalytics() {
  const pane = document.getElementById('tab-analytics');
  pane.innerHTML = `

    <div id="analytics-content"><div class="loading">Loading analytics…</div></div>`;
  fetchAnalytics();
}

async function fetchAnalytics() {
  try {
    const records = await apiFetch('/analytics');
    renderAnalytics(records || []);
  } catch(err) {
    const el = document.getElementById('analytics-content');
    if (el) el.innerHTML = `<div class="error-msg">Failed to load analytics: ${escHtml(err.message)}</div>`;
  }
}

function renderAnalytics(records) {
  const el = document.getElementById('analytics-content');
  if (!el) return;
  if (!records.length) {
    el.innerHTML = `<div class="empty-state"><p>No analytics data yet. Mark posts as posted and log their metrics!</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="analytics-list">
      ${records.map(r => `
        <div class="card analytics-card">
          <div class="analytics-card-header">
            ${platformChip(r.platform)}
            <span class="analytics-seed-title text-muted">${escHtml(r.seed_title || '—')}</span>
            <span class="text-muted" style="font-size:12px;margin-left:auto">${formatDate(r.recorded_at || r.created_at)}</span>
          </div>
          <p class="post-text">${escHtml((r.post_text||'').slice(0,160))}${(r.post_text||'').length > 160 ? '…' : ''}</p>
          <div class="analytics-metrics">
            <span class="metric-item"><span class="metric-icon">❤️</span> ${r.likes ?? '—'}</span>
            <span class="metric-item"><span class="metric-icon">💬</span> ${r.comments ?? '—'}</span>
            <span class="metric-item"><span class="metric-icon">👁</span> ${r.views ?? '—'}</span>
            <span class="metric-item"><span class="metric-icon">🔁</span> ${r.shares ?? '—'}</span>
          </div>
          <div class="analytics-card-actions">
            <button class="btn-secondary btn-sm" onclick="openAnalyticsModal('${escHtml(r.post_id)}','${escHtml(r.id||'')}',${r.likes||0},${r.comments||0},${r.views||0},${r.shares||0})">Log Metrics</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function openAnalyticsModal(postId, recordId, likes, comments, views, shares) {
  window._analyticsRecord = { postId, recordId };
  document.getElementById('analytics-post-id').value   = postId;
  document.getElementById('analytics-record-id').value = recordId || '';
  document.getElementById('analytics-likes').value     = likes    || 0;
  document.getElementById('analytics-comments').value  = comments || 0;
  document.getElementById('analytics-views').value     = views    || 0;
  document.getElementById('analytics-shares').value    = shares   || 0;
  openModal('modal-analytics');
}
window.openAnalyticsModal = openAnalyticsModal;

async function submitAnalytics() {
  const postId   = document.getElementById('analytics-post-id').value;
  const recordId = document.getElementById('analytics-record-id').value;
  const likes    = parseInt(document.getElementById('analytics-likes').value)    || 0;
  const comments = parseInt(document.getElementById('analytics-comments').value) || 0;
  const views    = parseInt(document.getElementById('analytics-views').value)    || 0;
  const shares   = parseInt(document.getElementById('analytics-shares').value)   || 0;
  const payload  = { post_id: postId, likes, comments, views, shares, recorded_at: Date.now() };

  try {
    if (recordId) {
      await apiFetch(`/analytics/${recordId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/analytics', { method: 'POST', body: JSON.stringify(payload) });
    }
    showToast('Metrics saved!');
    closeModal('modal-analytics');
    fetchAnalytics();
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}
window.submitAnalytics = submitAnalytics;

/* =========================================================
   SETTINGS TAB
   ========================================================= */
let _settings = {};

function loadSettings() {
  const pane = document.getElementById('tab-settings');
  pane.innerHTML = `
    <div class="tab-header" style="justify-content:flex-end">
      <button class="btn-primary" onclick="saveSettings()">Save Settings</button>
    </div>
    <div id="settings-content"><div class="loading">Loading settings…</div></div>`;
  fetchSettings();
}

async function fetchSettings() {
  try {
    const settings = await apiFetch('/settings');
    _settings = settings || {};
    renderSettings();
  } catch(err) {
    const el = document.getElementById('settings-content');
    if (el) el.innerHTML = `<div class="error-msg">Failed to load settings: ${escHtml(err.message)}</div>`;
  }
}

function renderSettings() {
  const el = document.getElementById('settings-content');
  if (!el) return;

  const get = key => escHtml(_settings[key] || '');

  // Parse best times JSON arrays (defaults)
  const xTimes        = safeParseTimes(_settings['platform.x.best_times'],        ['9:00','12:00','17:00']);
  const liTimes       = safeParseTimes(_settings['platform.linkedin.best_times'],  ['8:00','12:00','17:30']);
  const ytTimes       = safeParseTimes(_settings['platform.youtube.best_times'],   ['15:00','18:00']);

  el.innerHTML = `
    <!-- App Settings -->
    <section class="settings-section card">
      <h3 class="settings-section-title">App Settings</h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Port</label>
          <input type="text" class="form-input" id="setting-port" value="${get('app.port') || '8788'}" readonly>
          <small class="form-hint">Restart server to change</small>
        </div>
        <div class="form-group">
          <label class="form-label">Theme</label>
          <select class="form-input" id="setting-theme">
            <option value="dark"  ${(_settings['app.theme']||'dark')==='dark' ?'selected':''}>Dark</option>
            <option value="light" ${(_settings['app.theme']||'dark')==='light'?'selected':''}>Light</option>
          </select>
        </div>
      </div>
    </section>

    <!-- Hermes Connection -->
    <section class="settings-section card">
      <h3 class="settings-section-title">Hermes Connection</h3>
      <div class="form-group">
        <label class="form-label">Hermes Config Path</label>
        <div class="input-with-btn">
          <input type="text" class="form-input" id="setting-hermes-path" value="${get('hermes.config_path')}" placeholder="/path/to/hermes/config.json">
          <button class="btn-secondary" onclick="testHermesConnection()">Test Connection</button>
        </div>
      </div>
      <div id="hermes-config-preview" style="margin-top:12px;display:none">
        <label class="form-label">Hermes Config (read-only)</label>
        <pre class="code-block" id="hermes-config-json"></pre>
      </div>
    </section>

    <!-- Platform Criteria -->
    <section class="settings-section card">
      <h3 class="settings-section-title">Platform Posting Criteria</h3>
      ${renderPlatformSettings('x',        'X (Twitter)',  _settings['platform.x.frequency']        || 5,  xTimes)}
      ${renderPlatformSettings('linkedin', 'LinkedIn',     _settings['platform.linkedin.frequency'] || 3,  liTimes)}
      ${renderPlatformSettings('youtube',  'YouTube',      _settings['platform.youtube.frequency']  || 1,  ytTimes)}
    </section>`;
}

function safeParseTimes(val, fallback) {
  try {
    const arr = JSON.parse(val);
    if (Array.isArray(arr)) return arr;
  } catch(_) {}
  return fallback;
}

function renderPlatformSettings(platform, label, frequency, bestTimes) {
  const color = PLATFORM_COLORS[platform] || '#888';
  const timesValue = escHtml(bestTimes.join(', '));
  return `
    <div class="platform-settings-row" style="border-left:3px solid ${color};padding-left:12px;margin-bottom:16px">
      <div class="platform-settings-header" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${platformChip(platform)}
        <strong>${escHtml(label)}</strong>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Posts/Week</label>
          <input type="number" class="form-input" id="setting-${platform}-freq" value="${frequency}" min="0" max="50">
        </div>
        <div class="form-group">
          <label class="form-label">Best Times (comma separated)</label>
          <input type="text" class="form-input" id="setting-${platform}-times" value="${timesValue}" placeholder="9:00, 12:00, 17:00">
        </div>
      </div>
    </div>`;
}

async function testHermesConnection() {
  const preview = document.getElementById('hermes-config-preview');
  const jsonEl  = document.getElementById('hermes-config-json');
  try {
    const cfg = await apiFetch('/hermes/config');
    preview.style.display = 'block';
    jsonEl.textContent = JSON.stringify(cfg, null, 2);
    showToast('Hermes connection OK');
  } catch(err) {
    showToast('Connection failed: ' + err.message, 'error');
    preview.style.display = 'none';
  }
}
window.testHermesConnection = testHermesConnection;

async function saveSettings() {
  const themeEl = document.getElementById('setting-theme');
  const hermesEl = document.getElementById('setting-hermes-path');

  const payload = {};

  if (themeEl)   payload['app.theme']         = themeEl.value;
  if (hermesEl)  payload['hermes.config_path'] = hermesEl.value.trim();

  // Platform settings
  for (const platform of ['x','linkedin','youtube']) {
    const freqEl  = document.getElementById(`setting-${platform}-freq`);
    const timesEl = document.getElementById(`setting-${platform}-times`);
    if (freqEl)  payload[`platform.${platform}.frequency`]  = freqEl.value;
    if (timesEl) {
      const times = timesEl.value.split(',').map(t => t.trim()).filter(Boolean);
      payload[`platform.${platform}.best_times`] = JSON.stringify(times);
    }
  }

  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    // Apply theme
    if (payload['app.theme']) {
      document.documentElement.setAttribute('data-theme', payload['app.theme']);
      localStorage.setItem('postkit-theme', payload['app.theme']);
    }
    _settings = { ..._settings, ...payload };
    showToast('Settings saved!');
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}
window.saveSettings = saveSettings;

/* =========================================================
   TOAST STYLES (injected if not in CSS)
   ========================================================= */
function injectToastStyles() {
  if (document.getElementById('postkit-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'postkit-toast-styles';
  style.textContent = `
    #toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      background: var(--bg-card, #19192a);
      border: 1px solid var(--border, #2a2a42);
      color: var(--text, #e8e8f2);
      padding: 10px 16px;
      border-radius: 4px;
      font-size: 13px;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity .2s, transform .2s;
      pointer-events: none;
      max-width: 320px;
    }
    .toast.toast-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .toast-error  { border-left: 3px solid var(--danger, #ef4444); }
    .toast-success { border-left: 3px solid var(--success, #22c55e); }
    /* Misc utility styles */
    .badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:3px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.3px; }
    .badge-muted    { background:var(--bg-hover,#21213a); color:var(--text-muted,#7878a8); }
    .badge-warning  { background:rgba(245,158,11,.15); color:var(--warning,#f59e0b); }
    .badge-success  { background:rgba(34,197,94,.15); color:var(--success,#22c55e); }
    .badge-danger   { background:rgba(239,68,68,.15); color:var(--danger,#ef4444); }
    .badge-info     { background:var(--bg-hover); color:var(--text-muted); }
    .tag-chip { display:inline-flex; padding:2px 8px; background:var(--bg-hover,#21213a); border-radius:3px; font-size:11px; color:var(--text-muted,#7878a8); margin-right:4px; margin-bottom:4px; }
    .card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; padding:4px 0; }
    .seed-card { cursor:pointer; transition:background .15s,border-color .15s; }
    .seed-card:hover { background:var(--bg-hover,#21213a); border-color:var(--accent,#7c3aed); }
    .card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:8px; }
    .seed-title { font-weight:600; font-size:14px; }
    .card-body-preview { font-size:13px; color:var(--text-muted); margin:0 0 10px; line-height:1.5; }
    .card-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:4px; }
    .card-date { font-size:11px; color:var(--text-dim,#4a4a72); }
    .card-campaign { font-size:12px; color:var(--text-muted); margin-top:6px; }
    .filter-row { display:flex; gap:8px; margin-bottom:20px; flex-wrap:wrap; }
    .filter-row .form-input { flex:1; min-width:120px; }
    .loading { color:var(--text-muted); padding:40px; text-align:center; }
    .error-msg { color:var(--danger,#ef4444); padding:20px; }
    .empty-state { text-align:center; color:var(--text-muted); padding:60px 20px; }
    .tab-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; flex-wrap:wrap; }
    .tab-title { font-size:22px; font-weight:700; margin:0 0 4px; }
    .tab-subtitle { font-size:13px; color:var(--text-muted); margin:0; }
    .platform-chip { display:inline-flex; align-items:center; }
    .media-gallery { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
    .media-thumb-wrapper { position:relative; }
    .media-thumb { width:80px; height:80px; object-fit:cover; border-radius:4px; border:1px solid var(--border); display:block; }
    .media-file-icon { width:80px; height:80px; display:flex; align-items:center; justify-content:center; background:var(--bg-hover); border-radius:4px; font-size:11px; text-align:center; border:1px solid var(--border); word-break:break-all; padding:4px; box-sizing:border-box; }
    .media-delete-btn { position:absolute; top:2px; right:2px; background:rgba(0,0,0,.7); color:#fff; border:none; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1; }
    .media-upload-btn { display:inline-flex; align-items:center; cursor:pointer; padding:6px 12px; background:var(--bg-hover); border:1px dashed var(--border); border-radius:4px; font-size:13px; color:var(--text-muted); transition:border-color .15s; }
    .media-upload-btn:hover { border-color:var(--accent); color:var(--accent); }
    .job-row { display:flex; align-items:center; margin-bottom:4px; }
    .platform-group { margin-bottom:20px; }
    .platform-group-header { display:flex; align-items:center; margin-bottom:8px; }
    .post-card { margin-bottom:8px; }
    .post-card-top { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .post-scheduled { font-size:12px; }
    .post-text { margin:0 0 8px; font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .post-notes { font-size:12px; margin:0 0 8px; }
    .post-card-actions { display:flex; gap:8px; }
    .posts-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .posts-header h3 { margin:0; font-size:16px; }
    .seed-detail-layout { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
    @media (max-width:768px) { .seed-detail-layout { grid-template-columns:1fr; } }
    .seed-meta-row { display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
    .meta-item { display:flex; flex-direction:column; gap:2px; }
    .meta-label { font-size:11px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.5px; }
    .meta-value { font-size:13px; }
    .seed-detail-actions { margin-top:16px; display:flex; flex-direction:column; gap:8px; }
    .btn-full { width:100%; }
    /* Calendar */
    .month-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:1px; background:var(--border); border:1px solid var(--border); border-radius:4px; overflow:hidden; }
    .month-header-cell { background:var(--bg-surface); padding:8px; text-align:center; font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; }
    .month-day-cell { background:var(--bg-card); padding:8px; min-height:80px; cursor:pointer; transition:background .1s; }
    .month-day-cell:hover { background:var(--bg-hover); }
    .month-day-empty { background:var(--bg-surface); cursor:default; }
    .month-day-today .day-num { background:var(--accent); color:#fff; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:12px; }
    .day-num { font-size:12px; font-weight:600; margin-bottom:4px; }
    .cal-dots { display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; }
    .cal-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
    .cal-overflow { font-size:10px; color:var(--text-dim); }
    .week-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; }
    .week-day-col { min-height:200px; }
    .week-day-header { font-size:11px; font-weight:600; color:var(--text-muted); padding-bottom:8px; border-bottom:1px solid var(--border); margin-bottom:8px; text-transform:uppercase; }
    .week-day-today .week-day-header { color:var(--accent); }
    .cal-post-chip { padding:4px 8px; border-radius:3px; margin-bottom:4px; background:var(--bg-hover); font-size:11px; cursor:default; }
    .cal-chip-platform { display:block; font-weight:600; font-size:10px; text-transform:uppercase; margin-bottom:2px; }
    .cal-chip-text { color:var(--text-muted); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cal-empty-day { color:var(--text-dim); font-size:12px; }
    .day-posts-list { display:flex; flex-direction:column; gap:12px; }
    .post-cal-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .cal-controls { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .cal-nav { display:flex; align-items:center; gap:8px; }
    .cal-period-label { font-size:14px; font-weight:600; min-width:160px; text-align:center; }
    .btn-group { display:flex; }
    .btn-group .btn-secondary { border-radius:0; border-right-width:0; }
    .btn-group .btn-secondary:first-child { border-radius:4px 0 0 4px; }
    .btn-group .btn-secondary:last-child  { border-radius:0 4px 4px 0; border-right-width:1px; }
    .btn-group .btn-secondary.active { background:var(--accent); color:#fff; border-color:var(--accent); }
    .cal-day-panel { background:var(--bg-card); border:1px solid var(--border); border-radius:4px; padding:16px; margin-top:16px; }
    .cal-day-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    /* Today */
    .platform-section { margin-bottom:28px; }
    .platform-section-header { margin-bottom:12px; }
    .today-posts-list { display:flex; flex-direction:column; gap:10px; }
    .today-post-meta { display:flex; gap:8px; align-items:center; margin-bottom:6px; }
    .today-post-actions { display:flex; gap:8px; margin-top:8px; }
    /* Analytics */
    .analytics-list { display:flex; flex-direction:column; gap:12px; }
    .analytics-card-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
    .analytics-seed-title { font-size:13px; }
    .analytics-metrics { display:flex; gap:16px; margin:8px 0; flex-wrap:wrap; }
    .metric-item { font-size:13px; color:var(--text-muted); display:flex; align-items:center; gap:4px; }
    .analytics-card-actions { margin-top:8px; }
    /* Settings */
    .settings-section { margin-bottom:20px; padding:20px; }
    .settings-section-title { margin:0 0 16px; font-size:15px; font-weight:600; }
    .input-with-btn { display:flex; gap:8px; }
    .input-with-btn .form-input { flex:1; }
    .code-block { background:var(--bg-surface); border:1px solid var(--border); border-radius:4px; padding:12px; font-size:12px; overflow:auto; max-height:300px; white-space:pre-wrap; word-break:break-all; }
    .platform-settings-row { }
    .text-muted { color:var(--text-muted); }
  `;
  document.head.appendChild(style);
}

/* =========================================================
   INIT
   ========================================================= */
function init() {
  initTheme();
  injectToastStyles();
  initNav();
  // Load default tab (Content)
  switchTab('content');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
