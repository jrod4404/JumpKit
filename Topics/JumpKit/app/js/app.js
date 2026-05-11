// ── Guard (Supabase session + localStorage fallback) ───────────────
let _supabaseUser = null;
let currentUser = null;

async function initAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      _supabaseUser = session.user;
      window._supabaseUser = session.user; // expose globally
      // Ensure a local DB user exists for this Supabase user
      let localUser = DB.findUserByEmail(_supabaseUser.email);
      if (!localUser) {
        // First Supabase login on this device — create local profile
        DB.createUser(_supabaseUser.email.split('@')[0], _supabaseUser.email, '__supabase__');
        localUser = DB.findUserByEmail(_supabaseUser.email);
        if (localUser) DB.seedNewUser(localUser.id);
      }
      if (localUser) {
        DB.setSession(localUser.id);
        currentUser = localUser;
      }
    } else {
      // No Supabase session — fallback to localStorage
      currentUser = DB.getCurrentUser();
      if (!currentUser) {
        window.location.href = 'index.html';
        return;
      }
    }
  } catch (_) {
    // Offline / Supabase not configured — localStorage only
    currentUser = DB.getCurrentUser();
    if (!currentUser) {
      window.location.href = 'index.html';
      return;
    }
  }
  // Load all app data into DB cache from SQLite
  await DB.init(currentUser.id);
  // Session confirmed — boot the app
  initApp();
}

// Placeholder — real initApp() wraps all startup logic below
// ── Auto-update banner ────────────────────────────────────────────
if (window.electronAPI?.onUpdateReady) {
  window.electronAPI.onUpdateReady(() => {
    const banner = document.getElementById('updateBanner');
    if (banner) banner.style.display = 'flex';
  });
}

async function initApp() {
  // Clean up old localStorage app data keys (post-SQLite migration)
  try {
    const oldPrefixes = ['jk_jumps_', 'jk_cols_', 'jk_clicks_', 'jk_prefs_', 'jk_click_log_'];
    Object.keys(localStorage)
      .filter(k => oldPrefixes.some(prefix => k.startsWith(prefix)))
      .forEach(k => localStorage.removeItem(k));
  } catch(_) {}

  // Fetch Supabase profile for name display
  if (_supabaseUser) {
    try {
      const { data } = await supabaseClient.from('profiles')
        .select('first_name,last_name,role,subscription_status,subscription_tier,trial_launches_used,ls_customer_id')
        .eq('id', _supabaseUser.id).single();
      if (data) {
        window._supabaseProfile = data;
        localStorage.setItem('jk_role', data.role || 'team-member');
        localStorage.setItem('jk_subscription_status', data.subscription_status || 'free');
        localStorage.setItem('jk_subscription_tier', data.subscription_tier || 'free');
        // Persist subscription/role data to user_prefs (SQLite) and update cache
        if (currentUser) {
          DB.savePrefs(currentUser.id, {
            ...DB.getPrefs(currentUser.id),
            role:               data.role               || 'team-member',
            subscriptionStatus: data.subscription_status || 'free',
            subscriptionTier:   data.subscription_tier   || 'free',
          });
        }
        // If overdue — show paywall immediately after load
        if (data.subscription_status === 'overdue' || data.subscription_status === 'cancelled') {
          setTimeout(() => showPaywall(), 1200);
        }
      }
    } catch (_) {}
  }
  updateUserDisplay();
  updateNotifBadge();

  // Apply nav default state from saved prefs
  const _navPrefs = DB.getPrefs(currentUser.id);
  const _sidebarEl = document.getElementById('sidebar');
  if (_sidebarEl && _navPrefs.navDefaultCollapsed !== undefined) {
    if (_navPrefs.navDefaultCollapsed) {
      _sidebarEl.classList.add('collapsed');
      localStorage.setItem('jk_sidebar_collapsed', '1');
    } else {
      _sidebarEl.classList.remove('collapsed');
      localStorage.setItem('jk_sidebar_collapsed', '0');
    }
  }
  runAutoArchive();
  await runCloudBackup();
  setTimeout(() => checkPendingInvites(), 500); // defer until Modal is defined

  // Show Tests nav item only for admin
  const _adminEmail = window._supabaseUser?.email || window._supabaseProfile?.email || '';
  if (_adminEmail === 'jeffroder@gmail.com') {
    const testNavBtn = document.querySelector('[data-page="tests"]');
    if (testNavBtn) testNavBtn.style.display = '';
    const adminLabel = document.getElementById('adminNavLabel');
    if (adminLabel) adminLabel.style.display = '';
  }

  // Check free tier limit on load
  if (window._supabaseProfile?.subscription_status === 'free' &&
      (window._supabaseProfile?.trial_launches_used || 0) >= 250) {
    setTimeout(() => showPaywall(), 1000);
  }

// ── Theme ──────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('jk_theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
const themeBtn  = document.getElementById('themeBtn');
const notifBtn  = document.getElementById('notifBtn');
notifBtn.addEventListener('click', () => {
  const notifs = getNotifications();
  const listHTML = notifs.length === 0
    ? '<p style="color:var(--text-muted);text-align:center;padding:16px 0">No notifications</p>'
    : notifs.map(n => `
        <div style="padding:10px 0;${n.read ? '' : 'font-weight:600'}">
          <div style="font-size:0.85rem;color:var(--text)">${esc(n.message)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px">${new Date(n.ts).toLocaleString()}</div>
        </div>`).join('');
  Modal.open('<svg class="ti ti-bell"><use href="img/tabler-sprite.svg#tabler-bell"/></svg> Notifications', listHTML,
    `<button class="btn btn-subtle" onclick="markAllNotificationsRead(); Modal.close()"><svg class="ti ti-checks"><use href="img/tabler-sprite.svg#tabler-checks"/></svg> Mark all read</button>
     <button class="btn btn-subtle" onclick="clearAllNotifications(); notifBtn.click()" style="color:var(--text-muted)"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Clear</button>`
  );
  markAllNotificationsRead();
});
function updateThemeIcon(t) {
  themeBtn.innerHTML = t === 'dark' ? '<svg class="ti ti-sun"><use href="img/tabler-sprite.svg#tabler-sun"/></svg>' : '<svg class="ti ti-moon"><use href="img/tabler-sprite.svg#tabler-moon"/></svg>';
  const logo = document.getElementById('sidebarLogo');
  if (logo) logo.src = t === 'dark' ? 'img/logo-dark-mode.png' : 'img/logo.png';
}
updateThemeIcon(savedTheme);
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('jk_theme', next);
  updateThemeIcon(next);
});

// ── Sidebar collapse + nav tooltips ────────────────────────────────
(function() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  if (!sidebar || !toggleBtn) return;

  // Restore saved state from localStorage (will be overridden by prefs after DB.init)
  if (localStorage.getItem('jk_sidebar_collapsed') === '1') sidebar.classList.add('collapsed');
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('jk_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
  });

  // Shared tooltip element
  const tip = document.createElement('div');
  tip.className = 'nav-tooltip';
  document.body.appendChild(tip);
  let tipTimer;

  function showTip(text, rect) {
    clearTimeout(tipTimer);
    tip.textContent = text;
    tip.style.top = (rect.top + rect.height / 2 - 14) + 'px';
    tip.style.left = (rect.right + 8) + 'px';
    tip.classList.add('visible');
  }
  function hideTip() {
    tipTimer = setTimeout(() => tip.classList.remove('visible'), 100);
  }

  // Toggle button tooltip
  toggleBtn.addEventListener('mouseenter', () => {
    const rect = toggleBtn.getBoundingClientRect();
    showTip(sidebar.classList.contains('collapsed') ? 'Expand menu' : 'Collapse menu', rect);
  });
  toggleBtn.addEventListener('mouseleave', hideTip);

  // Nav item tooltips (collapsed only)
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      if (!sidebar.classList.contains('collapsed')) return;
      const label = btn.querySelector('.nav-label')?.textContent?.trim() || btn.dataset.page;
      showTip(label, btn.getBoundingClientRect());
    });
    btn.addEventListener('mouseleave', hideTip);
  });
})();

