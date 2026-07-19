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
  const icons = {
    x: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    linkedin: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
    youtube: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98" fill="#fff" stroke="none"/></svg>',
  };
  const icon = icons[platform] || '';
  return `<span class="platform-chip" style="background:${color};color:#fff;padding:3px 5px;border-radius:3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;display:inline-flex;align-items:center;justify-content:center;line-height:1">${icon}</span>`;
}

function statusBadge(status) {
  const map = {
    draft:      'badge-muted',
    processing: 'badge-warning',
    done:       'badge-info',
    error:      'badge-danger',
    scheduled:  'badge-info',
    posted:     'badge-success',
    pending:    'badge-warning'
  };
  const labels = {
    done: 'Content Generated'
  };
  const cls = map[status] || 'badge-muted';
  return `<span class="badge ${cls}">${escHtml(labels[status] || status || '—')}</span>`;
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
  // Re-apply select styles after tab switch
  setTimeout(fixSelects, 150);

  window._currentSeedId = null;
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
      <button class="btn-primary" onclick="openNewSeedModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        New Post
      </button>
    </div>
    <div class="filter-row">
      <input type="text" class="form-input filter-search" id="seed-search" placeholder="Search seeds..." value="${escHtml(_seedFilters.search)}">
      ${buildCustomSelect('seed-status-filter', [
        {value:'',label:'All Status'},{value:'draft',label:'Draft'},
        {value:'processing',label:'Processing'},{value:'done',label:'Done'},
        {value:'error',label:'Error'}
      ], _seedFilters.status)}
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
  pane.querySelector('#seed-status-filter').addEventListener('csel:change', e => {
    _seedFilters.status = e.detail.value;
    fetchSeeds();
  });
  pane.querySelector('#seed-campaign-filter').addEventListener('input', e => {
    _seedFilters.campaign = e.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(fetchSeeds, 300);
  });

  initCustomSelects(pane);
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
    // If any seed is processing, refresh the open detail pane too
    const processing = seeds.filter(s => s.status === 'processing');
    if (processing.length && window._currentSeedId) {
      const openSeedIsProcessing = processing.some(s => s.id === window._currentSeedId);
      if (openSeedIsProcessing) {
        const fresh = await apiFetch(`/seeds/${window._currentSeedId}`);
        populateSeedDetail(fresh);
        renderSeedPosts(fresh.posts || []);
      }
    }
  } catch(err) {
    const grid = document.getElementById('seeds-grid');
    if (grid) grid.innerHTML = `<div class="error-msg">Failed to load seeds: ${escHtml(err.message)}</div>`;
  }
}

// Auto-poll while any seed is processing
let _processingPollTimer = null;
function startProcessingPoll() {
  if (_processingPollTimer) return;
  _processingPollTimer = setInterval(async () => {
    try {
      const seeds = await apiFetch('/seeds'); // unfiltered — need all to detect status changes
      const anyProcessing = seeds.some(s => s.status === 'processing');
      if (anyProcessing) {
        fetchSeeds(); // re-render with current filters
        if (window._currentSeedId) {
          const open = seeds.find(s => s.id === window._currentSeedId);
          if (open && open.status === 'processing') {
            const fresh = await apiFetch(`/seeds/${window._currentSeedId}`);
            populateSeedDetail(fresh);
            renderSeedPosts(fresh.posts || []);
          } else if (open && open.status !== 'processing') {
            // Just transitioned to done — refresh one more time
            const fresh = await apiFetch(`/seeds/${window._currentSeedId}`);
            populateSeedDetail(fresh);
            renderSeedPosts(fresh.posts || []);
            showToast('Auri finished — posts ready!');
          }
        }
      } else {
        // Nothing processing — stop polling
        clearInterval(_processingPollTimer);
        _processingPollTimer = null;
      }
    } catch(_) {}
  }, 8000);
}
window.startProcessingPoll = startProcessingPoll;

async function fetchSeeds() {
  const params = new URLSearchParams();
  if (_seedFilters.search)   params.set('search', _seedFilters.search);
  if (_seedFilters.status)   params.set('status', _seedFilters.status);
  if (_seedFilters.campaign) params.set('campaign', _seedFilters.campaign);
  const qs = params.toString();

  try {
    const seeds = await apiFetch('/seeds' + (qs ? '?' + qs : ''));
    renderSeedsGrid(seeds);
    // If any seed is processing, refresh the open detail pane too
    const processing = seeds.filter(s => s.status === 'processing');
    if (processing.length && window._currentSeedId) {
      const openSeedIsProcessing = processing.some(s => s.id === window._currentSeedId);
      if (openSeedIsProcessing) {
        const fresh = await apiFetch(`/seeds/${window._currentSeedId}`);
        populateSeedDetail(fresh);
        renderSeedPosts(fresh.posts || []);
      }
    }
  } catch(err) {
    const grid = document.getElementById('seeds-grid');
    if (grid) grid.innerHTML = `<div class="error-msg">Failed to load seeds: ${escHtml(err.message)}</div>`;
  }
}

function renderSeedsGrid(seeds) {
  const grid = document.getElementById('seeds-grid');
  if (!grid) return;
  if (!seeds || seeds.length === 0) {
    // Override grid layout so empty state fills the full width
    grid.style.display = 'flex';
    grid.style.alignItems = 'center';
    grid.style.justifyContent = 'center';
    grid.innerHTML = `
      <div class="empty-state" style="min-height:340px;">
        <div style="opacity:0.35;margin-bottom:16px">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        </div>
        <p style="font-size:15px;font-weight:600;color:var(--text-muted);margin:0 0 6px">No seeds yet</p>
        <p style="font-size:13px;color:var(--text-dim);margin:0 0 22px;max-width:340px;line-height:1.6">Create your first content seed and let Hermes generate platform-ready posts.</p>
        <button class="btn-primary" onclick="openNewSeedModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New Post
        </button>
      </div>`;
    return;
  }
  // Restore grid layout for cards
  grid.style.display = '';
  grid.style.alignItems = '';
  grid.style.justifyContent = '';
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
          ${seed.platform_counts && Object.keys(seed.platform_counts).length ? `
            ${ [['x','𝕏'],['linkedin','in'],['youtube','▶']].filter(([p]) => seed.platform_counts[p]).map(([p,icon]) =>
              `<span class="tag-chip platform-count-pill platform-pill-${p}" title="${seed.platform_counts[p]} ${p} post${seed.platform_counts[p]!==1?'s':''}">${
                icon} ${seed.platform_counts[p]}</span>`).join('')}
          ` : ''}
        </div>
        <span class="card-date">${formatDate(seed.created_at)}</span>
      </div>
      ${seed.campaign ? `<div class="card-campaign">📁 ${escHtml(seed.campaign)}</div>` : ''}
    </div>`;
  }).join('');
  setTimeout(fixSelects, 50);
}

/* Staged files for New Post modal */
let _stagedFiles = [];

function handleNewSeedFileSelect(event) {
  const files = Array.from(event.target.files);
  _stagedFiles = _stagedFiles.concat(files);
  event.target.value = ''; // allow re-selecting same file
  renderNewSeedFilePreviews();
}
window.handleNewSeedFileSelect = handleNewSeedFileSelect;

function renderNewSeedFilePreviews() {
  const container = document.getElementById('new-seed-file-preview');
  if (!container) return;
  if (!_stagedFiles.length) { container.innerHTML = ''; return; }
  container.innerHTML = _stagedFiles.map((f, i) => {
    const isImage = f.type.startsWith('image/');
    const objUrl = URL.createObjectURL(f);
    return `<div class="staged-asset-item">
      ${isImage
        ? `<img src="${objUrl}" class="staged-asset-thumb" alt="${escHtml(f.name)}">`
        : `<div class="staged-asset-thumb staged-asset-video">🎬</div>`}
      <div class="staged-asset-name">${escHtml(f.name.length > 16 ? f.name.slice(0,14)+'…' : f.name)}</div>
      <button class="media-delete-btn" onclick="removeStagedFile(${i})" title="Remove">✕</button>
    </div>`;
  }).join('');
}
window.renderNewSeedFilePreviews = renderNewSeedFilePreviews;

function removeStagedFile(index) {
  _stagedFiles.splice(index, 1);
  renderNewSeedFilePreviews();
}
window.removeStagedFile = removeStagedFile;

/* Edit Root Post Modal */
async function openEditSeedModal(seedId) {
  try {
    const seed = await apiFetch(`/seeds/${seedId}`);
    document.getElementById('edit-seed-id').value = seed.id;
    document.getElementById('edit-seed-title').value = seed.title || '';
    document.getElementById('edit-seed-campaign').value = seed.campaign || '';
    document.getElementById('edit-seed-tags').value = Array.isArray(seed.tags) ? seed.tags.join(', ') : '';
    document.getElementById('edit-seed-body').value = seed.body || '';
    closeModal('modal-seed-detail');
    openModal('modal-edit-seed');
  } catch(err) {
    showToast('Failed to load seed: ' + err.message, 'error');
  }
}
window.openEditSeedModal = openEditSeedModal;

async function submitEditSeed(event) {
  event.preventDefault();
  const id       = document.getElementById('edit-seed-id').value;
  const title    = document.getElementById('edit-seed-title').value.trim();
  const campaign = document.getElementById('edit-seed-campaign').value.trim();
  const tagsRaw  = document.getElementById('edit-seed-tags').value.trim();
  const body     = document.getElementById('edit-seed-body').value.trim();
  const tags     = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const btn = document.getElementById('btn-edit-seed-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    await apiFetch(`/seeds/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, campaign, tags: JSON.stringify(tags), body })
    });
    showToast('Root post updated');
    closeModal('modal-edit-seed');
    // Refresh the detail view if open
    if (window._currentSeedId === id) openSeedDetail(id);
    fetchSeeds();
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Changes'; }
  }
}
window.submitEditSeed = submitEditSeed;

