// ── Teams Page ─────────────────────────────────────────────────────
// Roles: org-owner | team-owner | team-member

// ── Teams Tips Modal ────────────────────────────────────────────────
window.showTeamsTipsModal = function() {
  const existing = document.getElementById('teamsTipsOverlay');
  if (existing) { existing.remove(); return; }
  const overlay = document.createElement('div');
  overlay.id = 'teamsTipsOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9990;padding:20px';
  overlay.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.5)">
      <div style="padding:20px 24px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);flex-shrink:0">
        <svg class="ti ti-users" style="width:1.15rem;height:1.15rem;color:var(--text-muted);flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-users"/></svg>
        <span style="font-size:1rem;font-weight:700;color:var(--text-muted);flex:1">Teams — Getting Started</span>
        <button data-jaction="teams-tips-close" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;line-height:1;flex-shrink:0">
          <svg class="ti ti-x" style="width:18px;height:18px"><use href="img/tabler-sprite.svg#tabler-x"/></svg>
        </button>
      </div>
      <div style="padding:20px 24px 24px;overflow-y:auto;flex:1">
        <div style="margin-bottom:22px">
          <div style="font-size:0.78rem;font-weight:700;color:var(--hover-accent);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">What are teams?</div>
          <p style="font-size:0.88rem;color:var(--text-muted);line-height:1.7;margin:0">
            Teams let you share jump links with colleagues so everyone on the team instantly lands in the same places — shared tools, internal dashboards, network folders, and resources, always in sync.
          </p>
        </div>
        <div style="margin-bottom:22px">
          <div style="font-size:0.78rem;font-weight:700;color:var(--hover-accent);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Why it's useful</div>
          <ul style="margin:0;padding-left:18px;color:var(--text-muted);font-size:0.87rem;line-height:1.9">
            <li>One place to manage all shared links — no more Slack threads or sticky notes</li>
            <li>New team members are productive from day one</li>
            <li>Track how much time your team saves across every jump</li>
            <li>Shared columns keep everyone organized the same way</li>
          </ul>
        </div>
        <div style="margin-bottom:22px">
          <div style="font-size:0.78rem;font-weight:700;color:var(--hover-accent);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">How to get started</div>
          <ol style="margin:0;padding-left:18px;color:var(--text-muted);font-size:0.87rem;line-height:1.9">
            <li>Click <button class="btn btn-subtle" style="font-size:0.8rem;padding:2px 9px;pointer-events:none;opacity:0.85"><svg class="ti ti-plus" style="width:0.85em;height:0.85em;vertical-align:middle"><use href="img/tabler-sprite.svg#tabler-plus"/></svg> Create Team</button> on the My Teams card</li>
            <li>Give your team a name and set a team password</li>
            <li>Invite members by email — they'll receive an invite link</li>
            <li>Share whole columns of Jumps with your team</li>
          </ol>
        </div>
        <div>
          <div style="font-size:0.78rem;font-weight:700;color:var(--hover-accent);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Joining a team</div>
          <p style="font-size:0.87rem;color:var(--text-muted);line-height:1.7;margin:0">
            If someone has invited you, the team will appear under <strong style="color:var(--text)">Teams I've Joined</strong> with a
            <button class="btn btn-primary" style="font-size:0.78rem;padding:3px 10px;pointer-events:none;vertical-align:middle;margin:0 2px"><svg class="ti ti-user-plus" style="width:0.85em;height:0.85em;vertical-align:middle;color:white"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Join Team</button>
            button. If you're expecting an invite, ask the team owner to send it to your account email.
          </p>
        </div>
      </div>
      <div style="padding:14px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;flex-shrink:0">
        <button class="btn btn-subtle" data-jaction="teams-tips-close"><svg class="ti ti-check" style="width:1em;height:1em;vertical-align:middle;margin-right:4px"><use href="img/tabler-sprite.svg#tabler-check"/></svg> OK</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

// Module-level utility: SHA-256 hash for team passwords
async function hashPassword(password) {
  const encoder = new TextEncoder();
  // Use PBKDF2 with a fixed salt derived from the app name + password length.
  // NOTE: Fixed salt removes per-password uniqueness vs. a random salt, weakening
  // rainbow-table resistance. Acceptable here since the hash is never exposed to
  // clients (verify-team-password Edge Function only). Future improvement: migrate
  // to a random per-team salt stored alongside the hash in the teams table.
  // This is significantly stronger than plain SHA-256 for password storage
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const salt = encoder.encode('jumpkit-team-salt-v1');
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function renderTeams(containerEl) {
  const content = containerEl || document.getElementById('acctTabContent') || document.getElementById('pageContent');

  content.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;text-align:center;color:var(--text-muted)">
    <svg class="ti ti-loader" style="font-size:2rem;display:block;margin-bottom:12px;animation:spin 1s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader"/></svg>
    Loading teams...
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

  try {
    let supaUser = null;
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) supaUser = session.user;
    } catch (_) {}

    if (!supaUser) {
      content.innerHTML = `<div class="no-columns">
        <div class="big-icon"><svg class="ti ti-cloud-off"><use href="img/tabler-sprite.svg#tabler-cloud-off"/></svg></div>
        <h3>Not connected to Supabase</h3>
        <p>Teams require a Supabase connection. Fill in your credentials in <code>supabase/config.js</code> and restart.</p>
      </div>`;
      return;
    }

    await renderUnifiedTeamsView(content, supaUser);
  } catch (err) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><svg class="ti ti-alert-circle"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg></div>
      <h3>Error loading teams</h3>
      <p style="color:var(--text-muted)">${esc(err.message)}</p>
    </div>`;
  }
}

// ── Unified Teams View (replaces org-owner / team-owner / team-member views) ─
// ── Team collapse/expand ─────────────────────────────────────────
// Key: jk_teams_expanded - stores only teams the user has explicitly opened (true).
// Default state for any team not in this object is COLLAPSED.
// Renamed from jk_teams_collapsed to avoid ambiguity with the old format
// (old format used true=collapsed, false=expanded - opposite semantics).
function _getTeamCollapsedState() {
  try { return JSON.parse(localStorage.getItem('jk_teams_expanded') || '{}'); } catch { return {}; }
}
function _getTeamCollapsed(teamId) {
  const state = _getTeamCollapsedState();
  // Collapsed unless explicitly expanded by user (saved as true in jk_teams_expanded)
  return state[teamId] === true ? false : true;
}
window.toggleTeam = function(teamId) {
  const entry = document.getElementById('teamEntry_' + teamId);
  if (!entry) return;
  const nowCollapsed = entry.classList.toggle('acct-team-collapsed');
  const state = _getTeamCollapsedState();
  if (nowCollapsed) {
    // User collapsed it - remove from expanded set (revert to default collapsed)
    delete state[teamId];
  } else {
    // User expanded it - save explicit expanded preference
    state[teamId] = true;
  }
  localStorage.setItem('jk_teams_expanded', JSON.stringify(state));
};

async function renderUnifiedTeamsView(content, supaUser) {
  // Auto-create org silently if user doesn't have one
  let { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', supaUser.id).single();
  if (!profile) throw new Error('Profile not found.');

  let orgId = profile.org_id;
  if (!orgId) {
    // Check if user already owns an org (safety check)
    const { data: existingOrg } = await supabaseClient.from('organizations').select('id').eq('owner_id', supaUser.id).maybeSingle();
    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      // Create org silently using email prefix as name
      const orgName = supaUser.email.split('@')[0];
      const { data: newOrg, error: orgErr } = await supabaseClient.from('organizations').insert({ name: orgName, owner_id: supaUser.id }).select().single();
      if (orgErr) throw orgErr;
      orgId = newOrg.id;
    }
    // Update profile with org_id and org-owner role
    await supabaseClient.from('profiles').update({ org_id: orgId, role: 'org-owner' }).eq('id', supaUser.id);
    profile = { ...profile, org_id: orgId, role: 'org-owner' };
    if (window._supabaseProfile) { window._supabaseProfile.org_id = orgId; window._supabaseProfile.role = 'org-owner'; }
  }

  _orgOwnerSupaUser = supaUser;
  selectedOrgId = orgId;

  // Fetch teams this user owns
  const { data: ownedTeams = [] } = await supabaseClient.from('teams').select('id, name, owner_id, org_id, created_at').eq('org_id', orgId).eq('owner_id', supaUser.id).order('name');

  // Fetch teams this user is a member of (but doesn't own)
  const { data: memberRows = [] } = await supabaseClient.from('team_members').select('team_id').eq('user_id', supaUser.id);
  const memberTeamIds = memberRows.map(r => r.team_id).filter(id => !ownedTeams.find(t => t.id === id));
  let memberTeams = [];
  for (const tid of memberTeamIds) {
    const { data: t } = await supabaseClient.from('teams').select('id, name, owner_id, org_id, created_at').eq('id', tid).single();
    if (t) memberTeams.push(t);
  }

  // Fetch pending invites for this user
  const { data: rawInvites = [] } = await supabaseClient.from('team_invites').select('*').eq('email', supaUser.email).eq('status', 'pending');
  const pendingInvites = [];
  for (const inv of rawInvites) {
    const { data: t } = await supabaseClient.from('teams').select('id, name, owner_id').eq('id', inv.team_id).single();
    let ownerLabel = 'team owner';
    if (t?.owner_id) {
      const { data: op } = await supabaseClient.from('profiles').select('first_name, last_name, email').eq('id', t.owner_id).single();
      ownerLabel = (op?.first_name && op?.last_name) ? `${op.first_name} ${op.last_name}` : (op?.email || 'team owner');
    }
    pendingInvites.push({ ...inv, teams: t, ownerLabel });
  }

  let html = `<div class="acct-grid">`;

  // ── My Teams (owned) ──
  html += `
    <div class="acct-section">
      <div class="acct-section-title">
        <svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg> My Teams
        <button class="btn btn-subtle tooltip-below" style="margin-left:auto;font-size:0.75rem;padding:4px 10px" data-tooltip="Create a new team" data-jaction="open-add-team-modal">
          <svg class="ti ti-plus"><use href="img/tabler-sprite.svg#tabler-plus"/></svg> Create Team
        </button>
      </div>`;

  if (ownedTeams.length === 0) {
    // Simplified empty state — tips live in the modal
    html += `
      <div class="acct-empty-state" style="padding:18px 4px">
        No teams yet. Click <strong>Create Team</strong> to get started, or
        <button data-jaction="show-teams-tips" style="background:none;border:none;padding:0;color:var(--hover-accent);font-size:inherit;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px">see how teams work</button>.
      </div>`;
  } else {
    for (const team of ownedTeams) {
      // Fetch members for this team
      const { data: members = [] } = await supabaseClient.from('team_members').select('id, user_id, profiles(email, first_name, last_name)').eq('team_id', team.id);
      const { data: pendingTeamInvites = [] } = await supabaseClient.from('team_invites').select('id, email, invited_at').eq('team_id', team.id).eq('status', 'pending');
      const { data: teamSharedCols = [] } = await supabaseClient.from('shared_columns').select('id, name, created_by').eq('team_id', team.id).order('position');
      // Batch-fetch sharer profiles for tooltips
      const _sharerIds = [...new Set(teamSharedCols.map(c => c.created_by).filter(Boolean))];
      const _sharerMap = {};
      if (_sharerIds.length) {
        const { data: _sharerProfs = [], error: _sharerErr } = await supabaseClient.from('profiles').select('id, first_name, last_name, email').in('id', _sharerIds);
        console.debug('[Teams] sharer IDs:', _sharerIds);
        console.debug('[Teams] sharer profiles result:', _sharerProfs, 'error:', _sharerErr);
        _sharerProfs.forEach(p => { _sharerMap[p.id] = p; });
      } else {
        console.debug('[Teams] no created_by IDs found on cols:', teamSharedCols);
      }

      const teamOwnerId = team.owner_id;

      // Sort: owner first, then joined members A→Z, then pending A→Z
      const ownerMembers  = members.filter(m => m.user_id === teamOwnerId);
      const regularMembers = members
        .filter(m => m.user_id !== teamOwnerId)
        .sort((a, b) => {
          const nameA = (a.profiles?.first_name || a.profiles?.email || '').toLowerCase();
          const nameB = (b.profiles?.first_name || b.profiles?.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
      const sortedMembers = [...ownerMembers, ...regularMembers];

      const sortedInvites = [...pendingTeamInvites].sort((a, b) =>
        (a.email || '').toLowerCase().localeCompare((b.email || '').toLowerCase())
      );

      const memberPills = sortedMembers.map(m => {
        const isOwner = m.user_id === teamOwnerId;
        const name  = m.profiles?.first_name ? `${m.profiles.first_name} ${m.profiles.last_name || ''}`.trim() : '';
        const email = m.profiles?.email || '';
        const label = name || email || m.user_id;
        const pill = isOwner
          ? `<span class="teams-badge teams-badge-owner" style="font-size:0.69rem;min-width:70px;padding:1px 7px;color:#00a8ad">Owner</span>`
          : `<span class="teams-badge" style="font-size:0.69rem;min-width:70px;padding:1px 7px;color:#178a3a">Member</span>`;
        const actionBtn = isOwner
          ? ''
          : `<button class="btn btn-delete" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Remove member" data-jaction="t-confirm-remove-member" data-id="${esc(m.id)}" data-label="${esc(label)}"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button>`;
        // Pill left of name + email on same row
        const nameEmail = `<div class="acct-name-email">${pill}<span class="acct-member-name">${esc(label)}</span>${email && name ? `<span class="acct-row-hint">${esc(email)}</span>` : ''}</div>`;
        return `<div class="acct-row acct-member-row"><div class="acct-row-label">${nameEmail}</div>${actionBtn ? `<div class="acct-member-actions">${actionBtn}</div>` : ''}</div>`;
      }).join('');

      const invitePills = sortedInvites.map(inv => `
        <div class="acct-row acct-member-row">
          <div class="acct-row-label">
            <div class="acct-name-email"><span class="teams-badge teams-badge-pending" style="font-size:0.69rem;min-width:70px;padding:1px 7px;color:#a07010">Pending</span><span class="acct-member-name">${esc(inv.email)}</span><span class="acct-row-hint">Invited ${new Date(inv.invited_at).toLocaleDateString()}</span></div>
          </div>
          <div class="acct-member-actions">
            <button class="btn btn-subtle" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Resend invitation" data-jaction="t-resend-invite" data-id="${esc(inv.id)}" data-email="${esc(inv.email)}" data-team="${esc(team.id)}"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg></button>
            <button class="btn btn-delete" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Cancel invitation" data-jaction="t-cancel-invite" data-id="${esc(inv.id)}" data-email="${esc(inv.email)}" data-teamname="${esc(team.name)}"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button>
          </div>
        </div>`).join('');

      const createdDate = team.created_at ? new Date(team.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
      const statsParts = [];
      const totalUsers = regularMembers.length + 1; // joined members + owner
      statsParts.push(`${totalUsers} user${totalUsers !== 1 ? 's' : ''}`);
      if (sortedInvites.length > 0) statsParts.push(`${sortedInvites.length} pending`);
      if (createdDate) statsParts.push(`created ${createdDate}`);
      const statsText = statsParts.join(' · ');

      const isCollapsed = _getTeamCollapsed(team.id);

      html += `
        <div class="acct-team-entry${isCollapsed ? ' acct-team-collapsed' : ''}" id="teamEntry_${team.id}">
          <div class="acct-team-header">
            <div class="acct-team-name-block">
              <button class="acct-team-chevron" data-jaction="t-toggle-team" data-id="${esc(team.id)}"><svg class="ti ti-chevron-down" style="width:1rem;height:1rem"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg></button>
              <div class="acct-team-name-text">
                <span class="acct-team-name">${esc(team.name)}</span>
                ${statsText ? `<span class="acct-team-stats">${statsText}</span>` : ''}
              </div>
            </div>
            <div class="acct-team-actions">
              <button class="btn btn-subtle" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Invite team members" data-jaction="t-invite-for-team" data-id="${esc(team.id)}"><svg class="ti ti-user-plus"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Invite</button>
              <button class="btn btn-subtle" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Change team password" data-jaction="t-change-pw" data-id="${esc(team.id)}" data-name="${esc(team.name)}"><svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg></button>
              <button class="btn btn-subtle" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Manage shared cols" data-jaction="t-share-col-modal" data-id="${esc(team.id)}" data-name="${esc(team.name)}"><svg class="ti ti-share"><use href="img/tabler-sprite.svg#tabler-share"/></svg> Manage Sharing</button>
              <button class="btn btn-delete" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Delete team" data-jaction="t-remove-team" data-id="${esc(team.id)}" data-name="${esc(team.name)}"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button>
            </div>
          </div>
          <div class="acct-team-members">
            ${memberPills}
            ${sortedInvites.length > 0 ? invitePills : ''}
            <div class="acct-team-cols-section">
              <span class="acct-team-cols-label"><svg class="ti ti-layout-columns" style="width:.85rem;height:.85rem;vertical-align:middle;margin-right:5px"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg>Shared Columns</span>
              <div class="acct-team-cols-list">
                ${teamSharedCols.length > 0
                  ? teamSharedCols.map(c => { const p = _sharerMap[c.created_by]; const fullName = `${p?.first_name||''} ${p?.last_name||''}`.trim(); const sharer = fullName || p?.email || 'a team member'; return `<span class="acct-team-col-chip" data-tooltip="Shared by ${esc(sharer)}">${esc(c.name)}<button class="acct-col-chip-remove" data-tooltip="Unshare this column" data-jaction="t-confirm-unshare-col" data-team-id="${esc(team.id)}" data-team-name="${esc(team.name)}" data-col-id="${esc(c.id)}" data-col-name="${esc(c.name)}">×</button></span>`; }).join('')
                  : '<span class="acct-row-hint" style="font-size:0.8rem">None yet - click <strong>Manage Sharing</strong> above to add one</span>'}
              </div>
            </div>
          </div>
        </div>`;
    }
  }
  html += `</div>`; // end My Teams section

  // ── Teams I've Joined ──
  html += `<div class="acct-section"><div class="acct-section-title"><svg class="ti ti-users-group"><use href="img/tabler-sprite.svg#tabler-users-group"/></svg> Teams I've Joined</div>`;
  if (memberTeams.length === 0) {
    html += `
      <div class="acct-empty-state" style="padding:18px 4px">
        No teams joined yet. When a team owner invites you, it appears here —
        <button data-jaction="show-teams-tips" style="background:none;border:none;padding:0;color:var(--hover-accent);font-size:inherit;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px">learn how joining works</button>.
      </div>`;
  } else {
    for (const team of memberTeams) {
      const { data: ownerProf } = await supabaseClient.from('profiles').select('email, first_name, last_name').eq('id', team.owner_id).single();
      const ownerName  = ownerProf?.first_name ? `${ownerProf.first_name} ${ownerProf.last_name || ''}`.trim() : '';
      const ownerEmail = ownerProf?.email || '';
      const ownerLabel = ownerName || ownerEmail || '-';
      // Fetch total member count for stats
      const { count: memberCount = 0 } = await supabaseClient.from('team_members').select('*', {count:'exact', head:true}).eq('team_id', team.id);
      const { data: joinedTeamCols = [] } = await supabaseClient.from('shared_columns').select('name, created_by').eq('team_id', team.id).order('position');
      // Batch-fetch sharer profiles for tooltips
      const _jSharerIds = [...new Set(joinedTeamCols.map(c => c.created_by).filter(Boolean))];
      const _jSharerMap = {};
      if (_jSharerIds.length) {
        const { data: _jSharerProfs = [], error: _jSharerErr } = await supabaseClient.from('profiles').select('id, first_name, last_name, email').in('id', _jSharerIds);
        console.debug('[Teams] joined sharer IDs:', _jSharerIds);
        console.debug('[Teams] joined sharer profiles result:', _jSharerProfs, 'error:', _jSharerErr);
        _jSharerProfs.forEach(p => { _jSharerMap[p.id] = p; });
      } else {
        console.debug('[Teams] joined: no created_by IDs found on cols:', joinedTeamCols);
      }
      const totalJoinedUsers = memberCount + 1; // +1 for owner (not in team_members table)
      const joinedCreatedDate = team.created_at ? new Date(team.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
      const joinedStatsParts = [`${totalJoinedUsers} user${totalJoinedUsers !== 1 ? 's' : ''}`];
      if (joinedCreatedDate) joinedStatsParts.push(`created ${joinedCreatedDate}`);
      const joinedStats = joinedStatsParts.join(' · ');
      const isCollapsed = _getTeamCollapsed(team.id);
      // Current user's own row
      const meName  = (window._supabaseProfile?.first_name ? `${window._supabaseProfile.first_name} ${window._supabaseProfile.last_name || ''}`.trim() : '') || supaUser.email;
      const meEmail = supaUser.email;
      html += `
        <div class="acct-team-entry${isCollapsed ? ' acct-team-collapsed' : ''}" id="teamEntry_${team.id}">
          <div class="acct-team-header">
            <div class="acct-team-name-block">
              <button class="acct-team-chevron" data-jaction="t-toggle-team" data-id="${esc(team.id)}"><svg class="ti ti-chevron-down" style="width:1rem;height:1rem"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg></button>
              <div class="acct-team-name-text">
                <span class="acct-team-name">${esc(team.name)}</span>
                <span class="acct-team-stats">${joinedStats}</span>
              </div>
            </div>
          </div>
          <div class="acct-team-members">
            <div class="acct-row acct-member-row">
              <div class="acct-row-label"><div class="acct-name-email"><span class="teams-badge teams-badge-owner" style="font-size:0.69rem;min-width:70px;padding:1px 7px;color:#00a8ad">Owner</span><span class="acct-member-name">${esc(ownerLabel)}</span>${ownerName && ownerEmail ? `<span class="acct-row-hint">${esc(ownerEmail)}</span>` : ''}</div></div>
            </div>
            <div class="acct-row acct-member-row">
              <div class="acct-row-label"><div class="acct-name-email"><span class="teams-badge" style="font-size:0.69rem;min-width:70px;padding:1px 7px;color:#178a3a">Member</span><span class="acct-member-name">${esc(meName)}</span>${meName !== meEmail ? `<span class="acct-row-hint">${esc(meEmail)}</span>` : ''}</div></div>
              <div class="acct-member-actions"><button class="btn btn-delete tooltip-left" style="font-size:0.75rem;padding:4px 10px" data-tooltip="Leave this team" data-jaction="t-confirm-leave-team" data-id="${esc(team.id)}" data-name="${esc(team.name)}"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button></div>
            </div>
            <div class="acct-team-cols-section">
              <span class="acct-team-cols-label"><svg class="ti ti-layout-columns" style="width:.85rem;height:.85rem;vertical-align:middle;margin-right:5px"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg>Shared Columns</span>
              <div class="acct-team-cols-list">
                ${joinedTeamCols.length > 0
                  ? joinedTeamCols.map(c => { const p = _jSharerMap[c.created_by]; const fullName = `${p?.first_name||''} ${p?.last_name||''}`.trim(); const sharer = fullName || p?.email || 'a team member'; return `<span class="acct-team-col-chip" data-tooltip="Shared by ${esc(sharer)}">${esc(c.name)}</span>`; }).join('')
                  : '<span class="acct-row-hint" style="font-size:0.8rem">No shared columns</span>'}
              </div>
            </div>
          </div>
        </div>`;
    }
  }
  html += `</div>`; // end Teams I've Joined section

  // ── Pending Invitations ──
  if (pendingInvites.length > 0) {
    html += `<div class="acct-section"><div class="acct-section-title"><svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Pending Invitations (${pendingInvites.length})</div>`;
    for (const inv of pendingInvites) {
      html += `
        <div class="acct-row">
          <div class="acct-row-label">
            <span>${esc(inv.teams?.name || 'Team')}</span>
            <span class="acct-row-hint">Invited by ${esc(inv.ownerLabel)}</span>
          </div>
          <button class="btn btn-primary" style="font-size:0.82rem;padding:6px 14px" data-jaction="t-join-team-modal" data-team-id="${esc(inv.teams?.id)}" data-team-name="${esc(inv.teams?.name || '')}" data-invite-id="${esc(inv.id)}">
            <svg class="ti ti-user-plus" style="color:white"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Join Team
          </button>
        </div>`;
    }
    html += `</div>`;
  }

  html += `</div>`; // end acct-grid
  content.innerHTML = html;
  addTeamsStyles();


}

