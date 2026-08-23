# JumpKit — Master Product Specification
_Last updated: 2026-04-05_

---

## Overview

JumpKit is a desktop productivity app for Windows and macOS that puts all your most-used links, folders, and file shares in one place — organized in categories and launched in a single click. It saves time, tracks savings automatically, and enables AI-powered automation via Jet AI.

**Target users:** Single users, small teams, MSP-managed businesses in regulated industries (manufacturing, healthcare, legal, finance).

**Distribution:** Direct via jumpkit.app + MSP channel partners (revenue share).

**Tech stack:** Electron (vanilla HTML/CSS/JS), Supabase (auth + team data), Lemon Squeezy (payments), GitHub Releases (distribution + auto-update).

---

## Pricing Tiers

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Up to 250 jump launches, web links + local folders, hotkey launcher, filters & search, time & ROI dashboard |
| **JumpKit** | $5/mo or $39/yr | Everything in Free + unlimited launches + team sharing + optional auto-archive |
| **JumpKit + Jet AI** | $25/mo or $249/yr | Everything in JumpKit + locally-run AI + MS Office automation + audit logging |

**Lemon Squeezy variant IDs:**
- JumpKit $5/mo: `1445234`
- JumpKit + Jet AI $25/mo: `1445252`
- LS checkout URL (JumpKit): `https://jumpkit.lemonsqueezy.com/checkout/buy/d6fee6da-901c-4c1d-b474-c5eb23ee03fb`

---

## Authentication & Accounts

- **Provider:** Supabase Auth (email + password)
- **Email confirmation:** OFF (disabled for now, re-enable before public launch)
- **Profile auto-creation:** Supabase trigger `on_auth_user_created` → inserts into `profiles` table
- **Roles:** `org-owner`, `team-owner`, `team-member`
- **Subscription fields:** `subscription_status` (free/active/overdue/cancelled), `subscription_tier` (free/core/teams_jet), `ls_customer_id`, `trial_launches_used`
- **Free tier limit:** 250 total jump launches → paywall shown, upgrade to LS checkout

---

## Database Architecture

### Supabase (cloud)
- `profiles` — user profile + subscription info
- `organizations` — org name, owner
- `teams` — team name, password hash, owner, org
- `team_members` — user ↔ team membership
- `team_invites` — email + status (pending/accepted)
- `shared_columns` — team-owned jump columns
- `shared_jumps` — jumps inside shared columns
- RLS enabled on all tables

### localStorage (local, per device)
- Personal columns + jumps (never synced to Supabase)
- Cached copy of shared jumps (synced on login + every 60 min)
- `isShared` flag on synced jumps (read-only in UI, hotkey still editable)
- `sync_state` table tracks last sync timestamp

### DB fields on jump
`id, userId, name, url, description, reason, columnId, hotkey, favorite, isArchived, isShared, teamId, clickCount, lastUsed, createdAt, updatedAt`

---

## Team Sharing Architecture

### Roles

**3 roles exist: `org-owner`, `team-owner`, `team-member`**

#### `org-owner` — Top-level admin (one per organization)
- ✅ Create the organization
- ✅ Create teams
- ✅ Promote any user to `team-owner`
- ✅ See all teams, all members, all shared jumps across the org
- ✅ Delete teams
- ✅ Everything a `team-owner` can do

#### `team-owner` — Team manager (granted by org-owner)
- ✅ Invite members to their team by email
- ✅ Define shared jump columns (mark columns as "shared with team" in column config)
- ✅ Remove members from their team
- ✅ See pending invites + member list
- ❌ Cannot assign hotkeys on shared jumps (hotkeys are personal)
- ❌ Cannot see other teams they don't own
- ❌ Cannot create orgs or promote users

#### `team-member` — End user (invited to a team)
- ✅ See shared jumps from their team synced to their local app
- ✅ Assign their own hotkeys to shared jumps (stored locally only, never synced)
- ✅ See who else is on their team (read-only)
- ❌ Cannot edit, delete, or move shared jumps
- ❌ Cannot invite anyone
- ❌ Cannot create teams or orgs

#### Key rules
- Shared jumps sync from Supabase → local SQLite on login + every 60 min
- Hotkeys are always local — never synced; each user sets their own
- Personal jumps never leave the local machine — only shared columns sync to Supabase
- Free tier does not get team features — requires JumpKit ($5/mo) or above

| Role | Summary |
|---|---|
| `org-owner` | Full control — create/delete teams, promote users to team-owner |
| `team-owner` | Manage their team — invite members, define shared columns + jumps, NO hotkey assignment |
| `team-member` | View team, see shared jumps, assign own hotkeys locally only |

### Invite flow
1. Team-owner enters email addresses → invites sent via Resend (Supabase Edge Function `send-invite`)
2. Invite email: branded JumpKit email with Windows + macOS download links + join instructions
3. New user downloads app → clicks "Join a Team" tab → enters org name, team name, team password, personal password → joins