/* New Post Modal */
function openNewSeedModal() {
  // Reset form and staged files
  const form = document.getElementById('form-new-seed');
  if (form) form.reset();
  _stagedFiles = [];
  renderNewSeedFilePreviews();
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

  const btn = document.getElementById('btn-create-post');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  try {
    const seed = await apiFetch('/seeds', {
      method: 'POST',
      body: JSON.stringify({ title, body, tags: JSON.stringify(tags), campaign })
    });

    // Upload any staged assets into this seed's dedicated folder
    if (_stagedFiles.length) {
      for (const file of _stagedFiles) {
        try {
          const base64 = await fileToBase64(file);
          await apiFetch(`/seeds/${seed.id}/media`, {
            method: 'POST',
            body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size, data: base64 })
          });
        } catch(uploadErr) {
          showToast(`Upload failed for ${file.name}: ${uploadErr.message}`, 'error');
        }
      }
      _stagedFiles = [];
    }

    showToast('Post created!');
    closeModal('modal-new-seed');
    fetchSeeds();
  } catch(err) {
    showToast('Failed to create post: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Platform Posts'; }
  }
}
window.submitNewSeed = submitNewSeed;

/* Seed Detail Modal */
async function openSeedDetail(seedId) {
  window._currentSeedId = seedId;
  openModal('modal-seed-detail');
  const titleEl = document.getElementById('seed-detail-title');
  if (titleEl) titleEl.value = 'Loading…';
  document.getElementById('seed-detail-posts').innerHTML = '<div class="loading">Loading posts…</div>';
  try {
    const seed = await apiFetch(`/seeds/${seedId}`);
    populateSeedDetail(seed);
  } catch(err) {
    showToast('Failed to load seed: ' + err.message, 'error');
  }
}
window.openSeedDetail = openSeedDetail;

