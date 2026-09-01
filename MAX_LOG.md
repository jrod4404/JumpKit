# MAX_LOG.md — Things Max Has Done
_Granular log of tasks and actions Max has executed. Updated continuously._

---

## 2026-02-28

- Created WORKFLOW_AUTO.md (missing startup file)
- Created memory/ folder and memory/2026-02-28.md (daily memory file)
- Created Topics/ folder structure with subfolders: Bitcoin, Bosch, JumpKit
- Fetched current weather for Brighton, MI via wttr.in (32°F, snowing)
- Captured Jeff's full background and bio into USER.md
- Captured Jeff's financial goals and strategy into USER.md
- Captured JumpKit product details and go-to-market strategy into Topics/JumpKit/
- Captured Bitcoin/MSTR investment thesis and covered call strategy into Topics/Bitcoin/
- Cleaned up folder structure: moved Bitcoin, Bosch, JumpKit into Topics/
- Removed placeholder .txt files from topic folders
- Updated IDENTITY.md with name (Max), role, priorities, and operating rules
- Created MAX_LOG.md (this file)
- Created OUR_LOG.md

## 2026-03-13

- Installed MacWhisper via Homebrew (cask) so Jeff can send voice memos for local transcription

## 2026-08-21 — NoteKit B1 block layout (v5.1.27)

- Implemented B1: blocks horizontally resizable (right-edge handle), horizontally positionable (grip drag x), vertically positionable (grip drag up/down = reorder)
- Side-by-side via packing (non-overlapping x-ranges share a row)
- nk_blocks x/width columns (migration), spec updated, 3 new tests, 30/30 pass
- Released v5.1.27 (tag → build-win → published Latest on jumpkit-releases)
## 2026-08-21 — NoteKit 3 UX fixes (v5.1.29)
- 300px min block width; move by holding anywhere on block; default width auto-fits content
- 30/30 tests; released v5.1.29 (tag → build-win → Latest)
## 2026-08-21 — NoteKit Table + Image blocks + WYSIWYG (v5.1.30)
- Table: cols/rows selector modal, editable grid, insert row/col before selected, delete row/col
- Image: file dialog + clipboard paste, copied to notekit-media/, path stored
- Text: underline + color picker (14 swatches), sanitizer keeps color only
- 30/30 tests; released v5.1.30
## 2026-08-21 — ClipKit screen capture tool (v5.1.31)
- 3rd sidebar section (CLIPKIT/Captures): New Capture → fullscreen overlay → drag region → PNG to clipboard + history
- Captures page: thumbnails, click-to-copy, ✕ delete; history capped 200
- Spec CLIPKIT_SPEC.md; 31/31 tests; released v5.1.31
## 2026-08-21 — ClipKit nav icon fix (v5.1.32): tabler-photo didn't exist → switched to tabler-clipboard; fixed nav item, topbar, New Capture button. Feed 5.1.32.
## 2026-08-21 — ClipKit capture freeze/error fix (v5.1.33): solid overlay (no transparent/fullscreen), scaled display thumb, nativeImage.crop for high-DPI, cancel channel + 'closed' guard + renderer timeout. Feed 5.1.33.
## 2026-08-21 — ClipKit UX (v5.1.34): overlay shows screen + big plus cursor (removed black dim); icon color = text color; CLIPKIT label spacing matches NOTEKIT. Feed 5.1.34.
## 2026-08-21 — ClipKit (v5.1.35): capture targets cursor's screen (any monitor); Esc cancel fixed via globalShortcut + before-input-event + overlay focus. Feed 5.1.35.
## 2026-08-21 — ClipKit (v5.1.36): transparent live-screen overlay (no frozen image on click; capture happens at drag-release) + click-to-view full size + right-click copy/delete menu. Feed 5.1.36.
## 2026-08-21 — ClipKit (v5.1.37): ROOT CAUSE fixed — done(rec) now runs before overlay.close() so captures aren't discarded as cancelled; dashed selection border; alpha=1 overlay bg for Windows hit-testing; thumbnail cap 3840. Feed 5.1.37.
## 2026-08-22 — ClipKit macOS click-through fix (v5.1.38)
- Symptom: crosshair appears after New Capture, but left-click does nothing — no selection box, nothing saves on release.
- ROOT CAUSE: overlay BrowserWindow backgroundColor '#01000000' (alpha=1, ~0.4% transparent) was added for WINDOWS hit-testing, but on macOS a near-fully-transparent surface is click-through — clicks pass to the app behind, so mousedown never reaches the overlay → no box, no capture.
- FIX (mac+win): (1) overlay body gets 5% black fill rgba(0,0,0,0.05) so macOS hit-tests full screen; (2) setIgnoreMouseEvents(false, {forward:false}); (3) re-assert focus+click on did-finish-load so first click isn't swallowed.
- Tests: 2 clipkit test files pass. node --check clean. Committed d9001f5 on feature/notekit (pushed), bumped v5.1.38, tagged + pushed tag.
- NOTE: jumpkit-releases feed only has WINDOWS builds (x64.exe + latest.yml) — Jeff tests Mac from source (npm start). Fix is in source; restart app to pick up. Tag v5.1.38 pushes Windows build to feed only when build-win workflow is dispatched.
- ALSO done this session: JumpKit SEO batch (2 new blog posts + FAQ schema, commit 1750d3a on main) + PrepSBA SEO fixes (FAQ + CTR, commit 97c299e... on main).
## 2026-08-22 08:55 — ClipKit v5.1.38 REWORK (regression fix + diagnostics)
- Jeff: no bounding box + nothing saved (crosshair shows). Ran overlay-interaction test → PASS (bypasses OS hit-testing).
- Discovered: v5.1.37 already worked on his Mac; my speculative v5.1.38 "macOS click-through" changes BROKE it. Reverted overlay interaction to exact v5.1.37 (transparent body, setIgnoreMouseEvents(false), kept did-finish-load focus) + added [clipkit-overlay] console diagnostics.
- Commit 2a23638 (feature/notekit). Moved v5.1.38 tag fwd, deleted old buggy release 374927321 + tag, rebuilt on corrected tag, published release 374929699. Feed = v5.1.38 corrected.
- Jeff runs from SOURCE (installed app is stale v5.0.9 w/o clipkit; feed is Windows-only, no Mac updates). Need full app quit+relaunch to test. Watch terminal for [clipkit-overlay] mousedown logs to confirm event delivery.
## 2026-08-22 09:37 — ClipKit CAPTURE FULLY WORKING (v5.1.38) 🎉
- Jeff confirmed: bounding box draws + capture saves. Verified from debug.log + disk (cap-1787405816553-nowpn7.png 377x89 in captures/, history.json updated, UI re-renders thumbnail).
- ROOT CAUSE (the whole saga): app's global CSP blocked the overlay's inline <script> (script-src lacked 'unsafe-inline'). Crosshair = CSS (showed); all JS dead (no box/capture). Fixed 00813cb (+'unsafe-inline'). Save path was already correct.
- Debug infra now in place: ckLog → userData/jumpkit/clipkit/debug.log with heartbeat + onRegion step logs + module-scope listeners before loadURL. Keep for future.
- All commits on feature/notekit: 0b0f5d8→e28db9a. Tests 33/33 + real-overlay-path PASS.

