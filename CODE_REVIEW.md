# JumpKit – App Codebase Review

_Scope: everything under `app/` (Electron main, preload, renderer JS, Supabase config / schema / edge functions). Reviewed 2026-05-20._

The app is in solid shape overall — clear modular split between Electron main, a thin preload, and a multi-file renderer; Supabase usage is reasonable; RLS is set up. But there are a handful of real bugs and a few notable security issues that should be addressed before scaling user numbers up.

Findings below are grouped by severity. Each one has the file + line range and a concrete recommendation.

---

## 🔴 Critical

### 1. Team passwords stored in plaintext alongside the hash
- **Where:** `js/teams.js:692, 1160, 1545`; columns referenced: `team_password_plain`
- **What:** When a team is created, the code inserts `team_password_hash: hashedPassword, team_password_plain: password` into the `teams` row. The schema comment in `supabase/schema.sql:34` claims a bcrypt hash is stored server-side, but the renderer is putting the cleartext password in a sibling column.
- **Why it matters:** Any user with `SELECT *` on `teams` (per current RLS that's any team member, team owner, or org owner — see `schema.sql:155-159`) can read the plaintext team password of every team they belong to. If the project later relaxes RLS or an Edge Function leaks the row, every team password is compromised. There is no scenario in which storing the plaintext password is required.
- **Fix:** Remove `team_password_plain` everywhere it's written (`teams.js:692, 843, 856, 1160, 1197, 1200, 1545`) and drop the column in Supabase. If users need to "see" or rotate the password, generate it client-side and email it, or build a "reset password" flow.

### 2. Client-side password verification + dangerous fallback
- **Where:** `js/teams.js:1600-1620`
- **What:** Joining a team fetches `team_password_hash` to the renderer, hashes the user's input with PBKDF2 (fixed salt — see #3), and compares strings in JS: `const match = storedHash === pw || storedHash === inputHash;`. The `storedHash === pw` branch accepts any row that happens to hold a plaintext value in `team_password_hash`.
- **Why it matters:** Two problems. (a) A determined attacker only needs read access to a row to brute-force the password offline — a *fixed-salt* PBKDF2 with 100k iterations is brute-forceable for any short/dictionary password. (b) The plaintext-fallback comparison means a malformed row or migration mistake could downgrade an entire team to no-password.
- **Fix:** Move the password check into an Edge Function that uses bcrypt server-side (Postgres has `pgcrypto.crypt()` you could call via RPC). The client should send the candidate password, never receive the hash. Remove the `storedHash === pw` fallback completely.

### 3. SQL bug in `sync-jumps` IPC handler — INSERT column/value count mismatch
- **Where:** `main.js:106-112`
  ```sql
  INSERT INTO columns (id, userId, name, visible, `order`, createdAt, isShared, teamId, supabaseId)
  VALUES (@id, @userId, @name, @visible, @order, @createdAt, 1, @teamId)
  ```
  9 column names, 8 values (missing one for `supabaseId`).
- **Why it matters:** Every call to `sync-jumps` that touches `sharedColumns` will throw `SQLITE_ERROR: 9 values for 8 columns` (or similar) and the whole transaction will roll back. Looking at `js/sync.js`, the renderer doesn't actually call `electronAPI.syncJumps` — it does its own writes via `saveColumns`/`upsertSharedJumps`. So this handler is dead-on-arrival but still wired into `preload.js`, ready to crash anything that does start calling it.
- **Fix:** Either delete the unused `sync-jumps` handler (and the preload entry on `preload.js:5`), or add `@supabaseId` to the VALUES list to match the column list.

### 4. `log()` is undefined in main-process handlers
- **Where:** `main.js:437, 440, 451`
- **What:** Inside `migrate-user-id` and `seed-new-user`, the code calls `log(\`...\`)` — but `log` is never declared or imported anywhere in `main.js`. The success/error logging in `migrateUserId` will throw `ReferenceError: log is not defined` and corrupt the IPC return value. (The ReferenceError happens *after* the SQLite transaction commits, so data is fine, but the renderer gets a rejected promise.)
- **Fix:** Replace `log(...)` with `console.log(...)` or define a `const log = (...a) => console.log('[JumpKit]', ...a);` at the top of the file.

---

## 🟠 High

### 5. Content Security Policy is effectively disabled
- **Where:** `main.js:631-640`
  ```
  default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: app: https://*.supabase.co ... https://cdn.jsdelivr.net ...
  ```
- **Why it matters:** With `'unsafe-inline' 'unsafe-eval'` plus `data:`/`blob:`/`file:` in a single `default-src`, CSP isn't blocking anything meaningful. If you ever ship XSS through user data (shared jump names, team names — see #11), there's no defense-in-depth.
- **Fix:** Split into directives: `default-src 'self'`; `script-src 'self' https://cdn.jsdelivr.net`; `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `img-src 'self' data: https:`; `connect-src 'self' https://*.supabase.co https://api.resend.com`. Remove `unsafe-eval`. If inline scripts are blocking the migration, bundle them out (the only inline JS I found is the early theme bootstrap at the top of `index.html`/`app.html` — that can move into a file).

### 6. No `requestSingleInstanceLock()`
- **Where:** `main.js:626-651` — no single-instance guard.
- **Why it matters:** If the user launches a second copy of JumpKit (double-click on the icon, login items, etc.), both processes will open `better-sqlite3` against the same `jumpkit.db` file. SQLite handles concurrent readers fine, but two writers using WAL+default journal_mode can corrupt the database during the migration in `initDB()` (concurrent `ALTER TABLE`).
- **Fix:**
  ```js
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  ```

### 7. `shell.openPath` runs whatever the renderer hands it
- **Where:** `main.js:585-608`
- **What:** `open-url` accepts any string and passes it to `shell.openExternal` (web) or `shell.openPath` (local). The local branch is the concern: jump URLs come from local SQLite *and* from team-shared rows in Supabase. A malicious row could set `url: '/Applications/Calculator.app'` (run an app) or `'/path/to/installer.dmg'`.
- **Why it matters:** Today the *user* types the URLs, so risk is self-inflicted. The moment Teams support means a team owner can push shared jumps to all members, this becomes an exec primitive for the team owner. There's no schema validation between the Supabase column and what `shell.openPath` accepts.
- **Fix:** In `open-url`, when the path isn't `http(s)://`, validate it's a file or directory the user "should" be allowed to jump to (e.g. reject `.app`, `.exe`, `.bat`, `.sh`, `.cmd`, executables on macOS via stat+mode, or paths outside the user's home). At minimum, show a "you are about to open <X> — continue?" confirmation when the URL came from a shared jump (`isShared: true`).

### 8. macOS notarization will break — `hardenedRuntime: false`
- **Where:** `package.json:38`
- **Why it matters:** Apple notarization requires hardened runtime. Shipping with `hardenedRuntime: false` blocks notarization and Gatekeeper will warn users that the app is unsigned. Combined with not-implemented entitlements (`entitlements.mac.plist` is only 447 bytes, basic), you won't get past first-launch friction on macOS 13+.
- **Fix:** Set `"hardenedRuntime": true`. Test that better-sqlite3 still loads — you may need `com.apple.security.cs.allow-unsigned-executable-memory` in `entitlements.mac.plist` if a native dependency breaks.

### 9. No `setWindowOpenHandler` / `will-navigate` lockdown
- **Where:** `main.js:537-576` (createWindow)
- **Why it matters:** If anything in the renderer triggers `window.open(url)` or a stray anchor with `target="_blank"`, Electron opens a new `BrowserWindow` with full preload access. Combined with the very loose CSP (#5), an XSS in user content could open a window that doesn't honor your security defaults.
- **Fix:**
  ```js
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
  ```

---

## 🟡 Medium

### 10. `tests.js` (130 KB / 2,379 lines) ships to every user
- **Where:** `app.html:116` loads `js/tests.js` for everyone; the nav button is hidden unless `email === 'jeffroder@gmail.com'` (`app.js:155-161`).
- **Why it matters:** A 130 KB JS payload is parsed and kept in memory for every launch even though 99.99% of users will never run a test. It also exposes test fixtures and a description of how RLS is asserted to anyone reading the bundle.
- **Fix:** Either lazy-load `tests.js` on demand (only when the admin clicks the Tests nav), or gate it at build time so it isn't bundled in production builds (electron-builder `files` config supports per-target excludes).

### 11. Renderer interpolates ID strings directly into HTML / onclick
- **Where:** `js/jumps.js:152-153, 392, 499, 863, 872, 892` (and many more places using ``onclick="doSomething('${id}')"``)
- **What:** Most user-controlled text (`name`, `description`, `hotkey`) is properly run through `esc()` (good). However, `id` is interpolated directly into HTML attributes and JS string literals.
- **Why it matters:** Today `id` is a locally generated `uid()` or a Supabase UUID, so it can't contain quotes. But if anyone ever lets a team owner specify an external `id`, or refactors to use slugs / human-readable IDs, this becomes XSS at every onclick.
- **Fix:** Switch from inline `onclick="doDelete('${id}')"` to event delegation: render `data-id="${esc(id)}"` once, then a single `area.addEventListener('click', e => { ... })` that dispatches on `target.dataset.action`. This kills a whole class of bugs and is more performant. Also: even the current "safe" interpolations of `${id}` should go through `esc()` defensively.

### 12. `chart.min.js` (200 KB) loaded for every page including auth
- **Where:** `app.html:105`. Only `stats.js` uses Chart.js, and `stats.js` is 1 line / empty.
- **Why it matters:** First paint on the auth/home page is ~200 KB heavier than needed.
- **Fix:** Move the `<script src="js/chart.min.js">` into `stats.js` via dynamic `import()` or only inject the tag when the user navigates to Statistics. Better still, swap Chart.js for a smaller library — but lazy-loading is the cheap win.

### 13. Auth handler hardcodes the anon key as a literal
- **Where:** `js/auth.js:103` — the welcome-email `fetch` includes a `'Authorization': 'Bearer eyJ...'` header with the JWT inlined instead of referencing `SUPABASE_ANON_KEY` (which is already on the page).
- **Why it matters:** If you rotate the anon key (e.g. when the JWT expires in 2036, or after a leak), you'll edit `config.js` and miss this copy. Same key, two places.
- **Fix:** `'Authorization': \`Bearer ${SUPABASE_ANON_KEY}\``.

### 14. Sidebar admin nav check uses email string equality
- **Where:** `js/app.js:155-161`
- **Why it matters:** `if (_adminEmail === 'jeffroder@gmail.com')` decides whether to show the Tests nav. The nav itself doesn't grant any privileged operation, but if anyone ever does `if (currentUser.email === '...') { allowAdmin }`, the pattern becomes a security risk.
- **Fix:** Add `is_admin` (boolean) or use the existing `role` field with a new `'admin'` value on `profiles`. Check `data.role === 'admin'` instead of `data.email === '<hardcoded>'`.

### 15. Sync logic mixes `1`/`0` and boolean `true`/`false` for `isShared`
- **Where:** `js/sync.js:107-138`, `js/db.js:69-79` (boolean coercion), `js/jumps.js:391` (`isShared || teamId` — `0` is falsy so this happens to work)
- **Why it matters:** `DB.init` converts SQLite `1`/`0` → boolean, but `sync.js` writes `isShared: 1` back into the cache. The cache contains both representations at different times — fragile under refactors and confuses code review.
- **Fix:** Pick one (booleans in cache, numbers at the SQLite boundary), and always `!!`-coerce when reading from SQLite, always `?1:0` when writing.

### 16. Stale data cleanup deletes shared jumps using **two different ID schemes**
- **Where:** `js/sync.js:186-220`
- **What:** First pass (lines 187-192): `DB.deleteJump` is called when local `j.supabaseId || j.id` is not in `remoteJumpIds`. Second pass (lines 215-220): the IPC `deleteSharedJumps` uses `j.id` only. The two scopes will diverge when local `j.id` differs from `j.supabaseId` (which is exactly what happens during the migration from local→remote IDs).
- **Why it matters:** Some shared jumps will be removed from the in-memory cache but not from SQLite, or vice-versa — leading to ghost rows that reappear on next launch.
- **Fix:** Use `supabaseId` consistently for matching shared rows, and pass that to both `DB.deleteJump` (which already supports it) and `deleteSharedJumps`.

### 17. Dead code in `main.js`
- **Where:** `main.js:1` imports `globalShortcut`, `main.js:534` declares `let tray;`, both unused. `globalShortcut.unregisterAll()` runs on quit (`main.js:658`) but nothing ever registers one.
- **Fix:** Delete unused imports and the tray variable. Drop the `will-quit` handler if nothing registers shortcuts.

### 18. Auto-seed race: `localStorage` flag + `_seededThisSession` Set + main-process guard
- **Where:** `js/db.js:88-95`, `main.js:445-452`
- **What:** Three independent guards against double-seeding: a localStorage key `jk_seeded_${userId}`, an in-memory Set in `db.js`, and a SQLite count check in `main.js`. They can disagree across reinstalls (localStorage wiped but SQLite kept, or vice versa).
- **Why it matters:** A user who clears site data but keeps the SQLite db will hit the localStorage path, attempt to seed again, find that columns already exist (the main-process guard catches it), and get back `{ ok: true, skipped: true }` — but `db.js` will still set the local "seeded" key. Mostly OK today; brittle for the future.
- **Fix:** Make the SQLite guard the source of truth, drop the localStorage key, and have `seedNewUser` return `{ skipped: true }` cleanly which the renderer respects.

### 19. `getColumns` IPC orders by ``order`` ASC, but cache replacement doesn't sort
- **Where:** `main.js:296`, `js/db.js:144-160`
- **What:** SQLite reads come back sorted, but `saveColumns` replaces the cache with whatever array was passed, in whatever order. Subsequent calls to `getColumns()` (cache) and `getColumns()` (after IPC reload) return *differently sorted* arrays.
- **Fix:** In `db.js:saveColumns`, sort by `order` after replacement; or have all callers sort at render time.

---

## 🟢 Low / Style / Hygiene

### 20. DevTools "blocking" via `before-input-event` and `devtools-opened` is a deterrent, not a protection
- **Where:** `main.js:556-570`
- **What:** Blocking F12 and `Ctrl+Shift+I` doesn't prevent DevTools — any electron user can use `View → Toggle Developer Tools` from the menu (which you've hidden on Win/Linux but is still there on macOS), or attach a remote debugger.
- **Fix:** Drop the illusion. If you want true defense, ship a packaged build without the inspector module — but that breaks support workflows. The current code's only value is hiding DevTools from accidental keystrokes; rename the comment to "discourage" rather than "disable".

### 21. PBKDF2 with a fixed salt is weaker than the comment claims
- **Where:** `js/teams.js:5-15`
- **What:** Comment says "significantly stronger than plain SHA-256 for password storage." A *fixed* salt removes the rainbow-table resistance that's PBKDF2's whole point.
- **Fix:** Use a per-row random salt stored alongside the hash (or, better, do the comparison server-side as recommended in #2).

### 22. `_supabaseUser` and `currentUser` are both globals
- **Where:** `js/app.js:2-3` plus implicit globals via inline scripts.
- **Why it matters:** Both refer to "the logged-in user" but at different layers — easy to mix up. The app has had a real bug here (`localUser.id !== supaId` migration on `app.js:20-34`) precisely because of dual identities.
- **Fix:** Long-term, namespace under `JK.currentUser`/`JK.supaUser`. Short-term, document that `currentUser.id === supaId` post-migration and add an assertion.

### 23. Auto-update polling on every launch with no opt-out UI
- **Where:** `main.js:610-624, 645`
- **Why it matters:** `autoDownload = true` means every launch pulls a candidate release. If your CI ever publishes a bad update, every existing user gets it without warning. There's only a "Restart & Update" button in the banner — no "skip this version".
- **Fix:** Leave `autoDownload = true` for now, but add a "Skip this version" option in the banner UI, plus a setting to disable auto-update entirely (you have the `notifications` pref already — could piggyback or add a new one).

### 24. `entitlements.mac.plist` is minimal — review before notarization
- **Where:** `entitlements.mac.plist` (447 bytes, didn't open in this pass)
- **Action:** When you switch on `hardenedRuntime`, you'll need explicit entitlements for any networking, file access outside the sandbox, and the JIT/native module exemption for better-sqlite3.

### 25. `server.js` (Express dev server) is in source but only excluded from the packaged build
- **Where:** `app/server.js`, `package.json:21` excludes it from `files`.
- **Why it matters:** It's harmless today, but it has an unauthenticated POST endpoint that writes any JSON payload to disk (`/api/data` writes to `data/db.json`). If someone runs `node server.js` in production by accident, they have a write-anything-to-data-file primitive. Worth a comment at the top of `server.js` calling out "DEV ONLY — do not run in packaged app."

### 26. `wirePwToggles` in `index.html` is large, inlined HTML for an SVG icon
- **Where:** `index.html:166-186`
- **Action:** Move the eye/eye-off SVG strings into a small helper file and reuse. Easier to maintain and lets you tighten CSP.

### 27. Subscription/tier data is duplicated in three places
- **Where:** localStorage (`jk_subscription_status`, `jk_subscription_tier`, `jk_role`), Supabase `profiles`, and SQLite `user_prefs`. `app.js:90-100` writes to all three on load.
- **Why it matters:** Three sources of truth → drift. If subscription expires in Supabase but Lemon Squeezy webhook fires before the user opens the app, localStorage will lie until next launch.
- **Fix:** Treat Supabase as the only source of truth for subscription state, and fetch on every "do I have access?" check. Drop the localStorage mirror.

### 28. Inline event handlers everywhere (`onclick="..."`)
- **Where:** Most of `jumps.js`, `teams.js`, `onboarding.js`.
- **Why it matters:** Forces `'unsafe-inline'` in script-src CSP, and couples HTML strings to function names that must remain global. Hard to refactor.
- **Fix:** Same approach as #11 — switch to event delegation. Big effort but worth it long-term.

### 29. Monolithic files
- **Files:**
  - `js/app.js` — 1,690 lines
  - `js/jumps.js` — 1,220 lines
  - `js/teams.js` — 1,762 lines
  - `js/tests.js` — 2,379 lines
- **Action:** Split each into 200-400 line modules. `app.js` could become `app/init.js`, `app/theme.js`, `app/notifications.js`, `app/paywall.js`, `app/cloud-backup.js`, `app/auto-archive.js`. You'd still ship them as plain scripts (no bundler change needed) — but reading and reviewing diffs becomes tractable.

---

## ✅ Things that look good

- **Electron security baseline:** `contextIsolation: true`, `nodeIntegration: false`, narrow preload API surface in `preload.js`.
- **Prepared statements throughout `main.js`** — no string-concatenation SQL, no injection risk on the IPC boundary.
- **Migration pattern (`addColumnIfMissing`)** is the right approach for keeping shipped users up to date without breaking old DBs.
- **RLS policies in `schema.sql`** cover SELECT/INSERT/UPDATE/DELETE for every table with sensible team/org membership logic.
- **Email confirmation gating + welcome-email idempotency** (Edge Function checks `welcome_email_sent` and updates it before sending) — good design to prevent dupes.
- **CORS pinning to `https://jumpkit.app` in Edge Functions** — better than `*`.
- **Auth fallback** (`checkExistingSession`, redirect to `app.html` on session) is clean.

---

## Suggested order of fixes

1. Remove `team_password_plain` and migrate existing teams (#1) — 30 min plus a Supabase migration.
2. Move team password verification into an Edge Function (#2) — couple hours.
3. Fix the `sync-jumps` SQL bug + undefined `log()` (#3, #4) — 5 minutes each, ship today.
4. Add `requestSingleInstanceLock` and `setWindowOpenHandler`/`will-navigate` (#6, #9) — 15 min.
5. Tighten CSP (#5), set `hardenedRuntime: true` and update entitlements (#8) — half a day, test on a notarized build.
6. Lazy-load `tests.js` and `chart.min.js` (#10, #12) — half a day.
7. Validate paths in `open-url` (#7) — small change with big risk reduction.
8. Everything else as quality-of-life cleanup.