// Helper: open invite modal wired to unified view
window.openInviteModalForTeam = function(teamId) {
  selectedTeamId = teamId;
  openInviteModal(teamId);
};

// ── Org-Owner View ────────────────────────────────────────────────
// Module-level selection state for the three-panel layout
let selectedOrgId = null;
let selectedTeamId = null;
let _orgOwnerSupaUser = null; // captured for modal callbacks

async function renderOrgOwnerView(content, supaUser, profile) {
  _orgOwnerSupaUser = supaUser;

  // Check if user owns any org (bypass org_id check - fetch directly)
  const { data: ownedOrg } = await supabaseClient
    .from('organizations')
    .select('*')
    .eq('owner_id', supaUser.id)
    .maybeSingle();

  // Auto-patch profile if org exists but org_id not set on profile
  if (ownedOrg && !profile.org_id) {
    { const { error: _e1 } = await supabaseClient.from('profiles').update({ org_id: ownedOrg.id, role: 'org-owner' }).eq('id', supaUser.id); if (_e1) console.warn('[Teams] profile patch failed:', _e1.message); }
    profile.org_id = ownedOrg.id;
    profile.role = 'org-owner';
    if (window._supabaseProfile) { window._supabaseProfile.org_id = ownedOrg.id; window._supabaseProfile.role = 'org-owner'; }
  }

  // If no org yet - show create org form
  if (!ownedOrg && !profile.org_id) {
    content.innerHTML = `
      <div class="acct-grid">
        <div class="acct-section">
          <div class="acct-section-title"><svg class="ti ti-building"><use href="img/tabler-sprite.svg#tabler-building"/></svg> Create Your Organization</div>
          <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px">You haven't set up an organization yet. Create one to start managing teams and sharing jumps.</p>
          <div class="form-group">
            <label class="form-label">Organization Name</label>
            <input class="form-input" id="newOrgName" placeholder="e.g. Acme Corp" style="max-width:320px"/>
          </div>
          <div style="margin-top:8px">
            <button class="btn btn-primary" data-jaction="t-create-org"><svg class="ti ti-building"><use href="img/tabler-sprite.svg#tabler-building"/></svg> Create Organization</button>
          </div>
          <div id="createOrgMsg" style="margin-top:12px;font-size:0.85rem"></div>
        </div>
      </div>`;

    window.createOrganization = async function() {
      const name = document.getElementById('newOrgName')?.value.trim();
      const msg = document.getElementById('createOrgMsg');
      if (!name) { if (msg) { msg.style.color='#ef4444'; msg.textContent='Organization name is required.'; } return; }
      if (msg) { msg.style.color='var(--text-muted)'; msg.textContent='Creating...'; }
      try {
        const { data: org, error } = await supabaseClient
          .from('organizations')
          .insert({ name, owner_id: supaUser.id })
          .select()
          .single();
        if (error) throw error;
        // Update profile org_id
        { const { error: _e2 } = await supabaseClient.from('profiles').update({ org_id: org.id }).eq('id', supaUser.id); if (_e2) console.warn('[Teams] org profile update failed:', _e2.message); }
        if (msg) { msg.style.color='#22c55e'; msg.textContent='Organization created! Reloading...'; }
        setTimeout(() => renderTeams(), 800);
      } catch(e) {
        if (msg) { msg.style.color='#ef4444'; msg.textContent='Error: ' + e.message; }
      }
    };
    return;
  }

  // Use the org we already fetched above
  let org = ownedOrg;
  try {
    if (!org) {
      const { data, error } = await supabaseClient
        .from('organizations')
        .select('*')
        .eq('id', profile.org_id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      org = data;
    }
  } catch (err) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><svg class="ti ti-alert-circle"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg></div>
      <h3>Error loading organization</h3>
      <p style="color:var(--text-muted)">${esc(err.message)}</p>
    </div>`;
    return;
  }

  if (!org) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><svg class="ti ti-building"><use href="img/tabler-sprite.svg#tabler-building"/></svg></div>
      <h3>No organization found</h3>
      <p>Your account is marked as org-owner but no organization was found. Try creating one.</p>
    </div>`;
    return;
  }

  // Reset selection state on each render
  selectedOrgId = null;
  selectedTeamId = null;

  // Fetch team count + member count for org stats
  const { data: orgTeams = [] } = await supabaseClient.from('teams').select('id').eq('org_id', org.id);
  const orgTeamIds = orgTeams.map(t => t.id);
  let orgMemberCount = 0;
  if (orgTeamIds.length) {
    const { count } = await supabaseClient.from('team_members').select('id', { count: 'exact', head: true }).in('team_id', orgTeamIds);
    orgMemberCount = count || 0;
  }
  const orgCreated = org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-';

  // New layout: org on top, teams + members side by side below
  content.innerHTML = `
    <div class="acct-grid">

      <!-- Org row (full width, no selection needed) -->
      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-building"><use href="img/tabler-sprite.svg#tabler-building"/></svg> Your Organization</div>
        <div class="acct-row" style="flex-wrap:wrap;gap:24px;border-bottom:none">
          <div style="text-align:center">
            <div style="font-size:0.88rem;font-weight:500;color:var(--text-muted)">${esc(org.name)}</div>
            <div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px">Organization</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:0.88rem;font-weight:500;color:var(--text-muted)" id="orgTeamsCount">${orgTeams.length}</div>
            <div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px" id="orgTeamsLabel">${orgTeams.length === 1 ? "Team" : "Teams"}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:0.88rem;font-weight:500;color:var(--text-muted)" id="orgMembersCount">${orgMemberCount}</div>
            <div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px" id="orgMembersLabel">${orgMemberCount === 1 ? "Member" : "Members"}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:0.88rem;font-weight:500;color:var(--text-muted)">${orgCreated}</div>
            <div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px">Created</div>
          </div>
          <div style="text-align:center">
            <span class="teams-badge teams-badge-owner">Org Owner</span>
            <div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px">Role</div>
          </div>
        </div>
      </div>

      <!-- Teams + Members side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch">

        <!-- Teams panel -->
        <div class="acct-section">
          <div class="acct-section-title" style="display:flex;align-items:center">
            <svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Your Teams
            <button class="btn btn-subtle" style="margin-left:auto;font-size:0.8rem;padding:3px 10px"
                    data-jaction="open-add-team-modal" id="addTeamBtn">
              <svg class="ti ti-plus"><use href="img/tabler-sprite.svg#tabler-plus"/></svg> Add Team
            </button>
          </div>
          <div id="teamsPanel">
            <p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No teams yet. Click <strong>Create Team</strong> to get started.</p>
          </div>
        </div>

        <!-- Members panel -->
        <div class="acct-section">
          <div class="acct-section-title" style="display:flex;align-items:center">
            <svg class="ti ti-user-check"><use href="img/tabler-sprite.svg#tabler-user-check"/></svg> Members
            <button class="btn btn-subtle" style="margin-left:auto;font-size:0.8rem;padding:3px 10px"
                    data-jaction="t-open-invite-members" id="inviteBtn" style="display:none">
              <svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Invite Members
            </button>
          </div>
          <div id="membersPanel">
            <p style="color:var(--text-dim);font-size:0.82rem;text-align:center;padding:24px 8px">Select a team to see members.</p>
          </div>
        </div>

      </div>
    </div>`;

  addTeamsStyles();

  // Auto-load teams since org is implicit
  selectOrg(org.id);
}

