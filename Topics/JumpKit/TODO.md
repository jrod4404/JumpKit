# JumpKit TODO
_Last updated: 2026-05-20_

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
- [x] Complete Teams E2E Tests 4.1 (remove member) and 4.2 (delete team)
- [x] Verify Vercel SSL cert resolved for `jumpkit.app`
- [x] Free-tier column cap flash fix (no more paywall flicker on login)
- [x] Gradient unified across all primary buttons
- [x] Sign In / Create Account icons + spinner on click
- [x] Save Settings button style match
- [x] Sidebar CTA height reduced 15%
- [x] Settings page dropdown overflow fix (auto-archive not cut off)

---

## 🔴 High Priority

- [x] **Teams page UI cleanup** — fully complete: pill layout, collapsible teams, stats line, column alignment, button sizing, color polish

- [ ] **Paywall edge-case polish**
  - [ ] In-app downgrade notice — modal exists, needs copy QA
  - [ ] Shared column behavior when owner downgrades — confirm what members see
  - [ ] Real Lemon Squeezy purchase → webhook → profile upgrade → welcome-core email — full E2E still untested

- [ ] **Stats page launch counter** — add "X / 250 launches used" nudge; respect Core vs. free tiers

---

## 🟡 Medium Priority

- [ ] **send-feedback Edge Function migration** — move from `send-feedback.js` → `supabase/functions/send-feedback/index.ts` and deploy

- [ ] **"Get JumpKit Free Tier" button wiring** — hook landing page + in-app CTA to Lemon Squeezy checkout URL

- [ ] **Docs sync** — update `JUMPKIT_DOCS.html/.md` to reflect latest paywall/onboarding behavior before next status share

---

## 🔵 Low Priority / Post-launch

- [ ] **Apple Developer Account ($99/yr)** — required for macOS code signing + notarization + auto-update via GitHub Releases. Without it: auto-update silently fails on Mac, users see "unidentified developer" warning on first install. Steps once enrolled: generate Developer ID Application cert → add signing config to electron-builder → build → notarize → publish release to GitHub.
- [ ] **Dev vs. prod Supabase separation** — duplicate project/config, add environment switching
- [ ] **Rebuild Windows installer** — bundle latest app code for distribution
- [ ] **Pagination on large lists** — teams, members, invites; keep UI responsive at scale
- [ ] **Supabase backups** — verify/upgrade plan (currently free tier = no auto-backups)
