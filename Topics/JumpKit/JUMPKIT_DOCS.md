# JumpKit — Complete Developer Documentation

> A comprehensive guide to the JumpKit codebase for developers joining the project or building on top of it.

**Last updated:** 2026-05-10

---

## 1. Product Overview

### What is JumpKit?

JumpKit is a desktop productivity application for Windows and macOS that solves a simple but powerful problem: **getting to the websites, folders, and file shares you use most, instantly.**

Instead of hunting through bookmarks, file explorers, or network drives, JumpKit puts all your most-used links and paths in one place, organized in custom columns, and launched with a single click—or a global hotkey.

### Who It's For

- **Individual knowledge workers** who want to save time navigating to frequently used resources
- **Small teams** that need to share jump collections with their colleagues
- **MSP-managed businesses** in regulated industries (manufacturing, healthcare, legal, finance) that value local-first data (no cloud leakage) and audit trails

### Core Value Proposition

- **Save time**: Launch any resource with one click or hotkey
- **Measure ROI**: JumpKit tracks every click and calculates time saved and dollars earned back
- **Stay organized**: Organize jumps into up to 10 custom columns however you work
- **Share safely**: Team members sync shared jumps from a private cloud (Supabase), but hotkeys are always personal and local
- **Zero data leakage**: Personal jumps stay on your machine. Only explicitly shared jumps sync to the cloud

### Pricing Tiers

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | 250 jump launches, web links + local folders, hotkey launcher, filters & search, time & ROI dashboard, Windows + Mac |
| **JumpKit Core** | $15/mo or $149/yr | Everything in Free + unlimited launches + team sharing + team stats & ROI + auto-archive + auto-backup |

---

## 2. Architecture Overview

### Electron App Structure

JumpKit is built as an Electron application—a Node.js desktop runtime that wraps a Chromium browser. This means:

- **Main Process** (`main.js`): Runs once at startup, creates the app window, manages IPC (inter-process communication), and handles SQLite database access
- **Renderer Process** (all JS files in `app/`): Runs in the browser context, handles all UI rendering, user interactions, and Supabase API calls

### Data Architecture: Local-First + Cloud Sync

```
┌─────────────────────────────────────────┐
│  JumpKit Desktop App (Electron)         │
│  ┌───────────────────────────────────┐  │
│  │ Renderer (HTML/CSS/JS)            │  │
│  │ - UI rendering                    │  │
│  │ - Supabase API calls              │  │
│  │ - In-memory cache (DB._cache)     │  │
│  └──────────────┬──────────────────┘  │
│                 │ IPC messages         │
│  ┌──────────────▼──────────────────┐  │
│  │ Main Process (Node.js)           │  │
│  │ - SQLite database (jumpkit.db)   │  │
│  │ - Global hotkey registration     │  │
│  │ - Window management              │  │
│  └──────────────┬──────────────────┘  │
│                 │ File system          │
│  ┌──────────────▼──────────────────┐  │
│  │ SQLite DB (~app-data/)           │  │
│  │ - jumps, columns, click_log      │  │
│  │ - user_prefs, sync_state         │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                 │ HTTPS
        ┌────────▼─────────┐
        │ Supabase Cloud   │
        │ - profiles       │
        │ - teams          │
        │ - shared_jumps   │
        │ - shared_columns │
        └──────────────────┘
```

### Three-Tier Data Model

**1. Personal (SQLite only)**
- All jumps created by you without the "shared" flag
- Never leaves your device
- Synced across your devices only via manual backup (if you enable cloud backup)

**2. Shared (SQLite + Supabase)**
- Jumps in columns marked "shared with team"
- Synced from the team owner's machine to Supabase
- Pulled down to all team members' machines on login + every 60 minutes
- **Hotkeys are local**: Each user assigns their own hotkey to shared jumps; hotkeys never sync to the cloud

**3. Cached (Supabase)**
- Profiles, teams, team memberships, invites
- Read-only in app; written by admin functions in backend

### Authentication Flow: Supabase Auth

```
User signs in/up with email + password
           ↓
Supabase Auth API validates credentials
           ↓
Session token issued + stored in browser memory
           ↓
localStorage also tracks: role, subscription_tier, subscription_status
           ↓
Local SQLite user profile created (if new device)
           ↓
App data (columns, jumps, click_log) loaded into in-memory cache
           ↓
App ready to render
```

- **No email confirmation**: Currently disabled for faster onboarding (re-enable before public launch)
- **Profile auto-creation**: Supabase trigger `on_auth_user_created` automatically inserts a row into the `profiles` table on signup
- **Roles**: `org-owner`, `team-owner`, `team-member` — stored in profiles table, checked on Teams page

### Sync Engine: Pull-Only, Fire-and-Forget Writes

**When sync runs:**
- On login (in `initAuth()`)
- Every 60 minutes (interval in `sync.js`)

**What gets synced:**
- Shared columns (names, order, team_id)
- Shared jumps (name, URL, description, team_id)
- Local hotkey assignments are **preserved** (not overwritten)

**How duplicates are prevented:**
- Columns are deduplicated by `(team_id + name)`
- Jumps use `supabaseId` to track the Supabase UUID
- On upsert, if a jump already exists locally, only name/URL/description are updated; hotkey is never touched

**Pattern: Local-First, Fire-and-Forget**
- All DB reads are **synchronous** from `DB._cache` (fast, instant)
- All DB writes **immediately update the cache**, then fire IPC messages to SQLite (async, no await)
- Users never see "saving..." spinners—the cache is the source of truth

---

## 3. File Structure & Responsibilities

### `main.js` — Electron Main Process

**Responsibilities:**
- Initialize and maintain SQLite database (`jumpkit.db`)
- Create and manage the app window
- Handle all IPC (Inter-Process Communication) requests from the renderer
- Register global hotkeys and launch jumps when hotkey is pressed
- Manage auto-updates and backups (write to ~/Documents/JumpKit Backups/)

**Key IPC Handlers:**
- `get-jumps`, `save-jump`, `delete-jump` — Jump CRUD
- `get-columns`, `save-columns`, `save-column` — Column management
- `get-prefs`, `save-prefs` — User preferences
- `get-click-log`, `log-click` — Click tracking
- `sync-jumps`, `upsert-shared-jumps`, `delete-shared-jumps` — Sync from Supabase
- `open-url`, `open-path` — Launch web links and local folders (cross-platform)
- `seed-new-user` — Create default columns and jumps for new users
- `save-backup`, `export-backup` — Backup/restore user data as JSON

**SQLite Tables Created:**
- `jumps` — All jumps (personal + shared)
- `columns` — Column definitions
- `click_log` — Click history (for stats)
- `user_prefs` — Preferences per user
- `sync_state` — Tracks last sync timestamp

---

### `app.html` — Main Entry Point (App UI)

**Responsibilities:**
- Root HTML structure: sidebar, topbar, main content area
- Modal overlay, toast notifications, context menu shells
- Script loading order (important for init sequence)

**Key Elements:**
- `<aside class="sidebar">` — Navigation sidebar with collapse toggle
- `<div class="topbar">` — Title, theme toggle, user menu
- `<div class="page-content">` — Dynamic page content area
- Modal/Toast/CtxMenu elements (populated by JS)

**Script Loading Order (Important):**
1. CSS (vars.css, app.css)
2. Supabase JS SDK
3. `js/db.js` — Database wrapper
4. `js/app.js` — Core app, Modal/Toast/CtxMenu, theme, auth
5. `js/jumps.js` — Jumps page (has `?v=timestamp` for cache-bust)
6. `js/archive.js` — Archive functionality
7. `js/help.js`, `js/stats.js` — Page renderers
8. `js/teams.js` — Teams page (also has `?v=timestamp` for cache-bust)
9. `js/sync.js` — Sync engine initialization

---

### `js/app.js` — Core App Logic & UI Components

**Responsibilities:**
- Initialize Supabase client
- Authenticate user (Supabase session + local SQLite profile)
- Define page router (maps page names to render functions)
- Implement reusable UI components: Modal, Toast, CtxMenu
- Manage theme (dark/light) via CSS variables
- Sidebar collapse/expand state (localStorage + preferences)
- User display (avatar, name, dropdown menu)
- Global hotkey listener (buildChord)
- Auto-archive trigger
- Cloud backup
- Pending invite checker

**Key Functions:**
- `initAuth()` — Load Supabase session or localStorage fallback
- `navigateTo(page)` — Route to a page and render it
- `buildChord(e)` — Parse keyboard event into shortcut string (e.g., "Ctrl+Shift+G")
- `showPaywall()` — Display upgrade modal for free tier limit

