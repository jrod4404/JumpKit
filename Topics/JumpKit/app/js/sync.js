// ── JumpKit Sync Engine ────────────────────────────────────────────
// Syncs shared columns + jumps from Supabase to local DB.
// Called on app load and every 60 minutes.
// ──────────────────────────────────────────────────────────────────

let _syncInterval = null;

// ── Stale shared column recovery modal ──────────────────────────────
// Shows a modal when stale shared columns are detected during sync.
// reason: 'team-deleted' | 'column-unshared'
// Paid users can keep them as personal jumps.
// Returns a Promise<boolean>: true = keep, false = delete.
function _promptStaleTeamRecovery(staleCols, reason = 'team-deleted', ctx = {}) {
  const tier = window._supabaseProfile?.subscription_tier || 'free';
  const canKeep = tier === 'core' || tier === 'teams_jet';
  const isUnshared = reason === 'column-unshared';
  const ownerName = ctx.ownerName || 'The team owner';
  const teamName  = ctx.teamName  || 'your team';
  const LS_CHECKOUT_URL = 'https://jumpkit.lemonsqueezy.com/checkout/buy/d6fee6da-901c-4c1d-b474-c5eb23ee03fb';

  const title = isUnshared
    ? '<svg class="ti ti-alert-circle" style="width:1.4rem;height:1.4rem"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg> Shared Column Removed'
    : '<svg class="ti ti-alert-circle" style="width:1.4rem;height:1.4rem"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg> Team Deleted';

  const introText = isUnshared
    ? `<strong style="color:var(--text-card-title)">${ownerName}</strong> removed sharing on the following column(s) from team <strong style="color:var(--text-card-title)">${teamName}</strong>. You no longer have access to these shared columns and their corresponding jumps:`
    : `The team <strong style="color:var(--text-card-title)">${teamName}</strong> was deleted by <strong style="color:var(--text-card-title)">${ownerName}</strong>. The following shared columns have been removed:`;

  return new Promise((resolve) => {
    window._staleColsResolve = resolve;

    // Build jump count map for each stale column
    const _localUser = DB.getCurrentUser();
    const _allJumps = _localUser ? DB.getJumps(_localUser.id) : [];
    const jumpCountMap = {};
    staleCols.forEach(c => {
      jumpCountMap[c.id] = _allJumps.filter(j => j.columnId === c.id && !j.isArchived).length;
    });

    const colListHTML = staleCols.map(c => {
      const name = (c.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const count = jumpCountMap[c.id] || 0;
      const countStr = `(${count} jump${count !== 1 ? 's' : ''})`;
      return `<li style="display:flex;align-items:center;padding:3px 0;gap:6px">
         <svg class="ti ti-layout-columns" style="width:.85rem;height:.85rem;flex-shrink:0;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg>
         <span style="color:var(--text-muted);font-size:0.88rem">${name} <span style="color:var(--text-dim);font-size:0.8rem">${countStr}</span></span>
       </li>`;
    }).join('');

    const body = `
      <p style="color:var(--text-muted);font-size:0.9rem;margin:0 0 14px;line-height:1.6">
        ${introText}
      </p>
      <ul style="margin:0 0 16px;padding-left:18px;list-style:none">${colListHTML}</ul>
      ${canKeep
        ? `<div style="background:rgba(0,194,199,0.07);border:1px solid rgba(0,194,199,0.2);border-radius:8px;padding:11px 14px">
             <p style="margin:0;font-size:0.84rem;color:var(--turq);line-height:1.5">
               <strong>JumpKit Core:</strong> You can keep these columns as personal jumps — your links and data stay, they just become private to you.
             </p>
           </div>`
        : `<div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:11px 14px">
             <p style="margin:0;font-size:0.84rem;color:var(--text-dim);line-height:1.5">
               Unlock JumpKit Core to keep all shared columns as personal columns when access is removed.
             </p>
           </div>`}`;

    const footer = canKeep
      ? `<button class="btn btn-subtle" data-jaction="stale-remove">
           <svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Remove Columns
         </button>
         <button class="btn btn-primary" data-jaction="stale-keep">
           <svg class="ti ti-copy"><use href="img/tabler-sprite.svg#tabler-copy"/></svg> Keep as My Jumps
         </button>`
      : `<button class="btn btn-subtle" data-jaction="stale-remove">
           OK, Understood
         </button>
         <button class="btn btn-primary" style="background:linear-gradient(135deg,#50CACC,#1A4FD6)" data-jaction="stale-upgrade" data-url="${LS_CHECKOUT_URL}">
           <svg class="ti ti-lock" style="width:1rem;height:1rem;color:white;stroke:white"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> Unlock JumpKit Core
         </button>`;

    Modal.open(title, body, footer, { closeable: false });
  });
}

// ── Event delegation — sync stale-column modal ─────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-jaction]');
  if (!btn) return;
  switch (btn.dataset.jaction) {
    case 'stale-keep':
      if (window._staleColsResolve) window._staleColsResolve(true);
      Modal.close();
      break;
    case 'stale-remove':
      if (window._staleColsResolve) window._staleColsResolve(false);
      Modal.close();
      break;
    case 'stale-upgrade':
      if (window._staleColsResolve) window._staleColsResolve(false);
      Modal.close();
      if (window.electronAPI) window.electronAPI.openUrl(btn.dataset.url);
      break;
  }
});

