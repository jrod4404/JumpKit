// ── JumpKit Sync Engine ────────────────────────────────────────────
// Syncs shared columns + jumps from Supabase to local DB.
// Called on app load and every 60 minutes.
// ──────────────────────────────────────────────────────────────────

let _syncInterval = null;

async function syncSharedJumps() {
  let session = null;
  try {
    const res = await supabaseClient.auth.getSession();
    session = res?.data?.session;
  } catch (_) {}
  if (!session) return;

  const userId = session.user.id;

  try {
    // 1. Get user's team memberships
    const { data: memberships = [], error: memErr } = await supabaseClient
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId);
    if (memErr) throw memErr;

    const teamIds = memberships.map(m => m.team_id);
    if (teamIds.length === 0) return;

    // 2. For each team: fetch shared_columns + shared_jumps
    const { data: remoteCols = [], error: colErr } = await supabaseClient
      .from('shared_columns')
      .select('*')
      .in('team_id', teamIds)
      .order('position');
    if (colErr) throw colErr;

    const { data: remoteJumps = [], error: jumpErr } = await supabaseClient
      .from('shared_jumps')
      .select('*')
      .in('team_id', teamIds)
      .order('position');
    if (jumpErr) throw jumpErr;

    // 3. Upsert into local DB — preserve local hotkey if already set
    const localUser = DB.getCurrentUser();
    if (!localUser) return;
    const localUserId = localUser.id;

    const existingCols = DB.getColumns(localUserId);
    const existingJumps = DB.getJumps(localUserId);

    // Build lookup for existing hotkeys
    const hotkeyMap = {};
    existingJumps.forEach(j => { if (j.hotkey) hotkeyMap[j.id] = j.hotkey; });

    // Dedupe remote cols — keep only latest per (team_id + name)
    const remoteColsDeduped = Object.values(
      remoteCols.reduce((acc, rc) => {
        const key = rc.team_id + '|' + rc.name;
        if (!acc[key] || rc.created_at > acc[key].created_at) acc[key] = rc;
        return acc;
      }, {})
    );
    const remoteColIds = new Set(remoteColsDeduped.map(c => c.id));

    // Remove stale local shared columns no longer in remote
    const staleLocalCols = existingCols.filter(c => c.isShared && c.teamId && teamIds.includes(c.teamId) && c.supabaseId && !remoteColIds.has(c.supabaseId));
    for (const stale of staleLocalCols) {
      const idx = existingCols.indexOf(stale);
      if (idx > -1) existingCols.splice(idx, 1);
    }

    // Upsert shared columns — match by supabaseId or id
    const colMap = {};
    for (const rc of remoteColsDeduped) {
      colMap[rc.id] = rc;
      const existing = existingCols.find(c =>
        (c.supabaseId && c.supabaseId === rc.id) ||
        c.id === rc.id ||
        (c.isShared && c.teamId === rc.team_id && c.name === rc.name)
      );
      if (existing) {
        // Update name only — preserve local order so user's column layout is respected
        Object.assign(existing, {
          name: rc.name,
          isShared: 1,
          teamId: rc.team_id,
          supabaseId: rc.id,
        });
      } else {
        // Place new shared col after the last personal col that has at least one jump
        const localJumps = DB.getJumps(localUserId);
        const personalColsWithJumps = existingCols
          .filter(c => !c.isShared && localJumps.some(j => j.columnId === c.id && !j.isArchived));
        const lastPersonalOrder = personalColsWithJumps.length > 0
          ? Math.max(...personalColsWithJumps.map(c => c.order || 0))
          : 0;
        // Find next available order slot after last personal col with jumps
        const usedOrders = new Set(existingCols.map(c => c.order));
        let newOrder = lastPersonalOrder + 1;
        while (usedOrders.has(newOrder)) newOrder++;

        existingCols.push({
          id: rc.id,
          supabaseId: rc.id,
          userId: localUserId,
          name: rc.name,
          visible: true,
          order: newOrder,
          createdAt: new Date(rc.created_at).getTime(),
          isShared: 1,
          teamId: rc.team_id,
        });
      }
    }
    DB.saveColumns(localUserId, existingCols);

    // Upsert shared jumps using DB.updateJump / DB.createJump
    const remoteJumpIds = new Set(remoteJumps.map(j => j.id));
    for (const rj of remoteJumps) {
      // Match by supabaseId or id
      const existing = existingJumps.find(j => j.supabaseId === rj.id || j.id === rj.id);
      const preservedHotkey = existing?.hotkey || hotkeyMap[rj.id] || '';
      // Find the local column id that maps to this supabase column
      const localCol = existingCols.find(c => c.supabaseId === rj.shared_column_id || c.id === rj.shared_column_id);
      const columnId = localCol ? localCol.id : rj.shared_column_id;

      if (existing) {
        DB.updateJump(localUserId, existing.id, {
          name: rj.name,
          url: rj.url,
          description: rj.description || '',
          reason: rj.reason || '',
          columnId,
          hotkey: preservedHotkey,
          isShared: 1,
          teamId: rj.team_id,
          supabaseId: rj.id,
          updatedAt: new Date(rj.updated_at).getTime(),
        });
      } else {
        DB.createJump(localUserId, {
          id: rj.id,
          name: rj.name,
          url: rj.url,
          description: rj.description || '',
          reason: rj.reason || '',
          columnId,
          hotkey: preservedHotkey,
          favorite: false,
          isArchived: false,
          clickCount: 0,
          lastUsed: null,
          createdAt: new Date(rj.created_at).getTime(),
          updatedAt: new Date(rj.updated_at).getTime(),
          isShared: 1,
          teamId: rj.team_id,
          supabaseId: rj.id,
        });
      }
    }

    // 4. Delete local shared jumps that no longer exist in Supabase
    const allJumps = DB.getJumps(localUserId);
    for (const j of allJumps) {
      if (j.isShared && j.teamId && teamIds.includes(j.teamId) && !remoteJumpIds.has(j.supabaseId || j.id)) {
        DB.deleteJump(localUserId, j.id);
      }
    }

    // 5. Persist to SQLite via IPC (if Electron)
    if (window.electronAPI) {
      // Upsert remote jumps into SQLite (preserves existing hotkeys)
      if (window.electronAPI.upsertSharedJumps && remoteJumps.length > 0) {
        const jumpsPayload = remoteJumps.map(rj => ({
          id:          rj.id,
          userId:      localUserId,
          name:        rj.name,
          url:         rj.url,
          description: rj.description || '',
          reason:      rj.reason || '',
          columnId:    rj.shared_column_id,
          hotkey:      hotkeyMap[rj.id] || '',
          createdAt:   new Date(rj.created_at).getTime(),
          updatedAt:   new Date(rj.updated_at).getTime(),
          teamId:      rj.team_id,
        }));
        await window.electronAPI.upsertSharedJumps(jumpsPayload);
      }

      // Delete local shared jumps that are no longer in Supabase
      const staleIds = existingJumps
        .filter(j => j.isShared && j.teamId && teamIds.includes(j.teamId) && !remoteJumpIds.has(j.id))
        .map(j => j.id);
      if (window.electronAPI.deleteSharedJumps && staleIds.length > 0) {
        await window.electronAPI.deleteSharedJumps(staleIds);
      }

      // Update sync timestamp in SQLite
      if (window.electronAPI.updateSyncState) {
        await window.electronAPI.updateSyncState('lastSync', Date.now().toString());
      }
    }

    // 6. Update sync timestamp in localStorage as well
    localStorage.setItem('jk_last_sync', Date.now().toString());

    console.debug(`[JumpKit Sync] Synced ${remoteCols.length} columns, ${remoteJumps.length} jumps`);
  } catch (err) {
    console.warn('[JumpKit Sync] Error:', err.message);
  }
}

// ── Auto-sync on load + every 60 min ──────────────────────────────
function startSyncLoop() {
  // Run immediately
  syncSharedJumps().then(() => {
    // Re-render if on jumps page
    if (typeof renderColumns === 'function' && document.getElementById('columnsArea')) {
      renderColumns();
    }
  });

  // Then every 60 minutes
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(() => {
    syncSharedJumps().then(() => {
      if (typeof renderColumns === 'function' && document.getElementById('columnsArea')) {
        renderColumns();
      }
    });
  }, 60 * 60 * 1000);
}

// Kick off sync after a short delay to let the page initialize
setTimeout(startSyncLoop, 2000);