**Components:**

#### Modal
```javascript
Modal.open(title, bodyHTML, footerHTML, size);
Modal.close();
```
- Creates a centered overlay with a box
- `title`: HTML (usually icon + text)
- `bodyHTML`: Modal content
- `footerHTML`: Buttons or empty string for no footer
- `size`: Optional CSS class modifier (unused currently, reserved for future)

#### Toast
```javascript
Toast.success(message);
Toast.danger(message);
```
- Auto-dismissing notification (3 second timer)
- Stacks or replaces previous toast
- Icons via Tabler Icons

#### CtxMenu (Context Menu)
```javascript
CtxMenu.show(x, y, items);
CtxMenu.hide();
// items = [
//   { icon: '<i>...</i>', label: 'Do X', action: () => {...} },
//   'divider',
//   { icon: '...', label: 'Delete', action: () => {...}, danger: true }
// ]
```
- Right-click context menu
- Clamps position to viewport
- Auto-hides on click or escape

#### wireDropdown
```javascript
wireDropdown({
  dropId: 'myDrop',
  triggerId: 'myTrigger',
  menuId: 'myMenu',
  labelId: 'myLabel',
  inputId: 'myInput',     // optional
  onSelect: (option) => { // optional callback
    // Called when user selects an option
  }
});
```
- Custom <select> replacement
- Arrow keys navigate without closing, Enter confirms
- Updates label + hidden input on select
- Keyboard accessible

---

### `js/auth.js` — Authentication (index.html)

**Responsibilities:**
- Render login, signup, and password reset forms
- Validate email and password
- Call Supabase Auth API
- Create local user profile in SQLite (if first time on device)
- Theme toggle (dark/light)

**Key Functions:**
- Sign in with email + password
- Sign up with first name, last name, email, password (2x confirm)
- Password reset (sends link to email)
- Local user creation (fallback, if Supabase not configured)

**Form Validation:**
- Email: RFC-like pattern check
- Password: min 8 characters
- Confirm: must match password
- Real-time error display

---

### `js/db.js` — Database Wrapper & Cache

**Responsibilities:**
- Maintain in-memory cache (`DB._cache`)
- Expose synchronous read methods (pull from cache)
- Fire async writes to SQLite via IPC
- Fall back to localStorage if Electron API unavailable (browser dev mode)
- Auto-seed new users with 10 default columns + example jumps

**Key Methods:**

**Jumps:**
```javascript
DB.getJumps(userId)          // → array of all jumps
DB.getActiveJumps(userId)    // → filter isArchived=0
DB.getArchivedJumps(userId)  // → filter isArchived=1
DB.saveJump(userId, jump)    // fire-and-forget to IPC
DB.deleteJump(userId, jumpId)
DB.updateJump(userId, jumpId, fields)
```

**Columns:**
```javascript
DB.getColumns(userId)        // → array of columns (ordered)
DB.saveColumns(userId, cols) // replace all columns (bulk)
DB.saveColumn(userId, col)   // upsert single column
```

**Preferences:**
```javascript
DB.getPrefs(userId)          // → preferences object
DB.savePrefs(userId, prefs)  // upsert preferences
```

**Click Log:**
```javascript
DB.getClickLog(userId)       // → array of click events
DB.logClick(userId, jumpId)  // record a click
```

**Session:**
```javascript
DB.getCurrentUser()          // → { id, name, email, ... }
DB.setSession(userId)
DB.clearSession()
```

**Default Preferences Object:**
```javascript
{
  startPage:          'home',
  notifications:      true,
  cloudBackup:        false,
  timePerClick:       10,                  // seconds
  dollarsPerHour:     150,
  showDescription:    false,
  showHotkey:         false,
  autoArchive:        'never',             // 'never', '1m', '6m', '1y'
  subscriptionStatus: 'free',              // 'free', 'active', 'overdue', 'cancelled'
  subscriptionTier:   'free',              // 'free', 'core', 'teams_jet'
  role:               'team-member',       // 'org-owner', 'team-owner', 'team-member'
  navDefaultCollapsed: false,
}
```

---

### `js/jumps.js` — Jumps Page & Jump Management

**Responsibilities:**
- Render all columns and their jumps
- Handle jump CRUD (create, read, update, delete)
- Filter jumps: active, favorites, recent (30d), most-used (top 10%), archive
- Search jumps by name/URL/description
- Handle drag-to-reorder columns
- Manage hotkey assignment and recording
- Track click events
- Share column with team (if team owner)
- Handle shared jump read-only UI

**Jump Object Structure:**
```javascript
{
  id:            'nanoid string',        // local ID
  userId:        'user-id',
  name:          'Google',
  url:           'www.google.com',
  description:   'Search engine',
  reason:        'Quick lookups',
  columnId:      'column-id',
  hotkey:        'Ctrl+Shift+G',         // optional, user-assigned
  favorite:      boolean,
  isArchived:    boolean,
  isShared:      boolean,                // read-only UI badge if true
  teamId:        'team-id' || null,
  clickCount:    123,                    // tracked
  lastUsed:      timestamp || null,
  createdAt:     timestamp,
  updatedAt:     timestamp,
  timeSaved:     number || null,         // optional: override global timePerClick
  timeSavedUnit: 'seconds' || null,
  supabaseId:    'uuid' || null,         // references shared_jumps.id
}
```

**Key Functions:**

**Jump Rendering:**
```javascript
renderJumps()                    // main page renderer
renderColumns()                  // render all visible columns with jumps
applyJumpFilter()               // filter jumps and re-render
getFilteredJumps()              // → filtered jump array
```

**Jump CRUD:**
```javascript
openAddJumpModal()              // modal to create new jump
openEditJumpModal(jumpId)       // modal to edit jump
handleJumpClick(jumpId)         // click a jump (launch + log click)
deleteJump(jumpId)              // move to archive (soft delete)
restoreJump(jumpId)             // un-archive
deleteForever(jumpId)           // hard delete from archive
```

**Columns:**
```javascript
openConfigColumnsModal()        // show column reorder/visibility/share UI
saveColumnOrder(reorderedCols)  // persist drag-to-reorder
toggleColumnVisibility(colId)   // show/hide column
shareColumnWithTeam(colId, teamId)  // mark column as shared
unshareColumn(colId)            // unshare from team
```

**Hotkeys:**
```javascript
openHotkeyRecorder(jumpId)      // modal to record Ctrl+Shift+X, etc.
// Global listener in app.js calls handleJumpClick when hotkey pressed
```

**Click Tracking:**
```javascript
handleJumpClick(jumpId) {
  // 1. Launch the URL or path
  // 2. Log click to DB
  // 3. Update clickCount
  // 4. Set lastUsed timestamp
  // 5. Check free tier limit
  // 6. Show toast
}
```

---

### `js/teams.js` — Teams, Organizations & Sharing

**Responsibilities:**
- Render three different team views based on role: org-owner, team-owner, team-member
- Team creation and management (org-owner only)
- Team member invites via email (team-owner)
- Join team flow (pending members enter team password)
- Display shared jumps + team member list
- Password hashing (SHA-256 for team passwords)

**Roles:**

**org-owner**
- Create the organization
- Create teams within the org
- Promote users to team-owner
- See all teams and all members in the org
- Invite members by email (via team-owner)

**team-owner**
- Manage their team (invite members, remove members)
- Define shared columns (mark columns as "shared with team")
- See pending invites and member list
- **Cannot** assign hotkeys on shared jumps

**team-member**
- View team name and member list (read-only)
- See shared jumps synced from their team
- Assign their own hotkeys (local only, never synced)
- **Cannot** edit, delete, move, or invite

**Invite Flow:**
1. Team-owner enters email addresses
2. Invite email sent via Resend (Edge Function `send-invite`)
3. New user downloads app → clicks "Join a Team" → enters org name, team name, team password, personal password
4. App verifies team password (SHA-256 hash match) → inserts into `team_members`
5. On next sync, shared jumps pull down