## 2026-08-29 — Page-1 Push: Internal Links + Link Building Kickoff (SEO sprint)
- **PrepSBA:** 301 trailing-slash redirect added (next.config.ts) → deployed live; all 15 blog posts now keyword-internal-link to homepage + 504 cluster; homepage hero targets "SBA loan preparation". Build passed, pushed, 200.
- **JumpKit:** 3 new browser-specific pages (alternative/brave|safari|chrome, ~3k words each, unique+FAQ-schema) → live. 4 blog posts gained contextual links to /compare/bookmarks & /use-cases.
- **SerpRobot live checks (4 credits):** "link organizer" now #18 (best non-brand!), "prep sba docs" #20. Tracker's auto-checks stalled since 8/17-19 → Jeff to check serprobot.com subscription.
- **Directories:** 5 submitted via automation (FutureTools/JumpKit, StartupBuffer both, LaunchingNext both). BetaList account created+verified (jeff@jumpkit.app); submissions running. Manual: SaaSHub(hCaptcha), Pitchwall(social login), Crunchbase(login). Skipped: Stashes(dead), Toolfolio(paid), TAAFT(paid).
- **SeoSpy:** populated per-domain directory tracking — JumpKit 3 submitted+12 pending, PrepSBA 4 submitted+26 pending; dead/hiatus listings removed. Backup seo-spy-backup-2026-08-29.json.
- **BetaList (post-verify):** JumpKit draft saved #185256, but publish is PAID-only ($39 Lite/$99/$299) — no free option left. Account still shows unverified despite Jeff clicking links (worth a "Send new email?" retry). PrepSBA not drafted (same gate). Decision: Jeff pays $39/site for dofollow DR76 link or skip.
- **DossDocs reverse-engineering** (PrepSBA): pulled DataForSEO Labs + live SERPs. DossDocs does NOT rank high for most SBA intents — only page 1 on "prep sba docs" (#9 vs PrepSBA #25). Owns 732 backlinks/290 RD (quality soft, 493 broken; PBN-filler). lender-side vs PrepSBA borrower-side = intent gap we can win. Report: Topics/PrepSBA/seo/dossdocs-reverse-engineering-2026-08-29.md
- **Fixes executed (vs DossDocs "prep sba docs" #9):** (1) New dedicated money page /sba-loan-documents/ (borrower prep intent, exact title match, FAQs+schema, cloned for/borrowers structure) → LIVE. (2) Consolidated 18 internal "prep SBA docs / SBA document preparation" anchors from all blog posts + hero + for/borrowers onto the new page; sitemap entry p0.9. (3) 37-target backlink shortlist saved Topics/PrepSBA/seo/prepsba-backlink-shortlist-2026-08-29.md (A-D buckets + Top-10 + outreach strategy). Deploy verified live (200, title, canonical, 308 slash→clean).

## 2026-09-01 — v5.1.50: Jumps page alignment + sticky headers (in-app update fix)
- Jeff flagged CSS edits didn't reach electron updater. Root cause found: repo was re-rooted so app/ sits at JumpKit repo root now, but build-win.yml still had stale `Topics/JumpKit/app/...` paths → GitHub Actions setup-node cache step hard-failed ("Some specified paths were not resolved"). Prior v5.1.49 passed because the cache warning was non-fatal then.
- FIXES: (1) app css/app.css: columns-area left padding 8px→0 (aligns first column left border with Add Jump btn); col-header position:sticky top:0 + removed overflow:hidden from jump-column (kills sticky) and moved corner-clip to col-items. (2) Fixed build-win.yml paths Topics/JumpKit/app → app (7 refs), so the CI build works again.
- Shipped: bumped v5.1.50, commits 4853c0a + 336c502 pushed, tag v5.1.50, dispatched build-win on tag, published release on jrod4404/jumpkit-releases (was Draft → set latest). latest.yml now points to 5.1.50. Jeff can in-app update.
- NOTE: build-win.yml HAD been broken by repo re-root since some point; any future in-app update requires the fixed paths. Watch next build.

## 2026-09-01 — v5.1.51: landing-style stats cards + sticky-header revert
- Stats page (period views): replaced 3 cards (Jumps Clicked / Time / $) with landing-page stats-demo.js logic — 4 cards: Avg Jumps per Day|Week|Month|Year, Total Jumps · period (= sum of chart bars), Time Saved · period (hrs), Dollars Saved · period. Weekly avg uses /52 (app chart = 52 weeks vs landing demo 4); per-jump timeSaved preserved via avg-seconds-per-click. Added .stats-cards-4 grid rule.
- Reverted v5.1.50 sticky column headers (per Jeff); alignment fix kept.
- Tests 33/33. Tagged v5.1.51, build-win OK, release published+Latest on jumpkit-releases.

## 2026-09-01 — v5.1.52: "Personal ROI" label on all stats tabs
- Added the summary-tab section label to daily/weekly/monthly/yearly views above the stat cards. Tests 33/33; tagged, built, published+Latest.

## 2026-09-01 — v5.1.53: app stats chart = landing view logic
- Weekly now last 4 weeks (was 52); Monthly = current year Jan–Aug + same period last year Sep–Dec in amber with "This year / Same period last year" legend. Avg/denominators + card period labels updated to match (Last 4 Weeks, Last 12 Months). Tests 33/33; tagged, built, published+Latest.

## 2026-09-01 — v5.1.54: home Help card clickable
- Help & Documentation tip-card now navigates to Help page (nav-help action, matches feedback-card pattern). Tests 33/33; tagged, built, published+Latest.

## 2026-09-01 — v5.1.55: monthly view current-month fix
- Jeff caught monthly total (112) < weekly (119): landing port showed last-year data for Sep–Dec, hiding current September launches. Fixed: months up to current month = this year actual data; only future months (Oct–Dec) show last-year amber. Legend text generalized; card label back to "This Year". Tests 33/33; tagged, built, published+Latest.

## 2026-09-01 — v5.1.56: join-date-aware averages + no-wrap labels
- Avg Jumps cards now divide only by buckets (days/weeks/months/years) overlapping [join date, now] — pre-join zero months no longer dilute the average.
- Period stat card labels set to nowrap (Dollars Saved · Last 5 Years fits one line). Tests 33/33; tagged, built, published+Latest.
