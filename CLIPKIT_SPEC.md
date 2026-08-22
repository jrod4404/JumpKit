# CLIPKIT_SPEC.md — JumpKit screen capture tool

**Feature flag:** `CLIPKIT_ENABLED=true` (default ON in Jeff's test build, OFF for regular users). Renderer + main read it via IPC + env.

## What it is
A screen-grabbing tool as the **third sidebar section** (CLIPKIT / Captures), sitting below NoteKit. Click "New Capture" → a fullscreen, transparent, always-on-top overlay freezes the desktop → drag a rectangle → on release, that region is captured, **copied to the clipboard**, and saved into a **capture history log** inside JumpKit.

## Behavior (locked 2026-08-21, Jeff-approved)
1. **New Capture** button → overlay → drag-to-select region → release captures.
2. Selection rect shows a dim outside + red border. **Esc** or a tiny (<3px) click cancels/closes.
3. The captured PNG is **copied to the clipboard** immediately and **saved** to the capture history.
4. **Captures page** lists history newest-first: thumbnail, timestamp, dimensions. **Click a capture = re-copy to clipboard.**
5. Each card has a ✕ to **delete** the record + file.
6. History caps at the **last 200** captures.
7. Named "Captures" (owner chose "ClipKit" as the product/section name).

## Tech
- **Capture (main process):** `desktopCapturer.getSources({types:['screen']})` snapshots the primary display → opens a frameless transparent `BrowserWindow` fullscreen overlay (data-URL, sandboxed, tiny `capture-preload.js` exposing `window.captureBridge.region(x,y,w,h)`) → user drags → overlay sends region via IPC `clipkit-region` → `overlay.capturePage({x,y,width,height})` → PNG.
- **Storage:** PNGs → `userData/clipkit/captures/cap-<ts>-<rand>.png`. History index → `userData/clipkit/history.json` (array of `{id, path, width, height, ts}`, newest-first, capped 200). Reuses the app's userData dir (cross-platform Win+Mac).
- **Clipboard:** `clipboard.writeImage(nativeImage.createFromBuffer(pngBuf))` (capture) / `nativeImage.createFromPath(path)` (re-copy).
- **IPC:** `clipkit-enabled`, `clipkit-capture`, `clipkit-history`, `clipkit-copy(id)`, `clipkit-delete(id)`.
- **Renderer (`js/clipkit.js`):** auto-init shows the CLIPKIT sidebar section when enabled; `window.ClipKit.render()` renders the Captures page (New Capture + history grid, click-to-copy, ✕ delete). Router entry `clipkit` added to app.js (loader, title "Captures", icon ti-photo).
- **overlay preload:** `app/capture-preload.js` (contextBridge → send region to main).

## Files
- `main.js` — capture engine + history IPC + CLIPKIT_ENABLED default
- `preload.js` — clipkit* bridge
- `capture-preload.js` — overlay region bridge
- `app.html` — CLIPKIT nav section/button + clipkit.js script tag
- `js/app.js` — clipkit page loader/title/icon
- `js/clipkit.js` — renderer
- `css/app.css` — capture card styles
- `test/clipkit.test.mjs` — renderer tests (nav reveal, history grid, click-to-copy)

## Out of scope (v1)
- Multi-monitor source selection (captures the primary display only)
- Rect resize/handles after initial draw; only drag-new
- Annotation/drawing on the capture
- Video/region recording
