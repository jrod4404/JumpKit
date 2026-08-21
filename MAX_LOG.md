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
