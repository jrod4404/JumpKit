# JumpKit — Future Features

Ideas that have been discussed and are worth building eventually. Not on the immediate roadmap but captured here so they don't get lost.

---

## 🔖 Browser Bookmark Auto-Import

**Idea:** During onboarding, JumpKit automatically detects installed browsers, reads their bookmark files, and offers to import them as jumps.

**Why it's valuable:** Lowers the barrier to getting started — new users don't have to manually recreate their existing links. "Your bookmarks are already in JumpKit" is a strong first-run moment.

**Supported browsers & approach:**

| Browser | Platform | File | Format | Notes |
|---------|----------|------|--------|-------|
| Chrome | Mac + Win | `~/Library/Application Support/Google/Chrome/Default/Bookmarks` | JSON | Easy |
| Edge | Mac + Win | `~/Library/Application Support/Microsoft Edge/Default/Bookmarks` | JSON | Same format as Chrome |
| Firefox | Mac + Win | `~/Library/Application Support/Firefox/Profiles/*.default-release/places.sqlite` | SQLite | Need profile discovery via `profiles.ini`; file locked if Firefox is open |
| Safari | Mac only | `~/Library/Safari/Bookmarks.plist` | Binary plist | Needs `plutil` or `plist` npm package |

**Known gotchas:**
- macOS Full Disk Access required for Chrome + Safari — user must grant in System Settings → Privacy
- Firefox `places.sqlite` is locked while Firefox is open — detect and ask user to close it
- Power users may have 500+ bookmarks — need a selection/filter UI, not "import all"
- Duplicate URLs across browsers — need dedup logic
- Bookmark folder structure needs to map to JumpKit columns (one column per top-level folder is a reasonable default)

**Recommended phasing:**
1. **Phase 1:** Chrome + Edge (same format, ~75% of users, zero extra dependencies)
2. **Phase 2:** Firefox (SQLite already available via better-sqlite3)
3. **Phase 3:** Safari (Mac-only, plist dependency, smaller audience)

**UX flow:**
1. Detect which browsers have readable bookmark files on this machine
2. Show "We found bookmarks in Chrome — import them?" prompt during onboarding
3. Let user select/deselect folders and individual bookmarks
4. Create jumps from selected items, organized into columns by folder
5. Skip gracefully if no browsers found or access denied

---

_Add future feature ideas below this line_