**Password Hashing:**
```javascript
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

---

### `js/sync.js` — Sync Engine

**Responsibilities:**
- Pull shared columns and jumps from Supabase
- Upsert into local SQLite
- Preserve user's local hotkey assignments
- Remove stale shared jumps no longer on cloud
- Schedule 60-minute interval sync

**When Sync Runs:**
- On login (in `initAuth()` → `initApp()`)
- Every 60 minutes (setInterval in module init)

**Sync Algorithm:**
1. Get current user's Supabase session
2. Query `team_members` to find all teams user is member of
3. Fetch `shared_columns` and `shared_jumps` for those teams
4. Deduplicate columns by (team_id + name)
5. For each shared column/jump, check if local row exists by supabaseId or id
6. **If exists**: Update name/URL, **never overwrite hotkey**
7. **If new**: Insert, pull existing hotkey from DB (or empty string)
8. Remove stale columns/jumps no longer in remote
9. Update `sync_state.lastSync` timestamp

**Fire-and-Forget Pattern:**
```javascript
// In renderer: sync.js pulls from Supabase
const remoteJumps = await supabaseClient
  .from('shared_jumps')
  .select('*')
  .in('team_id', teamIds);

// Pass to main process to persist
await window.electronAPI.upsertSharedJumps(remoteJumps);

// Update cache immediately
DB._cache.jumps = [...newJumps];

// (IPC handler persists to SQLite async, no await)
```

---

### `js/archive.js` — Archived Jumps Management

**Responsibilities:**
- Render archive page (table view with sorting)
- Search archived jumps
- Restore jumps to active
- Permanently delete archived jumps

**Key Functions:**
```javascript
renderArchive()                 // main page renderer
renderArchivedInline()         // called from jumps.js when archive filter selected
restoreJump(jumpId)            // move back to active
deleteForever(jumpId)          // hard delete (ask for confirmation)
```

**Archive vs Delete:**
- **Archive** (soft delete): `isArchived = 1` — jumps stay in DB, hidden from main view
- **Delete** (hard delete): Permanently removed from DB — only from archive page, ask for confirmation first

---

### `js/help.js`, `js/stats.js` — Other Page Renderers

**help.js**
- Render Help page with FAQs, tips, keyboard shortcuts

**stats.js**
- Render Statistics page with charts
- Show clicks by day/week/month/year
- Top jumps ranking
- Time saved / dollars earned calculation
- Uses Chart.js for graphs

---

### `js/tests.js` — Unit Tests (45 tests)

**Responsibilities:**
- Comprehensive test suite for jump CRUD, columns, hotkeys, filtering
- Runs in-app (admin only) for quick verification
- Writes results to file (for CI/CD)

**Test Categories:**
- Jump creation, editing, deletion
- Column operations
- Hotkey parsing and validation
- Click tracking
- Team filtering
- Sync behavior
- Preference persistence

**Run Tests:**
- Admin only (check email === jeffroder@gmail.com)
- Tests nav item appears in sidebar
- Click "Tests" → "Run All Tests" button
- Results displayed in modal + written to ~/JumpKit Appdata/test-results.txt

---

### `css/vars.css` — Design Tokens & Theme Variables

**Responsibilities:**
- Define all CSS variables for dark/light theme
- Color palette, spacing, shadows, transitions
- Tabler Icons integration

**Color Palette:**
- `--royal`: `#1A4FD6` (royal blue)
- `--turq`: `#00C2C7` (turquoise)
- `--hover-accent`: `#2B9ED8` (hover blue)

**Dark Theme (Default):**
- `--bg`: `#080F1A` (almost black)
- `--bg-card`: `#0E1827` (card background)
- `--text`: `#C8D6E8` (light text)
- `--text-muted`: `#7A93B4` (dimmed text)
- `--border`: `rgba(255,255,255,0.09)` (subtle borders)

**Light Theme:**
- `--bg`: `#F0F4FA` (off-white)
- `--bg-card`: `#FFFFFF` (white)
- `--text`: `#2C3E52` (dark text)
- `--text-muted`: `#5A6A7E` (dimmed text)
- `--border`: `rgba(0,0,0,0.10)` (subtle borders)

**Toggling Theme:**
```javascript
// In app.js
document.documentElement.dataset.theme = 'dark' || 'light';
localStorage.setItem('jk_theme', 'dark' || 'light');
```

---

### `css/app.css` — Component Styles

**Responsibilities:**
- All reusable component styles
- Layout grids and flexboxes
- Animations and transitions
- Responsive design hints (some mobile styles)

**Major Component Classes:**
- `.app-shell` — Root container (sidebar + main)
- `.sidebar` — Collapsed state via `.collapsed`
- `.nav-item` — Navigation buttons
- `.topbar` — Header bar
- `.page-content` — Dynamic content area
- `.modal-*` — Modal structure
- `.toast` — Notification styles
- `.btn-*` — All button variants
- `.form-*` — Form element styles
- `.custom-select` — Dropdown component
- `.toggle` — Toggle switch
- `.jump-item` — Jump card in grid
- `.column` — Column container
- `.stats-*` — Statistics page styles

---

## 4. Database Schema

### SQLite (Local)

**All tables exist in `jumpkit.db` (stored in app-data/ directory):**

#### `jumps`
```sql
id TEXT PRIMARY KEY,
userId TEXT NOT NULL,
name TEXT NOT NULL,
url TEXT NOT NULL,
description TEXT DEFAULT '',
reason TEXT DEFAULT '',
columnId TEXT,
hotkey TEXT DEFAULT '',
favorite INTEGER DEFAULT 0,
isArchived INTEGER DEFAULT 0,
clickCount INTEGER DEFAULT 0,
lastUsed INTEGER,  -- timestamp
createdAt INTEGER,
updatedAt INTEGER,
isShared INTEGER DEFAULT 0,
teamId TEXT DEFAULT NULL,
timeSaved REAL DEFAULT NULL,           -- optional override
timeSavedUnit TEXT DEFAULT NULL,
supabaseId TEXT DEFAULT NULL
```

#### `columns`
```sql
id TEXT PRIMARY KEY,
userId TEXT NOT NULL,
name TEXT NOT NULL,
visible INTEGER DEFAULT 1,
`order` INTEGER DEFAULT 0,
createdAt INTEGER,
isShared INTEGER DEFAULT 0,
teamId TEXT DEFAULT NULL,
supabaseId TEXT DEFAULT NULL           -- UUID from shared_columns.id
```

#### `sync_state`
```sql
key TEXT PRIMARY KEY,
value TEXT                             -- lastSync timestamp, etc.
```

