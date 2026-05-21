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

    // Upsert shared columns
    const colMap = {};
    for (const rc of remoteCols) {
      colMap[rc.id] = rc;
      const existing = existingCols.find(c => c.id === rc.id);
      if (existing) {
        // Update name/position, keep visible
        Object.assign(existing, {
          name: rc.name,
          order: rc.position,
          isShared: 1,
          teamId: rc.team_id,
        });
      } else {
        existingCols.push({
          id: rc.id,
          userId: localUserId,
          name: rc.name,
          visible: true,
          order: rc.position,
          createdAt: new Date(rc.created_at).getTime(),
          isShared: 1,
          teamId: rc.team_id,
        });
      }
    }
    DB.saveColumns(localUserId, existingCols);

    // Upsert shared jumps
    const remoteJumpIds = new Set(remoteJumps.map(j => j.id));
    for (const rj of remoteJumps) {
      const existing = existingJumps.find(j => j.id === rj.id);
      const preservedHotkey = hotkeyMap[rj.id] || '';

      if (existing) {
        Object.assign(existing, {
          name: rj.name,
          url: rj.url,
          description: rj.description || '',
          reason: rj.reason || '',
          columnId: rj.shared_column_id,
          hotkey: existing.hotkey || preservedHotkey, // preserve local hotkey
          isShared: 1,
          teamId: rj.team_id,
          updatedAt: new Date(rj.updated_at).getTime(),
        });
      } else {
        existingJumps.push({
          id: rj.id,
          userId: localUserId,
          name: rj.name,
          url: rj.url,
          description: rj.description || '',
          reason: rj.reason || '',
          columnId: rj.shared_column_id,
          hotkey: preservedHotkey,
          favorite: false,
          isArchived: false,
          clickCount: 0,
          lastUsed: null,
          createdAt: new Date(rj.created_at).getTime(),
          updatedAt: new Date(rj.updated_at).getTime(),
          isShared: 1,
          teamId: rj.team_id,
        });
      }
    }

    // 4. Delete local shared jumps that no longer exist in Supabase
    const cleanedJumps = existingJumps.filter(j => {
      if (j.isShared && j.teamId && !remoteJumpIds.has(j.id)) return false;
      return true;
    });
    DB.saveJumps(localUserId, cleanedJumps);

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

    console.log(`[JumpKit Sync] Synced ${remoteCols.length} columns, ${remoteJumps.length} jumps`);
  } catch (err) {
    console.warn('[JumpKit Sync] Error:', err.message);
  }
}

// ── Auto-sync on load + every 60 min ──────────────────────────────
function startSyncLoop() {
  // Run immediately
  syncSharedJumps().then(() => {
    // Re-render if on jumps page
    if (typeof activePage !== 'undefined' && activePage === 'jumps' && typeof renderColumns === 'function') {
      renderColumns();
    }
  });

  // Then every 60 minutes
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(() => {
    syncSharedJumps().then(() => {
      if (typeof activePage !== 'undefined' && activePage === 'jumps' && typeof renderColumns === 'function') {
        renderColumns();
      }
    });
  }, 60 * 60 * 1000);
}

// Kick off sync after a short delay to let the page initialize
setTimeout(startSyncLoop, 2000);
