# OUR_LOG.md — Things Jeff & Max Have Done Together
_High-level log of the bigger milestones and decisions we've made as a team. Updated continuously._

---

## 2026-02-28 / 2026-03-01 — Onboarding & Foundation

- **Max came online** — first session, workspace initialized
- **Established Jeff's background** — EE degrees from U of M, Bosch career, family, entrepreneurial history
- **Defined the mission** — financial and time independence via two tracks:
  1. JumpKit SaaS business
  2. Smart investing (BTC, MSTR, Tesla)
- **Deep dive: JumpKit** — product vision, tech stack, dev history, MSP channel strategy documented
- **Deep dive: Bitcoin/MSTR** — investment thesis, covered call strategy, financial goals documented
- **Set Max's role** — right hand claw, idea generator + executor, two-agent team
- **Established priority order** — 1) JumpKit, 2) Bosch time savings, 3) Investment thesis
- **Built workspace structure** — Topics/ folder with Bitcoin, Bosch, JumpKit subfolders
- **✅ Created Bosch accomplishments & stakeholder tracking sheet** — Excel file with color-coded RYG stakeholder status and chronological accomplishments log (Bosch_Tracker_2026.xlsx)
- **Agreed on operating model** — Max proposes → Jeff approves → Max executes; rejected ideas archived

## 2026-03-13 — Voice Memo Workflow

- Installed MacWhisper (via Homebrew cask) so Jeff can send audio memos for local transcription and faster task intake
Sat Aug 29 14:32:11 EDT 2026
2026-08-29 SEO sprint: link-organizer #18, prep-sba-docs #20; 5 dirs submitted; browser pages live; SeoSpy updated.

## 2026-09-06 (evening) — JumpKit 5.1.68 released (admin-gating hotfix)
- Bug: NoteKit + ClipKit nav/pages showed for non-admin user (dad's account). Only the admin Settings card was role-gated; the module sections auto-init off env flags regardless of role.
- Fix (app/js/app.js, commit ccb680c): applySidebarModulePrefs + navigateTo now require _supabaseProfile.role==='admin' for NoteKit/ClipKit.
- Version 5.1.67 -> 5.1.68; cross-built Windows NSIS installer on the Mac (102MB, signed); released to jrod4404/jumpkit-releases v5.1.68 (exe + blockmap + latest.yml -> auto-update).
- Landing index.html + pricing.html Windows download links bumped to v5.1.68 (Mac .dmg stays 5.1.67). Vercel auto-deploy. Pushed to GitHub main.

## 2026-10-09 — JumpKit 5.1.70 released (owner shared-column fix + beta-module removal)
- Bug 1: team OWNER's shared columns vanished from the owner's own machine while members still saw them. Root cause: syncSharedJumps() excludes owned teams from the remote-column set (owner cols = local source of truth) but the staleByUnshared check didn't exclude owned teams → owner's legacy-format column always flagged "unshared" → wiped/flipped to personal locally. Fixed by excluding owned teams from both stale filters + the zero-membership path; added recoverOwnerSharedColumns() to re-link/re-create from Supabase on login (non-destructive, idempotent).
- Bug 2: NoteKit/ClipKit were still surfacing (admin-gated + env-overridable). Added hard kill switches — window.BETA_NAV_MODULES_ENABLED=false (app.js) and ENABLE_BETA_NAV_MODULES=false (main.js, env vars ignored). Removed from nav, routing, and Settings for all users.
- Tests: test/owner-shared-column-stale.test.mjs (4) + test/beta-nav-modules.test.mjs (4); suite 40 pass / 1 pre-existing unrelated fail.
- Version 5.1.69 → 5.1.70 (commit 6c478b6, tag v5.1.70). Mac built locally, signed + notarized (Jumpkit LLC); Windows via build-win.yml.
- Releases on jrod4404/jumpkit-releases: v5.1.70-mac (dmgs) + v5.1.70 (exe, Latest). Also uploaded Mac assets into Latest so latest-mac.yml resolves (Mac auto-update). Landing links bumped to 5.1.70; Vercel live.