#### `click_log`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
userId TEXT NOT NULL,
jumpId TEXT NOT NULL,
ts INTEGER NOT NULL                    -- timestamp
```

#### `user_prefs`
```sql
userId TEXT PRIMARY KEY,
startPage TEXT DEFAULT 'home',
timePerClick REAL DEFAULT 10,
dollarsPerHour REAL DEFAULT 150,
showDescription INTEGER DEFAULT 0,
showHotkey INTEGER DEFAULT 0,
subscriptionStatus TEXT DEFAULT 'free',
subscriptionTier TEXT DEFAULT 'free',
role TEXT DEFAULT 'team-member',
notifications INTEGER DEFAULT 1,
cloudBackup INTEGER DEFAULT 0,
autoArchive TEXT DEFAULT 'never',
navDefaultCollapsed INTEGER DEFAULT 0
```

---

### Supabase (Cloud)

**Tables with RLS enabled:**

#### `profiles`
```sql
id UUID PRIMARY KEY (auth.users.id),
email TEXT NOT NULL,
first_name TEXT DEFAULT '',
last_name TEXT DEFAULT '',
role TEXT ('org-owner', 'team-owner', 'team-member'),
org_id UUID REFERENCES organizations(id),
subscription_status TEXT ('free', 'active', 'overdue', 'cancelled'),
subscription_tier TEXT ('free', 'core', 'teams_jet'),
trial_launches_used INTEGER DEFAULT 0,
ls_customer_id TEXT,
created_at TIMESTAMPTZ
```

#### `organizations`
```sql
id UUID PRIMARY KEY,
name TEXT NOT NULL,
owner_id UUID REFERENCES auth.users(id),
created_at TIMESTAMPTZ
```

#### `teams`
```sql
id UUID PRIMARY KEY,
org_id UUID REFERENCES organizations(id),
name TEXT NOT NULL,
team_password_hash TEXT NOT NULL,      -- SHA-256 hash
owner_id UUID REFERENCES profiles(id),
created_at TIMESTAMPTZ
```

#### `team_members`
```sql
id UUID PRIMARY KEY,
team_id UUID REFERENCES teams(id),
user_id UUID REFERENCES profiles(id),
joined_at TIMESTAMPTZ,
UNIQUE(team_id, user_id)
```

#### `team_invites`
```sql
id UUID PRIMARY KEY,
team_id UUID REFERENCES teams(id),
email TEXT NOT NULL,
invited_by UUID REFERENCES profiles(id),
status TEXT ('pending', 'accepted'),
invited_at TIMESTAMPTZ
```

#### `shared_columns`
```sql
id UUID PRIMARY KEY,
team_id UUID REFERENCES teams(id),
name TEXT NOT NULL,
position INTEGER DEFAULT 0,
created_by UUID REFERENCES profiles(id),
created_at TIMESTAMPTZ
```

#### `shared_jumps`
```sql
id UUID PRIMARY KEY,
shared_column_id UUID REFERENCES shared_columns(id),
team_id UUID REFERENCES teams(id),
name TEXT NOT NULL,
url TEXT NOT NULL,
description TEXT,
reason TEXT,
position INTEGER DEFAULT 0,
created_by UUID REFERENCES profiles(id),
created_at TIMESTAMPTZ,
updated_at TIMESTAMPTZ
```

---

### Key Relationships

- **users** (Supabase Auth) ↔ **profiles** (one-to-one, on auth trigger)
- **profiles** → **organizations** (many-to-one by org_id)
- **organizations** → **teams** (one-to-many)
- **teams** ↔ **team_members** (many-to-many, join table)
- **teams** → **shared_columns** (one-to-many)
- **shared_columns** → **shared_jumps** (one-to-many)
- **organizations** ↔ **team_invites** (pending invites stored per team)
- **deployments** — standalone admin record, one row per release version (no FK to other tables)

---

#### `deployments` _(admin-only, Supabase)_
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_at TIMESTAMPTZ DEFAULT now(),
version TEXT NOT NULL,                -- e.g. '1.2.3'
status TEXT DEFAULT 'testing_in_progress',
                                      -- 'testing_in_progress' | 'testing_complete' | 'deployed'
-- Mac run
mac_testing_account TEXT,             -- email of tester
mac_tests_total INT,                  -- count of Mac-applicable tests
mac_tests_passed INT,
mac_tests_failed INT,
mac_tests_skipped INT,
mac_finalized_at TIMESTAMPTZ,         -- set when Mac run is finalized
-- Windows run
win_testing_account TEXT,
win_tests_total INT,                  -- count of Win-applicable tests (excludes mac-only)
win_tests_passed INT,
win_tests_failed INT,
win_tests_skipped INT,
win_finalized_at TIMESTAMPTZ,         -- set when Windows run is finalized
-- Shared / deployment
testing_completed_at TIMESTAMPTZ,     -- set when BOTH runs finalized
results_file TEXT,                    -- path to JumpKit_ReleaseTesting_vX.Y.Z.html
deployment_folder TEXT,               -- chosen deployment output folder
mac_installer_path TEXT,
win_installer_path TEXT,
commit_id TEXT,
deployed_at TIMESTAMPTZ,
deploy_account TEXT,
deploy_results_file TEXT,
notes TEXT
```
_RLS: admin role only (`profiles.role = 'admin'`)._

---

## 5. Key Concepts & Data Flows

### 5a. Jumps — The Core Resource

**What is a jump?**
A jump is a saved link (web URL or local file path) that users can click or trigger via hotkey to instantly launch it.

**Jump Lifecycle:**

1. **Create**: User clicks "Add Jump" → modal → enter name, URL, column, hotkey → save
2. **Launch**: Click jump → open URL in browser or path in file explorer → log click
3. **Edit**: Click jump context menu → "Edit" → modify fields → save
4. **Archive**: Click "Delete" → move to archive (soft delete, reversible)
5. **Restore**: View archive → restore archived jump
6. **Delete Forever**: From archive, permanently delete (hard delete, irreversible)

**Click Tracking & ROI:**
```javascript
// On jump click:
DB.logClick(userId, jumpId);           // Insert into click_log
const jump = DB.getJump(jumpId);
jump.clickCount++;
jump.lastUsed = Date.now();
DB.updateJump(userId, jumpId, jump);   // Update in-memory cache + fire IPC

// Stats calculation:
const totalClicks = allJumps.reduce((sum, j) => sum + j.clickCount, 0);
const timePerClick = jump.timeSaved || prefs.timePerClick;  // per-jump override or global default
const totalSeconds = totalClicks * timePerClick;
const dollars = (totalSeconds / 3600) * prefs.dollarsPerHour;
```

**Hotkeys:**
```javascript
// In global keydown listener (app.js):
const chord = buildChord(e);  // "Ctrl+Shift+G"
const match = DB.getActiveJumps(userId).find(j =>
  j.hotkey?.replace(/\s/g, '').toLowerCase() === chord.replace(/\s/g, '').toLowerCase()
);
if (match) {
  e.preventDefault();
  handleJumpClick(match.id);
}

// Hotkey format: "Ctrl+Alt+Shift+X" (space-insensitive)
```

**Auto-Archive:**
```javascript
// On app load, if user has autoArchive setting:
const threshold_ms = days * 24 * 60 * 60 * 1000;
const toArchive = allJumps.filter(j =>
  j.lastUsed && (now - j.lastUsed) > threshold_ms
);
toArchive.forEach(j => DB.updateJump(userId, j.id, { isArchived: 1 }));
addNotification({ message: `${toArchive.length} jumps auto-archived` });
```

---

### 5b. Columns — Organization

**What is a column?**
A column is a category/folder that groups related jumps. Users can have up to 10 columns.

**Column Properties:**
```javascript
{
  id: 'nanoid',
  userId: 'user-id',
  name: 'Emails',
  visible: boolean,                    // show/hide column
  order: 0,                            // 0-9 for ordering
  createdAt: timestamp,
  isShared: 0 | 1,                     // 1 if shared with team
  teamId: 'team-id' || null,
  supabaseId: 'uuid' || null,          // references shared_columns.id
}
```

**Column Ordering:**
```javascript
// Drag-to-reorder on Jumps page:
// User drags column header → fires onDragEnd
// Reorder array locally → saveColumnOrder(reorderedCols)
// Updates DB immediately, fires IPC

// Visual re-render by order ASC:
const cols = DB.getColumns(userId).sort((a, b) => a.order - b.order);
```

**Column Sharing:**
```javascript
// Team-owner marks column "Shared with Team"
// In "Configure Columns" modal:
shareColumnWithTeam(columnId, teamId);
  // 1. Mark column isShared=1, teamId=teamId
  // 2. Call syncColumnToSupabase(column)
  // 3. Insert into Supabase shared_columns
  // 4. Move all jumps in column to Supabase shared_jumps
  // 5. On next sync, other team members pull them down

// Team member receives shared column:
// 1. sync.js pulls shared_columns + shared_jumps from Supabase
// 2. Upserts into local SQLite (same column.id from cloud)
// 3. Jumps marked isShared=1 in UI
```

---

### 5c. Teams & Organizations

**Roles:**

| Role | Can Create Org | Can Create Teams | Can Invite Members | Can Assign Hotkeys to Shared Jumps | See All Org Data |
|---|---|---|---|---|---|
| org-owner | ✅ | ✅ | ✅ (via team-owner) | N/A | ✅ |
| team-owner | ❌ | ❌ | ✅ | ❌ | ❌ |
| team-member | ❌ | ❌ | ❌ | ✅ (local only) | ❌ |

**Invite Flow (step-by-step):**

1. **Team-owner opens "Invite Members"**
   - Enters email addresses (comma-separated)
   - System sends email via Resend (Edge Function `send-invite`)
   - `team_invites` row created with status='pending'

2. **Invited user receives email**
   - Email contains Windows + macOS download links
   - Instructions: "Download JumpKit, go to 'Join a Team', enter org name + team name + password"

3. **Invited user joins**
   - Download JumpKit
   - In auth, click "Join a Team" tab
   - Enter: org name, team name, team password, personal password
   - Click "Join"

4. **Join Logic (in teams.js)**
   ```javascript
   // User submits join form:
   const orgName = document.getElementById('joinOrgName').value;
   const teamName = document.getElementById('joinTeamName').value;
   const teamPass = document.getElementById('joinTeamPass').value;
   const personalPass = document.getElementById('joinPersonalPass').value;

   // 1. Verify team exists (query Supabase)
   const { data: team } = await supabaseClient
     .from('teams')
     .select('*')
     .match({ name: teamName })
     .single();

   // 2. Hash input password, compare with team_password_hash
   const inputHash = await hashPassword(teamPass);
   if (inputHash !== team.team_password_hash) {
     showError('Incorrect team password');
     return;
   }

   // 3. Create Supabase auth account
   const { data, error } = await supabaseClient.auth.signUp({
     email: userEmail,
     password: personalPass,
     options: { data: { first_name: firstName } }
   });

   // 4. Insert into team_members (trigger by invite logic, or manually)
   await supabaseClient.from('team_members').insert({
     team_id: team.id,
     user_id: authUser.id,
   });

   // 5. Mark invite as accepted
   await supabaseClient.from('team_invites').update({
     status: 'accepted'
   }).match({ email: userEmail, team_id: team.id });

   // 6. Redirect to app
   window.location.href = 'app.html';
   ```

