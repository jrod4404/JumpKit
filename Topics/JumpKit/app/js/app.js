// ── Guard (Supabase session) ───────────────────────────────────────
let _supabaseUser = null;
let currentUser = null;

async function initAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      _supabaseUser = session.user;
      window._supabaseUser = session.user; // expose globally
      const supaId = _supabaseUser.id; // Supabase UUID - use as canonical local ID

      // Ensure a local DB user exists for this Supabase user
      let localUser = DB.findUserByEmail(_supabaseUser.email);
      if (!localUser) {
        // First Supabase login on this device - create local profile using Supabase UUID
        DB.createUser(_supabaseUser.email.split('@')[0], _supabaseUser.email, '__supabase__', supaId);
        localUser = DB.findUserByEmail(_supabaseUser.email);
        if (localUser) DB.seedNewUser(localUser.id);
      } else if (localUser.id !== supaId) {
        // ID mismatch - migrate SQLite data from old local ID to Supabase UUID
        console.debug('[Auth] Migrating local user ID', localUser.id, '→', supaId);
        try {
          await window.electronAPI.migrateUserId(localUser.id, supaId);
        } catch(e) {
          console.warn('[Auth] migrateUserId failed:', e.message);
        }
        // Update localStorage user record to use Supabase UUID
        const users = DB.getUsers().map(u => u.id === localUser.id ? { ...u, id: supaId } : u);
        DB.saveUsers(users);
        // Update the session immediately so DB.init uses the new ID
        DB.setSession(supaId);
        localUser = DB.findUserByEmail(_supabaseUser.email);
      }

      if (localUser) {
        DB.setSession(localUser.id);
        currentUser = localUser;
      }
    } else {
      // No Supabase session - redirect to login
      window.location.href = 'index.html';
      return;
    }
  } catch (_) {
    // Supabase unavailable - redirect to login (no local session fallback)
    window.location.href = 'index.html';
    return;
  }
  // Load all app data into DB cache from SQLite
  await DB.init(currentUser.id);
  // Session confirmed - boot the app
  initApp();
}

// Placeholder - real initApp() wraps all startup logic below
// ── Auto-update banner ────────────────────────────────────────────
if (window.electronAPI?.onUpdateReady) {
  window.electronAPI.onUpdateReady(() => {
    const banner = document.getElementById('updateBanner');
    if (banner) banner.style.display = 'flex';
  });
}