// ── Org-Owner: Select Org ─────────────────────────────────────────
window.selectOrg = async function(orgId) {
  selectedOrgId = orgId;
  selectedTeamId = null;

  // Highlight org row
  document.querySelectorAll('[id^="orgRow_"]').forEach(el => el.classList.remove('teams-row-selected'));
  const orgRow = document.getElementById(`orgRow_${orgId}`);
  if (orgRow) orgRow.classList.add('teams-row-selected');

  // Enable Add Team, disable Invite
  const addTeamBtn = document.getElementById('addTeamBtn');
  if (addTeamBtn) addTeamBtn.disabled = false;
  const inviteBtn = document.getElementById('inviteBtn');
  if (inviteBtn) inviteBtn.style.display = 'none';

  // Clear members panel
  const membersPanel = document.getElementById('membersPanel');
  if (membersPanel) membersPanel.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem;text-align:center;padding:24px 8px">Select a team to see members.</p>`;

  // Fetch and render teams
  const teamsPanel = document.getElementById('teamsPanel');
  if (!teamsPanel) return;
  teamsPanel.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">Loading...</p>`;

  try {
    const { data: teams = [], error } = await supabaseClient
      .from('teams')
      .select('id, name, owner_id, org_id, created_at')
      .eq('org_id', orgId)
      .order('name');
    if (error) throw error;

    // Fetch member counts and pending invite counts for all teams
    let memberCounts = {};
    let inviteCounts = {};
    if (teams.length) {
      const teamIds = teams.map(t => t.id);
      const { data: counts = [] } = await supabaseClient
        .from('team_members')
        .select('team_id')
        .in('team_id', teamIds);
      counts.forEach(c => { memberCounts[c.team_id] = (memberCounts[c.team_id] || 0) + 1; });

      const { data: invites = [] } = await supabaseClient
        .from('team_invites')
        .select('team_id')
        .in('team_id', teamIds)
        .eq('status', 'pending');
      invites.forEach(i => { inviteCounts[i.team_id] = (inviteCounts[i.team_id] || 0) + 1; });
    }

    if (teams.length === 0) {
      teamsPanel.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No teams yet. Click <strong>Create Team</strong> to get started.</p>`;
    } else {
      teamsPanel.innerHTML = teams.map(t => {
        const mCount = memberCounts[t.id] || 0;
        const iCount = inviteCounts[t.id] || 0;
        const created = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : '-';
        const inviteHint = ` · ${iCount} pending invite${iCount !== 1 ? 's' : ''}`;
        return `
        <div class="acct-row teams-selectable-row" id="teamRow_${t.id}" data-jaction="t-select-team" data-id="${esc(t.id)}">
          <div class="acct-row-label">
            <span>${esc(t.name)}</span>
            <span class="acct-row-hint">${mCount} member${mCount !== 1 ? 's' : ''}${inviteHint}</span>
            <span class="acct-row-hint">Created ${created}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <svg class="ti ti-chevron-right" style="color:var(--text-muted);font-size:0.8rem"><use href="img/tabler-sprite.svg#tabler-chevron-right"/></svg>
            <button class="btn btn-subtle" data-tooltip="Change team password" style="font-size:0.75rem;padding:3px 8px" data-jaction="t-change-pw" data-id="${esc(t.id)}" data-name="${esc(t.name)}" data-stop-prop="1"><svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg></button>
            <button class="btn btn-delete" data-tooltip="Delete team" style="font-size:0.75rem;padding:3px 8px" data-jaction="t-remove-team" data-id="${esc(t.id)}" data-name="${esc(t.name)}" data-stop-prop="1"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button>
          </div>
        </div>`;
      }).join('');
    }
  } catch (err) {
    teamsPanel.innerHTML = `<p style="color:#ef4444;font-size:0.85rem;padding:8px 0">Error: ${esc(err.message)}</p>`;
  }
};

// ── Org-Owner: Select Team ────────────────────────────────────────
window.selectTeam = async function(teamId) {
  selectedTeamId = teamId;

  // Highlight team row, clear others
  document.querySelectorAll('[id^="teamRow_"]').forEach(el => el.classList.remove('teams-row-selected'));
  const teamRow = document.getElementById(`teamRow_${teamId}`);
  if (teamRow) teamRow.classList.add('teams-row-selected');

  // Enable Invite Members button
  const inviteBtn = document.getElementById('inviteBtn');
  if (inviteBtn) inviteBtn.style.display = '';

  // Fetch and render members
  const membersPanel = document.getElementById('membersPanel');
  if (!membersPanel) return;
  membersPanel.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem;text-align:center;padding:24px 8px">Loading...</p>`;

  try {
    const { data: members = [], error } = await supabaseClient
      .from('team_members')
      .select('*, profiles(email, first_name, last_name, role)')
      .eq('team_id', teamId);
    if (error) throw error;

    // Fetch team name for use in cancel modal
    const { data: teamInfo } = await supabaseClient.from('teams').select('name, owner_id').eq('id', teamId).single();
    const teamName = teamInfo?.name || '';
    const teamOwnerId = teamInfo?.owner_id || '';

    // Also fetch pending invites
    const { data: invites = [] } = await supabaseClient
      .from('team_invites')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'pending');

    if (members.length === 0 && invites.length === 0) {
      membersPanel.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem;text-align:center;padding:24px 8px">No members yet.</p>`;
    } else {
      const inviteRows = invites.length ? `
        ${members.length > 0 ? '<div style="font-size:0.72rem;color:var(--text-dim);padding:8px 0 4px 20px;border-top:1px solid var(--border);margin-top:4px">Pending Invites</div>' : '<div style="font-size:0.72rem;color:var(--text-dim);padding:8px 0 4px 20px">Pending Invites</div>'}
        ${invites.map((inv, i) => `
          <div class="acct-row" style="border-top:none">
            <div class="acct-row-label">
              <span style="color:var(--text-muted)">${esc(inv.email)}</span>
              <span class="acct-row-hint">Invite pending</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="teams-badge teams-badge-pending" style="font-size:0.65rem;padding:1px 7px">Pending</span>
              <button class="btn btn-subtle" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Resend invitation" data-jaction="t-resend-invite" data-id="${esc(inv.id)}" data-email="${esc(inv.email)}" data-team="${esc(inv.team_id)}"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Invite Again</button>
              <button class="btn btn-delete" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Cancel invitation" data-jaction="t-cancel-invite" data-id="${esc(inv.id)}" data-email="${esc(inv.email)}" data-teamname="${esc(teamName)}"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
            </div>
          </div>`).join('')}` : '';

      // Sort: org-owner first, then team-owner, then members
      const roleOrder = { 'org-owner': 0, 'team-owner': 1, 'team-member': 2 };
      members.sort((a, b) => (roleOrder[a.profiles?.role] ?? 2) - (roleOrder[b.profiles?.role] ?? 2));

      membersPanel.innerHTML = members.map(m => {
        const name = [m.profiles?.first_name, m.profiles?.last_name].filter(Boolean).join(' ');
        const email = m.profiles?.email || m.user_id;
        const joined = m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '-';
        const role = m.profiles?.role || 'team-member';
        const roleLabel = role === 'org-owner' ? 'Org Owner' : role === 'team-owner' ? 'Team Owner' : 'Member';
        const pillStyle = role === 'org-owner'
          ? 'background:rgba(26,79,214,0.18);color:#7aa8f7;border:1px solid rgba(26,79,214,0.35)'     // blue - matches org card
          : role === 'team-owner'
          ? 'background:rgba(250,204,21,0.12);color:#fbbf24;border:1px solid rgba(250,204,21,0.25)'   // gold
          : 'background:rgba(160,174,192,0.10);color:#8a9bb0;border:1px solid rgba(160,174,192,0.2)'; // grey
        return `
          <div class="acct-row">
            <div class="acct-row-label">
              <span style="display:flex;align-items:center;gap:6px">
                <span style="color:var(--text-muted)">${name ? esc(name) : esc(email)}</span>
                <span style="padding:1px 7px;font-size:0.65rem;border-radius:4px;${pillStyle}">${roleLabel}</span>
              </span>
              ${name ? `<span class="acct-row-hint">${esc(email)}</span>` : ''}
              <span class="acct-row-hint">Joined ${joined}</span>
            </div>
            ${m.user_id === teamOwnerId ? '' : `<button class="btn btn-delete tooltip-left" data-tooltip="Remove member" style="font-size:0.75rem;padding:3px 8px" data-jaction="t-confirm-remove-member" data-id="${esc(m.id)}" data-label="${esc(name || email)}"><svg class="ti ti-user-minus"><use href="img/tabler-sprite.svg#tabler-user-minus"/></svg></button>`}
          </div>`;
      }).join('') + inviteRows;
    }
  } catch (err) {
    membersPanel.innerHTML = `<p style="color:#ef4444;font-size:0.85rem;padding:8px 0">Error: ${esc(err.message)}</p>`;
  }
};

// ── Org-Owner: Add Team Modal ─────────────────────────────────────
window.openAddTeamModal = async function() {
  if (!selectedOrgId) return;

  // Free tier: check team limit before showing the modal
  const tier = window._supabaseProfile?.subscription_tier || 'free';
  if (tier === 'free') {
    const { data: existingTeams } = await supabaseClient.from('teams').select('id').eq('org_id', selectedOrgId);
    if (existingTeams && existingTeams.length >= 1) {
      showUpgradeModal(
        'Team Limit Reached',
        'The free tier allows <strong>1 team</strong>. Upgrade to JumpKit Unlimited for unlimited teams, unlimited shared jumps, and unlimited launches.'
      );
      return;
    }
  }
  const body = `
    <div class="form-group">
      <label class="form-label">Team Name *</label>
      <input class="form-input" id="atTeamName" placeholder="e.g. Sales Team"/>
      <span class="form-error" id="atTeamNameErr">Team name is required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Team Password *</label>
      <div class="pw-wrap">
        <input class="form-input" type="password" id="atTeamPassword" placeholder="Members will need this to join" style="padding-right:38px"/>
        <button type="button" class="pw-eye" tabindex="-1" id="atTeamPasswordEye"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <ul style="list-style:none;padding:6px 0 0 4px;margin:0" id="atPwRules">
        <li id="atRule-len"   style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="at-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>At least 8 characters</li>
        <li id="atRule-upper" style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="at-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One uppercase letter</li>
        <li id="atRule-lower" style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="at-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One lowercase letter</li>
        <li id="atRule-num"   style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="at-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One number</li>
        <li id="atRule-special" style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="at-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One special character (!@#$%^&amp;*)</li>
        <li id="atRule-match"   style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="at-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>Passwords match</li>
      </ul>
      <span class="form-error" id="atTeamPasswordErr">Password does not meet requirements.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Confirm Password *</label>
      <div class="pw-wrap">
        <input class="form-input" type="password" id="atTeamPasswordConfirm" placeholder="Re-enter password" style="padding-right:38px"/>
        <button type="button" class="pw-eye" tabindex="-1" id="atTeamPasswordConfirmEye"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <span class="form-error" id="atTeamPasswordConfirmErr">Passwords do not match.</span>
    </div>`;

  Modal.open('<svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Add Team', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" data-jaction="t-save-add-team"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save</button>`, 'sm');

  // Wire eye toggles + live password rules
  setTimeout(() => {
    const eyeOpen   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    [['atTeamPasswordEye','atTeamPassword'],['atTeamPasswordConfirmEye','atTeamPasswordConfirm']].forEach(([eyeId, inputId]) => {
      const eye = document.getElementById(eyeId);
      const inp = document.getElementById(inputId);
      if (!eye || !inp) return;
      eye.addEventListener('click', () => {
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        eye.innerHTML = show ? eyeClosed : eyeOpen;
      });
    });

    // Live password rule checklist
    const atPwRules = {
      'atRule-len':     p => p.length >= 8,
      'atRule-upper':   p => /[A-Z]/.test(p),
      'atRule-lower':   p => /[a-z]/.test(p),
      'atRule-num':     p => /[0-9]/.test(p),
      'atRule-special': p => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p),
    };
    const pwInput  = document.getElementById('atTeamPassword');
    const cfmInput = document.getElementById('atTeamPasswordConfirm');

    function updateAtRules() {
      const p = pwInput?.value || '';
      const c = cfmInput?.value || '';
      for (const [id, fn] of Object.entries(atPwRules)) {
        const li = document.getElementById(id);
        if (!li) continue;
        const icon = li.querySelector('.at-rule-icon');
        const ok = fn(p);
        li.style.color = ok ? '#50CACC' : '#4A6280';
        if (icon) { icon.textContent = ok ? '✓' : '✕'; icon.style.color = ok ? '#50CACC' : '#f87171'; }
      }
      // match rule
      const matchLi = document.getElementById('atRule-match');
      if (matchLi) {
        const icon = matchLi.querySelector('.at-rule-icon');
        const ok = p.length > 0 && p === c;
        matchLi.style.color = ok ? '#50CACC' : '#4A6280';
        if (icon) { icon.textContent = ok ? '✓' : '✕'; icon.style.color = ok ? '#50CACC' : '#f87171'; }
      }
    }
    if (pwInput)  pwInput.addEventListener('input', updateAtRules);
    if (cfmInput) cfmInput.addEventListener('input', updateAtRules);
  }, 100);
};

window.saveAddTeam = async function() {
  const name     = document.getElementById('atTeamName')?.value.trim();
  const password = document.getElementById('atTeamPassword')?.value;

  const passwordConfirm = document.getElementById('atTeamPasswordConfirm')?.value;
  ['atTeamNameErr', 'atTeamPasswordErr', 'atTeamPasswordConfirmErr'].forEach(id => {
    document.getElementById(id)?.classList.remove('show');
  });

  const pwValid = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  let ok = true;
  if (!name)     { document.getElementById('atTeamNameErr')?.classList.add('show'); ok = false; }
  if (!password || !pwValid) { document.getElementById('atTeamPasswordErr')?.classList.add('show'); ok = false; }
  if (password && password !== passwordConfirm) { document.getElementById('atTeamPasswordConfirmErr')?.classList.add('show'); ok = false; }
  if (!ok) return;

  // Spinner on save button - show for at least 1.5s
  const saveBtn = document.querySelector('[data-jaction="t-save-add-team"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<svg class="ti ti-loader" style="animation:spin 0.8s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader"/></svg> Saving...'; }
  const _atSpinStart = Date.now();

  try {
    const hashedPassword = await hashPassword(password);
    const ownerId = _orgOwnerSupaUser?.id;
    const { data: team, error } = await supabaseClient
      .from('teams')
      .insert({ org_id: selectedOrgId, name, team_password_hash: hashedPassword, owner_id: ownerId })
      .select()
      .single();
    if (error) throw error;

    // Auto-add the org owner as a team member
    await supabaseClient.from('team_members').insert({
      id: crypto.randomUUID(),
      team_id: team.id,
      user_id: ownerId,
      joined_at: new Date().toISOString(),
    });

    const _atElapsed = Date.now() - _atSpinStart;
    const _atDelay = Math.max(0, 1500 - _atElapsed);
    setTimeout(() => {
      Modal.close();
      Toast.success(`Team "${esc(name)}" created!`);
      renderTeams();
    }, _atDelay);
  } catch (err) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save'; }
    Toast.danger('Failed to create team: ' + err.message);
  }
};