// ── User info (populated after auth in initApp) ────────────────────
function updateUserDisplay() {
  let displayName = currentUser?.name || '';
  // If Supabase profile has first/last name, prefer that
  if (window._supabaseProfile?.first_name) {
    const f = window._supabaseProfile.first_name;
    const l = window._supabaseProfile.last_name || '';
    displayName = `${f} ${l}`.trim();
    // Capitalize
    displayName = displayName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  const nameParts = displayName.split(' ').filter(Boolean);
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : (nameParts[0]?.[0] || '?').toUpperCase();
  document.getElementById('userName').textContent = displayName || currentUser?.email || '';
  document.getElementById('userAvatar').textContent = initials;
}

// ── User Dropdown ──────────────────────────────────────────────────
const userDropdown = document.getElementById('userDropdown');
document.getElementById('userMenuTrigger').addEventListener('click', e => {
  e.stopPropagation();
  userDropdown.classList.toggle('open');
});
document.addEventListener('click', () => userDropdown.classList.remove('open'));

// Global: close any open custom-select dropdown when clicking outside
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.custom-select')) {
    document.querySelectorAll('.custom-select-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.custom-select.open').forEach(d => d.classList.remove('open'));
  }
});

document.querySelectorAll('.dropdown-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => { userDropdown.classList.remove('open'); navigateTo(btn.dataset.page); });
});

// ── Logout ────────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await supabaseClient.auth.signOut(); } catch (_) {}
  DB.clearSession();
  window.location.href = 'index.html';
});

// ── Page Router ────────────────────────────────────────────────────
const pages = {
  home:     () => renderHome(),
  jumps:    () => renderJumps(),
  archive:  () => renderArchive(),
  stats:    () => renderStats(),
  settings: () => renderSettings(),
  help:     () => renderHelp(),
  account:  () => renderAccount('account'),
  jet:      () => renderJet(),
  teams:    () => renderAccount('teams'),
  tests:    () => renderTests(),
};
const pageTitles = {
  home:'Home', jumps:'Jumps', archive:'Archive',
  stats:'Statistics', settings:'Settings', help:'Help', account:'My Account', jet:'Jet AI', feedback:'Feedback', teams:'My Account', tests:'Tests'
};
const pageIcons = {
  home:'ti-home', jumps:'ti-run', archive:'ti-archive',
  stats:'ti-chart-bar', settings:'ti-settings', help:'ti-help-circle', account:'ti-user-circle', jet:'ti-brain', feedback:'ti-message-circle', teams:'ti-users', tests:'ti-test-pipe'
};
let activePage = 'home';

window.navigateTo = function navigateTo(page) {
  activePage = page;
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  document.getElementById('topbarTitle').textContent = pageTitles[page] || page;
  const iconEl = document.getElementById('topbarIcon');
  if (page === 'jumps') {
    iconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.74 122.88" fill="currentColor" style="width:1.6rem;height:1.6rem;display:inline-block;vertical-align:-0.15em"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83 c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg>';
  } else {
    const iconName = (pageIcons[page] || 'ti-layout').replace('ti-', '');
    iconEl.innerHTML = `<svg class="ti ti-${iconName}" style="width:1.6rem;height:1.6rem;vertical-align:-0.15em"><use href="img/tabler-sprite.svg#tabler-${iconName}"/></svg>`;
  }
  const pageSubs = {
    stats:    'Track your launch history and time saved',
    account:  'Manage your profile, preferences, and productivity settings',
    settings: 'Configure display, productivity, and app behavior',
    help:     'Tips, features, and frequently asked questions',
    jet:      'AI-powered automation for Microsoft 365 — runs entirely on your machine',
    teams:    'Manage your organization, teams, and shared jumps',
    tests:    'Core functionality verification — run before each deployment',
    home:     '',
    jumps:    '',
  };
  document.getElementById('topbarSubtitle').innerHTML = pageSubs[page] !== undefined ? pageSubs[page] : '';
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '';
  pc.classList.remove('jumps-page');
  if (pages[page]) pages[page]();
}

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// ── Modal System ───────────────────────────────────────────────────
const Modal = window.Modal = {
  overlay: document.getElementById('modalOverlay'),
  box:     document.getElementById('modalBox'),
  open(title, bodyHTML, footerHTML, size = '') {
    document.getElementById('modalTitle').innerHTML  = title;
    document.getElementById('modalBody').innerHTML     = bodyHTML;
    document.getElementById('modalFooter').innerHTML   = footerHTML;
    document.getElementById('modalFooter').style.borderTop = footerHTML ? '' : 'none';
    document.getElementById('modalFooter').style.padding   = footerHTML ? '' : '0';
    this.box.className = 'modal-box' + (size ? ' ' + size : '');
    this.overlay.style.display = 'flex';
    // Always scroll to top when modal opens
    const mb = document.getElementById('modalBody');
    if (mb) mb.scrollTop = 0;
  },
  close() { this.overlay.style.display = 'none'; },
};
document.getElementById('modalClose').addEventListener('click', () => Modal.close());
// Overlay click intentionally does NOT close the modal — use Save or Close buttons.

// ── Context Menu ───────────────────────────────────────────────────
const CtxMenu = window.CtxMenu = {
  el: document.getElementById('ctxMenu'),
  show(x, y, items) {
    this.el.innerHTML = '';
    items.forEach(item => {
      if (item === 'divider') {
        const d = document.createElement('div'); d.className = 'ctx-divider'; this.el.appendChild(d);
      } else {
        const btn = document.createElement('button');
        btn.className = 'ctx-item' + (item.danger ? ' danger' : '');
        btn.innerHTML = `<span>${item.icon || ''}</span> ${item.label}`;
        btn.addEventListener('click', () => { this.hide(); item.action(); });
        this.el.appendChild(btn);
      }
    });
    // Clamp to viewport
    this.el.style.display = 'block';
    const rect = this.el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    this.el.style.left = (x + rect.width  > vw ? x - rect.width  : x) + 'px';
    this.el.style.top  = (y + rect.height > vh ? y - rect.height : y) + 'px';
  },
  hide() { this.el.style.display = 'none'; },
};
document.addEventListener('click',       () => CtxMenu.hide());
document.addEventListener('contextmenu', e => { if (!e.target.closest('.jump-item')) CtxMenu.hide(); });
window.buildChord = function buildChord(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey)               parts.push('Alt');
  if (e.shiftKey)             parts.push('Shift');
  if (['Control','Alt','Shift','Meta'].includes(e.key)) return null;
  let key = e.key;
  if (e.code.startsWith('Digit'))                   key = e.code.replace('Digit','');
  else if (e.code.startsWith('Key'))                key = e.code.replace('Key','');
  else if (/^F\d+$/.test(e.code))                   key = e.code;
  else if (e.key.length === 1)                       key = e.key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { CtxMenu.hide(); Modal.close(); return; }
  // Skip if user is typing in any input/textarea (except the hotkey recorder which handles itself)
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (!currentUser) return;
  const chord = buildChord(e);
  if (!chord) return;
  const match = DB.getActiveJumps(currentUser.id).find(j =>
    j.hotkey && j.hotkey.replace(/\s/g,'').toLowerCase() === chord.replace(/\s/g,'').toLowerCase()
  );
  if (match) {
    e.preventDefault();
    if (typeof handleJumpClick === 'function') handleJumpClick(match.id);
  }
});

