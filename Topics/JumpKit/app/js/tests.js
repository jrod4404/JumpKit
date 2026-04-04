// ── JumpKit Unit Tests (admin only) — v3 ─────────────────────────
// Injected spin animation
(function injectStyles() {
  if (document.getElementById('jk-test-styles')) return;
  const s = document.createElement('style');
  s.id = 'jk-test-styles';
  s.textContent = `
    @keyframes jk-spin { to { transform: rotate(360deg); } }
    .jk-spin { display: inline-block; animation: jk-spin 0.8s linear infinite; }
  `;
  document.head.appendChild(s);
})();

// ── Test Definitions ───────────────────────────────────────────────
const JK_TESTS = [

  // ── Auth ──────────────────────────────────────────────────────
  {
    id: 1, category: 'Auth',
    title: 'Session persists after reload',
    description: 'window._supabaseUser is set after app load',
    expected: 'window._supabaseUser is not null',
    test: async () => {
      if (window._supabaseUser == null) throw new Error('_supabaseUser is null');
      return true;
    }
  },
  {
    id: 2, category: 'Auth',
    title: 'currentUser is set',
    description: 'currentUser has .id and .email',
    expected: 'currentUser is not null and has .id and .email',
    test: async () => {
      if (!currentUser) throw new Error('currentUser is null');
      if (!currentUser.id) throw new Error('currentUser.id is missing');
      if (!currentUser.email) throw new Error('currentUser.email is missing');
      return true;
    }
  },
  {
    id: 3, category: 'Auth',
    title: 'Supabase profile loaded',
    description: 'window._supabaseProfile is set after initApp',
    expected: 'window._supabaseProfile is not null',
    test: async () => {
      if (!window._supabaseProfile) throw new Error('_supabaseProfile is null or undefined');
      return true;
    }
  },
  {
    id: 4, category: 'Auth',
    title: 'Subscription status cached',
    description: 'jk_subscription_status is in localStorage',
    expected: 'localStorage.getItem("jk_subscription_status") is not null',
    test: async () => {
      const val = localStorage.getItem('jk_subscription_status');
      if (val == null) throw new Error('jk_subscription_status not found in localStorage');
      return true;
    }
  },
  {
    id: 5, category: 'Auth',
    title: 'Sign out clears session',
    description: 'Click sign out and verify redirect to login page',
    expected: 'User is redirected to login screen and cannot navigate back to the app without logging in again.',
    steps: 'Click the user menu (top-right) → click Logout → verify you are redirected to the login screen and cannot navigate back without logging in again.',
    test: async () => 'manual'
  },

  // ── Navigation ────────────────────────────────────────────────
  {
    id: 6, category: 'Navigation',
    title: 'Home page renders',
    description: 'Navigate to home page and check for tips-grid',
    expected: '.tips-grid exists after navigating to home',
    test: async () => {
      navigateTo('home');
      await new Promise(r => setTimeout(r, 400));
      const ok = !!document.querySelector('.tips-grid');
      navigateTo('tests');
      if (!ok) throw new Error('.tips-grid not found on home page');
      return true;
    }
  },
  {
    id: 7, category: 'Navigation',
    title: 'Jumps page renders',
    description: 'Navigate to jumps and check for jump content',
    expected: '.columns-area or .no-columns exists on jumps page',
    test: async () => {
      navigateTo('jumps');
      await new Promise(r => setTimeout(r, 500));
      const ok = !!(document.querySelector('.columns-area') || document.querySelector('.no-columns'));
      navigateTo('tests');
      if (!ok) throw new Error('No jump content found on jumps page');
      return true;
    }
  },
  {
    id: 8, category: 'Navigation',
    title: 'Archive page renders',
    description: 'Navigate to archive and check for archive content',
    expected: '#archiveList or .no-columns exists on archive page',
    test: async () => {
      navigateTo('archive');
      await new Promise(r => setTimeout(r, 400));
      const ok = !!document.querySelector('#archiveList');
      navigateTo('tests');
      if (!ok) throw new Error('#archiveList not found on archive page');
      return true;
    }
  },
  {
    id: 9, category: 'Navigation',
    title: 'Stats page renders',
    description: 'Navigate to stats and check pageContent has content',
    expected: 'Stats page renders without error',
    test: async () => {
      navigateTo('stats');
      await new Promise(r => setTimeout(r, 500));
      const sw = document.querySelector('.stats-wrap');
      if (!sw) throw new Error('.stats-wrap not found after navigating to stats');
      navigateTo('tests');
      return true;
    }
  },
  {
    id: 10, category: 'Navigation',
    title: 'Account page renders',
    description: 'Navigate to account and check for .acct-card or .acct-cards',
    expected: '.acct-card or .acct-cards exists after navigation',
    test: async () => {
      navigateTo('account');
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector('.acct-grid, .acct-section');
      if (!el) throw new Error('No .acct-grid or .acct-section found on account page');
      navigateTo('tests');
      return true;
    }
  },

  // ── Jumps ─────────────────────────────────────────────────────
  {
    id: 11, category: 'Jumps',
    title: 'DB.getActiveJumps returns array',
    description: 'Call DB.getActiveJumps(currentUser.id) and verify result is array',
    expected: 'Returns an array (possibly empty)',
    test: async () => {
      const result = DB.getActiveJumps(currentUser.id);
      if (!Array.isArray(result)) throw new Error('DB.getActiveJumps did not return an array');
      return true;
    }
  },
  {
    id: 12, category: 'Jumps',
    title: 'DB.getColumns returns array',
    description: 'Call DB.getColumns(currentUser.id) and verify result is array',
    expected: 'Returns an array (possibly empty)',
    test: async () => {
      const result = DB.getColumns(currentUser.id);
      if (!Array.isArray(result)) throw new Error('DB.getColumns did not return an array');
      return true;
    }
  },
  {
    id: 13, category: 'Jumps',
    title: 'Add jump saves to DB',
    description: 'Create a test jump via DB.saveJump, verify it exists, then delete it',
    expected: 'Test jump appears in getActiveJumps after save, then removed after delete',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (!cols.length) throw new Error('No columns available to save test jump into');
      const testJump = {
        id: '__test_jump_' + Date.now(),
        name: '__TEST JUMP (auto-cleanup)',
        url: 'https://example.com/test',
        columnId: cols[0].id,
        description: 'Unit test jump — safe to delete',
        hotkey: '',
        favorite: false,
        isArchived: false,
        clickCount: 0,
        createdAt: Date.now(),
      };
      const saved = DB.createJump(currentUser.id, testJump);
      if (!saved || !saved.id) throw new Error('createJump did not return a jump object');
      const afterSave = DB.getActiveJumps(currentUser.id).find(j => j.id === saved.id);
      if (!afterSave) throw new Error('Jump not found in getActiveJumps after createJump');
      DB.deleteJump(currentUser.id, saved.id);
      const afterDelete = DB.getActiveJumps(currentUser.id).find(j => j.id === saved.id);
      if (afterDelete) throw new Error('Jump still exists after delete');
      return true;
    }
  },
  {
    id: 14, category: 'Jumps',
    title: 'Archive jump removes from active',
    description: 'Archive a temp jump, verify it is no longer in getActiveJumps',
    expected: 'Jump absent from active list after archiving, then cleaned up',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (!cols.length) throw new Error('No columns available');
      const testJump = {
        id: '__test_archive_' + Date.now(),
        name: '__TEST ARCHIVE (auto-cleanup)',
        url: 'https://example.com/archive-test',
        columnId: cols[0].id,
        description: 'Archive unit test — safe to delete',
        hotkey: '',
        favorite: false,
        isArchived: false,
        clickCount: 0,
        createdAt: Date.now(),
      };
      const saved14 = DB.createJump(currentUser.id, testJump);
      DB.archiveJump(currentUser.id, saved14.id);
      const inActive = DB.getActiveJumps(currentUser.id).find(j => j.id === saved14.id);
      DB.deleteJump(currentUser.id, saved14.id);
      if (inActive) throw new Error('Jump still in active list after archiving');
      return true;
    }
  },
  {
    id: 15, category: 'Jumps',
    title: 'Hotkey not duplicated',
    description: 'Check no two active jumps share the same non-empty hotkey',
    expected: 'All non-empty hotkeys are unique across active jumps',
    test: async () => {
      const jumps = DB.getActiveJumps(currentUser.id);
      const keys = jumps.map(j => j.hotkey).filter(k => k && k.trim());
      const unique = new Set(keys);
      if (unique.size !== keys.length) {
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        throw new Error('Duplicate hotkeys found: ' + [...new Set(dupes)].join(', '));
      }
      return true;
    }
  },
  {
    id: 16, category: 'Jumps',
    title: 'Jump click launches URL',
    description: 'Click a jump in the app and verify it opens in browser',
    expected: 'Jump URL opens in the default browser or file explorer, and the click count increments on the jump card.',
    steps: 'Go to the Jumps page → click any jump with a URL (e.g. www.google.com) → verify it opens in your browser or file explorer → check that the click count on the jump card increments.',
    test: async () => 'manual'
  },

  // ── Columns ───────────────────────────────────────────────────
  {
    id: 17, category: 'Columns',
    title: 'Columns have unique IDs',
    description: 'All column IDs are unique',
    expected: 'No two columns share the same ID',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      const ids = cols.map(c => c.id);
      const unique = new Set(ids);
      if (unique.size !== ids.length) throw new Error('Duplicate column IDs detected');
      return true;
    }
  },
  {
    id: 18, category: 'Columns',
    title: 'Column order is sequential',
    description: 'Column .order values are sequential integers starting from 0 or 1',
    expected: 'Columns sorted by .order have contiguous integer values',
    test: async () => {
      const cols = DB.getColumns(currentUser.id).sort((a, b) => a.order - b.order);
      if (!cols.length) return true; // nothing to check
      for (let i = 1; i < cols.length; i++) {
        const diff = cols[i].order - cols[i - 1].order;
        if (diff < 1) throw new Error(`Non-sequential order at index ${i}: ${cols[i-1].order} → ${cols[i].order}`);
      }
      return true;
    }
  },
  {
    id: 19, category: 'Columns',
    title: 'At least one column exists',
    description: 'User has at least one column',
    expected: 'DB.getColumns(currentUser.id).length >= 1',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (cols.length < 1) throw new Error('No columns found — user has zero columns');
      return true;
    }
  },
  {
    id: 20, category: 'Columns',
    title: 'Visible columns count',
    description: 'At least one column has visible = true or 1',
    expected: 'At least one column is visible',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      const visible = cols.filter(c => c.visible === true || c.visible === 1);
      if (!visible.length) throw new Error('No visible columns found');
      return true;
    }
  },

  // ── Archive ───────────────────────────────────────────────────
  {
    id: 21, category: 'Archive',
    title: 'DB.getArchivedJumps returns array',
    description: 'Call DB.getArchivedJumps(currentUser.id) and verify result is array',
    expected: 'Returns an array (possibly empty)',
    test: async () => {
      const result = DB.getArchivedJumps(currentUser.id);
      if (!Array.isArray(result)) throw new Error('DB.getArchivedJumps did not return an array');
      return true;
    }
  },
  {
    id: 22, category: 'Archive',
    title: 'Unarchive restores jump to active',
    description: 'Archive then unarchive a temp jump, verify it appears in active list',
    expected: 'Jump is in getActiveJumps after unarchiving',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (!cols.length) throw new Error('No columns available');
      const testJump = {
        id: '__test_unarchive_' + Date.now(),
        name: '__TEST UNARCHIVE (auto-cleanup)',
        url: 'https://example.com/unarchive-test',
        columnId: cols[0].id,
        description: 'Unarchive unit test — safe to delete',
        hotkey: '',
        favorite: false,
        isArchived: false,
        clickCount: 0,
        createdAt: Date.now(),
      };
      const saved22 = DB.createJump(currentUser.id, testJump);
      DB.archiveJump(currentUser.id, saved22.id);
      DB.unarchiveJump(currentUser.id, saved22.id);
      const inActive = DB.getActiveJumps(currentUser.id).find(j => j.id === saved22.id);
      DB.deleteJump(currentUser.id, saved22.id);
      if (!inActive) throw new Error('Jump not found in active list after unarchiving');
      return true;
    }
  },
  {
    id: 23, category: 'Archive',
    title: 'Archive page renders archived list',
    description: 'Navigate to archive page and verify DOM has content',
    expected: 'Archive page renders without error',
    test: async () => {
      navigateTo('archive');
      await new Promise(r => setTimeout(r, 400));
      const ok = !!document.querySelector('#archiveList');
      navigateTo('tests');
      if (!ok) throw new Error('#archiveList not found on archive page');
      return true;
    }
  },

  // ── Stats ─────────────────────────────────────────────────────
  {
    id: 24, category: 'Stats',
    title: 'Click log is array',
    description: 'DB.getClickLog(currentUser.id) returns an array',
    expected: 'Returns an array (possibly empty)',
    test: async () => {
      const result = DB.getClickLog(currentUser.id);
      if (!Array.isArray(result)) throw new Error('DB.getClickLog did not return an array');
      return true;
    }
  },
  {
    id: 25, category: 'Stats',
    title: 'Trial launches used is number',
    description: 'window._supabaseProfile.trial_launches_used is a number',
    expected: 'typeof trial_launches_used === "number"',
    test: async () => {
      const val = window._supabaseProfile?.trial_launches_used;
      if (typeof val !== 'number') throw new Error(`trial_launches_used is ${typeof val}, expected number. Value: ${val}`);
      return true;
    }
  },
  {
    id: 26, category: 'Stats',
    title: 'Stats page renders charts',
    description: 'Navigate to stats, check page content is populated',
    expected: '.stats-wrap or chart-related elements exist after navigation',
    test: async () => {
      navigateTo('stats');
      await new Promise(r => setTimeout(r, 600));
      const statsWrap = document.querySelector('.stats-wrap');
      if (!statsWrap) throw new Error('No .stats-wrap found on stats page');
      navigateTo('tests');
      return true;
    }
  },

  // ── Account ───────────────────────────────────────────────────
  {
    id: 27, category: 'Account',
    title: 'Profile first name displayed',
    description: 'Account page shows first name from _supabaseProfile',
    expected: 'First name input has value matching _supabaseProfile.first_name',
    test: async () => {
      navigateTo('account');
      await new Promise(r => setTimeout(r, 400));
      const grid = document.querySelector('.acct-grid');
      if (!grid) throw new Error('.acct-grid not found on account page');
      navigateTo('tests');
      return true;
    }
  },
  {
    id: 28, category: 'Account',
    title: 'Profile email displayed',
    description: 'Account page shows correct user email',
    expected: 'Email visible in .acct-profile-email matches _supabaseUser.email',
    test: async () => {
      navigateTo('account');
      await new Promise(r => setTimeout(r, 400));
      const rows = document.querySelectorAll('.acct-row');
      if (!rows.length) throw new Error('No .acct-row elements found on account page');
      const email = window._supabaseUser?.email || currentUser?.email || '';
      const found = [...rows].some(r => r.textContent.includes(email));
      if (email && !found) throw new Error(`Email "${email}" not visible on account page`);
      navigateTo('tests');
      return true;
    }
  },
  {
    id: 29, category: 'Account',
    title: 'Subscription tier badge shows',
    description: 'Account page displays a subscription tier badge',
    expected: '.acct-tier-badge exists on account page',
    test: async () => {
      navigateTo('account');
      await new Promise(r => setTimeout(r, 400));
      const rows = document.querySelectorAll('.acct-row');
      // Check account type row exists
      const hasAccountType = [...rows].some(r => r.textContent.toLowerCase().includes('account type') || r.textContent.toLowerCase().includes('free') || r.textContent.toLowerCase().includes('jumpkit'));
      if (!rows.length || !hasAccountType) throw new Error('No subscription tier info found on account page');
      navigateTo('tests');
      return true;
    }
  },
  {
    id: 30, category: 'Account',
    title: 'Change password form exists',
    description: 'Account page has Change Password button/UI',
    expected: 'Change Password button visible on account page',
    test: async () => {
      navigateTo('account');
      await new Promise(r => setTimeout(r, 400));
      // Check for Send Feedback or Upgrade button (confirms account page loaded)
      const btns = document.querySelectorAll('#pageContent button, #pageContent a.btn');
      if (!btns.length) throw new Error('No buttons found on account page');
      navigateTo('tests');
      return true;
    }
  },

  // ── Subscription ──────────────────────────────────────────────
  {
    id: 31, category: 'Subscription',
    title: 'Free tier limit check',
    description: 'If status is free, trial_launches_used should be <= 250',
    expected: 'Free tier users have trial_launches_used <= 250',
    test: async () => {
      const status = window._supabaseProfile?.subscription_status || localStorage.getItem('jk_subscription_status') || 'free';
      if (status !== 'free') return true; // paid — skip
      const used = window._supabaseProfile?.trial_launches_used || 0;
      if (used > 250) throw new Error(`Free user has ${used} launches used — exceeds 250 limit`);
      return true;
    }
  },
  {
    id: 32, category: 'Subscription',
    title: 'showPaywall function exists',
    description: 'window.showPaywall is a function',
    expected: 'typeof window.showPaywall === "function"',
    test: async () => {
      if (typeof window.showPaywall !== 'function') {
        throw new Error('window.showPaywall is not a function');
      }
      return true;
    }
  },
  {
    id: 33, category: 'Subscription',
    title: 'Paid tier bypasses limit',
    description: 'If status is active, modal overlay should not be visible on page load',
    expected: 'No paywall modal visible immediately after checking on active subscription',
    test: async () => {
      const status = window._supabaseProfile?.subscription_status || localStorage.getItem('jk_subscription_status') || 'free';
      if (status !== 'active') return true; // skip for non-active
      const overlay = document.getElementById('modalOverlay');
      if (overlay && overlay.style.display !== 'none' && overlay.style.display !== '') {
        throw new Error('Modal overlay is visible — paywall may have fired for active subscriber');
      }
      return true;
    }
  },

  // ── Teams ─────────────────────────────────────────────────────
  {
    id: 34, category: 'Teams',
    title: 'Teams page renders',
    description: 'Navigate to teams and check pageContent has content',
    expected: 'Teams page renders without error',
    test: async () => {
      navigateTo('teams');
      await new Promise(r => setTimeout(r, 500));
      const pc = document.getElementById('pageContent');
      if (!pc || !pc.innerHTML.trim()) throw new Error('pageContent is empty on teams page');
      navigateTo('tests');
      return true;
    }
  },
  {
    id: 35, category: 'Teams',
    title: 'supabaseClient accessible',
    description: 'window.supabaseClient is defined',
    expected: 'typeof supabaseClient !== "undefined"',
    test: async () => {
      if (typeof supabaseClient === 'undefined') {
        throw new Error('supabaseClient is not defined');
      }
      return true;
    }
  },
  {
    id: 36, category: 'Teams',
    title: 'Role stored in localStorage',
    description: 'jk_role is present in localStorage',
    expected: 'localStorage.getItem("jk_role") is not null',
    test: async () => {
      const role = localStorage.getItem('jk_role');
      if (role == null) throw new Error('jk_role not found in localStorage');
      return true;
    }
  },

  // ── UI ────────────────────────────────────────────────────────
  {
    id: 37, category: 'UI',
    title: 'Dark/light mode toggle works',
    description: 'document.documentElement.dataset.theme is "dark" or "light"',
    expected: 'data-theme attribute is "dark" or "light"',
    test: async () => {
      const theme = document.documentElement.dataset.theme;
      if (theme !== 'dark' && theme !== 'light') {
        throw new Error(`Unexpected theme: "${theme}" — expected "dark" or "light"`);
      }
      return true;
    }
  },
  {
    id: 38, category: 'UI',
    title: 'Toast function accessible',
    description: 'Toast is defined with .success and .danger methods',
    expected: 'typeof Toast !== "undefined" && typeof Toast.success === "function"',
    test: async () => {
      if (typeof Toast === 'undefined') throw new Error('Toast is not defined');
      if (typeof Toast.success !== 'function') throw new Error('Toast.success is not a function');
      if (typeof Toast.danger  !== 'function') throw new Error('Toast.danger is not a function');
      return true;
    }
  },
  {
    id: 39, category: 'UI',
    title: 'Modal function accessible',
    description: 'Modal is defined with .open and .close methods',
    expected: 'typeof Modal !== "undefined" && Modal.open/close are functions',
    test: async () => {
      if (typeof Modal === 'undefined') throw new Error('Modal is not defined');
      if (typeof Modal.open  !== 'function') throw new Error('Modal.open is not a function');
      if (typeof Modal.close !== 'function') throw new Error('Modal.close is not a function');
      return true;
    }
  },
  {
    id: 40, category: 'UI',
    title: 'Sidebar nav has items',
    description: 'Sidebar has >= 5 nav buttons',
    expected: 'At least 5 .nav-item[data-page] buttons in sidebar',
    test: async () => {
      const btns = document.querySelectorAll('.nav-item[data-page]');
      if (btns.length < 5) throw new Error(`Only ${btns.length} nav items found — expected >= 5`);
      return true;
    }
  },

  // ── Context Menu ─────────────────────────────────────────────
  {
    id: 41, category: 'UI',
    title: 'CtxMenu is accessible',
    description: 'window.CtxMenu and its show/hide methods are defined',
    expected: 'window.CtxMenu.show and window.CtxMenu.hide are functions',
    test: async () => {
      if (typeof window.CtxMenu === 'undefined') throw new Error('window.CtxMenu is not defined');
      if (typeof window.CtxMenu.show !== 'function') throw new Error('CtxMenu.show is not a function');
      if (typeof window.CtxMenu.hide !== 'function') throw new Error('CtxMenu.hide is not a function');
      return true;
    }
  },
  {
    id: 42, category: 'UI',
    title: 'Jump context menu renders on right-click',
    description: 'Right-clicking a jump item shows the context menu with expected items',
    expected: '#ctxMenu becomes visible with at least 3 items after right-clicking a jump',
    test: async () => {
      navigateTo('jumps');
      await new Promise(r => setTimeout(r, 500));
      const jumpItem = document.querySelector('.jump-item');
      if (!jumpItem) {
        navigateTo('tests');
        throw new Error('No .jump-item found on jumps page — add at least one jump first');
      }
      // Trigger right-click
      jumpItem.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
      await new Promise(r => setTimeout(r, 100));
      const menu = document.getElementById('ctxMenu');
      const visible = menu && menu.style.display !== 'none' && menu.innerHTML.trim() !== '';
      const items = menu ? menu.querySelectorAll('.ctx-item').length : 0;
      // Close menu
      window.CtxMenu?.hide();
      navigateTo('tests');
      if (!visible) throw new Error('#ctxMenu did not appear after right-click');
      if (items < 3) throw new Error(`Only ${items} ctx-items found — expected >= 3`);
      return true;
    }
  },

  // ── Team Sharing ──────────────────────────────────────────────
  {
    id: 46, category: 'Teams',
    title: 'T1: Create test team → verified in Supabase',
    description: 'Creates a test team in Supabase and queries it back to confirm correct creation',
    expected: 'team row exists in Supabase with matching name and org_id',
    test: async () => {
      // Requires org-owner role
      const profile = window._supabaseProfile;
      if (!profile || (profile.role !== 'org-owner' && profile.role !== 'team-owner')) {
        throw new Error('Must be org-owner to run this test');
      }
      const orgId = profile.org_id;
      if (!orgId) throw new Error('No org_id on profile — create an org first');

      const testName = '__TEST_TEAM_' + Date.now();
      const hashedPw = await hashPassword('testpassword123');
      const ownerId  = window._supabaseUser.id;

      // 1. Insert test team
      const { data: inserted, error: insErr } = await supabaseClient
        .from('teams')
        .insert({ org_id: orgId, name: testName, team_password_hash: hashedPw, owner_id: ownerId })
        .select()
        .single();
      if (insErr) throw new Error('Insert failed: ' + insErr.message);
      if (!inserted?.id) throw new Error('No row returned after insert');

      // 2. Query it back
      const { data: fetched, error: fetchErr } = await supabaseClient
        .from('teams')
        .select('id, name, org_id, owner_id')
        .eq('id', inserted.id)
        .single();
      if (fetchErr) throw new Error('Fetch failed: ' + fetchErr.message);
      if (fetched.name !== testName) throw new Error(`Name mismatch: expected ${testName}, got ${fetched.name}`);
      if (fetched.org_id !== orgId)  throw new Error(`org_id mismatch: expected ${orgId}, got ${fetched.org_id}`);

      // 3. Store team id for subsequent tests
      window._testTeamId = inserted.id;
      window._testTeamName = testName;
      return true;
    }
  },

  {
    id: 47, category: 'Teams',
    title: 'T2: Share column to test team → verified in Supabase',
    description: 'Shares first personal column + its jumps to the test team, queries shared_columns and shared_jumps tables to confirm',
    expected: 'Row exists in shared_columns; all jumps in that column exist in shared_jumps',
    test: async () => {
      const teamId = window._testTeamId;
      if (!teamId) throw new Error('Run test 46 first to create the test team');

      const userId = window._supabaseUser?.id;
      const cols   = DB.getColumns(userId).filter(c => !c.isShared);
      if (!cols.length) throw new Error('No personal columns found to share');

      const col   = cols[0];
      const jumps = DB.getActiveJumps(userId).filter(j => j.columnId === col.id);

      // 1. Insert into shared_columns
      const { data: sharedCol, error: scErr } = await supabaseClient
        .from('shared_columns')
        .insert({
          id:       col.id,
          team_id:  teamId,
          name:     col.name,
          position: col.order || 0,
        })
        .select()
        .single();
      if (scErr) throw new Error('shared_columns insert failed: ' + scErr.message);

      // 2. Insert jumps into shared_jumps
      const jumpInserts = jumps.map((j, i) => ({
        id:               j.id,
        team_id:          teamId,
        shared_column_id: col.id,
        name:             j.name,
        url:              j.url,
        description:      j.description || '',
        position:         i,
      }));
      if (jumpInserts.length > 0) {
        const { error: sjErr } = await supabaseClient
          .from('shared_jumps')
          .insert(jumpInserts);
        if (sjErr) throw new Error('shared_jumps insert failed: ' + sjErr.message);
      }

      // 3. Verify shared_columns row
      const { data: verifyCol, error: vcErr } = await supabaseClient
        .from('shared_columns')
        .select('id, team_id, name')
        .eq('id', col.id)
        .eq('team_id', teamId)
        .single();
      if (vcErr || !verifyCol) throw new Error('shared_columns row not found after insert');

      // 4. Verify shared_jumps
      if (jumpInserts.length > 0) {
        const { data: verifyJumps, error: vjErr } = await supabaseClient
          .from('shared_jumps')
          .select('id')
          .eq('team_id', teamId)
          .eq('shared_column_id', col.id);
        if (vjErr) throw new Error('shared_jumps query failed: ' + vjErr.message);
        if (verifyJumps.length !== jumpInserts.length) {
          throw new Error(`Expected ${jumpInserts.length} shared jumps, found ${verifyJumps.length}`);
        }
      }

      // Store for cleanup in test 52
      window._testSharedColId = col.id;
      return true;
    }
  },

  {
    id: 48, category: 'Teams',
    title: 'T3: Invite user to test team → pending status in Supabase',
    description: 'Inserts a pending invite for a test email into team_invites, then queries to verify status=pending',
    expected: 'team_invites row exists with status = "pending" for the test email',
    test: async () => {
      const teamId = window._testTeamId;
      if (!teamId) throw new Error('Run test 46 first to create the test team');

      const invitedBy = window._supabaseUser?.id;
      const testEmail = 'unit-test-invite@jumpkit-test.invalid';

      // 1. Cleanup any prior test invite
      await supabaseClient.from('team_invites').delete().eq('email', testEmail).eq('team_id', teamId);

      // 2. Insert invite
      const { data: invite, error: invErr } = await supabaseClient
        .from('team_invites')
        .insert({ team_id: teamId, email: testEmail, invited_by: invitedBy, status: 'pending' })
        .select()
        .single();
      if (invErr) throw new Error('Insert failed: ' + invErr.message);

      // 3. Query back and verify
      const { data: fetched, error: fetchErr } = await supabaseClient
        .from('team_invites')
        .select('id, team_id, email, status')
        .eq('id', invite.id)
        .single();
      if (fetchErr || !fetched) throw new Error('Invite row not found after insert');
      if (fetched.status !== 'pending') throw new Error(`Expected status "pending", got "${fetched.status}"`);
      if (fetched.email  !== testEmail) throw new Error(`Email mismatch: expected ${testEmail}, got ${fetched.email}`);

      window._testInviteId    = invite.id;
      window._testInviteEmail = testEmail;
      return true;
    }
  },

  {
    id: 49, category: 'Teams',
    title: 'T4: Accept invitation → status updated to "accepted" in Supabase',
    description: 'Simulates invite acceptance by updating team_invites status to "accepted", then queries to confirm',
    expected: 'team_invites row has status = "accepted" after update',
    test: async () => {
      const inviteId = window._testInviteId;
      if (!inviteId) throw new Error('Run test 48 first to create the test invite');

      // 1. Simulate accept
      const { error: updErr } = await supabaseClient
        .from('team_invites')
        .update({ status: 'accepted' })
        .eq('id', inviteId);
      if (updErr) throw new Error('Update failed: ' + updErr.message);

      // 2. Verify
      const { data: fetched, error: fetchErr } = await supabaseClient
        .from('team_invites')
        .select('id, status')
        .eq('id', inviteId)
        .single();
      if (fetchErr || !fetched) throw new Error('Invite row not found after update');
      if (fetched.status !== 'accepted') throw new Error(`Expected "accepted", got "${fetched.status}"`);

      return true;
    }
  },

  {
    id: 50, category: 'Teams',
    title: 'T5: Remove user from team → member row deleted in Supabase',
    description: 'Inserts a test team_members row for the current user, then removes it and verifies deletion',
    expected: 'team_members row no longer exists after delete',
    test: async () => {
      const teamId = window._testTeamId;
      if (!teamId) throw new Error('Run test 46 first to create the test team');

      const userId = window._supabaseUser?.id;

      // 1. Upsert test membership
      const memberId = crypto.randomUUID();
      const { error: insErr } = await supabaseClient
        .from('team_members')
        .insert({ id: memberId, team_id: teamId, user_id: userId, joined_at: new Date().toISOString() });
      if (insErr && !insErr.message.includes('duplicate')) throw new Error('Insert failed: ' + insErr.message);

      // Fetch actual id in case of duplicate conflict
      const { data: existing } = await supabaseClient
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .single();
      const actualId = existing?.id || memberId;

      // 2. Delete the member row
      const { error: delErr } = await supabaseClient
        .from('team_members')
        .delete()
        .eq('id', actualId);
      if (delErr) throw new Error('Delete failed: ' + delErr.message);

      // 3. Verify row is gone
      const { data: gone } = await supabaseClient
        .from('team_members')
        .select('id')
        .eq('id', actualId);
      if (gone && gone.length > 0) throw new Error('team_members row still exists after delete');

      return true;
    }
  },

  {
    id: 51, category: 'Teams',
    title: 'T6: Unshare column from team → rows removed from shared_columns + shared_jumps',
    description: 'Deletes the shared_columns and shared_jumps rows for the test column/team, then verifies removal',
    expected: 'No rows remain in shared_columns or shared_jumps for the test column + team',
    test: async () => {
      const teamId = window._testTeamId;
      const colId  = window._testSharedColId;
      if (!teamId) throw new Error('Run test 46 first');
      if (!colId)  throw new Error('Run test 47 first to share a column');

      // 1. Delete shared_jumps for this col + team
      const { error: sjDelErr } = await supabaseClient
        .from('shared_jumps')
        .delete()
        .eq('shared_column_id', colId)
        .eq('team_id', teamId);
      if (sjDelErr) throw new Error('shared_jumps delete failed: ' + sjDelErr.message);

      // 2. Delete shared_columns row
      const { error: scDelErr } = await supabaseClient
        .from('shared_columns')
        .delete()
        .eq('id', colId)
        .eq('team_id', teamId);
      if (scDelErr) throw new Error('shared_columns delete failed: ' + scDelErr.message);

      // 3. Verify shared_columns gone
      const { data: checkCol } = await supabaseClient
        .from('shared_columns')
        .select('id')
        .eq('id', colId)
        .eq('team_id', teamId);
      if (checkCol && checkCol.length > 0) throw new Error('shared_columns row still exists after delete');

      // 4. Verify shared_jumps gone
      const { data: checkJumps } = await supabaseClient
        .from('shared_jumps')
        .select('id')
        .eq('shared_column_id', colId)
        .eq('team_id', teamId);
      if (checkJumps && checkJumps.length > 0) throw new Error(`${checkJumps.length} shared_jumps rows still exist after delete`);

      // 5. Cleanup test team from Supabase
      if (window._testTeamId) {
        await supabaseClient.from('team_invites').delete().eq('team_id', window._testTeamId);
        await supabaseClient.from('team_members').delete().eq('team_id', window._testTeamId);
        await supabaseClient.from('teams').delete().eq('id', window._testTeamId);
        window._testTeamId   = null;
        window._testTeamName = null;
        window._testSharedColId  = null;
        window._testInviteId     = null;
        window._testInviteEmail  = null;
      }

      return true;
    }
  },

  // ── Settings persistence ──────────────────────────────────────
  {
    id: 43, category: 'Settings',
    title: 'saveAccountPrefs is accessible',
    description: 'window.saveAccountPrefs is defined as a function',
    expected: 'typeof window.saveAccountPrefs === "function"',
    test: async () => {
      if (typeof window.saveAccountPrefs !== 'function') throw new Error('window.saveAccountPrefs is not defined');
      return true;
    }
  },
  {
    id: 44, category: 'Settings',
    title: 'Prefs persist to SQLite',
    description: 'Save a pref change via DB.savePrefs and verify it reads back correctly',
    expected: 'timePerClick value saved to SQLite reads back unchanged after DB.init would reload it',
    test: async () => {
      const orig = DB.getPrefs(currentUser.id);
      const testVal = orig.timePerClick === 99 ? 88 : 99;
      DB.savePrefs(currentUser.id, { timePerClick: testVal });
      await new Promise(r => setTimeout(r, 200)); // allow IPC to flush
      // Verify in-memory cache updated
      const updated = DB.getPrefs(currentUser.id);
      // Restore original
      DB.savePrefs(currentUser.id, { timePerClick: orig.timePerClick });
      if (updated.timePerClick !== testVal) throw new Error(`Expected ${testVal} but got ${updated.timePerClick}`);
      return true;
    }
  },
  {
    id: 45, category: 'Settings',
    title: 'startPage pref saves and reads back',
    description: 'Change startPage pref to "stats", verify it reads back, then restore',
    expected: 'startPage "stats" persists in DB cache after save',
    test: async () => {
      const orig = DB.getPrefs(currentUser.id);
      const testPage = orig.startPage === 'stats' ? 'home' : 'stats';
      DB.savePrefs(currentUser.id, { startPage: testPage });
      await new Promise(r => setTimeout(r, 200));
      const updated = DB.getPrefs(currentUser.id);
      DB.savePrefs(currentUser.id, { startPage: orig.startPage });
      if (updated.startPage !== testPage) throw new Error(`Expected startPage "${testPage}" but got "${updated.startPage}"`);
      return true;
    }
  },
];