// ── Org-Owner: Invite Members Modal ──────────────────────────────
window.openInviteMembersModal = function() {

  if (!selectedTeamId) return;
  const body = `
    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:16px">
      Enter email addresses to invite (one per line). An invitation will be sent to each address.
    </p>
    <div class="form-group">
      <label class="form-label">Email Addresses *</label>
      <textarea class="form-textarea" id="orgInviteEmails" maxlength="2000"
        placeholder="alice@example.com&#10;bob@example.com" style="min-height:120px"></textarea>
      <span class="form-error" id="orgInviteEmailsErr">At least one valid email required.</span>
    </div>`;

  Modal.open('<svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Invite Members', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" id="sendOrgInvitesBtn" data-jaction="t-send-org-invites"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Send Invites</button>`, 'sm');
};

window.sendOrgInvites = async function() {
  const raw = document.getElementById('orgInviteEmails')?.value.trim() || '';
  const allEmails = raw.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
  const errEl = document.getElementById('orgInviteEmailsErr');
  errEl?.classList.remove('show');

  // Validation
  if (allEmails.length === 0) {
    if (errEl) { errEl.textContent = 'Please enter at least one email address.'; errEl.classList.add('show'); } return;
  }
  const invalidEmails = allEmails.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (invalidEmails.length > 0) {
    if (errEl) { errEl.textContent = `Invalid address${invalidEmails.length > 1 ? 'es' : ''}: ${invalidEmails.join(', ')}`; errEl.classList.add('show'); } return;
  }
  const lowerEmails = allEmails.map(e => e.toLowerCase().trim());
  const uniqueEmails = [...new Set(lowerEmails)];
  if (uniqueEmails.length < lowerEmails.length) {
    const dups = lowerEmails.filter((e, i) => lowerEmails.indexOf(e) !== i);
    if (errEl) { errEl.textContent = `Duplicate address${dups.length > 1 ? 'es' : ''} found: ${[...new Set(dups)].join(', ')}`; errEl.classList.add('show'); } return;
  }
  if (uniqueEmails.length > 25) {
    if (errEl) { errEl.textContent = `Maximum 25 email addresses per invite. You entered ${uniqueEmails.length}.`; errEl.classList.add('show'); } return;
  }

  // Check self-invite, existing members, pending invites
  try {
    const { data: { session: chkSession } } = await supabaseClient.auth.getSession();
    const currentUserEmail = chkSession?.user?.email?.toLowerCase();
    if (currentUserEmail && uniqueEmails.includes(currentUserEmail)) {
      if (errEl) { errEl.textContent = 'You cannot invite yourself.'; errEl.classList.add('show'); } return;
    }
    const { data: memberProfiles = [] } = await supabaseClient.from('team_members').select('profiles(email)').eq('team_id', selectedTeamId);
    const memberEmails = memberProfiles.map(m => m.profiles?.email?.toLowerCase()).filter(Boolean);
    const alreadyMembers = uniqueEmails.filter(e => memberEmails.includes(e));
    if (alreadyMembers.length > 0) {
      if (errEl) { errEl.textContent = `Already a member: ${alreadyMembers.join(', ')}`; errEl.classList.add('show'); } return;
    }
    const { data: pendingInvites = [] } = await supabaseClient.from('team_invites').select('email').eq('team_id', selectedTeamId).eq('status', 'pending');
    const pendingEmails = pendingInvites.map(i => i.email?.toLowerCase()).filter(Boolean);
    const alreadyInvited = uniqueEmails.filter(e => pendingEmails.includes(e));
    if (alreadyInvited.length > 0) {
      if (errEl) { errEl.textContent = `Already has a pending invitation: ${alreadyInvited.join(', ')}`; errEl.classList.add('show'); } return;
    }

    // Free tier: enforce 5-member-per-team cap (owner + 4 members max)
    const inviterTier = window._supabaseProfile?.subscription_tier || 'free';
    if (inviterTier === 'free') {
      const FREE_MEMBER_CAP = 4; // max non-owner members (5 total including owner)
      const { count: curMembers } = await supabaseClient
        .from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', selectedTeamId);
      const { count: curPending } = await supabaseClient
        .from('team_invites').select('id', { count: 'exact', head: true }).eq('team_id', selectedTeamId).eq('status', 'pending');
      const occupied = (curMembers || 0) + (curPending || 0);
      const slotsAvailable = FREE_MEMBER_CAP - occupied;
      if (uniqueEmails.length > slotsAvailable) {
        const msg = slotsAvailable <= 0
          ? 'Free teams are limited to 5 members. This team is full. Upgrade to JumpKit Unlimited for unlimited members.'
          : `Free teams are limited to 5 members. You can only invite ${slotsAvailable} more member${slotsAvailable !== 1 ? 's' : ''}. Upgrade to JumpKit Unlimited for unlimited members.`;
        if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
        return;
      }
    }
  } catch (checkErr) {
    console.warn('[sendOrgInvites] pre-check failed:', checkErr.message);
  }

  const emails = uniqueEmails;

  // Show spinner on button
  const sendOrgBtn = document.getElementById('sendOrgInvitesBtn');
  if (sendOrgBtn) { sendOrgBtn.disabled = true; sendOrgBtn.innerHTML = '<svg class="ti ti-loader" style="animation:spin 1s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader"/></svg> Sending...'; }

  try {
    const invitedBy = _orgOwnerSupaUser?.id;
    let sent = 0, failed = 0;

    for (const email of emails) {
      try {
        const { error: insertErr } = await supabaseClient.from('team_invites').insert({
          team_id:    selectedTeamId,
          email,
          invited_by: invitedBy,
          status:     'pending',
        });
        if (insertErr) throw insertErr;
        // Try to send invite email - non-fatal if Edge Function not yet deployed
        try {
          await supabaseClient.functions.invoke('send-invite', {
            body: { email, teamId: selectedTeamId, invitedBy },
          });
        } catch (_) { /* email sending optional until Resend is configured */ }
        sent++;
      } catch (e) {
        console.warn('[sendOrgInvites] error for', email, e.message);
        failed++;
      }
    }

    Modal.close();
    if (failed === 0) {
      Toast.success(`${sent} invitation${sent !== 1 ? 's' : ''} sent!`);
    } else {
      Toast.success(`${sent} sent, ${failed} failed.`);
    }
    renderTeams();
  } catch (err) {
    Toast.danger('Failed to send invites: ' + err.message);
  }
};

window.resendInvite = async function(inviteId, email, teamId) {
  // Prompt owner to enter team password before resending
  Modal.open(
    '<svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Resend Invite',
    `<p style="color:var(--text-muted);font-size:.88rem;margin-bottom:16px">
      Re-sending invite to <strong>${esc(email)}</strong>.<br>Enter the team password to verify and include it in the email.
    </p>
    <div class="form-group">
      <label class="form-label">Team Password *</label>
      <div style="position:relative">
        <input class="form-input" type="password" id="resendTeamPassword" placeholder="Enter team password" autocomplete="off" />
        <button type="button" class="pw-eye" tabindex="-1" data-jaction="t-pw-toggle" data-target="resendTeamPassword" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:0;color:var(--text-muted)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <span class="form-error" id="resendTeamPasswordErr">Incorrect team password.</span>
    </div>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" id="resendConfirmBtn" data-jaction="t-do-resend-invite" data-invite-id="${esc(inviteId)}" data-email="${esc(email)}" data-team-id="${esc(teamId)}"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Resend</button>`,
    'sm'
  );
  setTimeout(() => document.getElementById('resendTeamPassword')?.focus(), 100);
};

window.doResendInvite = async function(inviteId, email, teamId) {
  const candidatePassword = document.getElementById('resendTeamPassword')?.value.trim() || '';
  const pwErrEl = document.getElementById('resendTeamPasswordErr');
  pwErrEl?.classList.remove('show');

  if (!candidatePassword) {
    if (pwErrEl) { pwErrEl.textContent = 'Please enter the team password.'; pwErrEl.classList.add('show'); }
    return;
  }

  const resendBtn = document.getElementById('resendConfirmBtn');
  if (resendBtn) { resendBtn.disabled = true; resendBtn.innerHTML = '<svg class="ti ti-loader" style="animation:spin 1s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader"/></svg> Sending...'; }

  try {
    // Verify password server-side first
    const { data: verifyData, error: verifyErr } = await supabaseClient.functions.invoke('verify-team-password', {
      body: { teamId, candidatePassword },
    });
    if (verifyErr || !verifyData?.valid) {
      if (pwErrEl) { pwErrEl.textContent = 'Incorrect team password.'; pwErrEl.classList.add('show'); }
      if (resendBtn) { resendBtn.disabled = false; resendBtn.innerHTML = '<svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Resend'; }
      return;
    }

    // Reset invite to pending
    const { error } = await supabaseClient
      .from('team_invites')
      .update({ status: 'pending', invited_at: new Date().toISOString() })
      .eq('id', inviteId);
    if (error) throw error;

    // Re-send email (non-fatal)
    try {
      const invitedBy = _orgOwnerSupaUser?.id;
      const { data: team } = await supabaseClient
        .from('teams')
        .select('name, org_id')
        .eq('id', teamId)
        .single();
      let orgName = '';
      if (team?.org_id) {
        const { data: org } = await supabaseClient.from('organizations').select('name').eq('id', team.org_id).single();
        orgName = org?.name || '';
      }
      await supabaseClient.functions.invoke('send-invite', {
        body: { email, teamId, invitedBy, teamName: team?.name || '', orgName, teamPassword: candidatePassword },
      });
    } catch (_) { /* email sending optional */ }

    Modal.close();
    Toast.success(`Invite resent to ${email}!`);
  } catch (e) {
    Toast.danger('Failed to resend invite: ' + e.message);
    if (resendBtn) { resendBtn.disabled = false; resendBtn.innerHTML = '<svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Resend'; }
  }
};

window.cancelInvite = async function(inviteId, email, teamName) {
  Modal.open(
    '<svg class="ti ti-mail-off" style="color:var(--danger)"><use href="img/tabler-sprite.svg#tabler-mail-off"/></svg> Cancel Invitation',
    `<p style="color:var(--text-muted);font-size:0.92rem;line-height:1.6">
      Are you sure you want to cancel the invitation for <strong style="color:var(--text-muted)">${esc(email)}</strong>? They will no longer be able to join <strong style="color:var(--text-muted)">${esc(teamName)}</strong> using this invite.
    </p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Keep Invite</button>
     <button class="btn btn-delete" data-jaction="t-confirm-cancel-invite" data-id="${esc(inviteId)}"><svg class="ti ti-mail-off"><use href="img/tabler-sprite.svg#tabler-mail-off"/></svg> Cancel Invitation</button>`,
    'sm'
  );
};

window.confirmCancelInvite = async function(inviteId) {
  try {
    const { error } = await supabaseClient
      .from('team_invites')
      .delete()
      .eq('id', inviteId);
    if (error) throw error;
    Modal.close();
    Toast.success('Invitation cancelled.');
    renderTeams();
  } catch (e) {
    Toast.danger('Failed to cancel invitation: ' + e.message);
  }
};

// ── Team-Owner View ───────────────────────────────────────────────
async function renderTeamOwnerView(content, supaUser, profile) {
  // Find team this user owns
  const { data: teams = [] } = await supabaseClient
    .from('teams')
    .select('id, name, owner_id, org_id, created_at')
    .eq('owner_id', supaUser.id);

  const team = teams[0] || null;

  if (!team) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg></div>
      <h3>No team assigned</h3>
      <p>You are a team owner but have not been assigned a team yet. Contact your org owner.</p>
    </div>`;
    return;
  }

  // Fetch members
  const { data: memberRows = [] } = await supabaseClient
    .from('team_members')
    .select('*, profiles(email, role)')
    .eq('team_id', team.id);

  // Fetch pending invites
  const { data: invites = [] } = await supabaseClient
    .from('team_invites')
    .select('*')
    .eq('team_id', team.id)
    .eq('status', 'pending');

  // Fetch org name
  const { data: org } = await supabaseClient
    .from('organizations')
    .select('name')
    .eq('id', team.org_id)
    .single();

  content.innerHTML = `
    <div class="acct-grid">
      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Your Team</div>
        <div class="acct-row"><div class="acct-row-label"><span>Team Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.name)}</span></div>
        <div class="acct-row"><div class="acct-row-label"><span>Organization</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(org?.name || '-')}</span></div>
        <div class="acct-row" style="border-bottom:none"><div class="acct-row-label"><span>Your Role</span></div>
          <span class="teams-badge teams-badge-owner">Team Owner</span></div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title">
          <svg class="ti ti-users-group"><use href="img/tabler-sprite.svg#tabler-users-group"/></svg> Members (${memberRows.length})
          <button class="btn btn-subtle btn-sm" style="margin-left:auto" data-jaction="t-open-invite-modal" data-id="${esc(team.id)}">
            <svg class="ti ti-user-plus"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Invite Members
          </button>
          <button class="btn btn-subtle btn-sm" data-jaction="t-change-pw" data-id="${esc(team.id)}" data-name="${esc(team.name)}">
            <svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> Change Password
          </button>
        </div>
        ${memberRows.length === 0
          ? '<p style="color:var(--text-muted);font-size:.88rem;padding:12px 0">No members yet.</p>'
          : memberRows.map(m => `
            <div class="acct-row">
              <div class="acct-row-label">
                <span>${esc(m.profiles?.email || m.user_id)}</span>
                <span class="acct-row-hint">Joined ${new Date(m.joined_at).toLocaleDateString()}</span>
              </div>
              <span class="teams-badge">${esc(m.profiles?.role || 'member')}</span>
            </div>`).join('')}
      </div>

      ${invites.length > 0 ? `
      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Pending Invites (${invites.length})</div>
        ${invites.map(inv => `
          <div class="acct-row">
            <div class="acct-row-label">
              <span>${esc(inv.email)}</span>
              <span class="acct-row-hint">Invited ${new Date(inv.invited_at).toLocaleDateString()}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="teams-badge teams-badge-pending">Pending</span>
              <button class="btn btn-subtle" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Resend invitation" data-jaction="t-resend-invite" data-id="${esc(inv.id)}" data-email="${esc(inv.email)}" data-team="${esc(inv.team_id)}"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Invite Again</button>
              <button class="btn btn-delete" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Cancel invitation" data-jaction="t-cancel-invite" data-id="${esc(inv.id)}" data-email="${esc(inv.email)}" data-teamname="${esc(team.name)}"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
            </div>
          </div>`).join('')}
      </div>` : ''}
    </div>`;

  addTeamsStyles();
}

// ── Team-Member View ──────────────────────────────────────────────
async function renderTeamMemberView(content, supaUser, profile) {
  // Check for pending invites for this user's email (flat query to avoid stack depth)
  const { data: rawInvites = [] } = await supabaseClient
    .from('team_invites')
    .select('*')
    .eq('email', supaUser.email)
    .eq('status', 'pending');

  // Fetch team details for each invite separately
  const pendingInvites = [];
  for (const inv of rawInvites) {
    const { data: t } = await supabaseClient.from('teams').select('id, name, owner_id').eq('id', inv.team_id).single();
    let ownerEmail = null;
    if (t?.owner_id) {
      const { data: op } = await supabaseClient.from('profiles').select('email, first_name, last_name').eq('id', t.owner_id).single();
      ownerEmail = (op?.first_name && op?.last_name) ? `${op.first_name} ${op.last_name}` : (op?.email || null);
    }
    pendingInvites.push({ ...inv, teams: t || null, ownerLabel: ownerEmail });
  }

  // Find membership (flat query to avoid stack depth)
  const { data: rawMemberRows = [] } = await supabaseClient
    .from('team_members')
    .select('*')
    .eq('user_id', supaUser.id);

  // Fetch team details for each membership separately
  const memberRows = [];
  for (const m of rawMemberRows) {
    const { data: t } = await supabaseClient.from('teams').select('name, org_id, owner_id').eq('id', m.team_id).single();
    let orgName = null;
    if (t?.org_id) {
      const { data: org } = await supabaseClient.from('organizations').select('name').eq('id', t.org_id).single();
      orgName = org?.name || null;
    }
    memberRows.push({ ...m, teams: t ? { ...t, organizations: { name: orgName } } : null });
  }

  // If no memberships and no pending invites, show empty state
  if (memberRows.length === 0 && pendingInvites.length === 0) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg></div>
      <h3>No team yet</h3>
      <p>Ask your team owner to invite you, or use <strong>Join a Team</strong> on the sign-in screen.</p>
    </div>`;
    return;
  }

  // Build HTML: pending invites first, then existing teams
  let html = `<div class="acct-grid">`;

  // Pending Invitations section
  if (pendingInvites.length > 0) {
    html += `
      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Pending Invitations</div>
        ${pendingInvites.map(inv => `
          <div class="acct-row">
            <div class="acct-row-label">
              <span>${esc(inv.teams?.name || 'Team')}</span>
              <span class="acct-row-hint">Invited by ${esc(inv.ownerLabel || 'team owner')}</span>
            </div>
            <button class="btn btn-primary" style="font-size:0.82rem;padding:6px 14px" data-jaction="t-join-team-modal" data-team-id="${esc(inv.teams?.id)}" data-team-name="${esc(inv.teams?.name || '')}" data-invite-id="${esc(inv.id)}">
              <svg class="ti ti-user-plus" style="color:white"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Join Team
            </button>
          </div>`).join('')}
      </div>`;
  }

  // If user has team memberships, show team and members info
  if (memberRows.length > 0) {
    const membership = memberRows[0];
    const team = membership.teams;

    // Fetch team owner profile
    const { data: ownerProfile } = await supabaseClient
      .from('profiles')
      .select('email')
      .eq('id', team.owner_id)
      .single();

    // Fetch all members
    const { data: allMembers = [] } = await supabaseClient
      .from('team_members')
      .select('*, profiles(email)')
      .eq('team_id', membership.team_id);

    html += `
      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-building"><use href="img/tabler-sprite.svg#tabler-building"/></svg> Organization</div>
        <div class="acct-row"><div class="acct-row-label"><span>Org Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.organizations?.name || '-')}</span></div>
        <div class="acct-row" style="border-bottom:none"><div class="acct-row-label"><span>Team Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.name)}</span></div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-users-group"><use href="img/tabler-sprite.svg#tabler-users-group"/></svg> Team Members</div>
        <div class="acct-row"><div class="acct-row-label"><span>Team Owner</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(ownerProfile?.email || '-')}</span></div>
        ${allMembers.map(m => `
          <div class="acct-row">
            <div class="acct-row-label"><span>${esc(m.profiles?.email || m.user_id)}</span></div>
            <span class="teams-badge">Member</span>
          </div>`).join('')}
      </div>`;
  }

  html += `</div>`;
  content.innerHTML = html;

  addTeamsStyles();
}

