# JumpKit — Testing & Deployment Modal Redesign Spec
_Created: 2026-06-19_

---

## Overview

Redesigning the Manage Testing modal and associated Save Results flow to support dual-platform (Mac + Windows) test runs that share one HTML output file and one Supabase deployments record. Also moving the Deployment Folder field from the Testing modal into the Manage Deployment modal.

---

## Answered Design Questions

| # | Question | Answer |
|---|----------|--------|
| Q1 | Are both runs always required? | Yes — Mac and Windows both required |
| Q2 | One Supabase record or two? | One record per release version |
| Q3 | When is the Supabase record created? | When the FIRST run is finalized (Mac or Windows) |
| Q4 | Version/deployment folder configured once for both runs? | Yes — version once, deployment folder once |
| Q5 | Same test set for Mac and Windows? | Mostly — each test has a "Test On" field. Mac-only tests are pre-marked skipped on Windows run |
| Q6 | One HTML file or two? | One file, two tabs (Mac tab + Windows tab) |
| Q7 | HTML file name? | `JumpKit_ReleaseTesting_vX.Y.Z.html` |
| Q8 | Mac-only tests in Windows run? | Pre-marked as skipped (greyed out, non-toggleable) |
| Q9 | HTML tabs vs sections? | Two tabs (clickable tab buttons to switch Mac / Windows view) |
| Q10 | File path persistence? | localStorage |
| Q11 | Supabase record primary key? | UUID (version stored as a label field) |

---

## Supabase Schema Changes

### Current `deployments` table fields to remove/replace:
```
test_os                  ← REMOVE (no longer a single-OS record)
tests_total              ← REMOVE (replaced by mac_/win_ specifics)
tests_passed             ← REMOVE
tests_failed             ← REMOVE
tests_skipped            ← REMOVE
testing_account          ← REMOVE (split into mac/win)
testing_completed_at     ← KEEP (set when BOTH runs are finalized)
mac_results_file         ← RENAME to results_file (one combined file)
win_results_file         ← REMOVE (merged into results_file)
```

### New/renamed fields to add:
```sql
results_file             TEXT,        -- path to combined HTML (replaces mac_results_file + win_results_file)

mac_testing_account      TEXT,        -- email of user who ran Mac tests
mac_tests_total          INT,
mac_tests_passed         INT,
mac_tests_failed         INT,
mac_tests_skipped        INT,
mac_finalized_at         TIMESTAMPTZ,

win_testing_account      TEXT,
win_tests_total          INT,
win_tests_passed         INT,
win_tests_failed         INT,
win_tests_skipped        INT,
win_finalized_at         TIMESTAMPTZ,
```

### Status values (updated):
- `testing_in_progress` — at least one run finalized, not both
- `testing_complete` — both mac_finalized_at and win_finalized_at are set
- `deployed` — finalize deployment was clicked

### Migration file:
`supabase/migrations/20260619000000_alter_deployments_dual_platform.sql`

---

## localStorage Schema

### Key: `jk_deploy_config`
```json
{
  "version": "1.2.3",
  "resultsFilePath": "/Users/.../JumpKit_ReleaseTesting_v1.2.3.html",
  "deploymentRecordId": "uuid-here"
}
```

- `version` — set in Manage Testing modal, shared across both runs
- `resultsFilePath` — set on first Save Results (via OS folder picker), persists for all subsequent saves
- `deploymentRecordId` — set on first finalize, used to update the record on second finalize
- `deploymentFolder` — REMOVED from this key (now lives only in deploy modal / Supabase record)

---

## HTML Output File Format

**Filename:** `JumpKit_ReleaseTesting_vX.Y.Z.html`
**Location:** User-chosen folder (via OS folder picker on first save)

**Structure — two-tab layout:**
```
[Mac Run] [Windows Run]   ← tab buttons

[active tab content]
  - Header: platform, date, version, pass/fail counts
  - Test results table (same format as current)
```

- Tab state is client-side JS (no server)
- Mac tab populated on Mac Save Results
- Windows tab populated on Windows Save Results
- If a tab hasn't been saved yet, it shows a placeholder "Not yet run" state
- HTML file is self-contained (inline CSS + JS, no external deps)

---

## "Test On" Field — Windows Run Behavior

Each unit test has a `testOn` attribute (values: `"mac_win"` | `"mac_only"` | `"win_only"`).

**Mac run:** All tests shown. None pre-skipped.

**Windows run:**
- Tests with `testOn === "mac_only"` → pre-marked **Skipped**, greyed out row, toggle disabled, **NOT counted in `win_tests_total`**
- Tests with `testOn === "win_only"` or `"mac_win"` → shown normally, user must pass/fail/skip, counted in totals
- Result: `win_tests_total` = only Windows-applicable tests → "X of X Windows tests passed" is clean and accurate

---

## Manage Testing Modal — Changes

