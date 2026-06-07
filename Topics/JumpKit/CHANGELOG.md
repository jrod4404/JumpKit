# JumpKit Changelog

---

## v1.0.0 — June 7, 2026

### New Features
- **Export ROI Report (PDF)** — "Export PDF" button on the Stats page generates a full ROI report (all-time summary: launches, time saved, dollars saved, top jumps, charts) and saves it via native save dialog. Available to all users (Free + Unlimited).
- **5-member cap on free teams** — Free tier teams are now limited to 5 members (owner + 4). Enforced at 3 points: invite flow (org owner), invite flow (team owner), and join flow. Unlimited teams have no member cap.
- **Auto-archive & auto-backup gated to Unlimited** — Free users see a 🔒 lock + "Upgrade" button on both toggles in Settings. Runtime guards prevent these features from running for free accounts even if prefs are tampered with.

### Changes
- **Renamed "Auto Cloud Backup" → "Auto Backup"** — clarifies that backup writes to a local JSON file, not a cloud server.
- **Daily stats view** — changed from "current calendar week (Sun–Sat)" to "last 7 days" rolling window. Fixes empty state that appeared every Sunday.
- **Pricing cards** — landing page cards trimmed to 7 bullets each, 385px wide, mobile word-wrap fix on 3rd bullet. Card content synced across all app touch points (modals, emails, upgrade banner).
- **Feature list consistency sweep** — all 7 locations updated to match landing page: My Account features modal, upgrade banner, Welcome to Unlimited modal, downgrade modal, launch limit paywall, send-welcome-core email, send-cancellation email.
- **"Core" → "Unlimited" label** — remaining "Core" references in the upgrade modal comparison table updated to "Unlimited."

### Bug Fixes
- **Vercel 404 on deploy** — disabled `autoAssignCustomDomains` on the jumpkit-landing Vercel project; GitHub-triggered builds no longer steal domain aliases from `vercel --prod` deploys.
- **Stats daily tab empty on Sundays** — range was `[startOf('week'), startOf('week)+7d]`; changed to rolling last-7-days window.
- **Export PDF: CSP violation** — replaced `onclick` inline handler with `data-jaction` pattern.
- **Export PDF: pop-up blocked** — replaced `window.open()` (blocked by Electron) with `window.print()` then upgraded to native `dialog.showSaveDialog()` + `printToPDF()` via IPC.
- **Export PDF: `await` in non-async function** — `exportStatsPDF` declared `async`.
- **Export PDF: `Toast.info` not a function** — replaced with `Toast.success`.
- **Stats tab bar stretching** — removed `flex:1` from statsBar that caused it to fill full width.
- **Auto-archive/backup `wireAcctDropdown` error on free tier** — guarded with `getElementById` null check since the dropdown doesn't render for free users.

### Emails (Supabase Edge Functions)
- `send-welcome-core` — updated feature list, corrected "Core subscription" → "Unlimited subscription."
- `send-cancellation` — updated to show specific free-tier limits and 3 "what you lost" items.

---

## v1.0.0-beta — June 1, 2026

- Initial public release
- Windows + Mac installers published to GitHub Releases
- Lemon Squeezy checkout + webhook + subscription lifecycle
- Teams, shared columns, invite flow, E2E tested
- Stats page with charts and ROI tracking
- Apple Developer signed + notarized installers