// ── Create Team Modal ─────────────────────────────────────────────
function openCreateTeamModal(orgId) {
  const body = `
    <div class="form-group">
      <label class="form-label">Team Name *</label>
      <input class="form-input" id="ctTeamName" placeholder="e.g. Sales Team"/>
      <span class="form-error" id="ctTeamNameErr">Team name is required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Team Owner Email *</label>
      <input class="form-input" type="email" id="ctOwnerEmail" placeholder="owner@company.com"/>
      <span class="form-error" id="ctOwnerEmailErr">Valid email required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Team Password *</label>
      <input class="form-input" type="password" id="ctTeamPassword" placeholder="Members use this to join"/>
      <span class="form-error" id="ctTeamPasswordErr">Team password is required.</span>
    </div>`;

  Modal.open('<svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Create Team', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" data-jaction="t-save-new-team" data-org-id="${esc(orgId)}"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Create Team</button>`, 'sm');
}

async function saveNewTeam(orgId) {
  const name     = document.getElementById('ctTeamName').value.trim();
  const email    = document.getElementById('ctOwnerEmail').value.trim();
  const password = document.getElementById('ctTeamPassword').value;

  ['ctTeamNameErr','ctOwnerEmailErr','ctTeamPasswordErr'].forEach(id =>
    document.getElementById(id).classList.remove('show'));

  let ok = true;
  if (!name)    { document.getElementById('ctTeamNameErr').classList.add('show'); ok = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById('ctOwnerEmailErr').classList.add('show'); ok = false; }
  if (!password) { document.getElementById('ctTeamPasswordErr').classList.add('show'); ok = false; }
  if (!ok) return;

  try {
    // Look up the owner profile by email
    const { data: ownerProfiles } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (!ownerProfiles || ownerProfiles.length === 0) {
      Toast.danger('User with that email not found in JumpKit.');
      return;
    }
    const ownerId = ownerProfiles[0].id;

    // Create team - hash password with PBKDF2 before storing
    const hashedAdminPassword = await hashPassword(password);
    const { data: team, error } = await supabaseClient
      .from('teams')
      .insert({ org_id: orgId, name, team_password_hash: hashedAdminPassword, owner_id: ownerId })
      .select()
      .single();
    if (error) throw error;

    // Auto-add the team owner as a member
    await supabaseClient.from('team_members').insert({
      id: crypto.randomUUID(),
      team_id: team.id,
      user_id: ownerId,
      joined_at: new Date().toISOString(),
    });

    // Promote the owner's role
    await supabaseClient
      .from('profiles')
      .update({ role: 'team-owner', org_id: orgId })
      .eq('id', ownerId);

    // Add as team member
    await supabaseClient
      .from('team_members')
      .upsert({ team_id: team.id, user_id: ownerId }, { onConflict: 'team_id,user_id' });

    Modal.close();
    Toast.success(`Team "${name}" created!`);
    renderTeams();
  } catch (err) {
    Toast.danger('Failed to create team: ' + err.message);
  }
}

// ── Invite Members Modal ──────────────────────────────────────────
async function openInviteModal(teamId) {
  const body = `
    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:16px">
      Enter email addresses to invite (one per line). An invitation will be sent to each unique and valid address.
    </p>
    <div class="form-group">
      <label class="form-label">Email Addresses *</label>
      <textarea class="form-textarea" id="inviteEmails" maxlength="2000" placeholder="alice@example.com&#10;bob@example.com" style="min-height:120px"></textarea>
      <span class="form-error" id="inviteEmailsErr"></span>
    </div>
    <div class="form-group" style="margin-top:12px">
      <p style="color:var(--text-muted);font-size:.82rem;margin:0 0 10px">Enter the current team password. Each user will receive this in their invitation email and will need it to join your team. If you don't have your team password, first reset it using the reset password button and then invite your team members.</p>
      <label class="form-label">Team Password *</label>
      <div style="position:relative">
        <input class="form-input" type="password" id="inviteTeamPassword" placeholder="Enter team password" autocomplete="off" />
        <button type="button" class="pw-eye" tabindex="-1" data-jaction="t-pw-toggle" data-target="inviteTeamPassword" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:0;color:var(--text-muted)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <span class="form-error" id="inviteTeamPasswordErr">Incorrect team password.</span>
    </div>`;

  Modal.open('<svg class="ti ti-user-plus"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Invite Members', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" id="sendInvitesBtn" data-jaction="t-send-invites" data-id="${esc(teamId)}"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Send Invites</button>`, 'sm');
}

async function sendInvites(teamId) {
  const raw = document.getElementById('inviteEmails').value.trim();
  const allEmails = raw.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
  const candidatePassword = document.getElementById('inviteTeamPassword')?.value.trim() || '';

  const errEl = document.getElementById('inviteEmailsErr');
  const pwErrEl = document.getElementById('inviteTeamPasswordErr');
  errEl?.classList.remove('show');
  pwErrEl?.classList.remove('show');

  // Require team password entry
  if (!candidatePassword) {
    if (pwErrEl) { pwErrEl.textContent = 'Please enter the team password.'; pwErrEl.classList.add('show'); }
    return;
  }

  // Validation
  if (allEmails.length === 0) {
    if (errEl) errEl.textContent = 'Please enter at least one email address.';
    errEl?.classList.add('show'); return;
  }
  const invalidEmails = allEmails.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (invalidEmails.length > 0) {
    if (errEl) errEl.textContent = `Invalid address${invalidEmails.length > 1 ? 'es' : ''}: ${invalidEmails.join(', ')}`;
    errEl?.classList.add('show'); return;
  }
  const lowerEmails = allEmails.map(e => e.toLowerCase().trim());
  const uniqueEmails = [...new Set(lowerEmails)];
  if (uniqueEmails.length < lowerEmails.length) {
    const dups = lowerEmails.filter((e, i) => lowerEmails.indexOf(e) !== i);
    if (errEl) { errEl.textContent = `Duplicate address${dups.length > 1 ? 'es' : ''} found: ${[...new Set(dups)].join(', ')}`; errEl.classList.add('show'); }
    return;
  }
  if (uniqueEmails.length > 25) {
    if (errEl) errEl.textContent = `Maximum 25 email addresses per invite. You entered ${uniqueEmails.length}.`;
    errEl?.classList.add('show'); return;
  }
  const emails = uniqueEmails;

  // Check self-invite, existing members, and pending invites
  try {
    const { data: { session: chkSession } } = await supabaseClient.auth.getSession();
    const currentUserEmail = chkSession?.user?.email?.toLowerCase();

    // #3 - self-invite
    if (currentUserEmail && emails.includes(currentUserEmail)) {
      if (errEl) errEl.textContent = 'You cannot invite yourself.';
      errEl?.classList.add('show'); return;
    }

    // #1 - already a member (look up by email via profiles)
    const { data: memberProfiles = [] } = await supabaseClient
      .from('team_members')
      .select('profiles(email)')
      .eq('team_id', teamId);
    const memberEmails = memberProfiles.map(m => m.profiles?.email?.toLowerCase()).filter(Boolean);
    const alreadyMembers = emails.filter(e => memberEmails.includes(e));
    if (alreadyMembers.length > 0) {
      if (errEl) errEl.textContent = `Already a member: ${alreadyMembers.join(', ')}`;
      errEl?.classList.add('show'); return;
    }

    // #2 - already has pending invite
    const { data: pendingInvites = [] } = await supabaseClient
      .from('team_invites')
      .select('email')
      .eq('team_id', teamId)
      .eq('status', 'pending');
    const pendingEmails = pendingInvites.map(i => i.email?.toLowerCase()).filter(Boolean);
    const alreadyInvited = emails.filter(e => pendingEmails.includes(e));
    if (alreadyInvited.length > 0) {
      if (errEl) errEl.textContent = `Already has a pending invitation: ${alreadyInvited.join(', ')}`;
      errEl?.classList.add('show'); return;
    }

    // Free tier: enforce 5-member-per-team cap (owner + 4 members max)
    const inviterTier = window._supabaseProfile?.subscription_tier || 'free';
    if (inviterTier === 'free') {
      const FREE_MEMBER_CAP = 4; // max non-owner members (5 total including owner)
      const { count: curMembers } = await supabaseClient
        .from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', teamId);
      const { count: curPending } = await supabaseClient
        .from('team_invites').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'pending');
      const occupied = (curMembers || 0) + (curPending || 0);
      const slotsAvailable = FREE_MEMBER_CAP - occupied;
      if (emails.length > slotsAvailable) {
        const msg = slotsAvailable <= 0
          ? 'Free teams are limited to 5 members. This team is full. Upgrade to JumpKit Unlimited for unlimited members.'
          : `Free teams are limited to 5 members. You can only invite ${slotsAvailable} more member${slotsAvailable !== 1 ? 's' : ''}. Upgrade to JumpKit Unlimited for unlimited members.`;
        if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
        return;
      }
    }
  } catch (checkErr) {
    console.warn('[sendInvites] pre-check failed:', checkErr.message);
  }

  // Verify team password server-side before sending any invites
  try {
    const { data: verifyData, error: verifyErr } = await supabaseClient.functions.invoke('verify-team-password', {
      body: { teamId, candidatePassword },
    });
    if (verifyErr || !verifyData?.valid) {
      if (pwErrEl) { pwErrEl.textContent = 'Incorrect team password.'; pwErrEl.classList.add('show'); }
      return;
    }
  } catch (_) {
    if (pwErrEl) { pwErrEl.textContent = 'Could not verify password. Please try again.'; pwErrEl.classList.add('show'); }
    return;
  }

  // Show spinner on button
  const sendBtn = document.getElementById('sendInvitesBtn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<svg class="ti ti-loader" style="animation:spin 1s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader"/></svg> Sending...'; }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const invitedBy = session?.user?.id;

    // Fetch team info for email (flat to avoid stack depth)
    const { data: team } = await supabaseClient
      .from('teams')
      .select('name, org_id')
      .eq('id', teamId)
      .single();
    if (team?.org_id) {
      const { data: org } = await supabaseClient.from('organizations').select('name').eq('id', team.org_id).single();
      team.organizations = org || null;
    }

    let sent = 0, failed = 0;
    for (const email of emails) {
      try {
        // Insert invite record - must always succeed
        const { error: insertErr } = await supabaseClient.from('team_invites').insert({
          team_id: teamId,
          email,
          invited_by: invitedBy,
          status: 'pending',
        });
        if (insertErr && !insertErr.message.includes('duplicate')) throw insertErr;

        // Call Edge Function to send email - non-fatal if not configured
        try {
          await supabaseClient.functions.invoke('send-invite', {
            body: {
              email,
              teamId,
              invitedBy: invitedBy,
              orgName: team?.organizations?.name || '',
              teamName: team?.name || '',
              teamPassword: candidatePassword,
            },
          });
        } catch (_) { /* email sending optional */ }

        sent++;
      } catch (e) {
        console.warn('[sendInvites] failed for', email, e.message);
        failed++;
      }
    }

    Modal.close();
    if (failed === 0) {
      Toast.success(`Invited ${sent} member${sent !== 1 ? 's' : ''}!`);
    } else {
      Toast.success(`Sent ${sent} invite${sent !== 1 ? 's' : ''} (${failed} failed)`);
    }
    renderTeams();
  } catch (err) {
    Toast.danger('Failed to send invites: ' + err.message);
  }
}