### Fields (after redesign):
| Field | Notes |
|-------|-------|
| Version Number | Text input. Saved to `jk_deploy_config.version`. Shared across both runs. |
| ~~Deployment Folder~~ | **REMOVED** — moved to Manage Deployment modal |

### Buttons/State (redesigned):

The modal should reflect current run state. Possible states:
1. **Fresh** (no runs started) → show "Start Mac Run" and "Start Windows Run"
2. **Mac finalized, Windows pending** → Mac row shows ✅ finalized; Windows shows "Start Windows Run"
3. **Windows finalized, Mac pending** → Windows row shows ✅ finalized; Mac shows "Start Mac Run"
4. **Both finalized** → Both ✅ + nudge: "Testing complete — go to Deployments"

### "Finalize [Mac/Win] Run" button behavior:
- Reads current test scores from UI
- **If no Supabase record yet (first finalization):**
  - INSERT new deployments record with UUID, version, this platform's test data, results_file path, status = `testing_in_progress`
  - Save UUID to `jk_deploy_config.deploymentRecordId`
- **If record exists (second finalization):**
  - UPDATE existing record: add this platform's test data, set `testing_completed_at`, status = `testing_complete`
- Set `mac_finalized_at` or `win_finalized_at` as appropriate
- Set `[mac/win]_testing_account` to current logged-in user email

---

## Save Results Button — Changes (Tests Page)

**New behavior:**
```
User clicks "Save Results" (Mac or Windows section)
  ↓
Is resultsFilePath defined in localStorage?
  ├─ NO → Open OS folder picker
  │         User selects folder
  │         File created: [folder]/JumpKit_ReleaseTesting_vX.Y.Z.html
  │         Save path to jk_deploy_config.resultsFilePath
  │         Write full HTML with active tab's data + placeholder for the other tab
  └─ YES → File already exists
            Update only the active platform's tab section in the file
            Leave the other tab's data untouched
```

**Important:** The version must be set in Manage Testing modal BEFORE the first save. If version is blank, prompt user to set it first.

**Auto-copy to deployment folder:** REMOVED (no longer tied to deployment folder in testing flow).

---

## Manage Deployment Modal — Changes

### New field added:
| Field | Notes |
|-------|-------|
| Deployment Folder | Choose button → directory picker. Saves to `jk_deploy_config.deploymentFolder` AND updates Supabase record if one exists. |

### Existing fields unchanged:
- Deployment selector (dropdown from Supabase)
- Mac installer path
- Win installer path
- Notes
- Finalize Deployment button

---

## Supabase Migration SQL

```sql
-- 20260619000000_alter_deployments_dual_platform.sql

ALTER TABLE deployments
  DROP COLUMN IF EXISTS test_os,
  DROP COLUMN IF EXISTS tests_total,
  DROP COLUMN IF EXISTS tests_passed,
  DROP COLUMN IF EXISTS tests_failed,
  DROP COLUMN IF EXISTS tests_skipped,
  DROP COLUMN IF EXISTS testing_account,
  DROP COLUMN IF EXISTS win_results_file,
  RENAME COLUMN mac_results_file TO results_file;

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS mac_testing_account TEXT,
  ADD COLUMN IF NOT EXISTS mac_tests_total INT,
  ADD COLUMN IF NOT EXISTS mac_tests_passed INT,
  ADD COLUMN IF NOT EXISTS mac_tests_failed INT,
  ADD COLUMN IF NOT EXISTS mac_tests_skipped INT,
  ADD COLUMN IF NOT EXISTS mac_finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS win_testing_account TEXT,
  ADD COLUMN IF NOT EXISTS win_tests_total INT,
  ADD COLUMN IF NOT EXISTS win_tests_passed INT,
  ADD COLUMN IF NOT EXISTS win_tests_failed INT,
  ADD COLUMN IF NOT EXISTS win_tests_skipped INT,
  ADD COLUMN IF NOT EXISTS win_finalized_at TIMESTAMPTZ;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `js/tests.js` | Save Results folder picker logic; HTML file write/update for dual-tab format; Finalize run → Supabase insert/update; Windows run pre-skip logic; Manage Testing modal UI update (remove deployment folder field) |
| `js/deploy.js` | Manage Deployment modal: add deployment folder field; update Supabase record with folder path |
| `renderer/tests.html` (or inline) | Manage Testing modal template: remove deployment folder, reflect dual-run state |
| `supabase/migrations/` | New migration SQL (above) |
| `jk_deploy_config` localStorage key | Updated schema (version + resultsFilePath + deploymentRecordId) |

---

## Open Questions Before Implementation

None — all clarifying questions answered. Ready to implement.

---

## Implementation Order (suggested)

1. **Supabase migration** — run altered schema first
2. **HTML output format** — build two-tab HTML template/generator
3. **Save Results flow** — folder picker + file create/update logic
4. **Manage Testing modal** — remove deployment folder, add dual-run state display
5. **Finalize run logic** — Supabase insert (first run) / update (second run)
6. **Manage Deployment modal** — add deployment folder field
7. **Test the full flow end-to-end**