5. **On Next Sync**
   - sync.js fetches `team_members` for current user
   - Finds all teams user is member of
   - Pulls `shared_columns` + `shared_jumps` for those teams
   - Upsets into local SQLite

**Shared Jump Restrictions:**
- Team members see jumps with `isShared=1` and read-only UI badge
- Cannot edit, delete, or move shared jumps
- **CAN** assign their own local hotkey (never syncs)
- Team-owner controls content via `shared_jumps` table in Supabase

---

### 5d. Sync Engine — The Bridge

**Architecture:**
```
Supabase (cloud)
  ↓ [Pull on login + every 60 min]
Renderer (sync.js)
  ↓ [Pass to main process]
Main (main.js IPC handler)
  ↓ [SQLite upsert]
SQLite DB
  ↓ [Update in-memory cache]
Renderer Cache (DB._cache)
  ↓ [Render UI]
User sees shared jumps
```

**When Sync Runs:**
1. On login (called from `initApp()`)
2. Every 60 minutes (setInterval in `sync.js`)

**What Gets Synced:**
- **Shared columns** from Supabase `shared_columns` table
- **Shared jumps** from Supabase `shared_jumps` table
- **Hotkeys are NOT synced** — each user's hotkey assignment is local

**How Duplicates Are Prevented:**
```javascript
// Columns: deduplicate by (team_id + name)
const deduped = Object.values(
  remoteCols.reduce((acc, rc) => {
    const key = rc.team_id + '|' + rc.name;
    if (!acc[key] || rc.created_at > acc[key].created_at) acc[key] = rc;
    return acc;
  }, {})
);

// Jumps: match by supabaseId (UUID from shared_jumps.id)
// If local row has supabaseId matching remote.id, it's an update
// If local row has no supabaseId, it's new
```

**Hotkey Preservation:**
```javascript
// Before upsert:
const hotkeyMap = {};
existingJumps.forEach(j => { if (j.hotkey) hotkeyMap[j.id] = j.hotkey; });

// During upsert:
upsert.run({
  ...remoteJump,
  hotkey: hotkeyMap[remoteJump.id] || remoteJump.hotkey || '',  // Preserve local!
});
```

**Stale Cleanup:**
```javascript
// Remove local shared jumps no longer in remote
const staleLocalJumps = existingJumps.filter(j =>
  j.isShared && j.teamId && remoteTeamIds.includes(j.teamId) && j.supabaseId && !remoteIds.has(j.supabaseId)
);
// Delete them from DB
```

---

### 5e. Authentication — Supabase Auth

**Sign Up Flow:**
```
User enters email + password (+ name)
  ↓
Supabase Auth validates + creates auth.users row
  ↓
Trigger: on_auth_user_created → INSERT INTO profiles (auto-create)
  ↓
Client stores session token in browser memory
  ↓
localStorage tracks: role, subscription_tier, subscription_status
  ↓
Local SQLite user profile created (if first device)
  ↓
App seeds default columns + example jumps
  ↓
Ready to use!
```

**Sign In Flow:**
```
User enters email + password
  ↓
Supabase Auth validates credentials
  ↓
Client stores session token
  ↓
App checks: localStorage user exists?
  ↓
If not: create local SQLite profile (first device for Supabase user)
  ↓
Load all data from SQLite into in-memory cache
  ↓
Fetch Supabase profile (role, subscription info)
  ↓
Trigger sync to pull shared jumps
  ↓
Ready!
```

**Role System:**
```javascript
// On login, fetch profile.role:
const { data: profile } = await supabaseClient
  .from('profiles')
  .select('role')
  .eq('id', authUser.id)
  .single();

// Used to determine which Team view to show:
if (profile.role === 'org-owner') renderOrgOwnerView(...);
else if (profile.role === 'team-owner') renderTeamOwnerView(...);
else renderTeamMemberView(...);
```

**Subscription Tracking:**
```javascript
// From profile:
{
  subscription_status: 'free' | 'active' | 'overdue' | 'cancelled',
  subscription_tier:   'free' | 'core' | 'teams_jet',
  trial_launches_used: 0,
  ls_customer_id:      'cus_123...',
}

// Updated by Lemon Squeezy webhook (ls-webhook edge function)
// Triggers paywall if: status='overdue' || status='cancelled'
// OR if free tier and trial_launches_used >= 250
```

---

### 5f. Testing & Deployment Flow (Admin)

JumpKit has a built-in release testing + deployment workflow accessible only to admins.
All state is persisted in `localStorage` and Supabase `deployments` table.

---

#### localStorage Keys

| Key | Contents |
|-----|----------|
| `jk_rel…ting` (`_RT_KEY`) | Active session state: `{ version, macFinalized, winFinalized, activeRun, deploymentRecordId }` |
| `jk_deploy_config` | Shared config: `{ version, resultsFilePath, deploymentRecordId, folder }` |
| `jk_deploy_state` | Deployment checklist step states (todo/completed) |

---

#### Testing Flow (js/tests.js)

```
1. Admin opens Testing page → clicks “Manage Testing”
   └─ Enter version number → click “Start Session”
   └─ _RT_KEY written: { version, macFinalized:false, winFinalized:false, activeRun:'mac' }

2. Mac Run (activeRun = 'mac' by default)
   └─ Header toggle shows: [Mac ■] [Windows] — Mac active
   └─ All tests shown normally
   └─ Run tests — auto + manual

3. Save Results (any section: Pre-Flight / Auto / Auto+Manual / Manual)
   └─ Check jk_deploy_config.resultsFilePath
       └─ NOT set: OS folder picker → user picks folder
             File created: JumpKit_ReleaseTesting_vX.Y.Z.html
             Path saved to jk_deploy_config.resultsFilePath
       └─ Already set: update that file
   └─ HTML file = two tabs (Mac tab + Windows tab), self-contained
   └─ Embedded JSON data block preserved for “Load Results from File”

4. Finalize Mac Run → Manage Testing modal → “Finalize Mac Run” button
   └─ Compute scorecard (all tests: pass/fail/skip counts)
   └─ deploymentRecordId not set → INSERT to Supabase deployments:
         { version, results_file, mac_tests_*, mac_finalized_at, status:'testing_in_progress' }
         UUID returned → saved to jk_deploy_config.deploymentRecordId
   └─ _RT_KEY.macFinalized = true
   └─ Modal re-opens showing Mac: ✅ Finalized

5. Switch to Windows Run
   └─ Click [Windows] toggle in header
   └─ _RT_KEY.activeRun = 'windows'
   └─ Tests re-render:
         Mac-only tests (platforms:['’mac']) → greyed out, “Mac Only” badge, Run disabled
         Auto-pre-skipped in _jkTestResults if not already set
   └─ Run Windows-applicable tests

6. Save Results (Windows)
   └─ Same file, both tabs updated
   └─ Windows tab: Mac-only tests shown as N/A, not counted in totals

7. Finalize Windows Run → Manage Testing modal → “Finalize Windows Run” button
   └─ Compute scorecard (Windows-applicable tests only — excludes mac-only from total)
   └─ deploymentRecordId exists → UPDATE Supabase deployments:
         { win_tests_*, win_finalized_at, testing_completed_at, status:'testing_complete' }
   └─ _RT_KEY.winFinalized = true
   └─ Modal shows green banner: “✅ Testing complete! Head to Deployments.”
```

**HTML Output File format:**
```
JumpKit_ReleaseTesting_vX.Y.Z.html
  ├─ Header (version, date, tester account info)
  ├─ Tab buttons: [Mac Run (X/Y passed)] [Windows Run (X/Y passed)]
  ├─ Mac tab: all tests, collapsible by section, pass/fail/skip per row
  ├─ Windows tab: same tests, Mac-only rows shown as "N/A – Mac Only" (muted)
  └─ <script type="application/json" id="jk-release-data"> — embedded JSON for reload
```