// ── Shared stats bar ───────────────────────────────────────────────
function getStatsHTML(filter) {
  const allActive   = DB.getActiveJumps(currentUser.id);
  const allArchived = DB.getArchivedJumps(currentUser.id);
  const totalClicks = allActive.reduce((a, j) => a + (j.clickCount || 0), 0);
  const timeSaved   = (totalClicks / 6).toFixed(1);
  if (!filter || filter === 'active') {
    return `<p class="stats-summary"><strong>${allActive.length}</strong> active jumps · <strong>${totalClicks}</strong> total launches · <strong>${timeSaved}</strong> min saved</p>`;
  }
  if (filter === 'favorites') {
    const n = allActive.filter(j => j.favorite).length;
    return `<p class="stats-summary"><strong>${n}</strong> favorite jump${n !== 1 ? 's' : ''}</p>`;
  }
  if (filter === 'recent') {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const n = allActive.filter(j => j.lastUsed && j.lastUsed >= cutoff).length;
    return `<p class="stats-summary"><strong>${n}</strong> jump${n !== 1 ? 's' : ''} used in the last 30 days</p>`;
  }
  if (filter === 'most-used') {
    const top = Math.max(1, Math.ceil(allActive.length * 0.1));
    return `<p class="stats-summary">Top <strong>${top}</strong> most-used jump${top !== 1 ? 's' : ''}</p>`;
  }
  if (filter === 'archive') {
    return `<p class="stats-summary"><strong>${allArchived.length}</strong> archived jump${allArchived.length !== 1 ? 's' : ''}</p>`;
  }
  return '';
}

// ── Home Page ──────────────────────────────────────────────────────
function renderHome() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const sub = document.getElementById('topbarSubtitle');
  const _homeFName = (window._supabaseProfile?.first_name || currentUser.name || '').split(' ')[0] || 'there';
  if (sub) sub.textContent = `${greeting}, ${_homeFName}!   Here's a few tips to get started, enjoy!`;
  document.getElementById('pageContent').innerHTML = `
    <div class="tips-grid">
      <div class="tip-card">
        <h3><span class="tip-icon"><svg class="ti ti-layout-columns" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg></span>Organize Columns</h3>
        <p>Click the <strong style="color:var(--hover-accent)">Configure Columns</strong> button on the <strong style="color:var(--hover-accent)">Jumps</strong> page to create up to 10 custom categories. Name them and order them according to your work.</p>
      </div>
      <div class="tip-card">
        <h3><span class="tip-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.74 122.88" fill="var(--text-card-title)" style="width:1.4rem;height:1.4rem;display:block"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg></span>Add Your First Jump</h3>
        <p>Go to the <strong style="color:var(--hover-accent)">Jumps</strong> page and click the <strong style="color:var(--hover-accent)">Add Jump</strong> button to create your first jump. Paste in a URL, file path, or network share.</p>
      </div>
      <div class="tip-card">
        <h3><span class="tip-icon"><svg class="ti ti-mouse" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-mouse"/></svg></span>Left-Click to Jump</h3>
        <p>Left-click any jump to instantly launch it. Web links open in your browser. Local paths open in your OS. One click, you're there.</p>
      </div>
      <div class="tip-card">
        <h3><span class="tip-icon"><svg class="ti ti-keyboard" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-keyboard"/></svg></span>Assign Hotkeys</h3>
        <p>Give each jump a hotkey code when you create or edit it. JumpKit will register it as a global shortcut so you can launch any jump without touching the mouse.</p>
      </div>
      <div class="tip-card">
        <h3><span class="tip-icon"><svg class="ti ti-link" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-link"/></svg></span>Mark Favorites</h3>
        <p>Toggle the favorite flag on any jump — <svg class="ti ti-link" style="color:var(--hover-accent);width:1.3em;height:1.3em;vertical-align:-0.2em"><use href="img/tabler-sprite.svg#tabler-link"/></svg> web links and <svg class="ti ti-folder" style="color:var(--hover-accent);width:1.3em;height:1.3em;vertical-align:-0.2em"><use href="img/tabler-sprite.svg#tabler-folder"/></svg> local paths — to highlight your most-used jumps in every column.</p>
      </div>
      <div class="tip-card">
        <h3><span class="tip-icon"><svg class="ti ti-chart-bar" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-chart-bar"/></svg></span>Track Your ROI</h3>
        <p>JumpKit counts every launch and calculates how much time you've saved. Check the <strong style="color:var(--hover-accent)">Statistics</strong> page to see your ROI.</p>
      </div>
    </div>`;
}

// ── Stats / Settings / Account Placeholders ────────────────────────
// ── Toast ──────────────────────────────────────────────────────────
const Toast = window.Toast = (() => {
  let timer = null;
  const el = document.getElementById('toastEl');
  function show(msg, type) {
    if (timer) clearTimeout(timer);
    el.className = `toast toast-${type} toast-visible`;
    const icon = type === 'success'
      ? '<svg class="ti ti-circle-check toast-icon"><use href="img/tabler-sprite.svg#tabler-circle-check"/></svg>'
      : '<svg class="ti ti-alert-circle toast-icon"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg>';
    el.innerHTML = `${icon}<span>${msg}</span>`;
    timer = setTimeout(() => {
      el.classList.remove('toast-visible');
      el.classList.add('toast-hide');
      setTimeout(() => { el.className = 'toast'; }, 350);
    }, 3000);
  }
  return {
    success: (msg) => show(msg, 'success'),
    danger:  (msg) => show(msg, 'danger'),
  };
})();