// ── Promote User Modal ────────────────────────────────────────────
function openPromoteUserModal(teamId) {
  const body = `
    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:16px">
      Enter the email of a team member to promote to team-owner.
    </p>
    <div class="form-group">
      <label class="form-label">User Email *</label>
      <input class="form-input" type="email" id="promoteEmail" placeholder="user@example.com"/>
      <span class="form-error" id="promoteEmailErr">Valid email required.</span>
    </div>`;

  Modal.open('<svg class="ti ti-user-up"><use href="img/tabler-sprite.svg#tabler-user-up"/></svg> Promote to Team Owner', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" data-jaction="t-do-promote" data-id="${esc(teamId)}"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Promote</button>`, 'sm');
}

async function doPromote(teamId) {
  const email = document.getElementById('promoteEmail').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById('promoteEmailErr').classList.add('show');
    return;
  }

  try {
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(1);
    if (!profiles || profiles.length === 0) throw new Error('User not found.');

    const userId = profiles[0].id;
    { const { error: _e3 } = await supabaseClient.from('profiles').update({ role: 'team-owner' }).eq('id', userId); if (_e3) throw new Error('Transfer failed (profiles): ' + _e3.message); }
    { const { error: _e4 } = await supabaseClient.from('teams').update({ owner_id: userId }).eq('id', teamId); if (_e4) throw new Error('Transfer failed (teams): ' + _e4.message); }

    Modal.close();
    Toast.success(`Promoted ${email} to team owner.`);
    renderTeams();
  } catch (err) {
    Toast.danger('Failed to promote: ' + err.message);
  }
}

// ── Teams CSS ─────────────────────────────────────────────────────

window.removeTeam = function(teamId, teamName) {
  Modal.open('<svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Remove Team',
    `<p style="color:var(--text-muted);font-size:.95rem">Remove team <strong style="color:var(--text-card-title)">${teamName}</strong> and all its members? This cannot be undone.</p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" data-jaction="t-do-remove-team" data-id="${esc(teamId)}" data-name="${esc(teamName)}"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Remove Team</button>`, 'sm');
};
window.doRemoveTeam = async function(teamId, teamName) {
  Modal.close();
  try {
    // ── 1. Gather data BEFORE deleting (for email notification) ──
    const ownerProfile = window._supabaseProfile || {};
    const ownerName = [ownerProfile.first_name, ownerProfile.last_name].filter(Boolean).join(' ')
      || window._supabaseUser?.email || 'Team Owner';

    // Fire email notification (fire-and-forget - don't block delete on email)
    supabaseClient.functions.invoke('send-team-deleted', {
      body: { teamId, teamName, ownerName },
    }).catch(e => console.warn('[doRemoveTeam] email notification failed:', e.message));

    // ── 2. Delete from Supabase (CASCADE handles shared_columns + shared_jumps) ──
    const r1 = await supabaseClient.from('team_members').delete().eq('team_id', teamId);
    if (r1.error) throw new Error('Delete members failed: ' + r1.error.message);
    const r1b = await supabaseClient.from('team_invites').delete().eq('team_id', teamId);
    if (r1b.error) console.warn('[doRemoveTeam] invite delete warning:', r1b.error.message);
    const r2 = await supabaseClient.from('teams').delete().eq('id', teamId);
    if (r2.error) throw new Error('Delete team failed: ' + r2.error.message);

    // ── 3. Clean owner's local SQLite immediately ──
    // Strip isShared/teamId from owner's shared columns + jumps for this team.
    // Convert to personal rather than delete - owner keeps their data.
    if (currentUser) {
      const localCols = DB.getColumns(currentUser.id);
      // Find columns that were shared with this team (both old and new format)
      const affectedColIds = new Set(
        localCols.filter(c => {
          if (!c.isShared) return false;
          if (c.teamId === teamId) return true; // old format
          return Array.isArray(c.sharedTeams) && c.sharedTeams.some(st => st.teamId === teamId); // new format
        }).map(c => c.id)
      );
      if (affectedColIds.size > 0) {
        const updatedCols = localCols.map(c => {
          if (!affectedColIds.has(c.id)) return c;
          // Remove this team from sharedTeams
          const sharedTeams = Array.isArray(c.sharedTeams)
            ? c.sharedTeams.filter(st => st.teamId !== teamId)
            : [];
          const isStillShared = sharedTeams.length > 0 || (c.teamId && c.teamId !== teamId && c.isShared);
          return { ...c, sharedTeams, isShared: isStillShared ? 1 : 0, teamId: isStillShared ? c.teamId : null, supabaseId: isStillShared ? c.supabaseId : null };
        });
        DB.saveColumns(currentUser.id, updatedCols);
        // Convert jumps to personal only if the column is no longer shared with anyone
        updatedCols.filter(c => affectedColIds.has(c.id) && !c.isShared).forEach(c => {
          DB.getJumps(currentUser.id)
            .filter(j => j.isShared && j.columnId === c.id)
            .forEach(j => DB.updateJump(currentUser.id, j.id, { isShared: false, teamId: null }));
        });
      }
    }

    // ── 4. Purge deleted team from jk_teams_expanded localStorage ──
    try {
      const expanded = JSON.parse(localStorage.getItem('jk_teams_expanded') || '{}');
      if (teamId in expanded) {
        delete expanded[teamId];
        localStorage.setItem('jk_teams_expanded', JSON.stringify(expanded));
      }
    } catch(_) {}

    Toast.success(`Team "${teamName}" removed`);
    selectedTeamId = null;

    // Re-render teams page + columns if visible
    setTimeout(() => {
      renderTeams();
      if (typeof renderColumns === 'function' && document.getElementById('columnsArea')) {
        renderColumns();
      }
    }, 300);
  } catch(e) { Toast.danger('Error: ' + e.message); console.error('[doRemoveTeam]', e); }
};

window.confirmRemoveMember = function(memberId, memberName) {
  Modal.open('<svg class="ti ti-user-minus"><use href="img/tabler-sprite.svg#tabler-user-minus"/></svg> Remove Member',
    `<p style="color:var(--text-muted);font-size:.95rem">Remove <strong style="color:var(--text-card-title)">${memberName}</strong> from this team? They will lose access to shared jumps.</p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" data-jaction="t-do-remove-member" data-id="${esc(memberId)}" data-name="${esc(memberName)}"><svg class="ti ti-user-minus"><use href="img/tabler-sprite.svg#tabler-user-minus"/></svg> Remove</button>`, 'sm');
};
window.removeMember = window.confirmRemoveMember;
window.doRemoveMember = async function(memberId, memberName) {
  Modal.close();
  try {
    { const { error: _e5 } = await supabaseClient.from('team_members').delete().eq('id', memberId); if (_e5) throw new Error('Remove member failed: ' + _e5.message); }
    Toast.success(`${memberName} removed from team`);
    window.addNotification?.({ type: 'member-removed', message: `Removed member: ${memberName}`, ts: Date.now() });
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
    renderTeams();
  } catch(e) { Toast.danger('Error: ' + e.message); }
};

// ── Leave Team (member self-remove) ──────────────────────────────────
window.confirmLeaveTeam = function(teamId, teamName) {
  Modal.open(
    '<svg class="ti ti-door-exit"><use href="img/tabler-sprite.svg#tabler-door-exit"/></svg> Leave Team',
    `<p style="color:var(--text-muted);font-size:.95rem">Leave <strong style="color:var(--text-card-title)">${esc(teamName)}</strong>? You will lose access to all shared jumps from this team.</p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" data-jaction="t-do-leave-team" data-id="${esc(teamId)}" data-name="${esc(teamName)}"><svg class="ti ti-door-exit"><use href="img/tabler-sprite.svg#tabler-door-exit"/></svg> Leave Team</button>`, 'sm');
};
window.doLeaveTeam = async function(teamId, teamName) {
  Modal.close();
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not logged in.');
    const { error } = await supabaseClient.from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', session.user.id);
    if (error) throw new Error('Leave team failed: ' + error.message);
    Toast.success(`Left team: ${teamName}`);
    window.addNotification?.({ type: 'team-left', message: `You left team: ${teamName}`, ts: Date.now() });
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
    renderTeams();
  } catch(e) { Toast.danger('Error: ' + e.message); }
};

