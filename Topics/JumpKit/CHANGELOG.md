# JumpKit Changelog

---

## v5.1.40 — August 22, 2026

### Capture — multi-display + cleanup
- **Crosshair now works on every connected display** — capture opens a transparent overlay on each screen (previously only the screen the app was on).
- **No more dead zone / enter-blocked box** — each overlay covers its display's full bounds; regions are mapped via screen coordinates, so dragging works edge-to-edge.
- **Removed the green on-screen debug text/pill** from the capture overlay (crosshair/hint only). Quiet diagnostics remain in `debug.log` for troubleshooting.

### UI — Sidebar
- **No horizontal scrollbar when collapsed** — added `overflow-x: hidden` to the collapsed sidebar + nav.
- **Nav icons + links aligned identically** — icons normalized to a fixed 24×24 centered slot (removed the Jumps icon's offset margin); label leading spaces removed so all labels start at the same horizontal position.

---

## v5.1.39 — August 22, 2026

### New / Fixed — ClipKit Screen Capture
- **FIXED (root cause): screen capture was broken** — the app's Content-Security-Policy blocked the capture overlay's inline JavaScript. The crosshair rendered (CSS) but the entire click/drag/region/save logic never ran, so no bounding box appeared and no image saved. Added `'unsafe-inline'` to the CSP `script-src` so the overlay's script executes. Now the bounding box draws on drag and captures save to ClipKit's Captures panel + clipboard on release (verified end-to-end: PNG written to `captures/`, history updated, UI thumbnail renders).
- **Diagnostics added** — capture activity logs to `userData/clipkit/debug.log` (heartbeat + step-by-step `onRegion` trace) for future troubleshooting.

### UI — Sidebar
- **Nav section labels** now use normal casing: `JumpKit`, `NoteKit`, `ClipKit`, `Admin` (were all-caps `JUMPKIT`/`NOTEKIT`/`CLIPKIT`/`ADMIN`).
- **NoteKit label left alignment** now matches JumpKit/ClipKit labels (same left padding).
- **Collapsed sidebar** now reliably hides all section labels (including NoteKit, which had a higher-specificity display rule).
- **Collapsed sidebar** no longer shows the blue update-banner sliver above the collapse/expand button.

---

## v1.0.0-rc2 — June 16, 2026 (Release Testing Improvements)

### Testing / QA
- **Execution-order column** — Tests page and release HTML report now show `EXEC # / ID` column across all four sections (Pre-Flight, Automatic, Auto + Manual, Manual).
- **Four-section test layout** — Tests page reorganized into Pre-Flight (test 139), Automatic, Auto + Manual, and Manual sections; each section shows per-section summary stats inline in the header.
- **Section summaries in release report** — `JumpKit_ReleaseTesting_v1.0.0.html` section headers now include inline stat pills (Pass/Fail/Manual/Not Run/Total) and per-section column headers; footers removed.
- **Default-collapsed sections** — All four sections in the release HTML default to collapsed (▶) for easier navigation.
- **Removed orphaned test cases** — IDs 132–138 and 143 (deleted tests) removed from release HTML; total corrected from 154 → 146.
- **Vertical dividers removed** — Summary card on the Tests page no longer shows vertical separator lines between stat cells.
- **Release HTML card width** — Overall card widened 15% (1380 → 1587 px) for better table readability on larger screens.
- **Arrow icon spacing** — Added `margin-right: 10px` to collapse/expand arrows in all section headers.
- **Test 140 auto-converted** — Test 140 (session watchdog interval) converted from manual to automatic; returns pass/fail details without human interaction.
- **Test 139 preserved across auto runs** — Pre-flight test 139 result persists when automatic test suite is re-run.

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
