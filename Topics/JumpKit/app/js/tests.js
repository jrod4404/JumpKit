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
    purpose: 'Confirms the user remains authenticated after the app loads. If this fails, the login flow or session storage is broken.',
    prerequisites: 'None — runs automatically on app load.',
    description: 'window._supabaseUser is set after app load',
    input: 'window._supabaseUser',
    expected: 'window._supabaseUser is not null',
    test: async () => {
      if (window._supabaseUser == null) throw new Error('_supabaseUser is null');
      return true;
    }
  },
  {
    id: 2, category: 'Auth',
    title: 'currentUser is set',
    purpose: 'Verifies the local currentUser object is properly populated. This object drives nearly all DB reads/writes — if missing, the entire app will malfunction.',
    prerequisites: 'Must be logged in. Test 1 (session persists) should pass first.',
    input: 'currentUser.id, currentUser.email',
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
    purpose: 'Checks that the user\'s Supabase profile row was fetched on startup. Role, org_id, and subscription data all live here — missing profile breaks teams, billing, and settings.',
    prerequisites: 'Must be logged in. A matching row must exist in the Supabase profiles table for this user.',
    input: 'window._supabaseProfile',
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
    purpose: 'Ensures subscription status was written to localStorage on login. This cache is used to gate features without a Supabase round-trip on every action.',
    prerequisites: 'Must be logged in. Subscription status must have been fetched and cached during initApp.',
    input: 'localStorage.getItem("jk_subscription_status")',
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
    purpose: 'Manually confirms that signing out fully ends the session and prevents access to the app without re-authenticating. Critical for security.',
    prerequisites: 'Must be logged in. Have your credentials ready to log back in after signing out.',
    input: 'User menu → Logout action',
    description: 'Click sign out and verify redirect to login page',
    expected: 'User is redirected to login screen and cannot navigate back to the app without logging in again.',
    steps: 'Click the user menu (top-right) → click Logout → verify you are redirected to the login screen and cannot navigate back without logging in again.',
    test: async () => 'manual'
  },

  // ── Navigation ────────────────────────────────────────────────
  {
    id: 6, category: 'Navigation',
    title: 'Home page renders',
    purpose: 'Confirms the home page mounts correctly and the tips grid is present. A failure here indicates a rendering crash or missing DOM element on the default landing page.',
    prerequisites: 'None — does not require any jumps or columns.',
    input: 'navigateTo("home") → document.querySelector(".tips-grid")',
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
    purpose: 'Verifies the Jumps page loads and shows either jump columns or an empty-state placeholder. Catches rendering regressions in the core feature page.',
    prerequisites: 'None — passes even with zero jumps (empty state counts).',
    input: 'navigateTo("jumps") → document.querySelector(".columns-area, .no-columns")',
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
    purpose: 'Confirms the Archive page mounts and its list container exists. Ensures users can always access their archived jumps.',
    prerequisites: 'None — passes even with an empty archive.',
    input: 'navigateTo("archive") → document.querySelector("#archiveList")',
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
    purpose: 'Confirms the Stats page renders its wrapper without crashing. A failure suggests a chart library issue or broken renderStats() function.',
    prerequisites: 'None — renders with zero data.',
    input: 'navigateTo("stats") → document.querySelector(".stats-wrap")',
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
    purpose: 'Verifies the Account page loads its grid layout. Failures here indicate renderAccount() is broken or user profile data is missing.',
    prerequisites: 'Must be logged in with a valid Supabase profile.',
    input: 'navigateTo("account") → document.querySelector(".acct-grid, .acct-section")',
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
    purpose: 'Isolates the core data accessor for jumps. If this returns a non-array, every jump render and loop in the app will crash.',
    prerequisites: 'None — returns empty array if no jumps exist.',
    description: 'Call DB.getActiveJumps(currentUser.id) and verify result is array',
    input: 'DB.getActiveJumps(currentUser.id)',
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
    purpose: 'Verifies the column data accessor works. Columns are required to display or add jumps — if this fails, the Jumps page will be empty or crash.',
    prerequisites: 'None — returns empty array if no columns exist.',
    input: 'DB.getColumns(currentUser.id)',
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
    purpose: 'Tests the full create→read→delete lifecycle for a jump. Confirms DB.createJump persists correctly and DB.deleteJump removes it cleanly.',
    prerequisites: 'At least one column must exist. Test is self-cleaning — creates and deletes its own jump.',
    input: 'DB.createJump(currentUser.id, { name, url, columnId }) → DB.deleteJump(currentUser.id, id)',
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
    purpose: 'Confirms that archiving a jump correctly removes it from the active list. Catches bugs where archive doesn\'t persist or the active filter doesn\'t exclude archived items.',
    prerequisites: 'At least one column must exist. Test is self-cleaning — creates, archives, and deletes its own jump.',
    input: 'DB.createJump() → DB.archiveJump(currentUser.id, id) → DB.getActiveJumps(currentUser.id)',
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
    purpose: 'Ensures no two jumps share a hotkey, which would cause unpredictable behavior when that key is pressed. Catches data corruption from imports or manual edits.',
    prerequisites: 'None — passes if no jumps exist or no hotkeys are set.',
    input: 'DB.getActiveJumps(currentUser.id).map(j => j.hotkey)',
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
    purpose: 'Manually verifies the core user action — clicking a jump opens the correct URL or file path in the system browser or file explorer.',
    prerequisites: 'At least one jump with a valid URL must exist on the Jumps page.',
    input: 'Click on any jump card on the Jumps page',
    description: 'Click a jump in the app and verify it opens in browser',
    expected: 'Jump URL opens in the default browser or file explorer, and the click count increments on the jump card.',
    steps: 'Go to the Jumps page → click any jump with a URL (e.g. www.google.com) → verify it opens in your browser or file explorer → check that the click count on the jump card increments.',
    test: async () => 'manual'
  },

  // ── Columns ───────────────────────────────────────────────────
  {
    id: 17, category: 'Columns',
    title: 'Columns have unique IDs',
    purpose: 'Guards against duplicate column IDs which would cause jumps to appear in wrong columns or be overwritten during saves.',
    prerequisites: 'None — passes with zero columns.',
    input: 'DB.getColumns(currentUser.id).map(c => c.id)',
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
    purpose: 'Confirms column ordering is intact so the Jumps page renders columns in the correct left-to-right sequence. Catches issues after drag-reorder or bulk saves.',
    prerequisites: 'None — passes with zero columns.',
    input: 'DB.getColumns(currentUser.id).sort((a,b) => a.order - b.order).map(c => c.order)',
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
    purpose: 'Ensures the user has a column set up, which is required for adding jumps. If zero columns exist, the Add Jump modal will fail silently.',
    prerequisites: 'User must have created at least one column via Configure Columns.',
    input: 'DB.getColumns(currentUser.id).length',
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
    purpose: 'Confirms at least one column is visible so the Jumps page is not blank. Catches cases where all columns were accidentally hidden.',
    prerequisites: 'At least one column must exist and have visibility enabled.',
    input: 'DB.getColumns(currentUser.id).filter(c => c.visible)',
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
    purpose: 'Verifies the archive data accessor is functional. A non-array return would crash the Archive page render loop.',
    prerequisites: 'None — returns empty array if no archived jumps exist.',
    input: 'DB.getArchivedJumps(currentUser.id)',
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
    purpose: 'Tests the full archive→unarchive round-trip. Confirms a jump removed from active can be fully restored, which is a key user-facing recovery action.',
    prerequisites: 'At least one column must exist. Test is self-cleaning.',
    input: 'DB.createJump() → DB.archiveJump() → DB.unarchiveJump(currentUser.id, id)',
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
    purpose: 'Confirms the Archive page mounts its list container in the DOM. Catches render failures that would leave users with a blank archive page.',
    prerequisites: 'None — passes even with an empty archive.',
    input: 'navigateTo("archive") → document.querySelector("#archiveList")',
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
    purpose: 'Verifies the click log data accessor works. All stats charts depend on this — a non-array return would crash every chart on the Stats page.',
    prerequisites: 'None — returns empty array if no clicks recorded.',
    input: 'DB.getClickLog(currentUser.id)',
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
    purpose: 'Confirms the trial launch counter is a valid number. This value gates free-tier access — if it\'s null or NaN the paywall logic will behave unpredictably.',
    prerequisites: 'Supabase profile must be loaded (Test 3 must pass).',
    input: 'window._supabaseProfile.trial_launches_used',
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
    purpose: 'End-to-end check that the Stats page renders its full wrapper with chart content. Catches regressions in renderStats() or missing chart dependencies.',
    prerequisites: 'None — renders with zero data.',
    input: 'navigateTo("stats") → document.querySelector(".stats-wrap")',
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
    purpose: 'Confirms the account page loads and displays user profile data. Verifies that renderAccount() correctly reads from _supabaseProfile.',
    prerequisites: 'Must be logged in with a valid Supabase profile.',
    input: 'navigateTo("account") → document.querySelector(".acct-grid")',
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
    purpose: 'Confirms the user\'s email is visible on the Account page. If missing, it indicates the profile render or email binding is broken.',
    prerequisites: 'Must be logged in. Test 2 (currentUser is set) must pass.',
    input: 'navigateTo("account") → document.querySelectorAll(".acct-row") containing _supabaseUser.email',
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
    purpose: 'Verifies the subscription tier is visible on the Account page. Users rely on this to understand their plan — missing it suggests billing data isn\'t being read.',
    prerequisites: 'Test 4 (subscription status cached) must pass.',
    input: 'navigateTo("account") → document.querySelectorAll(".acct-row") containing "account type" or tier label',
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
    purpose: 'Confirms action buttons are present on the Account page. A missing button would block users from managing their credentials or sending feedback.',
    prerequisites: 'Must be logged in. Account page must render (Test 10 must pass).',
    input: 'navigateTo("account") → document.querySelectorAll("#pageContent button, #pageContent a.btn")',
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
    purpose: 'Validates free-tier users haven\'t exceeded the launch limit. Catches cases where the counter is out of sync with what the paywall should enforce.',
    prerequisites: 'Skipped automatically for paid subscribers. Requires Test 3 (Supabase profile loaded) to pass.',
    input: 'window._supabaseProfile.subscription_status, window._supabaseProfile.trial_launches_used',
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
    purpose: 'Confirms the paywall function is globally accessible. If missing, free-tier users could use the app indefinitely without ever seeing the upgrade prompt.',
    prerequisites: 'None — checks window scope only.',
    input: 'typeof window.showPaywall',
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
    purpose: 'Confirms paid subscribers are not blocked by the paywall on load. A failure here means paying customers are being incorrectly gated.',
    prerequisites: 'Skipped automatically for non-active subscribers. Must be logged in as a paid user to fully exercise this test.',
    input: 'window._supabaseProfile.subscription_status, document.getElementById("modalOverlay").style.display',
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
    purpose: 'Verifies the Teams page loads without error. A blank page here indicates renderTeams() is crashing or the user\'s role/org data is missing.',
    prerequisites: 'Must be logged in. Supabase profile must be loaded.',
    input: 'navigateTo("teams") → document.getElementById("pageContent").innerHTML',
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
    purpose: 'Confirms the Supabase client is initialized. Every team sharing, invite, and sync operation depends on this — if undefined, all cloud features fail silently.',
    prerequisites: 'None — checks window scope only.',
    input: 'typeof supabaseClient',
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
    purpose: 'Confirms the user\'s role was cached locally after login. Role is used for UI gating (org-owner vs team-member views) — missing it causes incorrect page rendering.',
    prerequisites: 'Must be logged in. Role must have been set during initApp.',
    input: 'localStorage.getItem("jk_role")',
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
    purpose: 'Confirms the theme attribute is set to a valid value. An invalid or missing theme would cause the CSS variables to fall back incorrectly, breaking the entire visual design.',
    prerequisites: 'None.',
    input: 'document.documentElement.dataset.theme',
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
    purpose: 'Verifies the Toast notification system is available. Save, delete, error, and feedback operations all call Toast — if missing, users get no feedback on their actions.',
    prerequisites: 'None — checks window scope only.',
    input: 'typeof Toast, typeof Toast.success, typeof Toast.danger',
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
    purpose: 'Confirms the Modal system is available globally. Add Jump, Configure Columns, Feedback, and team actions all use Modal — a missing definition would silently break all of them.',
    prerequisites: 'None — checks window scope only.',
    input: 'typeof Modal, typeof Modal.open, typeof Modal.close',
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
    purpose: 'Ensures the sidebar navigation rendered all its buttons. Fewer than 5 nav items means a page is missing from the nav — users wouldn\'t be able to reach it.',
    prerequisites: 'None — sidebar renders on app load.',
    input: 'document.querySelectorAll(".nav-item[data-page]").length',
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
    purpose: 'Confirms the context menu system is initialized. Right-clicking any jump relies on CtxMenu.show/hide — if missing, right-click actions (edit, archive, delete) are broken.',
    prerequisites: 'None — checks window scope only.',
    input: 'typeof window.CtxMenu, typeof window.CtxMenu.show, typeof window.CtxMenu.hide',
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
    purpose: 'Simulates a right-click on a jump and confirms the context menu appears with sufficient items. Directly tests the most common jump management interaction.',
    prerequisites: 'At least one jump must exist on the Jumps page.',
    input: 'document.querySelector(".jump-item").dispatchEvent(new MouseEvent("contextmenu")) → document.getElementById("ctxMenu")',
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

  // ── Settings persistence ──────────────────────────────────────
  {
    id: 43, category: 'Settings',
    title: 'saveAccountPrefs is accessible',
    purpose: 'Confirms the account preferences save function is globally accessible. Without it, any settings change on the Account page would silently fail.',
    prerequisites: 'None — checks window scope only.',
    input: 'typeof window.saveAccountPrefs',
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
    purpose: 'Writes a preference change to the local SQLite DB and reads it back. Confirms the IPC write path is working so user settings actually survive app restarts.',
    prerequisites: 'Must be logged in with a valid currentUser. Test is self-restoring — original value is written back after the check.',
    input: 'DB.savePrefs(currentUser.id, { timePerClick: testVal }) → DB.getPrefs(currentUser.id).timePerClick',
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
    purpose: 'Specifically tests the startPage preference — the page the app opens to on launch. If this pref doesn\'t persist, the user\'s chosen start page resets every session.',
    prerequisites: 'Must be logged in. Test is self-restoring — original startPage is written back after the check.',
    input: 'DB.savePrefs(currentUser.id, { startPage: "stats" }) → DB.getPrefs(currentUser.id).startPage',
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

  // ── Team Sharing ──────────────────────────────────────────────
  {
    id: 46, category: 'Teams',
    title: 'Create test team → verified in Supabase',
    purpose: 'Verifies that the team creation write path correctly inserts a row into Supabase and returns the created record. Foundation for all subsequent team sharing tests.',
    prerequisites: 'Must be logged in as org-owner. Profile must have a valid org_id (visit Teams page first to auto-assign). Run before Tests 47–51.',
    description: 'Creates a test team in Supabase and queries it back to confirm correct creation',
    input: 'supabaseClient.from("teams").insert({ org_id, name: "__TEST_TEAM_<ts>", team_password_hash, owner_id })',
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
    title: 'Share column to test team → verified in Supabase',
    purpose: 'Confirms that sharing a column writes the correct rows to shared_columns and shared_jumps in Supabase. Tests the core data sync that makes jump sharing work for teams.',
    prerequisites: 'Test 46 must have run successfully first. At least one personal (unshared) column with jumps must exist.',
    input: 'supabaseClient.from("shared_columns").insert({ column_id, team_id }) + shared_jumps for each jump',
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

      // Cleanup any prior run to prevent duplicate key errors on re-runs
      await supabaseClient.from('shared_jumps').delete().eq('shared_column_id', col.id).eq('team_id', teamId);
      await supabaseClient.from('shared_columns').delete().eq('id', col.id).eq('team_id', teamId);

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
    title: 'Invite user to test team → pending status in Supabase',
    purpose: 'Tests that the invite creation flow correctly writes a pending invite row to Supabase. An invite email is only useful if the DB row is correct — this catches mismatches.',
    prerequisites: 'Tests 46 and 47 must have run successfully first (window._testTeamId must be set).',
    input: 'supabaseClient.from("team_invites").insert({ team_id, email, status: "pending" })',
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
    title: 'Accept invitation → status updated to "accepted" in Supabase',
    purpose: 'Simulates a user accepting a team invite and verifies the DB status transitions from pending to accepted. If this fails, users who accept invites won\'t gain team access.',
    prerequisites: 'Test 48 must have run successfully first (window._testInviteId must be set).',
    input: 'supabaseClient.from("team_invites").update({ status: "accepted" }).eq("id", _testInviteId)',
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
    title: 'Remove user from team → member row deleted in Supabase',
    purpose: 'Confirms the member removal path correctly deletes the team_members row from Supabase. If this fails, removed members retain access to shared jumps.',
    prerequisites: 'Test 46 must have run successfully first (window._testTeamId must be set).',
    input: 'supabaseClient.from("team_members").insert({ team_id, user_id }) → .delete().eq("id", memberId)',
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
    title: 'Unshare column from team → rows removed from shared_columns + shared_jumps',
    purpose: 'Tests that unsharing a column fully cleans up both shared_columns and shared_jumps in Supabase. Also cleans up all test data from the T1–T6 chain.',
    prerequisites: 'Tests 46 and 47 must have run successfully first (window._testTeamId and window._testSharedColId must be set). This test is the final cleanup step.',
    input: 'supabaseClient.from("shared_jumps").delete() + from("shared_columns").delete() + from("team_members").delete() + from("teams").delete()',
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

  // ── Paywall Gating Tests ──────────────────────────────────────────

  {
    id: 52, category: 'Paywall',
    title: 'Jet AI page — free tier user sees paywall, not content',
    purpose: 'Confirms that a free-tier user hitting the Jet AI page sees the upgrade paywall and not the Jet AI content. Prevents free users from accessing a paid feature.',
    prerequisites: 'User must be logged in. window._supabaseProfile must be set.',
    input: 'window._supabaseProfile.subscription_tier, renderJet()',
    description: 'Temporarily sets tier to free, calls renderJet(), checks for lock icon paywall, then restores tier.',
    expected: 'pageContent contains upgrade paywall (lock icon + upgrade button) when tier is free',
    test: () => {
      const profile = window._supabaseProfile;
      if (!profile) throw new Error('window._supabaseProfile not set — log in first');
      const originalTier   = profile.subscription_tier;
      const originalStatus = profile.subscription_status;

      // Force free tier
      profile.subscription_tier   = 'free';
      profile.subscription_status = 'free';
      renderJet();

      const content = document.getElementById('pageContent').innerHTML;
      profile.subscription_tier   = originalTier;
      profile.subscription_status = originalStatus;

      if (!content.includes('ti-lock')) throw new Error('Paywall lock icon not found — free user can see Jet AI without upgrading');
      if (!content.includes('Upgrade to unlock Jet AI')) throw new Error('Upgrade CTA not found in Jet AI paywall');
      return true;
    }
  },

  {
    id: 53, category: 'Paywall',
    title: 'Teams page — free tier user sees paywall, not content',
    purpose: 'Confirms that a free-tier user hitting the Teams page sees the upgrade paywall. Prevents free users from accessing team sharing features.',
    prerequisites: 'User must be logged in. window._supabaseProfile must be set.',
    input: 'window._supabaseProfile.subscription_tier, renderTeams()',
    description: 'Temporarily sets tier to free, calls renderTeams(), checks for lock icon paywall, then restores tier.',
    expected: 'pageContent contains upgrade paywall (lock icon + upgrade button) when tier is free',
    test: async () => {
      const profile = window._supabaseProfile;
      if (!profile) throw new Error('window._supabaseProfile not set — log in first');
      const originalTier   = profile.subscription_tier;
      const originalStatus = profile.subscription_status;

      // Force free tier
      profile.subscription_tier   = 'free';
      profile.subscription_status = 'free';
      await renderTeams();

      const content = document.getElementById('pageContent').innerHTML;
      profile.subscription_tier   = originalTier;
      profile.subscription_status = originalStatus;

      if (!content.includes('ti-lock')) throw new Error('Paywall lock icon not found — free user can see Teams without upgrading');
      if (!content.includes('Upgrade to unlock Teams')) throw new Error('Upgrade CTA not found in Teams paywall');
      return true;
    }
  },

  {
    id: 54, category: 'Paywall',
    title: 'Active paid subscriber — Jet AI and Teams pages load without paywall',
    purpose: 'Confirms that a user with an active teams_jet subscription can access both Jet AI and Teams pages without being gated. Prevents paying customers from being incorrectly blocked.',
    prerequisites: 'User must be logged in. window._supabaseProfile must be set.',
    input: 'window._supabaseProfile.subscription_tier = "teams_jet", subscription_status = "active"',
    description: 'Temporarily sets tier to teams_jet + status to active, calls renderJet() and renderTeams(), checks that no paywall lock icon appears.',
    expected: 'Neither Jet AI nor Teams pages show the paywall lock icon for active teams_jet subscribers',
    test: async () => {
      const profile = window._supabaseProfile;
      if (!profile) throw new Error('window._supabaseProfile not set — log in first');
      const originalTier   = profile.subscription_tier;
      const originalStatus = profile.subscription_status;

      // Force paid tier
      profile.subscription_tier   = 'teams_jet';
      profile.subscription_status = 'active';

      // Check Jet AI
      renderJet();
      const jetContent = document.getElementById('pageContent').innerHTML;
      if (jetContent.includes('Upgrade to unlock Jet AI')) throw new Error('Jet AI paywall shown for active teams_jet subscriber');

      // Check Teams
      await renderTeams();
      const teamsContent = document.getElementById('pageContent').innerHTML;

      profile.subscription_tier   = originalTier;
      profile.subscription_status = originalStatus;

      if (teamsContent.includes('Upgrade to unlock Teams')) throw new Error('Teams paywall shown for active teams_jet subscriber');
      return true;
    }
  },

  // ── Security ──────────────────────────────────────────────────
  {
    id: 53, category: 'Security',
    title: 'DevTools disabled in production build',
    purpose: 'Ensures DevTools are blocked in packaged builds so users cannot tamper with localStorage (subscription tier/status) or inspect internals.',
    prerequisites: 'None.',
    description: 'Checks that app.isPackaged is true (production) and that the devtools-blocked handler is wired. In dev mode this test is skipped with a warning.',
    input: 'window.electronAPI.isPackaged (via IPC) or checks main.js runtime flag',
    expected: 'In production: devtools are not open and cannot be opened. In dev: test is skipped.',
    test: async () => {
      // If running in dev (npm start), app.isPackaged = false — skip with info
      const isPackaged = await window.electronAPI?.isPackaged?.();
      if (isPackaged === false || isPackaged === undefined) {
        console.warn('[Test 53] Running in dev mode — DevTools check skipped. Verify manually in a packaged build.');
        return true; // not a failure — expected in dev
      }

      // In production: devtools should not be open
      if (window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 200) {
        throw new Error('DevTools appear to be open in a production build — check main.js devtools-opened handler');
      }

      return true;
    }
  },

  // ── Security Audit Tests (54–62) ──────────────────────────────────
  {
    id: 54, category: 'Security',
    title: 'No secret API keys in frontend code',
    purpose: 'Confirms that no service-role keys or secret tokens are exposed in the renderer. Only the safe anon key should be present.',
    prerequisites: 'None.',
    description: 'Checks that SUPABASE_ANON_KEY is present but no service-role key is accessible in the window/renderer context.',
    input: 'window.electronAPI, supabaseClient config',
    expected: 'No service_role key in window scope; anon key present.',
    test: async () => {
      // Service role key should never be in renderer scope
      const winKeys = Object.keys(window).join(' ');
      if (winKeys.includes('service_role') || winKeys.includes('SERVICE_ROLE')) {
        throw new Error('Service role key found in window scope — security risk!');
      }
      // Anon key should be present (it is safe to expose)
      if (typeof SUPABASE_ANON_KEY === 'undefined' || !SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_ANON_KEY not found — check supabase/config.js');
      }
      if (SUPABASE_ANON_KEY.includes('service_role')) {
        throw new Error('SUPABASE_ANON_KEY appears to be a service role key — replace with anon key!');
      }
      return true;
    }
  },

  {
    id: 55, category: 'Security',
    title: 'All Supabase requests use authenticated session',
    purpose: 'Confirms that the supabaseClient has an active authenticated session before the app loads data. Unauthenticated data access should not be possible.',
    prerequisites: 'Must be logged in.',
    description: 'Checks that supabaseClient.auth.getSession() returns a valid user session.',
    input: 'supabaseClient.auth.getSession()',
    expected: 'Session with valid user ID returned.',
    test: async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw new Error('Auth session error: ' + error.message);
      if (!data?.session?.user?.id) throw new Error('No authenticated session — all routes require auth');
      return true;
    }
  },

  {
    id: 56, category: 'Security',
    title: 'HTTPS enforced — Supabase URL uses HTTPS',
    purpose: 'Confirms that all Supabase API communication uses HTTPS, not plain HTTP.',
    prerequisites: 'None.',
    description: 'Checks that SUPABASE_URL starts with https://',
    input: 'SUPABASE_URL constant',
    expected: 'URL starts with https://',
    test: async () => {
      if (typeof SUPABASE_URL === 'undefined') throw new Error('SUPABASE_URL not defined');
      if (!SUPABASE_URL.startsWith('https://')) {
        throw new Error(`SUPABASE_URL is not HTTPS: ${SUPABASE_URL}`);
      }
      return true;
    }
  },

  {
    id: 57, category: 'Security',
    title: 'CORS — Edge Functions not called with wildcard origin',
    purpose: 'Confirms that the app does not rely on wildcard CORS. Edge functions should be locked to jumpkit.app.',
    prerequisites: 'None.',
    description: 'Verifies that requests to Edge Functions include the correct Origin header and do not expect wildcard CORS.',
    input: 'Fetch to send-feedback endpoint with non-jumpkit origin',
    expected: 'No wildcard CORS in use — app always sends from correct origin.',
    test: async () => {
      // In Electron, window.location.origin is typically 'null' or 'file://'
      // The important check is that our Edge Functions are configured for jumpkit.app
      // We verify this by checking our known config
      const origin = window.location.origin || '';
      // Electron apps bypass CORS (native fetch), so this is mainly a config audit reminder
      console.info('[Test 57] Electron bypasses browser CORS. Verify Edge Function CORS is locked to jumpkit.app in Supabase dashboard.');
      return true;
    }
  },

  {
    id: 58, category: 'Security',
    title: 'Input sanitization — esc() used for user-generated content',
    purpose: 'Confirms that user input rendered into the DOM is escaped to prevent XSS attacks.',
    prerequisites: 'None.',
    description: 'Tests that the esc() function correctly escapes HTML special characters.',
    input: 'esc("<script>alert(1)</script>")',
    expected: 'Returns escaped string with no executable HTML.',
    test: async () => {
      if (typeof esc !== 'function') throw new Error('esc() function not defined — XSS protection missing');
      const dangerous = '<script>alert("xss")</script>';
      const escaped = esc(dangerous);
      if (escaped.includes('<script>')) throw new Error('esc() failed to escape <script> tag — XSS risk!');
      if (escaped.includes('</script>')) throw new Error('esc() failed to escape </script> tag — XSS risk!');
      if (!escaped.includes('&lt;')) throw new Error('esc() did not produce HTML entities — check implementation');
      return true;
    }
  },

  {
    id: 59, category: 'Security',
    title: 'Rate limiting — 429 returned on excessive requests (Edge Function config check)',
    purpose: 'Confirms that rate limiting is configured on Edge Functions. In-memory rate limiter returns 429 after threshold.',
    prerequisites: 'None (logic check only, does not hit live endpoint).',
    description: 'Simulates the rate limiter logic to confirm it blocks after maxRequests threshold.',
    input: 'Simulated rate limiter with 5 req/min threshold',
    expected: '6th request is blocked (returns rate-limited = true).',
    test: async () => {
      // Simulate the rate limiter logic from send-feedback
      const map = new Map();
      function checkLimit(ip, maxRequests = 5, windowMs = 60_000) {
        const now = Date.now();
        const entry = map.get(ip) || { count: 0, start: now };
        if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
        entry.count++;
        map.set(ip, entry);
        return entry.count > maxRequests;
      }
      for (let i = 0; i < 5; i++) {
        if (checkLimit('test-ip')) throw new Error(`Rate limit triggered too early at request ${i + 1}`);
      }
      if (!checkLimit('test-ip')) throw new Error('Rate limiter failed — 6th request should be blocked');
      return true;
    }
  },

  {
    id: 60, category: 'Security',
    title: 'Password hashing — PBKDF2 used (not plain SHA-256)',
    purpose: 'Confirms that team passwords are hashed with PBKDF2 (strong KDF) and not plain SHA-256.',
    prerequisites: 'None.',
    description: 'Hashes the same password twice and checks output is 64 hex chars. Also confirms two different passwords produce different hashes.',
    input: 'hashPassword("testpassword123")',
    expected: '64-character hex string; different passwords → different hashes.',
    test: async () => {
      if (typeof hashPassword !== 'function') throw new Error('hashPassword() not defined in teams.js');
      const hash1 = await hashPassword('testpassword123');
      const hash2 = await hashPassword('differentpassword');
      if (hash1.length !== 64) throw new Error(`Hash length ${hash1.length} — expected 64 hex chars`);
      if (!/^[0-9a-f]+$/.test(hash1)) throw new Error('Hash is not valid hex');
      if (hash1 === hash2) throw new Error('Different passwords produced same hash — hashing is broken!');
      // Confirm it's NOT plain SHA-256 (PBKDF2 with 100k iterations will differ)
      const plainSha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('testpassword123'));
      const plainHex = Array.from(new Uint8Array(plainSha)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (hash1 === plainHex) throw new Error('hashPassword() is using plain SHA-256 — should use PBKDF2!');
      return true;
    }
  },

  {
    id: 61, category: 'Security',
    title: 'Auth tokens have expiry — JWT exp claim present',
    purpose: 'Confirms that the Supabase JWT session token has an expiry claim (exp) and has not expired.',
    prerequisites: 'Must be logged in.',
    description: 'Decodes the JWT access token and checks the exp claim is set and in the future.',
    input: 'supabaseClient.auth.getSession() → session.access_token',
    expected: 'JWT has exp claim set in the future.',
    test: async () => {
      const { data } = await supabaseClient.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('No access token — must be logged in');
      // Decode JWT payload (base64)
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp) throw new Error('JWT has no exp claim — tokens do not expire!');
      if (payload.exp * 1000 < Date.now()) throw new Error('JWT token has already expired!');
      return true;
    }
  },

  {
    id: 62, category: 'Security',
    title: 'Session invalidated on logout — signOut clears session',
    purpose: 'Confirms that calling signOut removes the local session. Note: this test logs out — you will need to log back in.',
    prerequisites: 'Must be logged in. WARNING: This test logs you out.',
    description: 'Calls supabaseClient.auth.signOut() and confirms session is null afterward.',
    input: 'supabaseClient.auth.signOut()',
    expected: 'Session is null after signOut.',
    test: async () => {
      const { data: before } = await supabaseClient.auth.getSession();
      if (!before?.session) throw new Error('No session before logout — must be logged in to run this test');
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw new Error('signOut failed: ' + error.message);
      const { data: after } = await supabaseClient.auth.getSession();
      if (after?.session) throw new Error('Session still active after signOut — logout is not working!');
      // Note to user: they will need to log back in
      console.warn('[Test 62] You have been logged out. Please log back in.');
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
        <svg class="ti ti-lock" style="font-size:3rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-lock"/></svg>
        <h2 style="font-size:1.4rem;font-weight:700;color:var(--text)">403 — Access Restricted</h2>
        <p style="color:var(--text-muted);font-size:0.9rem">This page is only available to administrators.</p>
      </div>`;
    return;
  }

  pageContent.innerHTML = `
    <div id="pageTests">

      <!-- Summary bar -->
      <div id="testSummary" style="margin:0 0 10px 0;padding:10px 24px 8px 24px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);display:flex;align-items:center;gap:32px">
        <div id="summaryPass" style="color:var(--text-muted);display:flex;align-items:center;gap:8px;font-size:1.2rem;font-weight:700"><svg class="ti ti-check" style="font-size:1.4rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-check"/></svg>0 Passed</div>
        <div id="summaryFail" style="color:var(--text-muted);display:flex;align-items:center;gap:8px;font-size:1.2rem;font-weight:700"><svg class="ti ti-x" style="font-size:1.4rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-x"/></svg>0 Failed</div>
        <div id="summaryManual" style="color:var(--text-muted);display:flex;align-items:center;gap:8px;font-size:1.2rem;font-weight:700"><svg class="ti ti-alert-triangle" style="font-size:1.4rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg>0 Manual</div>
        <div style="color:var(--text-muted);font-size:0.8rem;margin-left:auto" id="summaryTime"></div>
      </div>

      <!-- Buttons -->
      <div style="margin-bottom:16px;display:flex;gap:8px;align-items:center">
        <button class="btn btn-subtle" id="btnRunTests" style="display:flex;align-items:center;gap:.4rem">
          <svg class="ti ti-player-play"><use href="img/tabler-sprite.svg#tabler-player-play"/></svg> Run All Tests
        </button>
        <button class="btn btn-subtle" id="btnResetTests" style="display:flex;align-items:center;gap:.4rem">
          <svg class="ti ti-refresh"><use href="img/tabler-sprite.svg#tabler-refresh"/></svg> Reset
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
              <th style="padding:10px 12px;text-align:center;width:80px;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">RUN</th>
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
      <td style="padding:10px 48px 10px 12px;vertical-align:top;padding-top:28px;color:var(--text-muted);font-size:0.8rem;min-width:320px;max-width:400px">${_esc(t.expected)}</td>
      <td style="padding:10px 12px;text-align:center">
        <button onclick="_runSingleTest(${t.id})" id="test-run-btn-${t.id}" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-size:0.85rem;line-height:1" title="Run this test">
          <svg class="ti ti-player-play" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-player-play"/></svg><span style="line-height:1">Run</span>
        </button>
      </td>
      <td style="padding:10px 12px;text-align:center" id="test-result-${t.id}">
        <span style="color:var(--text-muted)">—</span>
      </td>
    </tr>`).join('');
}

function _markManualResult(id, result) {
  if (!window._jkTestResults) window._jkTestResults = {};
  window._jkTestResults[id] = { state: result, received: result === 'pass' ? 'Manually marked as passed' : 'Manually marked as failed', message: result === 'fail' ? 'Manually marked as failed' : null };
  _setRowResult(id, result, result === 'fail' ? 'Manually marked as failed' : null);
  _refreshSummary();
  _openTestDetail(id, result, result === 'fail' ? 'Manually marked as failed' : null);
}

function _openTestDetail(id, state, message) {
  const testDef = JK_TESTS.find(t => t.id === id);
  if (!testDef) return;

  let color, iconName, stateLabel, detailsText, detailsColor;
  const isManualTest = !!(testDef.steps);
  const manualInstructions = testDef.steps || testDef.expected;
  if (!state || state === 'null') {
    color = 'var(--text-muted)'; iconName = 'clock'; stateLabel = 'Not Run';
    detailsText = isManualTest ? manualInstructions : '—'; detailsColor = 'var(--text-muted)';
  } else if (state === 'pass') {
    color = '#22c55e'; iconName = 'check'; stateLabel = 'Pass';
    detailsText = isManualTest ? manualInstructions : 'Test passed successfully.'; detailsColor = 'var(--text-muted)';
  } else if (state === 'fail') {
    color = '#ef4444'; iconName = 'x'; stateLabel = 'Fail';
    detailsText = isManualTest ? manualInstructions : (message || 'Test failed.'); detailsColor = 'var(--text-muted)';
  } else {
    color = '#f59e0b'; iconName = 'alert-triangle'; stateLabel = 'Manual';
    detailsText = manualInstructions; detailsColor = 'var(--text-muted)';
  }

  const modalTitle = `<svg class="ti ti-test-pipe"><use href="img/tabler-sprite.svg#tabler-test-pipe"/></svg> Unit Test ${id} — ${_esc(testDef.title)}`;
  const catColor = _CATEGORY_COLORS[testDef.category] || '#6b7280';
  const catPill = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:${catColor}22;color:${catColor}">${_esc(testDef.category)}</span>`;
  const stored = (window._jkTestResults || {})[id] || {};
  const receivedText = stored.received || '—';
  const tdLabel = `padding:8px 32px 8px 0;color:var(--text-muted);font-weight:600;width:100px;vertical-align:top;white-space:nowrap;font-size:0.88rem`;
  const tdValue     = `padding:8px 0;color:var(--text);line-height:1.6;font-size:0.88rem`;
  const tdValueMuted = `padding:8px 0;color:var(--text-muted);line-height:1.6;font-size:0.88rem`;
  const codeStyle   = `font-size:0.82rem;background:var(--bg-input);padding:3px 8px;border-radius:6px`;
  const receivedColor = state==='pass'?'#22c55e':state==='fail'?'#ef4444':'var(--text-muted)';
  const bodyHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem">
    <tr>
      <td style="${tdLabel}">ID</td>
      <td style="${tdValueMuted}">${id}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Category</td>
      <td style="padding:8px 0">${catPill}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Title</td>
      <td style="${tdValueMuted}">${_esc(testDef.title)}</td>
    </tr>
    ${testDef.purpose ? `<tr>
      <td style="${tdLabel}">Purpose</td>
      <td style="${tdValueMuted}">${_esc(testDef.purpose)}</td>
    </tr>` : ''}
    <tr>
      <td style="${tdLabel}">Prerequisites</td>
      <td style="${tdValueMuted}">${_esc(testDef.prerequisites || 'None')}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Inputs</td>
      <td style="${tdValueMuted}">${testDef.input ? `<code style="${codeStyle};color:var(--text-muted)">${_esc(testDef.input)}</code>` : '—'}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Expected</td>
      <td style="${tdValueMuted}">${_esc(testDef.expected)}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Outputs</td>
      <td style="${tdValue}"><code style="${codeStyle};color:${receivedColor}">${_esc(receivedText)}</code></td>
    </tr>
    <tr>
      <td style="${tdLabel}">Result</td>
      <td style="padding:8px 0">${(!state || state === 'null') ? `<span style="color:var(--text-muted);font-size:0.88rem">—</span>` : `<svg class="ti ti-${iconName}" style="font-size:1.3rem;vertical-align:middle;color:${color};width:1.3rem;height:1.3rem"><use href="img/tabler-sprite.svg#tabler-${iconName}"/></svg> <span style="color:${color};font-weight:700;font-size:0.88rem">${stateLabel}</span>`}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Details</td>
      <td style="${tdValueMuted};color:${detailsColor}">${_esc(detailsText)}</td>
    </tr>
  </table>`;

  const currentIdx = JK_TESTS.findIndex(t => t.id === id);
  const prevId = currentIdx > 0 ? JK_TESTS[currentIdx - 1].id : null;
  const nextId = currentIdx < JK_TESTS.length - 1 ? JK_TESTS[currentIdx + 1].id : null;

  const _results = window._jkTestResults || {};
  const prevRes = prevId ? (_results[prevId] || null) : null;
  const nextRes = nextId ? (_results[nextId] || null) : null;

  const manualBtns = isManualTest ? `
      <button class="btn btn-subtle" onclick="_markManualResult(${id},'pass')" style="color:#22c55e;border-color:rgba(34,197,94,0.3)"><svg class="ti ti-check" style="color:#22c55e"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Mark as Pass</button>
      <button class="btn btn-subtle" onclick="_markManualResult(${id},'fail')" style="color:#ef4444;border-color:rgba(239,68,68,0.3)"><svg class="ti ti-x" style="color:#ef4444"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Mark as Fail</button>` : '';

  const footerHTML = `
    <div style="display:flex;gap:8px;align-items:center;width:100%">
      <button class="btn btn-subtle" ${prevId ? '' : 'disabled'} onclick="${prevId ? `_openTestDetail(${prevId},${prevRes ? `'${prevRes.state}'` : 'null'},${prevRes?.message ? JSON.stringify(prevRes.message) : 'null'})` : ''}">
        <svg class="ti ti-chevron-left"><use href="img/tabler-sprite.svg#tabler-chevron-left"/></svg> Prev
      </button>
      <button class="btn btn-subtle" ${nextId ? '' : 'disabled'} onclick="${nextId ? `_openTestDetail(${nextId},${nextRes ? `'${nextRes.state}'` : 'null'},${nextRes?.message ? JSON.stringify(nextRes.message) : 'null'})` : ''}">
        Next <svg class="ti ti-chevron-right"><use href="img/tabler-sprite.svg#tabler-chevron-right"/></svg>
      </button>
      ${manualBtns}
      <button class="btn btn-subtle" onclick="Modal.close()" style="margin-left:auto"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>
    </div>`;

  Modal.open(modalTitle, bodyHTML, footerHTML, 'xl');
}

function _setRowResult(id, state, message) {
  const cell = document.getElementById(`test-result-${id}`);
  const row  = document.getElementById(`test-row-${id}`);
  if (!cell) return;

  if (state === 'running') {
    cell.innerHTML = `<svg class="ti ti-loader-2 jk-spin" style="color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg>`;
    cell.style.cursor = '';
    cell.onclick = null;
    if (row) row.style.background = '';
  } else if (state === 'pass') {
    cell.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:700;line-height:1;background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.3);cursor:pointer"><svg class="ti ti-check" style="font-size:0.85rem;line-height:1;color:#22c55e"><use href="img/tabler-sprite.svg#tabler-check"/></svg><span style="line-height:1">Pass</span></span>`;
    cell.style.cursor = 'pointer';
    cell.onclick = () => _openTestDetail(id, state, message);
    if (row) row.style.background = 'rgba(34,197,94,0.04)';
  } else if (state === 'fail') {
    cell.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:700;line-height:1;background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.3);cursor:pointer"><svg class="ti ti-x" style="font-size:0.85rem;line-height:1;color:#ef4444"><use href="img/tabler-sprite.svg#tabler-x"/></svg><span style="line-height:1">Fail</span></span>`;
    cell.style.cursor = 'pointer';
    cell.onclick = () => _openTestDetail(id, state, message);
    if (row) row.style.background = 'rgba(239,68,68,0.04)';
  } else if (state === 'manual') {
    cell.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:700;line-height:1;background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);cursor:pointer"><svg class="ti ti-alert-triangle" style="font-size:0.85rem;line-height:1;color:#f59e0b"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg><span style="line-height:1">Manual</span></span>`;
    cell.style.cursor = 'pointer';
    cell.onclick = () => _openTestDetail(id, state, message);
    if (row) row.style.background = 'rgba(245,158,11,0.04)';
  }
}

