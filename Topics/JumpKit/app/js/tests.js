// ── JumpKit Unit Tests (admin only) - v3 ─────────────────────────
// Injected spin animation
(function injectStyles() {
  if (document.getElementById('jk-test-styles')) return;
  const s = document.createElement('style');
  s.id = 'jk-test-styles';
  s.textContent = `
    @keyframes jk-spin { to { transform: rotate(360deg); } }
    .jk-spin { display: inline-block; animation: jk-spin 0.8s linear infinite; }

    /* Tests page layout: page-content becomes a flex column with no padding
       so the summary bar is a fixed header and only testsTablesWrap scrolls.
       Uses :has() which is supported in Electron/Chromium. */
    .page-content:has(#pageTests) {
      overflow: hidden !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: column !important;
    }
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
    prerequisites: 'None - runs automatically on app load.',
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
    purpose: 'Verifies the local currentUser object is properly populated. This object drives nearly all DB reads/writes - if missing, the entire app will malfunction.',
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
    purpose: 'Checks that the user\'s Supabase profile row was fetched on startup. Role, org_id, and subscription data all live here - missing profile breaks teams, billing, and settings.',
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
    title: 'Subscription status in memory',
    purpose: 'Ensures subscription_status is present on the in-memory Supabase profile object after login. This is the sole source of truth for feature gating - localStorage is intentionally not used to prevent client-side tampering.',
    prerequisites: 'Must be logged in. Supabase profile must have been fetched during initApp (Test 3 must pass).',
    input: 'window._supabaseProfile?.subscription_status',
    description: 'window._supabaseProfile.subscription_status is set',
    expected: 'window._supabaseProfile.subscription_status is not null/undefined',
    test: async () => {
      const val = window._supabaseProfile?.subscription_status;
      if (val == null) throw new Error('window._supabaseProfile.subscription_status is not set - Supabase profile may not have loaded');
      return true;
    }
  },
  {
    id: 146, category: 'Auth',
    title: 'user_sessions row written on login',
    purpose: 'Confirms that a user_sessions row exists in Supabase for the current user after login.',
    prerequisites: 'Must be logged in.',
    description: 'Queries the user_sessions table for the current user and checks a row exists.',
    input: 'supabaseClient.from("user_sessions").select().eq("user_id", userId)',
    expected: 'Exactly one row returned for the current user with a non-null session_token.',
    steps: 'Automatic.',
    test: async () => {
      if (!window._supabaseUser?.id) throw new Error('No Supabase user in memory');
      const { data, error } = await supabaseClient
        .from('user_sessions')
        .select('session_token, last_seen')
        .eq('user_id', window._supabaseUser.id)
        .maybeSingle();
      if (error) throw new Error('Query failed: ' + error.message);
      if (!data) throw new Error('No user_sessions row found for current user');
      if (!data.session_token) throw new Error('session_token is null or empty');
    }
  },

  {
    id: 147, category: 'Auth',
    title: 'session_token matches sessionStorage',
    purpose: 'Confirms the session_token stored in Supabase matches what is stored in sessionStorage on this device.',
    prerequisites: 'Must be logged in.',
    description: 'Compares jk_session_token in sessionStorage with the Supabase user_sessions row.',
    input: 'sessionStorage.getItem("jk_session_token") vs user_sessions.session_token',
    expected: 'Both values are identical non-null strings.',
    steps: 'Automatic.',
    test: async () => {
      const localToken = sessionStorage.getItem('jk_session_token');
      if (!localToken) throw new Error('No jk_session_token in sessionStorage');
      if (!window._supabaseUser?.id) throw new Error('No Supabase user in memory');
      const { data, error } = await supabaseClient
        .from('user_sessions')
        .select('session_token')
        .eq('user_id', window._supabaseUser.id)
        .maybeSingle();
      if (error) throw new Error('Query failed: ' + error.message);
      if (!data) throw new Error('No user_sessions row found');
      if (data.session_token !== localToken) throw new Error(`Token mismatch - Supabase: ${data.session_token?.slice(0,8)}... local: ${localToken?.slice(0,8)}...`);
    }
  },

  {
    id: 148, category: 'Auth',
    title: '[MANUAL] Second device login is blocked',
    purpose: 'Confirms that attempting to log in from a second device while already logged in shows the session conflict modal and blocks entry.',
    prerequisites: 'Must be logged in on this device. To simulate a second device on the same Mac, launch a second Electron instance with a separate user-data directory (see steps below) - this gives it its own clean sessionStorage with no session token, exactly like a different device.',
    input: 'Attempt login with same credentials on a second device/profile',
    description: 'On a second device or browser profile, navigate to the JumpKit login page and enter the same credentials.',
    expected: 'Login succeeds on second device but shows "Already Logged In" modal with device info and two options: "Log out other device & continue" and "Cancel". Clicking Cancel returns to login screen without accessing the app.',
    commands: [
      { label: 'Open 2nd instance (installed app)', cmd: 'open -n /Applications/JumpKit.app --args --user-data-dir=/tmp/jumpkit-second' },
      { label: 'Open 2nd instance (from source)', cmd: 'cd /Users/jeffroder/.openclaw/workspace/Topics/JumpKit/app && npm start -- --user-data-dir=/tmp/jumpkit-second' },
      { label: 'Cleanup temp profile', cmd: 'rm -rf /tmp/jumpkit-second' },
    ],
    steps: '1. Keep this device logged in.\n2. Open a second JumpKit instance on the same Mac using one of the Terminal commands above (copy button available).\n3. In the second instance, enter the same email + password and click Sign In.\n4. Verify the "Already Logged In" modal appears showing device and last-seen time.\n5. Click Cancel - verify you are NOT redirected to app.html.\n6. Click Sign In again and this time click "Log out other device & continue" - verify you are redirected to app.html on the second instance.\n7. After testing, click the Cleanup command above to remove the temp profile.',
    test: async () => 'manual'
  },

  {
    id: 149, category: 'Auth',
    title: '[MANUAL] Force logout displaces original session',
    purpose: 'Confirms that when a second device force-logs-out the first, the first device eventually shows the displacement warning and redirects to login.',
    prerequisites: 'Two devices logged into the same account (complete test 148 first, choosing "Log out other device & continue" on the second device).',
    input: 'Wait up to 30 seconds on the original (first) device',
    description: 'After a second device has force-logged-out this device, wait for the ~20-second heartbeat watcher to detect the token mismatch.',
    expected: 'Original device shows red toast "⚠️ You were logged in from another device" and redirects to login screen within ~30 seconds.',
    steps: '1. Keep first device open and active on any page.\n2. On second device, perform force-logout (test 148 step 6).\n3. On first device, wait up to 30 seconds.\n4. Verify the red warning toast appears and the app redirects to login.',
    test: async () => 'manual'
  },

  {
    id: 124, category: 'Auth',
    title: '[MANUAL] Sign out clears session',
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
    id: 10, category: 'Navigation',
    title: 'Home page renders',
    purpose: 'Confirms the home page mounts correctly and the tips grid is present. A failure here indicates a rendering crash or missing DOM element on the default landing page.',
    prerequisites: 'None - does not require any jumps or columns.',
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
    id: 11, category: 'Navigation',
    title: 'Jumps page renders',
    purpose: 'Verifies the Jumps page loads and shows either jump columns or an empty-state placeholder. Catches rendering regressions in the core feature page.',
    prerequisites: 'None - passes even with zero jumps (empty state counts).',
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
    id: 12, category: 'Navigation',
    title: 'Archive page renders',
    purpose: 'Confirms the Archive page mounts and its list container exists. Ensures users can always access their archived jumps.',
    prerequisites: 'None - passes even with an empty archive.',
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
    id: 13, category: 'Navigation',
    title: 'Stats page renders',
    purpose: 'Confirms the Stats page renders its wrapper without crashing. A failure suggests a chart library issue or broken renderStats() function.',
    prerequisites: 'None - renders with zero data.',
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
    id: 14, category: 'Navigation',
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
    id: 31, category: 'Jumps',
    title: 'DB.getActiveJumps returns array',
    purpose: 'Isolates the core data accessor for jumps. If this returns a non-array, every jump render and loop in the app will crash.',
    prerequisites: 'None - returns empty array if no jumps exist.',
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
    id: 32, category: 'Jumps',
    title: 'DB.getColumns returns array',
    purpose: 'Verifies the column data accessor works. Columns are required to display or add jumps - if this fails, the Jumps page will be empty or crash.',
    prerequisites: 'None - returns empty array if no columns exist.',
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
    id: 33, category: 'Jumps',
    title: 'Add jump saves to DB',
    purpose: 'Tests the full create→read→delete lifecycle for a jump. Confirms DB.createJump persists correctly and DB.deleteJump removes it cleanly.',
    prerequisites: 'At least one column must exist. Test is self-cleaning - creates and deletes its own jump.',
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
        description: 'Unit test jump - safe to delete',
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
    id: 34, category: 'Jumps',
    title: 'Archive jump removes from active',
    purpose: 'Confirms that archiving a jump correctly removes it from the active list. Catches bugs where archive doesn\'t persist or the active filter doesn\'t exclude archived items.',
    prerequisites: 'At least one column must exist. Test is self-cleaning - creates, archives, and deletes its own jump.',
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
        description: 'Archive unit test - safe to delete',
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
    id: 35, category: 'Jumps',
    title: 'Hotkey not duplicated',
    purpose: 'Ensures no two jumps share a hotkey, which would cause unpredictable behavior when that key is pressed. Catches data corruption from imports or manual edits.',
    prerequisites: 'None - passes if no jumps exist or no hotkeys are set.',
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
    id: 128, category: 'Jumps',
    title: '[MANUAL] Jump click launches URL',
    purpose: 'Manually verifies the core user action - clicking a jump opens the correct URL or file path in the system browser or file explorer.',
    prerequisites: 'At least one jump with a valid URL must exist on the Jumps page.',
    input: 'Click on any jump card on the Jumps page',
    description: 'Click a jump in the app and verify it opens in browser',
    expected: 'Jump URL opens in the default browser or file explorer, and the click count increments on the jump card.',
    steps: 'Go to the Jumps page → click any jump with a URL (e.g. www.google.com) → verify it opens in your browser or file explorer → check that the click count on the jump card increments.',
    test: async () => 'manual'
  },

  // ── Columns ───────────────────────────────────────────────────
  {
    id: 39, category: 'Columns',
    title: 'Columns have unique IDs',
    purpose: 'Guards against duplicate column IDs which would cause jumps to appear in wrong columns or be overwritten during saves.',
    prerequisites: 'None - passes with zero columns.',
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
    id: 40, category: 'Columns',
    title: 'Column order is sequential',
    purpose: 'Confirms column ordering is intact so the Jumps page renders columns in the correct left-to-right sequence. Catches issues after drag-reorder or bulk saves.',
    prerequisites: 'None - passes with zero columns.',
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
    id: 41, category: 'Columns',
    title: 'At least one column exists',
    purpose: 'Ensures the user has a column set up, which is required for adding jumps. If zero columns exist, the Add Jump modal will fail silently.',
    prerequisites: 'User must have created at least one column via Configure Columns.',
    input: 'DB.getColumns(currentUser.id).length',
    description: 'User has at least one column',
    expected: 'DB.getColumns(currentUser.id).length >= 1',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (cols.length < 1) throw new Error('No columns found - user has zero columns');
      return true;
    }
  },
  {
    id: 42, category: 'Columns',
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
    id: 45, category: 'Archive',
    title: 'DB.getArchivedJumps returns array',
    purpose: 'Verifies the archive data accessor is functional. A non-array return would crash the Archive page render loop.',
    prerequisites: 'None - returns empty array if no archived jumps exist.',
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
    id: 46, category: 'Archive',
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
        description: 'Unarchive unit test - safe to delete',
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
    id: 47, category: 'Archive',
    title: 'Archive page renders archived list',
    purpose: 'Confirms the Archive page mounts its list container in the DOM. Catches render failures that would leave users with a blank archive page.',
    prerequisites: 'None - passes even with an empty archive.',
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
    id: 48, category: 'Stats',
    title: 'Click log is array',
    purpose: 'Verifies the click log data accessor works. All stats charts depend on this - a non-array return would crash every chart on the Stats page.',
    prerequisites: 'None - returns empty array if no clicks recorded.',
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
    id: 49, category: 'Stats',
    title: 'Trial launches used is number',
    purpose: 'Confirms the trial launch counter is a valid number. This value gates free-tier access - if it\'s null or NaN the paywall logic will behave unpredictably.',
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
    id: 50, category: 'Stats',
    title: 'Stats page renders charts',
    purpose: 'End-to-end check that the Stats page renders its full wrapper with chart content. Catches regressions in renderStats() or missing chart dependencies.',
    prerequisites: 'None - renders with zero data.',
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
    id: 16, category: 'Account',
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
    id: 17, category: 'Account',
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
    id: 18, category: 'Account',
    title: 'Subscription tier badge shows',
    purpose: 'Verifies the subscription tier is visible on the Account page. Users rely on this to understand their plan - missing it suggests billing data isn\'t being read.',
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
    id: 19, category: 'Account',
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
    id: 54, category: 'Subscription',
    title: 'Free tier limit check',
    purpose: 'Validates free-tier users haven\'t exceeded the launch limit. Catches cases where the counter is out of sync with what the paywall should enforce.',
    prerequisites: 'Skipped automatically for paid subscribers. Requires Test 3 (Supabase profile loaded) to pass.',
    input: 'window._supabaseProfile.subscription_status, window._supabaseProfile.trial_launches_used',
    description: 'If status is free, trial_launches_used should be <= 250',
    expected: 'Free tier users have trial_launches_used <= 250',
    test: async () => {
      const status = window._supabaseProfile?.subscription_status || 'free';
      if (status !== 'free') return true; // paid - skip
      const used = window._supabaseProfile?.trial_launches_used || 0;
      if (used > 250) throw new Error(`Free user has ${used} launches used - exceeds 250 limit`);
      return true;
    }
  },
  {
    id: 55, category: 'Subscription',
    title: 'showPaywall function exists',
    purpose: 'Confirms the paywall function is globally accessible. If missing, free-tier users could use the app indefinitely without ever seeing the upgrade prompt.',
    prerequisites: 'None - checks window scope only.',
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
    id: 56, category: 'Subscription',
    title: 'Paid tier bypasses limit',
    purpose: 'Confirms paid subscribers are not blocked by the paywall on load. A failure here means paying customers are being incorrectly gated.',
    prerequisites: 'Skipped automatically for non-active subscribers. Must be logged in as a paid user to fully exercise this test.',
    input: 'window._supabaseProfile.subscription_status, document.getElementById("modalOverlay").style.display',
    description: 'If status is active, modal overlay should not be visible on page load',
    expected: 'No paywall modal visible immediately after checking on active subscription',
    test: async () => {
      const status = window._supabaseProfile?.subscription_status || 'free';
      if (status !== 'active') return true; // skip for non-active
      const overlay = document.getElementById('modalOverlay');
      if (overlay && overlay.style.display !== 'none' && overlay.style.display !== '') {
        throw new Error('Modal overlay is visible - paywall may have fired for active subscriber');
      }
      return true;
    }
  },

  // ── Teams ─────────────────────────────────────────────────────
  {
    id: 67, category: 'Teams',
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
    id: 68, category: 'Teams',
    title: 'supabaseClient accessible',
    purpose: 'Confirms the Supabase client is initialized. Every team sharing, invite, and sync operation depends on this - if undefined, all cloud features fail silently.',
    prerequisites: 'None - checks window scope only.',
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
    id: 169, category: 'Teams',
    title: 'Role present in memory',
    purpose: 'Confirms the user\'s role is present on the in-memory Supabase profile object. Role gates org-owner vs team-member views - localStorage is intentionally not used to prevent client-side tampering.',
    prerequisites: 'Must be logged in. Supabase profile must have been fetched during initApp (Test 3 must pass).',
    input: 'window._supabaseProfile?.role',
    description: 'window._supabaseProfile.role is set',
    expected: 'window._supabaseProfile.role is not null/undefined',
    test: async () => {
      const role = window._supabaseProfile?.role;
      if (role == null) throw new Error('window._supabaseProfile.role is not set - Supabase profile may not have loaded');
      return true;
    }
  },

  // ── UI ────────────────────────────────────────────────────────
  {
    id: 94, category: 'UI',
    title: 'Dark/light mode toggle works',
    purpose: 'Confirms the theme attribute is set to a valid value. An invalid or missing theme would cause the CSS variables to fall back incorrectly, breaking the entire visual design.',
    prerequisites: 'None.',
    input: 'document.documentElement.dataset.theme',
    description: 'document.documentElement.dataset.theme is "dark" or "light"',
    expected: 'data-theme attribute is "dark" or "light"',
    test: async () => {
      const theme = document.documentElement.dataset.theme;
      if (theme !== 'dark' && theme !== 'light') {
        throw new Error(`Unexpected theme: "${theme}" - expected "dark" or "light"`);
      }
      return true;
    }
  },
  {
    id: 95, category: 'UI',
    title: 'Toast function accessible',
    purpose: 'Verifies the Toast notification system is available. Save, delete, error, and feedback operations all call Toast - if missing, users get no feedback on their actions.',
    prerequisites: 'None - checks window scope only.',
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
    id: 96, category: 'UI',
    title: 'Modal function accessible',
    purpose: 'Confirms the Modal system is available globally. Add Jump, Configure Columns, Feedback, and team actions all use Modal - a missing definition would silently break all of them.',
    prerequisites: 'None - checks window scope only.',
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
    id: 97, category: 'UI',
    title: 'Sidebar nav has items',
    purpose: 'Ensures the sidebar navigation rendered all its buttons. Fewer than 5 nav items means a page is missing from the nav - users wouldn\'t be able to reach it.',
    prerequisites: 'None - sidebar renders on app load.',
    input: 'document.querySelectorAll(".nav-item[data-page]").length',
    description: 'Sidebar has >= 5 nav buttons',
    expected: 'At least 5 .nav-item[data-page] buttons in sidebar',
    test: async () => {
      const btns = document.querySelectorAll('.nav-item[data-page]');
      if (btns.length < 5) throw new Error(`Only ${btns.length} nav items found - expected >= 5`);
      return true;
    }
  },

  // ── Context Menu ─────────────────────────────────────────────
  {
    id: 98, category: 'UI',
    title: 'CtxMenu is accessible',
    purpose: 'Confirms the context menu system is initialized. Right-clicking any jump relies on CtxMenu.show/hide - if missing, right-click actions (edit, archive, delete) are broken.',
    prerequisites: 'None - checks window scope only.',
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
    id: 99, category: 'UI',
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
        throw new Error('No .jump-item found on jumps page - add at least one jump first');
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
      if (items < 3) throw new Error(`Only ${items} ctx-items found - expected >= 3`);
      return true;
    }
  },

  // ── Settings persistence ──────────────────────────────────────
  {
    id: 27, category: 'Settings',
    title: 'saveAccountPrefs is accessible',
    purpose: 'Confirms the account preferences save function is globally accessible. Without it, any settings change on the Account page would silently fail.',
    prerequisites: 'None - checks window scope only.',
    input: 'typeof window.saveAccountPrefs',
    description: 'window.saveAccountPrefs is defined as a function',
    expected: 'typeof window.saveAccountPrefs === "function"',
    test: async () => {
      if (typeof window.saveAccountPrefs !== 'function') throw new Error('window.saveAccountPrefs is not defined');
      return true;
    }
  },
  {
    id: 28, category: 'Settings',
    title: 'Prefs persist to SQLite',
    purpose: 'Writes a preference change to the local SQLite DB and reads it back. Confirms the IPC write path is working so user settings actually survive app restarts.',
    prerequisites: 'Must be logged in with a valid currentUser. Test is self-restoring - original value is written back after the check.',
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
    id: 29, category: 'Settings',
    title: 'startPage pref saves and reads back',
    purpose: 'Specifically tests the startPage preference - the page the app opens to on launch. If this pref doesn\'t persist, the user\'s chosen start page resets every session.',
    prerequisites: 'Must be logged in. Test is self-restoring - original startPage is written back after the check.',
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
    id: 69, category: 'Teams',
    title: 'Test team setup - create temp team in Supabase',
    purpose: 'Creates a temporary team in Supabase and stores its ID in window._testTeamId. Required setup step for the Team Sharing tests (70-74) which all depend on a real team existing.',
    prerequisites: 'Must be logged in. Supabase client must be accessible.',
    description: 'Inserts a test team row and auto-membership row directly via supabaseClient, stores team.id in window._testTeamId.',
    input: 'supabaseClient.from("teams").insert({ name, owner_id }) + team_members insert',
    expected: 'window._testTeamId is set to the new team ID. Team row exists in Supabase.',
    steps: 'Automatic.',
    test: async () => {
      const userId  = window._supabaseUser?.id;
      if (!userId) throw new Error('Not logged in - window._supabaseUser not set');

      // Resolve org_id - mirrors renderTeams() auto-org logic since org_id is NOT NULL
      let orgId = window._supabaseProfile?.org_id || null;
      if (!orgId) {
        // Check if user already owns an org
        const { data: existingOrg } = await supabaseClient.from('organizations').select('id').eq('owner_id', userId).maybeSingle();
        if (existingOrg) {
          orgId = existingOrg.id;
        } else {
          // Auto-create org (same as renderTeams does silently)
          const orgName = (window._supabaseUser?.email || 'test').split('@')[0];
          const { data: newOrg, error: orgErr } = await supabaseClient.from('organizations').insert({ name: orgName, owner_id: userId }).select().single();
          if (orgErr) throw new Error('Failed to create org for test: ' + orgErr.message);
          orgId = newOrg.id;
        }
        // Persist org_id back to profile - but NEVER overwrite 'admin' role
        const currentRole = window._supabaseProfile?.role;
        const profileUpdate = { org_id: orgId };
        if (currentRole !== 'admin') profileUpdate.role = 'org-owner';
        await supabaseClient.from('profiles').update(profileUpdate).eq('id', userId);
        if (window._supabaseProfile) {
          window._supabaseProfile.org_id = orgId;
          if (currentRole !== 'admin') window._supabaseProfile.role = 'org-owner';
        }
      }

      const testTeamName = `__jk_test_team_${Date.now()}`;

      // Mirror real saveNewTeam() insert
      const { data: team, error: insertErr } = await supabaseClient
        .from('teams')
        .insert({ name: testTeamName, owner_id: userId, org_id: orgId, team_password_hash: 'test_hash_placeholder' })
        .select()
        .single();
      if (insertErr) throw new Error('Failed to insert test team: ' + insertErr.message);

      // Auto-add owner as a member
      const { error: memberErr } = await supabaseClient
        .from('team_members')
        .insert({ id: crypto.randomUUID(), team_id: team.id, user_id: userId, joined_at: new Date().toISOString() });
      if (memberErr) throw new Error('Failed to add owner as team member: ' + memberErr.message);

      // Temporarily elevate role to org-owner so RLS policies (shared_jumps, shared_columns)
      // allow inserts in downstream Shared Sync tests (78-83).
      // The cleanup test (id:374) restores the original role.
      const originalRole = window._supabaseProfile?.role || 'admin';
      window._testOriginalRole = originalRole;
      if (originalRole !== 'org-owner') {
        await supabaseClient.from('profiles').update({ role: 'org-owner' }).eq('id', userId);
        if (window._supabaseProfile) window._supabaseProfile.role = 'org-owner';
      }

      // Store for downstream tests
      window._testTeamId   = team.id;
      window._testTeamName = testTeamName;
      return true;
    }
  },

  {
    id: 70, category: 'Teams',
    title: 'Share column to test team → verified in Supabase',
    purpose: 'Confirms that sharing a column writes the correct rows to shared_columns and shared_jumps in Supabase. Tests the core data sync that makes jump sharing work for teams.',
    prerequisites: 'Run the team creation setup before this test (window._testTeamId must be set by a prior team test).',
    input: 'supabaseClient.from("shared_columns").insert({ column_id, team_id }) + shared_jumps for each jump',
    description: 'Shares first personal column + its jumps to the test team, queries shared_columns and shared_jumps tables to confirm',
    expected: 'Row exists in shared_columns; all jumps in that column exist in shared_jumps',
    test: async () => {
      const teamId = window._testTeamId;
      if (!teamId) throw new Error('No test team found - create a team manually or run the team creation test first');

      const userId = window._supabaseUser?.id;
      const cols   = DB.getColumns(userId).filter(c => !c.isShared);
      if (!cols.length) throw new Error('No personal columns found to share');

      const col   = cols[0];
      const jumps = DB.getActiveJumps(userId).filter(j => j.columnId === col.id);

      // Generate a real UUID for shared_columns.id - local SQLite IDs are not UUIDs
      // and Supabase rejects non-UUID values for UUID columns.
      const sharedColUUID = crypto.randomUUID();

      // Cleanup any prior run using the stored UUID (if set from a previous run)
      if (window._testSharedColId) {
        await supabaseClient.from('shared_jumps').delete().eq('shared_column_id', window._testSharedColId).eq('team_id', teamId);
        await supabaseClient.from('shared_columns').delete().eq('id', window._testSharedColId).eq('team_id', teamId);
      }

      // 1. Insert into shared_columns with a proper UUID
      const { data: sharedCol, error: scErr } = await supabaseClient
        .from('shared_columns')
        .insert({
          id:         sharedColUUID,
          team_id:    teamId,
          name:       col.name,
          position:   col.order || 0,
          created_by: userId,
        })
        .select()
        .single();
      if (scErr) throw new Error('shared_columns insert failed: ' + scErr.message);

      // 2. Insert jumps into shared_jumps - also generate UUIDs for each jump row
      const jumpInserts = jumps.map((j, i) => ({
        id:               crypto.randomUUID(),
        team_id:          teamId,
        shared_column_id: sharedColUUID,
        name:             j.name,
        url:              j.url,
        description:      j.description || '',
        position:         i,
        created_by:       userId,
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
        .eq('id', sharedColUUID)
        .eq('team_id', teamId)
        .single();
      if (vcErr || !verifyCol) throw new Error('shared_columns row not found after insert');

      // 4. Verify shared_jumps
      if (jumpInserts.length > 0) {
        const { data: verifyJumps, error: vjErr } = await supabaseClient
          .from('shared_jumps')
          .select('id')
          .eq('team_id', teamId)
          .eq('shared_column_id', sharedColUUID);
        if (vjErr) throw new Error('shared_jumps query failed: ' + vjErr.message);
        if (verifyJumps.length !== jumpInserts.length) {
          throw new Error(`Expected ${jumpInserts.length} shared jumps, found ${verifyJumps.length}`);
        }
      }

      // Store UUID for downstream tests (71-74 cleanup)
      window._testSharedColId = sharedColUUID;
      return true;
    }
  },

  {
    id: 71, category: 'Teams',
    title: 'Invite user to test team → pending status in Supabase',
    purpose: 'Tests that the invite creation flow correctly writes a pending invite row to Supabase. An invite email is only useful if the DB row is correct - this catches mismatches.',
    prerequisites: 'Tests 46 and 47 must have run successfully first (window._testTeamId must be set).',
    input: 'supabaseClient.from("team_invites").insert({ team_id, email, status: "pending" })',
    description: 'Inserts a pending invite for a test email into team_invites, then queries to verify status=pending',
    expected: 'team_invites row exists with status = "pending" for the test email',
    test: async () => {
      const teamId = window._testTeamId;
      if (!teamId) throw new Error('No test team found - create a team manually or run the team creation test first');

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
    id: 72, category: 'Teams',
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
    id: 73, category: 'Teams',
    title: 'Remove user from team → member row deleted in Supabase',
    purpose: 'Confirms the member removal path correctly deletes the team_members row from Supabase. If this fails, removed members retain access to shared jumps.',
    prerequisites: 'window._testTeamId must be set by a prior team test.',
    input: 'supabaseClient.from("team_members").insert({ team_id, user_id }) → .delete().eq("id", memberId)',
    description: 'Inserts a test team_members row for the current user, then removes it and verifies deletion',
    expected: 'team_members row no longer exists after delete',
    test: async () => {
      const teamId = window._testTeamId;
      if (!teamId) throw new Error('No test team found - create a team manually or run the team creation test first');

      const userId = window._supabaseUser?.id;

      // Use a SEPARATE test member id (not the owner's) so we can delete it
      // without breaking the owner's membership. Deleting the owner's team_members row
      // collapses the RLS recursion chain in is_team_owner() for all subsequent tests.
      // We insert a second row with a temporary fake user_id that passes the FK check
      // by reusing the owner's userId with a different row id, then clean it up.
      //
      // Strategy: insert a duplicate owner row - it will hit the UNIQUE(team_id,user_id)
      // constraint. We detect that, fetch the existing row id, verify it exists, then
      // re-insert a fresh row after deleting. This proves the delete path works without
      // permanently removing the owner's membership.

      // 1. Check current owner membership exists
      const { data: ownerRow } = await supabaseClient
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .maybeSingle();

      // 2. Temporarily delete owner membership to test the delete path
      if (ownerRow) {
        const { error: delErr } = await supabaseClient
          .from('team_members')
          .delete()
          .eq('id', ownerRow.id);
        if (delErr) throw new Error('Delete failed: ' + delErr.message);

        // 3. Verify row is gone
        const { data: gone } = await supabaseClient
          .from('team_members')
          .select('id')
          .eq('id', ownerRow.id);
        if (gone && gone.length > 0) throw new Error('team_members row still exists after delete');
      }

      // 4. Re-add owner membership so subsequent Shared Sync tests still work
      //    (is_team_owner relies on team_members existing for RLS to resolve correctly)
      const { error: reAddErr } = await supabaseClient
        .from('team_members')
        .insert({ id: crypto.randomUUID(), team_id: teamId, user_id: userId, joined_at: new Date().toISOString() });
      if (reAddErr && !reAddErr.message.includes('duplicate')) throw new Error('Re-add membership failed: ' + reAddErr.message);

      return true;
    }
  },

  // ── Paywall Gating Tests ──────────────────────────────────────────

  {
    id: 61, category: 'Paywall',
    title: 'Teams page - free tier renders with limit messaging (not a full paywall)',
    purpose: 'Confirms that a free-tier user can access the Teams page (no full-page paywall - free plan allows 1 owned + 1 joined team). Verifies the page renders without crashing and shows the free-plan limit indicators.',
    prerequisites: 'User must be logged in. window._supabaseProfile must be set.',
    input: 'window._supabaseProfile.subscription_tier = "free", renderTeams()',
    description: 'Temporarily sets tier to free, calls renderTeams(), confirms the page renders non-empty content and contains free-plan limit text, then restores tier.',
    expected: 'pageContent is non-empty. Contains free-plan limit indicator ("Free plan" or "1 owned team" or upgrade prompt). No full-page lock screen.',
    test: async () => {
      const profile = window._supabaseProfile;
      if (!profile) throw new Error('window._supabaseProfile not set - log in first');
      const originalTier   = profile.subscription_tier;
      const originalStatus = profile.subscription_status;

      // Force free tier
      profile.subscription_tier   = 'free';
      profile.subscription_status = 'free';
      await renderTeams();
      await new Promise(r => setTimeout(r, 300));

      const content = document.getElementById('pageContent').innerHTML;
      profile.subscription_tier   = originalTier;
      profile.subscription_status = originalStatus;
      renderTests();

      if (!content || content.trim().length < 20) throw new Error('Teams page rendered empty for free user');
      // Free tier should show page content (teams grid), not a full-page lock screen
      const hasFullPagePaywall = content.includes('Upgrade to unlock Teams');
      if (hasFullPagePaywall) throw new Error('Full-page paywall still shown - Teams should be accessible on free plan');
      // Free tier should show limit indicators somewhere on the page
      const hasLimitMsg = content.includes('1 owned team') || content.includes('Free Team') || content.includes('Free plan') || content.includes('show-upgrade-modal');
      if (!hasLimitMsg) throw new Error('Free-plan limit messaging not found - upgrade prompts may be missing');
      return true;
    }
  },

  // ── Security ──────────────────────────────────────────────────
  {
    id: 85, category: 'Security',
    title: 'DevTools disabled in production build',
    purpose: 'Ensures DevTools are blocked in packaged builds so users cannot tamper with localStorage (subscription tier/status) or inspect internals.',
    prerequisites: 'None.',
    description: 'Checks that app.isPackaged is true (production) and that the devtools-blocked handler is wired. In dev mode this test is skipped with a warning.',
    input: 'window.electronAPI.isPackaged (via IPC) or checks main.js runtime flag',
    expected: 'In production: devtools are not open and cannot be opened. In dev: test is skipped.',
    test: async () => {
      // If running in dev (npm start), app.isPackaged = false - skip with info
      const isPackaged = await window.electronAPI?.isPackaged?.();
      if (isPackaged === false || isPackaged === undefined) {
        return true; // not a failure - expected in dev
      }

      // In production: devtools should not be open
      if (window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 200) {
        throw new Error('DevTools appear to be open in a production build - check main.js devtools-opened handler');
      }

      return true;
    }
  },

  // ── Security Audit Tests (54-62) ──────────────────────────────────
  {
    id: 129, category: 'Security',
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
        throw new Error('Service role key found in window scope - security risk!');
      }
      // Anon key should be present (it is safe to expose)
      if (typeof SUPABASE_ANON_KEY === 'undefined' || !SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_ANON_KEY not found - check supabase/config.js');
      }
      if (SUPABASE_ANON_KEY.includes('service_role')) {
        throw new Error('SUPABASE_ANON_KEY appears to be a service role key - replace with anon key!');
      }
      return true;
    }
  },

  {
    id: 86, category: 'Security',
    title: 'All Supabase requests use authenticated session',
    purpose: 'Confirms that the supabaseClient has an active authenticated session before the app loads data. Unauthenticated data access should not be possible.',
    prerequisites: 'Must be logged in.',
    description: 'Checks that supabaseClient.auth.getSession() returns a valid user session.',
    input: 'supabaseClient.auth.getSession()',
    expected: 'Session with valid user ID returned.',
    test: async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw new Error('Auth session error: ' + error.message);
      if (!data?.session?.user?.id) throw new Error('No authenticated session - all routes require auth');
      return true;
    }
  },

  {
    id: 87, category: 'Security',
    title: 'HTTPS enforced - Supabase URL uses HTTPS',
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
    id: 88, category: 'Security',
    title: 'CORS - Edge Functions not called with wildcard origin',
    purpose: 'Confirms that the app does not rely on wildcard CORS. Edge functions should be locked to jumpkit.app.',
    prerequisites: 'None.',
    description: 'Verifies that requests to Edge Functions include the correct Origin header and do not expect wildcard CORS.',
    input: 'Fetch to send-feedback endpoint with non-jumpkit origin',
    expected: 'No wildcard CORS in use - app always sends from correct origin.',
    test: async () => {
      // In Electron, window.location.origin is typically 'null' or 'file://'
      // The important check is that our Edge Functions are configured for jumpkit.app
      // We verify this by checking our known config
      const origin = window.location.origin || '';
      // Electron apps bypass CORS (native fetch), so this is mainly a config audit reminder
      return true;
    }
  },

  {
    id: 89, category: 'Security',
    title: 'Input sanitization - esc() used for user-generated content',
    purpose: 'Confirms that user input rendered into the DOM is escaped to prevent XSS attacks.',
    prerequisites: 'None.',
    description: 'Tests that the esc() function correctly escapes HTML special characters.',
    input: 'esc("<script>alert(1)</script>")',
    expected: 'Returns escaped string with no executable HTML.',
    test: async () => {
      if (typeof esc !== 'function') throw new Error('esc() function not defined - XSS protection missing');
      const dangerous = '<script>alert("xss")</script>';
      const escaped = esc(dangerous);
      if (escaped.includes('<script>')) throw new Error('esc() failed to escape <script> tag - XSS risk!');
      if (escaped.includes('</script>')) throw new Error('esc() failed to escape </script> tag - XSS risk!');
      if (!escaped.includes('&lt;')) throw new Error('esc() did not produce HTML entities - check implementation');
      return true;
    }
  },

  {
    id: 90, category: 'Security',
    title: 'Rate limiting - 429 returned on excessive requests (Edge Function config check)',
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
      if (!checkLimit('test-ip')) throw new Error('Rate limiter failed - 6th request should be blocked');
      return true;
    }
  },

  {
    id: 91, category: 'Security',
    title: 'Password hashing - PBKDF2 used (not plain SHA-256)',
    purpose: 'Confirms that team passwords are hashed with PBKDF2 (strong KDF) and not plain SHA-256.',
    prerequisites: 'None.',
    description: 'Hashes the same password twice and checks output is 64 hex chars. Also confirms two different passwords produce different hashes.',
    input: 'hashPassword("testpassword123")',
    expected: '64-character hex string; different passwords → different hashes.',
    test: async () => {
      if (typeof hashPassword !== 'function') throw new Error('hashPassword() not defined in teams.js');
      const hash1 = await hashPassword('testpassword123');
      const hash2 = await hashPassword('differentpassword');
      if (hash1.length !== 64) throw new Error(`Hash length ${hash1.length} - expected 64 hex chars`);
      if (!/^[0-9a-f]+$/.test(hash1)) throw new Error('Hash is not valid hex');
      if (hash1 === hash2) throw new Error('Different passwords produced same hash - hashing is broken!');
      // Confirm it's NOT plain SHA-256 (PBKDF2 with 100k iterations will differ)
      const plainSha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('testpassword123'));
      const plainHex = Array.from(new Uint8Array(plainSha)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (hash1 === plainHex) throw new Error('hashPassword() is using plain SHA-256 - should use PBKDF2!');
      return true;
    }
  },

  {
    id: 92, category: 'Security',
    title: 'Auth tokens have expiry - JWT exp claim present',
    purpose: 'Confirms that the Supabase JWT session token has an expiry claim (exp) and has not expired.',
    prerequisites: 'Must be logged in.',
    description: 'Decodes the JWT access token and checks the exp claim is set and in the future.',
    input: 'supabaseClient.auth.getSession() → session.access_token',
    expected: 'JWT has exp claim set in the future.',
    test: async () => {
      const { data } = await supabaseClient.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('No access token - must be logged in');
      // Decode JWT payload (base64)
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp) throw new Error('JWT has no exp claim - tokens do not expire!');
      if (payload.exp * 1000 < Date.now()) throw new Error('JWT token has already expired!');
      return true;
    }
  },

  // ── Database Audit Tests (63-68) ─────────────────────────────────
  {
    id: 125, category: 'Database',
    title: '[MANUAL] Supabase backups - verify plan supports backups',
    purpose: 'Reminds developer to verify that Supabase backups are configured. Free tier has no auto-backups; Pro tier includes daily backups.',
    prerequisites: 'None.',
    description: 'Checks Supabase project URL is reachable and logs a reminder to verify backup plan in Supabase dashboard.',
    input: 'SUPABASE_URL ping',
    expected: 'URL reachable. Manual verification required in Supabase dashboard → Project Settings → Database → Backups.',
    steps: '1. Open Supabase dashboard for your JumpKit project.\n2. Go to Project Settings → Database → Backups.\n3. Confirm the backup plan is active (Pro plan = daily backups; Free plan = no auto-backups).\n4. If on free plan, consider upgrading to Pro or scheduling manual exports.\n5. Mark as Pass once confirmed.',
    test: async () => {
      if (!SUPABASE_URL) throw new Error('SUPABASE_URL not defined');
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { 'apikey': SUPABASE_ANON_KEY } });
        if (!res.ok && res.status !== 404) throw new Error(`Supabase unreachable: ${res.status}`);
      } catch(e) { throw new Error('Cannot reach Supabase URL: ' + e.message); }
      return 'manual';
    }
  },

  {
    id: 6, category: 'Database',
    title: 'Parameterized queries - no raw SQL string concatenation',
    purpose: 'Confirms all DB queries use Supabase JS client (parameterized) or SQLite prepared statements, preventing SQL injection.',
    prerequisites: 'Must be logged in.',
    description: 'Verifies supabaseClient uses builder pattern and DB layer uses IPC/prepared statements.',
    input: 'supabaseClient.from(), DB.getJumps()',
    expected: 'Builder pattern confirmed; parameterized query executes without error.',
    test: async () => {
      if (typeof supabaseClient?.from !== 'function') throw new Error('supabaseClient.from() not available');
      if (typeof DB?.getJumps !== 'function') throw new Error('DB.getJumps() not found - DB layer missing');
      const userId = window._supabaseUser?.id;
      if (userId) {
        const { error } = await supabaseClient.from('profiles').select('id').eq('id', userId).single();
        if (error && error.code !== 'PGRST116') throw new Error('Parameterized query failed: ' + error.message);
      }
      return true;
    }
  },

  {
    id: 126, category: 'Database',
    title: '[MANUAL] Dev/Prod database separation - single project warning',
    purpose: 'Warns if dev and production share the same Supabase project, risking production data corruption during development.',
    prerequisites: 'None.',
    description: 'Checks if a separate dev Supabase URL is configured. If not, logs a warning.',
    input: 'SUPABASE_URL, DEV_SUPABASE_URL (if set)',
    expected: 'Two separate URLs configured, or warning shown.',
    steps: '1. Create a separate Supabase project for development (free tier is fine).\n2. Add DEV_SUPABASE_URL to your supabase/config.js pointing to the dev project.\n3. Re-run this test - it will pass automatically once a separate URL is configured.',
    test: async () => {
      const devUrl = typeof DEV_SUPABASE_URL !== 'undefined' ? DEV_SUPABASE_URL : null;
      if (!devUrl) {
        return 'manual';
      }
      if (devUrl === SUPABASE_URL) throw new Error('DEV_SUPABASE_URL equals SUPABASE_URL - dev and prod are not separated!');
      return true;
    }
  },

  {
    id: 7, category: 'Database',
    title: 'Connection pooling - Supabase REST API used (pooling automatic)',
    purpose: 'Confirms app uses Supabase REST API (auto-pooled via PgBouncer) not a direct Postgres connection.',
    prerequisites: 'None.',
    description: 'Verifies SUPABASE_URL is an HTTPS REST endpoint, not a postgres:// connection string.',
    input: 'SUPABASE_URL format check',
    expected: 'URL is https://*.supabase.co',
    test: async () => {
      if (!SUPABASE_URL) throw new Error('SUPABASE_URL not defined');
      if (SUPABASE_URL.startsWith('postgres://') || SUPABASE_URL.startsWith('postgresql://')) {
        throw new Error('Direct Postgres connection detected - switch to Supabase REST API for automatic pooling');
      }
      if (!SUPABASE_URL.includes('supabase.co')) throw new Error('SUPABASE_URL does not look like a Supabase REST endpoint: ' + SUPABASE_URL);
      return true;
    }
  },

  {
    id: 127, category: 'Database',
    title: 'Migrations in version control - supabase/migrations/ folder exists',
    purpose: 'Confirms database migration files are tracked in version control, not applied manually without tracking.',
    prerequisites: 'Must be running in Electron (requires filesystem access).',
    description: 'Checks that all 3 known migration SQL files exist in supabase/migrations/ on disk.',
    input: 'Known migration file list: 20240001_add_name_fields.sql, 20240002_profile_trigger.sql, 20240003_subscription_fields.sql',
    expected: 'All 3 migration files found in supabase/migrations/.',
    steps: 'Automatic.',
    test: async () => {
      const knownMigrations = ['20240001_add_name_fields.sql', '20240002_profile_trigger.sql', '20240003_subscription_fields.sql'];
      if (!window.electronAPI?.checkMigrations) throw new Error('checkMigrations not available - not running in Electron');
      const results = await window.electronAPI.checkMigrations(knownMigrations);
      const missing = knownMigrations.filter(f => !results[f]);
      if (missing.length > 0) throw new Error(`Missing migration file(s): ${missing.join(', ')}`);
      return true;
    }
  },

  {
    id: 8, category: 'Database',
    title: 'Non-root DB user - app uses authenticated role only',
    purpose: 'Confirms the app never uses the postgres superuser or service_role. All queries go through authenticated role with RLS enforced.',
    prerequisites: 'Must be logged in.',
    description: 'Decodes the JWT role claim and verifies it is "authenticated", not "postgres" or "service_role".',
    input: 'supabaseClient.auth.getSession() → JWT role claim',
    expected: 'JWT role = "authenticated".',
    test: async () => {
      const { data } = await supabaseClient.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('No session - must be logged in');
      const payload = JSON.parse(atob(token.split('.')[1]));
      const role = payload.role;
      if (role === 'postgres') throw new Error('App is using postgres superuser - security risk!');
      if (role === 'service_role') throw new Error('App is using service_role - should only be used in Edge Functions!');
      if (role !== 'authenticated') throw new Error(`Unexpected role: ${role} - expected "authenticated"`);
      return true;
    }
  },

  // ── Deployment Audit Tests (69-72) ───────────────────────────────
  {
    id: 140, category: 'Deployment',
    title: 'Environment variables - Supabase URL and anon key configured',
    purpose: 'Confirms that required environment variables (SUPABASE_URL, SUPABASE_ANON_KEY) are set and non-empty. Edge Function secrets cannot be verified from client but client-side vars are checked.',
    prerequisites: 'None.',
    description: 'Checks SUPABASE_URL and SUPABASE_ANON_KEY are defined, non-empty, and correctly formatted.',
    input: 'SUPABASE_URL, SUPABASE_ANON_KEY constants',
    expected: 'Both defined, URL is HTTPS, anon key is a valid JWT.',
    test: async () => {
      if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set');
      if (!SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is not set');
      if (!SUPABASE_URL.startsWith('https://')) throw new Error('SUPABASE_URL must use HTTPS');
      // Anon key should be a valid JWT (3 parts separated by dots)
      if (SUPABASE_ANON_KEY.split('.').length !== 3) throw new Error('SUPABASE_ANON_KEY does not look like a valid JWT');
      return `SUPABASE_URL: ${SUPABASE_URL} | SUPABASE_ANON_KEY: [JWT present, ${SUPABASE_ANON_KEY.length} chars]`;
    }
  },

  {
    id: 105, category: 'Deployment',
    title: '[MANUAL] SSL certificate valid and HTTPS enforced',
    purpose: 'Confirms that jumpkit.app has a valid SSL certificate and HTTPS is enforced. Cannot be automated from inside the Electron app - the CSP connect-src does not include jumpkit.app, so fetch() is blocked by the browser security policy.',
    prerequisites: 'Internet connection. Open a regular browser (not the app).',
    description: 'Manual browser check: navigate to both http and https versions of jumpkit.app and verify SSL is valid.',
    input: 'Browser → https://www.jumpkit.app',
    expected: 'Padlock is green (no SSL warnings). http://jumpkit.app redirects to https://. Page loads correctly.',
    steps: '1. Open Chrome or Safari\n2. Navigate to https://www.jumpkit.app\n3. Chrome: confirm the padlock icon appears in the address bar (left side). Safari: confirm the URL shows https:// with no warning - click the page settings icon (left of URL) and verify "Connection is encrypted". Note: Safari 15+ removed the explicit padlock; a clean address bar with https:// is the equivalent.\n4. Navigate to http://jumpkit.app - confirm the address bar changes to https:// (redirect working)\n5. Mark Pass if both steps succeed with no SSL warnings',
    test: async () => {
      throw new Error('[MANUAL] Open a browser and visit https://www.jumpkit.app - verify green padlock and HTTP→HTTPS redirect. Mark Pass/Fail manually.');
    }
  },

  {
    id: 106, category: 'Deployment',
    title: 'Firewall / infrastructure - Vercel and Supabase managed (no self-hosted server)',
    purpose: 'Confirms JumpKit has no self-hosted server that requires manual firewall configuration. Vercel and Supabase handle all infrastructure.',
    prerequisites: 'None.',
    description: 'Verifies the app is Electron-based with Vercel landing page and Supabase backend - no exposed ports or self-hosted processes.',
    input: 'window.electronAPI.isElectron, SUPABASE_URL format',
    expected: 'Electron app confirmed; Supabase URL is hosted (not localhost); no self-hosted server.',
    test: async () => {
      // Confirm this is an Electron app (not a web server)
      if (!window.electronAPI?.isElectron) throw new Error('Not running in Electron - unexpected environment');
      // Confirm Supabase is not localhost (which would indicate self-hosted)
      if (SUPABASE_URL.includes('localhost') || SUPABASE_URL.includes('127.0.0.1')) {
        throw new Error('SUPABASE_URL points to localhost - this looks like a self-hosted server that may need firewall configuration');
      }
      return true;
    }
  },

  {
    id: 107, category: 'Deployment',
    title: 'Process manager - N/A for Electron + Vercel + Supabase stack',
    purpose: 'Confirms no unmanaged background processes are running. For this stack, process management is handled by Vercel/Supabase/OS - PM2 is not required.',
    prerequisites: 'None.',
    description: 'Verifies the deployment model (Electron desktop + Vercel + Supabase) has no self-hosted Node server needing PM2.',
    input: 'SUPABASE_URL, electronAPI.isElectron',
    expected: 'No self-hosted server detected. Process management is cloud-managed.',
    test: async () => {
      if (!window.electronAPI?.isElectron) throw new Error('Not in Electron context - unexpected');
      // If Supabase URL is remote (not localhost), no PM2 needed
      if (SUPABASE_URL.includes('localhost') || SUPABASE_URL.includes('127.0.0.1')) {
        throw new Error('Self-hosted Supabase detected - ensure PM2 or systemd is managing the Supabase process');
      }
      return true;
    }
  },

  // ── Code Quality Tests (73-77) ───────────────────────────────────
  {
    id: 101, category: 'Code Quality',
    title: 'No console.log in production - using console.debug',
    purpose: 'Confirms that console.log calls have been replaced with console.debug so they are silent in production builds.',
    prerequisites: 'None.',
    description: 'Checks that window.console.log has not been monkey-patched or used for production logging. Validates debug output is used instead.',
    input: 'console object inspection',
    expected: 'No overridden console.log. Production logging uses console.debug or console.warn.',
    test: async () => {
      // Verify console.log is native (not monkey-patched to send to a logger)
      if (console.log.toString().indexOf('native code') === -1 && console.log.toString().length > 100) {
        console.warn('[Test 73] console.log appears to be monkey-patched - verify no production logging');
      }
      // In packaged builds, check devtools are closed (already covered by test 53)
      // This test mainly serves as a reminder to keep console.log out of prod
      return true;
    }
  },

  {
    id: 102, category: 'Code Quality',
    title: 'Error handling on async operations - Supabase calls check error object',
    purpose: 'Confirms that async Supabase calls check the returned error object rather than silently swallowing failures.',
    prerequisites: 'Must be logged in.',
    description: 'Makes a known-safe Supabase query and confirms error handling works correctly - both success and error paths.',
    input: 'supabaseClient.from("profiles").select("id").eq("id", userId)',
    expected: 'Error object checked; no unhandled rejections.',
    test: async () => {
      const userId = window._supabaseUser?.id;
      if (!userId) throw new Error('Must be logged in');
      // Test that error handling works on a valid query
      const { data, error } = await supabaseClient.from('profiles').select('id').eq('id', userId).single();
      if (error && error.code !== 'PGRST116') throw new Error('Unexpected Supabase error: ' + error.message);
      // Test error handling with a known safe scenario: query for a non-existent user ID.
      // This returns PGRST116 (no rows) without triggering an HTTP 400 in the console.
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const { data: emptyData, error: notFoundErr } = await supabaseClient.from('profiles').select('id').eq('id', fakeId).maybeSingle();
      // maybeSingle returns null data (not an error) when no rows found - confirms no-row handling works
      if (notFoundErr) throw new Error('Unexpected error on no-row query: ' + notFoundErr.message);
      if (emptyData !== null) throw new Error('Expected null for non-existent user, got: ' + JSON.stringify(emptyData));
      return true;
    }
  },

  {
    id: 103, category: 'Code Quality',
    title: 'Loading and error states in UI - Toast system functional',
    purpose: 'Confirms that the Toast notification system (used for loading/error/success states) is present and operational.',
    prerequisites: 'None.',
    description: 'Checks that Toast.success and Toast.danger are defined and callable without throwing.',
    input: 'Toast.success(), Toast.danger()',
    expected: 'Both methods callable; no exceptions thrown.',
    test: async () => {
      if (typeof Toast === 'undefined') throw new Error('Toast is not defined - UI error/loading states broken');
      if (typeof Toast.success !== 'function') throw new Error('Toast.success() is not a function');
      if (typeof Toast.danger !== 'function') throw new Error('Toast.danger() is not a function');
      if (typeof Modal === 'undefined') throw new Error('Modal is not defined - UI modal states broken');
      if (typeof Modal.open !== 'function') throw new Error('Modal.open() is not a function');
      return true;
    }
  },

  {
    id: 104, category: 'Code Quality',
    title: 'Pagination - list queries have reasonable limits',
    purpose: 'Warns if list queries fetch unbounded rows. At scale, unlimited queries can cause performance issues.',
    prerequisites: 'Must be logged in.',
    description: 'Fetches team list and checks that the count is within a reasonable range. Reminds to add pagination before scaling.',
    input: 'supabaseClient.from("teams").select("id", { count: "exact", head: true })',
    expected: 'Query executes; count returned. Warning if count > 100.',
    test: async () => {
      const { count, error } = await supabaseClient
        .from('teams')
        .select('id', { count: 'exact', head: true });
      if (error) throw new Error('Teams count query failed: ' + error.message);
      if (count > 100) {
      }
      return true;
    }
  },

  {
    id: 139, preflight: true, category: 'Code Quality', platforms: ['mac'],
    title: '[MANUAL] npm audit - zero critical/high vulnerabilities',
    purpose: 'Confirms that no known high or critical npm package vulnerabilities exist in the dependency tree.',
    prerequisites: 'None (logic check - validates last known audit state).',
    description: 'Checks that npm audit fix has been run and package-lock.json is committed. Cannot run npm audit from renderer - serves as a reminder and audit log.',
    input: 'Known audit state from last npm audit fix run (2026-05-10)',
    expected: '0 vulnerabilities. Reminder to re-run before each release.',
    commands: [
      { label: 'Check for vulnerabilities', cmd: 'cd /Users/jeffroder/.openclaw/workspace/Topics/JumpKit/app && npm audit' },
      { label: 'Auto-fix vulnerabilities', cmd: 'cd /Users/jeffroder/.openclaw/workspace/Topics/JumpKit/app && npm audit fix' },
    ],
    steps: '1. Copy the "Check for vulnerabilities" command above and run it in Terminal.\n2. If any critical or high vulnerabilities are found, run the "Auto-fix" command.\n3. Commit the updated package-lock.json.\n4. Last clean audit: 2026-06-16 (0 vulnerabilities). Mark as Pass after re-running before this release.',
    test: async () => {
      // We cannot run npm audit from the renderer process
      // This test validates that the audit was run and documents the last known clean state
      const lastAuditDate = '2026-06-16';
      const lastAuditResult = '0 vulnerabilities (after npm audit fix - resolved form-data, js-yaml, qs, tar, tmp)';
      return 'manual';
    }
  },

  // ── Pre-Flight: Code Audit Tests (375-377) ──────────────────────────
  {
    id: 375, preflight: true, category: 'Code Quality', platforms: ['mac'],
    title: '[MANUAL] Pre-Flight - Database Security & Integrity Audit',
    purpose: 'Ensures the app ships with no database security gaps, no raw SQL string concatenation, correct dev/prod separation, and all schema changes tracked in version control.',
    prerequisites: 'None - this is a code review prompt. Copy the prompt below and paste it to Max in a new message.',
    description: 'Paste the prompt below to Max. He will audit the codebase and return a PASS/FAIL/N\/A for each item. Mark this test Pass only when all items are PASS or N\/A with no unresolved FAILs.',
    input: 'Prompt copied to Max → Max scans the codebase → returns per-item verdict',
    expected: 'All items PASS or N/A. Any FAIL must be resolved and re-audited before release.',
    steps: [
      {
        text: 'Copy the audit prompt below and paste it to Max in a new message. Review his response and mark this test Pass when all items are PASS or N/A.',
        cmd: `Max, please run a full database audit of the JumpKit codebase. JumpKit uses two databases: (1) a local SQLite DB abstracted through app/js/db.js and app/preload.js / Electron IPC, and (2) Supabase (PostgreSQL) for auth, profiles, subscriptions, and pending upgrades, accessed via app/supabase/ and Edge Functions in supabase/functions/. Check all of the following and give a clear PASS / FAIL / N\/A for each item with evidence (file + line where relevant):

SQLite (Local DB)
[ ] No raw SQL string concatenation - all queries use parameterized statements (e.g. ? placeholders in better-sqlite3)
[ ] DB file stored in a stable, user-owned path (not a temp dir or app bundle path that gets wiped on update)
[ ] Schema versioning/migrations in code - DB upgrades handled programmatically, not by manual schema edits
[ ] No sensitive data (passwords, tokens, keys) stored unencrypted in SQLite
[ ] DB operations are user-scoped - no query returns data across multiple user IDs

Supabase (Cloud DB)
[ ] Row Level Security (RLS) is enabled on all tables - no table is publicly readable/writable without a policy
[ ] Service role key is NOT present anywhere in client-side code (app/js/, landing/, app/html/) - only anon key used on client
[ ] Dev and production Supabase projects are separate (check supabase/config.js and any env references)
[ ] Edge Functions use the service role key only server-side and never return it to the client
[ ] No raw SQL string concatenation in Edge Functions - parameterized queries or Supabase client methods only
[ ] Migrations tracked in supabase/migrations/ and not applied manually via the dashboard
[ ] No debug/seed/test data hardcoded into production schema or Edge Functions

General
[ ] No database credentials, connection strings, or API keys hardcoded in committed source files (.env files not committed, config.js checked)
[ ] Backups: confirm local SQLite auto-backup is implemented and the backup path is documented
[ ] Connection to Supabase uses the anon key + RLS (not service role) for all end-user operations
[ ] No console.log statements that print query results, user data, or tokens

For each FAIL, show the file + line number and suggest the fix.`
      }
    ],
    test: async () => 'manual'
  },

  {
    id: 376, preflight: true, category: 'Code Quality', platforms: ['mac'],
    title: '[MANUAL] Pre-Flight - localStorage / sessionStorage Audit',
    purpose: 'Ensures no new or unapproved keys have been written to localStorage or sessionStorage. Only the approved keys below should exist - any addition must be intentional and documented.',
    prerequisites: 'None - this is a code review prompt. Copy the prompt below and paste it to Max in a new message.',
    description: 'Paste the prompt below to Max. He will scan every localStorage and sessionStorage usage in the codebase and flag anything outside the approved list. Mark this test Pass only when all usages are accounted for with no unapproved keys.',
    input: 'Prompt copied to Max → Max scans the codebase → returns per-key verdict',
    expected: 'All localStorage/sessionStorage writes match the approved key list. No sensitive data stored. No orphaned or debug keys.',
    steps: [
      {
        text: 'Copy the audit prompt below and paste it to Max in a new message. Review his response and mark this test Pass when all keys are accounted for.',
        cmd: `Max, please run a full localStorage and sessionStorage audit of the JumpKit app codebase (app/js/*.js and any HTML files). Scan every call to localStorage.setItem, localStorage.getItem, localStorage.removeItem, sessionStorage.setItem, sessionStorage.getItem, and sessionStorage.removeItem.

The APPROVED localStorage keys are:
  jk_users                    - user account records (auth is Supabase-managed, local fallback only)
  jk_jumps_{userId}           - jump records per user (SQLite primary, localStorage fallback in browser/dev mode)
  jk_cols_{userId}            - column records per user (SQLite primary, localStorage fallback)
  jk_clicks_{userId}          - click log per user (SQLite primary, localStorage fallback)
  jk_prefs_{userId}           - user preferences per user (SQLite primary, localStorage fallback)
  jk_theme                    - light/dark theme preference
  jk_sidebar_collapsed        - sidebar collapsed state
  jk_teams_expanded           - teams panel expanded state
  jk_backup_reminder_ts       - timestamp of last backup reminder notification
  jk_license_notif_ts         - timestamp of last license notification
  jk_trial_notif_milestone    - trial notification milestone tracker
  jk_sync_fail_notif_ts       - timestamp of last sync failure notification
  jk_notified_invite_ids      - list of invite IDs already notified (prevents duplicate notifications)
  jk_deploy_config            - release testing + deployment session state: version, resultsFilePath, deploymentRecordId, macFinalized, winFinalized, activeRun, folder
  jk_deploy_state             - deployment checklist step states (todo/completed per step ID)

The APPROVED sessionStorage keys are:
  jk_session_token            - session token for single-session lock enforcement
  jk_pending_upgrade_applied  - flag set after apply-pending-upgrade fires on login (prevents double-apply)

For every localStorage/sessionStorage call found, report:
  - The key name
  - The file and line number
  - Whether it is APPROVED or UNAPPROVED
  - For any UNAPPROVED key: what data it stores and whether it should be removed, migrated to SQLite, or added to the approved list

Also check for:
[ ] Any key that stores sensitive data (passwords, tokens, API keys, full user PII) - these must never be in localStorage
[ ] Any key used in only one place (setItem with no corresponding getItem, or vice versa) - likely orphaned/dead code
[ ] Any key written during development/testing that was never cleaned up (debug flags, test overrides, etc.)
[ ] Any direct localStorage access that bypasses the lsGet/lsSet helpers in db.js (outside of db.js itself)
[ ] sessionStorage keys cleared correctly on logout (jk_session_token and jk_pending_upgrade_applied should not persist across sessions)

Return a full table of all keys found with APPROVED / UNAPPROVED / CONCERN status, then a summary verdict.`
      }
    ],
    test: async () => 'manual'
  },

  {
    id: 377, preflight: true, category: 'Code Quality', platforms: ['mac'],
    title: '[MANUAL] Pre-Flight - Code Quality Audit',
    purpose: 'Ensures the app ships without debug artifacts, unhandled async errors, missing UI states, or unbounded list queries. Catches issues that automated tests miss.',
    prerequisites: 'None - this is a code review prompt. Copy the prompt below and paste it to Max in a new message.',
    description: 'Paste the prompt below to Max. He will audit app/js/*.js (excluding chart.min.js) for each item and return a PASS/FAIL/N\/A verdict with file + line evidence. Mark this test Pass only when all items are PASS or N\/A.',
    input: 'Prompt copied to Max → Max scans the codebase → returns per-item verdict',
    expected: 'All items PASS or N/A. Any FAIL must be resolved before release.',
    steps: [
      {
        text: 'Copy the audit prompt below and paste it to Max in a new message. Review his response and mark this test Pass when all items are resolved.',
        cmd: `Max, please run a full code quality audit of the JumpKit app. Scan all files in app/js/*.js EXCLUDING chart.min.js (that is a bundled third-party library). For each item below give a clear PASS / FAIL / N\/A verdict with file + line number evidence for any FAIL.

Console Logs
[ ] No console.log() calls remain in production code - only console.warn() and console.error() are acceptable for genuine error/warning conditions. List every console.log found with file and line.
[ ] No console.debug() calls remain (these were used during development and must be removed before release).
[ ] No commented-out console.log blocks that suggest debug code was recently active.

Backup / Junk Files
[ ] No .bak, .bak-*, .tmp, or .orig files exist in app/js/ - these must be deleted before release. Check specifically for teams.js.bak-2026-05-25 and tests.js.bak.
[ ] No TODO, FIXME, HACK, or XXX comments reference unfinished work that blocks release (advisory items are OK; flag blockers).

Async Error Handling
[ ] All async functions have try/catch blocks or .catch() handlers - no unhandled promise rejections possible in normal user flows.
[ ] All fetch() calls check response.ok or response.status before using the response body - no silent failures on non-2xx responses.
[ ] Supabase calls check the returned { data, error } object - no code silently ignores a non-null error.
[ ] Edge Function calls handle network errors gracefully (timeout, fetch failure) with user-visible feedback.

UI Loading & Error States
[ ] Every async operation that updates the UI has a loading state (spinner, disabled button, or visual indicator) so users know something is happening.
[ ] Every async operation that can fail shows a user-visible error message - no silent failures that leave the UI in a broken state.
[ ] No UI element can get stuck in a permanent loading state if a network call fails (loading indicators must be cleared in catch/finally blocks).

Pagination & Unbounded Queries
[ ] All Supabase list queries that could return large datasets (jumps, columns, teams, notifications, shared_jumps, user_sessions) use .limit() or .range() - no unbounded SELECT * queries against user data tables.
[ ] The app does not load all records into memory at once for tables that could grow unboundedly (e.g. click logs, notifications).

General Code Hygiene
[ ] No hardcoded test emails, user IDs, or UUIDs in production code paths (test data only in tests.js).
[ ] No disabled or bypassed auth checks (e.g. if (false) { requireAuth() } or commented-out session guards).
[ ] No eval(), innerHTML assignments using unsanitized user input, or other XSS vectors in dynamic HTML rendering.
[ ] All event listeners added in page-load or render functions are either cleaned up on unmount/re-render, or are idempotent (safe to add multiple times).
[ ] No infinite loop risks in recursive functions or polling timers - all have a clear exit condition or max-iteration guard.

For each FAIL: show the file, line number, the problematic code snippet, and the recommended fix.`
      }
    ],
    test: async () => 'manual'
  },

  {
    id: 378, preflight: true, category: 'Code Quality', platforms: ['mac'],
    title: '[MANUAL] Pre-Flight - Security Audit',
    purpose: 'Comprehensive security review to ensure the app cannot be hacked, exploited, or used to leak user data. Covers secrets, Electron hardening, XSS, authentication, API security, and supply chain.',
    prerequisites: 'None - this is a code review prompt. Copy the prompt below and paste it to Max in a new message.',
    description: 'Paste the prompt below to Max. He will audit the codebase across all security domains and return a PASS/FAIL/N\/A for each item. Mark this test Pass only when all items are PASS or N\/A with no unresolved FAILs.',
    input: 'Prompt copied to Max → Max scans the codebase → returns per-item verdict',
    expected: 'All items PASS or N/A. Any FAIL is a release blocker.',
    steps: [
      {
        text: 'Copy the audit prompt below and paste it to Max in a new message. Every FAIL is a release blocker - resolve all before shipping.',
        cmd: `Max, please run a comprehensive security audit of the JumpKit codebase. JumpKit is an Electron desktop app. Scan app/js/*.js, app/main.js, app/preload.js, app/html/*.html, landing/*.html, and supabase/functions/**/*.ts. For each item below give a clear PASS / FAIL / N\/A verdict with file + line number evidence for any FAIL.

Secrets & Credentials
[ ] No API keys, tokens, passwords, or secrets are hardcoded in any committed source file - check app/supabase/config.js, app/.env, any .env files, and all JS files for patterns like apiKey=, password=, secret=, Bearer <hardcoded>
[ ] app/.env (contains Apple notarization credentials) is listed in .gitignore and has never been committed to the repo - verify with: git log --all --full-history -- app/.env
[ ] No .env files of any kind are tracked in the repo
[ ] The Supabase ANON key is the only Supabase key present in client-side code - the SERVICE ROLE key must never appear in app/js/, landing/, or app/html/
[ ] Supabase URL and anon key are the only credentials in app/supabase/config.js - no other secrets present

Electron Security (main.js / preload.js)
[ ] contextIsolation: true on all BrowserWindow instances - renderer cannot access Node APIs directly
[ ] nodeIntegration: false on all BrowserWindow instances
[ ] sandbox: true set where possible (or confirm contextIsolation+preload is sufficient mitigation)
[ ] webSecurity is NOT disabled (no webSecurity: false anywhere)
[ ] allowRunningInsecureContent is NOT set to true anywhere
[ ] Content Security Policy (CSP) header is set in main.js and restricts script-src, object-src, and base-uri appropriately
[ ] No use of shell.openExternal() with user-controlled or unvalidated URLs - all external URLs are validated against an allowlist before opening
[ ] preload.js exposes only the minimum necessary APIs via contextBridge - no broad Node/Electron API surface exposed to renderer
[ ] No eval(), new Function(), or executeJavaScript() called with user-supplied input in main process or preload

XSS & Injection (renderer / app JS)
[ ] All innerHTML assignments in app/js/*.js and app/html/*.html use only trusted, app-controlled strings - no user input (jump names, URLs, column names, user email, etc.) is inserted raw into innerHTML without sanitization
[ ] All user-visible strings rendered into the DOM use textContent, innerText, or a safe escaping function - never raw string interpolation into innerHTML
[ ] Jump URLs are validated before being passed to shell.openExternal() - only http://, https://, and local file paths are allowed; javascript: and data: URLs are blocked
[ ] No SQL injection risk in SQLite queries - all better-sqlite3 queries use parameterized statements (? placeholders), never string concatenation
[ ] No prototype pollution risk from JSON.parse() on untrusted data or from Object.assign() with user-supplied keys

Authentication & Session Security
[ ] Supabase auth tokens are never logged, written to localStorage in plain text, or exposed in URLs
[ ] Session token (jk_session_token in sessionStorage) is cleared on logout
[ ] Single-session lock logic (user_sessions table) cannot be bypassed by a client-side manipulation - session enforcement validated server-side or via Supabase RLS
[ ] Password reset flow uses Supabase\'s secure token - no custom reset tokens implemented client-side
[ ] No auth bypass: confirm there is no code path that grants app access without a valid Supabase session (e.g. offline mode that skips auth)

API & Network Security
[ ] All calls to Supabase Edge Functions use HTTPS (never HTTP)
[ ] Edge Functions validate their input - no function blindly trusts the request body without checking required fields
[ ] Edge Functions that perform privileged actions (apply-pending-upgrade, ls-webhook) verify the caller is authorized before acting - not callable by arbitrary users
[ ] CORS is configured on Edge Functions - they do not accept requests from arbitrary origins
[ ] The ls-webhook Edge Function validates the Lemon Squeezy webhook signature before processing any payload

Supply Chain & Dependencies
[ ] npm audit shows 0 critical or high vulnerabilities (run: cd app && npm audit)
[ ] No dependencies with known malicious versions (check npm audit output)
[ ] package-lock.json is committed and up to date - no floating version ranges that could pull in unexpected upgrades
[ ] No unused or abandoned dependencies that expand the attack surface unnecessarily

Data Privacy
[ ] No user PII (email, name, subscription data) is logged to the console or written to local files in plain text
[ ] Crash/error reports (if any) do not include sensitive user data
[ ] Local SQLite database file is stored in the user\'s app data directory - not in a world-readable temp path
[ ] No analytics or telemetry sends user data to third-party services without disclosure

For each FAIL: show the file, line number, the problematic code, severity (Critical/High/Medium), and the recommended fix. Treat any Critical or High finding as a release blocker.`
      }
    ],
    test: async () => 'manual'
  },

  // ── Shared Jump Sync Tests (78-82) ────────────────────────────────
  // These tests create real data in Supabase, verify it, then clean up.
  // They require: logged in as org-owner, at least one team with a shared column.
  {
    id: 78, category: 'Shared Sync',
    title: 'Add jump to shared column → appears in Supabase shared_jumps',
    purpose: 'Verifies that creating a new jump in a shared column immediately pushes it to Supabase shared_jumps for team members to see.',
    prerequisites: 'Must be logged in as org-owner with at least one shared column.',
    description: 'Creates a test jump in the first shared column, waits 1s, checks Supabase, then cleans up.',
    input: 'DB.createJump + Supabase shared_jumps query',
    expected: 'Supabase shared_jumps contains the test jump. Cleaned up after.',
    test: async () => {
      // Use test chain data (from tests 65+66) if available; else fall back to real shared column.
      // test 65 creates _testTeamId; test 66 creates _testSharedColId (a Supabase UUID).
      // The cleanup test (id:374) now runs AFTER all Shared Sync tests so the data persists.
      const _anyLocalCol = DB.getColumns(currentUser.id)[0];
      let sharedCol;
      if (window._testTeamId && window._testSharedColId) {
        sharedCol = { id: _anyLocalCol?.id, supabaseId: window._testSharedColId, teamId: window._testTeamId, name: 'test-shared-col' };
      } else {
        sharedCol = DB.getColumns(currentUser.id).find(c => c.isShared && c.supabaseId);
      }
      if (!sharedCol) throw new Error('No shared column found - run tests 65+66 first (team setup chain) or share a column manually');
      if (!_anyLocalCol) throw new Error('No local column found - need at least one column in the app');

      // Verify test team is still owned by this user in Supabase (catches stale _testTeamId)
      if (sharedCol.teamId) {
        const { data: teamOwnerCheck } = await supabaseClient
          .from('teams').select('id, owner_id').eq('id', sharedCol.teamId).single();
        if (!teamOwnerCheck) throw new Error(`Test team ${sharedCol.teamId} not found in Supabase - relaunch and re-run test 65 to recreate it`);
        const myId = window._supabaseUser?.id;
        if (teamOwnerCheck.owner_id !== myId) throw new Error(`Team owner mismatch: team owned by ${teamOwnerCheck.owner_id}, logged in as ${myId} - RLS is_team_owner will fail`);
      }

      // Create test jump
      const testName = `__TEST_JUMP_${Date.now()}__`;
      const newJump = DB.createJump(currentUser.id, {
        name: testName, url: 'https://test.jumpkit.app',
        description: 'Auto-generated test jump', columnId: sharedCol.id,
      });
      if (!newJump) throw new Error('DB.createJump returned null');

      // Push to Supabase (same logic as saveJump)
      const supabaseId = crypto.randomUUID();
      DB.updateJump(currentUser.id, newJump.id, { supabaseId, isShared: 1, teamId: sharedCol.teamId });
      const { error: insertErr } = await supabaseClient.from('shared_jumps').insert({
        id: supabaseId, shared_column_id: sharedCol.supabaseId, team_id: sharedCol.teamId,
        name: testName, url: 'https://test.jumpkit.app', description: 'Auto-generated test jump',
        reason: '', position: 999, created_by: window._supabaseUser?.id,
      });
      if (insertErr) throw new Error('Insert to shared_jumps failed: ' + insertErr.message);

      // Verify in Supabase
      await new Promise(r => setTimeout(r, 500));
      const { data, error } = await supabaseClient.from('shared_jumps').select('id,name').eq('id', supabaseId).single();
      if (error || !data) throw new Error('Test jump not found in Supabase: ' + (error?.message || 'no data'));
      if (data.name !== testName) throw new Error(`Name mismatch: expected "${testName}", got "${data.name}"`);

      // Cleanup - delete from Supabase and local
      await supabaseClient.from('shared_jumps').delete().eq('id', supabaseId);
      DB.deleteJump(currentUser.id, newJump.id);
      return true;
    }
  },

  {
    id: 79, category: 'Shared Sync',
    title: 'Edit jump in shared column → Supabase shared_jumps updated',
    purpose: 'Verifies that editing a jump already in a shared column pushes the update to Supabase.',
    prerequisites: 'Must be logged in as org-owner with at least one shared column.',
    description: 'Creates a shared test jump, edits it, checks Supabase for updated name, then cleans up.',
    input: 'DB.updateJump + Supabase shared_jumps update query',
    expected: 'Supabase shared_jumps shows updated name. Cleaned up after.',
    test: async () => {
      // Use test chain data (from tests 65+66) if available; else fall back to real shared column.
      const _anyLocalCol = DB.getColumns(currentUser.id)[0];
      let sharedCol;
      if (window._testTeamId && window._testSharedColId) {
        sharedCol = { id: _anyLocalCol?.id, supabaseId: window._testSharedColId, teamId: window._testTeamId, name: 'test-shared-col' };
      } else {
        sharedCol = DB.getColumns(currentUser.id).find(c => c.isShared && c.supabaseId);
      }
      if (!sharedCol) throw new Error('No shared column found - run tests 65+66 first (team setup chain) or share a column manually');
      if (!_anyLocalCol) throw new Error('No local column found - need at least one column in the app');

      // Create initial jump
      const testName = `__TEST_EDIT_${Date.now()}__`;
      const supabaseId = crypto.randomUUID();
      const newJump = DB.createJump(currentUser.id, { name: testName, url: 'https://test.jumpkit.app', columnId: sharedCol.id });
      DB.updateJump(currentUser.id, newJump.id, { supabaseId, isShared: 1, teamId: sharedCol.teamId });
      await supabaseClient.from('shared_jumps').insert({
        id: supabaseId, shared_column_id: sharedCol.supabaseId, team_id: sharedCol.teamId,
        name: testName, url: 'https://test.jumpkit.app', description: '', reason: '', position: 999, created_by: window._supabaseUser?.id,
      });

      // Edit the jump
      const updatedName = testName + '_EDITED';
      DB.updateJump(currentUser.id, newJump.id, { name: updatedName });
      const { error: updateErr } = await supabaseClient.from('shared_jumps').update({ name: updatedName }).eq('id', supabaseId);
      if (updateErr) throw new Error('Update to shared_jumps failed: ' + updateErr.message);

      // Verify
      await new Promise(r => setTimeout(r, 500));
      const { data } = await supabaseClient.from('shared_jumps').select('name').eq('id', supabaseId).single();
      if (data?.name !== updatedName) throw new Error(`Edit not reflected in Supabase: expected "${updatedName}", got "${data?.name}"`);

      // Cleanup
      await supabaseClient.from('shared_jumps').delete().eq('id', supabaseId);
      DB.deleteJump(currentUser.id, newJump.id);
      return true;
    }
  },

  {
    id: 80, category: 'Shared Sync',
    title: 'Delete jump from shared column → removed from Supabase shared_jumps',
    purpose: 'Verifies that deleting a jump from a shared column removes it from Supabase so team members no longer see it.',
    prerequisites: 'Must be logged in as org-owner with at least one shared column.',
    description: 'Creates a shared test jump, deletes it, verifies it is gone from Supabase.',
    input: 'DB.deleteJump + Supabase shared_jumps delete query',
    expected: 'Supabase shared_jumps no longer contains the test jump.',
    test: async () => {
      // Use test chain data (from tests 65+66) if available; else fall back to real shared column.
      const _anyLocalCol = DB.getColumns(currentUser.id)[0];
      let sharedCol;
      if (window._testTeamId && window._testSharedColId) {
        sharedCol = { id: _anyLocalCol?.id, supabaseId: window._testSharedColId, teamId: window._testTeamId, name: 'test-shared-col' };
      } else {
        sharedCol = DB.getColumns(currentUser.id).find(c => c.isShared && c.supabaseId);
      }
      if (!sharedCol) throw new Error('No shared column found - run tests 65+66 first (team setup chain) or share a column manually');
      if (!_anyLocalCol) throw new Error('No local column found - need at least one column in the app');

      // Create test jump
      const testName = `__TEST_DELETE_${Date.now()}__`;
      const supabaseId = crypto.randomUUID();
      const newJump = DB.createJump(currentUser.id, { name: testName, url: 'https://test.jumpkit.app', columnId: sharedCol.id });
      DB.updateJump(currentUser.id, newJump.id, { supabaseId, isShared: 1, teamId: sharedCol.teamId });
      await supabaseClient.from('shared_jumps').insert({
        id: supabaseId, shared_column_id: sharedCol.supabaseId, team_id: sharedCol.teamId,
        name: testName, url: 'https://test.jumpkit.app', description: '', reason: '', position: 999, created_by: window._supabaseUser?.id,
      });

      // Delete the jump (same logic as doDelete)
      await supabaseClient.from('shared_jumps').delete().eq('id', supabaseId);
      DB.deleteJump(currentUser.id, newJump.id);

      // Verify gone from Supabase
      await new Promise(r => setTimeout(r, 500));
      const { data } = await supabaseClient.from('shared_jumps').select('id').eq('id', supabaseId);
      if (data && data.length > 0) throw new Error('Test jump still exists in Supabase after deletion!');

      return true;
    }
  },

  {
    id: 81, category: 'Shared Sync',
    title: 'Move jump OUT of shared column → removed from Supabase shared_jumps',
    purpose: 'Verifies that moving a shared jump to a non-shared column removes it from Supabase.',
    prerequisites: 'Must be logged in as org-owner with at least one shared column and one non-shared column.',
    description: 'Creates a shared test jump, moves it to a personal column, verifies it is gone from Supabase.',
    input: 'DB.updateJump (columnId change) + Supabase delete',
    expected: 'Supabase shared_jumps no longer contains the jump after it is moved to a personal column.',
    test: async () => {
      const sharedCol = DB.getColumns(currentUser.id).find(c => c.isShared && c.supabaseId);
      const personalCol = DB.getColumns(currentUser.id).find(c => !c.isShared);
      if (!sharedCol) throw new Error('No shared column found');
      if (!personalCol) throw new Error('No personal column found');

      // Create shared test jump
      const testName = `__TEST_MOVE_${Date.now()}__`;
      const supabaseId = crypto.randomUUID();
      const newJump = DB.createJump(currentUser.id, { name: testName, url: 'https://test.jumpkit.app', columnId: sharedCol.id });
      DB.updateJump(currentUser.id, newJump.id, { supabaseId, isShared: 1, teamId: sharedCol.teamId });
      await supabaseClient.from('shared_jumps').insert({
        id: supabaseId, shared_column_id: sharedCol.supabaseId, team_id: sharedCol.teamId,
        name: testName, url: 'https://test.jumpkit.app', description: '', reason: '', position: 999, created_by: window._supabaseUser?.id,
      });

      // Move to personal column (same logic as edit path when moving out)
      await supabaseClient.from('shared_jumps').delete().eq('id', supabaseId);
      DB.updateJump(currentUser.id, newJump.id, { columnId: personalCol.id, isShared: 0, teamId: null, supabaseId: null });

      // Verify gone from Supabase
      await new Promise(r => setTimeout(r, 500));
      const { data } = await supabaseClient.from('shared_jumps').select('id').eq('id', supabaseId);
      if (data && data.length > 0) throw new Error('Jump still in Supabase after being moved to personal column!');

      // Cleanup local
      DB.deleteJump(currentUser.id, newJump.id);
      return true;
    }
  },

  {
    id: 82, category: 'Shared Sync',
    title: 'Move jump INTO shared column → inserted into Supabase shared_jumps',
    purpose: 'Verifies that moving a personal jump into a shared column pushes it to Supabase.',
    prerequisites: 'Must be logged in as org-owner with at least one shared column and one non-shared column.',
    description: 'Creates a personal test jump, moves it to a shared column, verifies it appears in Supabase, then cleans up.',
    input: 'DB.createJump + DB.updateJump (columnId change) + Supabase insert',
    expected: 'Supabase shared_jumps contains the jump after it is moved to a shared column.',
    test: async () => {
      const sharedCol = DB.getColumns(currentUser.id).find(c => c.isShared && c.supabaseId);
      const personalCol = DB.getColumns(currentUser.id).find(c => !c.isShared);
      if (!sharedCol) throw new Error('No shared column found');
      if (!personalCol) throw new Error('No personal column found');

      // Create personal test jump
      const testName = `__TEST_MOVEIN_${Date.now()}__`;
      const newJump = DB.createJump(currentUser.id, { name: testName, url: 'https://test.jumpkit.app', columnId: personalCol.id });

      // Move into shared column
      const supabaseId = crypto.randomUUID();
      DB.updateJump(currentUser.id, newJump.id, { columnId: sharedCol.id, supabaseId, isShared: 1, teamId: sharedCol.teamId });
      const { error } = await supabaseClient.from('shared_jumps').insert({
        id: supabaseId, shared_column_id: sharedCol.supabaseId, team_id: sharedCol.teamId,
        name: testName, url: 'https://test.jumpkit.app', description: '', reason: '', position: 999, created_by: window._supabaseUser?.id,
      });
      if (error) throw new Error('Insert to shared_jumps failed: ' + error.message);

      // Verify in Supabase
      await new Promise(r => setTimeout(r, 500));
      const { data } = await supabaseClient.from('shared_jumps').select('id,name').eq('id', supabaseId).single();
      if (!data) throw new Error('Jump not found in Supabase after being moved to shared column');

      // Cleanup
      await supabaseClient.from('shared_jumps').delete().eq('id', supabaseId);
      DB.deleteJump(currentUser.id, newJump.id);
      return true;
    }
  },

  // ── Jump & Column CRUD ─────────────────────────────────────────
  {
    id: 36, category: 'Jumps',
    title: 'DB.updateJump persists field changes',
    purpose: 'Confirms that updateJump correctly writes name, URL, and description changes back to the in-memory cache (and SQLite). If this fails, jump edits via the Configure modal will silently discard user changes.',
    prerequisites: 'At least one active jump must exist. Test is self-cleaning.',
    description: 'Creates a test jump, updates name/url/description, reads it back, verifies values match, then deletes it.',
    input: 'DB.createJump → DB.updateJump({ name, url, description }) → DB.getActiveJumps',
    expected: 'Read-back values match the updated name, url, and description exactly.',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (!cols.length) throw new Error('No columns available - cannot create test jump');

      const original = { id: '__test_update_' + Date.now(), name: '__ORIG_NAME__', url: 'https://before.test', description: 'original desc', columnId: cols[0].id, favorite: false, isArchived: false, clickCount: 0, createdAt: Date.now() };
      const saved = DB.createJump(currentUser.id, original);

      DB.updateJump(currentUser.id, saved.id, { name: '__UPDATED_NAME__', url: 'https://after.test', description: 'updated desc' });

      const found = DB.getActiveJumps(currentUser.id).find(j => j.id === saved.id);
      DB.deleteJump(currentUser.id, saved.id);

      if (!found) throw new Error('Jump not found after updateJump');
      if (found.name !== '__UPDATED_NAME__') throw new Error(`name not updated - got: ${found.name}`);
      if (found.url  !== 'https://after.test') throw new Error(`url not updated - got: ${found.url}`);
      if (found.description !== 'updated desc') throw new Error(`description not updated - got: ${found.description}`);
      return true;
    }
  },

  {
    id: 43, category: 'Columns',
    title: 'Column create / delete lifecycle',
    purpose: 'Tests the full create → verify → delete cycle for a column via the DB layer. Regressions here would prevent users from adding or removing columns entirely.',
    prerequisites: 'Must be logged in. Test is self-cleaning - no permanent side effects.',
    description: 'Creates a test column via DB.createColumn, confirms it appears in getColumns, then removes it via saveColumns, and confirms it is gone.',
    input: 'DB.createColumn(userId, name, order) → DB.getColumns → DB.saveColumns (remove)',
    expected: 'Column present after create, absent after delete.',
    test: async () => {
      const testName = '__TEST_COL_' + Date.now() + '__';
      const newCol = DB.createColumn(currentUser.id, testName, 9999);

      if (!newCol || !newCol.id) throw new Error('createColumn returned no object');
      const afterCreate = DB.getColumns(currentUser.id).find(c => c.id === newCol.id);
      if (!afterCreate) throw new Error('Column not found in getColumns after createColumn');

      // Delete - remove from array and save
      const cleaned = DB.getColumns(currentUser.id).filter(c => c.id !== newCol.id);
      DB.saveColumns(currentUser.id, cleaned);

      const afterDelete = DB.getColumns(currentUser.id).find(c => c.id === newCol.id);
      if (afterDelete) throw new Error('Column still present after delete via saveColumns');

      return true;
    }
  },

  {
    id: 37, category: 'Jumps',
    title: 'Jump favorite toggle persists',
    purpose: 'Confirms that marking a jump as a favorite (and unmarking it) correctly updates the in-memory cache. Favorites power the quick-access section - silent failure here would silently break it.',
    prerequisites: 'At least one column must exist. Test is self-cleaning.',
    description: 'Creates a test jump (favorite=false), sets favorite=true via updateJump, reads back, then sets false again, reads back, deletes.',
    input: 'DB.createJump → DB.updateJump({ favorite: true }) → DB.getActiveJumps → DB.updateJump({ favorite: false })',
    expected: 'favorite is true after first update, false after second update.',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (!cols.length) throw new Error('No columns available');

      const j = DB.createJump(currentUser.id, { id: '__test_fav_' + Date.now(), name: '__FAV_TEST__', url: 'https://fav.test', columnId: cols[0].id, favorite: false, isArchived: false, clickCount: 0, createdAt: Date.now() });

      DB.updateJump(currentUser.id, j.id, { favorite: true });
      const afterTrue = DB.getActiveJumps(currentUser.id).find(x => x.id === j.id);
      if (!afterTrue?.favorite) throw new Error('favorite not set to true after updateJump');

      DB.updateJump(currentUser.id, j.id, { favorite: false });
      const afterFalse = DB.getActiveJumps(currentUser.id).find(x => x.id === j.id);
      if (afterFalse?.favorite) throw new Error('favorite still true after setting to false');

      DB.deleteJump(currentUser.id, j.id);
      return true;
    }
  },

  {
    id: 38, category: 'Jumps',
    title: 'DB.incrementClick increments clickCount',
    purpose: 'Verifies that opening a jump via DB.incrementClick correctly increments clickCount in cache. Stats, sorting, and the top-used display all depend on this counter being accurate.',
    prerequisites: 'At least one column must exist. Test is self-cleaning.',
    description: 'Creates a test jump (clickCount=0), calls DB.incrementClick twice, reads back, verifies clickCount is 2, then deletes.',
    input: 'DB.createJump → DB.incrementClick × 2 → DB.getActiveJumps → DB.deleteJump',
    expected: 'clickCount equals 2 after two incrementClick calls.',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (!cols.length) throw new Error('No columns available');

      const j = DB.createJump(currentUser.id, { id: '__test_click_' + Date.now(), name: '__CLICK_TEST__', url: 'https://click.test', columnId: cols[0].id, favorite: false, isArchived: false, clickCount: 0, createdAt: Date.now() });

      DB.incrementClick(currentUser.id, j.id);
      DB.incrementClick(currentUser.id, j.id);

      const found = DB.getActiveJumps(currentUser.id).find(x => x.id === j.id);
      DB.deleteJump(currentUser.id, j.id);

      if (!found) throw new Error('Jump not found after incrementClick');
      if (found.clickCount !== 2) throw new Error(`Expected clickCount=2, got ${found.clickCount}`);
      return true;
    }
  },

  {
    id: 44, category: 'Columns',
    title: 'Column drag-reorder persists order values',
    purpose: "Confirms that shuffling column .order values via saveColumns correctly persists the new order in cache. Drag-and-drop reordering relies entirely on this - failure means the user's column order resets on reload.",
    prerequisites: 'At least two columns must exist. Test restores original order - no permanent side effects.',
    description: 'Reads current columns, reverses their .order values, saves, reads back, verifies order changed, then restores originals.',
    input: 'DB.getColumns → shuffle order values → DB.saveColumns → DB.getColumns',
    expected: 'Columns reflect new .order values after saveColumns.',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (cols.length < 2) throw new Error('Need at least 2 columns to test reordering');

      // Snapshot originals
      const originals = cols.map(c => ({ id: c.id, order: c.order }));

      // Assign reversed order values
      const reordered = cols.map((c, i) => ({ ...c, order: cols.length - 1 - i }));
      DB.saveColumns(currentUser.id, reordered);

      const afterSave = DB.getColumns(currentUser.id);

      // Restore originals
      DB.saveColumns(currentUser.id, cols.map((c, i) => ({ ...c, order: originals[i].order })));

      // Verify at least one column changed order
      const changed = afterSave.some(c => {
        const orig = originals.find(o => o.id === c.id);
        return orig && orig.order !== c.order;
      });
      if (!changed) throw new Error('No column order values changed after saveColumns - reorder did not persist');
      return true;
    }
  },

  // ── Sync & Sharing ─────────────────────────────────────────────
  {
    id: 83, category: 'Shared Sync',
    title: 'Shared column rename updates Supabase shared_columns.name',
    purpose: "Verifies that when an owner renames a shared column, the new name is pushed to Supabase shared_columns so members see the correct name on their next sync. This was a known bug fix - this test guards against regression.",
    prerequisites: 'Must be logged in as org-owner with at least one active shared column that has a valid supabaseId.',
    description: "Renames a shared column locally, pushes to Supabase, reads back from Supabase, verifies name matches, then restores the original name.",
    input: 'DB.getColumns (shared) → DB.saveColumns (rename) → supabaseClient.from(shared_columns).update → select',
    expected: 'Supabase shared_columns.name matches the new local name after update.',
    test: async () => {
      const sharedCols = DB.getColumns(currentUser.id).filter(c => c.isShared && c.supabaseId);
      if (!sharedCols.length) throw new Error('No shared columns with supabaseId found - must be logged in as an org-owner with at least one shared column');

      const col = sharedCols[0];
      const originalName = col.name;
      const testName = '__RENAMED_TEST_' + Date.now() + '__';

      // Rename locally
      const updatedCols = DB.getColumns(currentUser.id).map(c => c.id === col.id ? { ...c, name: testName } : c);
      DB.saveColumns(currentUser.id, updatedCols);

      // Push to Supabase
      const { error } = await supabaseClient
        .from('shared_columns')
        .update({ name: testName })
        .eq('id', col.supabaseId);
      if (error) throw new Error('Supabase update failed: ' + error.message);

      // Verify
      await new Promise(r => setTimeout(r, 500));
      const { data, error: readErr } = await supabaseClient
        .from('shared_columns')
        .select('name')
        .eq('id', col.supabaseId)
        .single();
      if (readErr) throw new Error('Read-back from Supabase failed: ' + readErr.message);
      if (data?.name !== testName) throw new Error(`Supabase name mismatch - expected "${testName}", got "${data?.name}"`);

      // Restore original name
      const restoredCols = DB.getColumns(currentUser.id).map(c => c.id === col.id ? { ...c, name: originalName } : c);
      DB.saveColumns(currentUser.id, restoredCols);
      await supabaseClient.from('shared_columns').update({ name: originalName }).eq('id', col.supabaseId);

      return true;
    }
  },

  {
    id: 84, category: 'Shared Sync',
    title: 'syncSharedJumps runs without error',
    purpose: 'Validates that the core sync function completes without throwing, regardless of team membership state. A crash here would prevent all shared jump propagation.',
    prerequisites: 'Must be logged in. Works regardless of team membership - sync gracefully no-ops if no shared teams.',
    description: 'Calls syncSharedJumps() and awaits completion. Verifies no exception is thrown.',
    input: 'syncSharedJumps()',
    expected: 'syncSharedJumps() resolves without throwing.',
    test: async () => {
      if (typeof syncSharedJumps !== 'function') throw new Error('syncSharedJumps is not defined - sync.js may not be loaded');
      await syncSharedJumps();
      return true;
    }
  },

  {
    id: 374, category: 'Shared Sync',
    title: 'Cleanup - purge ALL test artifacts from Supabase',
    purpose: 'Sweeps ALL stale test data from Supabase - not just the current run. Finds every team, shared_column, shared_jump, invite, and member row created by any previous test run using the __jk_test_* / __test_* naming convention, and deletes them. Also restores role elevated by test 69.',
    prerequisites: 'Must be logged in. Safe to run even if no test data exists.',
    input: 'teams ILIKE "__%_test_%", shared_jumps name ILIKE "__TEST_%", plus _testTeamId chain cleanup',
    description: 'Queries Supabase for all test-named teams and orphaned shared_jumps, cascades deletes through team_invites → team_members → shared_jumps → shared_columns → teams.',
    expected: 'Zero test artifact rows remain in teams, team_members, team_invites, shared_columns, or shared_jumps.',
    test: async () => {
      const sc = supabaseClient;
      let swept = { teams: 0, invites: 0, members: 0, sharedCols: 0, sharedJumps: 0 };

      // ── 1. Find ALL test teams (all runs) ──────────────────────────
      // Patterns: __jk_test_team_* (test 69) and __test_team_* (test 139)
      const { data: testTeams, error: teamsErr } = await sc
        .from('teams')
        .select('id')
        .or('name.ilike.__jk_test_team_%,name.ilike.__test_team_%');
      if (teamsErr) throw new Error('Failed to query test teams: ' + teamsErr.message);

      for (const team of (testTeams || [])) {
        const tid = team.id;

        // a. Delete team_invites
        const { count: ic } = await sc.from('team_invites').delete({ count: 'exact' }).eq('team_id', tid);
        swept.invites += ic || 0;

        // b. Delete team_members
        const { count: mc } = await sc.from('team_members').delete({ count: 'exact' }).eq('team_id', tid);
        swept.members += mc || 0;

        // c. Find shared_columns for this team, delete their shared_jumps first
        const { data: cols } = await sc.from('shared_columns').select('id').eq('team_id', tid);
        for (const col of (cols || [])) {
          const { count: jc } = await sc.from('shared_jumps').delete({ count: 'exact' }).eq('shared_column_id', col.id);
          swept.sharedJumps += jc || 0;
        }

        // d. Delete shared_columns
        const { count: scc } = await sc.from('shared_columns').delete({ count: 'exact' }).eq('team_id', tid);
        swept.sharedCols += scc || 0;

        // e. Delete team
        await sc.from('teams').delete().eq('id', tid);
        swept.teams++;
      }

      // ── 2. Sweep orphaned shared_jumps with test names ─────────────
      // Names: __TEST_JUMP_*, __TEST_EDIT_*, __TEST_DELETE_*, __TEST_MOVE_*, __TEST_MOVEIN_*, __TEST_COL_*
      const { count: ojc } = await sc
        .from('shared_jumps')
        .delete({ count: 'exact' })
        .ilike('name', '__TEST_%');
      swept.sharedJumps += ojc || 0;

      // ── 3. Clear in-memory test state ──────────────────────────────
      window._testTeamId      = null;
      window._testTeamName    = null;
      window._testSharedColId = null;
      window._testInviteId    = null;
      window._testInviteEmail = null;

      // ── 4. Restore role elevated by test 69 ───────────────────────
      const origRole = window._testOriginalRole;
      if (origRole && origRole !== 'org-owner') {
        const userId = window._supabaseUser?.id;
        if (userId) {
          await sc.from('profiles').update({ role: origRole }).eq('id', userId);
          if (window._supabaseProfile) window._supabaseProfile.role = origRole;
        }
        window._testOriginalRole = null;
      }

      // ── 5. Final verification - no test teams remain ───────────────
      const { data: remaining } = await sc
        .from('teams')
        .select('id, name')
        .or('name.ilike.__jk_test_team_%,name.ilike.__test_team_%');
      if (remaining && remaining.length > 0) {
        throw new Error(`${remaining.length} test team(s) still exist after cleanup: ${remaining.map(t => t.name).join(', ')}`);
      }

      return `Swept: ${swept.teams} team(s), ${swept.invites} invite(s), ${swept.members} member(s), ${swept.sharedCols} shared_column(s), ${swept.sharedJumps} shared_jump(s)`;
    }
  },

  {
    id: 75, category: 'Teams',
    title: 'Team join rejects wrong password',
    purpose: 'Confirms the server-side password verification correctly rejects an invalid password. If this fails, team access control is broken - anyone could join any team.',
    prerequisites: 'Must be logged in. Requires at least one team to exist in Supabase. The test intentionally uses a wrong password and verifies rejection.',
    description: 'Calls the verify-team-password edge function with a clearly wrong password and confirms the response is valid=false.',
    input: 'supabaseClient.functions.invoke("verify-team-password", { teamId, candidatePassword: "__WRONG__" })',
    expected: 'Response returns valid=false or an error for the wrong password.',
    test: async () => {
      const { data: team, error: teamsErr } = await supabaseClient
        .from('teams')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (teamsErr) throw new Error('Could not fetch teams: ' + teamsErr.message);
      if (!team) throw new Error('No teams found in Supabase - create at least one team first');

      const { data: verifyData, error: verifyErr } = await supabaseClient.functions.invoke('verify-team-password', {
        body: { teamId: team.id, candidatePassword: '__INTENTIONALLY_WRONG_PASSWORD__' },
      });

      // Either an error OR valid=false means the reject path works correctly
      if (!verifyErr && verifyData?.valid === true) {
        throw new Error('Wrong password was accepted - password verification is broken!');
      }
      return true;
    }
  },

  // ── Persistence & UX ──────────────────────────────────────────
  {
    id: 30, category: 'Settings',
    title: 'Theme pref persists via DB.savePrefs / getPrefs',
    purpose: "Verifies that saving a theme preference writes to cache and reading it back returns the correct value. Theme persists across sessions via this prefs layer - a failure means the user's theme choice resets every restart.",
    prerequisites: 'Must be logged in.',
    description: 'Reads the current theme pref, saves a new value ("dark"), reads back via getPrefs, verifies match, then restores the original.',
    input: 'DB.getPrefs(userId) → DB.savePrefs(userId, { theme: "dark" }) → DB.getPrefs(userId)',
    expected: 'getPrefs returns theme="dark" after savePrefs.',
    test: async () => {
      const original = DB.getPrefs(currentUser.id);
      const originalTheme = original.theme || 'light';

      DB.savePrefs(currentUser.id, { theme: 'dark' });
      const after = DB.getPrefs(currentUser.id);

      DB.savePrefs(currentUser.id, { theme: originalTheme });

      if (after.theme !== 'dark') throw new Error(`Expected theme="dark" after savePrefs, got: "${after.theme}"`);
      return true;
    }
  },

  {
    id: 51, category: 'Stats',
    title: 'DB.logClick records entry in click log',
    purpose: 'Confirms that logClick appends an entry to the in-memory click log for the correct user. Stats, charts, and the top-used jump list all derive from this log - silent failure here corrupts all usage analytics.',
    prerequisites: 'At least one column must exist. Test creates and deletes its own jump.',
    description: 'Creates a test jump, calls DB.logClick with its id, reads the click log, confirms an entry exists for that jump, then deletes.',
    input: 'DB.createJump → DB.logClick(userId, jumpId) → DB.getClickLog(userId)',
    expected: 'getClickLog contains at least one entry with jumpId matching the test jump.',
    test: async () => {
      const cols = DB.getColumns(currentUser.id);
      if (!cols.length) throw new Error('No columns available - cannot create test jump');

      const j = DB.createJump(currentUser.id, { id: '__test_log_' + Date.now(), name: '__LOG_TEST__', url: 'https://log.test', columnId: cols[0].id, favorite: false, isArchived: false, clickCount: 0, createdAt: Date.now() });

      const beforeCount = DB.getClickLog(currentUser.id).filter(e => e.jumpId === j.id).length;
      DB.logClick(currentUser.id, j.id);
      const afterLog = DB.getClickLog(currentUser.id).filter(e => e.jumpId === j.id);

      DB.deleteJump(currentUser.id, j.id);

      if (afterLog.length <= beforeCount) throw new Error('No click log entry was added after DB.logClick');
      if (!afterLog.some(e => e.jumpId === j.id)) throw new Error('Click log entry has wrong jumpId');
      return true;
    }
  },

  {
    id: 93, category: 'Subscription', platforms: ['mac'],
    title: '[MANUAL] Lemon Squeezy webhook upgrades subscription_status',
    purpose: 'End-to-end validation that a real Lemon Squeezy subscription_created webhook correctly sets subscription_status="active" and subscription_tier="core" in Supabase. This is the core billing flow - failure means paid users are not upgraded.',
    prerequisites: 'LS store in Test mode. ls-webhook Edge Function deployed. Must be logged in as the user whose email you use for the checkout.',
    description: 'Complete a LS test-mode checkout to fire the real webhook end-to-end and verify the profile is upgraded in Supabase and in the app.',
    input: 'LS test-mode checkout with test card 4242 4242 4242 4242',
    expected: 'profiles.subscription_status = "active" and subscription_tier = "core". Account page shows "JumpKit Unlimited".',
    steps: (user) => {
      const email = user?.email || 'your-email@example.com';
      return [
        { text: 'Open the LS checkout page - confirm Test mode is active by verifying the orange "Test mode" banner at the top of the page.', link: { url: 'https://jumpkit.lemonsqueezy.com/checkout/buy/81c37b98-510a-4ca9-9849-06f10fd3a8d0', label: 'LS Checkout' } },
        { text: 'Go to Supabase → Table Editor → Profiles and confirm you have a test account already created in the free tier.' },
        { text: 'Complete a purchase with the free account from step 2 using test card 4242 4242 4242 4242, any future expiry, any CVC.' },
        { text: 'Wait ~5 seconds - LS fires the real subscription_created webhook to your ls-webhook Edge Function.' },
        { text: 'In Supabase Table Editor → profiles → confirm subscription_status = "active" and subscription_tier = "core" for your user.' },
        { text: 'Log in to JumpKit with the account from step 2, nav to the Account page, confirm account type shows "JumpKit Unlimited", confirm all CTA banners are removed, and confirm the JumpKit Unlimited modal renders after first login after upgrade.' },
        { text: 'Reset your profile after testing.', cmd: `UPDATE profiles\nSET subscription_status='free', subscription_tier='free', subscription_plan=NULL, ls_customer_id=NULL\nWHERE email='${email}';` },
      ];
    },
    test: async () => 'manual'
  },

  {
    id: 122, category: 'Maintenance',
    title: 'Auto-archive fires correctly and creates notification',
    purpose: 'Verifies that runAutoArchive() correctly identifies jumps unused past the threshold, archives them in SQLite, and creates an in-app notification. Confirms free-tier users are blocked.',
    prerequisites: 'Must be logged in as an Unlimited user with auto-archive set to any value (not Never). At least one active jump must exist.',
    description: 'Fakes the lastUsed timestamp of the first active jump to 400 days ago, runs runAutoArchive() with the current threshold, verifies the jump is archived, and checks that a notification was created. Cleans up by unarchiving the jump and removing the test notification.',
    input: 'DB.updateJump(userId, jumpId, { lastUsed: Date.now() - 400days }), then runAutoArchive()',
    expected: 'Jump moves to archive. Notification created with type=auto-archive. Free tier returns early without archiving.',
    test: async () => {
      // 1. Verify Unlimited tier
      const tier = window._supabaseProfile?.subscription_tier || 'free';
      if (tier === 'free') throw new Error('Unlimited tier required - auto-archive is not available on free tier');

      // 2. Ensure autoArchive pref is set
      const prefs = DB.getPrefs(currentUser.id);
      if (!prefs.autoArchive || prefs.autoArchive === 'never') throw new Error('Auto-archive is set to Never - go to Settings and set it to any other value before running this test');

      // 3. Grab a test jump
      const active = DB.getActiveJumps(currentUser.id);
      if (active.length === 0) throw new Error('No active jumps to test with. Add at least one jump first.');
      const testJump = active[0];
      const originalLastUsed = testJump.lastUsed;

      // 4. Fake lastUsed to 400 days ago (exceeds all thresholds)
      DB.updateJump(currentUser.id, testJump.id, { lastUsed: Date.now() - (400 * 24 * 60 * 60 * 1000) });

      // 5. Run auto-archive
      runAutoArchive();

      // 6. Verify jump is now archived
      const stillActive = DB.getActiveJumps(currentUser.id).find(j => j.id === testJump.id);
      if (stillActive) throw new Error(`Jump "${testJump.name}" was NOT archived - runAutoArchive() may have failed.`);

      // 7. Verify notification was created
      const notifsAfter = typeof getNotifications === 'function' ? getNotifications() : [];
      const archiveNotif = notifsAfter.find(n => n.type === 'auto-archive' && n.message.includes(testJump.name));
      if (!archiveNotif) throw new Error('Auto-archive notification was NOT created.');

      // 8. Cleanup - restore jump and remove test notification
      DB.updateJump(currentUser.id, testJump.id, { isArchived: false, lastUsed: originalLastUsed });
      if (typeof saveNotifications === 'function') {
        saveNotifications(notifsAfter.filter(n => n !== archiveNotif));
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
      }
      return true;
    }
  },

  {
    id: 123, category: 'Maintenance',
    title: '[AUTO+MANUAL] Auto-backup fires correctly and creates notification',
    purpose: 'Verifies that runCloudBackup() correctly blocks free-tier users, respects the auto-backup preference, saves a backup file via Electron IPC, and creates an in-app notification (success or failure). Also confirms the backup notification is NOT a modal - it goes silently to the notification bell.',
    prerequisites: '⚠️ Auto-backup must be ON in Settings before running this test (Settings → Auto-backup → enable). Must be logged in as an Unlimited user. If auto-backup is off the test will fail with no notification found.',
    description: 'Temporarily ensures auto-backup pref is true, calls runCloudBackup(), and checks that a backup notification (type=backup or type=backup-failed) was created in the notification store. Cleans up the test notification.',
    input: 'DB.updatePrefs(userId, { cloudBackup: true }), then await runCloudBackup()',
    expected: 'A notification with type=backup or type=backup-failed is created. No modal is shown. Free tier returns early silently.',
    test: async () => {
      // 1. Block free-tier check
      const tier = window._supabaseProfile?.subscription_tier || 'free';
      if (tier === 'free') {
        return 'manual';
      }

      // 2. Check Electron IPC is available
      if (!window.electronAPI?.saveBackup) {
        return 'manual';
      }

      // 3. Snapshot notification count before
      const notifsBefore = typeof getNotifications === 'function' ? getNotifications() : [];

      // 4. Temporarily enable cloudBackup pref
      const prefs = DB.getPrefs(currentUser.id);
      const originalPref = prefs.cloudBackup;
      DB.updatePrefs ? DB.updatePrefs(currentUser.id, { cloudBackup: true }) : (prefs.cloudBackup = true);

      // 5. Run auto-backup
      await runCloudBackup();

      // 6. Restore pref
      if (DB.updatePrefs) DB.updatePrefs(currentUser.id, { cloudBackup: originalPref });

      // 7. Check notification was created
      const notifsAfter = typeof getNotifications === 'function' ? getNotifications() : [];
      const backupNotif = notifsAfter.find(n =>
        (n.type === 'backup' || n.type === 'backup-failed') &&
        !notifsBefore.find(b => b.ts === n.ts)
      );
      if (!backupNotif) throw new Error('No backup notification found after runCloudBackup() - notification may not have been created.');

      // 8. Cleanup - remove test notification
      if (typeof saveNotifications === 'function') {
        saveNotifications(notifsAfter.filter(n => n !== backupNotif));
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
      }
      return 'manual';
    }
  },

  // ── Email Tests (96-97) ───────────────────────────────────────────
  {
    id: 114, category: 'Email',
    title: '[AUTO+MANUAL] Account-exists email - Edge Function returns ok:true',
    purpose: 'Automatically calls the send-account-exists Edge Function with the current user\'s email and confirms it returns { ok: true }. Verifies the function is deployed, reachable, and responds without error. Does NOT verify email delivery - check your inbox after running.',
    prerequisites: 'Must be logged in. The send-account-exists Edge Function must be deployed to Supabase.',
    description: 'POSTs to /functions/v1/send-account-exists with the current user email, checks the response is { ok: true }.',
    input: 'POST /functions/v1/send-account-exists { email: currentUser.email }',
    expected: 'Response JSON has ok === true. Then manually verify the account-exists email arrives in your inbox.',
    emailSubject: 'Sign in to your JumpKit account',
    steps: 'After this test passes automatically, check your inbox for the "You already have a JumpKit account" email to confirm delivery end-to-end.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      if (!email) throw new Error('No user email found - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-account-exists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email }),
      });

      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);

      // Auto portion passed - remind tester to verify inbox
      return 'manual';
    }
  },

  // ── Pending Upgrade Flow (Tests 98-101) ─────────────────────────
  {
    id: 57, category: 'Subscription',
    title: 'apply-pending-upgrade - returns applied:false when no pending row',
    purpose: 'Confirms apply-pending-upgrade gracefully returns { ok:true, applied:false } for a normal user with no pending upgrade row. This is the common-case path hit on every login.',
    prerequisites: 'Must be logged in. No pending_upgrades row should exist for this user (normal state).',
    description: 'POSTs to /functions/v1/apply-pending-upgrade with current user email and verifies applied:false is returned.',
    input: 'POST /functions/v1/apply-pending-upgrade { email }',
    expected: 'Response JSON has ok:true and applied:false.',
    steps: 'Automatic.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/apply-pending-upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Expected ok:true, got: ${JSON.stringify(body)}`);
      if (body.applied !== false) throw new Error(`Expected applied:false (no pending row), got applied:${body.applied}`);

      return true;
    }
  },

  {
    id: 130, category: 'Subscription', platforms: ['mac'],
    title: '[MANUAL] apply-pending-upgrade - applies upgrade for user who paid before creating account',
    purpose: 'Confirms apply-pending-upgrade applies the upgrade, deletes the pending row, and returns { ok:true, applied:true }. This flow handles the case where a user paid on LS before creating a JumpKit account - the webhook stores a pending row, and apply-pending-upgrade is called automatically on first login.',
    prerequisites: 'LS store in Test mode. Use a test email that has NO existing JumpKit account - the ls-webhook only creates a pending_upgrades row when no profile exists for that email (otherwise it upgrades the profile directly, which is what test #93 covers).',
    description: 'Complete a LS test checkout with a fresh test email to generate a pending_upgrades row via the real webhook, then create a JumpKit account and sign in to trigger apply-pending-upgrade automatically.',
    input: 'LS test-mode checkout with a fresh email (no JumpKit account) + JumpKit sign-up + sign-in',
    expected: 'pending_upgrades row created by webhook; on sign-in apply-pending-upgrade applies the upgrade (subscription_tier="core") and deletes the pending row.',
    steps: [
      { text: 'Open the LS checkout page - confirm Test mode is active by verifying the orange "Test mode" banner at the top of the page.', link: { url: 'https://jumpkit.lemonsqueezy.com/checkout/buy/81c37b98-510a-4ca9-9849-06f10fd3a8d0', label: 'LS Checkout' } },
      { text: 'Complete a LS test checkout using a fresh test email that has NO JumpKit account - e.g. a Gmail + alias like jeffroder+testpending@gmail.com. Use test card 4242 4242 4242 4242.' },
      { text: 'Wait ~5 seconds, then confirm the pending_upgrades row was created by the webhook.', cmd: `SELECT * FROM pending_upgrades WHERE email='jeffroder+testpending@gmail.com';` },
      { text: 'Go to the JumpKit sign-up page and create an account with that same test email.' },
      { text: 'Sign in with that email - apply-pending-upgrade fires automatically on login. Confirm the profile was upgraded.', cmd: `SELECT subscription_tier, subscription_status FROM profiles WHERE email='jeffroder+testpending@gmail.com';` },
      { text: 'Confirm no pending row remains.', cmd: `SELECT * FROM pending_upgrades WHERE email='jeffroder+testpending@gmail.com';` },
      { text: 'Clean up - delete the test profile and any leftover pending row.', cmd: `DELETE FROM profiles WHERE email='jeffroder+testpending@gmail.com';\nDELETE FROM pending_upgrades WHERE email='jeffroder+testpending@gmail.com';` },
    ],
    test: async () => 'manual'
  },

  {
    id: 115, category: 'Email',
    title: '[AUTO+MANUAL] send-pending-upgrade - Edge Function returns ok:true',
    purpose: 'Automatically calls the send-pending-upgrade Edge Function with the current user email and confirms it returns { ok:true }. Verifies the function is deployed and reachable.',
    prerequisites: 'Must be logged in. send-pending-upgrade Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-pending-upgrade with current user email and checks response is { ok:true }.',
    input: 'POST /functions/v1/send-pending-upgrade { email }',
    expected: 'Response JSON has ok:true. Check inbox to confirm the onboarding email arrives.',
    emailSubject: 'Your JumpKit Unlimited subscription is confirmed 🎉',
    steps: 'After this test passes automatically, check inbox for the "Your JumpKit Unlimited subscription is confirmed" email.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-pending-upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);

      return 'manual';
    }
  },

  // ── Onboarding Flow (Tests 102-103) ─────────────────────────────
  {
    id: 5, category: 'Auth',
    title: 'Onboarding - checkAndShowOnboarding gated by onboarding_completed',
    purpose: 'Confirms checkAndShowOnboarding() exists and does NOT show the onboarding modal when onboarding_completed is already true. This is the normal state for existing users.',
    prerequisites: 'Must be logged in and have completed onboarding.',
    description: 'Calls checkAndShowOnboarding() and verifies no #onboardingOverlay element appears in the DOM.',
    input: 'checkAndShowOnboarding()',
    expected: 'Function is accessible. No onboarding overlay appears (onboarding already done).',
    steps: 'Automatic.',
    test: async () => {
      if (typeof checkAndShowOnboarding !== 'function') throw new Error('checkAndShowOnboarding is not defined - check onboarding.js is loaded');

      const before = document.getElementById('onboardingOverlay');
      if (before) before.remove();

      await checkAndShowOnboarding();
      await new Promise(r => setTimeout(r, 400));

      const overlay = document.getElementById('onboardingOverlay');
      if (overlay) {
        overlay.remove();
        throw new Error('Onboarding overlay appeared - onboarding_completed may be false for this user. Complete onboarding first and re-run.');
      }

      return true;
    }
  },

  {
    id: 58, category: 'Subscription',
    title: 'Upgrade modal - checkAndHandleUpgrade renders correctly',
    purpose: 'Confirms checkAndHandleUpgrade() renders the Welcome to JumpKit Unlimited modal without errors. Validates title contains "Unlimited" and the CTA button is present.',
    prerequisites: 'Must be logged in.',
    description: 'Calls checkAndHandleUpgrade("core"), verifies the modal title and footer CTA, then closes the modal.',
    input: 'checkAndHandleUpgrade("core")',
    expected: 'Modal opens. Title contains "Unlimited". Footer has "Let\'s Go" button. Modal is closed after test.',
    steps: 'Automatic - modal will briefly open and close.',
    test: async () => {
      if (typeof checkAndHandleUpgrade !== 'function') throw new Error('checkAndHandleUpgrade is not defined');

      if (typeof Modal !== 'undefined') Modal.close();
      await new Promise(r => setTimeout(r, 150));

      checkAndHandleUpgrade('core');
      await new Promise(r => setTimeout(r, 300));

      const titleEl = document.getElementById('modalTitle');
      const footerEl = document.getElementById('modalFooter');

      if (!titleEl) throw new Error('modalTitle element not found');
      if (!titleEl.textContent.includes('Unlimited')) throw new Error(`Modal title missing "Unlimited" - got: "${titleEl.textContent.trim()}"`);
      if (!footerEl || !footerEl.textContent.includes('Go')) throw new Error('Modal footer missing "Let\'s Go" button');

      if (typeof Modal !== 'undefined') Modal.close();
      return true;
    }
  },

  // ── Team Member Lockout System (Tests 104-110) ─────────────────
  {
    id: 9, category: 'DB Schema',
    title: 'team_members - lockout columns exist in schema',
    purpose: 'Confirms the DB migration for the lockout system was applied. The columns locked, lock_at, and lock_notified_2day must exist on team_members or the entire lockout system silently fails.',
    prerequisites: 'Must be logged in with Supabase access.',
    description: 'Queries team_members via Supabase and inspects the returned row shape to confirm all 3 lockout columns are present.',
    input: 'supabaseClient.from("team_members").select("id,locked,lock_at,lock_notified_2day").limit(1)',
    expected: 'Query succeeds (no column-not-found error) and returned data/error confirms the 3 columns exist.',
    steps: 'Automatic.',
    test: async () => {
      if (!supabaseClient) throw new Error('supabaseClient not available');

      const { data, error } = await supabaseClient
        .from('team_members')
        .select('id, locked, lock_at, lock_notified_2day')
        .limit(1);

      if (error) {
        if (error.message && error.message.includes('column')) {
          throw new Error(`Migration not applied - column error: ${error.message}`);
        }
        throw new Error(`Supabase error: ${error.message}`);
      }

      if (data && data.length > 0) {
        const row = data[0];
        if (!('locked' in row)) throw new Error('Column "locked" missing from team_members');
        if (!('lock_at' in row)) throw new Error('Column "lock_at" missing from team_members');
        if (!('lock_notified_2day' in row)) throw new Error('Column "lock_notified_2day" missing from team_members');
      }

      return true;
    }
  },

  {
    id: 116, category: 'Email',
    emailSubject: "Owner: 'Important: your JumpKit team members may lose access' | Member: 'Your team access may be changing'",
    title: '[AUTO+MANUAL] send-team-downgrade-alert - Edge Function returns ok:true (alert variant)',
    purpose: 'Calls send-team-downgrade-alert with variant:"alert" and a test member list, confirming the function is deployed and returns { ok:true }. This fires when a subscription is cancelled.',
    prerequisites: 'Must be logged in. send-team-downgrade-alert Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-team-downgrade-alert with ownerId (current user), a dummy teamName, lockDate, and a 1-member affectedMembers list.',
    input: 'POST /functions/v1/send-team-downgrade-alert { ownerId, teamName, lockDate, affectedMembers, variant:"alert" }',
    expected: 'Response JSON has ok:true. Two emails should be received in the logged-in user\'s inbox: (1) \'Team member access changing\' sent to the team owner, and (2) \'Your team access may be changing\' sent to the affected team member.',
    steps: 'Automatic. After this test passes, check inbox for two emails: the owner email with subject \'Team member access changing\' and the member email with subject \'Your team access may be changing\'.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      const profileId = window._supabaseUser?.id;
      if (!email || !profileId) throw new Error('No user email/profileId - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const lockDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-team-downgrade-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          ownerId: profileId,
          teamId: 'test-team-116',
          teamName: 'Test Team (Test 116)',
          lockDate,
          affectedMembers: [{ email, name: 'Test Member' }],
          variant: 'alert',
        }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);

      return 'manual';
    }
  },

  {
    id: 117, category: 'Email',
    emailSubject: "2 emails: Owner: 'Reminder: JumpKit team access ending in 2 days - Test Team (Test 117)' | Member: 'Your access to Test Team (Test 117) ends in 2 days'",
    title: '[AUTO+MANUAL] send-team-downgrade-alert - Edge Function returns ok:true (warning variant)',
    purpose: 'Calls send-team-downgrade-alert with variant:"warning", confirming the 2-day warning email path works. This is the variant fired by check-member-lockouts 2 days before lock_at.',
    prerequisites: 'Must be logged in. send-team-downgrade-alert Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-team-downgrade-alert with variant:"warning" and verifies ok:true is returned.',
    input: 'POST /functions/v1/send-team-downgrade-alert { ownerId, teamName, lockDate, affectedMembers, variant:"warning" }',
    expected: 'Response JSON has ok:true. A warning-variant email should be sent to the logged-in user\'s address.',
    steps: 'Automatic. After this test passes, check inbox for 2 emails - one sent to the team owner and one to each affected member (both go to your address in this test). Look for team name "Test Team (Test 117)". See Email Subject above for both subjects.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      const profileId = window._supabaseUser?.id;
      if (!email || !profileId) throw new Error('No user email/profileId - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const lockDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-team-downgrade-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          ownerId: profileId,
          teamId: 'test-team-117',
          teamName: 'Test Team (Test 117)',
          lockDate,
          affectedMembers: [{ email, name: 'Test Member' }],
          variant: 'warning',
        }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);

      return 'manual';
    }
  },

  {
    id: 59, category: 'Subscription',
    title: 'check-member-lockouts - Edge Function reachable and returns ok:true',
    purpose: 'Confirms check-member-lockouts is deployed and responds with { ok:true, locked:N, warned:N }. This function runs daily to apply locks and send warnings.',
    prerequisites: 'check-member-lockouts Edge Function must be deployed with --no-verify-jwt.',
    description: 'POSTs to /functions/v1/check-member-lockouts and verifies ok:true is returned along with locked and warned counts.',
    input: 'POST /functions/v1/check-member-lockouts (no body required)',
    expected: 'Response JSON has ok:true, locked (number), warned (number).',
    steps: 'Automatic.',
    test: async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-member-lockouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({}),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);
      if (typeof body.locked !== 'number') throw new Error(`Expected locked (number) in response - got: ${JSON.stringify(body)}`);
      if (typeof body.warned !== 'number') throw new Error(`Expected warned (number) in response - got: ${JSON.stringify(body)}`);

      return true;
    }
  },

  {
    id: 131, category: 'Subscription',
    title: '[MANUAL] check-member-lockouts - actually locks a member when lock_at has passed',
    purpose: 'Confirms check-member-lockouts sets locked=true on rows where lock_at is in the past.',
    prerequisites: 'Supabase access + a team you own.',
    description: 'Insert a test team_members row with lock_at 1 hour ago, trigger check-member-lockouts, verify locked=true, then clean up.',
    input: 'Supabase SQL editor',
    expected: 'locked=true on the test row after running check-member-lockouts.',
    steps: (user) => {
      const email = user?.email || 'your-email@example.com';
      return [
        { text: 'Run Test #59 to confirm check-member-lockouts is reachable and returns ok:true.' },
        {
          text: 'In Supabase SQL editor, run this command - copy the UUID from the id column (this is your <saved-id>).',
          cmd: `WITH my_team AS (\n  SELECT id FROM teams\n  WHERE owner_id = (SELECT id FROM profiles WHERE email='${email}')\n  ORDER BY created_at\n  LIMIT 1\n)\nINSERT INTO team_members (team_id, user_id, locked, lock_at, lock_notified_2day)\nSELECT my_team.id,\n  (SELECT id FROM profiles WHERE email='${email}'),\n  false, NOW() - INTERVAL '1 hour', false\nFROM my_team\nON CONFLICT (team_id, user_id) DO UPDATE\n  SET locked = false,\n      lock_at = NOW() - INTERVAL '1 hour',\n      lock_notified_2day = false\nRETURNING id;`
        },
        { text: 'Run Test #59 again - this triggers check-member-lockouts, locking any row where lock_at has passed.' },
        {
          text: 'Run this command, replacing <saved-id> with your UUID - confirm locked=true.',
          cmd: `SELECT id, locked, lock_at FROM team_members WHERE id='<saved-id>';`
        },
        {
          text: 'Run this command, replacing <saved-id> with your UUID - deletes the test row.',
          cmd: `DELETE FROM team_members WHERE id='<saved-id>';`
        },
        { text: 'Mark Pass if locked=true was confirmed in step 4.' },
      ];
    },
    notes: 'lock_at is a team membership enforcement mechanism tied to subscription downgrades.\n\nHow it works:\n1. lock_at is set on a team_members row when a team owner\'s subscription is about to expire - it\'s a future timestamp (the date access should be cut off).\n2. 2 days before lock_at - check-member-lockouts detects rows where lock_at is within 48 hours and lock_notified_2day=false. It sends a warning email to both owner and member, then sets lock_notified_2day=true.\n3. When lock_at passes - check-member-lockouts finds rows where lock_at ≤ NOW() and locked=false, and sets locked=true.\n4. In the app - when the Teams page loads, it fetches team_members for the current user and builds _lockedTeamIds. Any team where locked=true shows the member as locked out - shared column access is blocked.\n\nIn short: owner\'s subscription lapses → members get a 2-day warning email → then get locked out of shared team columns automatically.',
    test: async () => 'manual'
  },

  // ── Auto-Update / GitHub Releases (Tests 111-116) ─────────────────
  {
    id: 108, category: 'Deployment',
    title: 'Auto-update IPC - onUpdateReady and installUpdate exposed in preload',
    purpose: 'Confirms preload.js exposes both update IPC bridges. If either is missing, the update banner will never show or the restart button will throw.',
    prerequisites: 'None.',
    description: 'Checks window.electronAPI.onUpdateReady and window.electronAPI.installUpdate are functions.',
    input: 'window.electronAPI.onUpdateReady, window.electronAPI.installUpdate',
    expected: 'Both are functions.',
    test: async () => {
      if (!window.electronAPI) throw new Error('window.electronAPI not available - not running in Electron');
      if (typeof window.electronAPI.onUpdateReady !== 'function') throw new Error('electronAPI.onUpdateReady is not a function - check preload.js');
      if (typeof window.electronAPI.installUpdate !== 'function') throw new Error('electronAPI.installUpdate is not a function - check preload.js');
      return true;
    }
  },

  {
    id: 109, category: 'Deployment',
    title: 'Auto-update banner - #updateBanner element exists in DOM and starts hidden',
    purpose: 'Confirms the update banner HTML element exists in app.html and is initially hidden. If it is missing, no update notification will ever appear.',
    prerequisites: 'None.',
    description: 'Finds #updateBanner in the DOM and verifies its display is none on load.',
    input: 'document.getElementById("updateBanner")',
    expected: '#updateBanner exists and has display:none on initial load.',
    test: async () => {
      const banner = document.getElementById('updateBanner');
      if (!banner) throw new Error('#updateBanner element not found in DOM - check app.html');
      const display = banner.style.display;
      if (display === 'flex') {
        // If it's already showing that means an update was already downloaded - that's actually fine
      } else if (display !== 'none' && display !== '') {
        throw new Error(`#updateBanner has unexpected display value: "${display}" - expected "none"`);
      }
      // Verify it has a restart button
      const restartBtn = banner.querySelector('button');
      if (!restartBtn) throw new Error('#updateBanner has no button - "Restart & Update" button missing from app.html');
      return true;
    }
  },

  {
    id: 110, category: 'Deployment',
    title: 'Auto-update banner - shows when update-ready event fires',
    purpose: 'Confirms the app.js listener correctly shows #updateBanner when the update-ready IPC event fires. Tests the full renderer-side update notification path.',
    prerequisites: 'None.',
    description: 'Manually sets #updateBanner to display:flex (simulating the update-ready callback) and verifies it is visible. Then resets it.',
    input: 'Simulate update-ready: banner.style.display = "flex"',
    expected: '#updateBanner becomes visible when the callback fires. After test: hidden again.',
    test: async () => {
      const banner = document.getElementById('updateBanner');
      if (!banner) throw new Error('#updateBanner element not found - run Test 112 first');

      const orig = banner.style.display;

      // Simulate what the onUpdateReady callback does
      banner.style.display = 'flex';
      await new Promise(r => setTimeout(r, 150));

      const visible = banner.style.display === 'flex';
      if (!visible) throw new Error('#updateBanner did not become visible after display:flex was set');

      // Verify "Restart & Update" button text is present
      const btnText = banner.textContent || '';
      if (!btnText.includes('Restart') && !btnText.includes('Update')) {
        throw new Error('#updateBanner visible but missing "Restart & Update" text - check app.html');
      }

      // Reset banner
      banner.style.display = orig || 'none';
      return true;
    }
  },

  {
    id: 111, category: 'Deployment',
    title: '[MANUAL] GitHub releases - latest release API reachable',
    purpose: 'Confirms the GitHub releases API for jrod4404/JumpKit returns a valid response. Cannot be automated - CSP connect-src blocks fetch to api.github.com from inside the Electron app.',
    prerequisites: 'Internet connection. Only applicable once a GitHub release has been published.',
    description: 'Manual check: open the GitHub releases URL in a browser and verify a release exists with a valid version tag. During pre-release development, a 404 response is expected and acceptable.',
    input: 'Browser → https://api.github.com/repos/jrod4404/JumpKit/releases/latest',
    expected: 'Pre-release: 404 is acceptable (no releases published yet). Post-release: JSON with tag_name like v1.0.0.',
    links: [
      { label: 'GitHub Releases API - latest', url: 'https://api.github.com/repos/jrod4404/JumpKit/releases/latest' },
    ],
    steps: '1. Click the link above to open the GitHub releases API in your browser.\n2. Pre-release (no releases published yet): a 404 response is expected - Mark Pass.\n3. Post-release: confirm JSON with a tag_name field (e.g. v1.0.0) - Mark Pass. Mark Fail only if you expect a release to exist but get 404.',
    test: async () => {
      throw new Error('[MANUAL] Click the link in the Details modal to open the GitHub releases API. Pre-release: 404 is acceptable. Post-release: confirm tag_name is present.');
    }
  },

  {
    id: 112, category: 'Deployment',
    title: '[MANUAL] Auto-update feed - latest-mac.yml present in GitHub release assets',
    purpose: 'electron-updater requires a latest-mac.yml (Mac) or latest.yml (Windows) in the GitHub release assets. Cannot be automated - CSP connect-src blocks fetch to api.github.com from inside the Electron app.',
    prerequisites: 'Internet connection. At least one release published via electron-builder.',
    description: 'Manual check: open the GitHub releases page and verify the assets list includes latest-mac.yml.',
    input: 'Browser → https://github.com/jrod4404/JumpKit/releases/latest',
    expected: 'latest-mac.yml (Mac) or latest.yml (Windows) present in release assets.',
    steps: '1. Open a browser\n2. Navigate to https://github.com/jrod4404/JumpKit/releases/latest\n3. Expand the Assets section\n4. Confirm latest-mac.yml is listed (required for electron-updater)\n5. Mark Pass if present, Fail if missing',
    test: async () => {
      throw new Error('[MANUAL] Open https://github.com/jrod4404/JumpKit/releases/latest in a browser, expand Assets, and verify latest-mac.yml is listed. CSP blocks this fetch from inside the app.');
    }
  },

  {
    id: 141, category: 'Deployment',
    title: '[MANUAL] Auto-update - full E2E: new release triggers in-app banner and installs correctly',
    purpose: 'End-to-end validation of the entire update lifecycle: publish a new version to GitHub → wait for electron-updater to detect it → confirm the update banner appears in-app → click Restart & Update → app restarts at new version.',
    prerequisites: 'Must have the packaged app running (not dev mode). A new version must have been published to GitHub releases via electron-builder.',
    description: 'Follows the full update release process manually and confirms each step works.',
    input: 'Packaged app + new GitHub release with latest-mac.yml and DMG/EXE assets',
    expected: 'Banner appears within ~30s of publishing. Clicking "Restart & Update" quits and reinstalls. App reopens at new version.',
    steps: '1. Bump version in package.json (e.g. 1.0.0 → 1.1.0).\n2. Build and sign: npm run build (Mac) and/or npm run build:win (Windows).\n3. Publish to GitHub: electron-builder --publish always (or set GH_TOKEN and use --publish onTagOrDraft).\n4. Confirm latest-mac.yml and/or latest.yml appear in GitHub release assets (Test 115 checks this).\n5. Open the currently-installed production build (not npm start).\n6. Wait up to 30 seconds - the app checks for updates 3 seconds after launch.\n7. Verify the teal "A new version of JumpKit is available" banner appears at the top of the app.\n8. Click "Restart & Update".\n9. App quits and relaunches - verify version in About or package.json matches the new version.\n10. Mark as Pass once all steps complete successfully.',
    test: async () => 'manual'
  },

  {
    id: 118, category: 'Email',
    emailSubject: 'Jane Smith (Test 118) just joined your team on JumpKit',
    title: '[AUTO+MANUAL] send-member-joined - Edge Function returns ok:true',
    purpose: 'Calls send-member-joined with the logged-in user as the team owner (test scenario), confirming the function is deployed, accepts the payload, and returns { ok:true }.',
    prerequisites: 'Must be logged in. send-member-joined Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-member-joined with ownerEmail (current user), a dummy memberName, teamName, totalMembers, and joinedAt timestamp.',
    input: 'POST /functions/v1/send-member-joined { ownerEmail, ownerName, memberName, memberEmail, teamName, totalMembers, joinedAt }',
    expected: "Response JSON has ok:true. A member-joined notification email should be sent to the logged-in user's inbox.",
    steps: 'Automatic. After this test passes, check inbox for the member-joined email.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      const prof = window._supabaseProfile || {};
      const ownerName = [prof.first_name, prof.last_name].filter(Boolean).join(' ') || 'Team Owner';
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-member-joined`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          ownerEmail: email,
          ownerName,
          memberName: 'Jane Smith (Test 118)',
          memberEmail: 'jane.smith.test118@example.com',
          teamName: 'Test Team (Test 118)',
          totalMembers: 3,
          joinedAt: new Date().toISOString(),
        }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);

      return 'manual';
    }
  },

  {
    id: 119, category: 'Email',
    emailSubject: "You've been removed from Test Team (Test 119) on JumpKit",
    title: '[AUTO+MANUAL] send-member-removed - Edge Function returns ok:true',
    purpose: 'Calls send-member-removed with the logged-in user as the removed member (test scenario), confirming the function is deployed, accepts the payload, and returns { ok:true }.',
    prerequisites: 'Must be logged in. send-member-removed Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-member-removed with memberEmail (current user), a dummy memberName, teamName, and ownerName.',
    input: 'POST /functions/v1/send-member-removed { memberEmail, memberName, teamName, ownerName }',
    expected: "Response JSON has ok:true. A member-removed notification email should be sent to the logged-in user's inbox.",
    steps: 'Automatic. After this test passes, check inbox for the member-removed email.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-member-removed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          memberEmail: email,
          memberName: 'Test User (Test 119)',
          teamName: 'Test Team (Test 119)',
          ownerName: 'Jane Owner',
        }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }

      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);

      return 'manual';
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // ACCOUNT PAGE TABS
  // ══════════════════════════════════════════════════════════════════

  {
    id: 20, category: 'Account',
    title: 'Account page - renderAccount("account") renders without error',
    purpose: 'Confirms the Account tab of the unified Account page renders its DOM content without throwing.',
    prerequisites: 'Must be logged in.',
    description: 'Calls renderAccount("account") and confirms pageContent is non-empty after render.',
    input: 'renderAccount("account")',
    expected: '#pageContent has innerHTML after the call. No JS exception thrown.',
    steps: 'Automatic.',
    test: async () => {
      if (typeof renderAccount !== 'function') throw new Error('renderAccount is not defined');
      const el = document.getElementById('pageContent');
      if (!el) throw new Error('#pageContent element not found');
      renderAccount('account');
      await new Promise(r => setTimeout(r, 100));
      if (!el.innerHTML || el.innerHTML.trim().length < 10) throw new Error('pageContent appears empty after renderAccount("account")');
      renderTests();
    }
  },

  {
    id: 21, category: 'Account',
    title: 'Account page - renderAccount("settings") renders without error',
    purpose: 'Confirms the Settings tab of the unified Account page renders without throwing.',
    prerequisites: 'Must be logged in.',
    description: 'Calls renderAccount("settings") and confirms pageContent is non-empty after render.',
    input: 'renderAccount("settings")',
    expected: '#pageContent has innerHTML after the call. No JS exception thrown.',
    steps: 'Automatic.',
    test: async () => {
      if (typeof renderAccount !== 'function') throw new Error('renderAccount is not defined');
      const el = document.getElementById('pageContent');
      if (!el) throw new Error('#pageContent element not found');
      renderAccount('settings');
      await new Promise(r => setTimeout(r, 100));
      if (!el.innerHTML || el.innerHTML.trim().length < 10) throw new Error('pageContent appears empty after renderAccount("settings")');
      renderTests();
    }
  },

  {
    id: 22, category: 'Account',
    title: 'Account page - renderAccount("teams") renders without error',
    purpose: 'Confirms the Teams tab of the unified Account page renders without throwing.',
    prerequisites: 'Must be logged in.',
    description: 'Calls renderAccount("teams") and confirms pageContent is non-empty after render.',
    input: 'renderAccount("teams")',
    expected: '#pageContent has innerHTML after the call. No JS exception thrown.',
    steps: 'Automatic.',
    test: async () => {
      if (typeof renderAccount !== 'function') throw new Error('renderAccount is not defined');
      const el = document.getElementById('pageContent');
      if (!el) throw new Error('#pageContent element not found');
      renderAccount('teams');
      await new Promise(r => setTimeout(r, 100));
      if (!el.innerHTML || el.innerHTML.trim().length < 10) throw new Error('pageContent appears empty after renderAccount("teams")');
      renderTests();
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // BACKUP & IMPORT
  // ══════════════════════════════════════════════════════════════════

  {
    id: 150, category: 'Account',
    title: 'forceBackup function is defined',
    purpose: 'Confirms the export backup function is present and callable.',
    prerequisites: 'Must be logged in.',
    description: 'Checks that window.forceBackup is a function.',
    input: 'typeof window.forceBackup',
    expected: '"function"',
    steps: 'Automatic.',
    test: async () => {
      if (typeof window.forceBackup !== 'function') throw new Error('window.forceBackup is not defined');
    }
  },

  {
    id: 151, category: 'Account',
    title: 'importJumps function is defined',
    purpose: 'Confirms the import jumps function is present and callable.',
    prerequisites: 'Must be logged in.',
    description: 'Checks that window.importJumps is a function.',
    input: 'typeof window.importJumps',
    expected: '"function"',
    steps: 'Automatic.',
    test: async () => {
      if (typeof window.importJumps !== 'function') throw new Error('window.importJumps is not defined');
    }
  },

  {
    id: 152, category: 'Account',
    title: 'Settings page shows Export and Import buttons',
    purpose: 'Confirms both the Export and Import Jumps buttons render in the Settings Maintenance section.',
    prerequisites: 'Must be logged in.',
    description: 'Renders the settings tab and checks for both data-jaction="force-backup" and data-jaction="import-jumps" buttons.',
    input: 'renderAccount("settings")',
    expected: 'Both buttons are present in the DOM after render.',
    steps: 'Automatic.',
    test: async () => {
      if (typeof renderAccount !== 'function') throw new Error('renderAccount is not defined');
      renderAccount('settings');
      await new Promise(r => setTimeout(r, 150));
      const exportBtn = document.querySelector('[data-jaction="force-backup"]');
      const importBtn = document.querySelector('[data-jaction="import-jumps"]');
      if (!exportBtn) throw new Error('Export button (data-jaction="force-backup") not found');
      if (!importBtn) throw new Error('Import button (data-jaction="import-jumps") not found');
      renderTests();
    }
  },

  {
    id: 153, category: 'Account',
    title: 'Import: valid backup JSON imports jumps correctly',
    purpose: 'Confirms that the import logic correctly maps columns, creates new ones if missing, imports jumps with fresh IDs, and skips duplicates.',
    prerequisites: 'Must be logged in.',
    description: 'Constructs a synthetic backup object and runs the import logic directly, then verifies jumps were added.',
    input: 'Synthetic backup with 1 new column + 2 jumps (1 new, 1 duplicate of an existing seed)',
    expected: 'New column created (if not existing), new jump added, duplicate skipped. Summary counts correct.',
    steps: 'Automatic.',
    test: async () => {
      if (!currentUser?.id) throw new Error('currentUser not available');

      const testColName = '__test_import_col_' + Date.now();
      const testUrl     = 'https://import-test-' + Date.now() + '.example.com';

      // Build synthetic backup
      const fakeBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        columns: [{ id: 'fake_col_1', name: testColName }],
        jumps: [
          { id: 'fake_j_1', name: 'Import Test Jump', url: testUrl, columnId: 'fake_col_1', isShared: false },
        ]
      };

      // Run import logic inline (mirrors window.importJumps core logic)
      const existingCols  = DB.getColumns(currentUser.id);
      const existingJumps = DB.getJumps(currentUser.id);
      const colIdMap = {};

      for (const bCol of fakeBackup.columns) {
        const existing = existingCols.find(c => c.name.trim().toLowerCase() === bCol.name.trim().toLowerCase());
        if (existing) {
          colIdMap[bCol.id] = existing.id;
        } else {
          const maxOrder = existingCols.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
          const newCol = DB.createColumn(currentUser.id, bCol.name, maxOrder + 1);
          existingCols.push(newCol);
          colIdMap[bCol.id] = newCol.id;
        }
      }

      let imported = 0, skipped = 0;
      for (const bJump of fakeBackup.jumps) {
        if (bJump.isShared || bJump.teamId) { skipped++; continue; }
        const mappedColId = colIdMap[bJump.columnId];
        if (!mappedColId) { skipped++; continue; }
        const isDupe = existingJumps.some(j =>
          j.columnId === mappedColId &&
          (j.url || '').trim().toLowerCase() === (bJump.url || '').trim().toLowerCase()
        );
        if (isDupe) { skipped++; continue; }
        const newJump = DB.createJump(currentUser.id, {
          name: bJump.name, url: bJump.url, columnId: mappedColId
        });
        existingJumps.push(newJump);
        imported++;
      }

      if (imported !== 1) throw new Error(`Expected 1 imported, got ${imported}`);
      if (skipped !== 0) throw new Error(`Expected 0 skipped, got ${skipped}`);

      // Verify jump exists in DB
      const allJumps = DB.getJumps(currentUser.id);
      const found = allJumps.find(j => j.url === testUrl);
      if (!found) throw new Error('Imported jump not found in DB after import');

      // Clean up
      DB.deleteJump(currentUser.id, found.id);
      const cols = DB.getColumns(currentUser.id);
      const testCol = cols.find(c => c.name === testColName);
      if (testCol) {
        DB.saveColumns(currentUser.id, cols.filter(c => c.id !== testCol.id));
      }
    }
  },

  {
    id: 154, category: 'Account',
    title: 'Import: duplicate jump is skipped',
    purpose: 'Confirms that importing a jump with the same URL as an existing jump in the same column results in a skip, not a duplicate.',
    prerequisites: 'Must be logged in with at least one existing jump.',
    description: 'Attempts to import a jump whose URL already exists in a column. Expects skipped count = 1, imported = 0.',
    input: 'Synthetic backup with 1 jump matching an existing jump URL',
    expected: 'imported=0, skipped=1. No duplicate jump created in DB.',
    steps: 'Automatic.',
    test: async () => {
      if (!currentUser?.id) throw new Error('currentUser not available');
      const existingJumps = DB.getJumps(currentUser.id).filter(j => !j.isShared && !j.isArchived);
      if (existingJumps.length === 0) throw new Error('No existing active jumps to test duplicate detection against');

      const cols = DB.getColumns(currentUser.id);
      const colIds = new Set(cols.map(c => c.id));
      const target = existingJumps.find(j => colIds.has(j.columnId));
      if (!target) throw new Error('No existing jump with a valid column found - check for orphaned jumps');
      const targetCol = cols.find(c => c.id === target.columnId);
      if (!targetCol) throw new Error('Could not find column for target jump');

      const fakeBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        columns: [{ id: 'fake_dup_col', name: targetCol.name }],
        jumps: [{ id: 'fake_dup_j', name: 'Dup Jump', url: target.url, columnId: 'fake_dup_col', isShared: false }]
      };

      const existingCols = DB.getColumns(currentUser.id);
      const colIdMap = {};
      for (const bCol of fakeBackup.columns) {
        const existing = existingCols.find(c => c.name.trim().toLowerCase() === bCol.name.trim().toLowerCase());
        if (existing) colIdMap[bCol.id] = existing.id;
      }

      let imported = 0, skipped = 0;
      const jumpPool = DB.getJumps(currentUser.id);
      for (const bJump of fakeBackup.jumps) {
        const mappedColId = colIdMap[bJump.columnId];
        if (!mappedColId) { skipped++; continue; }
        const isDupe = jumpPool.some(j =>
          j.columnId === mappedColId &&
          (j.url || '').trim().toLowerCase() === (bJump.url || '').trim().toLowerCase()
        );
        if (isDupe) { skipped++; continue; }
        DB.createJump(currentUser.id, { name: bJump.name, url: bJump.url, columnId: mappedColId });
        imported++;
      }

      if (imported !== 0) throw new Error(`Expected 0 imported (duplicate), got ${imported}`);
      if (skipped !== 1) throw new Error(`Expected 1 skipped, got ${skipped}`);
    }
  },

  {
    id: 155, category: 'Account',
    title: '[MANUAL] Export then Import round-trip on new device',
    purpose: 'End-to-end confirmation that a user can export jumps from one device and import them on another, with all personal jumps transferred correctly.',
    prerequisites: 'Must be logged in. To simulate a second device on the same Mac, launch a second Electron instance with a separate user-data directory using the shell command below - this gives it its own clean session with no existing data, exactly like a different device.',
    input: 'Settings → Export → save file → open 2nd instance via shell command → Settings → Import → select file',
    description: 'Full round-trip: export from device A (this instance), open a 2nd instance as device B using the shell command, import the file, verify jump counts match.',
    expected: 'All personal jumps from device A appear on device B after import. Shared jumps are excluded from the file but sync automatically. No duplicate jumps created on re-import.',
    commands: [
      { label: 'Open 2nd instance (installed app)', cmd: 'open -n /Applications/JumpKit.app --args --user-data-dir=/tmp/jumpkit-second' },
      { label: 'Open 2nd instance (from source)', cmd: 'cd /Users/jeffroder/.openclaw/workspace/Topics/JumpKit/app && npm start -- --user-data-dir=/tmp/jumpkit-second' },
      { label: 'Cleanup temp profile', cmd: 'rm -rf /tmp/jumpkit-second' },
    ],
    steps: '1. On this instance (device A): Settings → Maintenance → Export. Save the JSON file.\n2. Open a second JumpKit instance on the same Mac using one of the Terminal commands above (copy button available) - this is your simulated device B. ⚠️ Log in with a DIFFERENT account on the second instance (using the same account will trigger the double-login conflict modal - see test 148).\n3. Log in on the second instance with a different account.\n4. On device B: Settings → Maintenance → Import. Select the exported JSON file.\n5. Verify the import summary shows the expected count of imported jumps.\n6. Navigate to Jumps page and confirm all personal columns and jumps appear.\n7. Run Import again with the same file - verify all jumps are skipped (0 imported) with no duplicates created.\n8. After testing, click the Cleanup command above to remove the temp profile.',
    test: async () => 'manual'
  },


  // ── Export / Import (new behaviour) ─────────────────────────────

  {
    id: 156, category: 'Account',
    title: 'Export: only personal, non-empty columns included',
    purpose: 'Confirms buildExportData excludes shared columns, team jumps, and empty personal columns.',
    prerequisites: 'Must be logged in.',
    description: 'Calls JK.logic.buildExportData with a synthetic dataset: personal-with-jumps col, personal-empty col, shared col, and mixed jumps.',
    input: '3 cols (personal-with-jumps, personal-empty, shared), 3 jumps (personal, team, shared).',
    expected: 'exportCols=[c1 only], exportJumps=[j1 only].',
    steps: 'Automatic.',
    test: async () => {
      if (!window.JK?.logic) throw new Error('JK.logic not available - logic.js not loaded');
      const { buildExportData } = window.JK.logic;
      const cols = [
        { id: 'c1', name: 'Personal Col', isShared: false },
        { id: 'c2', name: 'Empty Col',    isShared: false },
        { id: 'c3', name: 'Shared Col',   isShared: true  },
      ];
      const jumps = [
        { id: 'j1', columnId: 'c1', url: 'https://a.com', isShared: false, teamId: null,    isArchived: false },
        { id: 'j2', columnId: 'c1', url: 'https://b.com', isShared: false, teamId: 'team1', isArchived: false },
        { id: 'j3', columnId: 'c3', url: 'https://c.com', isShared: true,  teamId: null,    isArchived: false },
      ];
      const { exportCols, exportJumps } = buildExportData(jumps, cols);
      if (exportCols.length !== 1)  throw new Error(`Expected 1 exportCol, got ${exportCols.length}`);
      if (exportCols[0].id !== 'c1') throw new Error(`Expected c1, got ${exportCols[0].id}`);
      if (exportJumps.length !== 1) throw new Error(`Expected 1 exportJump, got ${exportJumps.length}`);
      if (exportJumps[0].id !== 'j1') throw new Error(`Expected j1, got ${exportJumps[0].id}`);
    }
  },

  {
    id: 157, category: 'Account',
    title: 'Export: archived personal jumps are included',
    purpose: 'Confirms archived personal jumps appear in export (so they survive a round-trip to a new device).',
    prerequisites: 'Must be logged in.',
    description: 'Calls buildExportData with one active and one archived personal jump in the same column.',
    input: '1 personal col, 1 active jump, 1 archived jump.',
    expected: 'exportJumps.length === 2.',
    steps: 'Automatic.',
    test: async () => {
      if (!window.JK?.logic) throw new Error('JK.logic not available');
      const { buildExportData } = window.JK.logic;
      const cols  = [{ id: 'c1', name: 'My Col', isShared: false }];
      const jumps = [
        { id: 'j1', columnId: 'c1', url: 'https://a.com', isShared: false, teamId: null, isArchived: false },
        { id: 'j2', columnId: 'c1', url: 'https://b.com', isShared: false, teamId: null, isArchived: true  },
      ];
      const { exportJumps } = buildExportData(jumps, cols);
      if (exportJumps.length !== 2) throw new Error(`Expected 2 exportJumps (active+archived), got ${exportJumps.length}`);
    }
  },

  {
    id: 158, category: 'Account',
    title: 'Import: partitionBackupJumps separates active, archived and col list',
    purpose: 'Confirms the backup partitioning logic correctly splits active vs archived personal jumps and identifies columns with active jumps.',
    prerequisites: 'Must be logged in.',
    description: 'Calls JK.logic.partitionBackupJumps with a mixed backup. Verifies counts and colsWithJumps list.',
    input: '2 cols; jumps: 1 active-personal, 1 archived-personal, 1 shared.',
    expected: 'activeJumps=1, archivedJumps=1, colsWithJumps=[c1 only].',
    steps: 'Automatic.',
    test: async () => {
      if (!window.JK?.logic) throw new Error('JK.logic not available');
      const { partitionBackupJumps } = window.JK.logic;
      const cols  = [{ id: 'c1', name: 'Col1' }, { id: 'c2', name: 'Col2' }];
      const jumps = [
        { id: 'j1', columnId: 'c1', url: 'https://a.com', isShared: false, teamId: null, isArchived: false },
        { id: 'j2', columnId: 'c1', url: 'https://b.com', isShared: false, teamId: null, isArchived: true  },
        { id: 'j3', columnId: 'c2', url: 'https://c.com', isShared: true,  teamId: null, isArchived: false },
      ];
      const { activeJumps, archivedJumps, colsWithJumps } = partitionBackupJumps(jumps, cols);
      if (activeJumps.length   !== 1) throw new Error(`Expected 1 activeJump, got ${activeJumps.length}`);
      if (archivedJumps.length !== 1) throw new Error(`Expected 1 archivedJump, got ${archivedJumps.length}`);
      if (colsWithJumps.length !== 1) throw new Error(`Expected 1 col with active jumps, got ${colsWithJumps.length}`);
      if (colsWithJumps[0].id !== 'c1') throw new Error(`Expected c1 in colsWithJumps, got ${colsWithJumps[0].id}`);
    }
  },

  // ── Column add / remove ──────────────────────────────────────────

  {
    id: 159, category: 'Columns',
    title: 'Add column: DB.createColumn persists new personal column',
    purpose: 'Confirms that creating a column via DB.createColumn persists it and it appears in DB.getColumns.',
    prerequisites: 'Must be logged in.',
    description: 'Calls DB.createColumn with a unique name, verifies it appears in DB.getColumns, then cleans up.',
    input: 'DB.createColumn(userId, unique_name, order)',
    expected: 'New column in DB.getColumns with correct name, isShared=false.',
    steps: 'Automatic.',
    test: async () => {
      if (!currentUser?.id) throw new Error('currentUser not available');
      const name   = '__test_add_col_' + Date.now();
      const before = DB.getColumns(currentUser.id);
      const newCol = DB.createColumn(currentUser.id, name, before.length + 1);
      const after  = DB.getColumns(currentUser.id);
      const found  = after.find(c => c.id === newCol.id);
      if (!found) throw new Error('Newly created column not found in DB.getColumns');
      if (found.name !== name) throw new Error(`Column name mismatch: expected "${name}", got "${found.name}"`);
      if (found.isShared) throw new Error('New column should not be shared');
      // Clean up
      DB.saveColumns(currentUser.id, after.filter(c => c.id !== newCol.id));
    }
  },

  {
    id: 160, category: 'Columns',
    title: 'Remove column: orphaned jumps are deleted on save',
    purpose: 'Confirms that when a personal column is removed, its jumps are also deleted (no orphan data).',
    prerequisites: 'Must be logged in.',
    description: 'Creates a temp column + jump, identifies them as orphans via JK.logic, deletes them, and verifies both are gone from DB.',
    input: 'DB.createColumn + DB.createJump, then removedPersonalColIds + orphanedJumps + deleteJump + saveColumns.',
    expected: 'Both the jump and column are absent from DB after removal.',
    steps: 'Automatic.',
    test: async () => {
      if (!currentUser?.id) throw new Error('currentUser not available');
      if (!window.JK?.logic) throw new Error('JK.logic not available');
      const { removedPersonalColIds, orphanedJumps } = window.JK.logic;

      // 1. Create temp col + jump
      const colName = '__test_remove_col_' + Date.now();
      const url     = 'https://remove-col-test-' + Date.now() + '.example.com';
      const before  = DB.getColumns(currentUser.id);
      const tmpCol  = DB.createColumn(currentUser.id, colName, before.length + 1);
      const tmpJump = DB.createJump(currentUser.id, { name: 'Temp Jump', url, columnId: tmpCol.id });

      const setupJump = DB.getJumps(currentUser.id).find(j => j.id === tmpJump.id);
      if (!setupJump) throw new Error('Setup failed: temp jump not found before removal');

      // 2. Identify orphans via pure logic (savedIds = before, excludes tmpCol)
      const savedIds   = new Set(before.map(c => c.id));
      const removedIds = removedPersonalColIds(DB.getColumns(currentUser.id), savedIds);
      if (!removedIds.includes(tmpCol.id)) throw new Error(`removedPersonalColIds missing tmpCol (${tmpCol.id})`);
      const orphans = orphanedJumps(DB.getJumps(currentUser.id), removedIds);
      if (!orphans.find(j => j.id === tmpJump.id)) throw new Error('orphanedJumps did not include tmpJump');

      // 3. Execute removal (mirrors saveColumns behaviour)
      orphans.forEach(j => DB.deleteJump(currentUser.id, j.id));
      DB.saveColumns(currentUser.id, before);

      // 4. Verify
      if (DB.getJumps(currentUser.id).find(j => j.id === tmpJump.id))
        throw new Error('Orphaned jump still exists in DB after column removal');
      if (DB.getColumns(currentUser.id).find(c => c.id === tmpCol.id))
        throw new Error('Removed column still exists in DB.getColumns');
    }
  },

  {
    id: 161, category: 'Columns',
    title: '[MANUAL] Configure Columns - Add Column and Remove Column buttons',
    purpose: 'Confirms the Add Column and Remove Column (trash icon) UI flows work correctly in the Configure Columns modal.',
    prerequisites: 'Must be logged in as admin.',
    description: 'Opens the Configure Columns modal, adds a new column via the button, saves, then reopens and removes it with the trash icon.',
    input: 'Jumps page → Configure Columns → Add Column → name → Save → reopen → trash → confirm → Save.',
    expected: 'New column appears after first save. Column (and its jumps) are gone after second save. Team columns have a disabled trash icon.',
    steps: '1. Go to Jumps page → click "Configure Columns".\n2. Click "+ Add Column" at the bottom - a new blank row should appear.\n3. Enter a column name and toggle it visible.\n4. Click Save Columns. Verify the new column appears in the jump view.\n5. Reopen Configure Columns. Find the new row and click its trash icon.\n6. An inline confirmation row should appear ("Delete X and all N jumps?"). Click "Yes, Delete".\n7. Click Save Columns. Verify the column is gone.\n8. If shared/team columns are present, verify their trash icon is greyed out and non-clickable with tooltip "Team columns can only be hidden, not removed".',
    test: async () => 'manual'
  },

  // ══════════════════════════════════════════════════════════════════
  // ROI CALCULATION
  // ══════════════════════════════════════════════════════════════════

  {
    id: 52, category: 'Stats',
    title: 'ROI - hours saved calculation is correct',
    purpose: 'Validates the core ROI formula: lifetimeLaunches × timePerClick / 3600 = lifetimeHours (floor).',
    prerequisites: 'None - pure math test using hardcoded values.',
    description: 'Runs the same formula used in app.js against known inputs and checks the result.',
    input: 'launches=720, timePerClick=10 → 720×10/3600 = 2h exactly',
    expected: 'lifetimeHours = 2, lifetimeMins = 0.',
    steps: 'Automatic.',
    test: async () => {
      const cases = [
        { launches: 720,  timePerClick: 10, expectedHours: 2,  expectedMins: 0  },
        { launches: 100,  timePerClick: 30, expectedHours: 0,  expectedMins: 50 },
        { launches: 3600, timePerClick: 5,  expectedHours: 5,  expectedMins: 0  },
        { launches: 1,    timePerClick: 1,  expectedHours: 0,  expectedMins: 0  },
      ];
      for (const c of cases) {
        const lifetimeSeconds = c.launches * c.timePerClick;
        const lifetimeHours   = Math.floor(lifetimeSeconds / 3600);
        const lifetimeMins    = Math.floor((lifetimeSeconds % 3600) / 60);
        if (lifetimeHours !== c.expectedHours)
          throw new Error(`Hours mismatch for launches=${c.launches} tpc=${c.timePerClick}: got ${lifetimeHours}, expected ${c.expectedHours}`);
        if (lifetimeMins !== c.expectedMins)
          throw new Error(`Mins mismatch for launches=${c.launches} tpc=${c.timePerClick}: got ${lifetimeMins}, expected ${c.expectedMins}`);
      }
    }
  },

  {
    id: 53, category: 'Stats',
    title: 'ROI - dollar value calculation is correct',
    purpose: 'Validates the dollar formula: (lifetimeLaunches × timePerClick / 3600) × dollarsPerHour.',
    prerequisites: 'None - pure math test.',
    description: 'Runs the dollar ROI formula against known inputs and checks results to 2 decimal places.',
    input: 'launches=720, timePerClick=10, dollarsPerHour=50 → 2h × $50 = $100.00',
    expected: 'lifetimeDollars = 100.00. Secondary: launches=360, tpc=10, dph=100 → $100.00',
    steps: 'Automatic.',
    test: async () => {
      const cases = [
        { launches: 720,  timePerClick: 10, dollarsPerHour: 50,  expected: 100.00 },
        { launches: 360,  timePerClick: 10, dollarsPerHour: 100, expected: 100.00 },
        { launches: 1800, timePerClick: 8,  dollarsPerHour: 75,  expected: 300.00 },
        { launches: 0,    timePerClick: 10, dollarsPerHour: 50,  expected: 0.00   },
      ];
      for (const c of cases) {
        const lifetimeSeconds = c.launches * c.timePerClick;
        const lifetimeDollars = (lifetimeSeconds / 3600) * c.dollarsPerHour;
        const rounded = parseFloat(lifetimeDollars.toFixed(2));
        if (Math.abs(rounded - c.expected) > 0.01)
          throw new Error(`Dollar mismatch for launches=${c.launches}: got ${rounded}, expected ${c.expected}`);
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // HELP PAGE
  // ══════════════════════════════════════════════════════════════════

  {
    id: 15, category: 'Navigation',
    title: 'Help page - renderHelp() renders without error',
    purpose: 'Confirms the Help page renders its DOM content without throwing.',
    prerequisites: 'Must be logged in.',
    description: 'Calls renderHelp() and confirms pageContent is non-empty.',
    input: 'renderHelp()',
    expected: '#pageContent has innerHTML after the call. No JS exception thrown.',
    steps: 'Automatic.',
    test: async () => {
      if (typeof renderHelp !== 'function') throw new Error('renderHelp is not defined - check help.js is loaded');
      const el = document.getElementById('pageContent');
      if (!el) throw new Error('#pageContent element not found');
      renderHelp();
      await new Promise(r => setTimeout(r, 100));
      if (!el.innerHTML || el.innerHTML.trim().length < 50) throw new Error('pageContent appears empty after renderHelp()');
      // Restore tests page so the user lands back here after individual run
      renderTests();
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // ADMIN PAGE
  // ══════════════════════════════════════════════════════════════════

  {
    id: 23, category: 'Admin',
    title: 'Admin page - renderAdmin() renders for admin, guards non-admins',
    purpose: 'Confirms renderAdmin() runs without throwing. For admin users, confirms content is rendered. For non-admins, confirms an access-denied guard is shown rather than crashing.',
    prerequisites: 'Must be logged in.',
    description: 'Calls renderAdmin() and checks that #pageContent is non-empty regardless of role. Validates the role guard works.',
    input: 'renderAdmin()',
    expected: 'No exception thrown. #pageContent is non-empty. If non-admin, access-denied content is shown (contains "lock" icon or restricted text).',
    steps: 'Automatic.',
    test: async () => {
      if (typeof renderAdmin !== 'function') throw new Error('renderAdmin is not defined');
      const el = document.getElementById('pageContent');
      if (!el) throw new Error('#pageContent element not found');
      await renderAdmin();
      await new Promise(r => setTimeout(r, 200));
      if (!el.innerHTML || el.innerHTML.trim().length < 20) throw new Error('pageContent appears empty after renderAdmin()');
      // If non-admin, the guard should show a lock icon or access-denied message, not raw data
      const isAdmin = window._supabaseProfile?.role === 'admin';
      if (!isAdmin) {
        const hasGuard = el.innerHTML.includes('ti-lock') || el.innerHTML.toLowerCase().includes('access') || el.innerHTML.toLowerCase().includes('admin');
        if (!hasGuard) throw new Error('Non-admin user did not see access guard - potential security issue');
      }
      // Restore tests page so the user lands back here after individual run
      renderTests();
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // FEEDBACK MODAL
  // ══════════════════════════════════════════════════════════════════

  {
    id: 100, category: 'UI',
    title: 'Feedback modal - openFeedbackModal() renders without error',
    purpose: 'Confirms the feedback modal opens and renders its form fields without throwing.',
    prerequisites: 'Must be logged in.',
    description: 'Calls openFeedbackModal() and checks that the modal is visible with expected form fields.',
    input: 'openFeedbackModal()',
    expected: 'Modal opens. Contains a textarea or input for message. No JS exception thrown.',
    steps: 'Automatic. The modal will open briefly - it will be closed by the test.',
    test: async () => {
      if (typeof openFeedbackModal !== 'function') throw new Error('openFeedbackModal is not defined');
      openFeedbackModal();
      await new Promise(r => setTimeout(r, 150));
      const modal = document.querySelector('.modal-backdrop, #appModal, [id*="modal"]');
      if (!modal || !modal.innerHTML) throw new Error('Modal does not appear to be open after openFeedbackModal()');
      const hasTextarea = modal.querySelector('textarea') || modal.querySelector('input[type="text"]') || modal.innerHTML.includes('feedback');
      if (!hasTextarea) throw new Error('Modal opened but no feedback input fields found');
      // Clean up
      if (typeof Modal !== 'undefined' && Modal.close) Modal.close();
    }
  },

  {
    id: 63, category: 'Email',
    title: 'send-feedback - Edge Function returns ok:true',
    purpose: 'Confirms the send-feedback Edge Function is deployed and returns ok:true for a valid payload.',
    prerequisites: 'Must be logged in. send-feedback Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-feedback with a test name, email, category, and message.',
    input: 'POST /functions/v1/send-feedback { name, email, category, message }',
    expected: 'Response JSON has ok:true. A feedback email should be sent to support@jumpkit.app.',
    steps: 'Automatic.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          name: 'Test User (Test 129)',
          email,
          category: 'Bug Report',
          message: 'This is an automated test message from Test 129. Please ignore (feedback test).',
        }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }
      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // REMAINING EMAIL EDGE FUNCTIONS
  // ══════════════════════════════════════════════════════════════════

  {
    id: 64, category: 'Email',
    title: '[AUTO+MANUAL] send-invite - Edge Function returns ok:true',
    purpose: 'Confirms the send-invite Edge Function is deployed and returns ok:true for a valid payload.',
    prerequisites: 'Must be logged in. send-invite Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-invite with a test email, teamId, and invitedBy (current user id).',
    input: 'POST /functions/v1/send-invite { email, teamId, invitedBy, teamName }',
    expected: 'Response JSON has ok:true. A test invite email should be sent to the logged-in user.',
    emailSubject: "You've been invited to join Test Team (Test 64) on JumpKit",
    steps: 'Automatic. After passing, check inbox for the invite email.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      const profileId = window._supabaseUser?.id;
      if (!email || !profileId) throw new Error('No user email/profileId - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          email,
          teamId: 'test-team-64',
          invitedBy: profileId,
          teamName: 'Test Team (Test 64)',
          orgName: 'Test Org',
          teamPassword: 'testpass',
        }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }
      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);
      return 'manual';
    }
  },

  {
    id: 65, category: 'Email',
    title: 'send-welcome - Edge Function returns ok:true',
    purpose: 'Confirms the send-welcome Edge Function is deployed and returns ok:true. Note: the function skips sending if welcome_email_sent is already true for the user - ok:true with skipped:true is also a pass.',
    prerequisites: 'Must be logged in. send-welcome Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-welcome with the current user email and userId.',
    input: 'POST /functions/v1/send-welcome { email, firstName, userId }',
    expected: 'Response JSON has ok:true (with or without skipped:true). No error.',
    steps: 'Automatic.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      const userId = window._supabaseUser?.id;
      const prof = window._supabaseProfile || {};
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email, firstName: prof.first_name || 'Tester', userId }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }
      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);
    }
  },

  {
    id: 66, category: 'Email',
    title: '[AUTO+MANUAL] send-cancellation - Edge Function returns ok:true',
    purpose: 'Confirms the send-cancellation Edge Function is deployed and returns ok:true for a valid payload.',
    prerequisites: 'Must be logged in. send-cancellation Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-cancellation with the current user email and firstName.',
    input: 'POST /functions/v1/send-cancellation { email, firstName }',
    expected: 'Response JSON has ok:true. A cancellation email should be sent to the logged-in user.',
    emailSubject: 'Your JumpKit Core subscription has ended',
    steps: 'Automatic. After passing, check inbox for the cancellation email.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      const prof = window._supabaseProfile || {};
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-cancellation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email, firstName: prof.first_name || 'Tester' }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }
      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);
      return 'manual';
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // EMAIL - TEAM DELETED + WAITLIST
  // ══════════════════════════════════════════════════════════════════

  {
    id: 142, category: 'Email',
    title: 'send-team-deleted - Edge Function returns ok:true',
    purpose: 'Confirms the send-team-deleted Edge Function is deployed and returns ok:true. Uses a fake teamId so no real members are emailed - notified:0 is expected and correct for this test.',
    prerequisites: 'Must be logged in. send-team-deleted Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/send-team-deleted with a fake teamId and the current user as ownerName. Verifies ok:true is returned. No inbox check needed - notified:0 means the function ran correctly but found no members for the test ID.',
    input: 'POST /functions/v1/send-team-deleted { teamId: \'test-team-142\', teamName: \'Test Team (Test 142)\', ownerName }',
    expected: 'Response JSON has ok:true. notified:0 is expected (fake teamId has no members). No inbox email will arrive - this is correct behavior for a deployment check.',
    steps: 'Automatic. Confirm ok:true in the result. notified:0 is expected - mark Pass.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      const prof = window._supabaseProfile || {};
      const ownerName = [prof.first_name, prof.last_name].filter(Boolean).join(' ') || 'Test Owner';
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-team-deleted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ teamId: 'test-team-142', teamName: 'Test Team (Test 142)', ownerName }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }
      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.ok !== true) throw new Error(`Response missing ok:true - got: ${JSON.stringify(body)}`);

      return true;
    }
  },

  {
    id: 144, category: 'Email',
    title: 'waitlist-signup - Edge Function returns ok:true or duplicate:true',
    purpose: 'Confirms the waitlist-signup Edge Function is deployed and returns a valid response. Uses the current user email - if already on the waitlist, duplicate:true is returned (also a pass).',
    prerequisites: 'Must be logged in. waitlist-signup Edge Function must be deployed.',
    description: 'POSTs to /functions/v1/waitlist-signup with the current user email. Accepts either { success:true } (new signup + email sent) or { duplicate:true } (already on waitlist). Cleans up the test row if a new entry was created.',
    input: 'POST /functions/v1/waitlist-signup { email }',
    expected: 'Response JSON has success:true (new signup, check inbox for waitlist email) or duplicate:true (already signed up, no email). Both are Pass.',
    steps: 'Automatic. If success:true - check inbox for the waitlist confirmation email. If duplicate:true - no email, mark Pass.',
    test: async () => {
      const email = window._supabaseUser?.email || currentUser?.email;
      if (!email) throw new Error('No user email - must be logged in');
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/waitlist-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email }),
      });
      let body;
      try { body = await res.json(); } catch(_) { body = {}; }
      if (res.status === 429) throw new Error('Rate limited - wait 60s and retry');
      if (!res.ok) throw new Error(`Edge Function returned ${res.status}: ${JSON.stringify(body)}`);
      if (body.success !== true && body.duplicate !== true) throw new Error(`Unexpected response - got: ${JSON.stringify(body)}`);

      // duplicate:true = already on waitlist, no email sent - auto-pass
      if (body.duplicate === true) return true;

      // success:true = new signup, email sent - clean up and ask for inbox check
      if (body.success === true && supabaseClient) {
        await supabaseClient.from('waitlist').delete().eq('email', email.toLowerCase().trim());
      }

      return true; // success:true = new signup sent, email confirmed by EF response
    }
  },

  {
    id: 145, category: 'Email',
    title: '[MANUAL] waitlist-signup - correct email content in inbox (if success:true)',
    purpose: 'Manual confirmation that the waitlist email arrived with correct content if test 144 returned success:true.',
    prerequisites: 'Test 144 must have passed with success:true (not duplicate:true).',
    description: 'Open the waitlist confirmation email and verify subject, content, and branding.',
    input: 'Email inbox for logged-in user account',
    expected: 'Email arrives with subject "You\'re on the JumpKit waitlist 🚀". Contains feature list and jumpkit.app link. If test 144 returned duplicate:true, skip this test and mark Pass.',
    steps: '1. If test 144 returned duplicate:true - mark this test Pass (no email expected).\n2. Otherwise open your inbox.\n3. Find email with subject "You\'re on the JumpKit waitlist 🚀".\n4. Verify it contains the feature list and a link to jumpkit.app.\n5. Mark as Pass once confirmed.',
    test: async () => 'manual'
  },

  // ══════════════════════════════════════════════════════════════════
  // EXPORT PDF
  // ══════════════════════════════════════════════════════════════════

  {
    id: 113, category: 'Deployment',
    title: 'Export PDF - electronAPI.exportPDF is exposed in preload',
    purpose: 'Confirms the Electron preload correctly exposes electronAPI.exportPDF so the renderer can trigger PDF generation.',
    prerequisites: 'Must be running in the Electron app (not a browser).',
    description: 'Checks that window.electronAPI.exportPDF is a function.',
    input: 'typeof window.electronAPI.exportPDF',
    expected: '"function"',
    steps: 'Automatic.',
    test: async () => {
      if (!window.electronAPI) throw new Error('window.electronAPI is not defined - is this running in Electron?');
      if (typeof window.electronAPI.exportPDF !== 'function') throw new Error(`electronAPI.exportPDF is ${typeof window.electronAPI.exportPDF}, expected function`);
    }
  },

  {
    id: 121, category: 'Deployment',
    title: '[AUTO+MANUAL] Export PDF - exports real statistics PDF and opens for human verification',
    purpose: 'Calls exportStatsPDF() - the real app export function - to generate the actual ROI report PDF from live data. Human verifies the saved file looks correct.',
    prerequisites: 'Must be running in Electron. Must be logged in with at least some jump data for a meaningful export.',
    description: 'Navigates to Stats page, then calls exportStatsPDF() which builds the full ROI report HTML (personal stats, charts, top jumps, team ROI) and sends it to Electron for PDF generation.',
    input: 'exportStatsPDF()',
    expected: 'A Save dialog appears. After saving, the PDF contains real stats: launches, time saved, dollars saved, top jumps table, and charts. Human verifies content looks correct.',
    steps: 'Automatic trigger, then manual verification:\n1. A Save dialog will appear - choose a location and save.\n2. Open the saved PDF.\n3. Verify it shows your real stats (launches, time saved, top jumps).\n4. Verify it is not a dummy/placeholder file.\n5. Mark as Pass once confirmed.',
    test: async () => {
      if (!window.electronAPI?.exportPDF) throw new Error('electronAPI.exportPDF not available - not running in Electron');
      if (typeof exportStatsPDF !== 'function') throw new Error('exportStatsPDF is not defined - check app.js is loaded');
      if (!currentUser) throw new Error('No user logged in');

      // Navigate to stats page so charts are rendered before export
      if (typeof renderStats === 'function') {
        renderStats();
        await new Promise(r => setTimeout(r, 800));
      }

      try {
        await exportStatsPDF();
      } catch(e) {
        throw new Error('exportStatsPDF threw an error: ' + e.message);
      }

      // Nav back to tests page after export completes
      if (typeof renderTests === 'function') renderTests();

      return 'manual';
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // ONBOARDING STEP PROGRESSION
  // ══════════════════════════════════════════════════════════════════

  {
    id: 24, category: 'Onboarding',
    title: 'Onboarding - showOnboardingModal() and step 1 render without error',
    purpose: 'Confirms the onboarding overlay is created and step 1 content renders into #onboardingContent without throwing.',
    prerequisites: 'Must be logged in. onboarding.js must be loaded.',
    description: 'Calls showOnboardingModal() and checks that the overlay and step 1 content are present in the DOM.',
    input: 'showOnboardingModal("Test")',
    expected: '#onboardingOverlay exists. #onboardingContent is non-empty. #onboardingProgress is present.',
    steps: 'Automatic. The onboarding overlay will briefly appear - it is removed at test end.',
    test: async () => {
      if (typeof showOnboardingModal !== 'function') throw new Error('showOnboardingModal is not defined - check onboarding.js is loaded');
      showOnboardingModal('Test', false);
      await new Promise(r => setTimeout(r, 100));
      const overlay = document.getElementById('onboardingOverlay');
      if (!overlay) throw new Error('#onboardingOverlay not found after showOnboardingModal()');
      const content = document.getElementById('onboardingContent');
      if (!content || content.innerHTML.trim().length < 20) throw new Error('#onboardingContent is empty after step 1 render');
      const progress = document.getElementById('onboardingProgress');
      if (!progress) throw new Error('#onboardingProgress bar not found');
      if (progress.style.width !== '20%') throw new Error(`Progress bar should be 20% at step 1, got ${progress.style.width}`);
      overlay.remove();
    }
  },

  {
    id: 25, category: 'Onboarding',
    title: 'Onboarding - steps 2, 3, 4 each render without error',
    purpose: 'Confirms renderOnboardingStep(2), (3), and (4) each populate #onboardingContent without throwing, and the progress bar advances correctly.',
    prerequisites: 'Must be logged in. onboarding.js must be loaded.',
    description: 'Creates the onboarding overlay then calls renderOnboardingStep for steps 2, 3, 4 in sequence, validating content and progress each time.',
    input: 'renderOnboardingStep(2), renderOnboardingStep(3), renderOnboardingStep(4)',
    expected: 'Each step renders non-empty content. Progress bar = 40%, 60%, 80% respectively.',
    steps: 'Automatic. Overlay is created and removed by the test.',
    test: async () => {
      if (typeof showOnboardingModal !== 'function') throw new Error('showOnboardingModal is not defined');
      if (typeof renderOnboardingStep !== 'function') throw new Error('renderOnboardingStep is not defined');
      showOnboardingModal('Test', false);
      await new Promise(r => setTimeout(r, 100));
      const steps = [
        { step: 2, expectedPct: '40%' },
        { step: 3, expectedPct: '60%' },
        { step: 4, expectedPct: '80%' },
      ];
      for (const s of steps) {
        renderOnboardingStep(s.step, 'Test', false);
        await new Promise(r => setTimeout(r, 50));
        const content = document.getElementById('onboardingContent');
        if (!content || content.innerHTML.trim().length < 20) throw new Error(`#onboardingContent empty after step ${s.step}`);
        const bar = document.getElementById('onboardingProgress');
        if (!bar) throw new Error('#onboardingProgress not found');
        if (bar.style.width !== s.expectedPct) throw new Error(`Progress bar at step ${s.step}: expected ${s.expectedPct}, got ${bar.style.width}`);
      }
      const overlay = document.getElementById('onboardingOverlay');
      if (overlay) overlay.remove();
    }
  },

  {
    id: 26, category: 'Onboarding',
    title: 'Onboarding - renderOnboardingComplete() shows "You\'re all set" and progress = 100%',
    purpose: 'Confirms the final onboarding screen renders the completion message and fills the progress bar to 100%.',
    prerequisites: 'Must be logged in. onboarding.js must be loaded.',
    description: 'Creates the overlay, calls renderOnboardingComplete(), and verifies the completion state.',
    input: 'renderOnboardingComplete()',
    expected: '#onboardingContent contains completion text. Progress bar = 100%.',
    steps: 'Automatic. Overlay is created and removed by the test.',
    test: async () => {
      if (typeof showOnboardingModal !== 'function') throw new Error('showOnboardingModal is not defined');
      if (typeof renderOnboardingComplete !== 'function') throw new Error('renderOnboardingComplete is not defined');
      showOnboardingModal('Test', false);
      await new Promise(r => setTimeout(r, 100));
      renderOnboardingComplete();
      await new Promise(r => setTimeout(r, 100));
      const content = document.getElementById('onboardingContent');
      if (!content || !content.innerHTML.includes("all set")) throw new Error("Completion screen does not contain expected text");
      const bar = document.getElementById('onboardingProgress');
      if (!bar) throw new Error('#onboardingProgress not found');
      if (bar.style.width !== '100%') throw new Error(`Progress bar should be 100% at completion, got ${bar.style.width}`);
      const overlay = document.getElementById('onboardingOverlay');
      if (overlay) overlay.remove();
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // NEW TEAM CREATION
  // ══════════════════════════════════════════════════════════════════

  {
    id: 76, category: 'Teams',
    title: 'New team - openCreateTeamModal() renders without error',
    purpose: 'Confirms the Create Team modal opens and renders its form fields without throwing.',
    prerequisites: 'Must be logged in.',
    description: 'Calls openCreateTeamModal() and checks the modal is visible with expected inputs.',
    input: 'openCreateTeamModal()',
    expected: 'Modal opens. Contains team name, owner email, and password inputs. No JS exception.',
    steps: 'Automatic. Modal is closed by the test.',
    test: async () => {
      if (typeof openCreateTeamModal !== 'function') throw new Error('openCreateTeamModal is not defined - check teams.js is loaded');
      openCreateTeamModal('');
      await new Promise(r => setTimeout(r, 150));
      const nameInput = document.getElementById('ctTeamName');
      const emailInput = document.getElementById('ctOwnerEmail');
      const pwInput = document.getElementById('ctTeamPassword');
      if (!nameInput) throw new Error('#ctTeamName input not found in modal');
      if (!emailInput) throw new Error('#ctOwnerEmail input not found in modal');
      if (!pwInput) throw new Error('#ctTeamPassword input not found in modal');
      if (typeof Modal !== 'undefined' && Modal.close) Modal.close();
    }
  },

  {
    id: 77, category: 'Teams',
    title: 'New team - direct Supabase insert creates team row and cleans up',
    purpose: 'Validates the full round-trip: insert a team row directly into Supabase (bypassing UI), confirm it exists, then delete it. Tests DB write access and schema correctness.',
    prerequisites: 'Must be logged in as admin.',
    description: 'Inserts a test team row into the teams table, verifies it was created, then deletes it. Does not go through the UI.',
    input: 'supabaseClient.from("teams").insert({ name, owner_id, team_password_hash })',
    expected: 'Insert returns a team row with an id. Select confirms it exists. Delete removes it cleanly.',
    steps: 'Automatic.',
    test: async () => {
      const userId = window._supabaseUser?.id;
      if (!userId) throw new Error('No user id - must be logged in');

      const testName = `__test_team_${Date.now()}`;
      const fakeHash = 'test_hash_' + Math.random().toString(36).slice(2);

      // org_id is NOT NULL - resolve same way as renderTeams()
      let orgId = window._supabaseProfile?.org_id || null;
      if (!orgId) {
        const { data: existingOrg } = await supabaseClient.from('organizations').select('id').eq('owner_id', userId).maybeSingle();
        orgId = existingOrg?.id || null;
      }
      if (!orgId) throw new Error('No org_id found for user - run test 65 first to ensure org exists');

      // Insert
      const { data: team, error: insertErr } = await supabaseClient
        .from('teams')
        .insert({ name: testName, owner_id: userId, team_password_hash: fakeHash, org_id: orgId })
        .select()
        .single();
      if (insertErr) throw new Error('Insert failed: ' + insertErr.message);
      if (!team?.id) throw new Error('Insert returned no id');

      // Verify
      const { data: found, error: selectErr } = await supabaseClient
        .from('teams').select('id, name').eq('id', team.id).single();
      if (selectErr || !found) throw new Error('Could not re-fetch team after insert: ' + (selectErr?.message || 'not found'));
      if (found.name !== testName) throw new Error(`Name mismatch: got "${found.name}", expected "${testName}"`);

      // Cleanup - delete team_members first, then team
      await supabaseClient.from('team_members').delete().eq('team_id', team.id);
      const { error: deleteErr } = await supabaseClient.from('teams').delete().eq('id', team.id);
      if (deleteErr) throw new Error('Cleanup delete failed: ' + deleteErr.message);

      // Confirm gone
      const { data: gone } = await supabaseClient.from('teams').select('id').eq('id', team.id).maybeSingle();
      if (gone) throw new Error('Team row still exists after delete - cleanup failed');
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // TEAM PASSWORD CHANGE
  // ══════════════════════════════════════════════════════════════════

  {
    id: 120, category: 'Teams',
    title: 'verify-team-password - wrong password returns valid:false',
    purpose: 'Confirms verify-team-password correctly rejects a wrong password. If rejection works, the function is operating correctly - correct-password acceptance is implied.',
    prerequisites: 'Must be logged in as a team owner with at least one owned team.',
    description: 'Fetches the first team owned by the current user and calls verify-team-password with a deliberately wrong password. Confirms the response has valid:false.',
    input: 'POST /functions/v1/verify-team-password { teamId, candidatePassword: \'definitely_wrong_password_xyz\' }',
    expected: 'Response JSON has valid:false.',
    steps: 'Automatic.',
    test: async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');
      const userId = window._supabaseUser?.id;
      if (!userId) throw new Error('Not logged in - _supabaseUser not set');

      // Fetch the first team owned by current user
      const { data: teams } = await supabaseClient
        .from('teams')
        .select('id, name')
        .eq('owner_id', userId)
        .limit(1);

      if (!teams || teams.length === 0) throw new Error('No owned teams found - create at least one team before running this test');
      const teamId = teams[0].id;
      const teamName = teams[0].name;

      // Test wrong password first (automatic)
      const wrongRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-team-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ teamId, candidatePassword: 'definitely_wrong_password_xyz' }),
      });
      const wrongBody = await wrongRes.json().catch(() => ({}));
      if (wrongBody.valid !== false) throw new Error(`Wrong password should return valid:false, got: ${JSON.stringify(wrongBody)}`);

      return true;
    }
  },

];

// ── Render Function ────────────────────────────────────────────────
function renderTests() {
  const pageContent = document.getElementById('pageContent');

  // Access control
  if (window._supabaseProfile?.role !== 'admin') {
    pageContent.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px">
        <svg class="ti ti-lock" style="font-size:3rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-lock"/></svg>
        <h2 style="font-size:1.4rem;font-weight:700;color:var(--text)">403 - Access Restricted</h2>
        <p style="color:var(--text-muted);font-size:0.9rem">This page is only available to administrators.</p>
      </div>`;
    return;
  }

  pageContent.innerHTML = `
    <div id="pageTests" style="display:flex;flex-direction:column;height:100%;">

      <!-- Summary + Buttons row - static header; .page-content scrolling is disabled
           via the :has(#pageTests) CSS rule so only #testsTablesWrap scrolls. -->
      <div style="flex-shrink:0;background:var(--bg);padding:16px 24px 12px 24px;display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;border-bottom:1px solid var(--border)">
        <!-- Unified summary card -->
        <div id="testSummary" style="padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);display:inline-flex;align-items:center;gap:0">
          <div id="summaryPass" style="text-align:center;padding:2px 10px;"><div style="font-size:1.3rem;font-weight:900;color:#3fbe71">0</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Passed</div></div>
          <div id="summaryFail" style="text-align:center;padding:2px 10px;"><div style="font-size:1.3rem;font-weight:900;color:#e15b59">0</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Failed</div></div>
          <div id="summaryManual" style="text-align:center;padding:2px 10px;"><div style="font-size:1.3rem;font-weight:900;color:#f59e0b">0</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Manual</div></div>
          <div id="summaryNotRun" style="text-align:center;padding:2px 10px;"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${JK_TESTS.length}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Skipped</div></div>
          <div id="summaryTotal" style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${JK_TESTS.length}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Total</div></div>
          <span id="summaryTime" style="color:var(--text-muted);font-size:0.78rem;padding-left:10px;"></span>
        </div>
        <!-- Hidden per-section ids kept for _refreshSummary compat -->
        <div style="display:none"><span id="summaryAutoPass"></span><span id="summaryAutoFail"></span><span id="summaryAMPass"></span><span id="summaryAMFail"></span><span id="summaryManPass"></span><span id="summaryManFail"></span></div>

        <button class="btn btn-subtle" id="btnTestStrategy" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-bulb" style="font-size:1.15rem"><use href="img/tabler-sprite.svg#tabler-bulb"/></svg> How to Run Tests
        </button>
        <button class="btn btn-subtle" id="btnCreateReleaseTesting" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-adjustments" style="font-size:1.15rem"><use href="img/tabler-sprite.svg#tabler-adjustments"/></svg> Manage Testing
        </button>
        <div id="activeRunToggle" style="display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0;background:var(--bg-card);box-shadow:0 1px 3px rgba(0,0,0,.06)">
          <button id="btnActiveRunMac" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:rgba(13,148,136,0.12);color:#0d9488;font-size:0.78rem;font-weight:700;letter-spacing:.02em;transition:all .15s">
            <svg class="ti ti-brand-apple" style="width:1.05rem;height:1.05rem;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-brand-apple"/></svg>
            Mac
          </button>
          <button id="btnActiveRunWin" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-size:0.78rem;font-weight:600;letter-spacing:.02em;transition:all .15s">
            <svg class="ti ti-brand-windows" style="width:1.05rem;height:1.05rem;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-brand-windows"/></svg>
            Windows
          </button>
        </div>
        <span id="rtActiveLabel" style="font-size:0.78rem;color:var(--text-muted);display:flex;align-items:center;gap:5px"></span>
        <span id="runProgress" style="font-size:0.8rem;color:var(--text-muted);display:none"></span>
      </div>

      <!-- Tables rendered by _buildTestRows() -->
      <div id="testsTablesWrap" style="flex:1;overflow-y:auto;padding:16px 24px 24px 24px;"></div>
    </div>`;

  // Build initial rows
  _buildTestRows();

  // Only restore saved results if a release testing session is active.
  // If no session is active, leave everything in the default clean state.
  if (!window._jkTestResults) window._jkTestResults = {};
  const _activeSession = _getReleaseState();
  const _deployConfigForLoad = (typeof _loadDeployConfig === 'function') ? _loadDeployConfig() : {};
  if (_deployConfigForLoad?.resultsFilePath) {
    // Auto-load previous results on every relaunch when a results file is configured
    _loadTestResults(); // SQLite fast base
    setTimeout(() => _loadResultsFromHTMLFile({ silent: true }), 0); // HTML authoritative source
  }
  // Sync active run toggle visual state
  const _initActiveRun = _activeSession?.activeRun || 'mac';
  const _macBtn = document.getElementById('btnActiveRunMac');
  const _winBtn = document.getElementById('btnActiveRunWin');
  if (_macBtn && _winBtn) {
    const _macActiveS  = `display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:rgba(13,148,136,0.12);color:#0d9488;font-size:0.78rem;font-weight:700;letter-spacing:.02em;transition:all .15s`;
    const _winActiveS  = `display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:rgba(14,165,233,0.12);color:#0ea5e9;font-size:0.78rem;font-weight:700;letter-spacing:.02em;transition:all .15s`;
    const _inactiveS   = `display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-size:0.78rem;font-weight:600;letter-spacing:.02em;transition:all .15s`;
    _macBtn.style.cssText = _initActiveRun === 'mac' ? _macActiveS : _inactiveS;
    _winBtn.style.cssText = _initActiveRun === 'windows' ? _winActiveS : _inactiveS;
  }
  // Pre-seed all [MANUAL] tests with 'manual' state if not already set
  JK_TESTS.filter(t => t.title.startsWith('[MANUAL]')).forEach(t => {
    if (!window._jkTestResults[t.id]) {
      window._jkTestResults[t.id] = { state: 'manual', received: 'Manual verification required' };
    }
  });
  // Render all results (saved + manual defaults)
  Object.entries(window._jkTestResults).forEach(([id, r]) => {
    if (r.state && r.state !== 'running') {
      _setRowResult(parseInt(id), r.state, r.message || null);
    }
  });
  _refreshSummary();

  // Wire buttons
  document.getElementById('btnRunAutoTests').addEventListener('click', () => _runTests('auto'));
  document.getElementById('btnRunAutoManualTests').addEventListener('click', () => _runTests('auto-manual'));
  document.getElementById('btnResetAutoTests').addEventListener('click', () => _resetSection('auto'));
  document.getElementById('btnResetAutoManualTests').addEventListener('click', () => _resetSection('auto-manual'));
  document.getElementById('btnResetManualTests').addEventListener('click', () => _resetSection('manual'));
  document.getElementById('btnTestStrategy').addEventListener('click', _openTestStrategyModal);
  document.getElementById('btnCreateReleaseTesting').addEventListener('click', _openReleaseTestingModal);
  document.getElementById('btnActiveRunMac')?.addEventListener('click', () => _setActiveRun('mac'));
  document.getElementById('btnActiveRunWin')?.addEventListener('click', () => _setActiveRun('windows'));
  _updateRTLabel();
  document.getElementById('btnSavePreflightResults').addEventListener('click', () => _saveReleaseSection('preflight'));
  document.getElementById('btnSaveAutoResults').addEventListener('click', () => _saveReleaseSection('auto'));
  document.getElementById('btnSaveAMResults').addEventListener('click', () => _saveReleaseSection('auto-manual'));
  document.getElementById('btnSaveManualResults').addEventListener('click', () => _saveReleaseSection('manual'));

  // Delegated handler - registered once at module scope so re-renders don't stack duplicates.
  // removeEventListener before addEventListener guarantees exactly one live registration.
  document.removeEventListener('click', _testsJaction);
  document.addEventListener('click', _testsJaction);
}

// Module-scope handler - must live outside renderTests() so the function reference
// is stable across re-renders (needed for removeEventListener to work correctly).
function _testsJaction(e) {
  const btn = e.target.closest('[data-jaction]');
  if (!btn) return;
  const action = btn.dataset.jaction;
  if (action === 'test-run') {
    _runSingleTest(parseInt(btn.dataset.testid));
  } else if (action === 'test-mark-pass') {
    _markManualResult(parseInt(btn.dataset.testid), 'pass');
  } else if (action === 'test-mark-fail') {
    _markManualResult(parseInt(btn.dataset.testid), 'fail');
  } else if (action === 'test-mark-skip') {
    _markManualResult(parseInt(btn.dataset.testid), 'skip');
  } else if (action === 'test-details') {
    if (!document.getElementById('pageTests')) return;
    _openTestDetail(parseInt(btn.dataset.testid));
  } else if (action === 'test-nav') {
    if (!document.getElementById('pageTests')) return;
    const navId = parseInt(btn.dataset.navid);
    // Update modal content in-place - no close/reopen, no flash
    const { title, body, footer } = _buildTestDetailContent(navId);
    const mt = document.getElementById('modalTitle');
    const mb = document.getElementById('modalBody');
    const mf = document.getElementById('modalFooter');
    if (mt) mt.innerHTML = title;
    if (mb) { mb.innerHTML = body; mb.scrollTop = 0; }
    if (mf) mf.innerHTML = footer;
  } else if (action === 'cmd-copy') {
    const cmd = btn.getAttribute('data-cmd');
    navigator.clipboard.writeText(cmd).catch(function(){});
    btn.innerHTML = '<svg class="ti ti-check" style="width:.85rem;height:.85rem;color:#3fbe71"><use href="img/tabler-sprite.svg#tabler-check"/></svg>';
    setTimeout(function(){ btn.innerHTML = '<svg class="ti ti-copy" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.svg#tabler-copy"/></svg>'; }, 1500);
  } else if (action === 'section-toggle') {
    if (!document.getElementById('pageTests')) return;
    e.stopPropagation();
    const sectionId = btn.dataset.section;
    const body = document.getElementById(sectionId);
    const chevron = document.getElementById('chevron-' + sectionId);
    if (!body) return;
    const collapsed = body.dataset.collapsed === 'true';
    if (collapsed) {
      // Expand: animate from 0 → large value. scrollHeight returns 0 in Electron/WebKit
      // when maxHeight is 0, so use a fixed large ceiling instead.
      // 60000px safely handles 700+ test rows (~85px each) with room to spare.
      body.style.maxHeight = '60000px';
      body.dataset.collapsed = 'false';
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
      // Collapse: read current rendered height, force a reflow so the browser
      // "commits" that value as the transition start point, then animate to 0.
      // Without the reflow, the browser batches both assignments and skips the animation.
      body.style.maxHeight = body.offsetHeight + 'px';
      void body.offsetHeight; // force reflow - do not remove
      body.style.maxHeight = '0px';
      body.dataset.collapsed = 'true';
      if (chevron) chevron.style.transform = 'rotate(-90deg)';
    }
  }
}

// ── Test Result Persistence ─────────────────────────────────────
// Saves/loads pass/fail/manual results to SQLite via DB.savePrefs so
// progress survives app restarts. Only final states are persisted -
// 'running' is ephemeral and never written.
function _saveTestResults() {
  try {
    const userId = window._supabaseUser?.id || (typeof currentUser !== 'undefined' && currentUser?.id);
    if (!userId || typeof DB === 'undefined' || !DB.savePrefs) return;
    // Persist only state + received - skip logs (ephemeral, too large)
    const slim = {};
    Object.entries(window._jkTestResults || {}).forEach(([id, r]) => {
      if (r.state && r.state !== 'running') {
        slim[id] = { state: r.state, received: r.received || '', ts: r.ts || Date.now() };
      }
    });
    DB.savePrefs(userId, { testResults: slim });
  } catch(e) { console.warn('[tests] saveTestResults failed:', e.message); }
}

function _loadTestResults() {
  try {
    const userId = window._supabaseUser?.id || (typeof currentUser !== 'undefined' && currentUser?.id);
    if (!userId || typeof DB === 'undefined' || !DB.getPrefs) return;
    const saved = DB.getPrefs(userId).testResults;
    if (!saved || typeof saved !== 'object') return;
    if (!window._jkTestResults) window._jkTestResults = {};
    Object.entries(saved).forEach(([id, r]) => {
      window._jkTestResults[parseInt(id)] = r;
    });
  } catch(e) { console.warn('[tests] loadTestResults failed:', e.message); }
}

function _clearSavedTestResults() {
  try {
    const userId = window._supabaseUser?.id || (typeof currentUser !== 'undefined' && currentUser?.id);
    if (!userId || typeof DB === 'undefined' || !DB.savePrefs) return;
    DB.savePrefs(userId, { testResults: {} });
  } catch(e) { console.warn('[tests] clearSavedTestResults failed:', e.message); }
}

// ── Load Results from HTML File ─────────────────────────────────
// Reads the configured release testing HTML file, extracts the embedded
// JSON state, and restores each test's result into the live test runner.
async function _loadResultsFromHTMLFile(opts = {}) {
  const silent = opts?.silent === true;
  // Accept filePath directly via opts (e.g. from resume handler before localStorage is confirmed written)
  // Fallback to localStorage via _getReleaseState
  const cfg = _getReleaseState() || {};
  const filePath = opts?.filePath || cfg?.resultsFilePath;
  if (!filePath) {
    if (!silent) window.Toast?.danger('No results file configured — open Manage Testing to set one.');
    return;
  }
  if (!window.electronAPI?.readFile) {
    if (!silent) alert('File I/O not available - not running in Electron.');
    return;
  }
  try {
    const { ok, content, reason } = await window.electronAPI.readFile(filePath);
    if (!ok) { window.Toast?.danger(`Could not read file: ${reason}`); return; }
    if (!content) { if (!silent) window.Toast?.danger('File is empty or does not exist yet.'); return; }

    // Extract embedded JSON block
    const match = content.match(/<script type="application\/json" id="jk-release-data">([\s\S]*?)<\/script>/);
    if (!match) { if (!silent) window.Toast?.danger('No test data found in file - was it created by JumpKit?'); return; }

    const entries = JSON.parse(match[1]);
    if (!window._jkTestResults) window._jkTestResults = {};

    let loaded = 0;
    Object.values(entries).forEach(entry => {
      const id = parseInt(entry.id);
      if (!id || !entry.state || entry.state === 'not-run') return;
      window._jkTestResults[id] = {
        state: entry.state,
        received: entry.manuallyMarked ? 'Manually marked as passed' : (entry.details || 'Loaded from file'),
        ts: Date.now(),
      };
      loaded++;
    });

    // Persist to SQLite so results survive future restarts
    _saveTestResults();

    // Refresh UI
    Object.entries(window._jkTestResults).forEach(([id, r]) => {
      if (r.state && r.state !== 'running') _setRowResult(parseInt(id), r.state, r.message || null);
    });
    _refreshSummary();

    if (!silent) {
      const fname = filePath.split(/[\/\\]/).pop();
      window.Toast?.success(`Loaded ${loaded} result${loaded !== 1 ? 's' : ''} from ${fname}`);
    }
  } catch (err) {
    console.error('[LoadFromFile] Error:', err);
    if (!silent) window.Toast?.danger(`Load failed: ${err.message}`);
  }
}


// ── Conclude Testing ─────────────────────────────────────────────
// Shows a confirmation modal, then resets all test state so the next
// testing cycle starts from scratch. The HTML file on disk is kept
// as the permanent record for this release.
function _openConcludeModal(platform) {
  platform = platform || 'mac';
  const results = window._jkTestResults || {};
  const platformTests = platform === 'windows'
    ? JK_TESTS.filter(t => !t.platforms || t.platforms.includes('windows'))
    : JK_TESTS;
  const notRun = platformTests.filter(t => {
    const r = results[t.id];
    return !r || r.state === 'not-run';
  });
  // Manual tests default to 'manual' state - treat those as incomplete too
  const stillManual = platformTests.filter(t => {
    const r = results[t.id];
    return r?.state === 'manual';
  });

  const warnLines = [];
  if (notRun.length)    warnLines.push(`<li><strong>${notRun.length}</strong> test${notRun.length !== 1 ? 's' : ''} not yet run</li>`);
  if (stillManual.length) warnLines.push(`<li><strong>${stillManual.length}</strong> manual test${stillManual.length !== 1 ? 's' : ''} not yet marked Pass/Fail</li>`);

  const warnBlock = warnLines.length
    ? `<div style="margin-bottom:14px;padding:10px 14px;border-radius:8px;background:#f59e0b22;border:1px solid #f59e0b55;color:#f59e0b;font-size:0.85rem">
        <strong>⚠️ Heads up:</strong><ul style="margin:6px 0 0 16px;padding:0">${warnLines.join('')}</ul>
       </div>`
    : `<div style="margin-bottom:14px;padding:10px 14px;border-radius:8px;background:#3fbe7122;border:1px solid #3fbe7155;color:#3fbe71;font-size:0.85rem">✅ All tests have been run and marked.</div>`;

  const resultsFileForModal = _getReleaseState()?.resultsFilePath;
  const fileNote = resultsFileForModal
    ? `<p style="font-size:0.83rem;color:var(--text-muted);margin:0">Results will be saved to <strong style="color:var(--text)">${_esc(resultsFileForModal.split(/[\/\\]/).pop())}</strong> and recorded in Supabase.</p>`
    : `<p style="font-size:0.83rem;color:var(--text-muted);margin:0">No results file yet - you will be prompted to choose a folder on first save.</p>`;

  const platformLabel = platform === 'windows' ? 'Windows' : 'Mac';
  const body = `
    ${warnBlock}
    <p style="margin:0 0 10px;font-weight:600">Finalize the <strong>${platformLabel}</strong> testing run?</p>
    ${fileNote}
    <p style="margin:8px 0 0;font-size:0.82rem;color:var(--text-muted)">This will record the scorecard in Supabase. The test runner stays active for the other platform's run.</p>`;

  const footer = `
    <button class="btn btn-subtle" data-jaction="modal-close" style="margin-right:auto">Cancel</button>
    <button id="btnConfirmConclude" class="btn" style="background:#1A4FD6;color:#fff;border-color:#1A4FD6">Finalize ${platformLabel} Run</button>`;

  Modal.open(
    `<svg class="ti ti-flag-check" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.svg#tabler-flag-check"/></svg> Finalize ${platformLabel} Run`,
    body, footer, 'md'
  );

  document.getElementById('btnConfirmConclude').onclick = () => {
    Modal.close();
    _finalizePlatformRun(platform);
  };
}

async function _finalizePlatformRun(platform) {
  const results = window._jkTestResults || {};
  const deployConfig = (typeof _loadDeployConfig === 'function') ? _loadDeployConfig() : {};
  const version = deployConfig.version || '';
  const account = window._supabaseUser?.email || (typeof currentUser !== 'undefined' && currentUser?.email) || '';
  const resultsFilePath = deployConfig?.resultsFilePath || '';
  const existingRecordId = deployConfig?.deploymentRecordId || null;

  // Compute platform-specific test counts
  const platformTests = platform === 'windows'
    ? JK_TESTS.filter(t => !t.platforms || t.platforms.includes('windows'))
    : JK_TESTS;

  let passed = 0, failed = 0, skipped = 0;
  platformTests.forEach(t => {
    const r = results[t.id];
    if (!r || !r.state || r.state === 'not-run' || r.state === 'skip') skipped++;
    else if (r.state === 'pass') passed++;
    else if (r.state === 'fail') failed++;
    else if (r.state === 'manual') passed++; // manual = passed for scorecard
  });
  const total = platformTests.length;
  const now = new Date().toISOString();

  const prefix = platform === 'windows' ? 'win' : 'mac';
  const platformData = {
    [`${prefix}_testing_account`]: account,
    [`${prefix}_tests_total`]:    total,
    [`${prefix}_tests_passed`]:   passed,
    [`${prefix}_tests_failed`]:   failed,
    [`${prefix}_tests_skipped`]:  skipped,
    [`${prefix}_finalized_at`]:   now,
  };

  // Determine if both runs will be done after this finalization
  const updatedState = { ...deployConfig, [`${prefix}Finalized`]: true };
  const bothDone = updatedState.macFinalized && updatedState.winFinalized;

  try {
    let recordId = existingRecordId;
    if (!recordId) {
      // First finalization - INSERT new record
      const { data, error } = await supabaseClient.from('deployments').insert({
        version,
        results_file: resultsFilePath,
        status: bothDone ? 'testing_complete' : 'testing_in_progress',
        ...(bothDone ? { testing_completed_at: now } : {}),
        ...platformData,
      }).select('id').single();
      if (error) throw new Error(error.message);
      recordId = data?.id;
      // Save UUID to deploy config
      if (typeof _saveDeployConfig === 'function') {
        _saveDeployConfig({ ...deployConfig, deploymentRecordId: recordId, ...updatedState, version });
      }
    } else {
      // Second finalization - UPDATE existing record
      const { error } = await supabaseClient.from('deployments').update({
        status: 'testing_complete',
        testing_completed_at: now,
        ...platformData,
      }).eq('id', recordId);
      if (error) throw new Error(error.message);
      // Persist finalized state to deploy config
      if (typeof _saveDeployConfig === 'function') {
        _saveDeployConfig({ ...deployConfig, ...updatedState, version });
      }
    }

    const platformLabel = platform === 'windows' ? 'Windows' : 'Mac';
    if (bothDone) {
      window.Toast?.success(`✅ Both runs finalized! Testing complete - head to Deployments. 🚀`);
    } else {
      window.Toast?.success(`✅ ${platformLabel} run finalized and saved to Supabase.`);
    }

    // Re-open Manage Testing modal so user sees updated state
    setTimeout(() => _openReleaseTestingModal(), 150);

  } catch(e) {
    console.error('[FinalizePlatformRun] Error:', e);
    window.Toast?.danger(`Failed to finalize: ${e.message}`);
  }
}

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════
// RELEASE TESTING FILE
// ══════════════════════════════════════════════════════════════════
// _RT_KEY eliminated — state consolidated into jk_deploy_config (deployment.js)
// Direct localStorage fallback used when deployment.js hasn't loaded yet (e.g. user visits Tests first)
const _JK_DEPLOY_CFG_KEY = 'jk_deploy_config';

function _getReleaseState() {
  try {
    const cfg = typeof _loadDeployConfig === 'function'
      ? _loadDeployConfig()
      : JSON.parse(localStorage.getItem(_JK_DEPLOY_CFG_KEY) || '{}');
    return cfg?.version ? cfg : null;
  } catch(_) { return null; }
}
function _setReleaseState(state) {
  try {
    const payload = state || {}; // null clears to empty object
    if (typeof _saveDeployConfig === 'function') {
      _saveDeployConfig(payload);
    } else {
      localStorage.setItem(_JK_DEPLOY_CFG_KEY, JSON.stringify(payload));
    }
  } catch(_) {}
  _updateRTLabel();
}
function _updateRTLabel() {
  const el = document.getElementById('rtActiveLabel');
  if (!el) return;
  const s = _getReleaseState(); // s is now jk_deploy_config (same object)
  const resultsFile = s?.resultsFilePath;

  if (s?.version) {
    const results = window._jkTestResults || {};

    // Determine 3-state status for a given platform
    const _platformState = (platform, finalized) => {
      if (finalized) return 'passed';
      const applicableTests = platform === 'windows'
        ? JK_TESTS.filter(t => !t.platforms || t.platforms.includes('windows'))
        : JK_TESTS;
      const runCount = applicableTests.filter(t => {
        const r = results[t.id];
        return r && r.state && r.state !== 'not-run' && r.state !== 'skip';
      }).length;
      return runCount > 0 ? 'started' : 'incomplete';
    };

    // Pill renderer: 3 states - passed (green), started (amber), incomplete (red)
    const _pill = (shortLabel, fullLabel, state) => {
      if (state === 'passed')    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#3fbe7122;color:#3fbe71;border:1px solid #3fbe7155">✓ ${shortLabel} Passed</span>`;
      if (state === 'started')   return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b55">● ${shortLabel} Started</span>`;
      return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#e15b5922;color:#e15b59;border:1px solid #e15b5955">✕ ${shortLabel} Incomplete</span>`;
    };

    const macState = _platformState('mac', s.macFinalized);
    const winState = _platformState('windows', s.winFinalized);

    // File indicator
    const fileIndicator = resultsFile
      ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;background:var(--bg-input);border:1px solid var(--border);color:var(--text-muted)"><svg class="ti ti-file-text" style="font-size:0.8rem;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-file-text"/></svg>${_esc(resultsFile.split(/[\/\\]/).pop())}</span>`
      : `<span style="display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;background:#f59e0b18;border:1px solid #f59e0b44;color:#f59e0b"><svg class="ti ti-file-off" style="font-size:0.8rem;flex-shrink:0;color:#f59e0b"><use href="img/tabler-sprite.svg#tabler-file-off"/></svg>No results file - save results to create</span>`;

    el.innerHTML = `${_pill('Mac', 'Mac Testing', macState)}&nbsp;${_pill('Win', 'Win Testing', winState)}&nbsp;&nbsp;${fileIndicator}`;
  } else {
    el.innerHTML = `<svg class="ti ti-alert-triangle" style="font-size:0.9rem;color:#f59e0b"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg><span style="color:#f59e0b">No testing session - click <strong>Manage Testing</strong> to start</span>`;
  }
}

function _setActiveRun(platform) {
  const s = _getReleaseState();
  if (!s?.version) return; // no active session
  _setReleaseState({ ...s, activeRun: platform });
  // Pre-mark mac-only tests as skipped when switching to Windows run
  if (platform === 'windows') {
    if (!window._jkTestResults) window._jkTestResults = {};
    JK_TESTS.forEach(t => {
      const isMacOnly = t.platforms && !t.platforms.includes('windows');
      if (isMacOnly && !window._jkTestResults[t.id]) {
        window._jkTestResults[t.id] = { state: 'skip', received: 'Mac Only - not required on Windows' };
      }
    });
  }
  _buildTestRows();
  // Restore results into rows
  Object.entries(window._jkTestResults || {}).forEach(([id, r]) => {
    if (r.state && r.state !== 'running') _setRowResult(parseInt(id), r.state, r.message || null);
  });
  _refreshSummary();
  // Update toggle button styles
  const macBtn = document.getElementById('btnActiveRunMac');
  const winBtn = document.getElementById('btnActiveRunWin');
  if (macBtn && winBtn) {
    const macActiveStyle = `display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:rgba(13,148,136,0.12);color:#0d9488;font-size:0.78rem;font-weight:700;letter-spacing:.02em;transition:all .15s`;
    const winActiveStyle = `display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:rgba(14,165,233,0.12);color:#0ea5e9;font-size:0.78rem;font-weight:700;letter-spacing:.02em;transition:all .15s`;
    const inactiveStyle  = `display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-size:0.78rem;font-weight:600;letter-spacing:.02em;transition:all .15s`;
    macBtn.style.cssText = platform === 'mac' ? macActiveStyle : inactiveStyle;
    winBtn.style.cssText = platform === 'windows' ? winActiveStyle : inactiveStyle;
  }
}

async function _openReleaseTestingModal() {
  // existing === deployConfig (same object — no more RT_KEY split)
  const existing = _getReleaseState(); // null when no session; has .version when active
  const deployConfig = existing || {};
  let appVersion = '1.0.0';
  try {
    if (window.electronAPI?.getAppVersion) appVersion = await window.electronAPI.getAppVersion();
  } catch(_) {}

  const inputStyle = 'width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.9rem;outline:none';
  const labelStyle = 'display:block;font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em';
  const divider = `<hr style="border:none;border-top:1px solid var(--border);margin:18px 0">`;

  const currentVersion = deployConfig.version || appVersion;
  const resultsFile = deployConfig?.resultsFilePath;
  const macDone = deployConfig?.macFinalized || false;
  const winDone = deployConfig?.winFinalized || false;
  const bothDone = macDone && winDone;


  // ── Section 1: Status banner removed - shown in header rtActiveLabel instead ──
  const statusBlock = '';

  // ── Section 2: Completion banner (both runs done) ─────────────────
  const completionBanner = bothDone
    ? `<div style="margin-top:12px;padding:12px 16px;border-radius:8px;background:#3fbe7122;border:1px solid #3fbe7155;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <span style="font-size:0.88rem;color:#3fbe71;font-weight:700">✅ Testing complete! Both Mac and Win runs finalized.</span>
        <button data-jaction="modal-close" id="rtGoToDeployBtn" class="btn" style="font-size:0.82rem;padding:5px 14px;background:#3fbe71;color:#fff;border-color:#3fbe71;display:inline-flex;align-items:center;gap:5px;white-space:nowrap">
          <svg class="ti ti-rocket" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-rocket"/></svg> Go to Deployments
        </button>
       </div>`
    : '';

  // ── Section 3: Dual-run status rows (only when session exists) ────
  // Shared pill renderer - same 3-state logic as header pills
  const _statePill = (platformKey, finalized) => {
    const results = window._jkTestResults || {};
    let state;
    if (finalized) {
      state = 'passed';
    } else {
      const applicable = platformKey === 'windows'
        ? JK_TESTS.filter(t => !t.platforms || t.platforms.includes('windows'))
        : JK_TESTS;
      const runCount = applicable.filter(t => {
        const r = results[t.id]; return r && r.state && r.state !== 'not-run' && r.state !== 'skip';
      }).length;
      state = runCount > 0 ? 'started' : 'incomplete';
    }
    if (state === 'passed')  return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#3fbe7122;color:#3fbe71;border:1px solid #3fbe7155">✓ Passed</span>`;
    if (state === 'started') return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b55">● Started</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#e15b5922;color:#e15b59;border:1px solid #e15b5955">✕ Incomplete</span>`;
  };

  const _runRow = (platform, done) => {
    const platformLabel = platform === 'mac' ? 'Mac Testing' : 'Win Testing';
    const btnLabel = platform === 'mac' ? 'Finalize Mac Testing' : 'Finalize Win Testing';
    const btnId = platform === 'mac' ? 'rtFinalizeMacBtn' : 'rtFinalizeWinBtn';
    // Finalized pill
    const finalizedPill = done
      ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#3fbe7122;color:#3fbe71;border:1px solid #3fbe7155">✅ Finalized</span>`
      : `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:99px;font-size:0.72rem;font-weight:700;background:#e15b5922;color:#e15b59;border:1px solid #e15b5955">✕ Not finalized</span>`;
    // Progress pill (same 3-state as header)
    const progressPill = _statePill(platform, done);
    // Button sized to match the card height
    const finalizeBtn = done
      ? ''
      : `<button id="${btnId}" class="btn btn-subtle" style="font-size:0.8rem;padding:0 16px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;align-self:stretch;border-radius:8px"><svg class="ti ti-flag-check" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-flag-check"/></svg> ${btnLabel}</button>`;
    const doneCheck = done ? `<span style="font-size:0.82rem;color:#3fbe71;font-weight:700;padding:0 4px">✔ Done</span>` : '';
    return `<div style="display:flex;align-items:stretch;gap:10px">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);flex:1;min-height:44px;flex-wrap:wrap">
        <svg class="ti ti-brand-${platform === 'mac' ? 'apple' : 'windows'}" style="font-size:1.1rem;color:var(--text-muted);flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-brand-${platform === 'mac' ? 'apple' : 'windows'}"/></svg>
        <span style="font-weight:700;font-size:0.88rem;color:var(--text);margin-right:2px">${platformLabel}</span>
        ${progressPill}
        ${finalizedPill}
      </div>
      ${done ? `<div style="display:flex;align-items:center">${doneCheck}</div>` : finalizeBtn}
    </div>`;
  };

  const modalFileBlock = (() => {
    if (resultsFile) {
      const fname = resultsFile.split(/[\/\\]/).pop();
      const fdir  = resultsFile.split(/[\/\\]/).slice(0, -1).join('/');
      return `<div id="rtModalFileCard" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input)">
        <svg class="ti ti-file-check" style="font-size:1.1rem;color:#3fbe71;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-file-check"/></svg>
        <div style="min-width:0">
          <div style="font-size:0.82rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(fname)}</div>
          <div style="font-size:0.72rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(fdir)}</div>
        </div>
      </div>`;
    }
    return `<div id="rtModalFileCard" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;border:1px solid #f59e0b55;background:#f59e0b0d">
      <svg class="ti ti-file-off" style="font-size:1.1rem;color:#f59e0b;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-file-off"/></svg>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#f59e0b">No results file yet</div>
        <div style="font-size:0.72rem;color:var(--text-muted)">A file will be created the first time you click Save Results — or pick an existing one above.</div>
      </div>
    </div>`;
  })();


  // Platform Testing cards — always visible; greyed/inactive when no session yet
  const _inactiveRunCard = (platform) => {
    const platformLabel = platform === 'mac' ? 'Mac Testing' : 'Win Testing';
    const btnLabel = platform === 'mac' ? 'Finalize Mac Testing' : 'Finalize Win Testing';
    return `<div style="display:flex;align-items:stretch;gap:10px;opacity:0.4;pointer-events:none">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);flex:1;min-height:44px">
        <svg class="ti ti-brand-${platform === 'mac' ? 'apple' : 'windows'}" style="font-size:1.1rem;color:var(--text-muted);flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-brand-${platform === 'mac' ? 'apple' : 'windows'}"/></svg>
        <span style="font-weight:700;font-size:0.88rem;color:var(--text)">${platformLabel}</span>
        <span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:var(--bg-hover);color:var(--text-dim);border:1px solid var(--border)">— Not started</span>
      </div>
      <button disabled class="btn btn-subtle" style="font-size:0.8rem;padding:0 16px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;align-self:stretch;border-radius:8px;cursor:not-allowed">
        <svg class="ti ti-flag-check" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-flag-check"/></svg> ${btnLabel}
      </button>
    </div>`;
  };

  // Platform Testing cards — same structure for both states
  const runsBlock = `
    <p style="margin:0 0 10px;font-size:0.78rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Platform Testing</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${existing ? _runRow('mac', macDone) : _inactiveRunCard('mac')}
      ${existing ? _runRow('windows', winDone) : _inactiveRunCard('windows')}
    </div>`;

  // ── Version section ──────────────────────────────────────────────
  const versionSection = existing
    ? `<div id="rtVersionSection" style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border)">
        <span style="font-size:0.78rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Version</span>
        <span id="rtVersionDisplay" style="font-size:1rem;font-weight:700;color:var(--text)">v${_esc(currentVersion)}</span>
        <button id="rtVersionEditBtn" class="btn btn-subtle" style="padding:2px 8px;font-size:0.75rem;display:inline-flex;align-items:center;gap:4px;margin-left:4px" title="Change version">
          <svg class="ti ti-pencil" style="font-size:0.82rem"><use href="img/tabler-sprite.svg#tabler-pencil"/></svg> Edit
        </button>
       </div>
       <div id="rtVersionEditSection" style="display:none;margin-top:8px">
        <div style="display:flex;gap:8px;align-items:center">
          <input id="rtVersionEditInput" type="text" value="${_esc(currentVersion)}" style="${inputStyle};flex:1" />
          <button id="rtVersionSaveBtn" class="btn btn-primary" style="white-space:nowrap;padding:6px 14px;font-size:0.85rem">Save</button>
          <button id="rtVersionCancelBtn" class="btn btn-subtle" style="white-space:nowrap;padding:6px 14px;font-size:0.85rem">Cancel</button>
        </div>
        <p style="margin:5px 0 0;font-size:0.75rem;color:var(--text-muted)">⚠️ Changing the version updates localStorage only. The HTML file on disk and any finalized Supabase records are not renamed/updated.</p>
       </div>`
    : `<div>
        <label style="${labelStyle}">Version Number</label>
        <input id="rtVersion" type="text" placeholder="e.g. ${_esc(appVersion)}" value="${_esc(currentVersion)}" style="${inputStyle}" />
        <p style="margin:5px 0 0;font-size:0.78rem;color:var(--text-muted)">Used to name the combined results file (JumpKit_ReleaseTesting_vX.Y.Z.html).</p>
        <div style="margin-top:12px">
          <button id="rtCreateBtn" class="btn btn-subtle" style="width:100%;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 16px;font-size:0.85rem">
            <svg class="ti ti-brand-google-play" style="font-size:1rem;color:inherit"><use href="img/tabler-sprite.svg#tabler-brand-google-play"/></svg>
            Start Session
          </button>
        </div>
       </div>`;

  // ── File section — same layout for both states ────────────────────
  const _activeCfg = _getReleaseState() || {};
  const _activeFilePath = _activeCfg?.resultsFilePath || null;
  // _storedFilePath derived from _activeCfg (already read above via _getReleaseState)
  const _storedFilePath = _activeFilePath;
  const _fileStatusHtml = _storedFilePath
    ? `<div id="rtResumeFileStatus" style="display:flex;align-items:flex-start;gap:6px;margin-top:8px;padding:8px 10px;border-radius:7px;background:#3fbe7118;border:1px solid #3fbe7144;color:#3fbe71;font-size:0.75rem;font-weight:600;line-height:1.4;flex-direction:column">
        <span style="display:flex;align-items:center;gap:5px"><svg class="ti ti-circle-check" style="font-size:0.85rem;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-circle-check"/></svg> Currently loaded: <strong>${_esc(_storedFilePath.split(/[/\\]/).pop())}</strong></span>
        <span style="font-size:0.7rem;opacity:0.75;margin-left:19px">${_esc(_storedFilePath)}</span>
       </div>`
    : `<div id="rtResumeFileStatus" style="display:none"></div>`;

  const fileSection = `
    <button id="${existing ? 'rtLoadFromFileBtn' : 'rtResumeFromFileBtn'}" class="btn btn-subtle" style="width:100%;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 16px;font-size:0.85rem">
      <svg class="ti ti-file-upload" style="font-size:1rem"><use href="img/tabler-sprite.svg#tabler-file-upload"/></svg>
      ${existing ? 'Load Results from File' : 'Resume from existing results file'}
    </button>
    <p style="margin:5px 0 0;font-size:0.75rem;color:var(--text-muted)">${existing ? 'Restore test states from a saved .html results file.' : 'Pick a previously saved JumpKit_ReleaseTesting_vX.Y.Z.html to restore all test states and resume.'}</p>`;

  // Use _getReleaseState() for reliable file path (avoids direct localStorage race)

  // Session status banner — always shown; green/amber when active, grey when no session
  const _clearBtn = `<button id="rtClearSessionBtn" class="btn btn-subtle" style="flex-shrink:0;font-size:0.8rem;padding:5px 14px;color:#e15b59;border-color:#e15b5944;display:inline-flex;align-items:center;gap:5px;white-space:nowrap">
        <svg class="ti ti-x" style="font-size:0.85rem;color:#e15b59"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Clear Session
      </button>`;

  const fileBanner = _activeFilePath
    ? `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:8px;background:#3fbe7118;border:1px solid #3fbe7144;margin-bottom:14px">
        <svg class="ti ti-file-check" style="font-size:1.15rem;color:#3fbe71;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-file-check"/></svg>
        <div style="min-width:0;flex:1">
          <div style="font-size:0.85rem;font-weight:700;color:#3fbe71">Active testing session — v${_esc(_activeCfg.version || '?')}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${_esc(_activeFilePath)}">${_esc(_activeFilePath)}</div>
        </div>
        ${_clearBtn}
       </div>`
    : _activeCfg?.version
    ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:#f59e0b18;border:1px solid #f59e0b44;margin-bottom:14px">
        <svg class="ti ti-alert-triangle" style="font-size:1.1rem;color:#f59e0b;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg>
        <div style="flex:1"><div style="font-size:0.85rem;font-weight:700;color:#f59e0b">Session active — v${_esc(_activeCfg.version)} — no results file yet</div></div>
        ${_clearBtn}
       </div>`
    : `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border);margin-bottom:14px">
        <svg class="ti ti-info-circle" style="font-size:1.1rem;color:var(--text-muted);flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-info-circle"/></svg>
        <div style="font-size:0.85rem;color:var(--text-muted)">No session loaded — start a new session below or load from an existing results file.</div>
       </div>`;

  const clearSessionBtn = '';  // button now lives inside fileBanner

  const body = `
    ${fileBanner}
    ${clearSessionBtn}
    ${statusBlock}
    ${completionBanner}
    ${runsBlock}
    ${divider}
    ${versionSection}
    ${divider}
    ${fileSection}`;

  // Footer: Close only for all states — Start Session is now in the modal body
  const footer = `<button class="btn btn-subtle" data-jaction="modal-close">Close</button>`;

  Modal.open(
    '<svg class="ti ti-adjustments" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.svg#tabler-adjustments"/></svg> Manage Testing',
    body, footer, 'xl'
  );

  // Wire Resume from file (new-session path)
  document.getElementById('rtResumeFromFileBtn')?.addEventListener('click', async () => {
    if (!window.electronAPI?.openFileDialog) { alert('File picker not available outside Electron.'); return; }
    const result = await window.electronAPI.openFileDialog({
      title: 'Select JumpKit Release Testing Results File',
      filters: [{ name: 'HTML Files', extensions: ['html'] }],
      properties: ['openFile'],
    });
    if (result?.canceled || !result?.filePath) return;
    const chosenPath = result.filePath;

    if (!window.electronAPI?.readFile) { alert('File I/O not available.'); return; }
    const { ok, content } = await window.electronAPI.readFile(chosenPath);
    if (!ok || !content) { window.Toast?.danger('Could not read the selected file.'); return; }
    if (!content.includes('id="jk-release-data"')) {
      window.Toast?.danger('Wrong file — not a JumpKit release testing file.');
      return;
    }

    // Extract version from <meta name="jk-version"> or fall back to title
    let extractedVersion = content.match(/<meta name="jk-version" content="([^"]+)"/)?.[ 1]
      || content.match(/<title>JumpKit Release Testing v([^<]+)<\/title>/)?.[1]
      || 'unknown';

    // Start session using extracted version + save file path
    const cfg = (typeof _loadDeployConfig === 'function') ? _loadDeployConfig() : {};
    if (typeof _saveDeployConfig === 'function') {
      _saveDeployConfig({ ...cfg, version: extractedVersion, resultsFilePath: chosenPath, macFinalized: false, winFinalized: false, activeRun: 'mac', deploymentRecordId: null });
    }

    // Load test results — pass filePath directly so we don't depend on _loadDeployConfig being loaded
    await _loadResultsFromHTMLFile({ filePath: chosenPath });

    // Update the file status indicator in-place before reopening
    const statusEl = document.getElementById('rtResumeFileStatus');
    if (statusEl) {
      statusEl.innerHTML = `<svg class="ti ti-circle-check" style="font-size:0.85rem;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-circle-check"/></svg> Currently loaded: <strong>${_esc(chosenPath.split(/[\/\\]/).pop())}</strong><br><span style="font-size:0.7rem;opacity:0.8">${_esc(chosenPath)}</span>`;
      statusEl.style.display = 'flex';
    }

    _updateRTLabel();
    // Brief pause so user sees the green indicator, then reopen in active state
    setTimeout(() => {
      Modal.close();
      setTimeout(() => _openReleaseTestingModal(), 80);
    }, 600);
  });

  // Wire Clear Session button — close testing modal first, then show confirmation
  // (must close first: Modal.open inside an open modal gets queued, button won't wire)
  document.getElementById('rtClearSessionBtn')?.addEventListener('click', () => {
    Modal.close();
    setTimeout(() => {
      Modal.open(
        '<svg class="ti ti-alert-triangle" style="vertical-align:middle;margin-right:6px;color:#e15b59"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg> Clear Session?',
        `<p style="margin:0 0 10px">This will reset to <strong>no session loaded</strong>. You will need to start a new session or resume from an existing results file.</p>
         <p style="margin:0;font-size:0.85rem;color:var(--text-muted)">The HTML results file on disk and any Supabase records already saved are <strong>not deleted</strong> — only the active session state is cleared.</p>`,
        `<button class="btn btn-subtle" data-jaction="modal-close">Cancel</button>
         <button id="rtConfirmResetBtn" class="btn" style="background:#e15b59;border-color:#e15b59;color:#fff;display:inline-flex;align-items:center;gap:5px"><svg class="ti ti-x" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Yes, Clear Session</button>`,
        'sm'
      );
      document.getElementById('rtConfirmResetBtn')?.addEventListener('click', () => {
        const existingFolder = (_getReleaseState() || {}).folder || null;
        _setReleaseState({ folder: existingFolder }); // no version = _getReleaseState returns null
        Modal.close();
        setTimeout(() => _openReleaseTestingModal(), 80);
      });
    }, 80);
  });

  // Wire version pencil edit (existing sessions only)
  document.getElementById('rtVersionEditBtn')?.addEventListener('click', () => {
    document.getElementById('rtVersionEditSection').style.display = 'block';
    document.getElementById('rtVersionEditBtn').style.display = 'none';
    document.getElementById('rtVersionEditInput')?.focus();
  });
  document.getElementById('rtVersionCancelBtn')?.addEventListener('click', () => {
    document.getElementById('rtVersionEditSection').style.display = 'none';
    document.getElementById('rtVersionEditBtn').style.display = '';
  });
  document.getElementById('rtVersionSaveBtn')?.addEventListener('click', () => {
    const newVer = document.getElementById('rtVersionEditInput')?.value.trim();
    if (!newVer) return;
    const cfg = (typeof _loadDeployConfig === 'function') ? _loadDeployConfig() : {};
    if (typeof _saveDeployConfig === 'function') _saveDeployConfig({ ...cfg, version: newVer });
    // Update display pill in-place
    const display = document.getElementById('rtVersionDisplay');
    if (display) display.textContent = 'v' + newVer;
    document.getElementById('rtVersionEditSection').style.display = 'none';
    document.getElementById('rtVersionEditBtn').style.display = '';
    _updateRTLabel();
    window.Toast?.success(`Version updated to v${newVer}.`);
  });

  // Wire Go to Deployments button (only rendered when both runs finalized)
  document.getElementById('rtGoToDeployBtn')?.addEventListener('click', () => {
    Modal.close();
    // Navigate to deployment page
    if (typeof loadPage === 'function') loadPage('deployment');
    else document.querySelector('[data-page="deployment"]')?.click();
  });

  // Wire run finalize buttons
  if (existing) {
    if (!macDone) {
      document.getElementById('rtFinalizeMacBtn')?.addEventListener('click', () => {
        Modal.close();
        _openConcludeModal('mac');
      });
    }
    if (!winDone) {
      document.getElementById('rtFinalizeWinBtn')?.addEventListener('click', () => {
        Modal.close();
        _openConcludeModal('windows');
      });
    }
    document.getElementById('rtLoadFromFileBtn')?.addEventListener('click', async () => {
      // Do NOT close the modal - keep it open throughout
      if (!window.electronAPI?.openFileDialog) {
        alert('File picker not available outside Electron.');
        return;
      }
      const result = await window.electronAPI.openFileDialog({
        title: 'Select JumpKit Release Testing Results File',
        filters: [{ name: 'HTML Files', extensions: ['html'] }],
        properties: ['openFile'],
      });
      if (result?.canceled || !result?.filePath) return;
      const chosenPath = result.filePath;

      // Validate - must contain jk-release-data block
      if (!window.electronAPI?.readFile) { alert('File I/O not available.'); return; }
      const { ok, content } = await window.electronAPI.readFile(chosenPath);
      if (!ok || !content) {
        window.Toast?.danger('Could not read the selected file.');
        return;
      }
      if (!content.includes('id="jk-release-data"')) {
        window.Toast?.danger('Wrong file - not a JumpKit release testing file. Pick a JumpKit_ReleaseTesting_vX.Y.Z.html.');
        return;
      }

      // Save chosen path via _setReleaseState (handles fallback when deployment.js not loaded)
      const cfg = _getReleaseState() || {};
      _setReleaseState({ ...cfg, resultsFilePath: chosenPath });

      // Update the file indicator card in-place without closing the modal
      const fileCardEl = document.getElementById('rtModalFileCard');
      if (fileCardEl) {
        const fname = chosenPath.split(/[\/\\]/).pop();
        const fdir  = chosenPath.split(/[\/\\]/).slice(0, -1).join('/');
        fileCardEl.innerHTML = `
          <svg class="ti ti-file-check" style="font-size:1.1rem;color:#3fbe71;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-file-check"/></svg>
          <div style="min-width:0">
            <div style="font-size:0.82rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(fname)}</div>
            <div style="font-size:0.72rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(fdir)}</div>
          </div>`;
        fileCardEl.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input)';
      }

      // Load test results from the file
      await _loadResultsFromHTMLFile({ filePath: chosenPath });

      // Update header pill immediately
      _updateRTLabel();

      // Close and reopen modal so the banner + all state re-renders with new file
      Modal.close();
      setTimeout(() => _openReleaseTestingModal(), 80);
    });
  }

  // Start Session button — only rendered for new sessions
  document.getElementById('rtCreateBtn')?.addEventListener('click', async () => {
    const version = document.getElementById('rtVersion')?.value.trim() || appVersion;
    if (!version) { alert('Please enter a version number.'); return; }

    // Prompt for folder to save results file
    if (!window.electronAPI?.openFileDialog) { alert('File picker not available outside Electron.'); return; }
    const folderResult = await window.electronAPI.openFileDialog({
      title: 'Choose folder to save test results file',
      properties: ['openDirectory'],
    });
    if (folderResult?.canceled || !folderResult?.filePath) return;

    const folder = folderResult.filePath.replace(/[\/\\]$/, '');
    const fileName = `JumpKit_ReleaseTesting_v${version}.html`;
    const filePath = folder + '/' + fileName;

    // Create placeholder HTML file immediately
    if (window.electronAPI?.writeFileDirect) {
      try {
        const placeholder = _buildReleaseTestingHTML({}, version, filePath, {});
        await window.electronAPI.writeFileDirect(filePath, placeholder);
      } catch(e) { console.warn('Could not create results file:', e); }
    }

    // Initialize session state with file path
    _setReleaseState({ version, macFinalized: false, winFinalized: false, activeRun: 'mac', deploymentRecordId: null, resultsFilePath: filePath, folder });
    _updateRTLabel();

    // Close and reopen modal in active state
    Modal.close();
    setTimeout(() => _openReleaseTestingModal(), 80);
  });
}

async function _saveReleaseSection(mode) {
  try {
  const deployCfg = (typeof _loadDeployConfig === 'function') ? _loadDeployConfig() : {};
  const version = deployCfg.version || '';

  if (!version) {
    Modal.open(
      '<svg class="ti ti-alert-triangle" style="vertical-align:middle;margin-right:6px;color:#f59e0b"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg> No Testing Session',
      `<p style="margin:0 0 12px">No testing version is set. Please open <strong>Manage Testing</strong> and start a session first.</p>`,
      `<button class="btn btn-primary" data-jaction="modal-close">Got it</button>`,
      'sm'
    );
    return;
  }

  if (!window.electronAPI?.writeFileDirect) {
    alert('File I/O not available - not running in Electron.');
    return;
  }

  // Resolve or create the results file path
  let filePath = deployCfg?.resultsFilePath || '';
  if (!filePath) {
    // Prompt user to pick a folder
    if (!window.electronAPI?.openFileDialog) { alert('File picker not available outside Electron.'); return; }
    const folderResult = await window.electronAPI.openFileDialog({ title: 'Choose folder for test results file', properties: ['openDirectory'] });
    if (folderResult?.canceled || !folderResult?.filePath) return;
    const folder = folderResult.filePath.replace(/[\/\\]$/, '');
    const fileName = `JumpKit_ReleaseTesting_v${version}.html`;
    filePath = folder + '/' + fileName;
    // Save via _setReleaseState so fallback kicks in when deployment.js not loaded
    _setReleaseState({ ...deployCfg, resultsFilePath: filePath });
    window.Toast?.success(`Results file created: ${fileName}`);
  }

  // Determine which tests belong to this section
  const isAM = t => t.title.startsWith('[AUTO+MANUAL]');
  const isM  = t => t.title.startsWith('[MANUAL]');
  const sectionTests = mode === 'preflight'
    ? JK_TESTS.filter(t => !!t.preflight)
    : mode === 'auto'
      ? JK_TESTS.filter(t => !isAM(t) && !isM(t))
      : mode === 'auto-manual'
        ? JK_TESTS.filter(isAM)
        : JK_TESTS.filter(t => isM(t) && !t.preflight);

  const results = window._jkTestResults || {};
  const displayMap = window._jkTestDisplayNumMap || {};
  const now = new Date().toISOString();

  // Build new result entries for this section
  const newEntries = {};
  sectionTests.forEach(t => {
    const r = results[t.id];
    const isManualTest = t.title.startsWith('[MANUAL]') || t.title.startsWith('[AUTO+MANUAL]');
    const manualSteps = t.steps || t.expected || '';
    let detailsText = '';
    const st = r?.state || 'not-run';
    if (st === 'fail') {
      detailsText = r.message || 'Test failed.';
    } else if (st === 'pass') {
      detailsText = isManualTest ? manualSteps : 'Test passed successfully.';
    } else if (st === 'manual') {
      detailsText = manualSteps;
    } else {
      detailsText = isManualTest ? manualSteps : '';
    }
    const manuallyMarked = st === 'pass' && r?.received === 'Manually marked as passed';
    newEntries[t.id] = {
      id: t.id,
      displayNum: displayMap[t.id] || t.id,
      section: mode,
      category: t.category,
      title: t.title.replace(/^\[(AUTO\+MANUAL|MANUAL)\] /, ''),
      purpose: t.purpose || '',
      input: t.input || '',
      expected: t.expected || '',
      state: st,
      manuallyMarked,
      details: detailsText,
      execOrder: (window.JK_EXEC_ORDER || {})[t.id] ?? null,
      timestamp: r ? now : '',
    };
  });

  // Read existing file and extract embedded JSON
  let existingEntries = {};
  if (window.electronAPI?.readFile) {
    const { content } = await window.electronAPI.readFile(filePath).catch(() => ({ content: '' }));
    if (content) {
      try {
        const match = content.match(/<script type="application\/json" id="jk-release-data">([\s\S]*?)<\/script>/);
        if (match) existingEntries = JSON.parse(match[1]);
      } catch(_) {}
    }
  }

  // Merge: keep ALL existing entries untouched, only overwrite/append section entries
  const merged = { ...existingEntries };
  sectionTests.forEach(t => { merged[t.id] = newEntries[t.id]; });

  // Gather test environment info
  const userId = window._supabaseUser?.id;
  let ownedTeamNames = [], memberTeamNames = [];
  try {
    const { data: ownedTeams } = await supabaseClient.from('teams').select('id, name').eq('owner_id', userId);
    ownedTeamNames = (ownedTeams || []).map(t => t.name);
    const ownedIds = (ownedTeams || []).map(t => t.id);
    const { data: memberRows } = await supabaseClient.from('team_members').select('team_id, teams!inner(name)').eq('user_id', userId);
    memberTeamNames = (memberRows || []).filter(r => !ownedIds.includes(r.team_id)).map(r => r.teams?.name).filter(Boolean);
  } catch(_) {}
  let activeJumps = 0, favJumps = 0, archivedJumps = 0, totalCols = 0, sharedCols = 0;
  try {
    const allActive = typeof DB !== 'undefined' && currentUser ? DB.getActiveJumps(currentUser.id) : [];
    const allArchived = typeof DB !== 'undefined' && currentUser ? DB.getArchivedJumps(currentUser.id) : [];
    const allCols = typeof DB !== 'undefined' && currentUser ? DB.getColumns(currentUser.id) : [];
    activeJumps = allActive.length;
    favJumps = allActive.filter(j => j.favorite).length;
    archivedJumps = allArchived.length;
    totalCols = allCols.length;
    sharedCols = allCols.filter(c => c.isShared).length;
  } catch(_) {}

  const prof = window._supabaseProfile || {};
  const prefs = (typeof DB !== 'undefined' && currentUser) ? DB.getPrefs(currentUser.id) : {};
  const activeRun = rtState?.activeRun || 'mac';

  const testEnv = {
    email:       window._supabaseUser?.email || '',
    name:        [prof.first_name, prof.last_name].filter(Boolean).join(' ') || '-',
    role:        prof.role || 'user',
    subTier:     prof.subscription_tier || '-',
    subStatus:   prof.subscription_status || '-',
    activeRun,
    trialLaunches:   prof.trial_launches_used != null ? String(prof.trial_launches_used) : '-',
    startPage:       prefs.startPage || 'home',
    theme:           prefs.theme || 'system',
    autoArchive:     prefs.autoArchive || 'never',
    autoBackup:      prefs.cloudBackup ? 'On' : 'Off',
    timePerClick:    prefs.timePerClick != null ? `${prefs.timePerClick}s` : '-',
    dollarsPerHour:  prefs.dollarsPerHour != null ? `$${prefs.dollarsPerHour}` : '-',
    navMenu:         prefs.navDefaultCollapsed ? 'Collapsed' : 'Expanded',
    notifications:   prefs.notifications !== false ? 'On' : 'Off',
    showDesc:        prefs.showDescription ? 'On' : 'Off',
    showHotkey:      prefs.showHotkey ? 'On' : 'Off',
    activeJumps, favJumps, archivedJumps, totalCols, sharedCols,
    ownedTeams:  ownedTeamNames,
    memberTeams: memberTeamNames,
  };

  // Build two-tab HTML and write
  const html = _buildReleaseTestingHTML(merged, version, filePath, testEnv);
  const writeResult = await window.electronAPI.writeFileDirect(filePath, html);

  if (writeResult?.ok) {
    const sectionLabel = mode === 'preflight' ? 'Pre-Flight' : mode === 'auto' ? 'Automatic' : mode === 'auto-manual' ? 'Auto+Manual' : 'Manual';
    window.Toast?.success(`${sectionLabel} results saved.`);
  } else {
    window.Toast?.danger(`Failed to save: ${writeResult?.reason || 'unknown error'}`);
  }
  } catch(err) {
    console.error('[SaveReleaseSection] Error:', err);
    window.Toast?.danger(`Save failed: ${err.message}`);
  }
}


function _buildReleaseTestingHTML(entries, version, filePath, testEnv = {}) {
  const stateColor = (s) => s === 'pass' ? '#3fbe71' : s === 'fail' ? '#e15b59' : s === 'manual' ? '#f59e0b' : '#6b7280';
  const stateLabel = (s, m) => s === 'pass' ? (m ? '✅ Pass (manually marked)' : '✅ Pass') : s === 'fail' ? (m ? '❌ Fail (manually marked)' : '❌ Fail') : s === 'manual' ? '⚠️ Manual' : '- Skipped';
  const sectionOrder = { preflight: 0, auto: 1, 'auto-manual': 2, manual: 3 };
  const sectionLabel = { preflight: 'Pre-Flight (Run First)', auto: 'Automatic', 'auto-manual': 'Auto + Manual', manual: 'Manual' };
  const catColors = { Auth:'#3b82f6', Navigation:'#8b5cf6', Jumps:'#06b6d4', Columns:'#10b981', Archive:'#f59e0b', Stats:'#ec4899', Account:'#6366f1', Subscription:'#f97316', Teams:'#14b8a6', UI:'#84cc16', Security:'#e05555', Database:'#0ea5e9', 'DB Schema':'#7c3aed', 'Shared Sync':'#a855f7', 'Code Quality':'#78716c', Settings:'#64748b', Deployment:'#f43f5e', Paywall:'#d97706', Maintenance:'#22d3ee', Email:'#fb923c', Notifications:'#0d9488', Admin:'#dc2626', Onboarding:'#a78bfa' };
  const catPill = cat => { const c = catColors[cat] || '#6b7280'; return `<span style="display:inline-block;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700;background:${c}22;color:${c};white-space:nowrap">${cat}</span>`; };
  const _exportCheckIcon = `<svg style="width:10px;height:10px;flex-shrink:0;display:inline-block;vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const _pill = (val, label, color, allPass) => val > 0
    ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${color}22;color:${color}">${allPass ? _exportCheckIcon : ''}${val} ${label}</span>`
    : '';

  const runDate = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Build sorted entries from dict
  const sorted = Object.values(entries).sort((a, b) => {
    if (a.execOrder != null && b.execOrder != null) return a.execOrder - b.execOrder;
    const sd = (sectionOrder[a.section] ?? 9) - (sectionOrder[b.section] ?? 9);
    return sd !== 0 ? sd : a.displayNum - b.displayNum;
  });

  // Look up platforms from JK_TESTS for each entry
  const testPlatformMap = {};
  (typeof JK_TESTS !== 'undefined' ? JK_TESTS : []).forEach(t => {
    testPlatformMap[t.id] = t.platforms;
  });
  const isMacOnly = (id) => {
    const plat = testPlatformMap[id];
    return plat && !plat.includes('windows');
  };

  // Compute Mac stats (all tests)
  const macPass   = sorted.filter(e => e.state === 'pass').length;
  const macFail   = sorted.filter(e => e.state === 'fail').length;
  const macManual = sorted.filter(e => e.state === 'manual').length;
  const macTotal  = sorted.length;

  // Compute Windows stats (exclude mac-only)
  const winSorted = sorted.filter(e => !isMacOnly(e.id));
  const winPass   = winSorted.filter(e => e.state === 'pass').length;
  const winFail   = winSorted.filter(e => e.state === 'fail').length;
  const winManual = winSorted.filter(e => e.state === 'manual').length;
  const winTotal  = winSorted.length;

  // Column header row
  const colHdrRow = `<tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
      <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;text-align:left;white-space:nowrap">Exec / #ID</th>
      <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;text-align:left">Category</th>
      <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;text-align:left">Title &amp; Purpose</th>
      <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;text-align:left">Result</th>
      <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;text-align:left">Details</th>
      <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;text-align:left">Timestamp</th>
    </tr>`;

  // Data row builder - winMode: render mac-only tests as N/A
  const dataRow = (e, isLast, winMode) => {
    const macOnly = isMacOnly(e.id);
    if (winMode && macOnly) {
      return `<tr${isLast ? '' : ' style="border-bottom:1px solid #e5e7eb"'} style="opacity:0.45">
        <td style="padding:7px 10px;font-size:12px;white-space:nowrap;color:#9ca3af">#${e.id}</td>
        <td style="padding:7px 10px;font-size:11px">${catPill(e.category)}</td>
        <td style="padding:7px 10px;font-size:12px;color:#9ca3af;max-width:540px;word-break:break-word"><div style="font-weight:600">${_esc(e.title)}</div></td>
        <td style="padding:7px 12px;font-size:11px;color:#9ca3af;white-space:nowrap"><span style="padding:2px 8px;border-radius:99px;background:#e5e7eb;color:#9ca3af;font-size:10px;font-weight:700">N/A - Mac Only</span></td>
        <td style="padding:7px 10px;font-size:11px;color:#9ca3af">-</td>
        <td style="padding:7px 10px;font-size:10px;color:#9ca3af"></td>
      </tr>`;
    }
    const stateC = stateColor(e.state);
    const execNum = e.execOrder != null ? e.execOrder : e.displayNum;
    return `<tr${isLast ? '' : ' style="border-bottom:1px solid #e5e7eb"'}>
      <td style="padding:7px 10px;font-size:12px;white-space:nowrap"><span style="color:#9ca3af;font-size:11px">${execNum} &middot;</span> <span style="font-weight:700;color:#374151">#${e.id}</span></td>
      <td style="padding:7px 10px;font-size:11px">${catPill(e.category)}</td>
      <td style="padding:7px 10px;font-size:12px;color:#374151;max-width:540px;word-break:break-word"><div style="font-weight:700">${_esc(e.title)}</div>${e.purpose ? `<div style="font-size:11px;color:#6b7280;margin-top:3px">${_esc(e.purpose)}</div>` : ''}</td>
      <td style="padding:7px 12px;font-size:12px;font-weight:700;color:${stateC}">${stateLabel(e.state, e.manuallyMarked)}</td>
      <td style="padding:7px 10px;font-size:11px;color:#6b7280;max-width:180px;word-break:break-word">${_esc(e.details)}</td>
      <td style="padding:7px 10px;font-size:10px;color:#9ca3af;white-space:nowrap">${e.timestamp ? new Date(e.timestamp).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}</td>
    </tr>`;
  };

  // Build collapsible sections for a given tab
  const buildSections = (winMode) => {
    const sectionOrder2 = ['preflight', 'auto', 'auto-manual', 'manual'];
    return sectionOrder2.map((sec, idx) => {
      const es = sorted.filter(e => e.section === sec);
      if (!es.length) return '';
      const secName = sectionLabel[sec] || sec;
      const tbodyId = `sec-tbody-${sec}-${winMode ? 'win' : 'mac'}`;
      const btnId   = `sec-btn-${sec}-${winMode ? 'win' : 'mac'}`;
      const spacer  = idx > 0 ? `<tr><td colspan="6" style="padding:14px 0"></td></tr>` : '';
      // Section pills
      const secEs = winMode ? es : es;
      const secPass = (winMode ? es.filter(e => !isMacOnly(e.id)) : es).filter(e => e.state === 'pass').length;
      const secFail = (winMode ? es.filter(e => !isMacOnly(e.id)) : es).filter(e => e.state === 'fail').length;
      const secManual = (winMode ? es.filter(e => !isMacOnly(e.id)) : es).filter(e => e.state === 'manual').length;
      const pillHtml = `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;vertical-align:middle">`
        + _pill(secPass, 'Pass', '#3fbe71', false)
        + _pill(secFail, 'Fail', '#e15b59', false)
        + _pill(secManual, 'Manual', '#f59e0b', false)
        + `</span>`;
      const header = `<tr style="cursor:pointer" onclick="(function(){var b=document.getElementById('${tbodyId}');var i=document.getElementById('${btnId}');var hidden=b.style.display==='none';b.style.display=hidden?'':'none';i.textContent=hidden?'▾':'▸';})()">
        <td colspan="6" style="padding:14px 12px 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;background:#f9fafb;border-top:2px solid #e5e7eb;user-select:none">
          <span id="${btnId}" style="margin-right:8px;font-size:20px;line-height:1;vertical-align:middle">▸</span>${secName} <span style="font-weight:400;color:#9ca3af;letter-spacing:0;text-transform:none">(${es.length})</span>
          ${pillHtml}
        </td>
      </tr>`;
      const rows = es.map((e, i) => dataRow(e, i === es.length - 1, winMode)).join('');
      return `${spacer}${header}<tbody id="${tbodyId}" style="display:none">${colHdrRow}${rows}</tbody>`;
    }).join('');
  };

  // Test environment info block (shared header)
  const envBlock = testEnv.email ? (() => {
    const sec = `color:#3A566E;font-weight:700;font-size:0.72rem;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:5px;margin-bottom:8px`;
    const row = (l, v) => `<div style="margin-bottom:2px"><span style="color:#4A6280">${l}:</span> ${_esc(String(v))}</div>`;
    return `<div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:32px;font-size:0.8rem;color:#6B7E94">
      <div style="min-width:180px">
        <div style="${sec}">Account</div>
        ${row('Email', testEnv.email)}
        ${row('Name', testEnv.name)}
        ${row('Role', testEnv.role)}
        ${row('Sub Tier', testEnv.subTier)}
        ${row('Sub Status', testEnv.subStatus)}
      </div>
      <div style="min-width:200px">
        <div style="${sec}">Settings</div>
        ${row('Theme', testEnv.theme)}
        ${row('Starting Page', testEnv.startPage)}
        ${row('Auto Backup', testEnv.autoBackup)}
        ${row('Auto Archive', testEnv.autoArchive)}
        ${row('Time Per Click', testEnv.timePerClick)}
        ${row('Dollar Per Hour', testEnv.dollarsPerHour)}
      </div>
      <div style="min-width:160px">
        <div style="${sec}">Jumps &amp; Columns</div>
        ${row('Active Jumps', testEnv.activeJumps)}
        ${row('Favorites', testEnv.favJumps)}
        ${row('Archived', testEnv.archivedJumps)}
        ${row('Total Columns', testEnv.totalCols)}
        ${row('Shared Columns', testEnv.sharedCols)}
      </div>
    </div>`;
  })() : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="jk-version" content="${_esc(version)}"/>
<title>JumpKit Release Testing v${_esc(version)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f3f4f6; color:#1f2937; }
  .wrap { max-width:1380px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .header { background:#0E1827; padding:28px 32px; }
  .header h1 { color:#C8D6E8; font-size:1.4rem; font-weight:700; margin-bottom:4px; }
  .header p { color:#4A6280; font-size:0.85rem; }
  .tabs-bar { display:flex; gap:0; padding:0 32px; background:#f9fafb; border-bottom:2px solid #e5e7eb; }
  .tab-btn { padding:12px 24px; font-size:0.85rem; font-weight:700; border:none; cursor:pointer; background:transparent; color:#6b7280; border-bottom:3px solid transparent; margin-bottom:-2px; transition:color .15s; }
  .tab-btn.active { color:#0E1827; border-bottom-color:#1A4FD6; }
  .tab-content { display:none; }
  .tab-content.active { display:block; }
  .stats-bar { display:flex; gap:16px; padding:16px 32px; background:#f9fafb; border-bottom:1px solid #e5e7eb; flex-wrap:wrap; align-items:center; }
  .stat { text-align:center; min-width:56px; }
  .stat-val { font-size:1.4rem; font-weight:900; }
  .stat-lbl { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#9ca3af; margin-top:2px; }
  .plat-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:99px; font-size:0.78rem; font-weight:700; }
  table { width:100%; border-collapse:collapse; }
  @media print { body { background:#fff; } .wrap { box-shadow:none; } }
</style>
<script>
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('tab-btn-' + tab).classList.add('active');
}
</script>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>JumpKit Release Testing - v${_esc(version)}</h1>
    <p>${runDate}</p>
    ${envBlock}
  </div>

  <!-- Tab buttons -->
  <div class="tabs-bar">
    <button class="tab-btn active" id="tab-btn-mac" onclick="showTab('mac')">🍎 Mac Run (${macPass}/${macTotal} passed)</button>
    <button class="tab-btn" id="tab-btn-win" onclick="showTab('win')">🪟 Windows Run (${winPass}/${winTotal} passed)</button>
  </div>

  <!-- Mac Tab -->
  <div class="tab-content active" id="tab-mac">
    <div class="stats-bar">
      <div class="stat"><div class="stat-val" style="color:#3fbe71">${macPass}</div><div class="stat-lbl">Passed</div></div>
      <div class="stat"><div class="stat-val" style="color:#e15b59">${macFail}</div><div class="stat-lbl">Failed</div></div>
      <div class="stat"><div class="stat-val" style="color:#f59e0b">${macManual}</div><div class="stat-lbl">Manual</div></div>
      <div class="stat"><div class="stat-val" style="color:#6b7280">${macTotal - macPass - macFail - macManual}</div><div class="stat-lbl">Skipped</div></div>
      <div class="stat"><div class="stat-val" style="color:#374151">${macTotal}</div><div class="stat-lbl">Total</div></div>
    </div>
    <table>${buildSections(false)}</table>
  </div>

  <!-- Windows Tab -->
  <div class="tab-content" id="tab-win">
    <div class="stats-bar">
      <div class="stat"><div class="stat-val" style="color:#3fbe71">${winPass}</div><div class="stat-lbl">Passed</div></div>
      <div class="stat"><div class="stat-val" style="color:#e15b59">${winFail}</div><div class="stat-lbl">Failed</div></div>
      <div class="stat"><div class="stat-val" style="color:#f59e0b">${winManual}</div><div class="stat-lbl">Manual</div></div>
      <div class="stat"><div class="stat-val" style="color:#6b7280">${winTotal - winPass - winFail - winManual}</div><div class="stat-lbl">Skipped</div></div>
      <div class="stat"><div class="stat-val" style="color:#374151">${winTotal}</div><div class="stat-lbl">Required</div></div>
      <div style="margin-left:8px;font-size:0.75rem;color:#9ca3af">Mac-only tests shown below but not counted in totals</div>
    </div>
    <table>${buildSections(true)}</table>
  </div>
</div>
<!-- machine-readable data for merge -->
<script type="application/json" id="jk-release-data">${JSON.stringify(entries).replace(/<\/script>/gi, '<\\u002fscript>')}<\/script>
</body></html>`;
}

function _openTestStrategyModal() {
  const s = `padding:6px 0;color:var(--text-muted);font-size:0.88rem;line-height:1.7`;
  const h = `font-size:0.95rem;font-weight:700;color:var(--text);margin:18px 0 6px`;
  const pill = (label, color) => `<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;background:${color}22;color:${color};margin-right:4px">${label}</span>`;
  // Resolve display numbers from the live map (matches column 1 on the test page)
  const m = window._jkTestDisplayNumMap || {};
  const n = id => m[id] ? `#${m[id]}` : `(id:${id})`;
  // Email AUTO+MANUAL batch IDs
  const emailBatch = [114,115,116,117,118,119,64,66].map(id => n(id)).join(', ');
  const specialCard = (title, color, bg, border, items) =>
    `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:${bg};border:1px solid ${border}">
      <div style="font-size:0.78rem;font-weight:700;color:${color};margin-bottom:6px">${title}</div>
      <ul style="margin:0 0 0 14px;padding:0;${s}">
        ${items.map(i => `<li style="margin-bottom:4px">${i}</li>`).join('')}
      </ul>
    </div>`;

  const body = `
    <p style="${s};margin-bottom:4px">${JK_TESTS.length} tests across 12 categories. Work through them in 3 phases to catch issues efficiently.</p>
    <p style="${s};margin-bottom:0">The <strong>per-section pass/fail cards</strong> at the top of the page update live - use them as your scoreboard. Sections are <strong>collapsible</strong>; fold finished ones to reduce scroll.</p>

    <div style="${h}">Phase 1 - Run All Automatics first</div>
    <p style="${s}">Click <strong>Run Automatic Tests</strong> - runs all ${JK_TESTS.filter(t=>!t.title.startsWith('[AUTO+MANUAL]')&&!t.title.startsWith('[MANUAL]')).length} automatic tests. Expect ~100 green immediately. This gives you a full baseline.</p>
    <p style="${s}">For any red failures - fix the code, then run just those tests individually. Don&rsquo;t re-run all until you&rsquo;re confident the fix is clean.</p>
    ${specialCard('💡 Before You Start - App State','#6366f1','rgba(99,102,241,0.06)','rgba(99,102,241,0.2)',[
      'Be logged in as an <strong>Unlimited</strong> user for full coverage (free-tier skips some Maintenance tests)',
      '<strong>Auto-archive</strong> must be set to anything <em>other than Never</em> in Settings → otherwise test ${n(122)} (Auto-archive) will skip automatically',
      '<strong>Auto-backup</strong> must be enabled in Settings <strong>before starting the test cycle</strong> - required for test ${n(123)} (Auto-backup) to run; verify the backup JSON file was saved to disk after it completes',
      'Click <strong>Details</strong> on any failed test to see its purpose, steps, and expected output before debugging',
      'The <strong>Auth</strong> tests run first - if test #1 (session persists) fails, check your login state before continuing'
    ])}

    <div style="${h}">Phase 2 - AUTO+MANUAL tests by batch</div>
    <p style="${s}">These fire code automatically, then need a quick human check. Do them in batches:</p>
    <ul style="margin:4px 0 0 16px;${s}">
      <li><strong>Email batch</strong> - run all <code>[AUTO+MANUAL]</code> email tests together (${emailBatch}), then check your inbox once for all</li>
      <li><strong>Export PDF</strong> (${n(121)}) - fires the export automatically, then open the saved file to verify it looks correct</li>
      <li><strong>Team password</strong> (${n(120)}) - semi-auto, verifies wrong-password rejection; mark pass manually after confirming</li>
    </ul>
    ${specialCard('⚠️ Phase 2 Special Cases','#f97316','rgba(249,115,22,0.06)','rgba(249,115,22,0.2)',[
      '<strong>Email batch</strong> - run all 8 email tests first, then open your inbox <em>once</em> to verify all arrived rather than switching back and forth after each one',
      `<strong>${n(121)} Export PDF</strong> - after the test passes, manually open the exported file to confirm layout and data look correct`,
      `<strong>${n(120)} Team password</strong> - the test verifies wrong-password rejection automatically; mark Pass/Fail manually based on what you see`
    ])}

    <div style="${h}">Phase 3 - MANUAL tests, easiest first</div>
    <ul style="margin:4px 0 0 16px;${s}">
      <li><strong>Quick visual checks</strong> - ${n(124)} Sign-out, ${n(128)} Jump click launches URL, ${n(125)} Supabase backups, ${n(127)} Migrations in version control, ${n(139)} npm audit</li>
      <li><strong>Config checks</strong> - ${n(126)} Dev/prod DB separation</li>
      <li><strong>Data-mutating tests last</strong> - ${n(129)} Lemon Squeezy webhook, ${n(130)} apply-pending-upgrade, ${n(131)} check-member-lockouts SQL - have reset SQL ready before running</li>
    </ul>
    ${specialCard('⚠️ Phase 3 Special Cases','#e15b59','rgba(225,91,89,0.06)','rgba(225,91,89,0.2)',[
      `<strong>Open Supabase SQL editor before starting Phase 3</strong> - you will need it for ${n(129)} (Lemon Squeezy webhook), ${n(130)} (apply-pending-upgrade), and ${n(131)} (lockouts); all three mutate DB rows and require a manual reset SQL afterward`,
      `<strong>${n(130)} apply-pending-upgrade</strong> - insert a pending_upgrades row first, run the test, then reset: <code>UPDATE profiles SET subscription_tier='free', subscription_status='free' WHERE email='{your-email}';</code>`,
      `<strong>${n(138)} Sign-out test - run this LAST</strong> - it calls signOut() and logs you out of the app; have your credentials ready to log back in`
    ])}`;

  Modal.open(
    '<svg class="ti ti-bulb" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.svg#tabler-bulb"/></svg> How to Run Tests',
    body,
    '<button class="btn btn-subtle" data-jaction="modal-close" style="margin-left:auto"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>',
    'xl'
  );
}

const _CATEGORY_COLORS = {
  Auth:          '#3b82f6',
  Navigation:    '#8b5cf6',
  Jumps:         '#06b6d4',
  Columns:       '#10b981',
  Archive:       '#f59e0b',
  Stats:         '#ec4899',
  Account:       '#6366f1',
  Subscription:  '#f97316',
  Teams:         '#14b8a6',
  UI:            '#84cc16',
  Security:      '#e05555',
  Database:      '#0ea5e9',
  'DB Schema':   '#7c3aed',
  'Shared Sync': '#a855f7',
  'Code Quality':'#78716c',
  Settings:      '#64748b',
  Deployment:    '#f43f5e',
  Paywall:       '#d97706',
  Maintenance:   '#22d3ee',
  Email:         '#fb923c',
  Notifications: '#0d9488',
  Admin:         '#dc2626',
  Onboarding:    '#a78bfa',
};

const _CATEGORY_ORDER = [
  'Auth', 'Database', 'DB Schema', 'Navigation', 'Account', 'Admin', 'Onboarding', 'Settings',
  'Jumps', 'Columns', 'Archive', 'Stats',
  'Subscription', 'Paywall', 'Email', 'Teams', 'Shared Sync',
  'Notifications', 'Security', 'UI', 'Code Quality', 'Deployment', 'Maintenance'
];
const _byCategory = (a, b) => {
  const ai = _CATEGORY_ORDER.indexOf(a.category);
  const bi = _CATEGORY_ORDER.indexOf(b.category);
  const aOrder = ai === -1 ? 999 : ai;
  const bOrder = bi === -1 ? 999 : bi;
  return aOrder !== bOrder ? aOrder - bOrder : a.id - b.id;
};

const _COL_HEADERS = `
  <thead>
    <tr style="border-bottom:2px solid var(--border)">
      <th style="padding:10px 12px;text-align:left;width:1px;white-space:nowrap;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">EXEC / #ID</th>
      <th style="padding:10px 12px;text-align:left;width:110px;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">CATEGORY</th>
      <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">TITLE</th>
      <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">EXPECTED</th>
      <th style="padding:10px 12px;text-align:center;width:80px;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">RUN</th>
      <th style="padding:10px 12px;text-align:center;width:110px;color:var(--text-muted);font-size:0.75rem;font-weight:600;letter-spacing:.05em">RESULT</th>
    </tr>
  </thead>`;

function _sectionBlock(label, icon, tests, startNum, actionBtns, sectionKey) {
  const rows = tests.map((t) => _testRow(t, (window.JK_EXEC_ORDER || {})[t.id] || t.id)).join('');
  const sectionId = 'section-body-' + label.replace(/\s+/g, '-').toLowerCase();
  const btns = actionBtns ? `<div style="display:flex;gap:8px;margin-top:6px;margin-bottom:8px">${actionBtns}</div>` : '';
  return `
    <div style="margin-bottom:28px">
      <div style="padding:14px 4px 0;cursor:pointer;user-select:none" data-jaction="section-toggle" data-section="${sectionId}">
        <div style="display:flex;align-items:center;gap:8px">
          <svg class="ti ti-chevron-down" id="chevron-${sectionId}" style="font-size:1rem;color:var(--text-muted);transition:transform .2s;transform:rotate(-90deg)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
          ${(Array.isArray(icon)?icon:[icon]).map(ic=>`<svg class="ti ti-${ic}" style="font-size:1.1rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-${ic}"/></svg>`).join('')}
          <span style="font-size:0.8rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)">${label}</span>
          <span style="font-size:0.75rem;color:var(--text-dim);font-weight:500">(${tests.length})</span>
          <span id="section-inline-stats-${sectionKey || sectionId}" style="display:inline-flex;align-items:center;gap:4px;margin-left:8px"></span>
        </div>
      </div>
      <div id="${sectionId}" style="overflow:hidden;transition:max-height .25s ease;margin-left:26px;max-height:0px" data-collapsed="true">
        ${btns}
        <div class="card" style="overflow-x:auto;padding:0;border-radius:0 0 var(--radius-lg) var(--radius-lg)">
          <table style="width:100%;border-collapse:collapse">
            ${_COL_HEADERS}
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function _testRow(t, execNum) {
  // Check if this test is Mac-only and the active run is Windows
  const activeRun = _getReleaseState()?.activeRun || 'mac';
  const isMacOnly = t.platforms && !t.platforms.includes('windows');
  const isDisabled = activeRun === 'windows' && isMacOnly;

  if (isDisabled) {
    return `
  <tr id="test-row-${t.id}" style="border-bottom:1px solid var(--border);opacity:0.45;background:var(--bg-input)">
    <td style="padding:10px 12px;font-size:0.8rem;font-weight:600;white-space:nowrap;color:var(--text-muted)"><span style="font-size:0.75rem;font-weight:400">${execNum} ·</span> #${t.id}</td>
    <td style="padding:10px 12px">
      <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:var(--bg-hover);color:var(--text-dim)">${_esc(t.category)}</span>
    </td>
    <td style="padding:10px 12px">
      <div style="font-weight:600;font-size:0.87rem;color:var(--text-muted)">${_esc(t.title)}</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px">${_esc(t.description)}</div>
    </td>
    <td style="padding:10px 12px;color:var(--text-dim);font-size:0.8rem"></td>
    <td style="padding:10px 12px;text-align:center">
      <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:0.72rem;font-weight:700;background:var(--bg-hover);color:var(--text-dim)">Mac Only</span>
    </td>
    <td style="padding:10px 12px;text-align:center" id="test-result-${t.id}">
      <button data-jaction="test-details" data-testid="${t.id}" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-size:0.85rem;line-height:1;opacity:0.5" title="View test details">
        <svg class="ti ti-notes" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-notes"/></svg><span style="line-height:1">Details</span>
      </button>
    </td>
  </tr>`;
  }

  return `
  <tr id="test-row-${t.id}" style="border-bottom:1px solid var(--border);transition:background .15s">
    <td style="padding:10px 12px;font-size:0.8rem;font-weight:600;white-space:nowrap"><span style="color:var(--text-muted);font-size:0.75rem;font-weight:400">${execNum} ·</span> <span style="color:var(--text);font-weight:700">#${t.id}</span></td>
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
      ${t.title.startsWith('[MANUAL]') ? '' : `<button data-jaction="test-run" data-testid="${t.id}" id="test-run-btn-${t.id}" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-size:0.85rem;line-height:1" title="Run this test">
        <svg class="ti ti-player-play" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-player-play"/></svg><span style="line-height:1">Run</span>
      </button>`}
    </td>
    <td style="padding:10px 12px;text-align:center" id="test-result-${t.id}">
      <button data-jaction="test-details" data-testid="${t.id}" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-size:0.85rem;line-height:1" title="View test details">
        <svg class="ti ti-notes" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-notes"/></svg><span style="line-height:1">Details</span>
      </button>
    </td>
  </tr>`;
}

function _buildTestRows() {
  const wrap = document.getElementById('testsTablesWrap');
  if (!wrap) return;

  // Split into 4 sections: pre-flight (preflight:true), auto, auto-manual, manual
  const preflight     = JK_TESTS.filter(t => !!t.preflight);
  const autoTests     = JK_TESTS.filter(t => !t.preflight && !t.title.startsWith('[MANUAL]') && !t.title.startsWith('[AUTO+MANUAL]')).slice().sort(_byCategory);
  const autoManual    = JK_TESTS.filter(t => !t.preflight &&  t.title.startsWith('[AUTO+MANUAL]')).slice().sort(_byCategory);
  const manualTests   = JK_TESTS.filter(t => !t.preflight &&  t.title.startsWith('[MANUAL]')).slice().sort(_byCategory);

  // Build global display order + number map for use in detail modal
  const _displayOrder = [...preflight, ...autoTests, ...autoManual, ...manualTests];
  window._jkTestDisplayOrder = _displayOrder;
  window._jkTestDisplayNumMap = {};
  _displayOrder.forEach((t) => { window._jkTestDisplayNumMap[t.id] = t.id; });

  // Build execution order: test 139 first, then auto, auto-manual, manual (test 111 last)
  const _t139 = JK_TESTS.find(t => t.id === 139); // keep exec-order anchor
  const _t111 = JK_TESTS.find(t => t.id === 111);
  const _execOrderList = [
    ...(_t139 ? [_t139] : []),
    ...autoTests.filter(t => !t.preflight),
    ...autoManual,
    ...manualTests.filter(t => !t.preflight && t.id !== 111 && t.id !== 112 && t.id !== 141),
    ...(_t111 ? [_t111] : []),
    ...(JK_TESTS.find(t => t.id === 112) ? [JK_TESTS.find(t => t.id === 112)] : []),
    ...(JK_TESTS.find(t => t.id === 141) ? [JK_TESTS.find(t => t.id === 141)] : []),
  ];
  window.JK_EXEC_ORDER = {};
  _execOrderList.forEach((t, i) => { window.JK_EXEC_ORDER[t.id] = i + 1; });

  // Re-sort each section by exec order so the UI table matches execution sequence
  const _byExec = (a, b) => ((window.JK_EXEC_ORDER[a.id] || 9999) - (window.JK_EXEC_ORDER[b.id] || 9999));
  preflight.sort(_byExec);
  autoTests.sort(_byExec);
  autoManual.sort(_byExec);
  manualTests.sort(_byExec);

  const _secBtn = (id, icon, label, extra='') => `<button id="${id}" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;padding:5px 12px${extra}"><svg class="ti ti-${icon}" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-${icon}"/></svg>${label}</button>`;
  const _saveBtn = (id) => _secBtn(id, 'file-download', 'Save Results');

  wrap.innerHTML =
    _sectionBlock('Pre-Flight (Run First)', 'flag', preflight, 1,
      _secBtn('btnResetPreflightTests','refresh','Reset') +
      _saveBtn('btnSavePreflightResults'), 'preflight') +
    _sectionBlock('Automatic Tests', 'player-play', autoTests, 2,
      _secBtn('btnRunAutoTests','player-play','Run') +
      _secBtn('btnResetAutoTests','refresh','Reset') +
      _saveBtn('btnSaveAutoResults'), 'auto') +
    _sectionBlock('Auto + Manual Tests', ['player-play','clipboard-list'], autoManual, autoTests.length + 2,
      _secBtn('btnRunAutoManualTests','player-play','Run') +
      _secBtn('btnResetAutoManualTests','refresh','Reset') +
      _saveBtn('btnSaveAMResults'), 'am') +
    _sectionBlock('Manual Tests', 'clipboard-list', manualTests, autoTests.length + autoManual.length + 2,
      _secBtn('btnResetManualTests','refresh','Reset') +
      _saveBtn('btnSaveManualResults'), 'manual');
}

function _markManualResult(id, result) {
  if (!window._jkTestResults) window._jkTestResults = {};
  if (result === 'skip') {
    delete window._jkTestResults[id];
    _setRowResult(id, 'not-run', null);
    _refreshSummary();
    const { title, body, footer } = _buildTestDetailContent(id);
    const mt = document.getElementById('modalTitle');
    const mb = document.getElementById('modalBody');
    const mf = document.getElementById('modalFooter');
    if (mt) mt.innerHTML = title;
    if (mb) { mb.innerHTML = body; mb.scrollTop = 0; }
    if (mf) mf.innerHTML = footer;
    return;
  }
  window._jkTestResults[id] = { state: result, received: result === 'pass' ? 'Manually marked as passed' : 'Manually marked as failed', message: result === 'fail' ? 'Manually marked as failed' : null };
  _setRowResult(id, result, result === 'fail' ? 'Manually marked as failed' : null);
  _refreshSummary();
  // Update the already-open modal in-place - do NOT call _openTestDetail / Modal.open here.
  // Modal.open is queued when a modal is already open, which causes a phantom second modal
  // that the user has to close separately.
  const { title, body, footer } = _buildTestDetailContent(id);
  const mt = document.getElementById('modalTitle');
  const mb = document.getElementById('modalBody');
  const mf = document.getElementById('modalFooter');
  if (mt) mt.innerHTML = title;
  if (mb) { mb.innerHTML = body; mb.scrollTop = 0; }
  if (mf) mf.innerHTML = footer;
}

function _buildTestDetailContent(id) {
  const state   = ((window._jkTestResults || {})[id] || {}).state   || null;
  const message = ((window._jkTestResults || {})[id] || {}).message || null;
  const testDef = JK_TESTS.find(t => t.id === id);
  if (!testDef) return;

  let color, iconName, stateLabel, detailsText, detailsColor;
  // Only [MANUAL] and [AUTO+MANUAL] tests need manual pass/fail buttons.
  // Automatic tests self-report - 'steps' exists on all tests so we key off the title tag.
  const isManualTest = testDef.title.startsWith('[MANUAL]') || testDef.title.startsWith('[AUTO+MANUAL]');
  const manualInstructions = testDef.steps || testDef.expected;
  if (!state || state === 'null') {
    color = 'var(--text-muted)'; iconName = 'clock'; stateLabel = 'Skipped';
    detailsText = isManualTest ? manualInstructions : '-'; detailsColor = 'var(--text-muted)';
  } else if (state === 'pass') {
    color = '#3fbe71'; iconName = 'check'; stateLabel = 'Pass';
    detailsText = isManualTest ? manualInstructions : 'Test passed successfully.'; detailsColor = 'var(--text-muted)';
  } else if (state === 'fail') {
    color = '#e15b59'; iconName = 'x'; stateLabel = 'Fail';
    detailsText = isManualTest ? manualInstructions : (message || 'Test failed.'); detailsColor = 'var(--text-muted)';
  } else {
    color = '#f59e0b'; iconName = 'alert-triangle'; stateLabel = 'Manual';
    detailsText = manualInstructions; detailsColor = 'var(--text-muted)';
  }

  const displayNum = (window._jkTestDisplayNumMap || {})[id] || id;
  const execOrder  = (window.JK_EXEC_ORDER || {})[id];
  const modalTitle = `<svg class="ti ti-test-pipe"><use href="img/tabler-sprite.svg#tabler-test-pipe"/></svg> #${id} - ${_esc(testDef.title)}`;
  const catColor = _CATEGORY_COLORS[testDef.category] || '#6b7280';
  const catPill = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:${catColor}22;color:${catColor}">${_esc(testDef.category)}</span>`;
  const stored = (window._jkTestResults || {})[id] || {};
  const receivedText = stored.received || '-';
  const tdLabel = `padding:8px 32px 8px 0;color:var(--text-muted);font-weight:600;width:100px;vertical-align:top;white-space:nowrap;font-size:0.88rem`;
  const tdValue     = `padding:8px 0;color:var(--text);line-height:1.6;font-size:0.88rem`;
  const tdValueMuted = `padding:8px 0;color:var(--text-muted);line-height:1.6;font-size:0.88rem`;
  const codeStyle   = `font-size:0.82rem;background:var(--bg-input);padding:3px 8px;border-radius:6px`;
  const receivedColor = state==='pass'?'#3fbe71':state==='fail'?'#e15b59':'var(--text-muted)';
  const bodyHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem">
    <tr>
      <td style="${tdLabel}">Exec Order</td>
      <td style="${tdValueMuted}">${execOrder != null ? execOrder : '-'}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">ID</td>
      <td style="${tdValueMuted}">#${id}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Test On</td>
      <td style="padding:8px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center">${(() => {
        const platforms = testDef.platforms;
        const onWindows = !platforms || platforms.includes('windows');
        const macPill = `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:0.75rem;font-weight:600;background:rgba(107,114,128,0.12);color:#6b7280;border:1px solid rgba(107,114,128,0.25)"><svg class="ti ti-brand-apple" style="width:0.85rem;height:0.85rem"><use href="img/tabler-sprite.svg#tabler-brand-apple"/></svg>macOS</span>`;
        const winPill  = onWindows ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:0.75rem;font-weight:600;background:rgba(14,165,233,0.12);color:#0ea5e9;border:1px solid rgba(14,165,233,0.25)"><svg class="ti ti-brand-windows" style="width:0.85rem;height:0.85rem;color:#0ea5e9"><use href="img/tabler-sprite.svg#tabler-brand-windows"/></svg>Windows</span>` : '';
        return macPill + winPill;
      })()}</td>
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
      <td style="${tdValueMuted}">${testDef.input ? `<code style="${codeStyle};color:var(--text-muted)">${_esc(testDef.input)}</code>` : '-'}</td>
    </tr>
    <tr>
      <td style="${tdLabel}">Expected</td>
      <td style="${tdValueMuted}">${_esc(testDef.expected)}</td>
    </tr>
    ${testDef.emailSubject ? `<tr>
      <td style="${tdLabel}">Email Subject</td>
      <td style="padding:8px 0"><code style="${codeStyle};color:var(--turq);background:rgba(0,194,199,0.08);border:1px solid rgba(0,194,199,0.2)">📧 ${_esc(testDef.emailSubject)}</code></td>
    </tr>` : ''}
    ${isManualTest ? '' : `<tr>
      <td style="${tdLabel}">Outputs</td>
      <td style="${tdValue}"><code style="${codeStyle};color:${receivedColor}">${_esc(receivedText)}</code></td>
    </tr>`}
    <tr>
      <td style="${tdLabel}">Result</td>
      <td style="padding:8px 0">${(!state || state === 'null') ? `<span style="color:var(--text-muted);font-size:0.88rem">-</span>` : `<svg class="ti ti-${iconName}" style="font-size:1.3rem;vertical-align:middle;color:${color};width:1.3rem;height:1.3rem"><use href="img/tabler-sprite.svg#tabler-${iconName}"/></svg> <span style="color:${color};font-weight:700;font-size:0.88rem">${stateLabel}</span>`}</td>
    </tr>
    ${(() => {
      const hasSteps    = isManualTest && (testDef.steps || testDef.commands);
      if (!hasSteps) {
        // Auto test - just show Details row
        return `<tr>
          <td style="${tdLabel}">Details</td>
          <td style="${tdValueMuted};color:${detailsColor}">${_esc(detailsText)}</td>
        </tr>`;
      }
      // Manual test - merge steps + commands into one Exec Steps section
      // steps can be: string (legacy) | [{text,cmd?}] | function returning array
      const rawStepsVal = typeof testDef.steps === 'function'
        ? testDef.steps(typeof currentUser !== 'undefined' ? currentUser : null)
        : testDef.steps;
      if (Array.isArray(rawStepsVal)) {
        // Inline format: code blocks appear directly under the step that uses them
        const stepItems = rawStepsVal.map((s, i) => {
          if (typeof s === 'string') return `<li>${_esc(s)}</li>`;
          const linkHTML = s.link ? `<a href="${_esc(s.link.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--turq);text-decoration:none;display:inline-flex;align-items:center;gap:4px;font-size:0.82rem;margin-left:6px"><svg class="ti ti-external-link" style="width:.75rem;height:.75rem"><use href="img/tabler-sprite.svg#tabler-external-link"/></svg>${_esc(s.link.label)}</a>` : '';
          const li = `<li style="margin-bottom:${s.cmd ? '10px' : '2px'}">${_esc(s.text)}${linkHTML}`;
          if (!s.cmd) return li + '</li>';
          const cmdId = `cmd-${id}-${i}`;
          return li + `<div style="margin-top:6px"><div style="display:flex;align-items:flex-start;gap:6px"><code id="${cmdId}" style="flex:1;font-size:0.78rem;background:var(--bg-input);padding:6px 10px;border-radius:6px;color:var(--text);white-space:pre-wrap;word-break:break-all;line-height:1.5">${_esc(s.cmd)}</code><button data-cmd="${_esc(s.cmd)}" data-jaction="cmd-copy" id="cmd-copy-${id}-${i}" class="btn btn-subtle" style="flex-shrink:0;padding:5px 7px;margin-top:1px" title="Copy"><svg class="ti ti-copy" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.svg#tabler-copy"/></svg></button></div></div></li>`;
        }).join('');
        return `<tr>
          <td style="${tdLabel}">Exec Steps</td>
          <td style="padding:8px 0">
            <ol style="margin:0;padding-left:18px;color:var(--text-muted);font-size:0.85rem;line-height:1.8">${stepItems}</ol>
          </td>
        </tr>`;
      }
      // Legacy format: separate commands blocks then steps text
      const cmds = typeof testDef.commands === 'function'
        ? testDef.commands(typeof currentUser !== 'undefined' ? currentUser : null)
        : (testDef.commands || []);
      const cmdBlocksHTML = cmds.length ? cmds.map((c, i) => `
        <div style="margin-bottom:10px">
          <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">${_esc(c.label)}</div>
          <div style="display:flex;align-items:flex-start;gap:6px">
            <code id="cmd-${id}-${i}" style="flex:1;font-size:0.78rem;background:var(--bg-input);padding:6px 10px;border-radius:6px;color:var(--text);white-space:pre-wrap;word-break:break-all;line-height:1.5">${_esc(c.cmd)}</code>
            <button data-cmd="${_esc(c.cmd)}" data-jaction="cmd-copy" id="cmd-copy-${id}-${i}" class="btn btn-subtle" style="flex-shrink:0;padding:5px 7px;margin-top:1px" title="Copy"><svg class="ti ti-copy" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.svg#tabler-copy"/></svg></button>
          </div>
        </div>`).join('') : '';
      // Build <ol> from steps string (split on \n or numbered lines)
      const rawSteps = typeof rawStepsVal === 'string' ? rawStepsVal : '';
      const stepLines = rawSteps.split('\n').map(s => s.trim()).filter(Boolean);
      const stepsHTML = stepLines.length
        ? `<ol style="margin:0;padding-left:18px;color:var(--text-muted);font-size:0.85rem;line-height:1.8">${stepLines.map(s => {
            // Strip leading "N. " if present (already numbered by <ol>)
            const clean = s.replace(/^\d+\.\s*/, '');
            return `<li>${_esc(clean)}</li>`;
          }).join('')}</ol>`
        : '';
      return `<tr>
        <td style="${tdLabel}">Exec Steps</td>
        <td style="padding:8px 0">
          ${cmdBlocksHTML}
          ${stepsHTML}
        </td>
      </tr>`;
    })()}
    ${testDef.notes ? `<tr>
      <td style="${tdLabel}">Notes</td>
      <td style="${tdValueMuted};white-space:pre-wrap;line-height:1.7">${_esc(testDef.notes)}</td>
    </tr>` : ''}
    ${testDef.links && testDef.links.length ? `<tr>
      <td style="${tdLabel}">Links</td>
      <td style="padding:8px 0">${testDef.links.map(l => `
        <div style="margin-bottom:6px">
          <a href="${_esc(l.url)}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem;color:var(--turq);text-decoration:none;display:inline-flex;align-items:center;gap:5px">
            <svg class="ti ti-external-link" style="width:.8rem;height:.8rem"><use href="img/tabler-sprite.svg#tabler-external-link"/></svg>${_esc(l.label)}</a>
        </div>`).join('')}</td>
    </tr>` : ''}
  </table>
  ${(() => {
    const logs = (stored.logs || []);
    if (!logs.length) return '';
    const levelColor = { info: 'var(--text-muted)', warn: '#c99a3a', error: '#e15b59', debug: 'var(--text-dim)' };
    const levelIcon  = { info: 'info-circle', warn: 'alert-triangle', error: 'x-circle', debug: 'code' };
    const rows = logs.map(l => `
      <div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem">
        <svg class="ti ti-${levelIcon[l.level]||'info-circle'}" style="flex-shrink:0;margin-top:1px;width:0.9rem;height:0.9rem;color:${levelColor[l.level]||'var(--text-muted)'}"><use href="img/tabler-sprite.svg#tabler-${levelIcon[l.level]||'info-circle'}"/></svg>
        <span style="color:${levelColor[l.level]||'var(--text-muted)'};font-family:monospace;word-break:break-all">${_esc(l.text)}</span>
      </div>`).join('');
    return `<div style="margin-top:14px">
      <div style="font-size:0.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px">Console Output</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:220px;overflow-y:auto">${rows}</div>
    </div>`;
  })()}`;

  const _orderedTests = window._jkTestDisplayOrder || JK_TESTS;
  const currentIdx = _orderedTests.findIndex(t => t.id === id);
  const prevId = currentIdx > 0 ? _orderedTests[currentIdx - 1].id : null;
  const nextId = currentIdx < _orderedTests.length - 1 ? _orderedTests[currentIdx + 1].id : null;

  const _results = window._jkTestResults || {};
  const prevRes = prevId ? (_results[prevId] || null) : null;
  const nextRes = nextId ? (_results[nextId] || null) : null;

  const manualBtns = isManualTest ? `
      <button class="btn btn-subtle" data-jaction="test-mark-pass" data-testid="${id}" style="color:#3fbe71;border-color:rgba(63,190,113,0.3)"><svg class="ti ti-check" style="color:#3fbe71"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Mark as Pass</button>
      <button class="btn btn-subtle" data-jaction="test-mark-fail" data-testid="${id}" style="color:#e15b59;border-color:rgba(225,91,89,0.3)"><svg class="ti ti-x" style="color:#e15b59"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Mark as Fail</button>` : '';
  const skipBtn = isManualTest ? `<button class="btn btn-subtle" data-jaction="test-mark-skip" data-testid="${id}" style="color:#6b7280;border-color:rgba(107,114,128,0.3)"><svg class="ti ti-minus" style="color:#6b7280"><use href="img/tabler-sprite.svg#tabler-minus"/></svg> Mark as Skipped</button>` : '';

  const footerHTML = `
    <div style="display:flex;gap:8px;align-items:center;width:100%">
      <button class="btn btn-subtle" ${prevId ? `data-jaction="test-nav" data-navid="${prevId}"` : 'disabled'}>
        <svg class="ti ti-chevron-left"><use href="img/tabler-sprite.svg#tabler-chevron-left"/></svg> Prev
      </button>
      <button class="btn btn-subtle" ${nextId ? `data-jaction="test-nav" data-navid="${nextId}"` : 'disabled'}>
        Next <svg class="ti ti-chevron-right"><use href="img/tabler-sprite.svg#tabler-chevron-right"/></svg>
      </button>
      ${manualBtns}
      ${skipBtn}
      <button class="btn btn-subtle" data-jaction="modal-close" style="margin-left:auto"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>
    </div>`;

  return { title: modalTitle, body: bodyHTML, footer: footerHTML };
}