async function initApp() {
  // Wire password toggles on boot
  requestAnimationFrame(() => { wirePasswordToggles(); patchModalForPwToggles(); });
  // Clean up old localStorage app data keys (post-SQLite migration)
  try {
    // Sweep prefixed keys from old localStorage-only era
    const oldPrefixes = ['jk_jumps_', 'jk_cols_', 'jk_clicks_', 'jk_prefs_', 'jk_click_log_', 'jk_seeded_'];
    Object.keys(localStorage)
      .filter(k => oldPrefixes.some(prefix => k.startsWith(prefix)))
      .forEach(k => localStorage.removeItem(k));
    // Remove legacy scalar keys - no longer written; stale values must not persist.
    // subscription/role: removed to prevent paywall tampering.
    // jk_current_user: Supabase session owns identity now.
    // jk_last_sync: was never read - dead code removed.
    // jk_teams_collapsed: renamed to jk_teams_expanded (new unambiguous format)
    ['jk_role', 'jk_subscription_status', 'jk_subscription_tier', 'jk_current_user', 'jk_last_sync', 'jk_teams_collapsed'].forEach(k => localStorage.removeItem(k));
  } catch(_) {}

  // Fetch Supabase profile for name display
  if (_supabaseUser) {
    try {
      const { data } = await supabaseClient.from('profiles')
        .select('first_name,last_name,role,subscription_status,subscription_tier,trial_launches_used,ls_customer_id,last_known_tier')
        .eq('id', _supabaseUser.id).single();
      if (data) {
        window._supabaseProfile = data;
        // NOTE: role/subscription_status/subscription_tier are intentionally NOT written
        // to localStorage - always read from window._supabaseProfile (in-memory, resets
        // on reload from Supabase) to prevent client-side tampering of paywall gates.
        // Persist subscription/role data to user_prefs (SQLite) and update cache
        if (currentUser) {
          DB.savePrefs(currentUser.id, {
            ...DB.getPrefs(currentUser.id),
            role:               data.role               || 'team-member',
            subscriptionStatus: data.subscription_status || 'free',
            subscriptionTier:   data.subscription_tier   || 'free',
          });
        }
        // If overdue - show paywall immediately after load
        if (data.subscription_status === 'overdue' || data.subscription_status === 'cancelled') {
          // Notify once per day max
          const lastLicenseNotifTs = parseInt(localStorage.getItem('jk_license_notif_ts') || '0');
          if (Date.now() - lastLicenseNotifTs > 24 * 60 * 60 * 1000) {
            const msg = data.subscription_status === 'cancelled'
              ? 'Your JumpKit Unlimited subscription has been cancelled. Reactivate to restore unlimited access.'
              : 'Your JumpKit subscription payment is overdue. Update billing to avoid interruption.';
            addNotification({ type: 'license-expiring', message: msg, ts: Date.now() });
            localStorage.setItem('jk_license_notif_ts', Date.now().toString());
          }
          if (data.subscription_status === 'cancelled') {
            setTimeout(() => checkAndHandleDowngrade(), 1200);
          } else {
            setTimeout(() => showPaywall(), 1200);
          }
        }

        // Show onboarding for first-time users
        if (!data.onboarding_completed) {
          setTimeout(() => checkAndShowOnboarding(), 600);
        }

        // Cache team IDs owned by current user (used to detect received vs owned shared columns)
        if (_supabaseUser) {
          supabaseClient.from('teams').select('id').eq('owner_id', _supabaseUser.id)
            .then(({ data: ownedTeams }) => {
              window._ownedTeamIds = (ownedTeams || []).map(t => t.id);
              // Re-render columns now that profile + tier + owned teams are all loaded
              if (typeof renderColumns === 'function') renderColumns();
            }).catch(() => { window._ownedTeamIds = []; });
        }

                renderSidebarCTA();

        // Check for Core → free downgrade or free → Core upgrade
        const currentTier = data.subscription_tier || 'free';
        const lastKnownTier = data.last_known_tier || currentTier;
        const pendingUpgradeApplied = sessionStorage.getItem('jk_pending_upgrade_applied');
        if (pendingUpgradeApplied) {
          // Clear flag — onboarding step 1 shows the Unlimited welcome, no separate modal needed
          sessionStorage.removeItem('jk_pending_upgrade_applied');
        } else if (lastKnownTier === 'core' && currentTier === 'free') {
          setTimeout(() => checkAndHandleDowngrade(), 1500);
        } else if (lastKnownTier === 'free' && (currentTier === 'core' || currentTier === 'teams_jet')) {
          setTimeout(() => checkAndHandleUpgrade(currentTier), 1500);
        }
        // Update last_known_tier to current
        supabaseClient.from('profiles').update({ last_known_tier: currentTier }).eq('id', _supabaseUser.id).then(() => {});
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
  // Check backup reminder: notify if no backup in 7+ days and auto-backup is off
  (function checkBackupReminder() {
    try {
      const prefs = currentUser ? DB.getPrefs(currentUser.id) : {};
      if (prefs.cloudBackup) return; // auto-backup is on, no reminder needed
      const lastBackupNotifTs = parseInt(localStorage.getItem('jk_backup_reminder_ts') || '0');
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastBackupNotifTs > sevenDays) {
        addNotification({ type: 'backup-reminder', message: 'No backup in 7+ days. Consider exporting a manual backup from Settings.', ts: Date.now() });
        localStorage.setItem('jk_backup_reminder_ts', Date.now().toString());
      }
    } catch (_) {}
  })();
  setTimeout(() => checkPendingInvites(), 500); // defer until Modal is defined

  // Show Tests nav item only for admin
  if (window._supabaseProfile?.role === 'admin') {
    const testNavBtn = document.querySelector('[data-page="tests"]');
    if (testNavBtn) testNavBtn.style.display = '';
    const adminLabel = document.getElementById('adminNavLabel');
    if (adminLabel) adminLabel.style.display = '';
    const adminNavBtn = document.getElementById('adminNavBtn');
    if (adminNavBtn) adminNavBtn.style.display = '';
  }

  // Check free tier limit on load
  if (window._supabaseProfile?.subscription_status === 'free' &&
      (window._supabaseProfile?.trial_launches_used || 0) >= 250) {
    setTimeout(() => showPaywall(), 1000);
  }
  // Trial ending warning notifications
  (function checkTrialEndingNotif() {
    try {
      const profile = window._supabaseProfile;
      if (!profile || profile.subscription_tier !== 'free') return;
      const used = profile.trial_launches_used || 0;
      const lastMilestone = localStorage.getItem('jk_trial_notif_milestone') || '';
      if (used >= 230 && lastMilestone !== '230') {
        addNotification({ type: 'trial-ending', message: `You've used ${used}/250 trial launches. Upgrade to JumpKit Unlimited to keep unlimited access.`, ts: Date.now() });
        localStorage.setItem('jk_trial_notif_milestone', '230');
      } else if (used >= 200 && lastMilestone !== '200' && lastMilestone !== '230') {
        addNotification({ type: 'trial-ending', message: `You've used ${used}/250 trial launches. Consider upgrading before you hit the limit.`, ts: Date.now() });
        localStorage.setItem('jk_trial_notif_milestone', '200');
      }
    } catch (_) {}
  })();

// ── Theme ──────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('jk_theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
const themeBtn  = document.getElementById('themeBtn');
const notifBtn  = document.getElementById('notifBtn');
// ── Notification type config ────────────────────────────────────────────────
const NOTIF_TYPE_CONFIG = {
  'invite-received':  { icon: 'tabler-bell',           color: '#2B9ED8' },
  'trial-ending':     { icon: 'tabler-alert-triangle',  color: '#D69E2E' },
  'backup':           { icon: 'tabler-device-floppy',   color: '#48BB78' },
  'backup-reminder':  { icon: 'tabler-device-floppy',   color: '#48BB78' },
  'auto-archive':     { icon: 'tabler-archive',         color: '#7A93B4' },
  'backup-failed':    { icon: 'tabler-device-floppy',   color: '#E05252' },
  'license-expiring': { icon: 'tabler-alert-triangle',  color: '#D69E2E' },
};
const NOTIF_DEFAULT_CFG = { icon: 'tabler-bell', color: '#7A93B4' };

function notifRelativeTime(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  if (min < 1)    return 'just now';
  if (min < 60)   return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)   return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days} days ago`;
  return new Date(ts).toLocaleDateString();
}

function notifIcon(id) {
  return `<svg class="ti"><use href="img/tabler-sprite.svg#${id}"/></svg>`;
}

window.dismissNotif = function dismissNotif(id) {
  const notifs = getNotifications().filter(n => n.id !== id);
  saveNotifications(notifs);
  updateNotifBadge();
  const item = document.querySelector(`.notif-item[data-id="${id}"]`);
  if (!item) return;
  const prev = item.previousElementSibling;
  if (prev && prev.classList.contains('notif-divider')) prev.remove();
  else { const next = item.nextElementSibling; if (next && next.classList.contains('notif-divider')) next.remove(); }
  item.remove();
  if (!document.querySelector('.notif-item')) {
    document.getElementById('modalBody').innerHTML = _notifEmptyHTML();
    document.getElementById('modalFooter').innerHTML = `<button class="btn btn-subtle" data-jaction="modal-close">${notifIcon('tabler-x')} Close</button>`;
  }
};

window._notifEmptyHTML = function _notifEmptyHTML() {
  return `<div class="notif-empty">
    ${notifIcon('tabler-bell-off')}
    <p>You're all caught up</p>
    <span>No new notifications</span>
  </div>`;
};
const _notifEmptyHTML = window._notifEmptyHTML;

notifBtn.addEventListener('click', () => {
  const notifs = getNotifications();
  const unread = notifs.filter(n => !n.read).length;
  markAllNotificationsRead();

  const titleHTML = `${notifIcon('tabler-bell')} Notifications${
    notifs.length > 0 ? ` <span class="notif-unread-count" id="notifCountLabel">(${notifs.length} open)</span>` : ''}`;

  let bodyHTML;
  if (notifs.length === 0) {
    bodyHTML = _notifEmptyHTML();
  } else {
    bodyHTML = `<div class="notif-list">` + notifs.map((n, i) => {
      const cfg = NOTIF_TYPE_CONFIG[n.type] || NOTIF_DEFAULT_CFG;
      return `
        ${i > 0 ? '<div class="notif-divider"></div>' : ''}
        <div class="notif-item${n.read ? '' : ' unread'}" data-id="${n.id}">
          <div class="notif-left-border" style="background:${cfg.color}"></div>
          <div class="notif-icon" style="color:${cfg.color}">${notifIcon(cfg.icon)}</div>
          <div class="notif-content">
            <div class="notif-message">${esc(n.message)}</div>
            <div class="notif-time">${notifRelativeTime(n.ts)}</div>
          </div>
          <button class="notif-dismiss" data-jaction="notif-dismiss" data-id="${n.id}" title="Dismiss">${notifIcon('tabler-x')}</button>
        </div>`;
    }).join('') + `</div>`;
  }

  const footerHTML = notifs.length > 0
    ? `<button class="btn btn-subtle" data-jaction="notif-clear">${notifIcon('tabler-trash')} Clear all</button>
       <button class="btn btn-subtle" data-jaction="modal-close">${notifIcon('tabler-x')} Close</button>`
    : `<button class="btn btn-subtle" data-jaction="modal-close">${notifIcon('tabler-x')} Close</button>`;

  Modal.open(titleHTML, bodyHTML, footerHTML, 'sm');
  // Lock modal height so dismissing items doesn't resize it
  requestAnimationFrame(() => {
    const box = document.getElementById('modalBox');
    if (box) box.style.minHeight = box.offsetHeight + 'px';
  });
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
  // Re-render stats charts so axis/legend colors update immediately
  if (window.activePage === 'stats') {
    renderStatsDash();
    const teamSec = document.getElementById('teamRoiSection');
    if (teamSec) { teamSec.remove(); }
    renderTeamROISection().catch(() => {});
  }
  // Re-render Users page chart on theme toggle
  if (window.activePage === 'admin') {
    renderAdmin().catch(() => {});
  }
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

function renderSidebarCTA() {
  const container = document.querySelector('.sidebar-bottom');
  if (!container) return;
  const tier = window._supabaseProfile?.subscription_tier || 'free';
  let cta = container.querySelector('.sidebar-cta');
  if (tier === 'free') {
    if (!cta) {
      cta = document.createElement('button');
      cta.className = 'sidebar-cta btn btn-primary unlock-btn';
      cta.innerHTML = `<svg class="ti ti-lock" style="width:1rem;height:1rem;flex-shrink:0;color:white;stroke:white" aria-hidden="true"><use href="img/tabler-sprite.svg#tabler-lock"/></svg><span>Upgrade to Unlimited</span>`;
      cta.addEventListener('click', () => window.electronAPI?.openUrl(LS_CHECKOUT_URL));
      const toggleBtn = container.querySelector('.sidebar-toggle-btn');
      if (toggleBtn) container.insertBefore(cta, toggleBtn);
      else container.appendChild(cta);
    }
  } else if (cta) {
    cta.remove();
  }
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
  settings: () => renderAccount('settings'),
  help:     () => renderHelp(),
  account:  () => renderAccount('account'),
  teams:    () => renderAccount('teams'),
  tests:    async () => { await loadScript('js/tests.js'); renderTests(); },
  admin:    () => renderAdmin(),
};
const pageTitles = {
  home:'Home', jumps:'Jumps', archive:'Archive',
  stats:'Statistics', settings:'Settings', help:'Help', account:'My Account', feedback:'Feedback', teams:'Teams', admin:'Users', tests:'Tests'
};
const pageIcons = {
  home:'ti-home', jumps:'ti-run', archive:'ti-archive',
  stats:'ti-chart-bar', settings:'ti-user-circle', help:'ti-help-circle', account:'ti-user-circle', feedback:'ti-message-circle', teams:'ti-user-circle', admin:'ti-users', tests:'ti-test-pipe'
};
let activePage = 'home';
window.activePage = activePage;

window.navigateTo = function navigateTo(page) {
  // Kill any lingering tooltip before DOM swap
  document.documentElement.classList.add('hide-tooltips');
  activePage = page;
  window.activePage = page;
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
    account:  'Manage your teams and shared jumps',
    settings: 'Change settings to personalize app behavior',
    help:     'Tips, features, and frequently asked questions',
    teams:    'Manage your teams and shared columns',
    admin:    'User and app usage stats',
    tests:    'Core functionality verification - run before each deployment',
    home:     '',
    jumps:    '',
  };
  document.getElementById('topbarSubtitle').innerHTML = pageSubs[page] !== undefined ? pageSubs[page] : '';
  const pc = document.getElementById('pageContent');
  pc.innerHTML = '';
  pc.classList.remove('jumps-page');
  if (pages[page]) pages[page]();
  requestAnimationFrame(() => {
    wirePasswordToggles();
    document.documentElement.classList.remove('hide-tooltips');
  });
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
  close() { this.overlay.style.display = 'none'; this.box.style.minHeight = ''; },
};
document.getElementById('modalClose').addEventListener('click', () => Modal.close());
// Overlay click intentionally does NOT close the modal - use Save or Close buttons.

// ── Modal Queue ───────────────────────────────────────────────────
// Ensures modals are shown one at a time. If a modal is already open
// when Modal.open() is called, the new call is queued and shown
// automatically after the current modal closes.
(function patchModalQueue() {
  const _queue = [];
  let _open = false;
  const _origOpen  = Modal.open.bind(Modal);
  const _origClose = Modal.close.bind(Modal);

  Modal.open = function(...args) {
    if (_open) { _queue.push(args); return; }
    _open = true;
    _origOpen(...args);
  };

  Modal.close = function() {
    _origClose();
    _open = false;
    if (_queue.length > 0) {
      const next = _queue.shift();
      setTimeout(() => { _open = true; _origOpen(...next); }, 120);
    }
  };
})();

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
async function renderHome() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const sub = document.getElementById('topbarSubtitle');
  const _homeFName = (window._supabaseProfile?.first_name || currentUser?.name || '').split(' ')[0] || 'there';
  if (sub) sub.textContent = `Welcome back, ${_homeFName}!`;

  // ── ROI stats ─────────────────────────────────────────────────────
  const clickLog       = (currentUser && DB.getClickLog) ? DB.getClickLog(currentUser.id) : [];
  const lifetimeLaunches = clickLog.length;
  const prefs          = (DB.getPrefs && currentUser) ? DB.getPrefs(currentUser.id) : {};
  const timePerClick   = prefs.timePerClick   || 10;
  const dollarsPerHour = prefs.dollarsPerHour || 50;
  const lifetimeSeconds = lifetimeLaunches * timePerClick;
  const lifetimeHours   = Math.floor(lifetimeSeconds / 3600);
  const lifetimeMins    = Math.floor((lifetimeSeconds % 3600) / 60);
  const lifetimeTimeStr = lifetimeHours > 0 ? `${lifetimeHours}h ${lifetimeMins}m` : `${lifetimeMins}m`;
  const lifetimeDollars = (lifetimeSeconds / 3600) * dollarsPerHour;
  const lifetimeDollarStr = lifetimeDollars >= 1000
    ? `$${(lifetimeDollars / 1000).toFixed(1)}k`
    : `$${lifetimeDollars.toFixed(2)}`;

  // ── Account summary vars ──────────────────────────────────────
  const _tier      = window._supabaseProfile?.subscription_tier || 'free';
  const _tierLabel = (_tier === 'core' || _tier === 'teams_jet') ? 'JumpKit Unlimited' : 'JumpKit Free';
  const _launchesUsed = window._supabaseProfile?.trial_launches_used || 0;
  const _launchesLeft   = Math.max(0, 250 - _launchesUsed);
  const _jumpsRemaining  = (_tier === 'core' || _tier === 'teams_jet')
    ? 'Unlimited'
    : `${_launchesLeft.toLocaleString()} of 250`;
  const _launchesLabel   = (_tier === 'free' && _launchesLeft === 1) ? 'Launch Remaining' : 'Launches Remaining';
  const _joinDate = currentUser?.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  document.getElementById('pageContent').innerHTML = `
    <div class="home-dash">

      <!-- ── Account Section ───────────────────────────────────── -->
      <div class="home-dash-section-label">YOUR ACCOUNT</div>
      <div class="stats-cards home-roi-grid">
        <div class="stat-card" style="gap:8px">
          <div class="stat-card-value" style="font-size:1.2rem;color:var(--text-card-title)">${_tierLabel}</div>
          <div class="stat-card-label">Account Type</div>
          ${_tier === 'free' ? `<div style="margin-top:4px">${buildUnlockButton('Upgrade to Unlimited', { fontSize: '0.75rem', padding: '5px 12px' })}</div>` : ''}
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="font-size:1.2rem;color:var(--text-card-title)">${_joinDate}</div>
          <div class="stat-card-label" style="margin-top:6px">Member Since</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="font-size:1.2rem;color:var(--text-card-title)">${_jumpsRemaining}</div>
          <div class="stat-card-label" style="margin-top:6px">${_launchesLabel}</div>
        </div>
      </div>

      <!-- ── ROI Section ─────────────────────────────────────────── -->
      <div class="home-dash-section-label">YOUR STATISTICS</div>
      <div class="stats-cards home-roi-grid">
        <div class="stat-card">
          ${(() => { const n = currentUser ? DB.getActiveJumps(currentUser.id).length : 0; return `<div class="stat-card-value" style="color:var(--text-card-title)">${n.toLocaleString()}</div><div class="stat-card-label">${n === 1 ? 'Jump' : 'Jumps'}</div>`; })()}
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--text-card-title)">${lifetimeLaunches.toLocaleString()}</div>
          <div class="stat-card-label">${lifetimeLaunches === 1 ? 'Total Launch' : 'Total Launches'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--text-card-title)">${lifetimeTimeStr}</div>
          <div class="stat-card-label">Time Saved</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color:var(--text-card-title)">${lifetimeDollarStr}</div>
          <div class="stat-card-label">$ Saved</div>
        </div>
      </div>

      <!-- ── Teams Section ───────────────────────────────────────── -->
      <div class="home-dash-section-label">YOUR TEAMS</div>
      <div id="homeTeamsSummary">
        <div style="color:var(--text-dim);font-size:0.85rem;padding:4px 0">Loading teams…</div>
      </div>

      <!-- ── App Features Section ────────────────────────────────── -->
      <div class="home-dash-section-label">APP FEATURES</div>
      <div class="tips-grid">
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-layout-columns" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg></span>Organize Columns</h3>
          <p>Click the <strong style="color:var(--hover-accent)">Configure Columns</strong> button on the <strong style="color:var(--hover-accent)">Jumps</strong> page to create up to 10 custom categories. Name them and order them to match your workflow.</p>
        </div>
        <div class="tip-card">
          <h3><span class="tip-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.74 122.88" fill="var(--text-card-title)" style="width:1.4rem;height:1.4rem;display:block"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg></span>Add Your First Jump</h3>
          <p>Go to the <strong style="color:var(--hover-accent)">Jumps</strong> page and click <strong style="color:var(--hover-accent)">Add Jump</strong> to create your first jump. Paste in a URL, file path, or network share.</p>
        </div>
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-mouse" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-mouse"/></svg></span>Left-Click to Jump</h3>
          <p>Left-click any jump to instantly launch it. Web links open in your browser. Local paths open in your OS. One click, you're there.</p>
        </div>
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-keyboard" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-keyboard"/></svg></span>Assign Hotkeys</h3>
          <p>Give each jump a hotkey code when you create or edit it. JumpKit registers it as a global shortcut so you can launch any jump without touching the mouse.</p>
        </div>
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-link" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-link"/></svg></span>Mark Favorites</h3>
          <p>Toggle the favorite flag on any jump — <svg class="ti ti-link" style="color:var(--hover-accent);width:1.3em;height:1.3em;vertical-align:-0.2em"><use href="img/tabler-sprite.svg#tabler-link"/></svg> web links and <svg class="ti ti-folder" style="color:var(--hover-accent);width:1.3em;height:1.3em;vertical-align:-0.2em"><use href="img/tabler-sprite.svg#tabler-folder"/></svg> local paths — to highlight your most-used jumps in every column.</p>
        </div>
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-chart-bar" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-chart-bar"/></svg></span>Track Your ROI</h3>
          <p>JumpKit counts every launch and calculates how much time you've saved. Check the <strong style="color:var(--hover-accent)">Statistics</strong> page to see your full ROI breakdown.</p>
        </div>
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-users" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-users"/></svg></span>Collaborate with Teams</h3>
          <p>Create teams and share your best columns and jumps with colleagues. Everyone on the team gets instant access — keeping your whole group moving at the same speed.</p>
        </div>
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-adjustments-horizontal" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-adjustments-horizontal"/></svg></span>Customize Your Settings</h3>
          <p>Tailor JumpKit to your workflow in <strong style="color:var(--hover-accent)">Settings</strong> — set your starting page, configure your ROI values, toggle hotkey display, manage backups, and more.</p>
        </div>
      </div>

      <!-- ── Help & Feedback Section ───────────────────────────────── -->
      <div class="home-dash-section-label">HELP AND FEEDBACK</div>
      <div class="tips-grid" style="margin-bottom:8px">
        <div class="tip-card">
          <h3><span class="tip-icon"><svg class="ti ti-help-circle" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-help-circle"/></svg></span>Help &amp; Documentation</h3>
          <p>The <strong style="color:var(--hover-accent)">Help</strong> page covers everything you need: a full feature list, hotkey reference, FAQ, tips for getting the most out of JumpKit, and plan comparison.</p>
        </div>
        <div class="tip-card" style="cursor:pointer" data-jaction="open-feedback-modal">
          <h3><span class="tip-icon"><svg class="ti ti-message-circle" style="color:var(--hover-accent)"><use href="img/tabler-sprite.svg#tabler-message-circle"/></svg></span>Send Feedback</h3>
          <p>Have a bug report, feature request, or just want to share a thought? Click here to send feedback directly to the JumpKit team. We read every message.</p>
        </div>
      </div>

    </div>`;

  // ── Teams section async fill ───────────────────────────────────────
  try {
    const tier        = window._supabaseProfile?.subscription_tier || 'free';
    const isUnlimited = tier === 'core' || tier === 'teams_jet';
    const teamsEl     = document.getElementById('homeTeamsSummary');
    if (!teamsEl) return;

    // Get a fresh session — same approach as teams.js so we don't depend on
    // window._supabaseUser being populated or org_id being set yet.
    let supaUser = null;
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) supaUser = session.user;
    } catch (_) {}

    if (!supaUser) {
      teamsEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem">Sign in to see your teams.</div>';
      return;
    }

    // 1. Fetch owned + joined team IDs (query by owner_id — no org_id required)
    const [ownedRes, membershipRes] = await Promise.all([
      supabaseClient.from('teams').select('id, name').eq('owner_id', supaUser.id).order('name'),
      supabaseClient.from('team_members').select('team_id').eq('user_id', supaUser.id),
    ]);
    const ownedTeams  = ownedRes.data || [];
    const ownedIds    = new Set(ownedTeams.map(t => t.id));
    const joinedTeamIds = (membershipRes.data || []).map(r => r.team_id).filter(id => !ownedIds.has(id));

    // Fetch joined team details
    let joinedTeams = [];
    if (joinedTeamIds.length > 0) {
      const { data } = await supabaseClient.from('teams').select('id, name').in('id', joinedTeamIds).order('name');
      joinedTeams = data || [];
    }

    const allTeams   = [...ownedTeams, ...joinedTeams];
    const allTeamIds = allTeams.map(t => t.id);

    if (allTeams.length === 0) {
      teamsEl.innerHTML = `<div class="stat-card" style="flex-direction:row;align-items:center;gap:16px;justify-content:space-between;flex-wrap:wrap;margin-bottom:20px">
            <div>
              <div style="font-size:0.9rem;font-weight:600;color:var(--text-card-title)">No teams yet</div>
              <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px">Create a team to share your best jumps and columns with colleagues.</div>
            </div>
            <button class="btn btn-primary" style="flex-shrink:0;white-space:nowrap" data-jaction="nav-teams"><svg class="ti ti-users" style="color:white;stroke:white"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Create a Team</button>
          </div>`;
      return;
    }

    // 2. Batch: member counts + column counts for all teams
    const [allMemberRes, allColRes] = await Promise.all([
      supabaseClient.from('team_members').select('team_id').in('team_id', allTeamIds),
      supabaseClient.from('shared_columns').select('id, team_id').in('team_id', allTeamIds),
    ]);

    const memberCountByTeam = {};
    (allMemberRes.data || []).forEach(r => {
      memberCountByTeam[r.team_id] = (memberCountByTeam[r.team_id] || 0) + 1;
    });
    // Owner (+1) is not in team_members
    ownedTeams.forEach(t => {
      memberCountByTeam[t.id] = (memberCountByTeam[t.id] || 0) + 1;
    });

    const colCountByTeam = {};
    (allColRes.data || []).forEach(r => {
      colCountByTeam[r.team_id] = (colCountByTeam[r.team_id] || 0) + 1;
    });

    // 3. Local data: jumps per team
    const allLocalJumps = currentUser ? DB.getJumps(currentUser.id) : [];

    // Build per-team card HTML
    const teamCards = allTeams.map(team => {
      const isOwner   = ownedIds.has(team.id);
      const members   = memberCountByTeam[team.id] || 1;
      const colCount  = colCountByTeam[team.id]    || 0;
      const teamJumps = allLocalJumps.filter(j => j.isShared && j.teamId === team.id && !j.isArchived);
      const jumpCount = teamJumps.length;

      // Role pill — matching teams page color scheme exactly
      const roleBadge = isOwner
        ? `<span class="teams-badge teams-badge-owner" style="font-size:0.65rem;min-width:unset;padding:2px 8px">Owner</span>`
        : `<span class="teams-badge" style="font-size:0.65rem;min-width:unset;padding:2px 8px">Member</span>`;

      return `
        <div class="stat-card home-team-card">
          <div style="margin-bottom:6px">${roleBadge}</div>
          <div style="font-size:0.95rem;font-weight:700;color:var(--text-card-title);line-height:1.3;margin-bottom:12px;width:100%">${esc(team.name)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div>
              <div style="font-size:1.1rem;font-weight:800;color:var(--text-card-title)">${members}</div>
              <div style="font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-dim)">${members === 1 ? 'Member' : 'Members'}</div>
            </div>
            <div>
              <div style="font-size:1.1rem;font-weight:800;color:var(--text-card-title)">${colCount}</div>
              <div style="font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-dim)">${colCount === 1 ? 'Column' : 'Columns'}</div>
            </div>
            <div>
              <div style="font-size:1.1rem;font-weight:800;color:var(--text-card-title)">${jumpCount}</div>
              <div style="font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-dim)">${jumpCount === 1 ? 'Jump' : 'Jumps'}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    teamsEl.innerHTML = `<div class="home-teams-grid">${teamCards}</div>`;

  } catch (e) {
    const el = document.getElementById('homeTeamsSummary');
    if (el) el.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem">Could not load teams.</div>';
  }
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

// renderSettings() merged into renderAccount() as the 'settings' tab.
// Route and direct links still work: navigateTo('settings') -> renderAccount('settings').
function renderSettings() { renderAccount('settings'); }

window.renderAccount = function renderAccount(initialTab = 'account') {
  const u = currentUser;
  const sbUser = window._supabaseUser || {};
  const sbProfile = window._supabaseProfile || {};
  const firstName = sbProfile.first_name || '';
  const lastName  = sbProfile.last_name  || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || (u ? esc(u.name) : '');
  const email     = sbUser.email || (u ? esc(u.email) : '');
  const tier      = sbProfile.subscription_tier   || 'free';
  const status    = sbProfile.subscription_status || 'free';
  const role      = sbProfile.role || 'team-member';
  const launchesUsed = sbProfile.trial_launches_used || 0;
  const tierLabel = (tier === 'core' || tier === 'teams_jet') ? 'JumpKit Unlimited' : 'JumpKit Free';
  const statusLabel = status === 'active' ? 'Active' : status === 'overdue' ? 'Overdue' : status === 'cancelled' ? 'Cancelled' : 'Free';
  const memberSince = u && u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '-';
  const clickLog = (currentUser && DB.getClickLog) ? DB.getClickLog(currentUser.id) : [];
  const lifetimeLaunches = clickLog.length;
  const timePerClick = DB.getPrefs && currentUser ? (DB.getPrefs(currentUser.id).timePerClick || 10) : 10;
  const dollarsPerHour  = DB.getPrefs && currentUser ? (DB.getPrefs(currentUser.id).dollarsPerHour || 50) : 50;
  const lifetimeSeconds = lifetimeLaunches * timePerClick;
  const lifetimeHours   = Math.floor(lifetimeSeconds / 3600);
  const lifetimeMins    = Math.floor((lifetimeSeconds % 3600) / 60);
  const lifetimeTimeStr = lifetimeHours > 0 ? `${lifetimeHours}h ${lifetimeMins}m` : `${lifetimeMins}m`;
  const lifetimeDollars = (lifetimeSeconds / 3600) * dollarsPerHour;
  const lifetimeDollarStr = lifetimeDollars >= 1000
    ? `$${(lifetimeDollars / 1000).toFixed(1)}k`
    : `$${lifetimeDollars.toFixed(2)}`;

  const ACCT_TABS = ['teams', 'settings', 'account'];
  const ACCT_LABELS = { account: 'My Account', teams: 'Teams', settings: 'Settings' };
  let currentAcctTab = ACCT_TABS.includes(initialTab) ? initialTab : 'account';

  const _upgradeBannerHTML = (tier === 'free') ? `
    <div class="acct-upgrade-banner" style="max-width:960px;margin:0 auto 16px;width:100%">
      <div>
        <h3>Upgrade to Unlimited</h3>
        <p>Remove all limits and unlock full team collaboration.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-top:10px">
          ${['Unlimited jump launches','Unlimited teams, members &amp; jumps','Personal &amp; team ROI dashboard','Auto-archive &amp; auto-backup','Early access to new features'].map(f=>`<div style="display:flex;align-items:flex-start;gap:7px;font-size:0.85rem;color:var(--text-muted)"><svg viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:0.95rem;height:0.95rem;flex-shrink:0;margin-top:2px"><polyline points="20 6 9 17 4 12"/></svg>${f}</div>`).join('')}
        </div>
      </div>
      <div class="acct-upgrade-cta">
        ${buildUnlockButton('Upgrade to Unlimited', {width:'100%', fontSize:'0.83rem', padding:'8px 16px'})}
      </div>
    </div>` : '';

  document.getElementById('pageContent').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0;height:100%">
      ${_upgradeBannerHTML}
      <div style="max-width:960px;margin:0 auto;width:100%;flex-shrink:0;padding:0 0 16px 0">
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
              <span style="font-size:0.88rem;color:var(--text-muted)">${fullName || '-'}</span>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Email</span></div>
              <span class="acct-profile-email" style="font-size:0.88rem;color:var(--text-muted)">${email || '-'}</span>
            </div>
            <div class="acct-row" style="border-bottom:none">
              <div class="acct-row-label"><span>Member Since</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${memberSince}</span>
            </div>
          </div>
          <div class="acct-section">
            <div class="acct-section-title"><svg class="ti ti-id-badge"><use href="img/tabler-sprite.svg#tabler-id-badge"/></svg> Account</div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Account Type</span></div>
              <span style="display:inline-flex;align-items:center;gap:8px">
                <span class="acct-tier-badge" style="font-size:0.88rem;color:var(--text-muted)">${tierLabel}</span>
                <button class="btn btn-subtle" style="font-size:0.75rem;padding:2px 10px" data-jaction="open-tier-features">Features</button>
              </span>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Payment Status</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${statusLabel}</span>
            </div>

            <div class="acct-row">
              <div class="acct-row-label"><span>Trial Launches Used</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${tier === 'free' ? `${launchesUsed} / 250` : 'N/A'}</span>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Lifetime Launches Used</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${lifetimeLaunches.toLocaleString()}</span>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Lifetime Time Saved</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${lifetimeTimeStr}</span>
            </div>
            <div class="acct-row" style="border-bottom:none">
              <div class="acct-row-label"><span>Lifetime $ Saved</span></div>
              <span style="font-size:0.88rem;color:var(--text-muted)">${lifetimeDollarStr}</span>
            </div>
          </div>
          <div class="acct-save-row" style="justify-content:flex-start;gap:.6rem;flex-wrap:wrap;">
            <button class="btn btn-subtle" data-jaction="open-feedback-modal"><svg class="ti ti-message-circle"><use href="img/tabler-sprite.svg#tabler-message-circle"/></svg> Send Feedback</button>
          </div>
        </div>`;
    } else if (tab === 'teams') {
      el.innerHTML = `<div class="acct-teams-wrap"></div>`;
      renderTeams(el.firstElementChild);
    } else if (tab === 'settings') {
      const p = DB.getPrefs(currentUser.id);
      const pageChoices = ['home','jumps','stats','teams','settings','account','help'].map(pg =>
        `<div class="custom-select-option${p.startPage===pg?' selected':''}" data-value="${pg}">${pageTitles[pg]||pg}</div>`).join('');
      const archiveChoices = [['never','Never'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year']].map(([v,l]) =>
        `<div class="custom-select-option${p.autoArchive===v?' selected':''}" data-value="${v}">${l}</div>`).join('');
      el.innerHTML = `
        <div class="acct-grid">
          <div class="acct-section">
            <div class="acct-section-title"><svg class="ti ti-adjustments-horizontal"><use href="img/tabler-sprite.svg#tabler-adjustments-horizontal"/></svg> Preferences</div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Starting Page</span><span class="acct-row-hint">Page shown when app opens</span></div>
              <div class="custom-select acct-select" id="startPageDrop">
                <div class="custom-select-trigger" id="startPageTrigger"><span id="startPageLabel">${pageTitles[p.startPage]||p.startPage}</span><svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg></div>
                <div class="custom-select-menu" id="startPageMenu">${pageChoices}</div>
              </div>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Nav Menu on Startup</span><span class="acct-row-hint">Sidebar state when app opens</span></div>
              <div class="custom-select acct-select" id="navStateDrop">
                <div class="custom-select-trigger" id="navStateTrigger"><span id="navStateLabel">${p.navDefaultCollapsed ? 'Collapsed' : 'Expanded'}</span><svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg></div>
                <div class="custom-select-menu" id="navStateMenu">
                  <div class="custom-select-option${!p.navDefaultCollapsed ? ' selected' : ''}" data-value="expanded">Expanded</div>
                  <div class="custom-select-option${p.navDefaultCollapsed ? ' selected' : ''}" data-value="collapsed">Collapsed</div>
                </div>
              </div>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Notifications</span><span class="acct-row-hint">Show or mute in-app notification alerts</span></div>
              <label class="toggle"><input type="checkbox" id="prefNotif" ${p.notifications?'checked':''}/><span class="toggle-slider"></span></label>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Show Jump Description</span><span class="acct-row-hint">Show or hide description under jump name on jump page</span></div>
              <label class="toggle"><input type="checkbox" id="prefDesc" ${p.showDescription?'checked':''}/><span class="toggle-slider"></span></label>
            </div>
            <div class="acct-row" style="border-bottom:none">
              <div class="acct-row-label"><span>Show Hotkey</span><span class="acct-row-hint">Show or hide hotkey pill next to jump name on jumps page</span></div>
              <label class="toggle"><input type="checkbox" id="prefHotkey" ${p.showHotkey?'checked':''}/><span class="toggle-slider"></span></label>
            </div>
          </div>
          <div class="acct-section">
            <div class="acct-section-title"><svg class="ti ti-chart-bar"><use href="img/tabler-sprite.svg#tabler-chart-bar"/></svg> ROI</div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Time Saved per Click</span><span class="acct-row-hint">The default seconds saved per jump launch, set to what is accurate for you</span></div>
              <div class="acct-number-wrap"><input class="form-input acct-number" type="number" id="prefTime" min="1" max="300" value="${p.timePerClick}"/><span class="acct-unit">sec</span></div>
            </div>
            <div class="acct-row" style="border-bottom:none">
              <div class="acct-row-label"><span>Dollars per Hour</span><span class="acct-row-hint">Your personal dollars per hour, used to calculate ROI, set to what is accurate for you</span></div>
              <div class="acct-number-wrap"><span class="acct-unit">$</span><input class="form-input acct-number" type="number" id="prefDollar" min="1" max="9999" value="${p.dollarsPerHour}"/><span class="acct-unit">/ hr</span></div>
            </div>
          </div>
          <div class="acct-section">
            <div class="acct-section-title"><svg class="ti ti-tool"><use href="img/tabler-sprite.svg#tabler-tool"/></svg> Maintenance</div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Backup Jumps Manually</span><span class="acct-row-hint">Export all data to a local JSON file</span></div>
              <button class="btn btn-subtle" data-jaction="force-backup"><svg class="ti ti-download"><use href="img/tabler-sprite.svg#tabler-download"/></svg> Export</button>
            </div>
            <div class="acct-row">
              <div class="acct-row-label"><span>Auto-Backup Jumps</span><span class="acct-row-hint">Automatically saves a local backup of all your jumps on each login</span></div>
              ${tier==='free'
                ? buildUnlockButton('Upgrade to Unlimited', { fontSize: '0.78rem', padding: '5px 12px' })
                : `<label class="toggle"><input type="checkbox" id="prefCloud" ${p.cloudBackup?'checked':''}/><span class="toggle-slider"></span></label>`}
            </div>
            <div class="acct-row" style="border-bottom:none">
              <div class="acct-row-label"><span>Auto-Archive Jumps</span><span class="acct-row-hint">Automatically moves unused jumps to the archive after a set time period</span></div>
              ${tier==='free'
                ? buildUnlockButton('Upgrade to Unlimited', { fontSize: '0.78rem', padding: '5px 12px' })
                : `<div class="custom-select acct-select" id="autoArchiveDrop">
                <div class="custom-select-trigger" id="autoArchiveTrigger"><span id="autoArchiveLabel">${{never:'Never','1m':'1 Month','6m':'6 Months','1y':'1 Year'}[p.autoArchive]}</span><svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg></div>
                <div class="custom-select-menu" id="autoArchiveMenu">${archiveChoices}</div>
              </div>`}
            </div>
          </div>
          <div class="acct-save-row">
            <button class="btn btn-save" data-jaction="save-account-prefs"><svg class="ti ti-device-floppy"><use href="img/tabler-sprite.svg#tabler-device-floppy"/></svg> Save Settings</button>
          </div>
        </div>`;
      wireAcctDropdown('startPageDrop','startPageTrigger','startPageMenu','startPageLabel');
      wireAcctDropdown('navStateDrop','navStateTrigger','navStateMenu','navStateLabel');
      if (document.getElementById('autoArchiveDrop')) wireAcctDropdown('autoArchiveDrop','autoArchiveTrigger','autoArchiveMenu','autoArchiveLabel');
    }
  }

  // Wire tab clicks
  const acctTabSubs = {
    account:  'View your account details',
    teams:    'Manage your teams and shared columns',
    settings: 'Change settings to personalize app behavior',
  };
  function setAcctSubtitle(tab) {
    const el = document.getElementById('topbarSubtitle');
    if (el) el.innerHTML = acctTabSubs[tab] || '';
  }

  document.getElementById('acctTabBar').addEventListener('click', e => {
    const btn = e.target.closest('.jfb-tab');
    if (!btn) return;
    currentAcctTab = btn.dataset.at;
    document.querySelectorAll('#acctTabBar .jfb-tab').forEach(b => b.classList.toggle('active', b.dataset.at === currentAcctTab));
    moveAcctPill();
    setAcctSubtitle(currentAcctTab);
    renderAcctTabContent(currentAcctTab);
    // Sync sidebar nav highlight with the active tab
    const tabNavMap = { teams: 'teams', settings: 'settings', account: null };
    const navPage = tabNavMap[currentAcctTab];
    document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.toggle('active', navPage ? b.dataset.page === navPage : false));
    // Update topbar title and activePage to reflect the active tab
    activePage = navPage || 'account';
    window.activePage = activePage;
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = pageTitles[currentAcctTab] || '';
  });

  function moveAcctPill() {
    const bar    = document.getElementById('acctTabBar');
    const pill   = document.getElementById('acctTabPill');
    const active = bar && bar.querySelector('.jfb-tab.active');
    if (!pill || !active || !bar) return;
    const tabs   = bar.querySelectorAll('.jfb-tab');
    const isLast = active === tabs[tabs.length - 1];
    pill.style.left   = active.offsetLeft + 'px';
    pill.style.width  = isLast ? (bar.offsetWidth - active.offsetLeft) + 'px' : active.offsetWidth + 'px';
    pill.style.top    = '0';
    pill.style.bottom = '0';
  }

  setAcctSubtitle(currentAcctTab);
  renderAcctTabContent(currentAcctTab);
  requestAnimationFrame(() => requestAnimationFrame(moveAcctPill));
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
    cloudBackup:     (window._supabaseProfile?.subscription_tier || 'free') !== 'free' && document.getElementById('prefCloud')?.checked,
    timePerClick:    Math.max(1, parseInt(document.getElementById('prefTime').value)  || cur.timePerClick),
    dollarsPerHour:  Math.max(1, parseInt(document.getElementById('prefDollar').value) || cur.dollarsPerHour),
    showDescription: document.getElementById('prefDesc').checked,
    showHotkey:      document.getElementById('prefHotkey').checked,
    autoArchive:         (window._supabaseProfile?.subscription_tier || 'free') !== 'free' ? (archSel ? archSel.dataset.value : cur.autoArchive) : 'never',
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
      <input class="form-input" id="fbName" value="${esc(([((window._supabaseProfile||{}).first_name)||'', ((window._supabaseProfile||{}).last_name)||''].filter(Boolean).join(' ')) || currentUser.name)}" readonly tabindex="-1"/>
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
          <span id="fbCatLabel" style="color:var(--text-dim)">- Select a category -</span>
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
      <textarea class="form-textarea" id="fbMsg" tabindex="2" placeholder="Share your thoughts..." style="min-height:120px"></textarea>
      <span class="form-error" id="fbMsgErr">A message is required.</span>
    </div>`;

  Modal.open('<svg class="ti ti-message-circle"><use href="img/tabler-sprite.svg#tabler-message-circle"/></svg> Feedback', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" data-jaction="submit-feedback"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Submit</button>`);

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
    `<button class="btn btn-subtle" disabled><svg class="ti ti-loader-2 spin"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg> Sending...</button>`;

  try {
    console.debug('[Feedback] Calling edge function...');
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
    // Still show success to user - don't block on edge fn errors
  }

  document.getElementById('modalBody').innerHTML = `
    <div style="text-align:center;padding:32px 0">
      <svg class="ti ti-circle-check" style="font-size:3rem;color:#22c55e;display:block;margin:0 auto 16px;-webkit-font-smoothing:antialiased"><use href="img/tabler-sprite.svg#tabler-circle-check"/></svg>
      <p style="color:var(--text-card-title);font-size:1rem;font-weight:600;margin-bottom:8px">Thanks for your feedback!</p>
      <p style="color:var(--text-muted);font-size:0.88rem">We'll review it and be in touch if needed.</p>
    </div>`;
  document.getElementById('modalFooter').innerHTML =
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>`;
}
let currentStatView = 'summary';
const STAT_VIEWS  = ['summary','daily','weekly','monthly','yearly'];
const STAT_LABELS = { summary:'Summary', daily:'Daily', weekly:'Weekly', monthly:'Monthly', yearly:'Yearly' };

// ── Lazy script loader ───────────────────────────────────────────
const _loadedScripts = new Set();
function loadScript(src) {
  if (_loadedScripts.has(src) || document.querySelector(`script[src^="${src}"]`)) {
    _loadedScripts.add(src);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { _loadedScripts.add(src); resolve(); };
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

window.renderStats = async function renderStats() {
  await loadScript('js/chart.min.js');
  const _statsTier = window._supabaseProfile?.subscription_tier || 'free';
  const _statsLaunchesUsed = window._supabaseProfile?.trial_launches_used || 0;
  const _statsLaunchesRemaining = Math.max(250 - _statsLaunchesUsed, 0);
  const _statsLaunchPct = Math.min(100, Math.round((_statsLaunchesUsed / 250) * 100));
  const _statsBarColor = _statsLaunchPct >= 90 ? 'var(--danger)' : _statsLaunchPct >= 70 ? '#f59e0b' : 'var(--turq)';
  const _statsLaunchBanner = _statsTier === 'free' ? `
    <div style="background:linear-gradient(135deg,rgba(80,202,204,0.15),rgba(26,79,214,0.18));border:1px solid rgba(80,202,204,0.25);border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:0.85rem;color:var(--text-muted);font-weight:600">Free Launch Usage</span>
          <span style="font-size:0.85rem;color:var(--text-muted)">${_statsLaunchesUsed} / 250 launches used</span>
        </div>
        <div style="height:6px;background:var(--bg-input);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${_statsLaunchPct}%;background:${_statsBarColor};border-radius:99px;transition:width 0.4s"></div>
        </div>
        <div style="font-size:0.78rem;color:var(--text-dim);margin-top:5px">${_statsLaunchesRemaining} launches remaining - upgrade to JumpKit Unlimited for unlimited launches</div>
      </div>
      <div style="flex-shrink:0">
        ${buildUnlockButton('Upgrade to Unlimited', { fontSize: '0.83rem', padding: '8px 16px' })}
      </div>
    </div>` : '';

  document.getElementById('pageContent').innerHTML = `
    <div class="stats-wrap">
      ${_statsLaunchBanner}
      <div style="margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="jump-filter-bar" id="statsBar">
          <div class="jfb-slider" id="statsPill"></div>
          ${STAT_VIEWS.map(v=>`<button class="jfb-tab${v===currentStatView?' active':''}" data-sv="${v}">${STAT_LABELS[v]}</button>`).join('')}
        </div>
        <button class="btn btn-subtle" style="font-size:0.82rem;padding:0 14px;height:34px;white-space:nowrap;flex-shrink:0" data-jaction="export-stats-pdf"><svg class="ti ti-file-download" style="width:1em;height:1em"><use href="img/tabler-sprite.svg#tabler-file-download"/></svg> Export PDF</button>
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