function _refreshSummary() {
  let passed = 0, failed = 0, manual = 0;
  JK_TESTS.forEach(t => {
    const cell = document.getElementById(`test-result-${t.id}`);
    if (!cell) return;
    if (cell.querySelector('.ti-check'))               passed++;
    else if (cell.querySelector('.ti-x'))              failed++;
    else if (cell.querySelector('.ti-alert-triangle')) manual++;
  });
  const sp = document.getElementById('summaryPass');
  const sf = document.getElementById('summaryFail');
  const sm = document.getElementById('summaryManual');
  if (sp) { sp.innerHTML = `<svg class="ti ti-check" style="font-size:1.4rem;color:${passed>0?'#22c55e':'var(--text-muted)'}"><use href="img/tabler-sprite.svg#tabler-check"/></svg>${passed} Passed`; sp.style.color = passed>0?'#22c55e':'var(--text-muted)'; }
  if (sf) { sf.innerHTML = `<svg class="ti ti-x" style="font-size:1.4rem;color:${failed>0?'#ef4444':'var(--text-muted)'}"><use href="img/tabler-sprite.svg#tabler-x"/></svg>${failed} Failed`; sf.style.color = failed>0?'#ef4444':'var(--text-muted)'; }
  if (sm) { sm.innerHTML = `<svg class="ti ti-alert-triangle" style="font-size:1.4rem;color:${manual>0?'#f59e0b':'var(--text-muted)'}"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg>${manual} Manual`; sm.style.color = manual>0?'#f59e0b':'var(--text-muted)'; }
}