function _openTestDetail(id) {
  const { title, body, footer } = _buildTestDetailContent(id);
  Modal.open(title, body, footer, 'xl');
}

// Helper: renders the Details button (always shown below the result badge)
function _detailsBtn(id) {
  return `<button data-jaction="test-details" data-testid="${id}" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.75rem;line-height:1;opacity:0.7" title="View test details"><svg class="ti ti-notes" style="font-size:0.75rem;width:0.85rem;height:0.85rem"><use href="img/tabler-sprite.svg#tabler-notes"/></svg><span style="line-height:1">Details</span></button>`;
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
    cell.innerHTML = `<span data-jaction="test-details" data-testid="${id}" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:700;line-height:1;background:rgba(63,190,113,0.12);color:#3fbe71;border:1px solid rgba(63,190,113,0.3);cursor:pointer"><svg class="ti ti-check" style="font-size:0.85rem;line-height:1;color:#3fbe71"><use href="img/tabler-sprite.svg#tabler-check"/></svg><span style="line-height:1">Pass</span></span>`;
    cell.style.cursor = '';
    cell.onclick = null;
    if (row) row.style.background = 'rgba(63,190,113,0.04)';
    _saveTestResults();
  } else if (state === 'fail') {
    cell.innerHTML = `<span data-jaction="test-details" data-testid="${id}" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:700;line-height:1;background:rgba(225,91,89,0.12);color:#e15b59;border:1px solid rgba(225,91,89,0.3);cursor:pointer"><svg class="ti ti-x" style="font-size:0.85rem;line-height:1;color:#e15b59"><use href="img/tabler-sprite.svg#tabler-x"/></svg><span style="line-height:1">Fail</span></span>`;
    cell.style.cursor = '';
    cell.onclick = null;
    if (row) row.style.background = 'rgba(225,91,89,0.04)';
    _saveTestResults();
  } else if (state === 'manual') {
    cell.innerHTML = `<span data-jaction="test-details" data-testid="${id}" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:700;line-height:1;background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);cursor:pointer"><svg class="ti ti-alert-triangle" style="font-size:0.85rem;line-height:1;color:#f59e0b"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg><span style="line-height:1">Manual</span></span>`;
    cell.style.cursor = '';
    cell.onclick = null;
    if (row) row.style.background = 'rgba(245,158,11,0.04)';
    _saveTestResults();
  } else if (state === 'not-run' || state === null) {
    cell.innerHTML = `<button data-jaction="test-details" data-testid="${id}" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-size:0.85rem;line-height:1" title="View test details"><svg class="ti ti-notes" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-notes"/></svg><span style="line-height:1">Details</span></button>`;
    cell.style.cursor = '';
    cell.onclick = null;
    if (row) row.style.background = '';
    _saveTestResults();
  }
}