**Test platform field:**
```javascript
// Each test in JK_TESTS can have:
platforms: ['mac']           // Mac-only — skipped/N/A on Windows run
platforms: ['mac','windows'] // Both (or omit field = same)
// No platforms field = applies to both
```

---

#### Deployment Flow (js/deployment.js)

```
1. Admin opens Deployment page
   └─ Checklist of 5 phases: Code & Version, Backup, Build Installers, Landing, Release
   └─ Each step toggled Done / To Do, persisted in localStorage jk_deploy_state

2. Manage Deployment modal
   └─ Dropdown: select a finalized testing record from Supabase deployments
   └─ Info block shows: Mac ✅/⏳, Win ✅/⏳, pass counts, status
   └─ Deployment Folder: Choose… → directory picker
         Saved to jk_deploy_config.folder + updates Supabase deployments.deployment_folder
   └─ Mac / Win installer path fields
   └─ Notes field
   └─ Save — persists installer paths + notes to Supabase

3. Save Results button (deploy page)
   └─ Generates JumpKit_Deployment_vX.Y.Z.html in deployment folder
   └─ Shows all checklist phase steps + Done/To Do status

4. Finalize Deployment
   └─ Fetches latest git commit ID via IPC (getLatestCommitId)
   └─ Confirmation modal shows: commit ID, deployed by, timestamp, installer files
   └─ On confirm: UPDATE deployments:
         { commit_id, deployed_at, deploy_account, status:'deployed', mac/win installer paths }
   └─ Toast: “Deployment finalized! 🚀”
```

**Status progression:**
```
testing_in_progress → (first run finalized)
testing_complete    → (both runs finalized)
deployed            → (Finalize Deployment clicked)
```

---

## 6. UI Components

### Modal

**Usage:**
```javascript
Modal.open(
  '<i class="ti ti-users"></i> Add Team Member',
  '<div class="form-group"><label>Email</label><input id="memberEmail"/></div>',
  '<button class="btn btn-subtle" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="inviteMember()">Send Invite</button>'
);
Modal.close();
```

**Properties:**
- **overlay**: Dark semi-transparent background, clickable to close
- **box**: Centered white/dark card
- **title**: Icon + text at top
- **body**: Dynamic content (HTML string)
- **footer**: Buttons (empty string = no footer)

**Behavior:**
- Escape key closes
- Click overlay closes
- Click X button closes

---

### Toast

**Usage:**
```javascript
Toast.success('Jump saved!');
Toast.danger('Failed to save jump');
```

**Behavior:**
- Auto-dismisses after 3 seconds
- Replaces previous toast
- Icon + message centered
- Green for success, red for danger

---

### CtxMenu (Context Menu)

**Usage:**
```javascript
CtxMenu.show(e.clientX, e.clientY, [
  { icon: '<i class="ti ti-edit"></i>', label: 'Edit', action: () => editJump() },
  { icon: '<i class="ti ti-copy"></i>', label: 'Duplicate', action: () => duplicateJump() },
  'divider',
  { icon: '<i class="ti ti-trash"></i>', label: 'Delete', action: () => deleteJump(), danger: true },
]);
CtxMenu.hide();
```

**Properties:**
- **x, y**: Absolute position
- **items**: Array of objects or `'divider'` string
- **item.icon**: HTML for icon
- **item.label**: Text
- **item.action**: Callback on click
- **item.danger**: Red styling if true