window.exportStatsPDF = async function exportStatsPDF() {
  if (!currentUser) return;
  const prefs    = DB.getPrefs(currentUser.id);
  const log      = DB.getClickLog(currentUser.id);
  const allJumps = DB.getJumps(currentUser.id);
  const jumps    = DB.getActiveJumps(currentUser.id);
  const cols     = DB.getColumns(currentUser.id).filter(c => c.visible).sort((a, b) => a.order - b.order);
  const now      = new Date();

  // All-time summary stats
  const n = log.length;
  const totalSecondsSaved = log.reduce((sum, c) => {
    const j = allJumps.find(j => j.id === c.jumpId);
    return sum + (j?.timeSaved != null ? j.timeSaved : prefs.timePerClick);
  }, 0);
  const mins    = Math.round(totalSecondsSaved / 60);
  const dollars = ((totalSecondsSaved / 3600) * prefs.dollarsPerHour).toFixed(2);
  const fmtUSD  = v => '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Top 10 jumps
  const byJump = {};
  log.forEach(e => { byJump[e.jumpId] = (byJump[e.jumpId] || 0) + 1; });
  const top10 = Object.entries(byJump).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, ct]) => {
    const name = jumps.find(j => j.id === id)?.name || (log.find(e => e.jumpId === id)?.jumpName ? log.find(e => e.jumpId === id).jumpName + ' (removed)' : 'Removed');
    return { name, removed: !jumps.find(j => j.id === id), ct };
  });

  // Last 30 days
  const labels30 = [], data30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels30.push(i === 0 ? 'Today' : i % 5 === 0 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
    data30.push(log.filter(e => new Date(e.ts).toISOString().slice(0, 10) === key).length);
  }

  // By column
  const byCol = {};
  log.forEach(e => {
    const j = jumps.find(j => j.id === e.jumpId);
    const name = j ? (cols.find(c => c.id === j.columnId)?.name || 'Unknown') : 'Unknown';
    byCol[name] = (byCol[name] || 0) + 1;
  });

  // Team ROI data for PDF (unlimited users only, owned teams)
  let teamRoiHtml = '';
  const pdfTier = window._supabaseProfile?.subscription_tier || 'free';
  if (pdfTier !== 'free') {
    try {
      let pdfSession = null;
      try { const r = await supabaseClient.auth.getSession(); pdfSession = r?.data?.session; } catch (_) {}
      if (pdfSession) {
        const pdfUserId = pdfSession.user.id;
        const { data: pdfOwnedTeams = [] } = await supabaseClient
          .from('teams').select('id, name').eq('owner_id', pdfUserId).order('name');
        if (pdfOwnedTeams.length > 0) {
          const pdfTeamIds = pdfOwnedTeams.map(t => t.id);
          const { data: pdfStats = [] } = await supabaseClient
            .from('member_stats')
            .select('user_id, team_id, total_launches, total_seconds_saved, dollars_per_hour, updated_at')
            .in('team_id', pdfTeamIds);
          const pdfUserIds = [...new Set(pdfStats.map(s => s.user_id))];
          let pdfProfileMap = {};
          if (pdfUserIds.length > 0) {
            const { data: pdfProfiles = [] } = await supabaseClient.from('profiles').select('id,first_name,last_name,email').in('id', pdfUserIds);
            pdfProfiles.forEach(p => { pdfProfileMap[p.id] = p; });
          }
          // Fetch member counts per team (owner counts as +1)
          const pdfMemberCountMap = {};
          await Promise.all(pdfOwnedTeams.map(async t => {
            const { count } = await supabaseClient.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', t.id);
            pdfMemberCountMap[t.id] = (count || 0) + 1;
          }));
          const teamSections = pdfOwnedTeams.map(team => {
            const ts = pdfStats.filter(s => s.team_id === team.id);
            const memberCount = pdfMemberCountMap[team.id] ?? 0;
            if (ts.length === 0) return `
              <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;page-break-inside:avoid">
                <div style="background:#f3f4f6;padding:12px 16px;border-bottom:1px solid #e5e7eb">
                  <div style="font-size:13px;font-weight:700;color:#374151">${team.name}</div>
                  <div style="font-size:10px;color:#9ca3af;margin-top:2px">${memberCount} member${memberCount !== 1 ? 's' : ''}</div>
                </div>
                <div style="padding:16px"><p style="font-size:12px;color:#6b7280">No usage data yet.</p></div>
              </div>`;
            const tL = ts.reduce((s, r) => s + (r.total_launches || 0), 0);
            const tSec = ts.reduce((s, r) => s + (r.total_seconds_saved || 0), 0);
            const tMins = Math.round(tSec / 60);
            const tDollars = ts.reduce((s, r) => s + ((r.total_seconds_saved / 3600) * (r.dollars_per_hour || 50)), 0).toFixed(2);
            const activeCount = ts.length;
            const activeBadge = activeCount < memberCount ? ` &middot; <span style="color:#00C2C7">${activeCount} active</span>` : '';
            const mRows = ts.sort((a, b) => b.total_launches - a.total_launches).map((s, i) => {
              const p = pdfProfileMap[s.user_id];
              const name = p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Member') : 'Member';
              const isMe = s.user_id === pdfUserId;
              const mMins = Math.round((s.total_seconds_saved || 0) / 60);
              const mDollars = (((s.total_seconds_saved || 0) / 3600) * (s.dollars_per_hour || 50)).toFixed(2);
              const lastSeen = s.updated_at ? new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
              return `<tr style="border-bottom:1px solid #e5e7eb">
                <td style="padding:6px 10px;color:#9ca3af;font-size:12px">${i+1}</td>
                <td style="padding:6px 10px;font-size:12px;color:#374151">
                  <div style="font-weight:${isMe ? '700' : '400'}">${name}${isMe ? ' <span style="font-size:10px;color:#00C2C7">(you)</span>' : ''}</div>
                  ${lastSeen ? `<div style="font-size:10px;color:#9ca3af">Last sync: ${lastSeen}</div>` : ''}
                </td>
                <td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:700;color:#00C2C7">${(s.total_launches||0).toLocaleString()}</td>
                <td style="padding:6px 10px;font-size:12px;text-align:right;color:#374151">${mMins.toLocaleString()} min</td>
                <td style="padding:6px 10px;font-size:12px;text-align:right;color:#374151">$${parseFloat(mDollars).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              </tr>`;
            }).join('');
            return `
              <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;page-break-inside:avoid">
                <div style="background:#f3f4f6;padding:12px 16px;border-bottom:1px solid #e5e7eb">
                  <div style="font-size:13px;font-weight:700;color:#374151">${team.name}</div>
                  <div style="font-size:10px;color:#9ca3af;margin-top:2px">${memberCount} member${memberCount !== 1 ? 's' : ''}${activeBadge}</div>
                </div>
                <div style="padding:16px">
                  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center"><div style="font-size:14px;font-weight:900;color:#1f2937">${activeCount} / ${memberCount}</div><div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Members Active</div></div>
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center"><div style="font-size:14px;font-weight:900;color:#1f2937">${tL.toLocaleString()}</div><div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Team Launches</div></div>
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center"><div style="font-size:14px;font-weight:900;color:#1f2937">${tMins.toLocaleString()} min</div><div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Time Saved</div></div>
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center"><div style="font-size:14px;font-weight:900;color:#1f2937">$${parseFloat(tDollars).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">$ Saved</div></div>
                  </div>
                  <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="background:#f3f4f6">
                      <th style="padding:6px 10px;font-size:10px;color:#6b7280;text-align:left;font-weight:700;text-transform:uppercase">#</th>
                      <th style="padding:6px 10px;font-size:10px;color:#6b7280;text-align:left;font-weight:700;text-transform:uppercase">Member</th>
                      <th style="padding:6px 10px;font-size:10px;color:#6b7280;text-align:right;font-weight:700;text-transform:uppercase">Launches</th>
                      <th style="padding:6px 10px;font-size:10px;color:#6b7280;text-align:right;font-weight:700;text-transform:uppercase">Time</th>
                      <th style="padding:6px 10px;font-size:10px;color:#6b7280;text-align:right;font-weight:700;text-transform:uppercase">$ Saved</th>
                    </tr></thead>
                    <tbody>${mRows}</tbody>
                    <tfoot><tr style="border-top:2px solid #d1d5db;background:#f9fafb">
                      <td colspan="2" style="padding:8px 10px;font-size:12px;font-weight:700;color:#374151">Team Total</td>
                      <td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;color:#00C2C7">${tL.toLocaleString()}</td>
                      <td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;color:#374151">${tMins.toLocaleString()} min</td>
                      <td style="padding:8px 10px;font-size:12px;font-weight:700;text-align:right;color:#374151">$${parseFloat(tDollars).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>`;
          }).join('');
          teamRoiHtml = `
            <div style="page-break-before:always"></div>
            <div class="section-title" style="margin-top:0">Team ROI</div>
            ${teamSections}`;
        }
      }
    } catch (_) {}
  }

  // Capture chart canvases (only available in Summary view)
  const lineImg = document.getElementById('chLine')?.toDataURL?.('image/png') || '';
  const colImg  = document.getElementById('chCol')?.toDataURL?.('image/png') || '';

  // User info
  const userName   = [window._supabaseProfile?.first_name, window._supabaseProfile?.last_name].filter(Boolean).join(' ') || window._supabaseUser?.email || 'JumpKit User';
  const exportDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Load logo as base64 for inline embedding in PDF
  let logoDataUrl = '';
  try {
    const logoResp = await fetch('img/logo.png');
    const blob = await logoResp.blob();
    logoDataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  } catch (_) {}

  const topRowsHTML = top10.map((j, i) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 12px;color:#9ca3af;font-size:13px">${i + 1}</td>
      <td style="padding:8px 12px;font-size:13px;color:${j.removed ? '#9ca3af' : '#374151'};font-style:${j.removed ? 'italic' : 'normal'}">${j.name}</td>
      <td style="padding:8px 12px;font-weight:700;color:#00C2C7;font-size:13px;text-align:right">${j.ct}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ROI Report — ${exportDate}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#1f2937; background:#fff; padding:40px; }
    .header { display:grid; grid-template-columns:1fr auto; row-gap:5px; margin-bottom:28px; padding-bottom:16px; border-bottom:2px solid #e5e7eb; align-items:center; }
    .header-right { text-align:right; }
    .section-title { font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin:24px 0 12px; }
    .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
    .stat-box { background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; text-align:center; }
    .stat-value { font-size:20px; font-weight:900; color:#1f2937; }
    .stat-label { font-size:10px; color:#9ca3af; margin-top:4px; text-transform:uppercase; letter-spacing:0.05em; }
    .chart-row { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:20px; }
    .chart-box { background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; }
    .chart-title { font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px; }
    table { width:100%; border-collapse:collapse; }
    .footer { display:none; }
    @media print { body { padding:20px; } @page { margin:1.2cm; } }
  </style>
</head>
<body>
  <div class="header">
    ${logoDataUrl ? `<img src="${logoDataUrl}" style="height:34px;width:auto" />` : '<div></div>'}
    <div class="header-right" style="font-size:18px;font-weight:800;color:#1f2937">ROI Summary</div>
    <div style="font-size:12px;color:#6b7280">Stop searching. Start jumping.</div>
    <div class="header-right" style="font-size:12px;color:#6b7280">${userName} &middot; All-time summary</div>
    <div style="font-size:12px;color:#9ca3af">jumpkit.app</div>
    <div class="header-right" style="font-size:12px;color:#9ca3af">${exportDate}</div>
  </div>

  <div class="section-title">Personal ROI</div>
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-value">${n.toLocaleString()}</div><div class="stat-label">Total Launches</div></div>
    <div class="stat-box"><div class="stat-value">${mins.toLocaleString()} min</div><div class="stat-label">Time Saved</div></div>
    <div class="stat-box"><div class="stat-value">${fmtUSD(dollars)}</div><div class="stat-label">Dollars Saved</div></div>
    <div class="stat-box"><div class="stat-value">${jumps.length}</div><div class="stat-label">Active Jumps</div></div>
  </div>

  ${lineImg ? `
  <div class="section-title">Last 30 Days</div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:20px">
    <img src="${lineImg}" style="width:100%;height:auto" />
  </div>` : ''}

  <div class="chart-row">
    <div class="chart-box">
      <div class="chart-title">Top Jumps</div>
      <table><tbody>${topRowsHTML}</tbody></table>
    </div>
    ${colImg ? `
    <div class="chart-box">
      <div class="chart-title">Launches by Column</div>
      <img src="${colImg}" style="width:100%;height:auto" />
    </div>` : ''}
  </div>

  ${teamRoiHtml}

</body>
</html>`;

  if (currentStatView !== 'summary') {
    Toast.success('Switching to Summary view for export…');
    currentStatView = 'summary';
    document.querySelectorAll('#statsBar .jfb-tab').forEach(b => b.classList.toggle('active', b.dataset.sv === 'summary'));
    posStatsPill();
    renderStatsDash();
    setTimeout(() => exportStatsPDF(), 600);
    return;
  }

  // Use Electron save dialog + printToPDF via IPC
  Toast.success('Preparing report…');
  try {
    const result = await window.electronAPI.exportPDF(html);
    if (result?.success) {
      Toast.success('ROI report saved!');
    } else if (!result?.canceled) {
      Toast.danger('Failed to save PDF: ' + (result?.error || 'unknown error'));
    }
  } catch (err) {
    Toast.danger('Export failed: ' + err.message);
  }
};

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
    daily:   [startOf('day')-6*86400000, startOf('day')+86400000],
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
  const doughColors=['#00C2C7','#1A4FD6','#2B9ED8','#ff7a45','#faad14','#a0d911','#9254de','#eb2f96','#69c0ff','#389e0d'];
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
    const top8 = Object.entries(byJump).sort((a,b)=>b[1]-a[1]).slice(0,10)
      .map(([id,ct]) => { const _n=jumps.find(j=>j.id===id)?.name; const _logName=log.find(e=>e.jumpId===id)?.jumpName; return { name: _n||(_logName?`${_logName} (removed)`:'Removed'), removed:!_n, ct }; });

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

    const colEntries=Object.entries(byCol);
    const favCount=jumps.filter(j=>j.favorite).length;

    // Top jumps table rows
    const topRows = top8.map((j,i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;${i<top8.length-1?'border-bottom:1px solid var(--border);':''}font-size:0.84rem">
        <span style="color:var(--text-dim);min-width:18px;font-size:0.75rem">${i+1}</span>
        <span style="flex:1;color:${j.removed?'var(--text-dim)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:${j.removed?'italic':'normal'}">${esc(j.name)}</span>
        <span style="font-weight:700;color:var(--hover-accent)">${j.ct}</span>
      </div>`).join('');

    dash.innerHTML = `
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Personal ROI</div>
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
          <div class="stats-chart-title">Top 10 Jumps</div>
          <div>${topRows}</div>
        </div>
        <div class="stats-chart-box">
          <div class="stats-chart-title">Launches by Column</div>
          <div style="height:310px"><canvas id="chCol"></canvas></div>
        </div>
      </div>`;

    requestAnimationFrame(() => {
      mkChart('chLine','bar',
        { labels:labels30, datasets:[{data:data30,backgroundColor:barClr,borderRadius:3}] });
      mkChart('chCol','doughnut',
        { labels:colEntries.map(e=>e[0]), datasets:[{data:colEntries.map(e=>e[1]),backgroundColor:doughColors.slice(0,colEntries.length),borderWidth:0}] },
        { scales:{}, plugins:{ legend:{ display:true, position:'bottom', labels:{ color:tc, boxWidth:10, font:{size:11}, padding:10 } } } });
    });
    renderTeamROISection().catch(() => {});
    return;
  }

  // ── Period views: time-series bar chart ──────────────────────
  let chartLabels=[], chartData=[], chartTitle='';

  if (currentStatView === 'daily') {
    // Last 7 days - one bar per day
    chartTitle = 'Launches by Day - Last 7 Days';
    for (let i = 6; i >= 0; i--) {
      const ds = startOf('day') - i*86400000;
      const de = ds + 86400000;
      const d  = new Date(ds);
      chartLabels.push(i === 0 ? 'Today' : d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));
      chartData.push(clicks.filter(e=>e.ts>=ds&&e.ts<de).length);
    }
  } else if (currentStatView === 'weekly') {
    // Last 52 calendar weeks - one bar per week
    chartTitle = `Launches by Week - Last 52 Weeks`;
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
    // This year - one bar per month
    chartTitle = `Launches by Month - ${now.getFullYear()}`;
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].forEach((_,i)=>{
      const ms=new Date(now.getFullYear(),i,1).getTime();
      const me=new Date(now.getFullYear(),i+1,1).getTime();
      chartLabels.push(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]);
      chartData.push(clicks.filter(e=>e.ts>=ms&&e.ts<me).length);
    });
  } else if (currentStatView === 'yearly') {
    // Last 4 full years + current year YTD
    chartTitle = `Launches by Year - ${now.getFullYear()-4} to ${now.getFullYear()}`;
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

  // Launches by column for this period
  const byColP = {};
  clicks.forEach(e => {
    const jump = jumps.find(j => j.id === e.jumpId);
    const colName = jump
      ? (DB.getColumns(currentUser.id).find(c => c.id === jump.columnId)?.name || 'Uncategorized')
      : 'Removed';
    byColP[colName] = (byColP[colName] || 0) + 1;
  });
  const colEntriesP = Object.entries(byColP).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const top10P = Object.entries(byJumpP).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([id,ct]) => { const _n=jumps.find(j=>j.id===id)?.name; const _logName=clicks.find(e=>e.jumpId===id)?.jumpName; return { name: _n||(_logName?`${_logName} (removed)`:'Removed'), removed:!_n, ct }; });
  const topRowsP = top10P.map((j,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;${i<top10P.length-1?'border-bottom:1px solid var(--border);':''}font-size:0.84rem">
      <span style="color:var(--text-dim);min-width:18px;font-size:0.75rem">${i+1}</span>
      <span style="flex:1;color:${j.removed?'var(--text-dim)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:${j.removed?'italic':'normal'}">${esc(j.name)}</span>
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
      <div class="stats-chart-box">
        <div class="stats-chart-title">Top 10 Jumps</div>
        ${top10P.length ? topRowsP : '<p style="color:var(--text-dim);font-size:0.85rem">No jump data for this period.</p>'}
      </div>
      <div class="stats-chart-box">
        <div class="stats-chart-title">Launches by Column</div>
        <div style="height:310px"><canvas id="chColP"></canvas></div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    mkChart('chPeriod','bar',
      { labels:chartLabels, datasets:[{data:chartData,backgroundColor:barClr,borderRadius:3}] });
    mkChart('chColP','doughnut',
      { labels:colEntriesP.map(e=>e[0]), datasets:[{data:colEntriesP.map(e=>e[1]),backgroundColor:doughColors.slice(0,colEntriesP.length),borderWidth:0}] },
      { scales:{}, plugins:{ legend:{ display:true, position:'bottom', labels:{ color:tc, boxWidth:10, font:{size:11}, padding:10 } } } });
  });
}