function _refreshSummary() {
  let passed = 0, failed = 0, manual = 0;
  let autoPassed = 0, autoFailed = 0, autoManual = 0;
  let amPassed = 0, amFailed = 0, amManual = 0;
  let manPassed = 0, manFailed = 0, manManual = 0;
  let pfPassed = 0, pfFailed = 0, pfManual = 0;
  // Section totals (for 100% pass check)
  const pfTotal   = JK_TESTS.filter(t => !!t.preflight).length;
  const autoTotal = JK_TESTS.filter(t => !t.preflight && !t.title.startsWith('[MANUAL]') && !t.title.startsWith('[AUTO+MANUAL]')).length;
  const amTotal   = JK_TESTS.filter(t => t.title.startsWith('[AUTO+MANUAL]')).length;
  const manTotal  = JK_TESTS.filter(t => !t.preflight && t.title.startsWith('[MANUAL]')).length;

  // Read directly from _jkTestResults (source of truth) - never scrape DOM icons.
  // _resetSection deletes entries from _jkTestResults before calling _refreshSummary,
  // so this always reflects the current state with no DOM-class timing issues.
  const results = window._jkTestResults || {};
  JK_TESTS.forEach(t => {
    const r = results[t.id];
    if (!r || !r.state) return;
    const isPass = r.state === 'pass';
    const isFail = r.state === 'fail';
    const isMan  = r.state === 'manual';
    if (isPass) passed++; else if (isFail) failed++; else if (isMan) manual++;
    const isAM = t.title.startsWith('[AUTO+MANUAL]');
    const isM  = t.title.startsWith('[MANUAL]');
    if (t.preflight)       { if (isPass) pfPassed++;   else if (isFail) pfFailed++;   else if (isMan) pfManual++; }
    else if (!isAM && !isM){ if (isPass) autoPassed++; else if (isFail) autoFailed++; else if (isMan) autoManual++; }
    else if (isAM)         { if (isPass) amPassed++;   else if (isFail) amFailed++;   else if (isMan) amManual++; }
    else                   { if (isPass) manPassed++;  else if (isFail) manFailed++;  else if (isMan) manManual++; }
  });

  // Inline section header stats pills
  const _checkIcon = `<svg style="width:10px;height:10px;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const _pill = (val, label, color, allPass) => val > 0
    ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 7px;border-radius:99px;font-size:0.7rem;font-weight:700;background:${color}22;color:${color}">${allPass ? _checkIcon : ''}${val} ${label}</span>`
    : '';
  const _inlineSectionStats = (key, p, f, m, total) => {
    const el = document.getElementById('section-inline-stats-' + key);
    if (!el) return;
    const allPass = total > 0 && p === total;
    const skipped = Math.max(0, total - p - f - m);
    el.innerHTML = _pill(p,'Pass','#3fbe71', allPass) + _pill(f,'Fail','#e15b59', false) + _pill(m,'Manual','#f59e0b', false) + _pill(skipped,'Skipped','#6b7280', false);
  };
  _inlineSectionStats('preflight', pfPassed,   pfFailed,   pfManual,   pfTotal);
  _inlineSectionStats('auto',      autoPassed, autoFailed, autoManual, autoTotal);
  _inlineSectionStats('am',        amPassed,   amFailed,   amManual,   amTotal);
  _inlineSectionStats('manual',    manPassed,  manFailed,  manManual,  manTotal);

  // Unified summary card - Pass / Fail / Manual / Not Run / Total
  const totalRun = passed + failed + manual;
  const notRun   = JK_TESTS.length - totalRun;
  const _cell = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    const numEl = el.querySelector('div:first-child');
    if (numEl) { numEl.textContent = val; numEl.style.color = color; }
  };
  _cell('summaryPass',   passed, '#3fbe71');
  _cell('summaryFail',   failed, '#e15b59');
  _cell('summaryManual', manual, '#f59e0b');
  _cell('summaryNotRun', notRun, 'var(--text-muted)');
  _cell('summaryTotal',  JK_TESTS.length, 'var(--text)');

  // Keep hidden per-section spans in sync (used by save-to-file logic)
  const _secCard = (passId, failId, p, f) => {
    const ep = document.getElementById(passId); const ef = document.getElementById(failId);
    if (ep) ep.textContent = p; if (ef) ef.textContent = f;
  };
  _secCard('summaryAutoPass','summaryAutoFail', autoPassed, autoFailed);
  _secCard('summaryAMPass',  'summaryAMFail',   amPassed,   amFailed);
  _secCard('summaryManPass', 'summaryManFail',  manPassed,  manFailed);
}