function renderSettings() {
  const p = DB.getPrefs(currentUser.id);
  const pageChoices = ['home','jumps','stats','settings','help'].map(pg =>
    `<div class="custom-select-option${p.startPage===pg?' selected':''}" data-value="${pg}">${pageTitles[pg]||pg}</div>`).join('');
  const archiveChoices = [['never','Never'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year']].map(([v,l]) =>
    `<div class="custom-select-option${p.autoArchive===v?' selected':''}" data-value="${v}">${l}</div>`).join('');

  document.getElementById('pageContent').innerHTML = `
    <div class="acct-grid">

      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-adjustments-horizontal"><use href="img/tabler-sprite.svg#tabler-adjustments-horizontal"/></svg> Preferences</div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Starting Page</span>
            <span class="acct-row-hint">Page shown when app opens</span>
          </div>
          <div class="custom-select acct-select" id="startPageDrop">
            <div class="custom-select-trigger" id="startPageTrigger">
              <span id="startPageLabel">${pageTitles[p.startPage]||p.startPage}</span>
              <svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
            </div>
            <div class="custom-select-menu" id="startPageMenu">${pageChoices}</div>
          </div>
        </div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Nav Menu on Startup</span>
            <span class="acct-row-hint">Sidebar state when app opens</span>
          </div>
          <div class="custom-select acct-select" id="navStateDrop">
            <div class="custom-select-trigger" id="navStateTrigger">
              <span id="navStateLabel">${p.navDefaultCollapsed ? 'Collapsed' : 'Expanded'}</span>
              <svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
            </div>
            <div class="custom-select-menu" id="navStateMenu">
              <div class="custom-select-option${!p.navDefaultCollapsed ? ' selected' : ''}" data-value="expanded">Expanded</div>
              <div class="custom-select-option${p.navDefaultCollapsed ? ' selected' : ''}" data-value="collapsed">Collapsed</div>
            </div>
          </div>
        </div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Notifications</span>
            <span class="acct-row-hint">In-app notification alerts</span>
          </div>
          <label class="toggle"><input type="checkbox" id="prefNotif" ${p.notifications?'checked':''}/><span class="toggle-slider"></span></label>
        </div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Auto Cloud Backup</span>
            <span class="acct-row-hint">Sync jumps to the cloud</span>
          </div>
          <label class="toggle"><input type="checkbox" id="prefCloud" ${p.cloudBackup?'checked':''}/><span class="toggle-slider"></span></label>
        </div>
        <div class="acct-row" style="border-bottom:none">
          <div class="acct-row-label"><span>Backup Now</span><span class="acct-row-hint">Export all data to JSON file</span></div>
          <button class="btn btn-subtle" onclick="forceBackup()">
            <svg class="ti ti-download"><use href="img/tabler-sprite.svg#tabler-download"/></svg> Export
          </button>
        </div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-rocket"><use href="img/tabler-sprite.svg#tabler-rocket"/></svg> Productivity</div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Time Saved per Click</span>
            <span class="acct-row-hint">Seconds saved per jump launch</span>
          </div>
          <div class="acct-number-wrap">
            <input class="form-input acct-number" type="number" id="prefTime" min="1" max="300" value="${p.timePerClick}"/>
            <span class="acct-unit">sec</span>
          </div>
        </div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Dollars per Hour</span>
            <span class="acct-row-hint">Used to calculate ROI</span>
          </div>
          <div class="acct-number-wrap">
            <span class="acct-unit">$</span>
            <input class="form-input acct-number" type="number" id="prefDollar" min="1" max="9999" value="${p.dollarsPerHour}"/>
            <span class="acct-unit">/hr</span>
          </div>
        </div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Show Jump Description</span>
            <span class="acct-row-hint">Display description under jump name</span>
          </div>
          <label class="toggle"><input type="checkbox" id="prefDesc" ${p.showDescription?'checked':''}/><span class="toggle-slider"></span></label>
        </div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Show Hotkey</span>
            <span class="acct-row-hint">Display hotkey pill on jump cards</span>
          </div>
          <label class="toggle"><input type="checkbox" id="prefHotkey" ${p.showHotkey?'checked':''}/><span class="toggle-slider"></span></label>
        </div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-tool"><use href="img/tabler-sprite.svg#tabler-tool"/></svg> Maintenance</div>

        <div class="acct-row">
          <div class="acct-row-label">
            <span>Auto-Archive Jumps</span>
            <span class="acct-row-hint">Archive unused jumps after</span>
          </div>
          <div class="custom-select acct-select" id="autoArchiveDrop">
            <div class="custom-select-trigger" id="autoArchiveTrigger">
              <span id="autoArchiveLabel">${{never:'Never','1m':'1 Month','6m':'6 Months','1y':'1 Year'}[p.autoArchive]}</span>
              <svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
            </div>
            <div class="custom-select-menu" id="autoArchiveMenu">${archiveChoices}</div>
          </div>
        </div>
      </div>

      <div class="acct-save-row">
        <button class="btn btn-subtle" onclick="saveAccountPrefs()"><svg class="ti ti-device-floppy"><use href="img/tabler-sprite.svg#tabler-device-floppy"/></svg> Save Settings</button>
      </div>
    </div>`;

  // Wire dropdowns
  wireAcctDropdown('startPageDrop','startPageTrigger','startPageMenu','startPageLabel');
  wireAcctDropdown('navStateDrop','navStateTrigger','navStateMenu','navStateLabel');
  wireAcctDropdown('autoArchiveDrop','autoArchiveTrigger','autoArchiveMenu','autoArchiveLabel');
}

function renderAccount(initialTab = 'account') {
  const u = currentUser;
  const sbUser = window._supabaseUser || {};
  const sbProfile = window._supabaseProfile || {};
  const firstName = sbProfile.first_name || '';
  const lastName  = sbProfile.last_name  || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || (u ? esc(u.name) : '');
  const email     = sbUser.email || (u ? esc(u.email) : '');
  const tier      = sbProfile.subscription_tier   || localStorage.getItem('jk_subscription_tier')   || 'free';
  const status    = sbProfile.subscription_status || localStorage.getItem('jk_subscription_status') || 'free';
  const role      = sbProfile.role || localStorage.getItem('jk_role') || 'team-member';
  const launchesUsed = sbProfile.trial_launches_used || 0;
  const tierLabel = tier === 'teams_jet' ? 'JumpKit + Jet AI' : tier === 'core' ? 'JumpKit' : 'Free';
  const statusLabel = status === 'active' ? 'Active' : status === 'overdue' ? 'Overdue' : status === 'cancelled' ? 'Cancelled' : 'Free';
  const memberSince = u && u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—';

  const ACCT_TABS = ['account', 'teams'];
  const ACCT_LABELS = { account: 'My Account', teams: 'My Teams' };
  let currentAcctTab = ACCT_TABS.includes(initialTab) ? initialTab : 'account';

  document.getElementById('pageContent').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;height:100%">
      <div style="display:flex;align-items:center;gap:12px;flex-shrink:0">
        <div class="jump-filter-bar" id="acctTabBar">
          <div class="jfb-slider" id="acctTabPill"></div>
          ${ACCT_TABS.map(t=>`<button class="jfb-tab${t===currentAcctTab?' active':''}" data-at="${t}">${ACCT_LABELS[t]}</button>`).join('')}
        </div>
      </div>
      <div id="acctTabContent" style="flex:1;min-height:0;overflow-y:auto"></div>
    </div>`;

  function renderAcctTabContent(tab) {
    const el = document.getElementById('acctTabContent');
    if (!el) return;
    if (tab === 'account') {
      el.innerHTML = `
        <div class="acct-grid">
          <div class="acct-section">
            <div class="acct-section-title"><svg class="ti ti-user-circle"><use href="img/tabler-sprite.svg#tabler-user-circle"/></svg> Profile</div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Name</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${fullName || '—'}</span>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Email</span></div>
              <span class="acct-profile-email" style="font-size:0.88rem;color:var(--text-muted)">${email || '—'}</span>
            </div>
          </div>
          <div class="acct-section">
            <div class="acct-section-title"><svg class="ti ti-id-badge"><use href="img/tabler-sprite.svg#tabler-id-badge"/></svg> Account</div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Account Type</span></div>
              <span class="acct-tier-badge" style="font-size:0.88rem;color:var(--text-muted)">${tierLabel}</span>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Payment Status</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${statusLabel}</span>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Role</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${role}</span>
            </div>
            ${tier === 'free' ? `
            <div class="acct-row">
              <div class="acct-row-label"><span>Launches Used</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${launchesUsed} / 250</span>
            </div>` : ''}
            <div class="acct-row" style="border-bottom:none">
              <div class="acct-row-label"><span>Member Since</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${memberSince}</span>
            </div>
          </div>
          <div class="acct-save-row" style="justify-content:flex-start;gap:.6rem;flex-wrap:wrap;">
            <button class="btn btn-subtle" onclick="openFeedbackModal()"><svg class="ti ti-message-circle"><use href="img/tabler-sprite.svg#tabler-message-circle"/></svg> Send Feedback</button>
            ${tier === 'free' ? `<a href="https://jumpkit.lemonsqueezy.com/checkout/buy/d6fee6da-901c-4c1d-b474-c5eb23ee03fb" target="_blank" class="btn btn-primary"><svg class="ti ti-bolt"><use href="img/tabler-sprite.svg#tabler-bolt"/></svg> Upgrade to JumpKit</a>` : ''}
          </div>
        </div>`;
    } else {
      el.innerHTML = `<div style="padding:4px 0 0 0;height:100%"></div>`;
      renderTeams(el.firstElementChild);
    }
  }

  // Wire tab clicks
  document.getElementById('acctTabBar').addEventListener('click', e => {
    const btn = e.target.closest('.jfb-tab');
    if (!btn) return;
    currentAcctTab = btn.dataset.at;
    document.querySelectorAll('#acctTabBar .jfb-tab').forEach(b => b.classList.toggle('active', b.dataset.at === currentAcctTab));
    moveAcctPill();
    renderAcctTabContent(currentAcctTab);
  });

  function moveAcctPill() {
    const bar   = document.getElementById('acctTabBar');
    const pill  = document.getElementById('acctTabPill');
    const active = bar && bar.querySelector('.jfb-tab.active');
    if (!pill || !active || !bar) return;
    const barRect  = bar.getBoundingClientRect();
    const tabRect  = active.getBoundingClientRect();
    pill.style.left  = (tabRect.left - barRect.left) + 'px';
    pill.style.width = tabRect.width + 'px';
    pill.style.top   = '0';
    pill.style.bottom = '0';
  }

  renderAcctTabContent(currentAcctTab);
  requestAnimationFrame(moveAcctPill);
}


// ── Shared dropdown wiring with arrow-key navigation ──────────────
// Arrow keys move highlight WITHOUT closing; Enter/click confirm+close.
window.wireDropdown = function wireDropdown({ dropId, triggerId, menuId, labelId, inputId = null, onSelect = null }) {
  const drop    = document.getElementById(dropId);
  const trigger = document.getElementById(triggerId);
  const menu    = document.getElementById(menuId);
  const label   = document.getElementById(labelId);
  const input   = inputId ? document.getElementById(inputId) : null;
  if (!drop || !trigger || !menu) return;

  drop.setAttribute('tabindex', '0');

  function getOpts()    { return [...menu.querySelectorAll('.custom-select-option')]; }
  function getHighlit() { return menu.querySelector('.custom-select-option.kbfocus'); }

  function setHighlight(opt) {
    getOpts().forEach(o => o.classList.remove('kbfocus'));
    if (opt) { opt.classList.add('kbfocus'); opt.scrollIntoView({ block: 'nearest' }); }
  }

  function openMenu() {
    menu.classList.add('open');
    drop.classList.add('open');
    // Highlight current selected on open
    const sel = menu.querySelector('.custom-select-option.selected');
    setHighlight(sel || getOpts()[0]);
  }

  function closeMenu() {
    menu.classList.remove('open');
    drop.classList.remove('open');
    getOpts().forEach(o => o.classList.remove('kbfocus'));
  }

  function confirmOpt(opt) {
    if (!opt) return;
    if (label) { label.textContent = opt.textContent; label.style.color = ''; }
    if (input) { input.value = opt.dataset.value; input.style && (input.style.color = ''); }
    getOpts().forEach(o => o.classList.remove('selected', 'kbfocus'));
    opt.classList.add('selected');
    closeMenu();
    if (onSelect) onSelect(opt);
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.contains('open') ? closeMenu() : openMenu();
  });

  getOpts().forEach(opt => {
    opt.addEventListener('click', () => confirmOpt(opt));
  });

  drop.addEventListener('keydown', e => {
    const isOpen = menu.classList.contains('open');
    const opts = getOpts();
    const hi = getHighlit();
    const idx = hi ? opts.indexOf(hi) : opts.findIndex(o => o.classList.contains('selected'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { openMenu(); return; }
      setHighlight(opts[Math.min(idx + 1, opts.length - 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) { openMenu(); return; }
      setHighlight(opts[Math.max(idx - 1, 0)]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) { openMenu(); } else { confirmOpt(hi || opts[0]); }
    } else if (e.key === 'Escape') {
      closeMenu();
    }
  });
}

function wireAcctDropdown(dropId, triggerId, menuId, labelId) {
  wireDropdown({ dropId, triggerId, menuId, labelId });
}

window.saveAccountPrefs = function saveAccountPrefs() {
  const cur = DB.getPrefs(currentUser.id);
  const startSel   = document.querySelector('#startPageMenu .custom-select-option.selected');
  const archSel    = document.querySelector('#autoArchiveMenu .custom-select-option.selected');
  const navStateSel = document.querySelector('#navStateMenu .custom-select-option.selected');
  const prefs = {
    startPage:       startSel ? startSel.dataset.value : cur.startPage,
    notifications:   document.getElementById('prefNotif').checked,
    cloudBackup:     document.getElementById('prefCloud').checked,
    timePerClick:    Math.max(1, parseInt(document.getElementById('prefTime').value)  || cur.timePerClick),
    dollarsPerHour:  Math.max(1, parseInt(document.getElementById('prefDollar').value) || cur.dollarsPerHour),
    showDescription: document.getElementById('prefDesc').checked,
    showHotkey:      document.getElementById('prefHotkey').checked,
    autoArchive:         archSel ? archSel.dataset.value : cur.autoArchive,
    navDefaultCollapsed: navStateSel ? navStateSel.dataset.value === 'collapsed' : cur.navDefaultCollapsed,
  };
  try {
    DB.savePrefs(currentUser.id, prefs);
    Toast.success('Preferences saved');
  } catch (e) {
    Toast.danger('Failed to save preferences');
  }
  // Re-render jumps live if on jumps page so description/hotkey toggles apply immediately
  if (activePage === 'jumps' && typeof renderColumns === 'function') renderColumns();
}
window.openFeedbackModal = function openFeedbackModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">Your Name</label>
      <input class="form-input" id="fbName" value="${esc(currentUser.name)}" readonly tabindex="-1"/>
    </div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-input" id="fbEmail" value="${esc(currentUser.email)}" readonly tabindex="-1"/>
    </div>
    <div class="form-group">
      <label class="form-label">Category *</label>
      <input type="hidden" id="fbCat" value=""/>
      <div class="custom-select" id="fbCatDrop">
        <div class="custom-select-trigger" id="fbCatTrigger" tabindex="1">
          <span id="fbCatLabel" style="color:var(--text-dim)">— Select a category —</span>
          <svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
        </div>
        <div class="custom-select-menu" id="fbCatMenu">
          ${['Bug','Positive Feedback','Negative Feedback','Feature Request','Other'].map(c =>
            `<div class="custom-select-option" data-value="${c}">${c}</div>`).join('')}
        </div>
      </div>
      <span class="form-error" id="fbCatErr">Please select a category.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Message *</label>
      <textarea class="form-textarea" id="fbMsg" tabindex="2" placeholder="Share your thoughts…" style="min-height:120px"></textarea>
      <span class="form-error" id="fbMsgErr">A message is required.</span>
    </div>`;

  Modal.open('<svg class="ti ti-message-circle"><use href="img/tabler-sprite.svg#tabler-message-circle"/></svg> Feedback', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-subtle" onclick="submitFeedback()"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Submit</button>`);

  wireDropdown({
    dropId: 'fbCatDrop', triggerId: 'fbCatTrigger', menuId: 'fbCatMenu',
    labelId: 'fbCatLabel', inputId: 'fbCat',
    onSelect: () => { document.getElementById('fbCatDrop').classList.remove('error'); }
  });
}

window.submitFeedback = async function submitFeedback() {
  let ok = true;
  const cat = document.getElementById('fbCat').value;
  const msg = document.getElementById('fbMsg').value.trim();
  ['fbCatErr','fbMsgErr'].forEach(id => document.getElementById(id).classList.remove('show'));
  document.getElementById('fbCatDrop').classList.remove('error');
  document.getElementById('fbMsg').classList.remove('error');
  if (!cat) { document.getElementById('fbCatDrop').classList.add('error'); document.getElementById('fbCatErr').classList.add('show'); ok = false; }
  if (!msg) { document.getElementById('fbMsg').classList.add('error'); document.getElementById('fbMsgErr').classList.add('show'); ok = false; }
  if (!ok) return;

  // Show sending state
  document.getElementById('modalFooter').innerHTML =
    `<button class="btn btn-subtle" disabled><svg class="ti ti-loader-2 spin"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg> Sending…</button>`;

  try {
    const SUPABASE_URL = 'https://iuexwdjnqfidcwvwbgwr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZXh3ZGpucWZpZGN3dndiZ3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMTA1MTksImV4cCI6MjA4OTY4NjUxOX0.N-m3Kxb4EKITOHmJ3tJuQuvZ1LVnWzStFtarCxxvmO0';
    console.debug('[Feedback] Calling edge function…');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        name: currentUser?.name || '',
        email: currentUser?.email || '',
        category: cat,
        message: msg,
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.debug('[Feedback] HTTP status:', res.status, '| response:', JSON.stringify(data));
    if (!res.ok && !data.ok) throw new Error(data.error || 'Send failed');
  } catch (e) {
    console.warn('Feedback send error:', e);
    // Still show success to user — don't block on edge fn errors
  }

  document.getElementById('modalBody').innerHTML = `
    <div style="text-align:center;padding:32px 0">
      <svg class="ti ti-circle-check" style="font-size:3rem;color:var(--hover-accent);display:block;margin-bottom:16px;-webkit-font-smoothing:antialiased"><use href="img/tabler-sprite.svg#tabler-circle-check"/></svg>
      <p style="color:var(--text-card-title);font-size:1rem;font-weight:600;margin-bottom:8px">Thanks for your feedback!</p>
      <p style="color:var(--text-muted);font-size:0.88rem">We'll review it and be in touch if needed.</p>
    </div>`;
  document.getElementById('modalFooter').innerHTML =
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>`;
}
let currentStatView = 'summary';
const STAT_VIEWS  = ['summary','daily','weekly','monthly','yearly'];
const STAT_LABELS = { summary:'Summary', daily:'Daily', weekly:'Weekly', monthly:'Monthly', yearly:'Yearly' };

function renderStats() {
  document.getElementById('pageContent').innerHTML = `
    <div class="stats-wrap">

      <div style="margin-bottom:18px">
        <div class="jump-filter-bar" id="statsBar">
          <div class="jfb-slider" id="statsPill"></div>
          ${STAT_VIEWS.map(v=>`<button class="jfb-tab${v===currentStatView?' active':''}" data-sv="${v}">${STAT_LABELS[v]}</button>`).join('')}
        </div>
      </div>
      <div id="statsDash"></div>
    </div>`;

  document.getElementById('statsBar').addEventListener('click', e => {
    const tab = e.target.closest('.jfb-tab');
    if (!tab) return;
    currentStatView = tab.dataset.sv;
    document.querySelectorAll('#statsBar .jfb-tab').forEach(b => b.classList.toggle('active', b.dataset.sv === currentStatView));
    posStatsPill();
    renderStatsDash();
  });

  requestAnimationFrame(() => { posStatsPill(); renderStatsDash(); });
}

function posStatsPill() {
  const bar    = document.getElementById('statsBar');
  const active = bar && bar.querySelector('.jfb-tab.active');
  const pill   = document.getElementById('statsPill');
  if (!active || !pill || !bar) return;
  const isLast = !active.nextElementSibling;
  pill.style.left  = active.offsetLeft + 'px';
  pill.style.width = isLast ? (bar.offsetWidth - active.offsetLeft) + 'px' : active.offsetWidth + 'px';
}

function renderStatsDash() {
  const dash   = document.getElementById('statsDash');
  if (!dash) return;
  const prefs  = DB.getPrefs(currentUser.id);
  const log    = DB.getClickLog(currentUser.id);

  // Hide tab bar when there are no stats at all
  const bar = document.getElementById('statsBar');
  if (bar) bar.style.display = log.length > 0 ? '' : 'none';
  const now    = new Date();

  // Filter log by period
  function startOf(unit) {
    const d = new Date(now);
    if (unit==='day')   { d.setHours(0,0,0,0); }
    if (unit==='week')  { d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()); }
    if (unit==='month') { d.setDate(1); d.setHours(0,0,0,0); }
    if (unit==='year')  { d.setMonth(0,1); d.setHours(0,0,0,0); }
    return d.getTime();
  }
  const ranges = {
    summary: [0, Infinity],
    daily:   [startOf('week'),  startOf('week')+7*86400000],
    weekly:  [startOf('week')-51*7*86400000, startOf('week')+7*86400000],
    monthly: [startOf('year'),  new Date(now.getFullYear()+1,0,1).getTime()],
    yearly:  [new Date(now.getFullYear()-4,0,1).getTime(), new Date(now.getFullYear()+1,0,1).getTime()],
  };
  const [s, e] = ranges[currentStatView];
  const clicks = log.filter(e2 => e2.ts >= s && e2.ts < e);
  const n      = clicks.length;
  // Use per-jump timeSaved if set, otherwise fall back to global prefs.timePerClick
  const allJumps = DB.getJumps(currentUser.id);
  const totalSecondsSaved = clicks.reduce((sum, c) => {
    const jump = allJumps.find(j => j.id === c.jumpId);
    return sum + (jump?.timeSaved != null ? jump.timeSaved : prefs.timePerClick);
  }, 0);
  const mins   = Math.round(totalSecondsSaved / 60);
  const dollars= ((totalSecondsSaved / 3600) * prefs.dollarsPerHour).toFixed(2);
  const fmtUSD = v => '$' + parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  if (n === 0) {
    dash.innerHTML = `<div class="stats-empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:220px"><svg class="ti ti-chart-bar-popular" style="width:3rem;height:3rem;color:var(--text-dim);display:block;margin-bottom:14px"><use href="img/tabler-sprite.svg#tabler-chart-bar-popular"/></svg><p>No launch data yet for this period.</p></div>`;
    return;
  }

  const dark   = document.documentElement.dataset.theme === 'dark';
  const tc     = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.50)';
  const gc     = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const barClr = 'rgba(0,194,199,0.75)';
  const jumps  = DB.getActiveJumps(currentUser.id);
  const cols   = DB.getColumns(currentUser.id).filter(c=>c.visible).sort((a,b)=>a.order-b.order);

  const chartOpts = (extra) => Object.assign({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks:{color:tc,font:{size:11}}, grid:{color:gc} },
      y: { ticks:{color:tc,font:{size:11}}, grid:{color:gc}, beginAtZero:true },
    },
  }, extra||{});

  function mkChart(id, type, data, opts) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(id);
    if (!el) return;
    new Chart(el, { type, data, options: chartOpts(opts) });
  }

  // ── Summary ────────────────────────────────────────────────────
  if (currentStatView === 'summary') {
    const byJump = {};
    log.forEach(e => { byJump[e.jumpId]=(byJump[e.jumpId]||0)+1; });
    const top8 = Object.entries(byJump).sort((a,b)=>b[1]-a[1]).slice(0,8)
      .map(([id,ct]) => ({ name: jumps.find(j=>j.id===id)?.name||'Removed', ct }));

    // By column doughnut
    const byCol = {};
    log.forEach(e => {
      const j=jumps.find(j=>j.id===e.jumpId);
      const name=j?(cols.find(c=>c.id===j.columnId)?.name||'Unknown'):'Unknown';
      byCol[name]=(byCol[name]||0)+1;
    });

    // 30-day timeline
    const labels30=[],data30=[];
    for (let i=29;i>=0;i--) {
      const d=new Date(now); d.setDate(d.getDate()-i);
      const key=d.toISOString().slice(0,10);
      labels30.push(i===0?'Today':i%5===0?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'');
      data30.push(log.filter(e=>new Date(e.ts).toISOString().slice(0,10)===key).length);
    }

    const doughColors=['#00C2C7','#1A4FD6','#2B9ED8','#ff7a45','#faad14','#a0d911','#9254de','#eb2f96','#69c0ff','#389e0d'];
    const colEntries=Object.entries(byCol);
    const favCount=jumps.filter(j=>j.favorite).length;

    // Top jumps table rows
    const topRows = top8.map((j,i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:0.84rem">
        <span style="color:var(--text-dim);min-width:18px;font-size:0.75rem">${i+1}</span>
        <span style="flex:1;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.name)}</span>
        <span style="font-weight:700;color:var(--hover-accent)">${j.ct}</span>
      </div>`).join('');

    dash.innerHTML = `
      <div class="stats-cards" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card"><div class="stat-card-value">${n.toLocaleString()}</div><div class="stat-card-label">Total Launches</div></div>
        <div class="stat-card"><div class="stat-card-value">${mins.toLocaleString()} min</div><div class="stat-card-label">Time Saved</div></div>
        <div class="stat-card"><div class="stat-card-value">${fmtUSD(dollars)}</div><div class="stat-card-label">Dollars Saved</div></div>
        <div class="stat-card"><div class="stat-card-value">${jumps.length}</div><div class="stat-card-label">Active Jumps</div></div>
      </div>
      <div class="stats-chart-row">
        <div class="stats-chart-box full"><div class="stats-chart-title">Last 30 Days</div><div style="height:190px"><canvas id="chLine"></canvas></div></div>
      </div>
      <div class="stats-chart-row">
        <div class="stats-chart-box">
          <div class="stats-chart-title">Top Jumps</div>
          <div style="overflow-y:auto;max-height:220px">${topRows}</div>
        </div>
        <div class="stats-chart-box">
          <div class="stats-chart-title">Launches by Column</div>
          <div style="height:200px"><canvas id="chCol"></canvas></div>
        </div>
      </div>`;

    requestAnimationFrame(() => {
      mkChart('chLine','bar',
        { labels:labels30, datasets:[{data:data30,backgroundColor:barClr,borderRadius:3}] });
      mkChart('chCol','doughnut',
        { labels:colEntries.map(e=>e[0]), datasets:[{data:colEntries.map(e=>e[1]),backgroundColor:doughColors.slice(0,colEntries.length),borderWidth:0}] },
        { scales:{}, plugins:{ legend:{ display:true, position:'bottom', labels:{ color:tc, boxWidth:10, font:{size:11}, padding:10 } } } });
    });
    return;
  }

  // ── Period views: time-series bar chart ──────────────────────
  let chartLabels=[], chartData=[], chartTitle='';

  if (currentStatView === 'daily') {
    // This week — one bar per day
    chartTitle = `Launches by Day — Week of ${new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((_,i)=>{
      const ds = s + i*86400000;
      chartLabels.push(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i]);
      chartData.push(clicks.filter(e=>e.ts>=ds&&e.ts<ds+86400000).length);
    });
  } else if (currentStatView === 'weekly') {
    // Last 52 calendar weeks — one bar per week
    chartTitle = `Launches by Week — Last 52 Weeks`;
    const weekStart = startOf('week') - 51*7*86400000;
    for (let w=0; w<52; w++) {
      const ws = weekStart + w*7*86400000;
      const we = ws + 7*86400000;
      const d  = new Date(ws);
      // Label every 4th week to avoid clutter
      chartLabels.push(w%4===0 ? d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '');
      chartData.push(log.filter(e=>e.ts>=ws&&e.ts<we).length);
    }
  } else if (currentStatView === 'monthly') {
    // This year — one bar per month
    chartTitle = `Launches by Month — ${now.getFullYear()}`;
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].forEach((_,i)=>{
      const ms=new Date(now.getFullYear(),i,1).getTime();
      const me=new Date(now.getFullYear(),i+1,1).getTime();
      chartLabels.push(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]);
      chartData.push(clicks.filter(e=>e.ts>=ms&&e.ts<me).length);
    });
  } else if (currentStatView === 'yearly') {
    // Last 4 full years + current year YTD
    chartTitle = `Launches by Year — ${now.getFullYear()-4} to ${now.getFullYear()}`;
    for (let yr=now.getFullYear()-4; yr<=now.getFullYear(); yr++) {
      const ys=new Date(yr,0,1).getTime();
      const ye=new Date(yr+1,0,1).getTime();
      const label = yr===now.getFullYear() ? `${yr} YTD` : `${yr}`;
      chartLabels.push(label);
      chartData.push(log.filter(e=>e.ts>=ys&&e.ts<ye).length);
    }
  }

  // Top jumps for this period
  const byJumpP = {};
  clicks.forEach(e => { byJumpP[e.jumpId]=(byJumpP[e.jumpId]||0)+1; });
  const top5P = Object.entries(byJumpP).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([id,ct]) => ({ name: jumps.find(j=>j.id===id)?.name||'Removed', ct }));
  const topRowsP = top5P.map((j,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:0.84rem">
      <span style="color:var(--text-dim);min-width:18px;font-size:0.75rem">${i+1}</span>
      <span style="flex:1;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.name)}</span>
      <span style="font-weight:700;color:var(--hover-accent)">${j.ct}</span>
    </div>`).join('');

  dash.innerHTML = `
    <div class="stats-cards">
      <div class="stat-card"><div class="stat-card-value">${n.toLocaleString()}</div><div class="stat-card-label">Jumps Clicked</div></div>
      <div class="stat-card"><div class="stat-card-value">${mins.toLocaleString()} min</div><div class="stat-card-label">Time Saved</div></div>
      <div class="stat-card"><div class="stat-card-value">${fmtUSD(dollars)}</div><div class="stat-card-label">Dollars Saved</div></div>
    </div>
    <div class="stats-chart-row">
      <div class="stats-chart-box full"><div class="stats-chart-title">${chartTitle}</div><div style="height:220px"><canvas id="chPeriod"></canvas></div></div>
    </div>
    <div class="stats-chart-row">
      <div class="stats-chart-box full">
        <div class="stats-chart-title">Top Jumps This Period</div>
        ${top5P.length ? topRowsP : '<p style="color:var(--text-dim);font-size:0.85rem">No jump data for this period.</p>'}
      </div>
    </div>`;

  requestAnimationFrame(() => {
    mkChart('chPeriod','bar',
      { labels:chartLabels, datasets:[{data:chartData,backgroundColor:barClr,borderRadius:3}] });
  });
}

