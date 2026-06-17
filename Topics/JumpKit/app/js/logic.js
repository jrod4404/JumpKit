// ── JumpKit Pure Logic ──────────────────────────────────────────────
// Zero DOM/Electron/Supabase dependencies.
// Exported for unit tests; loaded as a plain script tag in the renderer
// (globals window.JK = window.JK || {}; window.JK.logic = ...).
// ────────────────────────────────────────────────────────────────────

(function (root) {
  'use strict';

  // ── Export filtering ──────────────────────────────────────────────
  /**
   * Given raw DB arrays, return only the personal (non-shared, non-team)
   * jumps and their non-empty columns — safe to write to a backup file.
   *
   * @param {object[]} allJumps   - DB.getJumps(userId)
   * @param {object[]} allColumns - DB.getColumns(userId)
   * @returns {{ exportJumps: object[], exportCols: object[] }}
   */
  function buildExportData(allJumps, allColumns) {
    const personalJumps = allJumps.filter(j => !j.isShared && !j.teamId);
    const personalCols  = allColumns.filter(c => !c.isShared);
    const colsWithJumps = new Set(personalJumps.map(j => j.columnId));
    const exportCols    = personalCols.filter(c => colsWithJumps.has(c.id));
    const exportColIds  = new Set(exportCols.map(c => c.id));
    const exportJumps   = personalJumps.filter(j => exportColIds.has(j.columnId));
    return { exportJumps, exportCols };
  }

  // ── Import: partition backup jumps ────────────────────────────────
  /**
   * Split backup jumps into active-personal vs archived-personal;
   * build the list of columns that have at least one active jump.
   *
   * @param {object[]} backupJumps   - backup.jumps
   * @param {object[]} backupColumns - backup.columns
   * @returns {{ activeJumps, archivedJumps, colsWithJumps }}
   */
  function partitionBackupJumps(backupJumps, backupColumns) {
    const activeJumps   = backupJumps.filter(j => !j.isShared && !j.teamId && !j.isArchived);
    const archivedJumps = backupJumps.filter(j => !j.isShared && !j.teamId &&  j.isArchived);
    const colsWithJumps = backupColumns.filter(c =>
      c.name && activeJumps.some(j => j.columnId === c.id)
    );
    return { activeJumps, archivedJumps, colsWithJumps };
  }

  // ── Import: dedup check ───────────────────────────────────────────
  /**
   * Returns true if a jump with the same URL already exists in the
   * target column within existingJumps.
   *
   * @param {object[]} existingJumps
   * @param {string}   targetColId
   * @param {string}   url
   * @returns {boolean}
   */
  function isDuplicateJump(existingJumps, targetColId, url) {
    const norm = (u) => (u || '').trim().toLowerCase();
    return existingJumps.some(j =>
      j.columnId === targetColId && norm(j.url) === norm(url)
    );
  }

  // ── Column removal: find orphaned jumps ───────────────────────────
  /**
   * Given the full list of existing personal columns and the set of
   * column IDs that survived a save, return the IDs of columns that
   * were removed (and therefore whose jumps should be deleted).
   *
   * @param {object[]} existingCols - DB.getColumns(userId) before save
   * @param {Set<string>} savedColIds  - column IDs present after save
   * @returns {string[]} removed column IDs
   */
  function removedPersonalColIds(existingCols, savedColIds) {
    return existingCols
      .filter(c => !c.isShared && !savedColIds.has(c.id))
      .map(c => c.id);
  }

  /**
   * Given a list of all jumps, return those whose columnId is in the
   * removed set — i.e. jumps that need to be deleted.
   *
   * @param {object[]} allJumps
   * @param {string[]} removedColIds
   * @returns {object[]}
   */
  function orphanedJumps(allJumps, removedColIds) {
    const set = new Set(removedColIds);
    return allJumps.filter(j => set.has(j.columnId));
  }

  // ── Column default padding ────────────────────────────────────────
  /**
   * Return how many placeholder slots to add to reach the display
   * minimum (default 10) without going below the current count.
   *
   * @param {number} currentCount
   * @param {number} [minimum=10]
   * @returns {number} number of blank slots to append
   */
  function colPadCount(currentCount, minimum = 10) {
    return Math.max(0, Math.max(minimum, currentCount) - currentCount);
  }

  // ── Expose ────────────────────────────────────────────────────────
  const logic = {
    buildExportData,
    partitionBackupJumps,
    isDuplicateJump,
    removedPersonalColIds,
    orphanedJumps,
    colPadCount,
  };

  // Browser globals
  if (typeof window !== 'undefined') {
    window.JK = window.JK || {};
    window.JK.logic = logic;
  }

  // Node / CommonJS (for unit tests)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = logic;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