// ── Team ROI Section ──────────────────────────────────────────────────────────────────
// Appended to stats dash summary view. Shows per-team ROI.
// Free: personal contribution to shared jumps + estimated team total (upgrade teaser).
// Unlimited: one card per owned team with full per-member breakdown from member_stats.
async function renderTeamROISection() {
  if (!currentUser) return;
  const dash = document.getElementById('statsDash');
  if (!dash) return;

  const tier    = window._supabaseProfile?.subscription_tier || 'free';
  const prefs   = DB.getPrefs(currentUser.id);
  const log     = DB.getClickLog(currentUser.id);
  const allJumps= DB.getJumps(currentUser.id);
  const allCols = DB.getColumns(currentUser.id);

  // Find shared columns (isShared = true, either format: sharedTeams[] or teamId)
  const sharedCols = allCols.filter(c => c.isShared);
  if (sharedCols.length === 0) return; // No team activity — skip section

  const sharedColIds  = new Set(sharedCols.map(c => c.id));
  const sharedJumpMap = {};
  allJumps.filter(j => sharedColIds.has(j.columnId)).forEach(j => { sharedJumpMap[j.id] = j; });

  const sharedClicks = log.filter(c => sharedJumpMap[c.jumpId]);
  const myLaunches   = sharedClicks.length;
  const mySeconds    = sharedClicks.reduce((sum, c) => {
    const j = sharedJumpMap[c.jumpId];
    return sum + (j?.timeSaved != null ? j.timeSaved : prefs.timePerClick);
  }, 0);
  const myMins    = Math.round(mySeconds / 60);
  const myDollars = ((mySeconds / 3600) * prefs.dollarsPerHour).toFixed(2);
  const fmtUSD    = v => '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Placeholder while loading ─────────────────────────────────────────────
  const section = document.createElement('div');
  section.id = 'teamRoiSection';
  section.innerHTML = `
    <div style="margin-top:40px">
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Team ROI</div>
      <div style="color:var(--text-dim);font-size:0.85rem;padding:16px 0">Loading team data…</div>
    </div>`;
  dash.appendChild(section);

  // ── Shared card-header builder ────────────────────────────────────────────
  const teamCardHeader = (teamName, memberCount, extraBadge = '') => `
    <div style="background:var(--team-header-bg);margin:-18px -18px 14px -18px;padding:12px 18px;border-bottom:1px solid var(--border);border-radius:var(--radius-lg) var(--radius-lg) 0 0">
      <div style="font-size:0.95rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${String(teamName || '')}</div>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px">${memberCount != null ? `${memberCount} member${memberCount !== 1 ? 's' : ''}` : 'Team member'}${extraBadge}</div>
    </div>`;

  try {
    let session = null;
    try { const r = await supabaseClient.auth.getSession(); session = r?.data?.session; } catch (_) {}
    if (!session) { section.remove(); return; }
    const userId = session.user.id;

    if (tier === 'free') {
      // ── Free: Personal contribution card + estimated team total card ──
      const [{ data: ownedTeams = [] }, { data: memberships = [] }] = await Promise.all([
        supabaseClient.from('teams').select('id, name').eq('owner_id', userId),
        supabaseClient.from('team_members').select('team_id').eq('user_id', userId),
      ]);
      const memberTeamIds = memberships.map(m => m.team_id).filter(id => !ownedTeams.find(t => t.id === id));
      let memberTeams = [];
      if (memberTeamIds.length > 0) {
        const { data: mt = [] } = await supabaseClient.from('teams').select('id,name').in('id', memberTeamIds);
        memberTeams = mt;
      }
      const allTeams = [...ownedTeams, ...memberTeams];
      if (allTeams.length === 0) { section.remove(); return; }

      const memberCountMap = {};
      for (const t of ownedTeams) {
        const { count } = await supabaseClient.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', t.id);
        memberCountMap[t.id] = (count || 0) + 1;
      }
      for (const t of memberTeams) { memberCountMap[t.id] = null; }

      const teamNames = allTeams.map(t => t.name).join(', ');
      const avgMembers = Object.values(memberCountMap).filter(v => v != null);
      const estimatedMultiplier = avgMembers.length ? Math.round(avgMembers.reduce((s,v) => s+v, 0) / avgMembers.length) : 2;
      const estTeamMins    = myMins * estimatedMultiplier;
      const estTeamDollars = (parseFloat(myDollars) * estimatedMultiplier).toFixed(2);

      section.innerHTML = `
        <div style="margin-top:40px">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Team ROI</div>
          <div class="stats-chart-row">
            <div class="stats-chart-box" style="flex:1">
              ${teamCardHeader('Your Team Contribution', null)}
              <div style="display:flex;gap:16px;flex-wrap:wrap;padding:4px 0 8px">
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${myLaunches.toLocaleString()}</div><div class="stat-card-label">Your Launches</div></div>
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${myMins.toLocaleString()} min</div><div class="stat-card-label">Your Time Saved</div></div>
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${fmtUSD(myDollars)}</div><div class="stat-card-label">Your $ Saved</div></div>
              </div>
              <div style="margin-top:10px;font-size:0.8rem;color:var(--text-dim)">
                Active in: <span style="color:var(--text-muted);font-weight:600">${esc(teamNames)}</span>
              </div>
            </div>
            <div class="stats-chart-box" style="flex:1;background:linear-gradient(135deg,rgba(0,194,199,0.06),rgba(0,194,199,0.02));border:1px dashed rgba(0,194,199,0.3)">
              ${teamCardHeader('Estimated Team Total', null)}
              <div style="display:flex;gap:16px;flex-wrap:wrap;padding:4px 0 8px;opacity:0.6">
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">~${estTeamMins.toLocaleString()} min</div><div class="stat-card-label">Est. Team Time</div></div>
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">~${fmtUSD(estTeamDollars)}</div><div class="stat-card-label">Est. Team $</div></div>
              </div>
              <div style="margin-top:12px;font-size:0.8rem;color:var(--text-dim);line-height:1.5">
                Estimated based on your usage × ${estimatedMultiplier} members.
                Upgrade to see <strong style="color:var(--hover-accent)">real per-member stats</strong>.
              </div>
              <a href="https://jumpkit.app/#pricing" target="_blank" class="btn btn-primary" style="margin-top:14px;font-size:0.8rem;padding:7px 16px">
                <svg class="ti ti-lock" style="width:0.85rem;height:0.85rem;color:white;stroke:white"><use href="img/tabler-sprite.svg#tabler-lock"/></svg>
                Upgrade to Unlimited
              </a>
            </div>
          </div>
        </div>`;

    } else {
      // ── Unlimited: one card per owned team ──
      const { data: ownedTeams = [] } = await supabaseClient
        .from('teams').select('id, name').eq('owner_id', userId).order('name');

      if (ownedTeams.length === 0) {
        // Member-only — show personal contribution card
        section.innerHTML = `
          <div style="margin-top:40px">
            <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Team ROI</div>
            <div class="stats-chart-box">
              ${teamCardHeader('Your Team Contribution', null)}
              <div style="display:flex;gap:16px;flex-wrap:wrap;padding:4px 0 8px">
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${myLaunches.toLocaleString()}</div><div class="stat-card-label">Launches</div></div>
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${myMins.toLocaleString()} min</div><div class="stat-card-label">Time Saved</div></div>
                <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${fmtUSD(myDollars)}</div><div class="stat-card-label">$ Saved</div></div>
              </div>
              <div style="margin-top:8px;font-size:0.8rem;color:var(--text-dim)">You're a team member. Create your own team to see the full per-member ROI breakdown.</div>
            </div>
          </div>`;
        return;
      }

      const ownedTeamIds = ownedTeams.map(t => t.id);

      // Fetch member counts for header badges (parallel)
      const memberCountMap = {};
      await Promise.all(ownedTeams.map(async t => {
        const { count } = await supabaseClient.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', t.id);
        memberCountMap[t.id] = (count || 0) + 1; // +1 for owner
      }));

      // Fetch member_stats for all owned teams
      const { data: memberStats = [], error: msErr } = await supabaseClient
        .from('member_stats')
        .select('user_id, team_id, total_launches, total_seconds_saved, dollars_per_hour, updated_at')
        .in('team_id', ownedTeamIds);
      if (msErr) throw msErr;

      // Fetch profile names for all stat rows
      const statUserIds = [...new Set(memberStats.map(s => s.user_id))];
      let profileMap = {};
      if (statUserIds.length > 0) {
        const { data: profiles = [] } = await supabaseClient
          .from('profiles').select('id, first_name, last_name, email').in('id', statUserIds);
        profiles.forEach(p => { profileMap[p.id] = p; });
      }

      // ── One card per team ─────────────────────────────────────────────────
      const teamCards = ownedTeams.map(team => {
        const teamStats   = memberStats.filter(s => s.team_id === team.id);
        const memberCount = memberCountMap[team.id] ?? 0;

        // Empty-state card
        if (teamStats.length === 0) {
          return `
            <div class="stats-chart-box" style="margin-bottom:24px">
              ${teamCardHeader(team.name, memberCount)}
              <div style="font-size:0.85rem;color:var(--text-dim);padding:4px 0 8px">No usage data yet — members will sync stats after their next jump launch.</div>
            </div>`;
        }

        const totalL       = teamStats.reduce((s, r) => s + (r.total_launches || 0), 0);
        const totalSec     = teamStats.reduce((s, r) => s + (r.total_seconds_saved || 0), 0);
        const totalMins    = Math.round(totalSec / 60);
        const totalDollars = teamStats.reduce((s, r) => s + ((r.total_seconds_saved / 3600) * (r.dollars_per_hour || 50)), 0).toFixed(2);
        const activeCount  = teamStats.length;

        const memberRows = teamStats
          .sort((a, b) => b.total_launches - a.total_launches)
          .map((s, i, arr) => {
            const p        = profileMap[s.user_id];
            const name     = p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Member') : 'Member';
            const isMe     = s.user_id === userId;
            const mMins    = Math.round((s.total_seconds_saved || 0) / 60);
            const mDollar  = (((s.total_seconds_saved || 0) / 3600) * (s.dollars_per_hour || 50)).toFixed(2);
            const lastSeen = s.updated_at ? new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;${i < arr.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
                <span style="color:var(--text-dim);min-width:20px;font-size:0.75rem;text-align:right">${i + 1}</span>
                <span style="flex:1;min-width:0">
                  <span style="display:block;font-size:0.84rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:${isMe ? '700' : '400'}">${esc(name)}${isMe ? ` <span style="font-size:0.7rem;color:var(--hover-accent)">(you)</span>` : ''}</span>
                  ${lastSeen ? `<span style="display:block;font-size:0.7rem;color:var(--text-dim)">Last sync: ${lastSeen}</span>` : ''}
                </span>
                <span style="min-width:64px;text-align:right;font-size:0.84rem;font-weight:700;color:var(--hover-accent)">${(s.total_launches || 0).toLocaleString()}</span>
                <span style="min-width:72px;text-align:right;font-size:0.84rem;color:var(--text-muted)">${mMins.toLocaleString()} min</span>
                <span style="min-width:72px;text-align:right;font-size:0.84rem;color:var(--text-muted)">${fmtUSD(mDollar)}</span>
              </div>`;
          }).join('');

        const activeBadge = activeCount < memberCount
          ? ` &middot; <span style="color:var(--hover-accent)">${activeCount} active</span>`
          : '';

        return `
          <div class="stats-chart-box" style="margin-bottom:24px">
            ${teamCardHeader(team.name, memberCount, activeBadge)}
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
              <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${activeCount} / ${memberCount}</div><div class="stat-card-label">Members Active</div></div>
              <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${totalL.toLocaleString()}</div><div class="stat-card-label">Team Launches</div></div>
              <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${totalMins.toLocaleString()} min</div><div class="stat-card-label">Time Saved</div></div>
              <div class="stat-card" style="flex:1;min-width:90px"><div class="stat-card-value">${fmtUSD(totalDollars)}</div><div class="stat-card-label">$ Saved</div></div>
            </div>
            <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;display:flex;gap:10px;padding:0 4px 6px;border-bottom:1px solid var(--border)">
              <span style="min-width:20px"></span>
              <span style="flex:1">Member</span>
              <span style="min-width:64px;text-align:right">Launches</span>
              <span style="min-width:72px;text-align:right">Time</span>
              <span style="min-width:72px;text-align:right">$ Saved</span>
            </div>
            ${memberRows}
            <div style="display:flex;align-items:center;gap:10px;padding:9px 4px 2px;border-top:2px solid var(--border);margin-top:2px">
              <span style="min-width:20px"></span>
              <span style="flex:1;font-size:0.84rem;font-weight:700;color:var(--text-muted)">Team Total</span>
              <span style="min-width:64px;text-align:right;font-size:0.84rem;font-weight:700;color:var(--hover-accent)">${totalL.toLocaleString()}</span>
              <span style="min-width:72px;text-align:right;font-size:0.84rem;font-weight:700;color:var(--text-muted)">${totalMins.toLocaleString()} min</span>
              <span style="min-width:72px;text-align:right;font-size:0.84rem;font-weight:700;color:var(--text-muted)">${fmtUSD(totalDollars)}</span>
            </div>
          </div>`;
      }).join('');

      section.innerHTML = `
        <div style="margin-top:40px">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Team ROI</div>
          ${teamCards}
        </div>`;
    }
  } catch (err) {
    console.warn('[renderTeamROISection] error:', err.message);
    section.remove();
  }
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

// ── Password reveal toggle (auto-wires all type=password inputs) ──
function wirePasswordToggles(root = document) {
  root.querySelectorAll('input[type="password"]:not([data-pw-wired])').forEach(input => {
    input.setAttribute('data-pw-wired', '1');
    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.setAttribute('tabindex', '-1');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
    wrap.appendChild(btn);
  });
}
// Modal password toggle wiring - patched after Modal is initialized
function patchModalForPwToggles() {
  if (typeof Modal === 'undefined' || !Modal?.open) return;
  const _origOpen = Modal.open.bind(Modal);
  Modal.open = function(...args) {
    const result = _origOpen(...args);
    setTimeout(() => wirePasswordToggles(document.getElementById('modalBody') || document), 50);
    return result;
  };
}

// ── Paywall ───────────────────────────────────────────────────────
const LS_CHECKOUT_URL = 'https://jumpkit.lemonsqueezy.com/checkout/buy/81c37b98-510a-4ca9-9849-06f10fd3a8d0';
const CTA_ICON_SVG = '<svg class="jump-cta-icon" viewBox="0 0 105.74 122.88" aria-hidden="true"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31-0.83-1.07-1.31-1.7-1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66-0.15,1.03-0.97,0.83-1.83c-0.19-0.86-0.88-1.44-1.54-1.29L22.26,22.99z"/></path></svg>';

function buildUnlockButton(label = 'Upgrade to Unlimited', opts = {}) {
  const extraClass = opts.extraClass || '';
  let btnStyle = '';
  let spanStyle = '';
  if (opts.width && opts.width !== 'auto') btnStyle += `width:${opts.width};`;
  if (opts.padding) btnStyle += `padding:${opts.padding};`;
  if (opts.fontSize) spanStyle += `font-size:${opts.fontSize};`;
  return `<button class="btn btn-primary unlock-btn ${extraClass}" style="${btnStyle}" data-jaction="open-url" data-url="${LS_CHECKOUT_URL}"><svg class="ti ti-lock" style="width:1.1rem;height:1.1rem;flex-shrink:0;color:white;stroke:white" aria-hidden="true"><use href="img/tabler-sprite.svg#tabler-lock"/></svg><span style="${spanStyle}">${label}</span></button>`;
}

// ── Paywall event tracking ────────────────────────────────────────────────────────────────
window.trackPaywallEvent = async function trackPaywallEvent(type) {
  try {
    const res = await supabaseClient.auth.getSession();
    const userId = res?.data?.session?.user?.id;
    if (!userId) return;
    await supabaseClient.from('paywall_events').insert({ user_id: userId, paywall_type: type });
  } catch (_) {}
};

window.showUpgradeModal = function(title, message) {
  trackPaywallEvent('upgrade_modal').catch(()=>{});
  const body = `<p style="color:var(--text-muted);font-size:0.95rem;line-height:1.7">${message}</p>`;
  const footer = `
    <button class="btn btn-subtle" data-jaction="modal-close">
      <svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Not Now
    </button>
    <button class="btn btn-primary" data-jaction="open-url-close" data-url="${LS_CHECKOUT_URL}" style="background:linear-gradient(135deg,#50CACC,#1A4FD6)">
      <svg class="ti ti-lock" style="width:1.1rem;height:1.1rem;flex-shrink:0;color:white;stroke:white"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> Upgrade to Unlimited
    </button>`;
  Modal.open(`<svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> ${title}`, body, footer, 'sm');
};

window.showPaywall = function() {
  trackPaywallEvent('launch_limit').catch(()=>{});
  const body = `
    <div style="text-align:center;padding:16px 0">
      <h3 style="font-size:1.2rem;font-weight:800;margin-bottom:10px">Your free trial has ended</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:24px;line-height:1.6">
        You've used all 250 free launches.<br>Upgrade to JumpKit Unlimited for unlimited launches, unlimited teams, members &amp; jumps.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto">
        <button class="btn btn-primary" data-jaction="open-url-close" data-url="${LS_CHECKOUT_URL}" style="padding:14px;font-size:1rem;font-weight:700;background:linear-gradient(135deg,#50CACC,#1A4FD6)">
          <svg class="ti ti-lock" style="width:1.1rem;height:1.1rem;flex-shrink:0;color:white;stroke:white"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> Upgrade to Unlimited
        </button>
        <button class="btn btn-ghost" data-jaction="modal-close" style="padding:10px;font-size:0.82rem;color:var(--text-muted)">
          Maybe later
        </button>
      </div>
    </div>
  `;
  Modal.open('<svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> Jump Launch Limit Reached', body, '', { closeable: false });
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
  notifs.unshift({ ...notif, id: Date.now().toString(36) + Math.random().toString(36).slice(2), read: false });
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
  const total = getNotifications().length;
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  // Remove existing badge
  btn.querySelector('.notif-badge')?.remove();
  if (total > 0) {
    const badge = document.createElement('span');
    badge.className = 'notif-badge';
    badge.textContent = total > 99 ? '99+' : total;
    btn.appendChild(badge);
  }
};

// ── Auto Archive ──────────────────────────────────────────────────
window.runAutoArchive = function runAutoArchive() {
  const _autoArchiveTier = window._supabaseProfile?.subscription_tier || 'free';
  if (_autoArchiveTier === 'free') return; // auto-archive is Unlimited only
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
function _stripInternalFields(arr) {
  return arr.map(({ userId: _u, supabaseId: _s, sharedTeams: _t, ...rest }) => rest);
}

window.forceBackup = async function forceBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId: currentUser.id,
    email: currentUser.email,
    jumps:   _stripInternalFields(DB.getJumps(currentUser.id)),
    columns: _stripInternalFields(DB.getColumns(currentUser.id)),
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
        `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Got it</button>`
      );
    } else if (result?.reason !== 'canceled') {
      addNotification({ type: 'backup-failed', message: `Backup failed: ${result?.reason || 'Unknown error'}`, ts: Date.now() });
      Modal.open('<svg class="ti ti-alert-circle" style="color:#ef4444"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg> Backup Failed',
        `<p style="color:var(--text-muted);font-size:0.9rem">${esc(result?.reason || 'Unknown error')}</p>`,
        `<button class="btn btn-subtle" data-jaction="modal-close">Close</button>`
      );
    }
  } else {
    Toast.danger('Backup not available in browser mode');
  }
};

window.runCloudBackup = async function runCloudBackup() {
  const _backupTier = window._supabaseProfile?.subscription_tier || 'free';
  if (_backupTier === 'free') return; // auto-backup is Unlimited only
  const prefs = DB.getPrefs(currentUser.id);
  if (!prefs.cloudBackup) return;

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId: currentUser.id,
    email: currentUser.email,
    jumps:   _stripInternalFields(DB.getJumps(currentUser.id)),
    columns: _stripInternalFields(DB.getColumns(currentUser.id)),
    prefs:   prefs,
  };

  if (window.electronAPI?.saveBackup) {
    const result = await window.electronAPI.saveBackup(JSON.stringify(backup, null, 2));
    if (result?.ok) {
      addNotification({ type: 'backup', message: `Backup saved to: ${result.path}`, ts: Date.now() });
    } else {
      addNotification({ type: 'backup-failed', message: `Auto-backup failed: ${result?.reason || 'Unknown error'}`, ts: Date.now() });
    }
  }
};

window.checkPendingInvites = async function checkPendingInvites() {
  try {
    if (!window._supabaseUser) return;
    const email = window._supabaseUser.email;

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

    // Notify once per invite (deduplicated by invite ID)
    const notifiedInviteIds = JSON.parse(localStorage.getItem('jk_notified_invite_ids') || '[]');
    const newInvites = invites.filter(inv => !notifiedInviteIds.includes(inv.id));
    if (newInvites.length > 0) {
      const newTeamNames = newInvites.map(inv => inv.teams?.name || 'a team').join(', ');
      addNotification({ type: 'invite-received', message: `You've been invited to join: ${newTeamNames}`, ts: Date.now() });
      const updatedIds = [...notifiedInviteIds, ...newInvites.map(inv => inv.id)].slice(-50);
      localStorage.setItem('jk_notified_invite_ids', JSON.stringify(updatedIds));
    }

    const teamNames = invites.map(inv => inv.teams?.name || 'a team').join(', ');
    const body = `
      <div style="text-align:center;padding:8px 0">
        <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:10px">You have a team invitation!</h3>
        <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.6;margin-bottom:0">
          You've been invited to join <strong>${esc(teamNames)}</strong>.<br>
          Go to your <strong>Teams</strong> page to join your team.
        </p>
      </div>`;

    Modal.open('<svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Team Invitation', body,
      `<button class="btn btn-subtle" data-jaction="modal-close">Later</button>
       <button class="btn btn-primary" data-jaction="nav-teams-close"><svg class="ti ti-users" style="color:white"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Go to Teams</button>`
    );
  } catch(e) {
    console.warn('[checkPendingInvites]', e.message);
  }
};

// ── Upgrade Handler ──────────────────────────────────────────────
window.checkAndHandleUpgrade = function checkAndHandleUpgrade(tier) {
  try {
    const features = [
      'Unlimited jump launches',
      'Unlimited teams, members &amp; jumps',
      'Personal &amp; team ROI dashboard',
      'Auto-archive &amp; auto-backup',
      'Early access to new features',
    ];

    const featureRows = features.map(f => `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0">
        <span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#50CACC,#1A4FD6);flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span style="font-size:0.88rem;color:var(--text-muted);font-weight:500">${f}</span>
      </div>`).join('');

    const body = `
      <div>
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:20px;padding:16px 18px;background:linear-gradient(135deg,rgba(80,202,204,0.12),rgba(26,79,214,0.12));border:1px solid rgba(80,202,204,0.25);border-radius:10px">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#50CACC,#1A4FD6);flex-shrink:0;box-shadow:0 3px 14px rgba(80,202,204,0.3)">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </span>
          <p style="margin:0;font-size:0.875rem;color:var(--text-muted);line-height:1.4">Your account has been upgraded to <strong style="color:var(--text)">JumpKit Unlimited</strong>. Here's what you now have:</p>
        </div>
        <div style="padding:0 4px">
          ${featureRows}
        </div>
      </div>`;

    Modal.open(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem;vertical-align:-0.18em;margin-right:5px;color:#50CACC"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Welcome to JumpKit Unlimited!`,
      body,
      `<button class="btn btn-primary" data-jaction="modal-close" style="background:linear-gradient(135deg,#50CACC,#1A4FD6);border:none;padding:9px 28px;font-size:0.9rem;font-weight:600;width:100%">Let's Go &#8594;</button>`,
      'md'
    );
  } catch(e) {
    console.warn('[checkAndHandleUpgrade]', e.message);
  }
};

// ── Downgrade Handler ─────────────────────────────────────────────
window.checkAndHandleDowngrade = async function checkAndHandleDowngrade() {
  try {
    if (!window._supabaseUser || !currentUser) return;
    const userId = _supabaseUser.id;
    const localUserId = currentUser.id;
    let allCols = DB.getColumns(localUserId);
    let allJumps = DB.getActiveJumps(localUserId);

    // 1. Get all teams owned by user, sorted by created_at ascending
    const { data: ownedTeams = [], error: teamsErr } = await supabaseClient
      .from('teams')
      .select('id, name, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });

    const pruneLines = [];

    // 2. Keep earliest team, unshare all others
    if (ownedTeams.length > 1) {
      const keepTeam = ownedTeams[0];
      const pruneTeams = ownedTeams.slice(1);
      for (const t of pruneTeams) {
        // Remove shared columns for this team from Supabase
        await supabaseClient.from('shared_columns').delete().eq('team_id', t.id);
        // Remove shared jumps for this team from Supabase
        await supabaseClient.from('shared_jumps').delete().eq('team_id', t.id);
      }
      // Update local columns - unshare any belonging to pruned teams
      const pruneTeamIds = new Set(pruneTeams.map(t => t.id));
      const updatedCols = allCols.map(c =>
        c.isShared && pruneTeamIds.has(c.teamId)
          ? { ...c, isShared: 0, teamId: null, supabaseId: null }
          : c
      );
      DB.saveColumns(localUserId, updatedCols);
      allCols = updatedCols;
      // Unshare local jumps for pruned teams
      const jumpsBefore = DB.getJumps(localUserId);
      jumpsBefore.filter(j => j.isShared && pruneTeamIds.has(j.teamId))
        .forEach(j => DB.updateJump(localUserId, j.id, { isShared: 0, teamId: null }));
      allJumps = DB.getActiveJumps(localUserId);

      const prunedNames = pruneTeams.map(t => `<strong>${esc(t.name)}</strong>`).join(', ');
      pruneLines.push(`Sharing was removed from ${prunedNames}. Only your earliest team <strong>${esc(keepTeam.name)}</strong> remains shared.`);
    }

    if (ownedTeams.length > 0 && !pruneLines.some(l => l.includes('first created team'))) {
      const keepTeam = ownedTeams[0];
      pruneLines.push(`Free tier keeps only your earliest created team <strong>${esc(keepTeam.name || 'your team')}</strong>. All your other teams are saved but no longer activated. Reactivate them and create new teams after you upgrade to Core.`);
    }

    // 3. Check all remaining shared columns for >10 visible jumps (members capped at 10)
    const sharedColsRemaining = allCols.filter(c => c.isShared && c.teamId);
    if (sharedColsRemaining.length > 0) {
      let sharedWarning = false;
      for (const col of sharedColsRemaining) {
        const colJumps = allJumps.filter(j => j.columnId === col.id);
        if (colJumps.length > 10) {
          let teamName = ownedTeams.find(t => t.id === col.teamId)?.name;
          if (!teamName && col.teamId) {
            const { data: tRow } = await supabaseClient.from('teams').select('name').eq('id', col.teamId).single();
            teamName = tRow?.name || 'your team';
          }
          teamName = teamName || 'your team';
          pruneLines.push(`Within your <strong>${esc(teamName)}</strong> team, the shared column <strong>${esc(col.name)}</strong> now caps members at 10 visible jumps until you reactivate Core.`);
          sharedWarning = true;
        }
      }
      if (!sharedWarning && sharedColsRemaining.length > 0) {
        const col = sharedColsRemaining[0];
        let teamName = ownedTeams.find(t => t.id === col.teamId)?.name;
        if (!teamName && col.teamId) {
          const { data: tRow } = await supabaseClient.from('teams').select('name').eq('id', col.teamId).single();
          teamName = tRow?.name || 'your team';
        }
        teamName = teamName || 'your team';
        pruneLines.push(`Within your <strong>${esc(teamName)}</strong> team, the shared column <strong>${esc(col.name)}</strong> now caps members at 10 visible jumps until you reactivate Core.`);
      }
    }

    // 4. Show downgrade modal
    const launchesUsed = window._supabaseProfile?.trial_launches_used || 0;
    const launchesRemaining = Math.max(250 - launchesUsed, 0);
    pruneLines.unshift(`Free tier is limited to <strong>250 lifetime launches</strong>. You have <strong>${launchesRemaining}</strong> launches remaining.`);
    const hasChanges = pruneLines.length > 0;
    const changesList = hasChanges
      ? `<ul style="text-align:left;margin:12px 0;padding-left:20px;font-size:0.9rem;color:var(--text-muted);line-height:1.85">${pruneLines.map(l => `<li style="margin:6px 0">${l}</li>`).join('')}</ul>`
      : `<p style="font-size:0.9rem;color:var(--text-muted);margin:12px 0">No immediate changes were required on your account.</p>`;

    const body = `
      <div style="padding:10px 0 6px;font-size:0.9rem;line-height:1.6;color:var(--text-muted);text-align:left">
        <div style="text-align:center;margin:0 auto 20px;color:var(--text)">
          <span style="display:inline-flex;align-items:center;gap:8px;font-weight:600"><span style="font-size:1.3rem">⚠️</span>Your JumpKit Unlimited subscription has ended.</span>
        </div>
        <p style="margin:12px 0">Your account has been moved to the free tier.${hasChanges ? ' The following changes were made:' : ''}</p>
        ${changesList}
        <p style="margin:12px 0">Reactivate JumpKit Unlimited to restore unlimited launches, unlimited teams, members &amp; jumps, and your team ROI dashboard.</p>
      </div>`;

    const upgradeBtn = `
      <button class="btn btn-primary" style="background:linear-gradient(135deg,#50CACC,#1A4FD6)" data-jaction="open-url-close" data-url="${LS_CHECKOUT_URL}">
        <svg class="ti ti-lock" style="width:1.1rem;height:1.1rem;flex-shrink:0;color:white;stroke:white"><use href="img/tabler-sprite.svg#tabler-lock"/></svg>
        Upgrade to Unlimited
      </button>`;

    // Only show once per 24h — don't nag on every login
    const _downgradeNotifKey = `jk_downgrade_notif_${currentUser.id}`;
    const _lastDowngradeTs = parseInt(localStorage.getItem(_downgradeNotifKey) || '0');
    if (Date.now() - _lastDowngradeTs > 24 * 60 * 60 * 1000) {
      localStorage.setItem(_downgradeNotifKey, Date.now().toString());
      Modal.open('<svg class="ti ti-alert-triangle" style="color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg> Subscription Ended', body,
        `<button class="btn btn-subtle" data-jaction="modal-close">OK</button>
         ${upgradeBtn.replace('Unlock JumpKit Unlimited', 'Reactivate JumpKit Unlimited')}`,
        'lg'
      );
    }

    if (typeof renderColumns === 'function') renderColumns();
  } catch(e) {
    console.warn('[checkAndHandleDowngrade]', e.message);
  }
};

// ── Boot ───────────────────────────────────────────────────────────
initAuth();

// ── Tier Features Modal ──────────────────────────────────────────
function openTierFeaturesModal() {
  const tier = window._supabaseProfile?.subscription_tier || 'free';
  const isCore = tier === 'core' || tier === 'teams_jet';
  const tierLabel = isCore ? 'JumpKit Unlimited' : 'JumpKit Free';

  const freeFeatures = [
    'Web links &amp; local folders',
    '250 jump launches',
    '2 teams · 5 members · 10 jumps / team',
    'Personal ROI dashboard',
    'Hotkey launcher',
    'Filters &amp; search',
    'Windows &amp; Mac',
  ];
  const coreFeatures = [
    'Everything in JumpKit Free',
    'Unlimited jump launches',
    'Unlimited teams, members &amp; jumps',
    'Personal &amp; team ROI dashboard',
    'Auto-archive',
    'Auto-backup',
    'Early access to new features',
  ];
  const features = isCore ? coreFeatures : freeFeatures;
  const color = isCore ? 'var(--turq)' : 'var(--text-muted)';

  const body = `
    <div style="padding:6px 0">
      <p style="font-size:0.88rem;color:var(--text-muted);margin:0 0 16px">Your current plan: <strong style="color:${color}">${tierLabel}</strong></p>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px">
        ${features.map(f => `
          <li style="display:flex;align-items:flex-start;gap:10px;font-size:0.9rem;color:var(--text-muted)">
            <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:1rem;height:1rem;flex-shrink:0;margin-top:2px"><polyline points="20 6 9 17 4 12"/></svg>
            ${f}
          </li>`).join('')}
      </ul>
      ${!isCore ? `<div style="margin-top:20px;padding:12px 14px;background:rgba(0,194,199,0.07);border:1px solid rgba(0,194,199,0.2);border-radius:8px;font-size:0.84rem;color:var(--turq);line-height:1.5">
        <strong>Upgrade to JumpKit Unlimited</strong> for unlimited launches, teams, and shared jumps.
      </div>` : ''}
    </div>`;

  const footer = isCore
    ? `<button class="btn btn-subtle" data-jaction="modal-close">Close</button>`
    : `<button class="btn btn-subtle" data-jaction="modal-close">Close</button>
       ${buildUnlockButton('Upgrade to Unlimited', {})}`;

  Modal.open(`<svg class="ti ti-sparkles"><use href="img/tabler-sprite.svg#tabler-sparkles"/></svg> ${tierLabel} Features`, body, footer, 'sm');
}

// ── Admin Dashboard ────────────────────────────────────────────────
window.renderAdmin = async function renderAdmin() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  // Gate to admin only
  if (window._supabaseProfile?.role !== 'admin') {
    content.innerHTML = '<div style="padding:32px;color:var(--text-dim)">Access denied.</div>';
    return;
  }

  content.innerHTML = `
    <div style="padding:24px 28px;max-width:1200px">
      <div id="adminDash" style="color:var(--text-dim);font-size:0.9rem">Loading…</div>
    </div>`;

  try {
    // Ensure Chart.js is loaded
    if (typeof Chart === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/chart.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load chart.min.js'));
        document.head.appendChild(s);
      });
    }

    const [summaryRes, usersRes, growthRes] = await Promise.all([
      supabaseClient.rpc('get_admin_summary'),
      supabaseClient.rpc('get_admin_user_stats'),
      supabaseClient.rpc('get_admin_growth_stats'),
    ]);

    if (summaryRes.error) throw new Error('get_admin_summary: ' + summaryRes.error.message);
    if (usersRes.error) throw new Error('get_admin_user_stats: ' + usersRes.error.message);
    // growth errors are non-fatal

    const s = summaryRes.data || {};
    const users = usersRes.data || [];
    const g = growthRes.data || {};
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const fmtLaunches = (u) => {
      if ((u.subscription_tier === 'core' || u.subscription_tier === 'teams_jet') && u.subscription_status === 'active') return '∞';
      const used = u.personal_launches_total || 0;
      return `${used} / 250`;
    };

    const buildAdminRow = (u) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '—';
      const isAdminU    = u.user_role === 'admin';
      const isUnlimitedU = !isAdminU && (u.subscription_tier === 'core' || u.subscription_tier === 'teams_jet') && u.subscription_status === 'active';
      const isCancelledU = !isAdminU && u.subscription_status === 'cancelled';
      const sub       = isAdminU ? 'Admin' : isUnlimitedU ? 'Unlimited' : isCancelledU ? 'Cancelled' : 'Free';
      const pillBg    = isAdminU ? 'rgba(0,194,199,0.12)' : isUnlimitedU ? 'rgba(72,187,120,0.12)' : isCancelledU ? 'rgba(229,62,62,0.12)' : 'rgba(128,128,128,0.12)';
      const pillColor = isAdminU ? '#00C2C7' : isUnlimitedU ? '#48BB78' : isCancelledU ? '#e53e3e' : 'var(--text-dim)';
      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted)">${esc(name)}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-dim)">${esc(u.email || '—')}</td>
          <td style="padding:9px 12px;font-size:0.82rem"><span style="background:${pillBg};color:${pillColor};font-weight:600;font-size:0.75rem;padding:3px 9px;border-radius:20px;white-space:nowrap">${sub}</span></td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${fmtLaunches(u)}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${u.teams_owned || 0}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${u.teams_joined || 0}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${u.total_paywall_hits || 0}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-dim)">${fmtDate(u.last_active_at)}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-dim)">${fmtDate(u.created_at)}</td>
        </tr>`;
    };
    const userRows = users.map(buildAdminRow).join('');

    // Growth tile helper
    const growthTile = (label, data) => {
      const d = data || {};
      const total = d.total || 0;
      const tileBg = total > 0 ? 'rgba(72,187,120,0.07)' : total < 0 ? 'rgba(229,62,62,0.07)' : 'rgba(128,128,128,0.06)';
      return `<div class="stats-chart-box" style="min-height:unset;flex:1;background:${tileBg}">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">${label}</div>
        <div style="font-size:1.6rem;font-weight:900;color:${total > 0 ? '#48BB78' : total < 0 ? '#e53e3e' : 'var(--text-muted)'};line-height:1">+${total.toLocaleString()}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px">total</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">
          <div><div style="font-size:1rem;font-weight:700;color:#48BB78">${(d.unlimited||0).toLocaleString()}</div><div style="font-size:0.7rem;color:#48BB78">unlimited</div></div>
          <div><div style="font-size:1rem;font-weight:700;color:var(--text-dim)">${(d.free||0).toLocaleString()}</div><div style="font-size:0.7rem;color:var(--text-dim)">free</div></div>
          <div><div style="font-size:1rem;font-weight:700;color:#e53e3e">${(d.cancelled||0).toLocaleString()}</div><div style="font-size:0.7rem;color:#e53e3e">cancelled</div></div>
        </div>
      </div>`;
    };

    // Chart data
    const chartRows = Array.isArray(g.chart) ? g.chart : [];
    const chartLabels = chartRows.map(r => r.day ? r.day.slice(5) : ''); // MM-DD
    const chartData   = chartRows.map(r => r.cumulative || 0);

    document.getElementById('adminDash').innerHTML = `
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Total Users</div>
      <div class="stats-cards" style="grid-template-columns:repeat(5,1fr);margin-bottom:24px">
        <div class="stat-card" style="background:rgba(128,128,128,0.06)"><div class="stat-card-value" style="color:var(--text-muted)">${(s.total_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:var(--text-muted)">Total Users</div></div>
        <div class="stat-card" style="background:rgba(72,187,120,0.07)"><div class="stat-card-value" style="color:#48BB78">${(s.unlimited_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:#48BB78">Unlimited</div></div>
        <div class="stat-card" style="background:rgba(128,128,128,0.06)"><div class="stat-card-value" style="color:var(--text-dim)">${(s.free_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:var(--text-dim)">Free</div></div>
        <div class="stat-card" style="background:rgba(229,62,62,0.07)"><div class="stat-card-value" style="color:#e53e3e">${(s.cancelled_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:#e53e3e">Cancelled</div></div>
        <div class="stat-card" style="background:rgba(0,194,199,0.07)"><div class="stat-card-value" style="color:#00C2C7">${(s.admin_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:#00C2C7">Admins</div></div>
      </div>
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Incremental Users</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px">
        ${growthTile('Today', g.today)}
        ${growthTile('This Week', g.week)}
        ${growthTile('This Month', g.month)}
        ${growthTile('This Year', g.year)}
      </div>
      <div class="stats-chart-box full" style="margin-bottom:24px">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Total Users — Last 90 Days</div>
        <div style="height:180px"><canvas id="adminUserChart"></canvas></div>
      </div>
      <div class="stats-chart-box" style="min-height:unset;overflow-x:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">All Users</div>
          <div class="jump-search-wrap">
            <svg class="ti ti-search jump-search-icon"><use href="img/tabler-sprite.svg#tabler-search"/></svg>
            <input id="adminSearch" type="text" placeholder="Search users..." class="jump-search-input" style="width:200px" />
          </div>
        </div>
        <table id="adminUserTable" style="width:100%;border-collapse:collapse;min-width:700px">
          <thead>
            <tr style="border-bottom:2px solid var(--border)">
              <th data-col="name" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">User<span class="sort-ind"> ↕</span></th>
              <th data-col="email" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Email<span class="sort-ind"> ↕</span></th>
              <th data-col="sub" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Subscription<span class="sort-ind"> ↕</span></th>
              <th data-col="personal_launches_total" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Launches<span class="sort-ind"> ↕</span></th>
              <th data-col="teams_owned" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Teams Owned<span class="sort-ind"> ↕</span></th>
              <th data-col="teams_joined" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Teams Joined<span class="sort-ind"> ↕</span></th>
              <th data-col="total_paywall_hits" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Paywall Hits<span class="sort-ind"> ↕</span></th>
              <th data-col="last_active_at" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Last Active<span class="sort-ind"> ↕</span></th>
              <th data-col="created_at" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Joined<span class="sort-ind"> ↕</span></th>
            </tr>
          </thead>
          <tbody id="adminUserTbody">${userRows}</tbody>
        </table>
      </div>`;

    // Render chart + wire sort/search
    requestAnimationFrame(() => {
      // Chart
      if (growthRes.error) console.warn('[adminChart] growth stats error:', growthRes.error.message);
      if (typeof Chart !== 'undefined') {
        const dark = document.documentElement.dataset.theme === 'dark';
        const tc = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.50)';
        const gc = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        const el = document.getElementById('adminUserChart');
        if (el) new Chart(el, {
          type: 'line',
          data: { labels: chartLabels, datasets: [{ data: chartData, borderColor: '#00C2C7', backgroundColor: 'rgba(0,194,199,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: tc, font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: gc } }, y: { ticks: { color: tc, font: { size: 11 } }, grid: { color: gc }, beginAtZero: false } } },
        });
      }
      // Sort + search
      let _sortCol = 'created_at', _sortDir = -1, _searchQ = '';
      const _getVal = (u, col) => {
        if (col === 'name') return ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '').toLowerCase();
        if (col === 'sub') return (u.user_role === 'admin' ? '0admin' : (u.subscription_tier === 'core' || u.subscription_tier === 'teams_jet') && u.subscription_status === 'active' ? '1unlimited' : u.subscription_status === 'cancelled' ? '3cancelled' : '2free');
        if (col === 'email') return (u.email || '').toLowerCase();
        return u[col] ?? '';
      };
      const _rerender = () => {
        let data = [...users];
        if (_searchQ) { const q = _searchQ.toLowerCase(); data = data.filter(u => ([u.first_name, u.last_name].filter(Boolean).join(' ') + ' ' + (u.email || '')).toLowerCase().includes(q)); }
        data.sort((a, b) => { const va = _getVal(a, _sortCol), vb = _getVal(b, _sortCol); return va < vb ? _sortDir : va > vb ? -_sortDir : 0; });
        const tbody = document.getElementById('adminUserTbody');
        if (tbody) tbody.innerHTML = data.map(buildAdminRow).join('') || `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text-dim)">No matches.</td></tr>`;
        document.querySelectorAll('#adminUserTable th[data-col]').forEach(th => {
          const ind = th.querySelector('.sort-ind');
          if (ind) ind.textContent = th.dataset.col === _sortCol ? (_sortDir === -1 ? ' ▼' : ' ▲') : ' ↕';
        });
      };
      document.querySelectorAll('#adminUserTable th[data-col]').forEach(th => {
        th.addEventListener('click', () => { if (_sortCol === th.dataset.col) _sortDir *= -1; else { _sortCol = th.dataset.col; _sortDir = -1; } _rerender(); });
      });
      const searchEl = document.getElementById('adminSearch');
      if (searchEl) searchEl.addEventListener('input', e => { _searchQ = e.target.value; _rerender(); });
    });

  } catch (err) {
    const dash = document.getElementById('adminDash');
    if (dash) dash.innerHTML = `<div style="color:var(--text-dim);padding:16px">Failed to load admin data: ${err.message}</div>`;
  }
};

// ── Event delegation - app-level actions ───────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-jaction]');
  if (!btn) return;
  switch (btn.dataset.jaction) {
    case 'notif-mark-read':    markAllNotificationsRead(); Modal.close(); break;
    case 'notif-clear': {
      clearAllNotifications();
      updateNotifBadge();
      document.getElementById('modalBody').innerHTML   = window._notifEmptyHTML();
      document.getElementById('modalFooter').innerHTML = `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>`;
      const _lbl = document.getElementById('notifCountLabel');
      if (_lbl) _lbl.remove();
      break;
    }
    case 'open-feedback-modal': openFeedbackModal(); break;
    case 'open-tier-features':  openTierFeaturesModal(); break;
    case 'nav-stats':           navigateTo('stats'); break;
    case 'nav-teams':           navigateTo('teams'); break;
    case 'force-backup':       forceBackup(); break;
    case 'save-account-prefs': saveAccountPrefs(); break;
    case 'submit-feedback':    submitFeedback(); break;
    case 'nav-teams-close':    navigateTo('teams'); Modal.close(); break;
    case 'open-url':
      if (window.electronAPI) window.electronAPI.openUrl(btn.dataset.url);
      break;
    case 'open-url-close':
      if (window.electronAPI) window.electronAPI.openUrl(btn.dataset.url);
      Modal.close();
      break;
    case 'export-stats-pdf': exportStatsPDF(); break;
    case 'show-upgrade-modal': showUpgradeModal(btn.dataset.title || 'Upgrade', btn.dataset.msg || ''); break;
    case 'show-teams-tips':  if (typeof showTeamsTipsModal === 'function') showTeamsTipsModal(); break;
    case 'teams-tips-close': { const _o = document.getElementById('teamsTipsOverlay'); if (_o) _o.remove(); break; }
    case 'modal-close':    Modal.close(); break;
    case 'notif-dismiss': {
      const id = btn.dataset.id;
      if (!id) break;
      saveNotifications(getNotifications().filter(n => n.id !== id));
      updateNotifBadge();
      const item = document.querySelector(`.notif-item[data-id="${id}"]`);
      if (item) {
        const prev = item.previousElementSibling;
        if (prev && prev.classList.contains('notif-divider')) prev.remove();
        else { const next = item.nextElementSibling; if (next && next.classList.contains('notif-divider')) next.remove(); }
        item.remove();
      }
      const remaining = document.querySelectorAll('.notif-item').length;
      if (remaining === 0) {
        document.getElementById('modalBody').innerHTML   = _notifEmptyHTML();
        document.getElementById('modalFooter').innerHTML = `<button class="btn btn-subtle" data-jaction="modal-close">${notifIcon('tabler-x')} Close</button>`;
        const lbl = document.getElementById('notifCountLabel');
        if (lbl) lbl.remove();
      } else {
        const lbl = document.getElementById('notifCountLabel');
        if (lbl) lbl.textContent = `(${remaining} open)`;
      }
      break;
    }
  }
});