// Auto-save a single seed field on blur
async function autoSaveSeedField(field, rawValue) {
  const id = window._currentSeedId;
  if (!id) return;
  let value = rawValue;
  // Serialize tags as JSON array
  if (field === 'tags') {
    const arr = rawValue ? rawValue.split(',').map(t => t.trim()).filter(Boolean) : [];
    value = JSON.stringify(arr);
  }
  try {
    await apiFetch(`/seeds/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ [field]: value })
    });
    showToast('Saved', 'success');
    // Refresh cards in background without closing modal
    fetchSeeds();
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}
window.autoSaveSeedField = autoSaveSeedField;

function populateSeedDetail(seed) {
  // Editable title
  const titleEl = document.getElementById('seed-detail-title');
  if (titleEl) titleEl.value = seed.title || '';

  document.getElementById('seed-detail-status-badge').innerHTML = statusBadge(seed.status);
  document.getElementById('seed-detail-created').textContent = formatDate(seed.created_at);

  // Editable campaign
  const campaignEl = document.getElementById('seed-detail-campaign');
  if (campaignEl) campaignEl.value = seed.campaign || '';

  // Editable body
  document.getElementById('seed-detail-body').value = seed.body || '';

  // Editable tags (comma-separated)
  let tags = [];
  try { tags = Array.isArray(seed.tags) ? seed.tags : JSON.parse(seed.tags || '[]'); } catch(_) {}
  const tagsEl = document.getElementById('seed-detail-tags');
  if (tagsEl) tagsEl.value = tags.join(', ');

  // Media gallery
  renderMediaGallery(seed.id, seed.media || []);

  // Posts grouped by platform
  renderSeedPosts(seed.posts || []);

  // Finalize button state
  const btnFinalize = document.getElementById('btn-finalize');
  if (btnFinalize) {
    const canFinalize = seed.status === 'draft' || seed.status === 'error';
    btnFinalize.disabled = false;
    if (!canFinalize) btnFinalize.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Resend to Auri';
    else btnFinalize.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Send to Auri';
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

// Platform tab state
let _activePlatformTab = 'x';
let _cachedPosts = [];

function switchPlatformTab(platform) {
  _activePlatformTab = platform;
  document.querySelectorAll('.platform-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.platform === platform);
  });
  renderPlatformTabContent(_cachedPosts);
}
window.switchPlatformTab = switchPlatformTab;

async function approveAndSchedule(postId, scheduledFor) {
  try {
    const payload = { status: 'scheduled' };
    if (scheduledFor) payload.scheduled_for = scheduledFor;
    await apiFetch(`/posts/${postId}`, { method: 'PUT', body: JSON.stringify(payload) });
    showToast('Post scheduled ✓');
    // Refresh the seed detail to reflect the new status
    if (window._currentSeedId) openSeedDetail(window._currentSeedId);
  } catch(err) {
    showToast('Failed to schedule: ' + err.message, 'error');
  }
}
window.approveAndSchedule = approveAndSchedule;

// Auto-save post field on blur (inline editing)
let _postSaveTimer = null;
async function autoSavePostField(postId, field, value) {
  if (!postId || !field) return;
  const v = (value || '').trim();
  try {
    await apiFetch(`/posts/${postId}`, { method: 'PUT', body: JSON.stringify({ [field]: v }) });
    showToast('Saved');
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}
window.autoSavePostField = autoSavePostField;

// ── Helpers for post card rendering ───────────────────────────────────────
function tryParseArr(str) {
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str || '[]'); } catch(_) { return []; }
}

function renderPostMedia(mediaPathsStr) {
  const paths = tryParseArr(mediaPathsStr);
  if (!paths.length) return '';
  const thumbs = paths.map(p => {
    const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(p);
    const isVid = /\.(mp4|mov|webm)$/i.test(p);
    if (isImg) return `<img src="/media/${p}" class="post-media-thumb" loading="lazy" onclick="openMediaLightbox('/media/${p}')">`;
    if (isVid) return `<video src="/media/${p}" class="post-media-thumb" muted onclick="openMediaLightbox('/media/${p}','video')">`;
    return `<span class="post-media-file">📎 ${p.split('/').pop()}</span>`;
  }).join('');
  return `<div class="post-media-grid">${thumbs}</div>`;
}

async function generatePostImage(postId) {
  // Try to parse image_prompt for template info, otherwise use template picker
  const post = _cachedPosts.find(p => p.id === postId);
  let template = 'tip';
  let variables = {};

  if (post?.image_prompt) {
    try {
      const parsed = JSON.parse(post.image_prompt);
      if (parsed.template) template = parsed.template;
      if (parsed.variables) variables = parsed.variables;
    } catch(_) {
      // Not JSON — use tip template with post text
      variables = { TIP_TEXT: post.post_text || '', CATEGORY_LABEL: (post.platform || '').toUpperCase() };
    }
  } else {
    variables = { TIP_TEXT: post?.post_text || '', CATEGORY_LABEL: (post.platform || '').toUpperCase() };
  }

  try {
    showToast('Generating image... ⏳');
    const result = await apiFetch(`/posts/${postId}/generate-template-image`, {
      method: 'POST',
      body: JSON.stringify({ template, variables })
    });
    showToast('Image generated ✓');
    if (window._currentSeedId) openSeedDetail(window._currentSeedId);
  } catch(err) {
    showToast('Image generation failed: ' + err.message, 'error');
  }
}
window.generatePostImage = generatePostImage;

async function generateAllSeedImages(seedId) {
  try {
    showToast('Generating all images... ⏳');
    const result = await apiFetch(`/seeds/${seedId}/generate-all-images`, { method: 'POST' });
    showToast(`Generated ${result.generated}/${result.total} images ✓`);
    if (window._currentSeedId) openSeedDetail(window._currentSeedId);
  } catch(err) {
    showToast('Image generation failed: ' + err.message, 'error');
  }
}
window.generateAllSeedImages = generateAllSeedImages;

async function generateImageWithTemplate(postId) {
  // Open a small template picker
  const templates = await apiFetch('/templates');
  const post = _cachedPosts.find(p => p.id === postId);
  
  let modal = document.getElementById('template-picker-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'template-picker-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <h2 class="modal-title">Choose Template</h2>
          <button class="modal-close" onclick="document.getElementById('template-picker-modal').style.display='none'">✕</button>
        </div>
        <div class="modal-body">
          <div id="template-picker-list" style="display:flex;flex-direction:column;gap:8px"></div>
          <div id="template-vars-wrap" style="display:none;margin-top:16px">
            <div class="form-label" style="margin-bottom:8px">Variables</div>
            <div id="template-vars-fields" style="display:flex;flex-direction:column;gap:10px"></div>
          </div>
          <div class="modal-actions" style="margin-top:16px">
            <button class="btn-secondary" onclick="document.getElementById('template-picker-modal').style.display='none'">Cancel</button>
            <button class="btn-primary" id="btn-template-gen" onclick="confirmTemplateImage('${postId}')">Generate</button>
          </div>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    document.body.appendChild(modal);
  }

  // Populate template list
  const list = modal.querySelector('#template-picker-list');
  list.innerHTML = templates.map(t => 
    `<button class="template-pick-btn" data-tpl="${t.id}" onclick="selectTemplatePicked('${t.id}')" style="text-align:left;padding:12px 16px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);cursor:pointer;color:var(--text);font-size:14px">
      <strong>${escHtml(t.name)}</strong><br><span style="font-size:12px;color:var(--text-muted)">${escHtml(t.description)}</span>
    </button>`
  ).join('');

  modal.querySelector('#template-vars-wrap').style.display = 'none';
  modal.style.display = 'flex';
}
window.generateImageWithTemplate = generateImageWithTemplate;

let _pickedTemplate = null;
function selectTemplatePicked(tplId) {
  _pickedTemplate = tplId;
  document.querySelectorAll('.template-pick-btn').forEach(b => {
    b.style.borderColor = b.dataset.tpl === tplId ? 'var(--accent)' : 'var(--border)';
  });
  // Show variable fields based on template
  const varDefs = {
    quote:        [{ key: 'QUOTE_TEXT', label: 'Quote', placeholder: 'Enter quote text...' }, { key: 'AUTHOR_NAME', label: 'Author', placeholder: '@handle' }],
    stat:         [{ key: 'BIG_NUMBER', label: 'Number', placeholder: 'e.g. 10x, 500%' }, { key: 'CAPTION', label: 'Caption', placeholder: 'Short description...' }, { key: 'SOURCE', label: 'Source', placeholder: 'Optional source...' }],
    tip:          [{ key: 'TIP_TEXT', label: 'Tip Text', placeholder: 'The tip content...' }, { key: 'TIP_NUMBER', label: 'Tip #', placeholder: '1' }, { key: 'CATEGORY_LABEL', label: 'Category', placeholder: 'e.g. PRODUCTIVITY' }],
    announcement: [{ key: 'BADGE_TEXT', label: 'Badge', placeholder: 'e.g. NEW' }, { key: 'HEADLINE', label: 'Headline', placeholder: 'Main headline...' }, { key: 'SUBTEXT', label: 'Subtext', placeholder: 'Supporting text...' }],
    'list-cover': [{ key: 'THREAD_NUMBER', label: 'Thread #', placeholder: '1' }, { key: 'TITLE_TEXT', label: 'Title', placeholder: 'Thread title...' }, { key: 'TOTAL_COUNT', label: 'Total Posts', placeholder: '5' }],
  };
  const fields = varDefs[tplId] || [];
  const wrap = document.getElementById('template-vars-fields');
  const post = _cachedPosts.find(p => p.id === document.getElementById('btn-template-gen').onclick.toString().match(/'([^']+)'/)?.[1]);
  wrap.innerHTML = fields.map(f => 
    `<div class="form-group" style="margin:0">
      <label class="form-label" style="font-size:12px;margin-bottom:4px">${escHtml(f.label)}</label>
      <input type="text" class="form-input" id="tplvar-${f.key}" placeholder="${escHtml(f.placeholder)}" value="${f.key === 'TIP_TEXT' || f.key === 'HEADLINE' || f.key === 'TITLE_TEXT' || f.key === 'QUOTE_TEXT' ? escHtml(post?.post_text || '') : ''}">
    </div>`
  ).join('');
  document.getElementById('template-vars-wrap').style.display = 'block';
}
window.selectTemplatePicked = selectTemplatePicked;

async function confirmTemplateImage(postId) {
  if (!_pickedTemplate) { showToast('Pick a template first', 'error'); return; }
  const variables = {};
  document.querySelectorAll('[id^="tplvar-"]').forEach(inp => {
    const key = inp.id.replace('tplvar-', '');
    variables[key] = inp.value;
  });
  try {
    showToast('Generating image... ⏳');
    await apiFetch(`/posts/${postId}/generate-template-image`, {
      method: 'POST',
      body: JSON.stringify({ template: _pickedTemplate, variables })
    });
    showToast('Image generated ✓');
    document.getElementById('template-picker-modal').style.display = 'none';
    if (window._currentSeedId) openSeedDetail(window._currentSeedId);
  } catch(err) {
    showToast('Image generation failed: ' + err.message, 'error');
  }
}
window.confirmTemplateImage = confirmTemplateImage;

// Check if X is connected (cached)
let _xConnected = false;
async function refreshXConnection() {
  try { _xConnected = (await apiFetch('/x/status')).connected; }
  catch(_) { _xConnected = false; }
}

// Check if LinkedIn is connected (cached)
let _liConnected = false;
async function refreshLinkedInConnection() {
  try { _liConnected = (await apiFetch('/linkedin/status')).connected; }
  catch(_) { _liConnected = false; }
}

async function publishLinkedInPostNow(postId) {
  try {
    await apiFetch('/linkedin/publish', { method: 'POST', body: JSON.stringify({ post_id: postId }) });
    showToast('Published to LinkedIn ✓');
    if (window._currentSeedId) openSeedDetail(window._currentSeedId);
  } catch(err) {
    showToast('LinkedIn publish failed: ' + err.message, 'error');
  }
}
window.publishLinkedInPostNow = publishLinkedInPostNow;

async function publishPostNow(postId) {
  try {
    const result = await apiFetch('/x/publish', { method: 'POST', body: JSON.stringify({ post_id: postId }) });
    showToast(`Published to X ✓`);
    if (window._currentSeedId) openSeedDetail(window._currentSeedId);
  } catch(err) {
    showToast('Publish failed: ' + err.message, 'error');
  }
}
window.publishPostNow = publishPostNow;

async function deleteGeneratedPost(postId) {
  try {
    await apiFetch(`/posts/${postId}`, { method: 'DELETE' });
    if (window._currentSeedId) {
      const seed = await apiFetch(`/seeds/${window._currentSeedId}`);
      renderSeedPosts(seed.posts || []);
    }
    // Refresh calendar if it's visible so deleted scheduled posts disappear
    const calPane = document.getElementById('tab-calendar');
    if (calPane && calPane.style.display !== 'none') fetchCalendar();
  } catch(err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}
window.deleteGeneratedPost = deleteGeneratedPost;

function renderSeedPosts(posts) {
  _cachedPosts = posts;

  // Update tab counts
  const platforms = ['youtube', 'x', 'linkedin'];
  platforms.forEach(p => {
    const countEl = document.getElementById(`tab-count-${p}`);
    const count = posts.filter(post => post.platform === p).length;
    if (countEl) countEl.textContent = count > 0 ? String(count) : '';
  });

  // Reset to youtube tab when posts first load (or stay on current)
  if (!posts.length) _activePlatformTab = 'x';
  renderPlatformTabContent(posts);
}

function renderPlatformTabContent(posts) {
  const el = document.getElementById('seed-detail-posts');
  if (!el) return;

  const platformPosts = posts.filter(p => p.platform === _activePlatformTab);

  const PLATFORM_EMPTY = {
    youtube: 'No YouTube posts yet. Finalize this seed to let Hermes generate content.',
    x:       'No X posts yet. Finalize this seed to let Hermes generate content.',
    linkedin:'No LinkedIn posts yet. Finalize this seed to let Hermes generate content.',
  };

  if (!platformPosts.length) {
    el.innerHTML = `<div class="platform-tab-empty">${PLATFORM_EMPTY[_activePlatformTab] || 'No posts yet.'}</div>`;
    return;
  }

  el.innerHTML = platformPosts.map((post, idx) => {
    const isScheduled = post.status === 'scheduled';
    const isPosted    = post.status === 'posted';
    const proposedDate = post.scheduled_for ? formatDatetime(post.scheduled_for) : null;
    const isYouTube   = post.platform === 'youtube';
    const hasImage    = (tryParseArr(post.media_paths)).length > 0;
    return `
    <div class="post-card card ${isScheduled ? 'post-card-scheduled' : ''}">
      <div class="post-card-top">
        ${isScheduled ? `<span class="badge badge-scheduled-green">✓ Scheduled</span>` : statusBadge(post.status)}
        <span class="post-counter">${idx + 1} of ${platformPosts.length}</span>
        <div class="post-proposed-date ${!proposedDate ? 'post-proposed-missing' : ''}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${proposedDate || 'No date proposed'}
        </div>
      </div>
      ${isYouTube && post.title ? `<div class="post-yt-title" contenteditable="true" data-post-id="${post.id}" data-field="title" onblur="autoSavePostField('${post.id}','title',this.textContent)">${escHtml(post.title)}</div>` : ''}
      <div class="post-text" contenteditable="true" data-post-id="${post.id}" data-field="post_text" onblur="autoSavePostField('${post.id}','post_text',this.textContent)">${escHtml(post.post_text || '')}</div>
      ${post.image_prompt ? `<details class="post-notes-details"><summary class="post-notes-summary">Image prompt</summary><p class="post-notes text-muted">${escHtml(post.image_prompt)}</p></details>` : ''}
      ${post.notes && !post.image_prompt ? `<details class="post-notes-details"><summary class="post-notes-summary">Auri notes</summary><p class="post-notes text-muted">${escHtml(post.notes)}</p></details>` : ''}
      <div class="post-media-preview">${renderPostMedia(post.media_paths)}</div>
      <div class="post-card-actions">
        <button class="btn-secondary btn-sm" onclick="copyToClipboard(${JSON.stringify(post.post_text || '')})">Copy</button>
        ${!hasImage ? `<button class="btn-gen-img btn-sm" onclick="generateImageWithTemplate('${post.id}')">🎨 Image</button>` : ''}
        ${post.image_prompt && !hasImage ? `<button class="btn-gen-img btn-sm" onclick="generatePostImage('${post.id}')">⚡ Auto Image</button>` : ''}
        ${!isScheduled && !isPosted ? `<button class="btn-schedule btn-sm" onclick="approveAndSchedule('${post.id}', ${post.scheduled_for || 'null'})">✓ Schedule</button>` : ''}
        ${isScheduled && _activePlatformTab === 'x' ? `<button class="btn-publish btn-sm" onclick="publishPostNow('${post.id}')">Publish Now</button>` : ''}
        ${isScheduled && _activePlatformTab === 'linkedin' ? `<button class="btn-publish btn-sm" onclick="publishLinkedInPostNow('${post.id}')">Publish Now</button>` : ''}

        <button class="btn-delete-chip" style="margin-left:auto" onclick="deleteGeneratedPost('${post.id}')" title="Delete post"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div>
    </div>`;
  }).join('');
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
  if (btn) { btn.textContent = 'Sending…'; }
  try {
    await apiFetch(`/seeds/${seedId}/finalize`, { method: 'POST' });
    showToast('Sent to Auri — generating posts...');
    startProcessingPoll();
    // Refresh seed detail
    const seed = await apiFetch(`/seeds/${seedId}`);
    populateSeedDetail(seed);
    fetchSeeds();
  } catch(err) {
    showToast('Finalize failed: ' + err.message, 'error');
    if (btn) { btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Send to Auri'; }
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
        <div class="jfb" id="calViewBar">
          <div class="jfb-slider" id="calViewPill"></div>
          <button class="jfb-tab${_calView==='month'?' active':''}" data-calview="month">Month</button>
          <button class="jfb-tab${_calView==='week'?' active':''}" data-calview="week">Week</button>
          <button class="jfb-tab${_calView==='day'?' active':''}" data-calview="day">Day</button>
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

  // Wire jfb click delegation and position pill after render
  requestAnimationFrame(() => {
    posCalPill();
    const bar = document.getElementById('calViewBar');
    if (bar && !bar._wired) {
      bar._wired = true;
      bar.addEventListener('click', e => {
        const tab = e.target.closest('.jfb-tab');
        if (!tab) return;
        setCalView(tab.dataset.calview);
      });
    }
  });
  fetchCalendar();
}

function posCalPill() {
  const bar    = document.getElementById('calViewBar');
  const active = bar && bar.querySelector('.jfb-tab.active');
  const pill   = document.getElementById('calViewPill');
  if (!active || !pill || !bar) return;
  const isLast = !active.nextElementSibling;
  pill.style.left  = active.offsetLeft + 'px';
  pill.style.width = isLast ? (bar.offsetWidth - active.offsetLeft) + 'px' : active.offsetWidth + 'px';
}
window.posCalPill = posCalPill;

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

async function renderSettings() {
  const el = document.getElementById('settings-content');
  if (!el) return;

  const get = key => escHtml(_settings[key] || '');

  // Fetch Auri strategy defaults
  let auriDefaults = {};
  try { auriDefaults = await apiFetch('/strategy/defaults'); } catch(_) {}

  const PLATFORM_LABELS = { youtube: 'YouTube', x: 'X (Twitter)', linkedin: 'LinkedIn' };

  function buildPlatformCard(p) {
    const label    = PLATFORM_LABELS[p];
    const auri     = auriDefaults[p] || {};
    const auriFreq = auri.frequency || null;
    const auriTimes= auri.times || null;
    const auriVer  = auri.version ? `v${auri.version}` : '';
    const auriDate = auri.lastUpdated || '';
    const auriMeta = [auriVer, auriDate].filter(Boolean).join(' · ');

    // Resolve current frequency
    const storedFreq    = _settings[`platform.${p}.frequency`];
    const storedFreqOvr = _settings[`platform.${p}.freq_override`] === 'true' || _settings[`platform.${p}.freq_override`] === true;
    const displayFreq   = storedFreqOvr && storedFreq ? storedFreq : (auriFreq || storedFreq || '');
    const freqFromAuri  = !storedFreqOvr && auriFreq !== null;

    // Resolve posts per root
    const storedRoot = _settings[`platform.${p}.posts_per_root`];
    const displayRoot = storedRoot || (p === 'youtube' ? '1' : p === 'linkedin' ? '1' : '3');

    // Resolve current times
    const storedTimesOvr = _settings[`platform.${p}.times_override`] === 'true' || _settings[`platform.${p}.times_override`] === true;
    const storedTimes    = safeParseTimes(_settings[`platform.${p}.best_times`], null);
    const displayTimes   = storedTimesOvr && storedTimes ? storedTimes : (auriTimes || storedTimes || []);
    const timesFromAuri  = !storedTimesOvr && auriTimes !== null;

    const freqHint  = freqFromAuri
      ? `<span class="acct-row-hint">Auri ${auriMeta || ''}</span>`
      : `<span class="acct-row-hint">Overridden</span>`;
    const timesHint = timesFromAuri
      ? `<span class="acct-row-hint">Auri ${auriMeta || ''}</span>`
      : `<span class="acct-row-hint">Overridden</span>`;

    const resetFreqBtn  = !freqFromAuri  ? `<button class="btn-subtle reset-auri-btn" style="height:32px;padding:0 10px;font-size:11px" onclick="resetPlatformDefault('${p}','freq')">↺ Reset</button>` : '';
    const resetTimesBtn = !timesFromAuri ? `<button class="btn-subtle reset-auri-btn" style="height:32px;padding:0 10px;font-size:11px" onclick="resetPlatformDefault('${p}','times')">↺ Reset</button>` : '';

    return `
    <div class="platform-settings-card">
      <div class="platform-settings-card-header">
        <div style="display:flex;align-items:center;gap:8px">
          ${platformChip(p)}
          <span class="platform-settings-card-title">${escHtml(label)}</span>
          <button class="btn-subtle" style="height:26px;padding:0 10px;font-size:11px;margin-left:4px" onclick="viewStrategy('${p}')">View Strategy</button>
        </div>
      </div>
      <div class="acct-row platform-freq-row">
        <div class="acct-row-label">
          <span>Posts / week</span>
          ${freqHint}
        </div>
        <div class="acct-control" style="gap:6px">
          <input type="number" class="form-input" id="setting-${p}-freq" value="${escHtml(String(displayFreq))}" min="0" max="200" style="max-width:70px;text-align:center"
            oninput="markPlatformOverride('${p}','freq')">
          ${resetFreqBtn}
        </div>
      </div>
      <div class="acct-row platform-freq-row">
        <div class="acct-row-label">
          <span>Posts / root</span>
          <span class="acct-row-hint">Posts Auri generates per root post</span>
        </div>
        <div class="acct-control" style="gap:6px">
          <input type="number" class="form-input" id="setting-${p}-root" value="${escHtml(String(displayRoot))}" min="1" max="50" style="max-width:70px;text-align:center">
        </div>
      </div>
      <div class="acct-row acct-row-stacked platform-times-row">
        <div class="acct-row-label">
          <span>Best posting times</span>
          ${timesHint}
        </div>
        <div class="acct-control" style="gap:6px;width:100%">
          <input type="text" class="form-input" id="setting-${p}-times" value="${escHtml(displayTimes.join(', '))}" placeholder="09:00, 13:00, 18:00" style="flex:1"
            oninput="markPlatformOverride('${p}','times')">
          ${resetTimesBtn}
        </div>
      </div>
      ${p === 'x' ? `
      <div class="acct-row acct-row-stacked">
        <div class="acct-row-label">
          <span>X Client ID</span>
          <span class="acct-row-hint">From developer.x.com → App → OAuth 2.0</span>
        </div>
        <div class="acct-control" style="min-width:300px">
          <input type="text" class="form-input" id="setting-x-client-id" value="${get('x.client_id') || ''}" placeholder="Paste Client ID..." oninput="markSettingDirty('x.client_id', this.value)">
        </div>
      </div>
      <div class="acct-row acct-row-stacked">
        <div class="acct-row-label">
          <span>X Client Secret</span>
          <span class="acct-row-hint">OAuth 2.0 client secret</span>
        </div>
        <div class="acct-control" style="min-width:300px">
          <input type="password" class="form-input" id="setting-x-client-secret" value="${get('x.client_secret') || ''}" placeholder="Paste Client Secret..." oninput="markSettingDirty('x.client_secret', this.value)">
        </div>
      </div>
      <div class="acct-row">
        <div class="acct-row-label">
          <span>X Connection</span>
          <span class="acct-row-hint" id="x-status-hint">Checking...</span>
        </div>
        <div class="acct-control">
          <button class="btn-primary" id="btn-x-connect" onclick="connectX()" style="display:none">Connect X</button>
          <button class="btn-danger-solid" id="btn-x-disconnect" onclick="disconnectX()" style="display:none">Disconnect</button>
        </div>
      </div>
      ` : ''}
      ${p === 'linkedin' ? `
      <div class="acct-row acct-row-stacked">
        <div class="acct-row-label">
          <span>LinkedIn Client ID</span>
          <span class="acct-row-hint">From linkedin.com/developers → App → Auth</span>
        </div>
        <div class="acct-control" style="min-width:300px">
          <input type="text" class="form-input" id="setting-linkedin-client-id" value="${get('linkedin.client_id') || ''}" placeholder="Paste Client ID..." oninput="markSettingDirty('linkedin.client_id', this.value)">
        </div>
      </div>
      <div class="acct-row acct-row-stacked">
        <div class="acct-row-label">
          <span>LinkedIn Client Secret</span>
          <span class="acct-row-hint">Primary client secret</span>
        </div>
        <div class="acct-control" style="min-width:300px">
          <input type="password" class="form-input" id="setting-linkedin-client-secret" value="${get('linkedin.client_secret') || ''}" placeholder="Paste Client Secret..." oninput="markSettingDirty('linkedin.client_secret', this.value)">
        </div>
      </div>
      <div class="acct-row">
        <div class="acct-row-label">
          <span>LinkedIn Connection</span>
          <span class="acct-row-hint" id="li-status-hint">Checking...</span>
        </div>
        <div class="acct-control">
          <button class="btn-primary" id="btn-li-connect" onclick="connectLinkedIn()" style="display:none">Connect LinkedIn</button>
          <button class="btn-danger-solid" id="btn-li-disconnect" onclick="disconnectLinkedIn()" style="display:none">Disconnect</button>
        </div>
      </div>
      ` : ''}
    </div>`;
  }

  el.innerHTML = `
  <div class="settings-wrap">

    <!-- Segment toggle + Save row -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div class="jfb" id="settingsViewBar">
        <div class="jfb-slider" id="settingsViewPill"></div>
        <button class="jfb-tab active" data-panel="app" onclick="switchSettingsPanel('app')">App Settings</button>
        <button class="jfb-tab" data-panel="brand" onclick="switchSettingsPanel('brand')">Brand Settings</button>
        <button class="jfb-tab" data-panel="platform" onclick="switchSettingsPanel('platform')">Platform Settings</button>
      </div>
      <button class="btn-primary" onclick="saveSettings()" style="height:34px;padding:0 16px;font-size:13px;display:flex;align-items:center;gap:6px;flex-shrink:0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save Settings
      </button>
    </div>

    <!-- Panel: App Settings -->
    <div class="settings-panel" id="settings-panel-app">
    <div class="settings-row">
    <div class="acct-section settings-col">
      <div class="acct-section-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> App Settings</div>
      <div class="acct-row">
        <div class="acct-row-label">
          <span>Server Port</span>
          <span class="acct-row-hint">Restart server to change</span>
        </div>
        <div class="acct-control">
          <input type="text" class="form-input" id="setting-port" value="${get('app.port') || '8788'}" readonly style="max-width:90px;text-align:center">
        </div>
      </div>
    </div>
    </div>
    </div><!-- /settings-panel-app -->

    <!-- Panel: Brand Settings -->
    <div class="settings-panel" id="settings-panel-brand" style="display:none">
    <div class="settings-row">
      <div class="acct-section settings-col">
        <div class="acct-section-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5" fill="currentColor" opacity="0.8"/><circle cx="17.5" cy="10.5" r="2.5" fill="currentColor" opacity="0.6"/><path d="M3 17l4-4 4 4 3-3 4 4 3-3"/></svg> Brand & Image Settings</div>
        <div class="acct-row acct-row-stacked">
          <div class="acct-row-label">
            <span>Brand Name</span>
            <span class="acct-row-hint">Shown on generated images</span>
          </div>
          <div class="acct-control" style="min-width:200px">
            <input type="text" class="form-input" id="setting-brand-name" value="${get('brand.name') || 'JumpKit'}" placeholder="JumpKit">
          </div>
        </div>
        <div class="acct-row acct-row-stacked">
          <div class="acct-row-label">
            <span>Brand Logo</span>
            <span class="acct-row-hint">PNG/SVG, shown bottom-right on images</span>
          </div>
          <div class="acct-control" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div id="brand-logo-preview" style="width:60px;height:60px;border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg)">
              ${get('brand.logo_path') ? `<img src="/${get('brand.logo_path')}?t=${Date.now()}" style="max-width:100%;max-height:100%;object-fit:contain">` : `<span style="font-size:10px;color:var(--text-muted)">No logo</span>`}
            </div>
            <label class="media-upload-btn" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
              <input type="file" id="brand-logo-file" accept="image/png,image/svg+xml,image/jpeg" style="display:none" onchange="uploadBrandLogo(event)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Logo
            </label>
            ${get('brand.logo_path') ? `<button class="btn-subtle" style="height:32px;padding:0 10px;font-size:11px" onclick="removeBrandLogo()">Remove</button>` : ''}
          </div>
        </div>
        <div class="acct-row">
          <div class="acct-row-label">
            <span>Background Color</span>
            <span class="acct-row-hint">Image background base</span>
          </div>
          <div class="acct-control" style="gap:8px">
            <input type="color" class="color-picker-input" id="setting-brand-primary-color" value="${get('brand.primary_color') || '#0F0F1A'}" style="width:40px;height:36px;border:none;border-radius:6px;cursor:pointer;background:none">
            <input type="text" class="form-input" id="setting-brand-primary-color-text" value="${get('brand.primary_color') || '#0F0F1A'}" style="max-width:100px;font-size:13px" oninput="document.getElementById('setting-brand-primary-color').value = this.value">
          </div>
        </div>
        <div class="acct-row">
          <div class="acct-row-label">
            <span>Accent Color</span>
            <span class="acct-row-hint">Highlights, buttons, bars</span>
          </div>
          <div class="acct-control" style="gap:8px">
            <input type="color" class="color-picker-input" id="setting-brand-accent-color" value="${get('brand.accent_color') || '#00D4AA'}" style="width:40px;height:36px;border:none;border-radius:6px;cursor:pointer;background:none">
            <input type="text" class="form-input" id="setting-brand-accent-color-text" value="${get('brand.accent_color') || '#00D4AA'}" style="max-width:100px;font-size:13px" oninput="document.getElementById('setting-brand-accent-color').value = this.value">
          </div>
        </div>
        <div class="acct-row">
          <div class="acct-row-label">
            <span>Text Color</span>
            <span class="acct-row-hint">Body text on images</span>
          </div>
          <div class="acct-control" style="gap:8px">
            <input type="color" class="color-picker-input" id="setting-brand-text-color" value="${get('brand.text_color') || '#FFFFFF'}" style="width:40px;height:36px;border:none;border-radius:6px;cursor:pointer;background:none">
            <input type="text" class="form-input" id="setting-brand-text-color-text" value="${get('brand.text_color') || '#FFFFFF'}" style="max-width:100px;font-size:13px" oninput="document.getElementById('setting-brand-text-color').value = this.value">
          </div>
        </div>
        <div class="acct-row">
          <div class="acct-row-label">
            <span>Auto-generate images</span>
            <span class="acct-row-hint">When Auri generates posts</span>
          </div>
          <div class="acct-control">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="setting-image-auto-generate" ${_settings['image.auto_generate'] === 'true' ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)">
              <span style="font-size:13px;color:var(--text-muted)">Enabled</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Template Preview -->
      <div class="acct-section settings-col">
        <div class="acct-section-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21"/></svg> Template Preview</div>
        <div id="brand-preview-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px 16px">
          <div class="brand-preview-item" onclick="previewTemplate('quote')" style="cursor:pointer">
            <div class="brand-preview-label">Quote</div>
            <div class="brand-preview-thumb" style="background:linear-gradient(135deg, ${get('brand.primary_color') || '#0F0F1A'}, #1A1A2E);border:1px solid var(--border);border-radius:8px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center">
              <span style="color:${get('brand.accent_color') || '#00D4AA'};font-weight:700;font-size:12px">\"Quote"</span>
            </div>
          </div>
          <div class="brand-preview-item" onclick="previewTemplate('stat')" style="cursor:pointer">
            <div class="brand-preview-label">Stat</div>
            <div class="brand-preview-thumb" style="background:linear-gradient(135deg, ${get('brand.primary_color') || '#0F0F1A'}, #1A1A2E);border:1px solid var(--border);border-radius:8px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center">
              <span style="color:${get('brand.accent_color') || '#00D4AA'};font-weight:800;font-size:22px">10x</span>
            </div>
          </div>
          <div class="brand-preview-item" onclick="previewTemplate('tip')" style="cursor:pointer">
            <div class="brand-preview-label">Tip</div>
            <div class="brand-preview-thumb" style="background:linear-gradient(135deg, ${get('brand.primary_color') || '#0F0F1A'}, #1A1A2E);border:1px solid var(--border);border-radius:8px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center">
              <span style="color:${get('brand.text_color') || '#FFFFFF'};font-weight:600;font-size:11px">TIP</span>
            </div>
          </div>
          <div class="brand-preview-item" onclick="previewTemplate('announcement')" style="cursor:pointer">
            <div class="brand-preview-label">Announce</div>
            <div class="brand-preview-thumb" style="background:linear-gradient(135deg, ${get('brand.primary_color') || '#0F0F1A'}, #1A1A2E);border:1px solid var(--border);border-radius:8px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center">
              <span style="color:${get('brand.accent_color') || '#00D4AA'};font-weight:700;font-size:11px;padding:2px 8px;border:1px solid currentColor;border-radius:10px">NEW</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div><!-- /settings-panel-brand -->

    <!-- Panel: Platform Settings -->
    <div class="settings-panel" id="settings-panel-platform" style="display:none">
    <div class="settings-row">
    ${['x','linkedin','youtube'].map(p => `<div class="settings-col">${buildPlatformCard(p)}</div>`).join('')}
    </div>
    </div><!-- /settings-panel-platform -->

  </div>`;
  setTimeout(() => {
    initCustomSelects(el);
    // Sync color pickers with text inputs
    syncColorPicker('setting-brand-primary-color', 'setting-brand-primary-color-text');
    syncColorPicker('setting-brand-accent-color', 'setting-brand-accent-color-text');
    syncColorPicker('setting-brand-text-color', 'setting-brand-text-color-text');
    positionSettingsPill();
  }, 50);
}

function markPlatformOverride(platform, field) {
  // Mark that user has manually edited this field (checked on save)
  const el = document.getElementById(`setting-${platform}-${field === 'freq' ? 'freq' : 'times'}`);
  if (el) el.dataset.overridden = 'true';
}
window.markPlatformOverride = markPlatformOverride;

function switchSettingsPanel(name) {
  ['app','brand','platform'].forEach(p => {
    const panel = document.getElementById(`settings-panel-${p}`);
    if (panel) panel.style.display = p === name ? '' : 'none';
    const btn = document.querySelector(`#settingsViewBar .jfb-tab[data-panel="${p}"]`);
    if (btn) btn.classList.toggle('active', p === name);
  });
  // slide the pill
  const bar  = document.getElementById('settingsViewBar');
  const pill = document.getElementById('settingsViewPill');
  if (bar && pill) {
    const active = bar.querySelector('.jfb-tab.active');
    if (active) {
      pill.style.left  = active.offsetLeft + 'px';
      pill.style.width = active.offsetWidth + 'px';
    }
  }
}
window.switchSettingsPanel = switchSettingsPanel;