function renderJet() {
  const tier = window._supabaseProfile?.subscription_tier || localStorage.getItem('jk_subscription_tier') || 'free';
  const status = window._supabaseProfile?.subscription_status || localStorage.getItem('jk_subscription_status') || 'free';
  const adminEmail = window._supabaseUser?.email || window._supabaseProfile?.email || '';
  const hasAccess = adminEmail === 'jeffroder@gmail.com' || ((tier === 'teams_jet') && (status === 'active'));

  if (!hasAccess) {
    document.getElementById('pageContent').innerHTML = `
      <div class="placeholder-page">
        <div class="big-icon"><svg class="ti ti-lock" style="color:var(--turq)"><use href="img/tabler-sprite.svg#tabler-lock"/></svg></div>
        <h3 style="margin-bottom:10px;color:var(--text-card-title)">Jet AI — JumpKit + Jet AI Plan</h3>
        <p style="color:var(--text-muted);line-height:1.6">Your local AI co-pilot for Microsoft 365 apps. No cloud data leakage. Immutable audit trail. Pure productivity.</p>
        <p style="margin-top:10px;font-size:0.82rem;font-weight:700;color:var(--accent);letter-spacing:0.04em">100% local. API free.</p>
        <a href="https://jumpkit.app/#pricing" target="_blank" class="btn btn-primary" style="margin-top:24px"><svg class="ti ti-bolt"><use href="img/tabler-sprite.svg#tabler-bolt"/></svg> Upgrade to unlock Jet AI</a>
      </div>`;
    return;
  }

  document.getElementById('pageContent').innerHTML = `
    <div class="placeholder-page">
      <div class="big-icon"><svg class="ti ti-brain"><use href="img/tabler-sprite.svg#tabler-brain"/></svg></div>
      <h3 style="margin-bottom:10px;color:var(--text-card-title)">Jet AI — Coming Soon</h3>
      <p>Your local AI co-pilot for Microsoft 365 apps. No cloud data leakage. Immutable audit trail. Pure productivity.</p>
      <p style="margin-top:10px;font-size:0.82rem;font-weight:700;color:var(--accent);letter-spacing:0.04em">100% local. API free.</p>
    </div>`;
}

