# NoteKit — Feature Spec (v1, for internal testing only)

Status: **Locked 2026-08-19** (Jeff confirmed all points). NOT a shipped feature yet.

## Goal
Test whether note-taking inside JumpKit feels right. Isolated from the JumpKit architecture — own data store, own nav section, own UI. Rolled out via the existing JumpKit release channel (electron-updater) so Jeff can auto-upgrade in place.

## Branch & Release
- Branch: `feature/notekit` (off latest main, merge back later if it goes well)
- Version bump: **5.1.0** (minor — additive feature, backward compatible)
- Release: same pipeline/artifacts (`JumpKit-Setup-${version}-Prod-${arch}.${ext}`), same update feed
- Feature flag: default **OFF** for regular users; ON for Jeff's local build only

## Scope (v1)

### 1. Sidebar — new "NoteKit" nav section
- Projects listed in the sidebar under a NoteKit section
- Add / rename / delete projects

### 2. Project → Pages
- Each project contains a flat list of pages (NO nesting/sub-pages in v1)
- Add / rename / delete pages

### 3. Page → Note elements (Notion-like, on the page)
Element types for v1:
- Text block (title + body)
- Heading (H1/H2/H3)
- Checklist (toggleable)
- Bulleted / numbered list

Explicitly OUT of v1 (big cost, low test value): databases/tables, embeds, images, code blocks, toggles/columns, drag-to-reorder blocks, nested pages.

## Persistence
- New isolated SQLite file `notes.db` (user data dir), separate from JumpKit's `db.json` / Supabase
- Tables: `projects`, `pages`, `note_blocks`
- **Autosave** on every edit (debounced ~500ms), "Saving…/Saved" indicator, no manual save button
- **Soft-delete (trash)** for deleted projects/pages — recoverable, nothing hard-deleted

## Data Model Sketch
```
projects(id PK, name, created_at, updated_at, deleted_at NULL)
pages(id PK, project_id FK, title, sort_order, created_at, updated_at, deleted_at NULL)
note_blocks(id PK, page_id FK, type, content_json, sort_order, created_at, updated_at)
```
- `type`: text | heading | checklist | bullet_list | numbered_list
- `content_json`: per-type payload (e.g. checklist items, list items)

## UI Notes
- NoteKit nav section in sidebar: projects expandable → pages clickable → page view on the right with blocks
- Editor feel: Notion-like (click to add block, Enter splits, /menu optional later)
- Same window as JumpKit, separate data store

## Done criteria (for the test build)
1. Sidebar NoteKit section with project CRUD
2. Page CRUD within a project
3. Page view with add/edit text, headings, checklists, lists
4. Autosave to notes.db, soft-delete trash
5. Feature flag off by default; 5.1.0 release via existing channel