function positionSettingsPill() {
  const bar  = document.getElementById('settingsViewBar');
  const pill = document.getElementById('settingsViewPill');
  if (!bar || !pill) return;
  const active = bar.querySelector('.jfb-tab.active');
  if (active) {
    pill.style.left  = active.offsetLeft + 'px';
    pill.style.width = active.offsetWidth + 'px';
  }
}

async function resetPlatformDefault(platform, field) {
  // Clear override flag in settings, then re-render
  const key = field === 'freq' ? `platform.${platform}.freq_override` : `platform.${platform}.times_override`;
  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ [key]: 'false' }) });
    _settings[key] = 'false';
    await renderSettings();
    showToast('Reset to Auri default');
  } catch(err) {
    showToast('Reset failed: ' + err.message, 'error');
  }
}
window.resetPlatformDefault = resetPlatformDefault;

function safeParseTimes(val, fallback) {
  try {
    const arr = JSON.parse(val);
    if (Array.isArray(arr)) return arr;
  } catch(_) {}
  return fallback;
}

function renderPlatformSettingsRows(platform, label, frequency, bestTimes) {
  const timesValue = escHtml(bestTimes.join(', '));
  return `
    <div class="acct-row">
      <div class="acct-row-label">
        <span style="display:flex;align-items:center;gap:8px">${platformChip(platform)} ${escHtml(label)}</span>
        <span class="acct-row-hint">Posts per week target</span>
      </div>
      <div class="acct-control">
        <input type="number" class="form-input" id="setting-${platform}-freq" value="${frequency}" min="0" max="50" style="max-width:70px;text-align:center">
      </div>
    </div>
    <div class="acct-row">
      <div class="acct-row-label">
        <span>${escHtml(label)} Best Times</span>
        <span class="acct-row-hint">Comma-separated, e.g. 9:00, 12:00, 17:00</span>
      </div>
      <div class="acct-control" style="min-width:240px">
        <input type="text" class="form-input" id="setting-${platform}-times" value="${timesValue}" placeholder="9:00, 12:00, 17:00" style="flex:1">
      </div>
    </div>`;
}