// ── Change Team Password ──────────────────────────────────────────
window.openChangeTeamPasswordModal = function(teamId, teamName) {
  const body = `
    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:16px">
      Set a new password for <strong style="color:var(--text-card-title)">${esc(teamName)}</strong>.
      Members will need this password to join the team.
    </p>
    <div class="form-group">
      <label class="form-label">New Password *</label>
      <div class="pw-wrap">
        <input class="form-input" type="password" id="ctpNewPassword" placeholder="Enter new password" autocomplete="new-password" style="padding-right:38px"/>
        <button type="button" class="pw-eye" tabindex="-1" id="ctpNewPasswordEye"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <ul style="list-style:none;padding:6px 0 0 4px;margin:0" id="ctpPwRules">
        <li id="ctpRule-len"     style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="ctp-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>At least 8 characters</li>
        <li id="ctpRule-upper"   style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="ctp-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One uppercase letter</li>
        <li id="ctpRule-lower"   style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="ctp-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One lowercase letter</li>
        <li id="ctpRule-num"     style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="ctp-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One number</li>
        <li id="ctpRule-special" style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="ctp-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>One special character (!@#$%^&amp;*)</li>
        <li id="ctpRule-match"   style="font-size:0.78rem;color:#4A6280;margin-bottom:3px;display:flex;align-items:center;gap:5px"><span class="ctp-rule-icon" style="color:#f87171;font-weight:700;font-size:0.7rem">✕</span>Passwords match</li>
      </ul>
      <span class="form-error" id="ctpNewPasswordErr">Password does not meet requirements.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Confirm Password *</label>
      <div class="pw-wrap">
        <input class="form-input" type="password" id="ctpConfirmPassword" placeholder="Confirm new password" autocomplete="new-password" style="padding-right:38px"/>
        <button type="button" class="pw-eye" tabindex="-1" id="ctpConfirmPasswordEye"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <span class="form-error" id="ctpConfirmPasswordErr">Passwords do not match.</span>
    </div>`;

  Modal.open('<svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> Change Team Password', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" data-jaction="t-do-change-pw" data-id="${esc(teamId)}" data-name="${esc(teamName)}"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save Password</button>`, 'sm');

  setTimeout(() => {
    const eyeOpen   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    [['ctpNewPasswordEye','ctpNewPassword'],['ctpConfirmPasswordEye','ctpConfirmPassword']].forEach(([eyeId, inputId]) => {
      const eye = document.getElementById(eyeId);
      const inp = document.getElementById(inputId);
      if (!eye || !inp) return;
      eye.addEventListener('click', () => {
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        eye.innerHTML = show ? eyeClosed : eyeOpen;
      });
    });

    // Live password rule checklist
    const ctpRules = {
      'ctpRule-len':     p => p.length >= 8,
      'ctpRule-upper':   p => /[A-Z]/.test(p),
      'ctpRule-lower':   p => /[a-z]/.test(p),
      'ctpRule-num':     p => /[0-9]/.test(p),
      'ctpRule-special': p => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p),
    };
    const ctpInput  = document.getElementById('ctpNewPassword');
    const ctpCfmInput = document.getElementById('ctpConfirmPassword');

    function updateCtpRules() {
      const p = ctpInput?.value || '';
      const c = ctpCfmInput?.value || '';
      for (const [id, fn] of Object.entries(ctpRules)) {
        const li = document.getElementById(id);
        if (!li) continue;
        const icon = li.querySelector('.ctp-rule-icon');
        const ok = fn(p);
        li.style.color = ok ? '#50CACC' : '#4A6280';
        if (icon) { icon.textContent = ok ? '✓' : '✕'; icon.style.color = ok ? '#50CACC' : '#f87171'; }
      }
      const matchLi = document.getElementById('ctpRule-match');
      if (matchLi) {
        const icon = matchLi.querySelector('.ctp-rule-icon');
        const ok = p.length > 0 && p === c;
        matchLi.style.color = ok ? '#50CACC' : '#4A6280';
        if (icon) { icon.textContent = ok ? '✓' : '✕'; icon.style.color = ok ? '#50CACC' : '#f87171'; }
      }
    }
    if (ctpInput)    ctpInput.addEventListener('input', updateCtpRules);
    if (ctpCfmInput) ctpCfmInput.addEventListener('input', updateCtpRules);
  }, 100);
};

window.doChangeTeamPassword = async function(teamId, teamName) {
  const newPw      = document.getElementById('ctpNewPassword')?.value;
  const confirmPw  = document.getElementById('ctpConfirmPassword')?.value;

  ['ctpNewPasswordErr', 'ctpConfirmPasswordErr'].forEach(id => document.getElementById(id)?.classList.remove('show'));

  const ctpPwValid = newPw && newPw.length >= 8 && /[A-Z]/.test(newPw) && /[a-z]/.test(newPw) && /[0-9]/.test(newPw) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPw);
  let ok = true;
  if (!newPw || !ctpPwValid) {
    const errEl = document.getElementById('ctpNewPasswordErr');
    if (errEl) { errEl.textContent = 'Password does not meet requirements (8+ chars, uppercase, lowercase, number, special char).'; errEl.classList.add('show'); }
    ok = false;
  }
  if (newPw !== confirmPw) { document.getElementById('ctpConfirmPasswordErr')?.classList.add('show'); ok = false; }
  if (!ok) return;

  // Spinner on save button - show for at least 1.5s
  const ctpSaveBtn = document.querySelector('[data-jaction="t-do-change-pw"]');
  if (ctpSaveBtn) { ctpSaveBtn.disabled = true; ctpSaveBtn.innerHTML = '<svg class="ti ti-loader" style="animation:spin 0.8s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader"/></svg> Saving...'; }
  const _ctpSpinStart = Date.now();

  try {
    const hashedPw = await hashPassword(newPw);
    const { error } = await supabaseClient
      .from('teams')
      .update({ team_password_hash: hashedPw })
      .eq('id', teamId);
    if (error) throw error;
    const _ctpElapsed = Date.now() - _ctpSpinStart;
    const _ctpDelay = Math.max(0, 1500 - _ctpElapsed);
    setTimeout(() => {
      Modal.close();
      Toast.success(`Password updated for "${esc(teamName)}"`);
    }, _ctpDelay);
  } catch(e) {
    if (ctpSaveBtn) { ctpSaveBtn.disabled = false; ctpSaveBtn.innerHTML = '<svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save Password'; }
    Toast.danger('Failed to update password: ' + e.message);
  }
};

// ── Join Team Modal & Flow ─────────────────────────────────────────
window.openJoinTeamModal = async function(teamId, teamName, inviteId) {
  // Free tier: enforce 1-team join limit
  const tier = window._supabaseProfile?.subscription_tier || 'free';
  if (tier === 'free' && window._supabaseUser) {
    const { data: memberships } = await supabaseClient
      .from('team_members')
      .select('id')
      .eq('user_id', window._supabaseUser.id);
    if (memberships && memberships.length >= 1) {
      showUpgradeModal(
        'Team Join Limit Reached',
        'The free tier allows joining <strong>1 team</strong>. Upgrade to JumpKit Unlimited for unlimited teams.'
      );
      return;
    }
  }
  Modal.open(`<svg class="ti ti-user-plus"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Join Team`, `
    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:16px">
      Enter the team password to join <strong>${esc(teamName)}</strong>. You can find this in your invitation email.
    </p>
    <div class="form-group">
      <label class="form-label">Team Password *</label>
      <div class="pw-wrap">
        <input class="form-input" type="password" id="joinTeamPassword" placeholder="Enter team password" style="padding-right:38px"/>
        <button type="button" class="pw-eye" tabindex="-1" id="joinTeamPasswordEye"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <span class="form-error" id="joinTeamPasswordErr">Incorrect password.</span>
    </div>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-primary" data-jaction="t-do-join-team" data-id="${esc(teamId)}" data-name="${esc(teamName)}" data-invite="${esc(inviteId)}">
       <svg class="ti ti-user-plus" style="color:white"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Join Team
     </button>`, 'sm');
  // Wire eye toggle after modal renders
  setTimeout(() => {
    const eye = document.getElementById('joinTeamPasswordEye');
    const inp = document.getElementById('joinTeamPassword');
    if (!eye || !inp) return;
    const eyeOpen   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    eye.addEventListener('click', () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      eye.innerHTML = show ? eyeClosed : eyeOpen;
    });
  }, 100);
};