// ── Apply stale column cleanup after user's modal choice ──────────
async function _cleanStaleSharedColumns(staleCols, localUserId, reason = 'team-deleted', ctx = {}) {
  if (!staleCols.length) return;
  const keepStale = await _promptStaleTeamRecovery(staleCols, reason, ctx);
  const staleColIds = new Set(staleCols.map(c => c.id));
  const allJumps = DB.getJumps(localUserId);

  if (keepStale) {
    // Convert shared columns + jumps to personal
    const updatedCols = DB.getColumns(localUserId).map(c =>
      staleColIds.has(c.id) ? { ...c, isShared: false, teamId: null, supabaseId: null } : c
    );
    DB.saveColumns(localUserId, updatedCols);
    allJumps.filter(j => j.isShared && staleColIds.has(j.columnId))
      .forEach(j => DB.updateJump(localUserId, j.id, { isShared: false, teamId: null }));
    const names = staleCols.map(c => c.name).join(', ');
    window.addNotification?.({ type: 'team-deleted',
      message: `Kept ${staleCols.length} shared column${staleCols.length > 1 ? 's' : ''} as personal jumps: ${names}`,
      ts: Date.now() });
  } else {
    // Delete stale columns + their jumps
    const cleanCols = DB.getColumns(localUserId).filter(c => !staleColIds.has(c.id));
    DB.saveColumns(localUserId, cleanCols);
    allJumps.filter(j => j.isShared && staleColIds.has(j.columnId))
      .forEach(j => DB.deleteJump(localUserId, j.id));
    const names = staleCols.map(c => c.name).join(', ');
    const notifMsg = reason === 'column-unshared'
      ? `Shared columns removed (owner unshared): ${names}`
      : `Shared columns removed (team deleted): ${names}`;
    window.addNotification?.({ type: 'team-deleted', message: notifMsg, ts: Date.now() });
  }
  if (typeof renderColumns === 'function') renderColumns();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
}


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

    // If no team memberships, offer recovery for any stale shared columns then return
    if (teamIds.length === 0) {
      const localUser = DB.getCurrentUser();
      if (localUser) {
        const existingCols = DB.getColumns(localUser.id);
        // Only old-format columns (teamId set, no sharedTeams) are stale in this context
        const staleCols = existingCols.filter(c => c.isShared && c.teamId && !(Array.isArray(c.sharedTeams) && c.sharedTeams.length > 0));
        if (staleCols.length > 0) {
          await _cleanStaleSharedColumns(staleCols, localUser.id);
        }
      }
      return;
    }

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

    // Detect stale local shared columns — split by reason for correct modal wording.
    // Stale detection only applies to old single-team format (c.teamId set, sharedTeams empty).
    // New multi-team format (sharedTeams) is owner-managed and doesn't go stale via sync.
    const _isOldFormat = c => c.isShared && c.teamId && !(Array.isArray(c.sharedTeams) && c.sharedTeams.length > 0);
    // Case 1: team no longer in membership (team deleted or removed from team)
    const staleByTeamGone = existingCols.filter(c =>
      _isOldFormat(c) && !teamIds.includes(c.teamId)
    );
    // Case 2: still a member of the team but column was removed from shared_columns (owner unshared)
    const staleByUnshared = existingCols.filter(c =>
      _isOldFormat(c) && teamIds.includes(c.teamId) && c.supabaseId && !remoteColIds.has(c.supabaseId)
    );

    // Fetch team name + owner name for modal context
    const _fetchTeamCtx = async (teamId) => {
      try {
        const { data: team } = await supabaseClient
          .from('teams').select('name, owner_id').eq('id', teamId).single();
        if (!team) return {};
        const { data: owner } = await supabaseClient
          .from('profiles').select('first_name, last_name, email').eq('id', team.owner_id).single();
        const ownerName = owner?.first_name
          ? `${owner.first_name} ${owner.last_name || ''}`.trim()
          : (owner?.email || 'The team owner');
        return { teamName: team.name, ownerName };
      } catch (_) { return {}; }
    };

    const processStale = async (staleCols, reason) => {
      if (!staleCols.length) return;
      // Fetch context for first affected team (all staleCols in one group share same team or similar owner)
      const sampleTeamId = staleCols[0]?.teamId;
      const ctx = sampleTeamId ? await _fetchTeamCtx(sampleTeamId) : {};
      const keepStale = await _promptStaleTeamRecovery(staleCols, reason, ctx);
      const staleColIds = new Set(staleCols.map(c => c.id));
      const staleJumps  = DB.getJumps(localUserId).filter(j => j.isShared && staleColIds.has(j.columnId));

      for (let i = existingCols.length - 1; i >= 0; i--) {
        if (staleColIds.has(existingCols[i].id)) {
          if (keepStale) {
            existingCols[i] = { ...existingCols[i], isShared: false, teamId: null, supabaseId: null };
          } else {
            existingCols.splice(i, 1);
          }
        }
      }
      staleJumps.forEach(j => {
        if (keepStale) DB.updateJump(localUserId, j.id, { isShared: false, teamId: null });
        else           DB.deleteJump(localUserId, j.id);
      });

      const names = staleCols.map(c => c.name).join(', ');
      const removedMsg = reason === 'column-unshared'
        ? `Shared columns removed (owner unshared): ${names}`
        : `Shared columns removed (team deleted): ${names}`;
      window.addNotification?.({
        type: 'team-deleted',
        message: keepStale
          ? `Kept ${staleCols.length} shared column${staleCols.length > 1 ? 's' : ''} as personal jumps: ${names}`
          : removedMsg,
        ts: Date.now(),
      });
      if (typeof updateNotifBadge === 'function') updateNotifBadge();
    };

    if (staleByTeamGone.length > 0) await processStale(staleByTeamGone, 'team-deleted');
    if (staleByUnshared.length > 0) await processStale(staleByUnshared, 'column-unshared');

    // Upsert shared columns — match by supabaseId or id
    const colMap = {};
    const _renamedCols = []; // track column renames for notifications
    for (const rc of remoteColsDeduped) {
      colMap[rc.id] = rc;
      // Match by supabaseId only (primary key in Supabase namespace).
      // Never match by local id — local IDs and Supabase UUIDs are different namespaces
      // and mixing them causes ghost/duplicate rows.
      // Fall back to name+team match only for first-sync where supabaseId not yet stored locally.
      const existing = existingCols.find(c =>
        (c.supabaseId && c.supabaseId === rc.id) ||
        (Array.isArray(c.sharedTeams) && c.sharedTeams.some(st => st.supabaseId && st.supabaseId === rc.id)) ||
        (!c.supabaseId && c.isShared && c.teamId === rc.team_id && c.name === rc.name) ||
        (Array.isArray(c.sharedTeams) && c.sharedTeams.some(st => st.teamId === rc.team_id) && c.name === rc.name && !c.supabaseId)
      );
      if (existing) {
        // Track column renames
        if (existing.name && existing.name !== rc.name) {
          _renamedCols.push({ oldName: existing.name, newName: rc.name });
        }
        if (Array.isArray(existing.sharedTeams) && existing.sharedTeams.length > 0) {
          // New multi-team format: update the sharedTeams entry, don't overwrite teamId
          const stIdx = existing.sharedTeams.findIndex(st => st.teamId === rc.team_id);
          if (stIdx >= 0) existing.sharedTeams[stIdx].supabaseId = rc.id;
          else existing.sharedTeams.push({ teamId: rc.team_id, supabaseId: rc.id });
          existing.name = rc.name;
          existing.isShared = 1;
        } else {
          // Old single-team format: regular update
          Object.assign(existing, {
            name: rc.name,
            isShared: true,
            teamId: rc.team_id,
            supabaseId: rc.id,
          });
        }
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
          isShared: true,
          teamId: rc.team_id,
        });
      }
    }
    DB.saveColumns(localUserId, existingCols);

    // Upsert shared jumps using DB.updateJump / DB.createJump
    const remoteJumpIds = new Set(remoteJumps.map(j => j.id));
    // Only include jumps that have a real supabaseId — local IDs are a different namespace
    // and must never be used as a proxy for Supabase UUIDs.
    const existingSharedJumpIds = new Set(
      existingJumps.filter(j => j.isShared && j.supabaseId).map(j => j.supabaseId)
    );
    const _newJumpsByTeam = {}; // teamId → [jumpName, ...]
    for (const rj of remoteJumps) {
      // Match by supabaseId only — never by local id to avoid ghost rows
      const existing = existingJumps.find(j => j.supabaseId && j.supabaseId === rj.id);
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
          isShared: true,
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
          isShared: true,
          teamId: rj.team_id,
          supabaseId: rj.id,
        });
        // Track new shared jump for notification (skip on first-ever sync when no prior shared jumps)
        if (existingSharedJumpIds.size > 0 && !existingSharedJumpIds.has(rj.id)) {
          if (!_newJumpsByTeam[rj.team_id]) _newJumpsByTeam[rj.team_id] = [];
          _newJumpsByTeam[rj.team_id].push(rj.name);
        }
      }
    }

    // Fire notifications for renamed columns
    if (_renamedCols.length > 0) {
      _renamedCols.forEach(({ oldName, newName }) => {
        window.addNotification?.({ type: 'shared-column-updated', message: `Shared column renamed: "${oldName}" → "${newName}"`, ts: Date.now() });
      });
      if (typeof updateNotifBadge === 'function') updateNotifBadge();
    }
    // Fire notifications for new shared jumps
    const _teamNewJumpEntries = Object.entries(_newJumpsByTeam);
    if (_teamNewJumpEntries.length > 0) {
      _teamNewJumpEntries.forEach(([, names]) => {
        const count = names.length;
        const preview = names.slice(0, 3).join(', ');
        const msg = count === 1
          ? `New shared jump added: "${preview}"`
          : `${count} new shared jumps added: ${preview}${count > 3 ? ', …' : ''}`;
        window.addNotification?.({ type: 'shared-jump-added', message: msg, ts: Date.now() });
      });
      if (typeof updateNotifBadge === 'function') updateNotifBadge();
    }

    // 4. Delete local shared jumps that no longer exist in Supabase
    const allJumps = DB.getJumps(localUserId);
    for (const j of allJumps) {
      // Only delete if jump has a supabaseId (confirmed synced) and is no longer in remote
      // Jumps without supabaseId are owner-local and should not be deleted by sync
      if (j.isShared && j.supabaseId && j.teamId && teamIds.includes(j.teamId) && !remoteJumpIds.has(j.supabaseId)) {
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
        .filter(j => j.isShared && j.supabaseId && j.teamId && teamIds.includes(j.teamId) && !remoteJumpIds.has(j.supabaseId))
        .map(j => j.id);
      if (window.electronAPI.deleteSharedJumps && staleIds.length > 0) {
        await window.electronAPI.deleteSharedJumps(staleIds);
      }

      // Update sync timestamp in SQLite
      if (window.electronAPI.updateSyncState) {
        await window.electronAPI.updateSyncState('lastSync', Date.now().toString());
      }
    }

    console.debug(`[JumpKit Sync] Synced ${remoteCols.length} columns, ${remoteJumps.length} jumps`);
  } catch (err) {
    console.warn('[JumpKit Sync] Error:', err.message);
    // Notify user of sync failure — throttled to once per hour
    try {
      const lastSyncFailTs = parseInt(localStorage.getItem('jk_sync_fail_notif_ts') || '0');
      if (Date.now() - lastSyncFailTs > 60 * 60 * 1000) {
        window.addNotification?.({ type: 'sync-failed', message: `Sync failed: ${err.message}`, ts: Date.now() });
        localStorage.setItem('jk_sync_fail_notif_ts', Date.now().toString());
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
      }
    } catch (_) {}
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
  }, 2 * 60 * 1000); // 2-minute poll — members see shared jump updates within 2 min
}

// Kick off sync after a short delay to let the page initialize
setTimeout(startSyncLoop, 2000);
