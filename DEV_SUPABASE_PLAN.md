# JumpKit — Dev Supabase Environment Setup Plan

**Status:** Planned — execute after v1.0 ships  
**Estimated effort:** 2–3 hours  
**Goal:** A fully isolated dev Supabase project that mirrors production so we can test, debug, and experiment without touching real user data.

---

## Why We Need This

After shipping, we need to:
- Test new features against a live Supabase backend
- Run destructive tests (wipe data, corrupt rows, test edge cases)
- Develop without risk to prod users
- Pass test #126 ("Dev/Prod database separation") ✅

Right now, dev and prod share the same Supabase project. That's fine pre-launch; it's a liability post-launch.

---

## What Gets Replicated

### ✅ Tables (all except deployments)
| Table | Replicate? | Notes |
|---|---|---|
| `organizations` | ✅ Yes | Core table |
| `profiles` | ✅ Yes | Core table |
| `teams` | ✅ Yes | Core table |
| `team_members` | ✅ Yes | Core table |
| `team_invites` | ✅ Yes | Core table |
| `shared_columns` | ✅ Yes | Core table |
| `shared_jumps` | ✅ Yes | Core table |
| `member_stats` | ✅ Yes | Core table |
| `pending_upgrades` | ✅ Yes | From migrations |
| `deployments` | ❌ Skip | Admin/internal only |

### ✅ Edge Functions (all 16)
| Function | Notes |
|---|---|
| `apply-pending-upgrade` | Critical — auth flow |
| `check-member-lockouts` | Scheduled job |
| `verify-team-password` | Critical — team join flow |
| `send-invite` | Email — use dev Resend key |
| `send-welcome` | Email |
| `send-welcome-core` | Email |
| `send-feedback` | Email |
| `send-account-exists` | Email |
| `send-cancellation` | Email |
| `send-team-deleted` | Email |
| `send-team-downgrade-alert` | Email |
| `send-member-joined` | Email |
| `send-member-removed` | Email |
| `send-pending-upgrade` | Email |
| `waitlist-signup` | Email |
| `ls-webhook` | LemonSqueezy webhook — skip wiring in dev |

### ✅ RLS Policies
Already in `schema.sql` — applied automatically in Step 3.

### ✅ Auth Configuration
- Email auth enabled
- Email templates (optional — can use Supabase defaults in dev)

---

## Step-by-Step Plan

### Step 1 — Create the Dev Supabase Project (5 min)
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Name it: `jumpkit-dev`
4. Region: same as prod (us-east-1 or wherever prod lives)
5. Generate a strong DB password and save it in 1Password
6. Free tier is fine

### Step 2 — Grab Dev Credentials (2 min)
In the new project: **Settings → API**
- Copy **Project URL** → this becomes `DEV_SUPABASE_URL`
- Copy **anon/public key** → this becomes `DEV_SUPABASE_ANON_KEY`
- Copy **service_role key** → needed for edge function secrets (store securely)

### Step 3 — Apply Schema + Migrations (20 min)
In the Supabase Dashboard → SQL Editor, run these files **in order**:

1. `app/supabase/schema.sql` — base tables, RLS policies, helper functions
2. `app/supabase/migrations/20240001_add_name_fields.sql`
3. `app/supabase/migrations/20240002_profile_trigger.sql`
4. `app/supabase/migrations/20240003_subscription_fields.sql`
5. `app/supabase/migrations/20260510_clear_sha256_passwords.sql`
6. `app/supabase/migrations/20260521_add_seeded_at.sql`
7. `app/supabase/migrations/20260525_drop_team_password_plain.sql`
8. `app/supabase/migrations/20260609_member_stats.sql`
9. `app/supabase/migrations/20260611_pending_upgrades.sql`
10. `app/supabase/migrations/20260613_subscription_plan.sql`
11. `app/supabase/migrations/20260613_team_member_lockout.sql`
12. `app/supabase/migrations/20260615_single_session_lock.sql`
13. ~~`20260619000000_alter_deployments_dual_platform.sql`~~ — **SKIP** (deployments table)

⚠️ Run each one individually and confirm "Success" before running the next.

### Step 4 — Set Up Dev Admin Account (5 min)
In Supabase dev project → Authentication → Users:
- Create a test user (e.g. `dev@jumpkit.io` or your real email)
- After first login in the app, manually set `role = 'admin'` in the `profiles` table via the Table Editor

### Step 5 — Deploy Edge Functions to Dev Project (30–45 min)
Install Supabase CLI if not already installed:
```bash
npm install -g supabase
```

Link to the dev project:
```bash
cd Topics/JumpKit/app
supabase login
supabase link --project-ref <DEV_PROJECT_REF>
# DEV_PROJECT_REF is the ID in your dev project URL: https://supabase.com/dashboard/project/<ID>
```