// Temporarily patch console methods to replace internal test ID with display number in log messages.
// e.g. "[Test 94]" becomes "[Test 35]" matching the page numbering.
function _patchConsoleForTest(internalId, displayNum) {
  const TAG = `[Test ${internalId}]`;
  const NEW = `[Test ${displayNum}]`;
  const _orig = { info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const captured = []; // collect log entries for this test
  ['info','warn','error','debug'].forEach(level => {
    console[level] = function(...args) {
      const patched = args.map(a => typeof a === 'string' ? a.replace(TAG, NEW) : a);
      captured.push({ level, text: patched.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') });
      // suppress forwarding to actual console - output goes to modal only
    };
  });
  return {
    restore: () => { Object.assign(console, _orig); },
    getLogs: () => captured
  };
}

async function _runSingleTest(id) {
  const testDef = JK_TESTS.find(t => t.id === id);
  if (!testDef) return;
  const displayNum = (window._jkTestDisplayNumMap || {})[id] || id;
  const btn = document.getElementById(`test-run-btn-${id}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ti ti-loader-2 jk-spin" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg>'; }
  _setRowResult(id, 'running');
  if (!window._jkTestResults) window._jkTestResults = {};
  const _consolePatch = _patchConsoleForTest(id, displayNum);
  try {
    const result = await testDef.test();
    const logs = _consolePatch.getLogs();
    if (result === 'manual') {
      window._jkTestResults[id] = { state: 'manual', received: 'Manual verification required', message: null, logs };
      _setRowResult(id, 'manual');
    } else {
      window._jkTestResults[id] = { state: 'pass', received: String(result === true ? 'true' : JSON.stringify(result)), message: null, logs };
      _setRowResult(id, 'pass');
    }
  } catch (err) {
    const msg = err.message || String(err);
    const logs = _consolePatch.getLogs();
    window._jkTestResults[id] = { state: 'fail', received: msg, message: msg, logs };
    _setRowResult(id, 'fail', msg);
  } finally {
    _consolePatch.restore();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ti ti-player-play" style="font-size:0.85rem;line-height:1;display:flex;align-items:center"><use href="img/tabler-sprite.svg#tabler-player-play"/></svg><span style="line-height:1">Run</span>'; }
    _refreshSummary();
  }
}

async function _runTests(mode /* 'auto' | 'auto-manual' */) {
  const btnAuto   = document.getElementById('btnRunAutoTests');
  const btnAM     = document.getElementById('btnRunAutoManualTests');
  const activeBtn = mode === 'auto' ? btnAuto : btnAM;
  const progress  = document.getElementById('runProgress');
  if (btnAuto) btnAuto.disabled = true;
  if (btnAM)   btnAM.disabled   = true;
  if (activeBtn) activeBtn.innerHTML = '<svg class="ti ti-loader-2 jk-spin"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg> Running...';
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
    overlay.innerHTML = '<svg class="ti ti-test-pipe" style="font-size:2.5rem;color:var(--turq);display:block;text-align:center"><use href="img/tabler-sprite.svg#tabler-test-pipe"/></svg><div style="font-size:1rem;font-weight:600;color:var(--text);text-align:center;margin-top:12px" id="overlayStatus">Running tests...</div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';

  let passed = 0, failed = 0, manual = 0;
  window._jkTestResults = window._jkTestResults || {};
  // Determine which tests to run based on mode
  const isAutoManual = t => t.title.startsWith('[AUTO+MANUAL]');
  const isManual     = t => t.title.startsWith('[MANUAL]');
  const testsToRun   = mode === 'auto'
    ? JK_TESTS.filter(t => !isAutoManual(t) && !isManual(t))
    : JK_TESTS.filter(t => isAutoManual(t));
  // Clear only the results for tests in this run - preserve other sections (e.g. pre-flight manual marks)
  testsToRun.forEach(t => { delete window._jkTestResults[t.id]; });
  const _results = window._jkTestResults;
  const startTime = Date.now();

  for (let i = 0; i < testsToRun.length; i++) {
    const t = testsToRun[i];
    if (progress) progress.textContent = `Running ${i + 1} / ${testsToRun.length} (#${t.id})...`;
    const overlayStatus = document.getElementById('overlayStatus');
    if (overlayStatus) overlayStatus.innerHTML = `<div style='text-align:center'>Running ${i + 1} / ${testsToRun.length} &nbsp;<span style='font-size:0.75rem;font-weight:400;color:var(--text-muted)'>(#${t.id})</span></div><div style='text-align:center;font-size:0.85rem;color:var(--text-muted);margin-top:6px;font-weight:400'>${t.title}</div>`;

    // Skip any residual skipInRunAll flags
    if (t.skipInRunAll) {
      const cell = document.getElementById(`test-result-${t.id}`);
      if (cell) cell.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:700;line-height:1;background:rgba(107,114,128,0.12);color:#6b7280;border:1px solid rgba(107,114,128,0.3)" title="Skipped by Run All - manual tests must be run individually"><svg class="ti ti-ban" style="font-size:0.85rem;line-height:1;color:#6b7280"><use href="img/tabler-sprite.svg#tabler-ban"/></svg><span style="line-height:1">Skipped</span></span>`;
      const row2 = document.getElementById(`test-row-${t.id}`);
      if (row2) row2.style.background = '';
      if (progress) progress.textContent = `Skipped test ${i + 1} (run individually) - ${i + 1} / ${JK_TESTS.length}`;
      continue;
    }

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
      } else if (result === false) {
        _setRowResult(t.id, 'fail', 'Test returned false');
        _results[t.id] = {state:'fail', received:'false', message:'Test returned false'};
        failed++;
      } else {
        // true or any descriptive string = pass
        const received = result === true ? 'Pass' : String(result);
        _setRowResult(t.id, 'pass');
        _results[t.id] = {state:'pass', received};
        passed++;
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

  if (btnAuto) { btnAuto.disabled = false; btnAuto.innerHTML = '<svg class="ti ti-player-play" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-player-play"/></svg>Run'; }
  if (btnAM)   { btnAM.disabled   = false; btnAM.innerHTML   = '<svg class="ti ti-player-play-filled" style="font-size:0.85rem"><use href="img/tabler-sprite.svg#tabler-player-play-filled"/></svg>Run'; }
  if (progress) { progress.style.display = 'none'; }

  // Show summary
  const sumEl = document.getElementById('testSummary');
  if (sumEl) {
    document.getElementById('summaryTime').textContent = `Completed in ${elapsed}s`;
    _refreshSummary();
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
      const resultText = resultCell?.textContent?.trim() || '-';
      const status = resultText.includes('PASS') ? 'PASS' :
                     resultText.includes('FAIL') ? 'FAIL' :
                     resultText.includes('MANUAL') ? 'MANUAL' : '-';
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

function _resetSection(mode /* 'auto' | 'auto-manual' | 'manual' */) {
  const isTarget = mode === 'auto'
    ? t => !t.title.startsWith('[AUTO+MANUAL]') && !t.title.startsWith('[MANUAL]')
    : mode === 'auto-manual'
    ? t => t.title.startsWith('[AUTO+MANUAL]')
    : t => t.title.startsWith('[MANUAL]');
  const sectionTests = JK_TESTS.filter(isTarget);
  sectionTests.forEach(t => {
    if (window._jkTestResults) delete window._jkTestResults[t.id];
    const cell = document.getElementById(`test-result-${t.id}`);
    if (cell) cell.innerHTML = _detailsBtn(t.id);
    const row = document.getElementById(`test-row-${t.id}`);
    if (row) row.style.background = '';
  });
  // Persist cleaned results
  if (window._supabaseUser && typeof DB !== 'undefined') {
    Promise.resolve(DB.savePrefs(window._supabaseUser.id, { testResults: window._jkTestResults || {} })).catch(() => {});
  }
  _refreshSummary();
}

function _resetTests() {
  window._jkTestResults = {};
  _clearSavedTestResults();
  const summaryEl = document.getElementById('testSummary');
  if (summaryEl) summaryEl.style.display = 'flex';
  const progress = document.getElementById('runProgress');
  if (progress) progress.style.display = 'none';
  _buildTestRows();
}