async function viewStrategy(platform) {
  const labels = {youtube:'YouTube', x:'X (Twitter)', linkedin:'LinkedIn'};
  const label = labels[platform] || platform;
  try {
    const data = await apiFetch(`/strategy/${platform}`);
    if (data.error || !data.content) {
      showToast(data.error || 'Strategy file not found', 'error');
      return;
    }
    // Build or reuse modal
    let modal = document.getElementById('strategy-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'strategy-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box strategy-modal-box">
          <div class="modal-header">
            <span id="strategy-modal-title" class="modal-title"></span>
            <button class="modal-close" onclick="document.getElementById('strategy-modal').style.display='none'">&times;</button>
          </div>
          <div class="modal-body">
            <pre id="strategy-modal-content" class="strategy-pre"></pre>
          </div>
        </div>`;
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    document.getElementById('strategy-modal-title').textContent = label + ' Strategy — Auri';
    document.getElementById('strategy-modal-content').textContent = data.content;
    modal.style.display = 'flex';
  } catch(err) {
    showToast('Failed to load strategy: ' + err.message, 'error');
  }
}
window.viewStrategy = viewStrategy;

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

// ── X (Twitter) OAuth ──────────────────────────────────────────────────────
async function checkXStatus() {
  try {
    const status = await apiFetch('/x/status');
    const hint = document.getElementById('x-status-hint');
    const btnConnect = document.getElementById('btn-x-connect');
    const btnDisconnect = document.getElementById('btn-x-disconnect');
    if (status.connected) {
      if (hint) hint.innerHTML = '<span style="display:inline-block;background:#15803d;color:#fff;border-radius:99px;padding:1px 8px;font-size:10px;font-weight:600">Connected</span>';
      if (btnConnect) btnConnect.style.display = 'none';
      if (btnDisconnect) btnDisconnect.style.display = '';
    } else {
      if (hint) hint.innerHTML = '<span style="display:inline-block;background:var(--bg-hover);color:var(--text-muted);border-radius:99px;padding:1px 8px;font-size:10px;font-weight:600;border:1px solid var(--border)">Not connected</span>';
      if (btnConnect) btnConnect.style.display = '';
      if (btnDisconnect) btnDisconnect.style.display = 'none';
    }
  } catch(_) {
    const hint = document.getElementById('x-status-hint');
    if (hint) hint.innerHTML = '<span style="display:inline-block;background:var(--bg-hover);color:var(--text-muted);border-radius:99px;padding:1px 8px;font-size:10px;font-weight:600;border:1px solid var(--border)">Unknown</span>';
  }
}

async function connectX() {
  try {
    const { authUrl } = await apiFetch('/x/connect');
    // Open OAuth in new window
    window.open(authUrl, '_blank', 'width=600,height=700');
    // Poll for connection status after redirect
    const poll = setInterval(async () => {
      try {
        const status = await apiFetch('/x/status');
        if (status.connected) {
          clearInterval(poll);
          checkXStatus();
          showToast('X account connected! ✓');
        }
      } catch(_) {}
    }, 2000);
    // Stop polling after 2 minutes
    setTimeout(() => clearInterval(poll), 120000);
  } catch(err) {
    showToast('Failed to start X connection: ' + err.message, 'error');
  }
}
window.connectX = connectX;

async function disconnectX() {
  try {
    await apiFetch('/x/disconnect', { method: 'POST' });
    checkXStatus();
    showToast('X account disconnected');
  } catch(err) {
    showToast('Disconnect failed: ' + err.message, 'error');
  }
}
window.disconnectX = disconnectX;

async function connectLinkedIn() {
  try {
    const { url } = await apiFetch('/linkedin/connect', { method: 'POST' });
    window.open(url, '_blank', 'width=600,height=700');
    const poll = setInterval(async () => {
      try {
        const status = await apiFetch('/linkedin/status');
        if (status.connected) {
          clearInterval(poll);
          checkLinkedInStatus();
          showToast('LinkedIn account connected! ✓');
        }
      } catch(_) {}
    }, 2000);
    setTimeout(() => clearInterval(poll), 120000);
  } catch(err) {
    showToast('Failed to start LinkedIn connection: ' + err.message, 'error');
  }
}
window.connectLinkedIn = connectLinkedIn;

async function disconnectLinkedIn() {
  try {
    await apiFetch('/linkedin/disconnect', { method: 'POST' });
    checkLinkedInStatus();
    showToast('LinkedIn account disconnected');
  } catch(err) {
    showToast('Disconnect failed: ' + err.message, 'error');
  }
}
window.disconnectLinkedIn = disconnectLinkedIn;

async function checkLinkedInStatus() {
  let connected = false;
  try { connected = (await apiFetch('/linkedin/status')).connected; } catch(_) {}
  const hint  = document.getElementById('li-status-hint');
  const btnC  = document.getElementById('btn-li-connect');
  const btnD  = document.getElementById('btn-li-disconnect');
  if (!hint) return;
  if (connected) {
    hint.innerHTML = '<span style="display:inline-block;background:#15803d;color:#fff;border-radius:99px;padding:1px 8px;font-size:10px;font-weight:600">Connected</span>';
    if (btnC) btnC.style.display = 'none';
    if (btnD) btnD.style.display = '';
  } else {
    hint.innerHTML = '<span style="opacity:.6">Not connected</span>';
    if (btnC) btnC.style.display = '';
    if (btnD) btnD.style.display = 'none';
  }
}
window.checkLinkedInStatus = checkLinkedInStatus;

// Auto-check X + LinkedIn status when settings tab loads
const _originalLoadSettings = loadSettings;
loadSettings = function() {
  _originalLoadSettings();
  setTimeout(checkXStatus, 500);
  setTimeout(checkLinkedInStatus, 600);
};

async function saveSettings() {
  const xClientIdEl = document.getElementById('setting-x-client-id');
  const xClientSecretEl = document.getElementById('setting-x-client-secret');
  const liClientIdEl = document.getElementById('setting-linkedin-client-id');
  const liClientSecretEl = document.getElementById('setting-linkedin-client-secret');

  const payload = {};

  if (xClientIdEl)     payload['x.client_id']     = xClientIdEl.value.trim();
  if (xClientSecretEl) payload['x.client_secret'] = xClientSecretEl.value.trim();
  if (liClientIdEl)    payload['linkedin.client_id']     = liClientIdEl.value.trim();
  if (liClientSecretEl) payload['linkedin.client_secret'] = liClientSecretEl.value.trim();
  if (xClientSecretEl) payload['x.client_secret'] = xClientSecretEl.value.trim();

  // Brand settings
  const brandNameEl = document.getElementById('setting-brand-name');
  const brandPrimaryEl = document.getElementById('setting-brand-primary-color');
  const brandAccentEl = document.getElementById('setting-brand-accent-color');
  const brandTextEl = document.getElementById('setting-brand-text-color');
  const autoGenEl = document.getElementById('setting-image-auto-generate');
  if (brandNameEl)    payload['brand.name'] = brandNameEl.value.trim();
  if (brandPrimaryEl) payload['brand.primary_color'] = brandPrimaryEl.value;
  if (brandAccentEl)  payload['brand.accent_color'] = brandAccentEl.value;
  if (brandTextEl)    payload['brand.text_color'] = brandTextEl.value;
  if (autoGenEl)      payload['image.auto_generate'] = autoGenEl.checked ? 'true' : 'false';

  // Platform settings — always save whatever is in the inputs as overridden
  for (const platform of ['x','linkedin','youtube']) {
    const freqEl  = document.getElementById(`setting-${platform}-freq`);
    const timesEl = document.getElementById(`setting-${platform}-times`);
    const rootEl  = document.getElementById(`setting-${platform}-root`);
    if (freqEl) {
      payload[`platform.${platform}.frequency`]     = freqEl.value;
      payload[`platform.${platform}.freq_override`] = 'true';
    }
    if (timesEl) {
      const times = timesEl.value.split(',').map(t => t.trim()).filter(Boolean);
      payload[`platform.${platform}.best_times`]      = JSON.stringify(times);
      payload[`platform.${platform}.times_override`]  = 'true';
    }
    if (rootEl) {
      payload[`platform.${platform}.posts_per_root`]  = rootEl.value;
    }
  }

  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    _settings = { ..._settings, ...payload };
    showToast('Settings saved!');
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}
window.saveSettings = saveSettings;

function markSettingDirty(key, value) {
  _settings[key] = value;
}
window.markSettingDirty = markSettingDirty;

// Sync color picker with text input
function syncColorPicker(pickerId, textId) {
  const picker = document.getElementById(pickerId);
  const text = document.getElementById(textId);
  if (picker && text) {
    picker.addEventListener('input', () => { text.value = picker.value; });
  }
}
window.syncColorPicker = syncColorPicker;

// Preview a template by generating it server-side and showing in a modal
async function previewTemplate(template) {
  const sampleVars = {
    quote:        { QUOTE_TEXT: 'Your brand on autopilot. Every post, perfectly crafted.', AUTHOR_NAME: '@jumpkit' },
    stat:         { BIG_NUMBER: '10x', CAPTION: 'Faster content creation', SOURCE: 'PostKit 2026' },
    tip:          { TIP_TEXT: 'Use templates to generate branded images in seconds', TIP_NUMBER: '1', CATEGORY_LABEL: 'TIP' },
    announcement: { BADGE_TEXT: 'NEW', HEADLINE: 'PostKit v2 launches with image generation', SUBTEXT: 'Branded images in one click' },
    'list-cover': { THREAD_NUMBER: '1', TITLE_TEXT: '5 ways PostKit saves you time', TOTAL_COUNT: '5' },
  };
  const variables = sampleVars[template] || {};
  try {
    showToast('Rendering preview...');
    const result = await apiFetch('/templates/preview', {
      method: 'POST',
      body: JSON.stringify({ template, variables })
    });
    // Show in a lightbox
    let modal = document.getElementById('template-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'template-preview-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `<div class="modal" style="max-width:680px"><div class="modal-header"><h2 class="modal-title">Template Preview</h2><button class="modal-close" onclick="document.getElementById('template-preview-modal').style.display='none'">✕</button></div><div class="modal-body" style="text-align:center"><img id="template-preview-img" style="max-width:100%;border-radius:8px"></div></div>`;
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    document.getElementById('template-preview-img').src = result.url + '?t=' + Date.now();
    modal.style.display = 'flex';
  } catch(err) {
    showToast('Preview failed: ' + err.message, 'error');
  }
}
window.previewTemplate = previewTemplate;

// Media lightbox
function openMediaLightbox(src, type) {
  let modal = document.getElementById('media-lightbox');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'media-lightbox';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;padding:20px';
    modal.innerHTML = `<div id="media-lightbox-content" style="max-width:90%;max-height:90%"></div>`;
    modal.addEventListener('click', () => modal.style.display = 'none');
    document.body.appendChild(modal);
  }
  const content = document.getElementById('media-lightbox-content');
  if (type === 'video') {
    content.innerHTML = `<video src="${src}" style="max-width:90vw;max-height:90vh;border-radius:8px" controls autoplay>`;
  } else {
    content.innerHTML = `<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain">`;
  }
  modal.style.display = 'flex';
}
window.openMediaLightbox = openMediaLightbox;

// Upload brand logo
async function uploadBrandLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const base64 = await fileToBase64(file);
    const result = await apiFetch('/brand/logo', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, mime_type: file.type, data: base64 })
    });
    _settings['brand.logo_path'] = result.path;
    showToast('Logo uploaded ✓');
    await renderSettings();
  } catch(err) {
    showToast('Logo upload failed: ' + err.message, 'error');
  }
  event.target.value = '';
}
window.uploadBrandLogo = uploadBrandLogo;