// ── Global team sharing API ────────────────────────────────────────
// Exposed as window globals so teams.js and sync.js can call them.

/**
 * Share a column (and all its jumps) with a team.
 * Upserts to Supabase shared_columns + shared_jumps, marks local records as shared.
 */
window.shareColumnWithTeam = async (columnId, teamId) => {
  const col = DB.getColumns(currentUser.id).find(c => c.id === columnId);
  if (!col || !teamId) return;
  const updatedCol = { ...col, isShared: 1, teamId };
  DB.saveColumns(currentUser.id, DB.getColumns(currentUser.id).map(c => c.id === columnId ? updatedCol : c));
  await syncColumnToSupabase(updatedCol);
  if (activePage === 'jumps') renderColumns();
};

/**
 * Remove a column from team sharing.
 * Deletes from Supabase, sets isShared=0 locally.
 */
window.unshareColumn = async (columnId) => {
  const col = DB.getColumns(currentUser.id).find(c => c.id === columnId);
  if (!col) return;
  await unshareColumnFromSupabase(col);
  DB.saveColumns(currentUser.id, DB.getColumns(currentUser.id).map(c =>
    c.id === columnId ? { ...c, isShared: 0, teamId: null } : c
  ));
  if (activePage === 'jumps') renderColumns();
};

  // ── Cleanup test artifacts ────────────────────────────────────────
  try {
    const allJumps = DB.getJumps(currentUser.id);
    const testJumps = allJumps.filter(j => j.name && (j.name.startsWith('__TEST') || j.name.startsWith('_TEST')));
    testJumps.forEach(j => DB.deleteJump(currentUser.id, j.id));
  } catch(_) {}

  // ── Init ─────────────────────────────────────────────────────────
  requestAnimationFrame(() => navigateTo(DB.getPrefs(currentUser.id).startPage || 'home'));
} // end initApp()