**Behavior:**
- Clamps to viewport (doesn't go off-screen)
- Closes on click
- Closes on escape

---

### Custom Select (wireDropdown)

**Usage:**
```html
<div class="custom-select" id="myDrop">
  <div class="custom-select-trigger" id="myTrigger">
    <span id="myLabel">Select an option</span>
    <i class="ti ti-chevron-down"></i>
  </div>
  <div class="custom-select-menu" id="myMenu">
    <div class="custom-select-option" data-value="opt1">Option 1</div>
    <div class="custom-select-option" data-value="opt2">Option 2</div>
    <div class="custom-select-option" data-value="opt3">Option 3</div>
  </div>
</div>

<script>
wireDropdown({
  dropId: 'myDrop',
  triggerId: 'myTrigger',
  menuId: 'myMenu',
  labelId: 'myLabel',
  inputId: 'myValue',          // optional hidden input
  onSelect: (option) => {       // optional callback
    console.log('Selected:', option.dataset.value);
  }
});
</script>
```

**Behavior:**
- Arrow keys navigate options (highlight, no close)
- Enter / Space confirms selection
- Escape closes
- Click option confirms
- Updates label + hidden input on select
- Calls onSelect callback (if provided)

---

### Custom Select (CSS Classes)

```html
<div class="custom-select">
  <div class="custom-select-trigger">Label</div>
  <div class="custom-select-menu">
    <div class="custom-select-option selected">Option 1</div>
    <div class="custom-select-option">Option 2</div>
  </div>
</div>
```

**CSS States:**
- `.custom-select.open` — menu visible
- `.custom-select-option.selected` — highlighted/chosen
- `.custom-select-option.kbfocus` — keyboard focus (for arrow keys)

---

### Toggle / Checkbox

```html
<label class="toggle">
  <input type="checkbox" checked />
  <span class="toggle-slider"></span>
</label>
```

**Behavior:**
- Styled as pill-shaped toggle with animated slider
- Checkbox hidden, slider visible
- Fully keyboard accessible

---

### buildChord — Hotkey Parser

```javascript
window.buildChord = function buildChord(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey)               parts.push('Alt');
  if (e.shiftKey)             parts.push('Shift');
  if (['Control','Alt','Shift','Meta'].includes(e.key)) return null;
  let key = e.key;
  if (e.code.startsWith('Digit'))      key = e.code.replace('Digit','');
  else if (e.code.startsWith('Key'))   key = e.code.replace('Key','');
  else if (/^F\d+$/.test(e.code))      key = e.code;
  else if (e.key.length === 1)         key = e.key.toUpperCase();
  parts.push(key);
  return parts.join('+');  // "Ctrl+Shift+G"
}

// Returns null if user only pressed modifiers (Ctrl alone)
// Space-insensitive comparison: "Ctrl+Shift+G" === "ctrl+shift+g"
```

---

### Sidebar Collapse

**localStorage key:** `jk_sidebar_collapsed`
**Value:** `'0'` or `'1'`
**Preference key:** `user_prefs.navDefaultCollapsed`

```javascript
// On toggle:
sidebar.classList.toggle('collapsed');
localStorage.setItem('jk_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');

// On startup, apply saved pref:
const navPrefs = DB.getPrefs(userId);
if (navPrefs.navDefaultCollapsed) {
  sidebar.classList.add('collapsed');
}
```

**CSS:** When `.collapsed` class added:
- Sidebar width shrinks to icon-only
- Nav labels hidden
- Icons remain visible
- Tooltip on hover shows label

---

## 7. IPC Handlers (main.js ↔ renderer)

**All IPC handlers are request-response pairs:**

### Jumps

#### `get-jumps`
```javascript
// Renderer:
const jumps = await window.electronAPI.getJumps(userId);

// Main:
ipcMain.handle('get-jumps', (_e, userId) => {
  if (!db) return [];
  return db.prepare('SELECT * FROM jumps WHERE userId = ?').all(userId);
});
```

#### `save-jump`
```javascript
// Renderer:
await window.electronAPI.saveJump(userId, jump);

// Main:
ipcMain.handle('save-jump', (_e, userId, jump) => {
  if (!db) return { ok: false };
  try {
    db.prepare(`INSERT OR REPLACE INTO jumps (...) VALUES (...)`).run({...jump});
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});
```

#### `delete-jump`
```javascript
// Renderer:
await window.electronAPI.deleteJump(userId, jumpId);

// Main:
ipcMain.handle('delete-jump', (_e, userId, id) => {
  if (!db) return { ok: false };
  db.prepare('DELETE FROM jumps WHERE id = ? AND userId = ?').run(id, userId);
  return { ok: true };
});
```

---

### Columns

#### `get-columns`
```javascript
const columns = await window.electronAPI.getColumns(userId);
```

#### `save-columns` (bulk replace)
```javascript
// Replace all columns for user:
await window.electronAPI.saveColumns(userId, [
  { id: '1', name: 'Col 1', visible: 1, order: 0, ... },
  { id: '2', name: 'Col 2', visible: 1, order: 1, ... },
]);
```

#### `save-column` (single upsert)
```javascript
// Upsert one column:
await window.electronAPI.saveColumn(userId, {
  id: 'col-1',
  name: 'Updated Name',
  visible: 1,
  order: 2,
});
```

---

### Sync

#### `sync-jumps`
```javascript
// Renderer (sync.js):
const result = await window.electronAPI.syncJumps({
  sharedColumns: [...],
  sharedJumps: [...],
});
// Returns: { ok: true } or { ok: false, reason: '...' }
```

#### `upsert-shared-jumps`
```javascript
// Upsert array of jumps (preserve local hotkeys):
await window.electronAPI.upsertSharedJumps([jump1, jump2, ...]);
```

#### `delete-shared-jumps`
```javascript
// Delete shared jumps by ID:
await window.electronAPI.deleteSharedJumps(['id1', 'id2', ...]);
```

---

### Preferences

#### `get-prefs`
```javascript
const prefs = await window.electronAPI.getPrefs(userId);
```

#### `save-prefs`
```javascript
await window.electronAPI.savePrefs(userId, {
  startPage: 'home',
  timePerClick: 10,
  showDescription: false,
  // ... all preference fields
});
```

---

### Click Log

#### `get-click-log`
```javascript
const log = await window.electronAPI.getClickLog(userId);
// Returns: [{ id, userId, jumpId, ts }, ...]
```

#### `log-click`
```javascript
await window.electronAPI.logClick(userId, jumpId, timestamp);
```

---

### Sync State

#### `get-sync-state`
```javascript
const lastSync = await window.electronAPI.getSyncState('lastSync');
// Returns: '1704067200000' or null
```

#### `update-sync-state`
```javascript
await window.electronAPI.updateSyncState('lastSync', Date.now().toString());
```

---

### Files

#### `open-url`
```javascript
// Open URL in browser or path in file explorer:
await window.electronAPI.openUrl('https://google.com');
await window.electronAPI.openUrl('~/Documents');
await window.electronAPI.openUrl('C:\\Users\\John\\Desktop');
```

**Main logic:**
```javascript
ipcMain.handle('open-url', (_e, url) => {
  const isWeb = /^(https?:\/\/|www\.)/i.test(url);
  const fullUrl = isWeb && url.startsWith('www.') ? 'https://' + url : url;

  if (isWeb) {
    shell.openExternal(fullUrl);
  } else {
    shell.openPath(url);  // Cross-platform file explorer
  }
});
```

---

### Backup

#### `save-backup`
```javascript
const backup = {
  version: 1,
  exportedAt: new Date().toISOString(),
  userId: currentUser.id,
  email: currentUser.email,
  jumps: DB.getJumps(userId),
  columns: DB.getColumns(userId),
  prefs: DB.getPrefs(userId),
};
const result = await window.electronAPI.saveBackup(JSON.stringify(backup, null, 2));
// Returns: { ok: true, path: '~/Documents/JumpKit Backups/jumpkit-backup-2024-01-15T10-30-45.json' }
```

---

## 8. Supabase RLS Policies Summary

### Why RLS?

Row-Level Security (RLS) restricts database access at the SQL level based on the current authenticated user. This ensures:
- Users can only see/modify their own data
- Team-owners can see their team data
- Org-owners can see all org data
- No permission checks needed in application code

### Helper Functions

#### `current_user_role()`
```sql
SELECT COALESCE(
  (SELECT role FROM profiles WHERE id = auth.uid()),
  'anon'
);
```
Returns: `'org-owner'`, `'team-owner'`, `'team-member'`, or `'anon'`

#### `current_user_org()`
```sql
SELECT org_id FROM profiles WHERE id = auth.uid();
```
Returns: UUID of user's organization, or NULL

#### `is_team_member(p_team_id UUID)`
```sql
SELECT EXISTS (
  SELECT 1 FROM team_members
  WHERE team_id = p_team_id AND user_id = auth.uid()
);
```
Returns: TRUE if user is member of team

#### `is_team_owner(p_team_id UUID)`
```sql
SELECT EXISTS (
  SELECT 1 FROM teams
  WHERE id = p_team_id AND owner_id = auth.uid()
);
```
Returns: TRUE if user owns team

---

### Policy Summary

#### `profiles`
- **SELECT**: Users see own row OR org-owner sees all in org
- **INSERT**: Users create own row
- **UPDATE**: Users update own row

#### `organizations`
- **SELECT**: Owner sees own org OR member sees their org
- **INSERT**: Only org-owners can create
- **UPDATE**: Only owner can update

#### `teams`
- **SELECT**: Org-owner sees all in org OR team-owner sees own OR member sees own
- **INSERT**: Org-owner only
- **UPDATE**: Org-owner OR team-owner

#### `team_members`
- **SELECT**: Org-owner sees all OR team-owner sees members OR user sees self
- **INSERT**: Team-owner/org-owner OR user self-adding (for join)
- **DELETE**: Team-owner or org-owner only

#### `team_invites`
- **SELECT**: Team-owner/org-owner see all OR user sees invites to their email
- **INSERT**: Team-owner/org-owner only
- **UPDATE**: Invited user can accept, or team-owner/org-owner

#### `shared_columns` & `shared_jumps`
- **SELECT**: Team members see columns/jumps for their teams only
- **INSERT**: Team-owner/org-owner create
- **UPDATE**: Creator or owner
- **DELETE**: Team-owner/org-owner or org-owner

---

## 9. Build & Development

### Running Locally

**Prerequisites:**
- Node.js 18+ (tested on v24)
- npm
- macOS or Windows
- better-sqlite3 native module (auto-compiles during npm install)

**Steps:**
```bash
cd Topics/JumpKit/app

# Install dependencies
npm install

# Start in dev mode (Electron window opens with dev tools)
npm start

# OR build for distribution
npm run build:all
```

---

### Building for Distribution

**macOS (Universal DMG):**
```bash
npm run build:all
# Output: dist/JumpKit-1.0.0-universal.dmg
# Contains both x64 + arm64 (Apple Silicon compatible)
```

**Windows (NSIS Installer):**
```bash
npm run build:all
# Output: dist/JumpKit Setup 1.0.0.exe
```

---

### Rebuilding Native Modules

If `better-sqlite3` fails to compile after updating Node or Electron versions:
```bash
npx electron-rebuild --version 40.8.0 -f -w better-sqlite3
```

---

### Landing Page

**Location:** `Topics/JumpKit/landing/`
**Deploy:** Via Vercel under `jeffroder-3196s-projects`

```bash
cd landing

# Preview locally
npm run dev

# Deploy to production
vercel deploy --prod --token [VERCEL_TOKEN]
```

---

### Database Reset (Development)

To reset local database and reseed:
```bash
# Delete the database file:
rm ~/Library/Application\ Support/JumpKit/jumpkit.db  # macOS
# or
rm %APPDATA%/JumpKit/jumpkit.db  # Windows

# Restart app — will auto-create schema and seed
```

---

### Important Notes

**Cache-bust requirement:**
- `jumps.js` and `teams.js` have `?v=timestamp` query params in `app.html`
- This forces browsers to re-fetch when files change
- Update the timestamp in HTML when deploying

**Pre-flight checks before build:**
- Run tests: go to Settings page → Tests tab (admin only)
- Check all 45 tests pass
- Verify no console errors
- Test on both platforms if distributing

---

## 10. Known Patterns & Conventions

### Global Functions (window.*)

All functions that are called from inline HTML `onclick` attributes **must** be exposed as `window.` globals:

```javascript
// ❌ Not callable from HTML
function handleClick() { ... }

// ✅ Callable from HTML
window.handleClick = function() { ... }

// ✅ Also callable from HTML
window.handleClick = handleClick;
```

**Examples:**
```html
<button onclick="window.navigateTo('jumps')">Jumps</button>
<button onclick="window.handleJumpClick(jumpId)">Launch</button>
<button onclick="saveAccountPrefs()">Save</button>  <!-- exposed as global -->
```

---

### Database Read/Write Pattern

**Reads** are synchronous from the in-memory cache:
```javascript
const jumps = DB.getJumps(userId);  // Instant, synchronous, from cache
const prefs = DB.getPrefs(userId);  // Instant
```

**Writes** immediately update cache, then fire async IPC:
```javascript
// This happens instantly (cache updated):
DB.saveJump(userId, jump);

// IPC message sent async (no await needed):
window.electronAPI.saveJump(userId, jump);  // fire-and-forget

// No spinner, no delay — user sees result immediately
```

---

### ID Format Convention

**Local IDs:** nanoid-like strings
```javascript
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // Example: "if5q8a8u9"
}
```

**Supabase IDs:** UUIDs
```javascript
// Example: "550e8400-e29b-41d4-a716-446655440000"
// Stored in columns.supabaseId, jumps.supabaseId
```

**Tracking shared resources:**
- Local row has `supabaseId` pointing to cloud UUID
- On sync, match by `supabaseId` to avoid duplicates
- If local row has no `supabaseId`, it's a personal (never-synced) resource

---

### Dark/Light Mode

**No JS theme switching in components.** Only CSS variables:

```css
/* vars.css */
[data-theme="dark"] {
  --text: #C8D6E8;
  --bg: #080F1A;
  /* ... all vars */
}
[data-theme="light"] {
  --text: #2C3E52;
  --bg: #F0F4FA;
  /* ... all vars */
}

/* Components use variables */
.jump-item {
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
}
```

**Theme toggle (in app.js):**
```javascript
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;  // Triggers CSS repaint
  localStorage.setItem('jk_theme', next);
});
```

---

### No Markdown Tables in Docs

This documentation avoids Markdown `|` tables. Instead, uses:
- Bullet lists
- Definition lists (`term: description`)
- Code blocks with comments
- Prose descriptions

This ensures compatibility with all Markdown renderers and is easier to maintain.

---

### Icons: Tabler Icons via CDN

**All icons use Tabler Icons:**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css"/>

<!-- Usage: -->
<i class="ti ti-home"></i>           <!-- Home icon -->
<i class="ti ti-settings"></i>       <!-- Settings icon -->
<i class="ti ti-users"></i>          <!-- Users/Teams icon -->
<i class="ti ti-archive"></i>        <!-- Archive icon -->
<i class="ti ti-circle-check"></i>   <!-- Checkmark circle -->
<i class="ti ti-alert-circle"></i>   <!-- Alert circle -->
```

**Font size:** Adjust with `font-size` CSS
```css
.icon-sm { font-size: 0.9rem; }
.icon-lg { font-size: 1.5rem; }
.icon-xl { font-size: 2rem; }
```

---

### Escape HTML to Prevent XSS

Always escape user input before inserting into DOM:

```javascript
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Usage:
div.innerHTML = `<p>${esc(userInput)}</p>`;

// NOT:
div.innerHTML = `<p>${userInput}</p>`;  // ❌ XSS risk
```

---

### localStorage Keys Naming

Use prefix `jk_` for all app-specific keys:
```javascript
// ✅ Good:
localStorage.setItem('jk_theme', 'dark');
localStorage.setItem('jk_sidebar_collapsed', '1');
localStorage.setItem('jk_notifs_user123', JSON.stringify(notifs));

// ❌ Avoid:
localStorage.setItem('theme', 'dark');
localStorage.setItem('notifications', '[]');
```

This prevents collisions with other apps on the same domain.

---

## Appendix: Common Tasks

### Add a New Page

1. **Add to page router (app.js):**
   ```javascript
   const pages = {
     jumps: () => renderJumps(),
     mypage: () => renderMyPage(),  // New!
     // ...
   };

   const pageTitles = {
     mypage: 'My Page',
     // ...
   };

   const pageIcons = {
     mypage: 'ti-star',
     // ...
   };
   ```

2. **Add nav item (app.html):**
   ```html
   <button class="nav-item" data-page="mypage">
     <i class="ti ti-star nav-icon"></i>
     <span class="nav-label">My Page</span>
   </button>
   ```

3. **Create renderer function (new file or in app.js):**
   ```javascript
   function renderMyPage() {
     const pc = document.getElementById('pageContent');
     pc.innerHTML = `<div>...</div>`;
   }
   ```

---

### Add a Modal Dialog

```javascript
const body = `
  <div class="form-group">
    <label class="form-label">Email</label>
    <input class="form-input" id="myEmail" placeholder="user@example.com"/>
  </div>
  <div id="myError" class="form-error"></div>
`;

const footer = `
  <button class="btn btn-subtle" onclick="Modal.close()">Cancel</button>
  <button class="btn btn-primary" onclick="submitMyForm()">Submit</button>
`;

Modal.open('<i class="ti ti-mail"></i> Send Email', body, footer);

window.submitMyForm = function() {
  const email = document.getElementById('myEmail').value;
  if (!email) {
    document.getElementById('myError').textContent = 'Email is required';
    return;
  }
  // Do something...
  Toast.success('Email sent!');
  Modal.close();
};
```

---

### Implement Auto-Archive Logic

```javascript
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
    j.lastUsed && (now - j.lastUsed) > thresholdMs
  );

  if (toArchive.length === 0) return;

  toArchive.forEach(j => {
    DB.updateJump(currentUser.id, j.id, { isArchived: true });
  });

  const msg = toArchive.length === 1
    ? `"${toArchive[0].name}" was auto-archived`
    : `${toArchive.length} jumps were auto-archived`;

  addNotification({
    type: 'auto-archive',
    message: msg,
    ts: now
  });
};
```

---

## Conclusion

JumpKit is a thoughtfully architected desktop app that balances:
- **Local-first**: Personal data stays on device, fast synchronous reads
- **Cloud-enabled**: Teams sync via Supabase, but hotkeys remain personal
- **Secure**: RLS policies, role-based access, no data leakage by default
- **Productive**: Global hotkeys, click tracking, ROI metrics

This documentation covers architecture, data flows, components, and conventions. For specific questions about implementation details, refer to the source code and inline comments.

Happy building! 🚀


---

## Changelog

### 2026-05-10
- **Hotkey Picker:** Added "Pick" button next to hotkey input in Add/Edit Jump modal. Shows all `Ctrl+Shift+[A-Z, 0-9]` combos — green (available) or red (already used). Red combos are unselectable.
- **Theme Flash Fix:** Fixed dark mode flash on login. Theme is now set from `localStorage` via inline `<script>` in `<head>` before any CSS loads, preventing flicker.
- **Seed Data:** New users now see 3 default columns (Directories, Links, Col 3) with 3 default jumps (Home Folder/C Drive, Google, Slack) — all marked as favorites. Seeding uses `seed-new-user` IPC and only triggers when no personal columns exist.
- **Home Folder Jump:** Fixed `~` not opening in Finder — `shell.openPath` doesn't expand `~`, so it is now expanded to `os.homedir()` before opening.
- **DevTools Disabled in Production:** F12 and Cmd/Ctrl+Shift+I are blocked in packaged builds. DevTools are forcibly closed if somehow opened. Test 53 added to verify this before shipping.
- **SQLite Fix:** Rebuilt `better-sqlite3` native module (`@electron/rebuild`) to fix "not valid mach-o file" error that was silently preventing DB from loading.
- **Modal Scroll:** Add Jump modal now always scrolls to the top when opened.
- **Seed DB Files:** `data/seed-mac.db` and `data/seed-win.db` added to repo for reference/inspection. Seed data: 3 columns, 3 jumps, platform-appropriate directory paths.
- **`isPackaged` IPC:** Exposed `app.isPackaged` via IPC (`is-packaged`) so renderer can distinguish dev vs production.
- **Test 47 Fix:** Added cleanup step before insert to prevent duplicate key error on re-runs.
- **Test 53 Added:** Security test — verifies DevTools are disabled in production builds.
- **`seed-new-user` Updated:** Column names updated to Directories/Links/Col 3–10. Jump placement corrected (directories in col 0, links in col 1).
- **Vercel DNS Fix:** Updated GoDaddy A record for `jumpkit.app` from old AWS IPs to `76.76.21.21` (Vercel). SSL cert now valid.
- **Landing Page — Hero:** New macOS screenshots (`hero-mac-dark.jpg`, `hero-mac-light.jpg`) and Windows screenshots (`hero-windows-dark.jpg`, `hero-windows-light.jpg`) — theme-aware, stacked vertically, lightbox on click.
- **Landing Page — Lightbox:** Click hero images to open full-size with dark overlay and turquoise glow. Theme-aware (shows correct dark/light image). Esc or click to close.
- **Landing Page — Solution Section:** Replaced plain demo button with clickable screenshot thumbnail + turquoise play button. Launches Supademo on click.
- **Landing Page — Footer:** Added X, YouTube, LinkedIn social icons — circular buttons, brand color on hover.
- **Landing Page — Problem Cards:** Copy sharpened (e.g. "Locked to one browser", "Browser updates break your layout"). 4-column 2-row responsive grid (4→2→1 cols).
- **Landing Page — CTA Section:** Updated copy to sound post-launch ("Start jumping today", "Get Early Access").
- **Landing Page — Nav:** Desktop nav buttons now full-width and centered.