// Remove brand logo
async function removeBrandLogo() {
  try {
    await apiFetch('/brand/logo', { method: 'DELETE' });
    delete _settings['brand.logo_path'];
    showToast('Logo removed');
    await renderSettings();
  } catch(err) {
    showToast('Remove failed: ' + err.message, 'error');
  }
}
window.removeBrandLogo = removeBrandLogo;

/* =========================================================
   TOAST STYLES (injected if not in CSS)
   ========================================================= */
/* =========================================================
   CUSTOM SELECT
   ========================================================= */
function buildCustomSelect(id, options, selectedValue) {
  const selected = options.find(o => o.value === selectedValue) || options[0];
  const chevron = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 8L1 3h10z" fill="currentColor"/></svg>`;
  const items = options.map(o =>
    `<div class="csel-option${o.value === selectedValue ? ' selected' : ''}" data-value="${escHtml(o.value)}">${escHtml(o.label)}</div>`
  ).join('');
  return `
    <div class="csel" id="${id}" data-value="${escHtml(selected.value)}" tabindex="0">
      <div class="csel-trigger">
        <span class="csel-label">${escHtml(selected.label)}</span>
        <span class="csel-chevron">${chevron}</span>
      </div>
      <div class="csel-dropdown">${items}</div>
    </div>`;
}