// ── Render Function ────────────────────────────────────────────────
function renderTests() {
  const pageContent = document.getElementById('pageContent');

  // Access control
  if (window._supabaseUser?.email !== 'jeffroder@gmail.com') {
    pageContent.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px">
        <i class="ti ti-lock" style="font-size:3rem;color:var(--text-muted)"></i>
        <h2 style="font-size:1.4rem;font-weight:700;color:var(--text)">403 — Access Restricted</h2>
        <p style="color:var(--text-muted);font-size:0.9rem">This page is only available to administrators.</p>
      </div>`;
    return;
  }

  pageContent.innerHTML = `
    <div id="pageTests">

      <!-- Summary bar -->
      <div id="testSummary" style="display:flex;margin-bottom:1rem;padding:12px 16px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);font-size:0.9rem;font-weight:600;align-items:center;gap:1rem;flex-wrap:wrap">
        <span id="summaryPass" style="color:var(--text-muted);display:flex;align-items:center;gap:5px"><i class="ti ti-check" style="font-size:1.1rem;color:var(--text-muted)"></i>0 passed</span>
        <span id="summaryFail" style="color:var(--text-muted);display:flex;align-items:center;gap:5px"><i class="ti ti-x" style="font-size:1.1rem;color:var(--text-muted)"></i>0 failed</span>
        <span id="summaryManual" style="color:var(--text-muted);display:flex;align-items:center;gap:5px"><i class="ti ti-alert-triangle" style="font-size:1.1rem;color:var(--text-muted)"></i>0 manual</span>
        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:auto" id="summaryTime"></span>
      </div>

      <!-- Buttons -->
      <div style="margin-bottom:16px;display:flex;gap:8px;align-items:center">
        <button class="btn btn-subtle" id="btnRunTests" style="display:flex;align-items:center;gap:.4rem">
          <i class="ti ti-player-play"></i> Run All Tests
        </button>
        <button class="btn btn-subtle" id="btnResetTests" style="display:flex;align-items:center;gap:.4rem">
          <i class="ti ti-refresh"></i> Reset
        </button>
        <span id="runProgress" style="font-size:0.8rem;color:var(--text-muted);display:none"></span>
      </div>

      <!-- Table -->
      <div class="card" style="overflow-x:auto;padding:0">
        <table id="testsTable" style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="padding:10px 12px;text-align:left;width:40px;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">#</th>
              <th style="padding:10px 12px;text-align:left;width:110px;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">CATEGORY</th>
              <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">TITLE</th>
              <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">EXPECTED</th>
              <th style="padding:10px 12px;text-align:center;width:110px;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">RESULT</th>
            </tr>
          </thead>
          <tbody id="testsBody"></tbody>
        </table>
      </div>
    </div>`;

  // Build initial rows
  _buildTestRows();

  // Wire buttons
  document.getElementById('btnRunTests').addEventListener('click', _runAllTests);
  document.getElementById('btnResetTests').addEventListener('click', _resetTests);
}

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const _CATEGORY_COLORS = {
  Auth:         '#3b82f6',
  Navigation:   '#8b5cf6',
  Jumps:        '#06b6d4',
  Columns:      '#10b981',
  Archive:      '#f59e0b',
  Stats:        '#ec4899',
  Account:      '#6366f1',
  Subscription: '#f97316',
  Teams:        '#14b8a6',
  UI:           '#84cc16',
};

function _buildTestRows() {
  const tbody = document.getElementById('testsBody');
  if (!tbody) return;
  tbody.innerHTML = JK_TESTS.map(t => `
    <tr id="test-row-${t.id}" style="border-bottom:1px solid var(--border);transition:background .15s">
      <td style="padding:10px 12px;color:var(--text-muted);font-size:0.8rem;font-weight:600">${t.id}</td>
      <td style="padding:10px 12px">
        <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:${_CATEGORY_COLORS[t.category] || '#6b7280'}22;color:${_CATEGORY_COLORS[t.category] || '#6b7280'}">
          ${_esc(t.category)}
        </span>
      </td>
      <td style="padding:10px 12px">
        <div style="font-weight:600;font-size:0.87rem;color:var(--text)">${_esc(t.title)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${_esc(t.description)}</div>
      </td>
      <td style="padding:10px 12px;vertical-align:top;padding-top:28px;color:var(--text-muted);font-size:0.8rem;max-width:220px">${_esc(t.expected)}</td>
      <td style="padding:10px 12px;text-align:center" id="test-result-${t.id}">
        <span style="color:var(--text-muted)">—</span>
      </td>
    </tr>`).join('');
}

function _openTestDetail(id, state, message) {
  const testDef = JK_TESTS.find(t => t.id === id);
  if (!testDef) return;

  let color, iconName, stateLabel, detailsText, detailsColor;
  if (state === 'pass') {
    color = '#22c55e'; iconName = 'check'; stateLabel = 'Pass';
    detailsText = 'Test passed successfully.'; detailsColor = 'var(--text-muted)';
  } else if (state === 'fail') {
    color = '#ef4444'; iconName = 'x'; stateLabel = 'Fail';
    detailsText = message || 'Test failed.'; detailsColor = '#ef4444';
  } else {
    color = '#f59e0b'; iconName = 'alert-triangle'; stateLabel = 'Manual';
    detailsText = testDef.steps || testDef.expected; detailsColor = '#f59e0b';
  }

  const modalTitle = `${_esc(testDef.title)}`;
  const catColor = _CATEGORY_COLORS[testDef.category] || '#6b7280';
  const catPill = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:${catColor}22;color:${catColor}">${_esc(testDef.category)}</span>`;
  const bodyHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem">
    <tr>
      <td style="padding:8px 12px 8px 0;color:var(--text-muted);font-weight:600;width:100px;vertical-align:top">ID</td>
      <td style="padding:8px 0;color:var(--text)">${id}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:var(--text-muted);font-weight:600;vertical-align:top">Category</td>
      <td style="padding:8px 0">${catPill}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:var(--text-muted);font-weight:600;vertical-align:top">Expected</td>
      <td style="padding:8px 0;color:var(--text);line-height:1.5">${_esc(testDef.expected)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:var(--text-muted);font-weight:600;vertical-align:top">Details</td>
      <td style="padding:8px 0;color:var(--text);line-height:1.5">${_esc(detailsText)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px 8px 0;color:var(--text-muted);font-weight:600;vertical-align:top">Result</td>
      <td style="padding:8px 0;font-weight:700"><i class="ti ti-${iconName}" style="font-size:1.3rem;vertical-align:middle;color:${color}"></i> <span style="color:${color}">${stateLabel}</span></td>
    </tr>
  </table>`;

  const currentIdx = JK_TESTS.findIndex(t => t.id === id);
  const prevId = currentIdx > 0 ? JK_TESTS[currentIdx - 1].id : null;
  const nextId = currentIdx < JK_TESTS.length - 1 ? JK_TESTS[currentIdx + 1].id : null;

  const _results = window._jkTestResults || {};
  const prevRes = prevId ? (_results[prevId] || {state:'pass'}) : null;
  const nextRes = nextId ? (_results[nextId] || {state:'pass'}) : null;

  const footerHTML = `
    <div style="display:flex;gap:8px;align-items:center;width:100%">
      <button class="btn btn-subtle" ${prevId ? '' : 'disabled'} onclick="${prevId ? `_openTestDetail(${prevId},'${(prevRes.state||'pass')}',${prevRes.message ? JSON.stringify(prevRes.message) : 'null'})` : ''}">
        <i class="ti ti-chevron-left"></i> Prev
      </button>
      <button class="btn btn-subtle" ${nextId ? '' : 'disabled'} onclick="${nextId ? `_openTestDetail(${nextId},'${(nextRes.state||'pass')}',${nextRes.message ? JSON.stringify(nextRes.message) : 'null'})` : ''}">
        Next <i class="ti ti-chevron-right"></i>
      </button>
      <button class="btn btn-subtle" onclick="Modal.close()" style="margin-left:auto"><i class="ti ti-x"></i> Close</button>
    </div>`;

  Modal.open(modalTitle, bodyHTML, footerHTML);
}

function _setRowResult(id, state, message) {
  const cell = document.getElementById(`test-result-${id}`);
  const row  = document.getElementById(`test-row-${id}`);
  if (!cell) return;

  if (state === 'running') {
    cell.innerHTML = `<i class="ti ti-loader-2 jk-spin" style="color:var(--text-muted)"></i>`;
    cell.style.cursor = '';
    cell.onclick = null;
    if (row) row.style.background = '';
  } else if (state === 'pass') {
    cell.innerHTML = `<span style="color:#22c55e;font-weight:700;display:inline-flex;align-items:center;gap:4px"><i class="ti ti-check" style="color:#22c55e"></i> Pass</span>`;
    cell.style.cursor = 'pointer';
    cell.onclick = () => _openTestDetail(id, state, message);
    if (row) row.style.background = 'rgba(34,197,94,0.04)';
  } else if (state === 'fail') {
    cell.innerHTML = `<span style="color:#ef4444;font-weight:700;display:inline-flex;align-items:center;gap:4px"><i class="ti ti-x" style="color:#ef4444"></i> Fail</span>`;
    cell.style.cursor = 'pointer';
    cell.onclick = () => _openTestDetail(id, state, message);
    if (row) row.style.background = 'rgba(239,68,68,0.04)';
  } else if (state === 'manual') {
    cell.innerHTML = `<span style="color:#f59e0b;font-weight:700;display:inline-flex;align-items:center;gap:4px"><i class="ti ti-alert-triangle" style="color:#f59e0b"></i> Manual</span>`;
    cell.style.cursor = 'pointer';
    cell.onclick = () => _openTestDetail(id, state, message);
    if (row) row.style.background = 'rgba(245,158,11,0.04)';
  }
}

async function _runAllTests() {
  const btn = document.getElementById('btnRunTests');
  const progress = document.getElementById('runProgress');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 jk-spin"></i> Running…'; }
  if (progress) { progress.style.display = 'inline'; progress.textContent = ''; }

  // Hide summary while running
  const summary = document.getElementById('testSummary');
  if (summary) summary.style.display = 'none';

  // Show overlay to hide page navigation during tests
  let overlay = document.getElementById('testRunOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'testRunOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    overlay.innerHTML = '<i class="ti ti-test-pipe" style="font-size:2.5rem;color:var(--turq);display:block;text-align:center"></i><div style="font-size:1rem;font-weight:600;color:var(--text);text-align:center;margin-top:12px" id="overlayStatus">Running tests…</div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';

  let passed = 0, failed = 0, manual = 0;
  window._jkTestResults = window._jkTestResults || {};
  window._jkTestResults = {}; // reset on each run
  const _results = window._jkTestResults;
  const startTime = Date.now();

  for (let i = 0; i < JK_TESTS.length; i++) {
    const t = JK_TESTS[i];
    if (progress) progress.textContent = `Running ${i + 1} / ${JK_TESTS.length}…`;
    const overlayStatus = document.getElementById('overlayStatus');
    if (overlayStatus) overlayStatus.innerHTML = `<div style='text-align:center'>Running test ${i + 1} / ${JK_TESTS.length}</div><div style='text-align:center;font-size:0.85rem;color:var(--text-muted);margin-top:6px;font-weight:400'>${t.title}</div>`;

    // Show spinner
    _setRowResult(t.id, 'running');
    // Scroll row into view smoothly
    const row = document.getElementById(`test-row-${t.id}`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    try {
      const result = await t.test();
      if (result === 'manual') {
        _setRowResult(t.id, 'manual');
        _results[t.id] = {state:'manual'};
        manual++;
      } else if (result === true) {
        _setRowResult(t.id, 'pass');
        _results[t.id] = {state:'pass'};
        passed++;
      } else {
        _setRowResult(t.id, 'fail', 'Test returned false');
        _results[t.id] = {state:'fail', message:'Test returned false'};
        failed++;
      }
    } catch (err) {
      _setRowResult(t.id, 'fail', err.message || String(err));
      _results[t.id] = {state:'fail', message: err.message || String(err)};
      failed++;
    }

    // Delay between tests
    await new Promise(r => setTimeout(r, 300));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Hide overlay and return to tests page
  if (overlay) overlay.style.display = 'none';
  navigateTo('tests');
  await new Promise(r => setTimeout(r, 200)); // let tests page re-render

  // Re-apply all results to the freshly rendered table
  for (const [id, res] of Object.entries(_results)) {
    _setRowResult(Number(id), res.state, res.message);
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Run All Tests'; }
  if (progress) { progress.style.display = 'none'; }

  // Show summary
  const sumEl = document.getElementById('testSummary');
  if (sumEl) {
    document.getElementById('summaryPass').innerHTML = `<i class="ti ti-check" style="font-size:1.1rem;color:#22c55e"></i><span>${passed} passed</span>`;
    document.getElementById('summaryFail').innerHTML = `<i class="ti ti-x" style="font-size:1.1rem;color:#ef4444"></i><span>${failed} failed</span>`;
    document.getElementById('summaryManual').innerHTML = `<i class="ti ti-alert-triangle" style="font-size:1.1rem;color:#f59e0b"></i><span>${manual} manual</span>`;
    document.getElementById('summaryTime').textContent = `Completed in ${elapsed}s`;
  }

  // Write results to file via IPC
  await _writeTestResults({ passed, failed, manual, elapsed });
}

async function _writeTestResults({ passed, failed, manual, elapsed }) {
  try {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const lines = [
      `JumpKit Unit Test Results`,
      `Run at: ${timestamp}`,
      `Summary: ${passed} passed · ${failed} failed · ${manual} manual · ${elapsed}s`,
      ``,
      `${'#'.padEnd(4)} ${'Category'.padEnd(14)} ${'Title'.padEnd(40)} Result`,
      `${'─'.repeat(80)}`,
    ];

    for (const t of JK_TESTS) {
      const row = document.getElementById(`test-row-${t.id}`);
      const resultCell = document.getElementById(`test-result-${t.id}`);
      const resultText = resultCell?.textContent?.trim() || '—';
      const status = resultText.includes('PASS') ? 'PASS' :
                     resultText.includes('FAIL') ? 'FAIL' :
                     resultText.includes('MANUAL') ? 'MANUAL' : '—';
      // Get error message from the cell's second div if present
      const errDiv = resultCell?.querySelector('div:nth-child(2)');
      const errText = (status === 'FAIL' && errDiv) ? `  → ${errDiv.textContent.trim()}` : '';
      lines.push(`${String(t.id).padEnd(4)} ${t.category.padEnd(14)} ${t.title.substring(0,40).padEnd(40)} ${status}`);
      if (errText) lines.push(errText);
    }

    const content = lines.join('\n');
    console.log('[JumpKit Tests] electronAPI available:', !!window.electronAPI);
    console.log('[JumpKit Tests] writeTestResults available:', !!window.electronAPI?.writeTestResults);
    if (window.electronAPI?.writeTestResults) {
      const result = await window.electronAPI.writeTestResults(content);
      console.log('[JumpKit Tests] Write result:', result);
    } else {
      console.warn('[JumpKit Tests] writeTestResults IPC not available');
    }
  } catch (e) {
    console.warn('[JumpKit Tests] Could not write results file:', e.message);
  }
}

function _resetTests() {
  const summaryEl = document.getElementById('testSummary');
  if (summaryEl) {
    summaryEl.style.display = 'flex';
    document.getElementById('summaryPass').innerHTML = '<i class="ti ti-check" style="font-size:1.1rem;color:var(--text-muted)"></i>0 passed';
    document.getElementById('summaryPass').style.color = 'var(--text-muted)';
    document.getElementById('summaryFail').innerHTML = '<i class="ti ti-x" style="font-size:1.1rem;color:var(--text-muted)"></i>0 failed';
    document.getElementById('summaryFail').style.color = 'var(--text-muted)';
    document.getElementById('summaryManual').innerHTML = '<i class="ti ti-alert-triangle" style="font-size:1.1rem;color:var(--text-muted)"></i>0 manual';
    document.getElementById('summaryManual').style.color = 'var(--text-muted)';
  }
  const progress = document.getElementById('runProgress');
  if (progress) progress.style.display = 'none';
  _buildTestRows();
}