### Shared jump sync
- Trigger: login + every 60 minutes
- Pull shared columns + jumps from Supabase → upsert into localStorage
- Preserve local hotkey assignments on upsert
- Shared jumps: read-only (no edit/delete/move) — visual badge (`ti-users` icon)

---

## Landing Page

**URL:** jumpkit.app  
**Stack:** Static HTML/CSS/JS deployed via Vercel  
**Vercel project:** `jumpkit-landing` under `jeffroder-3196s-projects`

### Key design decisions
- Turquoise `#00C2C7` + royal blue `#1A4FD6` accent colors
- Dark mode default, light/dark toggle in offcanvas + header (≥1024px)
- Tabler Icons throughout (no emoji in UI)
- Section order: Hero → How It Works → Features → Dashboard → Jet AI → Pricing → CTA → Footer
- Mobile (≤782px): stacked layout, centered text
- Desktop (≥1024px): nav buttons in hero, hamburger hidden

---

## Jet AI — Architecture Spec

_Implementation target: May 2026_

### Overview
Jet AI is OpenClaw running as a background AI agent, sandboxed inside Docker (OrbStack), serving local LLMs via Ollama. Zero data leaves the machine. No API keys. Private by design.

### Install-time components
| Component | Purpose | Install method |
|---|---|---|
| **OrbStack** | Docker runtime (macOS-native, lightweight) | Homebrew during JumpKit install |
| **Ollama** | Local LLM HTTP server at `localhost:11434` | Homebrew during JumpKit install |
| **OpenClaw** | AI agent backbone running in Docker | Docker image pulled during JumpKit install |
| **Gateway** | Host-side request handler (Node.js HTTP) | Bundled with JumpKit, runs as host process |

### Runtime architecture
```
JumpKit App (Electron)
    ↕ HTTP / IPC
OpenClaw Agent (Docker container)
    ↕ Docker bridge network ONLY
Gateway Process (Node.js, host filesystem)
    ↕ Host filesystem
User's Mac/PC file system
```

### Docker isolation model
- OpenClaw runs in a Docker container on a **private bridge network**
- The bridge network has exactly two members: the OpenClaw container + the Gateway process
- OpenClaw has NO access to the internet, local network, or host filesystem directly
- The ONLY external communication is via the Gateway on the private bridge

### Gateway
- **Language:** Node.js HTTP server
- **Runs:** On the host (outside Docker), listens on private bridge network
- **Operations (extensible):**
  - Copy file (Docker → host)
  - Read file (host → Docker)
  - Delete file (host)
  - Run command (host, whitelisted commands only)
- **Security:** Request validation, allowlist enforcement, logs every request to immutable audit log

### Ollama integration
- Communication via HTTP API (`localhost:11434`) — not CLI
- JumpKit UI: model selector dropdown (lists installed models), one-click model switch
- JumpKit starts/stops Ollama on app open/close

### OpenClaw configuration UI (in JumpKit)
- Dedicated config page in JumpKit app
- Controls: agent name, user profile info, key settings
- Read/edit key OpenClaw `.md` files: `USER.md`, `SOUL.md`, `AGENTS.md`, `TOOLS.md`
- Save button → writes to OpenClaw files inside Docker
- Default config: local models via Ollama, Docker sandbox enabled

### Immutable audit log
- **Type:** Cryptographically chained (each entry hashes the previous — hard immutability)
- **Events logged:**
  - All Docker filesystem events (create, copy, delete, edit)
  - All gateway requests (with timestamp + request body)
  - App updates (version, timestamp)
- **JumpKit UI:**
  - View log entries in a table
  - Filter by date, date range, keyword
  - Export current filtered view as PDF

---

## Jet AI Part 2 (target: May 14, 2026)

- Enable web browser access for allowed websites only (enforced by gateway whitelist)
- Build workflow create/save into Jumps page — Jet AI instructions saved as reusable workflows, launchable via one-click or hotkey
- Update stats page to include Jet AI usage metrics
- Allow each jump/workflow to have a unique "time saved" field; falls back to default from Settings if not defined
- Add GitHub Mission Control OSS package and adapt UI for JumpKit (multi-agent orchestration)

---

## Build & Distribution

### macOS
- Universal DMG (x64 + arm64, ad-hoc signed)
- Built with: `npm run build:all` from `Topics/JumpKit/app/`
- Output: `dist/JumpKit-1.0.0-universal.dmg`

### Windows
- NSIS installer
- Output: `dist/JumpKit Setup 1.0.0.exe`

### Auto-Update System — Implemented ✅

#### Overview
JumpKit uses `electron-updater` (by the `electron-builder` team) combined with GitHub Releases to deliver seamless over-the-air updates to all installed copies of the app on both Mac and Windows. Updates are downloaded silently in the background and applied on the next app restart — no user action required except clicking "Restart & Update."

#### Architecture