function getCustomSelectValue(id) {
  const el = document.getElementById(id);
  return el ? el.dataset.value : '';
}

function initCustomSelects(container) {
  const root = container || document;
  root.querySelectorAll('.csel').forEach(csel => {
    if (csel._csInited) return;
    csel._csInited = true;
    const trigger = csel.querySelector('.csel-trigger');
    const dropdown = csel.querySelector('.csel-dropdown');

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = csel.classList.contains('open');
      document.querySelectorAll('.csel.open').forEach(c => c.classList.remove('open'));
      if (!isOpen) csel.classList.add('open');
    });

    dropdown.addEventListener('click', e => {
      const opt = e.target.closest('.csel-option');
      if (!opt) return;
      const val = opt.dataset.value;
      csel.dataset.value = val;
      csel.querySelector('.csel-label').textContent = opt.textContent;
      dropdown.querySelectorAll('.csel-option').forEach(o => o.classList.toggle('selected', o.dataset.value === val));
      csel.classList.remove('open');
      csel.dispatchEvent(new CustomEvent('csel:change', { detail: { value: val }, bubbles: true }));
    });

    csel.addEventListener('keydown', e => {
      if (e.key === 'Escape') csel.classList.remove('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.csel.open').forEach(c => c.classList.remove('open'));
  }, { once: false });
}
window.initCustomSelects = initCustomSelects;
window.getCustomSelectValue = getCustomSelectValue;