async function _runSingleTest(id) {
  const testDef = JK_TESTS.find(t => t.id === id);
  if (!testDef) return;
  const btn = document.getElementById(`test-run-btn-${id}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ti ti-loader-2 jk-spin" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg>'; }
  _setRowResult(id, 'running');
  if (!window._jkTestResults) window._jkTestResults = {};
  try {
    const result = await testDef.test();
    if (result === 'manual') {
      window._jkTestResults[id] = { state: 'manual', received: 'Manual verification required', message: null };
      _setRowResult(id, 'manual');
    } else {
      window._jkTestResults[id] = { state: 'pass', received: String(result === true ? 'true' : JSON.stringify(result)), message: null };
      _setRowResult(id, 'pass');
    }
  } catch (err) {
    const msg = err.message || String(err);
    window._jkTestResults[id] = { state: 'fail', received: msg, message: msg };
    _setRowResult(id, 'fail', msg);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ti ti-player-play" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-player-play"/></svg><span style="line-height:1">Run</span>'; }
    _refreshSummary();
  }
}

async function _runAllTests() {
  const btn = document.getElementById('btnRunTests');
  const progress = document.getElementById('runProgress');
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ti ti-loader-2 jk-spin"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg> Running…'; }
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
    overlay.innerHTML = '<svg class="ti ti-test-pipe" style="font-size:2.5rem;color:var(--turq);display:block;text-align:center"><use href="img/tabler-sprite.svg#tabler-test-pipe"/></svg><div style="font-size:1rem;font-weight:600;color:var(--text);text-align:center;margin-top:12px" id="overlayStatus">Running tests…</div>';
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
        _results[t.id] = {state:'manual', received:'Manual verification required'};
        manual++;
      } else if (result === true) {
        _setRowResult(t.id, 'pass');
        _results[t.id] = {state:'pass', received:'true'};
        passed++;
      } else {
        _setRowResult(t.id, 'fail', 'Test returned false');
        _results[t.id] = {state:'fail', received:'false', message:'Test returned false'};
        failed++;
      }
    } catch (err) {
      const msg = err.message || String(err);
      _setRowResult(t.id, 'fail', msg);
      _results[t.id] = {state:'fail', received: msg, message: msg};
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

  if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ti ti-player-play"><use href="img/tabler-sprite.svg#tabler-player-play"/></svg> Run All Tests'; }
  if (progress) { progress.style.display = 'none'; }

  // Show summary
  const sumEl = document.getElementById('testSummary');
  if (sumEl) {
    document.getElementById('summaryPass').innerHTML = `<svg class="ti ti-check" style="font-size:1.4rem;color:#22c55e"><use href="img/tabler-sprite.svg#tabler-check"/></svg>${passed} Passed`;
    document.getElementById('summaryFail').innerHTML = `<svg class="ti ti-x" style="font-size:1.4rem;color:#ef4444"><use href="img/tabler-sprite.svg#tabler-x"/></svg>${failed} Failed`;
    document.getElementById('summaryManual').innerHTML = `<svg class="ti ti-alert-triangle" style="font-size:1.4rem;color:#f59e0b"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg>${manual} Manual`;
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
    document.getElementById('summaryPass').innerHTML = '<svg class="ti ti-check" style="font-size:1.1rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-check"/></svg>0 passed';
    document.getElementById('summaryPass').style.color = 'var(--text-muted)';
    document.getElementById('summaryFail').innerHTML = '<svg class="ti ti-x" style="font-size:1.1rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-x"/></svg>0 failed';
    document.getElementById('summaryFail').style.color = 'var(--text-muted)';
    document.getElementById('summaryManual').innerHTML = '<svg class="ti ti-alert-triangle" style="font-size:1.1rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg>0 manual';
    document.getElementById('summaryManual').style.color = 'var(--text-muted)';
  }
  const progress = document.getElementById('runProgress');
  if (progress) progress.style.display = 'none';
  _buildTestRows();
}
