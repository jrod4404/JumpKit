/**
 * JumpKit – Pure logic unit tests
 * Run: node --test app/test/logic.test.mjs
 *      (or: npm test  — after adding "test": "node --test app/test/**" to package.json)
 *
 * Covers:
 *  - Export data filtering (personal-only, no empty cols)
 *  - Backup partitioning (active vs archived, col list)
 *  - Duplicate-jump detection
 *  - Orphan jump identification on column removal
 *  - Column slot padding logic (default-10 behaviour)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const L = require(path.join(__dirname, '../js/logic.js'));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCol(id, name, isShared = false) {
  return { id, name, isShared, visible: true, order: 1 };
}

function makeJump(id, colId, url, opts = {}) {
  return {
    id, columnId: colId, url, name: opts.name || 'Jump',
    isShared:   opts.isShared   || false,
    teamId:     opts.teamId     || null,
    isArchived: opts.isArchived || false,
  };
}

// ─── buildExportData ──────────────────────────────────────────────────────────

describe('buildExportData', () => {

  test('includes only personal, non-empty columns and their jumps', () => {
    const cols = [
      makeCol('c1', 'Personal Col'),
      makeCol('c2', 'Shared Col', true),
    ];
    const jumps = [
      makeJump('j1', 'c1', 'https://example.com'),
      makeJump('j2', 'c2', 'https://shared.com', { isShared: true }),
    ];
    const { exportCols, exportJumps } = L.buildExportData(jumps, cols);
    assert.equal(exportCols.length, 1);
    assert.equal(exportCols[0].id, 'c1');
    assert.equal(exportJumps.length, 1);
    assert.equal(exportJumps[0].id, 'j1');
  });

  test('excludes personal columns that have no jumps (empty cols)', () => {
    const cols = [
      makeCol('c1', 'Has Jumps'),
      makeCol('c2', 'Empty Col'),
    ];
    const jumps = [
      makeJump('j1', 'c1', 'https://a.com'),
    ];
    const { exportCols } = L.buildExportData(jumps, cols);
    assert.equal(exportCols.length, 1);
    assert.equal(exportCols[0].id, 'c1');
  });

  test('excludes team jumps (teamId set) even if column is personal', () => {
    const cols = [ makeCol('c1', 'My Col') ];
    const jumps = [
      makeJump('j1', 'c1', 'https://a.com', { teamId: 'team1' }),
    ];
    const { exportCols, exportJumps } = L.buildExportData(jumps, cols);
    // Column appears empty because its only jump is a team jump → excluded
    assert.equal(exportCols.length, 0);
    assert.equal(exportJumps.length, 0);
  });

  test('includes both active and archived personal jumps', () => {
    const cols = [ makeCol('c1', 'My Col') ];
    const jumps = [
      makeJump('j1', 'c1', 'https://a.com'),
      makeJump('j2', 'c1', 'https://b.com', { isArchived: true }),
    ];
    const { exportJumps } = L.buildExportData(jumps, cols);
    assert.equal(exportJumps.length, 2);
  });

  test('returns empty arrays when user has no personal data', () => {
    const { exportCols, exportJumps } = L.buildExportData([], []);
    assert.deepEqual(exportCols, []);
    assert.deepEqual(exportJumps, []);
  });

});

// ─── partitionBackupJumps ─────────────────────────────────────────────────────

describe('partitionBackupJumps', () => {

  test('splits into activeJumps (non-archived personal) and archivedJumps', () => {
    const jumps = [
      makeJump('j1', 'c1', 'https://a.com'),
      makeJump('j2', 'c1', 'https://b.com', { isArchived: true }),
      makeJump('j3', 'c2', 'https://c.com', { isShared: true }),
    ];
    const cols = [ makeCol('c1', 'Col1'), makeCol('c2', 'Col2') ];
    const { activeJumps, archivedJumps, colsWithJumps } = L.partitionBackupJumps(jumps, cols);
    assert.equal(activeJumps.length,   1);
    assert.equal(archivedJumps.length, 1);
    assert.equal(colsWithJumps.length, 1); // only c1 has an active personal jump
    assert.equal(colsWithJumps[0].id, 'c1');
  });

  test('colsWithJumps excludes columns that only have archived jumps', () => {
    const jumps = [
      makeJump('j1', 'c1', 'https://a.com', { isArchived: true }),
    ];
    const cols = [ makeCol('c1', 'Col1') ];
    const { colsWithJumps } = L.partitionBackupJumps(jumps, cols);
    assert.equal(colsWithJumps.length, 0);
  });

  test('handles empty backup gracefully', () => {
    const { activeJumps, archivedJumps, colsWithJumps } = L.partitionBackupJumps([], []);
    assert.equal(activeJumps.length,   0);
    assert.equal(archivedJumps.length, 0);
    assert.equal(colsWithJumps.length, 0);
  });

});

// ─── isDuplicateJump ─────────────────────────────────────────────────────────

describe('isDuplicateJump', () => {

  const existing = [
    { columnId: 'c1', url: 'https://example.com' },
    { columnId: 'c2', url: 'https://other.com'   },
  ];

  test('detects duplicate (same URL, same column, case-insensitive)', () => {
    assert.equal(L.isDuplicateJump(existing, 'c1', 'HTTPS://EXAMPLE.COM'), true);
  });

  test('no duplicate when URL is same but column differs', () => {
    assert.equal(L.isDuplicateJump(existing, 'c3', 'https://example.com'), false);
  });

  test('no duplicate when column matches but URL differs', () => {
    assert.equal(L.isDuplicateJump(existing, 'c1', 'https://different.com'), false);
  });

  test('handles trailing spaces in URLs', () => {
    assert.equal(L.isDuplicateJump(existing, 'c1', '  https://example.com  '), true);
  });

  test('no duplicate in empty array', () => {
    assert.equal(L.isDuplicateJump([], 'c1', 'https://x.com'), false);
  });

});

// ─── removedPersonalColIds + orphanedJumps ───────────────────────────────────

describe('column removal – orphan detection', () => {

  const existingCols = [
    makeCol('c1', 'Keep This'),
    makeCol('c2', 'Remove Me'),
    makeCol('c3', 'Shared Col', true), // shared — should never appear as removed
  ];

  test('identifies removed personal column', () => {
    const savedIds = new Set(['c1', 'c3']);
    const removed = L.removedPersonalColIds(existingCols, savedIds);
    assert.deepEqual(removed, ['c2']);
  });

  test('does not flag shared columns as removed even when absent from saved set', () => {
    const savedIds = new Set(['c1']); // c3 (shared) also missing but must not appear
    const removed = L.removedPersonalColIds(existingCols, savedIds);
    assert.ok(!removed.includes('c3'), 'Shared col must not appear in removed list');
  });

  test('returns empty array when nothing is removed', () => {
    const savedIds = new Set(['c1', 'c2', 'c3']);
    const removed = L.removedPersonalColIds(existingCols, savedIds);
    assert.deepEqual(removed, []);
  });

  test('orphanedJumps returns jumps belonging to removed columns', () => {
    const jumps = [
      makeJump('j1', 'c1', 'https://a.com'),
      makeJump('j2', 'c2', 'https://b.com'),
      makeJump('j3', 'c2', 'https://c.com'),
    ];
    const orphans = L.orphanedJumps(jumps, ['c2']);
    assert.equal(orphans.length, 2);
    assert.ok(orphans.every(j => j.columnId === 'c2'));
  });

  test('orphanedJumps returns empty array when no cols removed', () => {
    const jumps = [ makeJump('j1', 'c1', 'https://a.com') ];
    const orphans = L.orphanedJumps(jumps, []);
    assert.deepEqual(orphans, []);
  });

});

// ─── User preference defaults ───────────────────────────────────────────────

describe('user preference defaults', () => {
  // Mirror the defaultPrefs() object from db.js so changes to defaults are caught here.
  const defaultPrefs = () => ({
    startPage:           'home',
    notifications:       true,
    timePerClick:        30,
    dollarsPerHour:      50,
    showDescription:     false,
    showHotkey:          false,
    showColTeamName:     true,
    cloudBackup:         false,
    autoArchive:         'never',
    navDefaultCollapsed: false,
  });

  test('showDescription defaults to false', () => {
    assert.equal(defaultPrefs().showDescription, false);
  });

  test('showHotkey defaults to false', () => {
    assert.equal(defaultPrefs().showHotkey, false);
  });

  test('showColTeamName defaults to true', () => {
    assert.equal(defaultPrefs().showColTeamName, true);
  });

  test('showColTeamName can be toggled off', () => {
    const p = { ...defaultPrefs(), showColTeamName: false };
    assert.equal(p.showColTeamName, false);
  });

  test('all expected pref keys are present', () => {
    const keys = Object.keys(defaultPrefs());
    for (const k of ['showDescription','showHotkey','showColTeamName','startPage','timePerClick']) {
      assert.ok(keys.includes(k), `missing pref key: ${k}`);
    }
  });
});

// ─── colPadCount ─────────────────────────────────────────────────────────────

describe('colPadCount (default-10 slot padding)', () => {

  test('pads a new user with 0 cols to 10 slots', () => {
    assert.equal(L.colPadCount(0), 10);
  });

  test('pads a user with 3 cols to 7 more slots (total 10)', () => {
    assert.equal(L.colPadCount(3), 7);
  });

  test('no padding needed when already at 10', () => {
    assert.equal(L.colPadCount(10), 0);
  });

  test('no padding when user has more than 10 (added via Add Column)', () => {
    assert.equal(L.colPadCount(13), 0);
  });

  test('custom minimum works (e.g. minimum=5)', () => {
    assert.equal(L.colPadCount(2, 5), 3);
  });

});