function injectToastStyles() {
  if (document.getElementById('postkit-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'postkit-toast-styles';
  style.textContent = `
    /* Custom Select */
    .csel { position:relative; display:inline-block; min-width:120px; user-select:none; }
    .csel-trigger { display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:9px 12px; background:var(--bg); border:1px solid var(--border); border-radius:4px;
      color:var(--text); font-size:13.5px; cursor:pointer; transition:border-color .15s; white-space:nowrap; }
    .csel:focus .csel-trigger, .csel.open .csel-trigger { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-glow); }
    .csel-chevron { color:var(--text-muted); flex-shrink:0; transition:transform .15s; display:flex; align-items:center; }
    .csel.open .csel-chevron { transform:rotate(180deg); }
    .csel-dropdown { display:none; position:absolute; top:calc(100% + 4px); left:0; min-width:100%;
      background:var(--bg-card); border:1px solid var(--border); border-radius:6px;
      box-shadow:0 8px 24px var(--shadow); z-index:500; overflow:hidden; }
    .csel.open .csel-dropdown { display:block; }
    .csel-option { padding:9px 14px; font-size:13.5px; color:var(--text); cursor:pointer; transition:background .1s; white-space:nowrap; }
    .csel-option:hover { background:var(--bg-hover); }
    .csel-option.selected { color:var(--accent-light); font-weight:600; }
    /* Full-width variant */
    .csel.csel-full { display:block; }
    .csel.csel-full .csel-trigger { width:100%; }
    .csel.csel-full .csel-dropdown { width:100%; }

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
    .platform-count-pill { font-weight:700; border-radius:99px; }
    .platform-pill-x { background:#333639; color:#e7e9ea; }
    .platform-pill-linkedin { background:rgba(10,102,194,0.95); color:#ffffff; }
    .platform-pill-youtube { background:rgba(220,38,38,0.95); color:#ffffff; }
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
    .post-counter { margin-left:auto; font-size:11px; font-weight:600; color:var(--text-muted); opacity:0.6; }
    .post-scheduled { font-size:12px; }
    .post-text { margin:0 0 8px; font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .post-notes { font-size:12px; margin:0 0 8px; }
    .post-card-actions { display:flex; gap:8px; }
    .posts-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .posts-header h3 { margin:0; font-size:16px; }
    /* Platform tabs */
    .generated-posts-header { font-size:13px; font-weight:700; color:var(--accent); margin-bottom:8px; flex-shrink:0; }
    .platform-tabs { display:flex; gap:2px; margin-bottom:0; background:var(--bg-surface); border-radius:8px; padding:3px; flex-shrink:0; }
    .platform-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:5px; height:32px; border:none; border-radius:6px; background:transparent; color:var(--text-muted); font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; }
    .platform-tab:hover { color:var(--text); background:var(--bg-hover); }
    .platform-tab.active { background:var(--bg-card); color:var(--text); box-shadow:0 1px 3px rgba(0,0,0,.15); }
    .platform-tab[data-platform="youtube"].active { color:#c0392b; }
    .platform-tab[data-platform="x"].active { color:var(--text); }
    .platform-tab[data-platform="linkedin"].active { color:#0077b5; }
    .platform-tab-empty { padding:32px 16px; text-align:center; color:var(--text-dim); font-size:13px; line-height:1.6; }
    /* Post card review elements */
    .post-proposed-date { display:flex; align-items:center; gap:4px; font-size:12px; font-weight:600; color:var(--accent); }
    .post-proposed-missing { color:var(--text-dim); font-weight:400; }
    .post-card-scheduled { border-color:rgba(107,84,199,0.35) !important; }
    .btn-schedule { background:rgba(107,84,199,0.12); color:var(--accent); border:1px solid rgba(107,84,199,0.3); font-weight:600; cursor:pointer; border-radius:6px; transition:all .15s; }
    .btn-schedule:hover { background:rgba(107,84,199,0.22); border-color:var(--accent); }
    .btn-publish { background:rgba(34,197,94,0.07); color:rgba(34,197,94,0.75); border:1px solid rgba(34,197,94,0.18); font-weight:600; cursor:pointer; border-radius:6px; transition:all .15s; }
    .btn-publish:hover { background:rgba(34,197,94,0.14); border-color:rgba(34,197,94,0.35); color:var(--success); }
    .btn-gen-img { background:rgba(168,85,247,0.12); color:#a855f7; border:1px solid rgba(168,85,247,0.3); font-weight:600; cursor:pointer; border-radius:6px; transition:all .15s; }
    .btn-gen-img:hover { background:rgba(168,85,247,0.22); border-color:#a855f7; }
    .post-yt-title { font-size:15px; font-weight:700; color:var(--text); margin:8px 0 4px; padding:6px 10px; background:rgba(255,0,0,0.06); border-left:3px solid #ff0000; border-radius:4px; }
    .post-media-grid { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
    .post-media-thumb { width:80px; height:80px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:pointer; }
    .post-media-file { font-size:12px; color:var(--text-muted); display:flex; align-items:center; }
    .badge-scheduled-green { background:rgba(34,197,94,0.07); color:rgba(34,197,94,0.75); border:1px solid rgba(34,197,94,0.18); font-size:11px; font-weight:600; padding:2px 8px; border-radius:3px; display:inline-flex; align-items:center; gap:3px; }
    .btn-delete-chip { background:rgba(239,68,68,0.1); color:var(--danger); border:none; border-radius:4px; font-size:11px; font-weight:600; padding:4px 8px; cursor:pointer; transition:all .15s; display:inline-flex; align-items:center; justify-content:center; }
    .btn-delete-chip:hover { background:rgba(239,68,68,0.22); }
    .post-notes-details { margin-top:6px; }
    .post-notes-details summary.post-notes-summary { font-size:11px; color:var(--text-dim); cursor:pointer; user-select:none; }
    .post-notes-details[open] summary { color:var(--text-muted); }
    /* Seed detail modal icon chip */
    .modal-seed-icon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:7px; background:rgba(107,84,199,0.15); flex-shrink:0; margin-right:4px; }
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
    /* Inline editable fields in seed detail */
    .seed-title-input { background:transparent; border:none; border-bottom:1.5px solid transparent; outline:none; font-size:1.1rem; font-weight:700; color:var(--text); width:100%; padding:2px 0; transition:border-color .15s; }
    .seed-title-input:hover { border-bottom-color:var(--border); }
    .seed-title-input:focus { border-bottom-color:var(--accent); }
    .meta-editable { background:transparent; border:none; border-bottom:1.5px solid transparent; outline:none; font-size:0.88rem; color:var(--text); width:100%; padding:2px 0; transition:border-color .15s; }
    .meta-editable:hover { border-bottom-color:var(--border); }
    .meta-editable:focus { border-bottom-color:var(--accent); }
    .meta-editable::placeholder { color:var(--text-dim); }
    .form-hint-inline { font-size:10px; color:var(--text-dim); font-weight:400; margin-left:6px; text-transform:none; letter-spacing:0; }
    /* Seed detail action row */
    .seed-actions-row { display:flex; gap:8px; align-items:stretch; }
    .seed-action-side { flex:0 0 auto; height:40px !important; min-height:40px; }
    .seed-action-grow { flex:1; }
    /* Modal field sections */
    .modal-section { margin-bottom:20px; }
    .modal-section-header { margin-bottom:14px; }
    .modal-section-label { font-size:13px; font-weight:700; letter-spacing:.3px; color:var(--accent); }
    /* Modal title icon */
    .modal-title { display:flex; align-items:center; gap:8px; }
    .modal-title-icon { display:flex; align-items:center; color:var(--accent); flex-shrink:0; }
    /* New-seed asset staging */
    .new-seed-asset-grid { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:4px; min-height:0; }
    .staged-asset-item { position:relative; display:flex; flex-direction:column; align-items:center; gap:4px; width:72px; }
    .staged-asset-thumb { width:68px; height:68px; object-fit:cover; border-radius:4px; border:1px solid var(--border); display:block; }
    .staged-asset-video { width:68px; height:68px; display:flex; align-items:center; justify-content:center; background:var(--bg-hover); border-radius:4px; border:1px solid var(--border); font-size:24px; }
    .staged-asset-name { font-size:10px; color:var(--text-muted); text-align:center; word-break:break-all; line-height:1.2; max-width:68px; }
    .staged-asset-item .media-delete-btn { position:absolute; top:2px; right:2px; }
    .text-muted { color:var(--text-muted); }
  `;
  document.head.appendChild(style);
}

/* =========================================================
   INIT
   ========================================================= */
/* Force-style all <select> elements — bypasses CSS specificity/cache issues */
function fixSelects() {
  const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237878a8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;
  document.querySelectorAll('select').forEach(sel => {
    sel.style.setProperty('-webkit-appearance', 'none');
    sel.style.setProperty('appearance', 'none');
    sel.style.setProperty('background-image', CHEVRON);
    sel.style.setProperty('background-repeat', 'no-repeat');
    sel.style.setProperty('background-position', 'right 10px center');
    sel.style.setProperty('padding-right', '30px');
    sel.style.setProperty('cursor', 'pointer');
  });
}
window.fixSelects = fixSelects;

function init() {
  initTheme();
  injectToastStyles();
  initNav();
  switchTab('content');
  // Fix selects after initial render
  setTimeout(fixSelects, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
