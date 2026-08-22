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