window.doJoinTeam = async function(teamId, teamName, inviteId) {
  const pw = document.getElementById('joinTeamPassword')?.value;
  const errEl = document.getElementById('joinTeamPasswordErr');
  if (errEl) errEl.classList.remove('show');

  if (!pw) { if (errEl) errEl.classList.add('show'); return; }

  try {
    // Verify password server-side - hash never leaves the server
    const { data: verifyData, error: verifyErr } = await supabaseClient.functions.invoke('verify-team-password', {
      body: { teamId, candidatePassword: pw },
    });
    if (verifyErr || !verifyData?.valid) {
      if (errEl) errEl.classList.add('show');
      return;
    }

    // Verify this user's email has a pending invite for this team
    const userEmail = window._supabaseUser?.email;
    const { data: invite, error: inviteErr } = await supabaseClient
      .from('team_invites')
      .select('id')
      .eq('team_id', teamId)
      .eq('email', userEmail)
      .eq('status', 'pending')
      .maybeSingle();
    if (inviteErr) throw inviteErr;
    if (!invite) {
      if (errEl) {
        errEl.textContent = 'Your email has not been invited to this team.';
        errEl.classList.add('show');
      } else {
        Toast.danger('Your email has not been invited to this team.');
      }
      return;
    }

    // Enforce 5-member cap on free-tier teams at join time
    try {
      const { data: teamRow } = await supabaseClient.from('teams').select('owner_id').eq('id', teamId).single();
      if (teamRow?.owner_id) {
        const { data: ownerProfile } = await supabaseClient.from('profiles').select('subscription_tier').eq('id', teamRow.owner_id).single();
        if ((ownerProfile?.subscription_tier || 'free') === 'free') {
          const { count: curMembers } = await supabaseClient
            .from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', teamId);
          if ((curMembers || 0) >= 4) {
            if (errEl) { errEl.textContent = 'This team has reached its 5-member limit.'; errEl.classList.add('show'); }
            else { Toast.danger('This team has reached its 5-member limit.'); }
            return;
          }
        }
      }
    } catch (_capErr) { /* non-fatal - allow join if cap check fails */ }

    // Add user to team_members
    const { error: joinErr } = await supabaseClient
      .from('team_members')
      .insert({
        id: crypto.randomUUID(),
        team_id: teamId,
        user_id: window._supabaseUser.id,
        joined_at: new Date().toISOString(),
      });
    if (joinErr && !joinErr.message.includes('duplicate')) throw joinErr;

    // Mark invite as accepted
    await supabaseClient
      .from('team_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    // Update profile role to team-member if needed
    if (window._supabaseProfile?.role === 'team-member') {
      { const { error: _e6 } = await supabaseClient.from('profiles').update({ role: 'team-member' }).eq('id', window._supabaseUser.id); if (_e6) console.warn('[Teams] leave team profile update failed:', _e6.message); }
    }

    Modal.close();

    // Notify user they joined a team
    window.addNotification?.({ type: 'team-joined', message: `You joined team: ${teamName}`, ts: Date.now() });
    if (typeof updateNotifBadge === 'function') updateNotifBadge();

    // Immediately sync shared columns + jumps for the newly joined team
    if (typeof syncSharedJumps === 'function') {
      syncSharedJumps().catch(e => console.warn('[joinTeam] sync error:', e));
    }

    // Show success message
    setTimeout(() => {
      Modal.open('<svg class="ti ti-circle-check" style="color:#22c55e;width:1.5em;height:1.5em;vertical-align:middle"><use href="img/tabler-sprite.svg#tabler-circle-check"/></svg> Team Joined!',
        `<div style="text-align:center;padding:8px 0">
          <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:10px">Welcome to ${esc(teamName)}!</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.6">
            You've successfully joined <strong>${esc(teamName)}</strong>.<br>
            Visit your <strong>Jumps</strong> page - your team's shared jumps will appear there automatically.
          </p>
        </div>`,
        `<button class="btn btn-subtle" data-jaction="modal-close">Stay here</button>
         <button class="btn btn-primary" data-jaction="nav-teams-close" data-nav="jumps"><svg viewBox="0 0 105.74 122.88" style="width:1.4rem;height:1.4rem;fill:white;flex-shrink:0;vertical-align:middle"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83 c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg> Go to Jumps</button>`
      );
    }, 200);

    // Reload teams page
    renderTeams();

  } catch(e) {
    Toast.danger('Error joining team: ' + e.message);
  }
};

// ── Org stats update helper ───────────────────────────────────────
function updateOrgStats(teamDelta, memberDelta) {
  const tc = document.getElementById('orgTeamsCount');
  const tl = document.getElementById('orgTeamsLabel');
  const mc = document.getElementById('orgMembersCount');
  const ml = document.getElementById('orgMembersLabel');
  if (tc && teamDelta !== 0) {
    const n = Math.max(0, parseInt(tc.textContent || '0') + teamDelta);
    tc.textContent = n;
    if (tl) tl.textContent = n === 1 ? 'Team' : 'Teams';
  }
  if (mc && memberDelta !== 0) {
    const n = Math.max(0, parseInt(mc.textContent || '0') + memberDelta);
    mc.textContent = n;
    if (ml) ml.textContent = n === 1 ? 'Member' : 'Members';
  }
}

function addTeamsStyles() {
  const existing = document.getElementById('teamsStyles');
  if (existing) existing.remove(); // always recreate so latest CSS applies
  const style = document.createElement('style');
  style.id = 'teamsStyles';
  style.textContent = `
    .teams-badge {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 1px 7px; border-radius: 10px;
      font-size: 0.69rem; font-weight: 600; min-width: 70px;
      background: rgba(34,197,94,0.13); color: #178a3a;
      border: 1px solid rgba(34,197,94,0.35);
      white-space: nowrap;
    }
    .teams-badge-owner {
      background: rgba(0,194,199,0.15); color: #00a8ad;
      border-color: rgba(0,194,199,0.32);
    }
    .teams-badge-pending {
      background: rgba(250,173,20,0.15); color: #a07010;
      border-color: rgba(250,173,20,0.32);
    }
    /* Pills only as wide as their text, not full label width */
    .acct-row-label .teams-badge { align-self: flex-start; }
    #teamsPanel .acct-row,
    #membersPanel .acct-row {
      min-height: 52px;
      box-sizing: border-box;
    }
    #teamsPanel .acct-row,
    #membersPanel .acct-row {
      border-bottom: none;
      border-top: 1px solid var(--border);
    }
    #teamsPanel .acct-row:first-child,
    #membersPanel .acct-row:first-child {
      border-top: none;
    }
    .teams-selectable-row {
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .teams-selectable-row:hover {
      background: var(--bg-hover);
    }
    .teams-row-selected {
      background: var(--bg-hover) !important;
    }
    .teams-row-selected .acct-row-label > span:first-child {
      color: var(--hover-accent);
      font-weight: 600;
    }
    .acct-team-cols-section {
      padding: 10px 20px 12px calc(1rem + 10px);
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .acct-team-cols-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .acct-team-cols-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .acct-team-col-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px 2px 10px;
      border-radius: 20px;
      font-size: 0.78rem;
      color: var(--text-muted);
      border: 1px solid var(--border-input);
      white-space: nowrap;
    }
    [data-theme="dark"] .acct-team-col-chip  { background: #1E2D3D; }
    [data-theme="light"] .acct-team-col-chip { background: #DDE3EA; }
    .acct-col-chip-remove {
      background: none; border: none; cursor: pointer;
      color: var(--text-dim); font-size: 0.85rem; line-height: 1;
      padding: 0 2px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      transition: color 0.15s;
    }
    .acct-col-chip-remove:hover { color: var(--danger); }
  `;
  document.head.appendChild(style);
}

// ── Share Column from Teams Page ──────────────────────────────────

// Tracks original sharing state for the modal so we can diff on save
let _shareColModalOriginal = {}; // { colId: wasSharedWithThisTeam }

window.openShareColumnModal = async function(teamId, teamName) {
  const localUser = DB.getCurrentUser();
  if (!localUser) return;
  const allCols = DB.getColumns(localUser.id).filter(c => c.name);

  if (allCols.length === 0) {
    Modal.open(
      '<svg class="ti ti-layout-columns"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg> Manage Shared Columns',
      `<p style="color:var(--text-muted);font-size:.9rem">No columns yet. Add columns first via <strong>Configure Columns</strong> on the Jumps page.</p>`,
      `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>`,
      'sm'
    );
    return;
  }

  _shareColModalOriginal = {};

  const rows = allCols.map(col => {
    // Check both new (sharedTeams) and old (teamId) format
    const sharedTeams = Array.isArray(col.sharedTeams) ? col.sharedTeams : [];
    const sharedWithThis = sharedTeams.some(st => st.teamId === teamId) ||
                           !!(col.isShared && col.teamId === teamId && sharedTeams.length === 0);
    _shareColModalOriginal[col.id] = sharedWithThis;

    const toggleId = `shareToggle_${col.id}`;

    return `
    <div class="acct-row" style="min-height:44px;padding:10px 16px">
      <div class="acct-row-label">
        <span style="font-size:.88rem;font-weight:500;color:var(--text-muted)">${esc(col.name)}</span>
      </div>
      <div class="toggle-wrap" style="justify-content:flex-end">
        <label class="toggle">
          <input type="checkbox" id="${toggleId}" data-colid="${col.id}" ${sharedWithThis ? 'checked' : ''}/>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>`;
  }).join('');

  Modal.open(
    '<svg class="ti ti-layout-columns"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg> Manage Shared Columns - ' + esc(teamName),
    `<p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px">Toggle which columns are shared with this team.</p>
     <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">${rows}</div>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" data-jaction="t-save-share-col" data-id="${esc(teamId)}"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save</button>`,
    'sm'
  );
};

window.saveShareColumnModal = async function(teamId) {
  const localUser = DB.getCurrentUser();
  if (!localUser) return;

  const toggles = document.querySelectorAll('[id^="shareToggle_"]');
  const toShare   = [];
  const toUnshare = [];

  toggles.forEach(input => {
    if (input.disabled) return;
    const colId = input.dataset.colid;
    const nowOn = input.checked;
    const wasOn = !!_shareColModalOriginal[colId];
    if (nowOn && !wasOn)   toShare.push(colId);
    if (!nowOn && wasOn)   toUnshare.push(colId);
  });

  if (toShare.length === 0 && toUnshare.length === 0) { Modal.close(); return; }

  // If unsharing, warn if team has members
  if (toUnshare.length > 0) {
    let memberCount = 0;
    try {
      const { count } = await supabaseClient
        .from('team_members').select('id', { count: 'exact', head: true })
        .eq('team_id', teamId).neq('user_id', localUser.id);
      memberCount = count || 0;
    } catch (_) {}

    if (memberCount > 0) {
      const cols = DB.getColumns(localUser.id);
      const names = toUnshare.map(id => cols.find(c => c.id === id)?.name || id);
      const colList = names.map(n => `<strong>${esc(n)}</strong>`).join(', ');
      const memberWord = memberCount === 1 ? 'member' : 'members';
      // Store pending for after confirm
      window._pendingShareSave = { teamId, toShare, toUnshare };
      Modal.close();
      Modal.open(
        '<svg class="ti ti-alert-triangle"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg> Unshare Column?',
        `<p style="color:var(--text-muted);font-size:0.92rem;line-height:1.6;margin:0">
           Unsharing ${colList} will remove access for
           <strong style="color:var(--text-card-title)">${memberCount} ${memberWord}</strong>.
           They will be notified in the app on their next sync.
         </p>`,
        `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
         <button class="btn btn-delete" data-jaction="t-confirm-share-save">
           <svg class="ti ti-share-off"><use href="img/tabler-sprite.svg#tabler-share-off"/></svg> Yes, Save Changes
         </button>`,
        { closeable: true }
      );
      return;
    }
  }

  await _applyShareColumnSave(teamId, toShare, toUnshare);
};

window._confirmShareSave = async function() {
  Modal.close();
  const { teamId, toShare, toUnshare } = window._pendingShareSave || {};
  window._pendingShareSave = null;
  if (!teamId) return;
  await _applyShareColumnSave(teamId, toShare, toUnshare);
};

async function _applyShareColumnSave(teamId, toShare, toUnshare) {
  Modal.close();
  const localUser = DB.getCurrentUser();
  if (!localUser) return;
  const cols = DB.getColumns(localUser.id);

  for (const colId of toShare) {
    let col = DB.getColumns(localUser.id).find(c => c.id === colId);
    if (!col) continue;
    // Build updated sharedTeams: migrate old format if needed, then add new entry
    let sharedTeams = Array.isArray(col.sharedTeams) ? [...col.sharedTeams] : [];
    if (sharedTeams.length === 0 && col.teamId && col.isShared) {
      // Migrate old single-team format into sharedTeams
      sharedTeams = [{ teamId: col.teamId, supabaseId: col.supabaseId || null }];
    }
    if (!sharedTeams.some(st => st.teamId === teamId)) {
      sharedTeams.push({ teamId, supabaseId: null }); // supabaseId assigned in syncColumnToSupabase
    }
    const updatedCol = { ...col, sharedTeams, isShared: true, teamId: null, supabaseId: null };
    DB.saveColumns(localUser.id, DB.getColumns(localUser.id).map(c => c.id === colId ? updatedCol : c));
    await syncColumnToSupabase(updatedCol, teamId);
  }

  for (const colId of toUnshare) {
    const col = DB.getColumns(localUser.id).find(c => c.id === colId);
    if (!col) continue;
    await unshareColumnFromSupabase(col, teamId);
    // Remove this team from sharedTeams
    let sharedTeams = Array.isArray(col.sharedTeams) ? col.sharedTeams.filter(st => st.teamId !== teamId) : [];
    // Also handle old single-team format
    if (col.teamId === teamId && sharedTeams.length === 0) sharedTeams = [];
    const isStillShared = sharedTeams.length > 0;
    DB.saveColumns(localUser.id, DB.getColumns(localUser.id).map(c =>
      c.id === colId ? { ...c, sharedTeams, isShared: isStillShared ? 1 : 0, teamId: null, supabaseId: null } : c
    ));
  }

  const total = toShare.length + toUnshare.length;
  Toast.success(`Shared columns updated (${total} change${total !== 1 ? 's' : ''})`);
  if (typeof renderColumns === 'function') renderColumns();
  renderTeams();
}

window.confirmUnshareColumnFromTeam = async function(teamId, teamName, colSupabaseId, colName) {
  let memberCount = 0;
  try {
    const localUser = DB.getCurrentUser();
    const { count } = await supabaseClient
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .neq('user_id', localUser?.id || '');
    memberCount = count || 0;
  } catch (_) {}

  if (memberCount === 0) {
    await _doUnshareColumnFromTeam(teamId, colSupabaseId, colName);
    return;
  }

  window._unshareColResolve = null;
  Modal.open(
    '<svg class="ti ti-alert-triangle"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg> Unshare Column?',
    `<p style="color:var(--text-muted);font-size:0.92rem;line-height:1.6;margin:0 0 12px">
       Unsharing <strong>${esc(colName)}</strong> will remove access for
       <strong style="color:var(--text-card-title)">${memberCount} ${memberCount === 1 ? 'member' : 'members'}</strong>.
       They will be notified in the app on their next sync.
     </p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" data-jaction="t-execute-unshare-col" data-team-id="${esc(teamId)}" data-col-id="${esc(colSupabaseId)}" data-col-name="${esc(colName)}">
       <svg class="ti ti-share-off"><use href="img/tabler-sprite.svg#tabler-share-off"/></svg> Yes, Unshare
     </button>`,
    { closeable: true }
  );
};

window._executeUnshareColumnFromTeam = async function(teamId, colSupabaseId, colName) {
  Modal.close();
  await _doUnshareColumnFromTeam(teamId, colSupabaseId, colName);
};

async function _doUnshareColumnFromTeam(teamId, colSupabaseId, colName) {
  const localUser = DB.getCurrentUser();
  if (!localUser) return;
  const cols = DB.getColumns(localUser.id);
  const col = cols.find(c => c.supabaseId === colSupabaseId);

  if (col) {
    // Use existing unshare helper from jumps.js (globally available)
    await unshareColumnFromSupabase(col);
    // Convert to personal locally
    DB.saveColumns(localUser.id, cols.map(c =>
      c.id === col.id ? { ...c, isShared: false, teamId: null, supabaseId: null } : c
    ));
  } else {
    // No local copy (e.g. member's column) - just delete from Supabase
    try {
      await supabaseClient.from('shared_columns').delete().eq('id', colSupabaseId);
    } catch (err) { console.warn('_doUnshareColumnFromTeam:', err.message); }
  }

  Toast.success(`"${colName}" unshared from team`);
  if (typeof renderColumns === 'function') renderColumns();
  renderTeams();
}

// ── Event delegation - teams actions ─────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-jaction]');
  if (!btn) return;
  const action = btn.dataset.jaction;
  const id     = btn.dataset.id || '';
  const name   = btn.dataset.name || '';

  // Handle stopPropagation for buttons inside clickable rows
  if (btn.dataset.stopProp) e.stopPropagation();

  switch (action) {
    case 'open-add-team-modal':   openAddTeamModal(); break;
    case 't-create-org':          createOrganization(); break;
    case 't-open-invite-members': openInviteMembersModal(); break;
    case 't-select-team':         selectTeam(id); break;
    case 't-toggle-team':         toggleTeam(id); break;
    case 't-invite-for-team':     openInviteModalForTeam(id); break;
    case 't-open-invite-modal':   openInviteModal(id); break;
    case 't-change-pw':           openChangeTeamPasswordModal(id, name); break;
    case 't-share-col-modal':     openShareColumnModal(id, name); break;
    case 't-remove-team':         removeTeam(id, name); break;
    case 't-confirm-remove-member': confirmRemoveMember(id, btn.dataset.label || ''); break;
    case 't-confirm-leave-team':   confirmLeaveTeam(btn.dataset.id || id, btn.dataset.name || name); break;
    case 't-do-leave-team':        doLeaveTeam(btn.dataset.id || id, btn.dataset.name || name); break;
    case 't-save-add-team':       saveAddTeam(); break;
    case 't-send-org-invites':    sendOrgInvites(); break;
    case 't-save-new-team':       saveNewTeam(btn.dataset.orgId || ''); break;
    case 't-send-invites':        sendInvites(id); break;
    case 't-do-promote':          doPromote(id); break;
    case 't-do-remove-team':      doRemoveTeam(id, name); break;
    case 't-do-remove-member':    doRemoveMember(id, btn.dataset.name || ''); break;
    case 't-do-change-pw':        doChangeTeamPassword(id, name); break;
    case 't-do-join-team':        doJoinTeam(id, name, btn.dataset.invite || ''); break;
    case 't-join-team-modal':     openJoinTeamModal(btn.dataset.teamId, btn.dataset.teamName, btn.dataset.inviteId); break;
    case 't-save-share-col':      saveShareColumnModal(id); break;
    case 't-confirm-share-save':  _confirmShareSave(); break;
    case 't-confirm-unshare-col': confirmUnshareColumnFromTeam(btn.dataset.teamId, btn.dataset.teamName, btn.dataset.colId, btn.dataset.colName); break;
    case 't-execute-unshare-col': _executeUnshareColumnFromTeam(btn.dataset.teamId, btn.dataset.colId, btn.dataset.colName); break;
    case 't-resend-invite':       resendInvite(id, btn.dataset.email || '', btn.dataset.team || ''); break;
    case 't-cancel-invite':       cancelInvite(id, btn.dataset.email || '', btn.dataset.teamname || ''); break;
    case 't-confirm-cancel-invite': confirmCancelInvite(id); break;
    case 't-do-resend-invite':    doResendInvite(btn.dataset.inviteId, btn.dataset.email, btn.dataset.teamId); break;
    case 't-pw-toggle': {
      const inp = document.getElementById(btn.dataset.target);
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      break;
    }
    case 'nav-teams-close': {
      const nav = btn.dataset.nav || 'teams';
      navigateTo(nav);
      Modal.close();
      break;
    }
  }
});
