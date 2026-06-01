# JumpKit TODO
_Last updated: 2026-06-01_

---

## ✅ Done (recently completed)
- [x] Use Supabase UUID as local SQLite `userId` — prevents user ID mismatch on re-login
- [x] Deploy `send-welcome-core` Edge Function
- [x] Deploy `send-cancellation` Edge Function
- [x] Deploy updated `ls-webhook` to Supabase
- [x] Test Welcome to JumpKit Core email with real paid subscription event
- [x] Test Cancellation email end-to-end
- [x] Fix git repo corrupt object (`be1cf517...`)
- [x] Live invite email test end-to-end via Resend
- [x] Wire "Get JumpKit Free Tier" button → Lemon Squeezy or download
- [x] Send team-created confirmation email to team owner
- [x] Move `send-feedback.js` → `supabase/functions/send-feedback/index.ts`
- [x] Swap send-feedback from/to addresses once `jumpkit.ai` verified in Resend
- [x] Migrate all email addresses from `@jumpkit.ai` → `@jumpkit.app` (9 files)
- [x] Deploy `send-feedback` edge function (was never deployed; CORS + JWT bugs fixed)
- [x] Verify `jumpkit.app` domain in Resend + redeploy all edge functions
- [x] Configure Proton Mail for `jumpkit.app` receiving (GoDaddy MX records)
- [x] Complete Teams E2E Tests 4.1 (remove member) and 4.2 (delete team)
- [x] Verify Vercel SSL cert resolved for `jumpkit.app`
- [x] Free-tier column cap flash fix (no more paywall flicker on login)
- [x] Gradient unified across all primary buttons
- [x] Sign In / Create Account icons + spinner on click
- [x] Save Settings button style match
- [x] Sidebar CTA height reduced 15%
- [x] Settings page dropdown overflow fix (auto-archive not cut off)
- [x] Teams page UI cleanup — fully complete
- [x] Stats page launch counter — progress bar + launch count added for free users
- [x] Landing page download buttons — free tier card split into Windows + Mac buttons
- [x] "Jump Free!" nav CTA — gradient button with icon added to desktop nav + mobile
- [x] **Publish installers to GitHub** — created public `jrod4404/jumpkit-releases` repo (zero bandwidth limits); uploaded Mac universal DMG (203MB) + Windows EXE (101MB) 2026-06-01
- [x] **Landing page pricing overhaul (2026-06-01)**
  - Renamed: Free Tier → JumpKit Free, Core → JumpKit Unlimited
  - Updated subtitle with bold plan names in section-title color
  - Added "2 teams" bullet (free) and "Unlimited teams" bullet (unlimited)
  - Spacing/margin tightened on both cards
  - "Everything in free tier" → "Everything in JumpKit Free"
- [x] **Bug fix: owner's shared cols double-rendering** — sync now skips owned-team cols; one-time cleanup removes existing duplicates
- [x] **Bug fix: sharedTeams not persisted to SQLite** — added TEXT column + JSON serialize/deserialize; fixes rename and manage sharing bugs permanently
- [x] **Bug fix: rebuildOwnerSharedTeams** — recovers lost sharedTeams from Supabase on login; pushes local renamed col names to Supabase
- [x] **App rename: JumpKit Core → JumpKit Unlimited** throughout all UI text (app.js, teams.js, jumps.js, sync.js); internal `'core'` tier value untouched
- [x] **Teams page copy/UI** — "shared jumps" → "shared columns" on teams view; member badge color blue → subtle green; settings subtitle updated

---

## 🔴 High Priority

- [ ] **Paywall E2E** — Real Lemon Squeezy purchase → webhook → profile upgrade → welcome-core email still untested end-to-end

---

## 🟡 Medium Priority

- [ ] **Rebuild and redistribute installers** — current builds (Jun 1) are unsigned on Mac. Users see "unidentified developer" warning on first install. Requires Apple Developer Account.

---

## 🔵 Low Priority / Post-launch

- [ ] **Apple Developer Account ($99/yr)** — required for macOS code signing + notarization + auto-update via GitHub Releases. Steps once enrolled: generate Developer ID Application cert → add signing config to electron-builder → build → notarize → publish to jumpkit-releases.
- [ ] **Dev vs. prod Supabase separation** — duplicate project/config, add environment switching
- [ ] **Pagination on large lists** — teams, members, invites; keep UI responsive at scale
- [ ] **Supabase backups** — verify/upgrade plan (currently Pro = daily backups, verify in dashboard)