```
Developer pushes git tag (e.g. v1.1.0)
        ↓
GitHub Actions triggered (.github/workflows/release.yml)
        ↓
  ┌─────────────────────┐    ┌──────────────────────────┐
  │  macos-latest runner │    │  windows-latest runner   │
  │  → npm run build     │    │  → npm run build:win     │
  │  → JumpKit.dmg       │    │  → JumpKit Setup.exe     │
  └─────────────────────┘    └──────────────────────────┘
        ↓                              ↓
  Both artifacts + latest-mac.yml / latest.yml published to GitHub Releases
        ↓
  Running app checks GitHub on next launch (3 second delay after startup)
        ↓
  New version found → download silently in background
        ↓
  Banner shown: "A new version is available — Restart & Update"
        ↓
  User clicks → autoUpdater.quitAndInstall() → app restarts at new version
```

#### Key Files
| File | Role |
|------|------|
| `main.js` | Imports `electron-updater`, calls `checkForUpdatesAndNotify()` 3s after launch, listens for `update-downloaded` event, exposes `install-update` IPC handler |
| `preload.js` | Exposes `electronAPI.installUpdate()` and `electronAPI.onUpdateReady(cb)` to renderer |
| `app.html` | Contains `#updateBanner` — a fixed top banner hidden until update is ready |
| `js/app.js` | Registers `onUpdateReady` listener on init, shows banner when fired |
| `package.json` | `publish` block points to `github` provider with owner `jrod4404` and repo `JumpKit`; `electron-updater` listed as a dependency |
| `.github/workflows/release.yml` | CI/CD pipeline — builds Mac + Windows on version tag push, publishes to GitHub Releases using `GH_TOKEN` secret |

#### Update Banner UI
- Fixed bar at the very top of the app window (above sidebar + content)
- Color: `var(--hover-accent)` (teal accent)
- Shows: refresh icon + message + "Restart & Update" button + dismiss (×)
- Dismiss hides the banner for the session only — update still installs on next quit

#### Configuration
- `autoUpdater.autoDownload = true` — downloads happen automatically in background without prompting
- `autoUpdater.autoInstallOnAppQuit = true` — if user never clicks "Restart & Update", the update installs cleanly on next natural quit
- Update check is skipped in dev mode (`npm start`) — only fires in packaged production builds

#### Triggering a Release
```bash
# Bump version in package.json first, then:
git add package.json
git commit -m "chore: bump version to v1.1.0"
git tag v1.1.0
git push origin main --tags
```
GitHub Actions builds both platforms and publishes the release automatically. All running copies of the app will detect it within 3 seconds of their next launch.

#### Required Secrets
| Secret | Where | Purpose |
|--------|-------|---------|
| `GH_TOKEN` | GitHub repo → Settings → Secrets → Actions | Allows electron-builder to publish release artifacts to GitHub Releases |

#### Code Signing Status
- **Current:** Unsigned — safe for dev/test on your own machines; external users see OS security warnings on first install
- **Mac:** Requires Apple Developer Program certificate ($99/yr) for Gatekeeper silent approval and trusted auto-update
- **Windows:** Requires EV code signing certificate (~$200–400/yr) to suppress SmartScreen warnings
- **Plan:** Add signing before public launch; no code changes required — only cert configuration in `electron-builder`

#### GitHub Repo
- **URL:** https://github.com/jrod4404/JumpKit
- **Branch:** `main`
- **Releases:** https://github.com/jrod4404/JumpKit/releases

---

## Key File Paths

| What | Path |
|---|---|
| App entry | `Topics/JumpKit/app/index.html` → `app.html` |
| Supabase config | `Topics/JumpKit/app/supabase/config.js` |
| Supabase schema | `Topics/JumpKit/app/supabase/schema.sql` |
| LS webhook | `Topics/JumpKit/app/supabase/functions/ls-webhook/index.ts` |
| Landing page | `Topics/JumpKit/landing/` |
| Landing deploy | `vercel deploy --prod --token [token]` from landing folder |

---

## Supabase Project

- **URL:** `https://iuexwdjnqfidcwvwbgwr.supabase.co`
- **Migrations run:** 001 (name fields), 002 (profile trigger), 003 (subscription fields)
- **Edge functions deployed:** `ls-webhook`, `send-invite`
- **Secrets set:** `LEMON_SQUEEZY_SIGNING_SECRET`, `RESEND_API_KEY` (pending)

---

_This file is the living specification for JumpKit. Update it as architecture decisions are made._
---

## Default App Configuration (new user seed)

### Default jumps
| Name | URL | Column | Hotkey |
|---|---|---|---|
| Google | www.google.com | Column 1 | Ctrl+Shift+G |
| Documents (macOS) | ~/Documents | Column 2 | Ctrl+Shift+D |
| C Drive (Windows) | C:\ | Column 2 | Ctrl+Shift+C |

### Default preferences
| Setting | Default |
|---|---|
| Show jump description | OFF |
| Show hotkey pill | OFF |
| Time saved per jump | 10 seconds |
| Dollars per hour | $150 |
| Start page | Home |
| Auto-archive | Never |
| Cloud backup | OFF |
| Notifications | ON |

### Default columns
10 columns created on first signup: Col 1 through Col 10. All visible by default.