// ── Paywall ───────────────────────────────────────────────────────
window.showPaywall = function() {
  const body = `
    <div style="text-align:center;padding:16px 0">
      <svg class="ti ti-lock" style="font-size:3rem;color:var(--turq);display:block;margin-bottom:16px"><use href="img/tabler-sprite.svg#tabler-lock"/></svg>
      <h3 style="font-size:1.2rem;font-weight:800;margin-bottom:10px">Your free trial has ended</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:24px;line-height:1.6">
        You've used all 250 free launches.<br>Upgrade to keep jumping — no limits, plus team sharing and more.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto">
        <button class="btn btn-primary" onclick="if (window.electronAPI) window.electronAPI.openUrl('https://jumpkit.app/#pricing'); Modal.close();" style="padding:14px;font-size:1rem;font-weight:700">
          <svg class="ti ti-rocket" style="color:#fff"><use href="img/tabler-sprite.svg#tabler-rocket"/></svg> Upgrade to JumpKit — $5/mo
        </button>
        <button class="btn btn-subtle" onclick="if (window.electronAPI) window.electronAPI.openUrl('https://jumpkit.app/#pricing'); Modal.close();" style="padding:12px;font-size:0.9rem">
          <svg class="ti ti-brain"><use href="img/tabler-sprite.svg#tabler-brain"/></svg> JumpKit + Jet AI — $25/mo
        </button>
        <button class="btn btn-ghost" onclick="Modal.close();" style="padding:10px;font-size:0.82rem;color:var(--text-muted)">
          Maybe later
        </button>
      </div>
    </div>
  `;
  Modal.open('<svg class="ti ti-rocket"><use href="img/tabler-sprite.svg#tabler-rocket"/></svg> Upgrade JumpKit', body, '', { closeable: false });
};