Set secrets on the dev project (edge functions need these):
```bash
supabase secrets set --project-ref <DEV_PROJECT_REF> \
  RESEND_API_KEY=<your-resend-key> \
  SUPABASE_URL=<DEV_SUPABASE_URL> \
  SUPABASE_SERVICE_ROLE_KEY=<DEV_SERVICE_ROLE_KEY>
```

Deploy all functions:
```bash
supabase functions deploy --project-ref <DEV_PROJECT_REF>
```

Or deploy individually if you want to exclude `ls-webhook`:
```bash
supabase functions deploy apply-pending-upgrade --project-ref <DEV_PROJECT_REF>
supabase functions deploy verify-team-password --project-ref <DEV_PROJECT_REF>
supabase functions deploy check-member-lockouts --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-invite --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-welcome --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-welcome-core --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-feedback --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-account-exists --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-cancellation --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-team-deleted --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-team-downgrade-alert --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-member-joined --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-member-removed --project-ref <DEV_PROJECT_REF>
supabase functions deploy send-pending-upgrade --project-ref <DEV_PROJECT_REF>
supabase functions deploy waitlist-signup --project-ref <DEV_PROJECT_REF>
# Skip ls-webhook — LemonSqueezy webhook doesn't need wiring in dev
```

### Step 6 — Add Dev Config to the App (20 min)

**Create `app/supabase/config.dev.js`** (git-ignored):
```js
// DEV ONLY — never committed, never shipped
// Switch the app to dev Supabase by placing this file here.
// Excluded from production builds via package.json.
const SUPABASE_URL      = 'https://<DEV_PROJECT_REF>.supabase.co';
const SUPABASE_ANON_KEY = '<DEV_ANON_KEY>';
```

**Update `app/index.html`** to prefer dev config when present:
```html
<!-- Load dev config if present (falls back to prod) -->
<script>
  // config.dev.js is loaded first if it exists; otherwise config.js (prod) is used.
  // This file is excluded from production builds.
</script>
<script src="supabase/config.dev.js" onerror="void 0"></script>
<script src="supabase/config.js"></script>
```

Wait — `onerror` won't suppress console errors in Electron. Better approach: use `preload.js` to check if the file exists and inject the correct config path via IPC. **Max to implement this detail.**

**Add `config.dev.js` to `.gitignore`:**
```
app/supabase/config.dev.js
```

**Add `config.dev.js` to production build exclusions in `package.json`:**
```json
"!supabase/config.dev.js"
```

**Add `config.dev.js` to test #380 guard** (must be absent from production installer files array).

### Step 7 — Verify Dev Environment Works (15 min)
1. With `config.dev.js` in place, run `npm start`
2. Sign up for a new account → profile should be created in dev Supabase only
3. Run the test suite → all tests should pass (edge function tests now have a real dev backend)
4. Confirm test #126 goes green ✅
5. Check prod Supabase tables — no new rows should appear

### Step 8 — Document & Commit (10 min)
- Commit the `index.html` change and `package.json` update
- Add `config.dev.js` to `.gitignore`
- Add changelog entry to `JUMPKIT_DOCS.html`
- Update test #126 to verify `config.dev.js` exists (not just warn)

---

## Ongoing Dev Workflow

**Switch to dev:**
- `config.dev.js` present in `app/supabase/` → app runs against dev

**Switch to prod:**
- Remove or rename `config.dev.js` → app falls back to `config.js` (prod)

**After any new migration:**
- Run the migration file on **both** prod and dev Supabase projects
- Commit migration file as always

**After adding a new edge function:**
- Deploy to dev: `supabase functions deploy <name> --project-ref <DEV_PROJECT_REF>`
- Deploy to prod: `supabase functions deploy <name> --project-ref <PROD_PROJECT_REF>`

---

## Risk / Notes

| Risk | Mitigation |
|---|---|
| Accidentally shipping `config.dev.js` | Build exclusion + test #380 guard |
| Dev and prod schema drift | Run every migration on both; note in migration README |
| Edge function secrets diverge | Keep a `secrets.dev.env` file locally (git-ignored) with dev values |
| `ls-webhook` (LemonSqueezy) in dev | Don't wire it — dev billing flow can be tested manually |
| Email spam from dev | Use a `+dev` suffix email or configure Resend to only send to verified addresses in dev |

---

## Files to Create/Change

| File | Action |
|---|---|
| `app/supabase/config.dev.js` | Create (git-ignored) |
| `app/.gitignore` | Add `supabase/config.dev.js` |
| `app/index.html` | Update script load order for dev/prod config |
| `app/package.json` | Add `!supabase/config.dev.js` to build exclusions |
| `app/js/tests.js` | Update test #126 to verify dev config exists |
| `app/main.js` | Add `config.dev.js` to startup absent-file guard |
| `JUMPKIT_DOCS.html` | Add dev environment section + changelog entry |