// ── Notifications ────────────────────────────────────────────────
window.getNotifications = function getNotifications() {
  try { return JSON.parse(localStorage.getItem(`jk_notifs_${currentUser.id}`) || '[]'); } catch(_) { return []; }
};
window.saveNotifications = function saveNotifications(notifs) {
  localStorage.setItem(`jk_notifs_${currentUser.id}`, JSON.stringify(notifs));
};
window.addNotification = function addNotification(notif) {
  const notifs = getNotifications();
  notifs.unshift({ ...notif, id: Date.now().toString(36), read: false });
  // Keep max 50
  saveNotifications(notifs.slice(0, 50));
  updateNotifBadge();
};
window.clearAllNotifications = function clearAllNotifications() {
  saveNotifications([]);
  updateNotifBadge();
};
window.markAllNotificationsRead = function markAllNotificationsRead() {
  const notifs = getNotifications().map(n => ({ ...n, read: true }));
  saveNotifications(notifs);
  updateNotifBadge();
};
window.updateNotifBadge = function updateNotifBadge() {
  const unread = getNotifications().filter(n => !n.read).length;
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  // Remove existing badge
  btn.querySelector('.notif-badge')?.remove();
  if (unread > 0) {
    const badge = document.createElement('span');
    badge.className = 'notif-badge';
    badge.textContent = unread > 99 ? '99+' : unread;
    btn.appendChild(badge);
  }
};

// ── Auto Archive ──────────────────────────────────────────────────
window.runAutoArchive = function runAutoArchive() {
  const prefs = DB.getPrefs(currentUser.id);
  if (!prefs.autoArchive || prefs.autoArchive === 'never') return;

  const thresholds = { '1m': 30, '6m': 180, '1y': 365 };
  const days = thresholds[prefs.autoArchive];
  if (!days) return;

  const thresholdMs = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const active = DB.getActiveJumps(currentUser.id);

  const toArchive = active.filter(j =>
    j.lastUsed != null && j.lastUsed > 0 && (now - j.lastUsed) > thresholdMs
  );


  if (toArchive.length === 0) return;

  toArchive.forEach(j => DB.updateJump(currentUser.id, j.id, { isArchived: true }));

  // Add notification
  const names = toArchive.map(j => j.name).join(', ');
  const msg = toArchive.length === 1
    ? `"${toArchive[0].name}" was auto-archived (not used in ${days} days)`
    : `${toArchive.length} jumps were auto-archived (not used in ${days} days): ${names}`;
  addNotification({ type: 'auto-archive', message: msg, ts: now });
};

// ── Cloud Backup ──────────────────────────────────────────────────
window.forceBackup = async function forceBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId: currentUser.id,
    email: currentUser.email,
    jumps:   DB.getJumps(currentUser.id),
    columns: DB.getColumns(currentUser.id),
    prefs:   DB.getPrefs(currentUser.id),
  };
  if (window.electronAPI?.saveBackup) {
    const result = await window.electronAPI.saveBackup(JSON.stringify(backup, null, 2));
    if (result?.ok) {
      addNotification({ type: 'backup', message: `Backup saved to: ${result.path}`, ts: Date.now() });
      Modal.open('<svg class="ti ti-circle-check" style="color:#22c55e"><use href="img/tabler-sprite.svg#tabler-circle-check"/></svg> Backup Saved',
        `<div style="text-align:center;padding:8px 0">
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px">Your data has been exported successfully.</p>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:0.82rem;font-family:monospace;color:var(--text);word-break:break-all;text-align:left">${esc(result.path)}</div>
        </div>`,
        `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Got it</button>`
      );
    } else {
      Modal.open('<svg class="ti ti-alert-circle" style="color:#ef4444"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg> Backup Failed',
        `<p style="color:var(--text-muted);font-size:0.9rem">${esc(result?.reason || 'Unknown error')}</p>`,
        `<button class="btn btn-subtle" onclick="Modal.close()">Close</button>`
      );
    }
  } else {
    Toast.danger('Backup not available in browser mode');
  }
};

window.runCloudBackup = async function runCloudBackup() {
  const prefs = DB.getPrefs(currentUser.id);
  if (!prefs.cloudBackup) return;

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId: currentUser.id,
    email: currentUser.email,
    jumps:   DB.getJumps(currentUser.id),
    columns: DB.getColumns(currentUser.id),
    prefs:   prefs,
  };

  if (window.electronAPI?.saveBackup) {
    const result = await window.electronAPI.saveBackup(JSON.stringify(backup, null, 2));
    if (result?.ok) {
      addNotification({ type: 'backup', message: `Backup saved to: ${result.path}`, ts: Date.now() });
    }
  }
};

window.checkPendingInvites = async function checkPendingInvites() {
  try {
    if (!window._supabaseUser) return;
    const email = window._supabaseUser.email;
    
    // Check if we already showed this invite dialog (stored in localStorage)
    const shownKey = `jk_invite_shown_${window._supabaseUser.id}`;
    if (localStorage.getItem(shownKey)) return;

    // Check for pending invites for this email (flat query to avoid stack depth limit)
    const { data: rawInvites = [] } = await supabaseClient
      .from('team_invites')
      .select('*')
      .eq('email', email)
      .eq('status', 'pending');
    const invites = [];
    for (const inv of rawInvites) {
      const { data: t } = await supabaseClient.from('teams').select('name').eq('id', inv.team_id).single();
      invites.push({ ...inv, teams: t || null });
    }

    if (invites.length === 0) return;

    // Mark as shown so it won't show again
    localStorage.setItem(shownKey, '1');

    const teamNames = invites.map(inv => inv.teams?.name || 'a team').join(', ');
    const body = `
      <div style="text-align:center;padding:8px 0">
        <svg class="ti ti-users" style="font-size:2.5rem;color:var(--turq);display:block;margin-bottom:16px"><use href="img/tabler-sprite.svg#tabler-users"/></svg>
        <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:10px">You have a team invitation!</h3>
        <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.6;margin-bottom:0">
          You've been invited to join <strong>${esc(teamNames)}</strong>.<br>
          Go to your <strong>Teams</strong> page to join your team.
        </p>
      </div>`;

    Modal.open('<svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Team Invitation', body,
      `<button class="btn btn-subtle" onclick="Modal.close()">Later</button>
       <button class="btn btn-primary" onclick="navigateTo('account'); Modal.close()"><svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Go to Teams</button>`
    );
  } catch(e) {
    console.warn('[checkPendingInvites]', e.message);
  }
};

// ── Boot ───────────────────────────────────────────────────────────
initAuth();
