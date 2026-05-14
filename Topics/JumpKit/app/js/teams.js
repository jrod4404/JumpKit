// ── Teams Page ─────────────────────────────────────────────────────
// Roles: org-owner | team-owner | team-member

// Module-level utility: SHA-256 hash for team passwords
async function hashPassword(password) {
  const encoder = new TextEncoder();
  // Use PBKDF2 with a fixed salt derived from the app name + password length
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
  const content = containerEl || document.getElementById('pageContent');

  // ── Teams is available on all tiers (free included) ──────────────
  // Paywall is only triggered at 250 jump launches (free tier limit)
  // Teams access is unrestricted — it drives upgrade naturally

  content.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;text-align:center;color:var(--text-muted)">
    <svg class="ti ti-loader" style="font-size:2rem;display:block;margin-bottom:12px;animation:spin 1s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader"/></svg>
    Loading teams…
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

  try {
    // Get current Supabase user
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

    // Fetch profile
    const { data: profile, error: profErr } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', supaUser.id)
      .single();

    if (profErr && profErr.code !== 'PGRST116') throw profErr;

    const role = profile?.role || 'team-member';
    console.debug('[Teams] role:', role, 'org_id:', profile?.org_id);

    if (role === 'org-owner') {
      await renderOrgOwnerView(content, supaUser, profile);
    } else if (role === 'team-owner') {
      await renderTeamOwnerView(content, supaUser, profile);
    } else {
      await renderTeamMemberView(content, supaUser, profile);
    }
  } catch (err) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><svg class="ti ti-alert-circle"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg></div>
      <h3>Error loading teams</h3>
      <p style="color:var(--text-muted)">${esc(err.message)}</p>
    </div>`;
  }
}

// ── Org-Owner View ────────────────────────────────────────────────
// Module-level selection state for the three-panel layout
let selectedOrgId = null;
let selectedTeamId = null;
let _orgOwnerSupaUser = null; // captured for modal callbacks

async function renderOrgOwnerView(content, supaUser, profile) {
  _orgOwnerSupaUser = supaUser;

  // Check if user owns any org (bypass org_id check — fetch directly)
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

  // If no org yet — show create org form
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
            <button class="btn btn-primary" onclick="createOrganization()"><svg class="ti ti-building"><use href="img/tabler-sprite.svg#tabler-building"/></svg> Create Organization</button>
          </div>
          <div id="createOrgMsg" style="margin-top:12px;font-size:0.85rem"></div>
        </div>
      </div>`;

    window.createOrganization = async function() {
      const name = document.getElementById('newOrgName')?.value.trim();
      const msg = document.getElementById('createOrgMsg');
      if (!name) { if (msg) { msg.style.color='#ef4444'; msg.textContent='Organization name is required.'; } return; }
      if (msg) { msg.style.color='var(--text-muted)'; msg.textContent='Creating…'; }
      try {
        const { data: org, error } = await supabaseClient
          .from('organizations')
          .insert({ name, owner_id: supaUser.id })
          .select()
          .single();
        if (error) throw error;
        // Update profile org_id
        { const { error: _e2 } = await supabaseClient.from('profiles').update({ org_id: org.id }).eq('id', supaUser.id); if (_e2) console.warn('[Teams] org profile update failed:', _e2.message); }
        if (msg) { msg.style.color='#22c55e'; msg.textContent='Organization created! Reloading…'; }
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
  const orgCreated = org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

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
                    onclick="openAddTeamModal()" id="addTeamBtn">
              <svg class="ti ti-plus"><use href="img/tabler-sprite.svg#tabler-plus"/></svg> Add Team
            </button>
          </div>
          <div id="teamsPanel">
            <p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No teams yet.</p>
          </div>
        </div>

        <!-- Members panel -->
        <div class="acct-section">
          <div class="acct-section-title" style="display:flex;align-items:center">
            <svg class="ti ti-user-check"><use href="img/tabler-sprite.svg#tabler-user-check"/></svg> Members
            <button class="btn btn-subtle" style="margin-left:auto;font-size:0.8rem;padding:3px 10px"
                    onclick="openInviteMembersModal()" id="inviteBtn" style="display:none">
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
  teamsPanel.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">Loading…</p>`;

  try {
    const { data: teams = [], error } = await supabaseClient
      .from('teams')
      .select('*')
      .eq('org_id', orgId)
      .order('name');
    if (error) throw error;

    // Fetch member counts for all teams
    let memberCounts = {};
    if (teams.length) {
      const { data: counts = [] } = await supabaseClient
        .from('team_members')
        .select('team_id')
        .in('team_id', teams.map(t => t.id));
      counts.forEach(c => { memberCounts[c.team_id] = (memberCounts[c.team_id] || 0) + 1; });
    }

    if (teams.length === 0) {
      teamsPanel.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No teams yet.</p>`;
    } else {
      teamsPanel.innerHTML = teams.map(t => {
        const mCount = memberCounts[t.id] || 0;
        const created = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : '—';
        return `
        <div class="acct-row teams-selectable-row" id="teamRow_${t.id}" onclick="selectTeam('${t.id}')">
          <div class="acct-row-label">
            <span>${esc(t.name)}</span>
            <span class="acct-row-hint">${mCount} team member${mCount !== 1 ? 's' : ''}</span>
            <span class="acct-row-hint">Created ${created}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <svg class="ti ti-chevron-right" style="color:var(--text-muted);font-size:0.8rem"><use href="img/tabler-sprite.svg#tabler-chevron-right"/></svg>
            <button class="btn btn-subtle" data-tooltip="Change team password" style="font-size:0.75rem;padding:3px 8px" onclick="event.stopPropagation();openChangeTeamPasswordModal('${t.id}','${esc(t.name)}')"><svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg></button>
            <button class="btn btn-delete" data-tooltip="Delete team" style="font-size:0.75rem;padding:3px 8px" onclick="event.stopPropagation();removeTeam('${t.id}','${esc(t.name)}')"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button>
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
  membersPanel.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem;text-align:center;padding:24px 8px">Loading…</p>`;

  try {
    const { data: members = [], error } = await supabaseClient
      .from('team_members')
      .select('*, profiles(email, first_name, last_name, role)')
      .eq('team_id', teamId);
    if (error) throw error;

    // Fetch team name for use in cancel modal
    const { data: teamInfo } = await supabaseClient.from('teams').select('name').eq('id', teamId).single();
    const teamName = teamInfo?.name || '';

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
              <button class="btn btn-subtle" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Resend invitation" onclick="resendInvite('${esc(inv.id)}','${esc(inv.email)}','${esc(inv.team_id)}')"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Invite Again</button>
              <button class="btn btn-delete" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Cancel invitation" onclick="cancelInvite('${esc(inv.id)}','${esc(inv.email)}','${esc(teamName)}')"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
            </div>
          </div>`).join('')}` : '';

      membersPanel.innerHTML = members.map(m => {
        const name = [m.profiles?.first_name, m.profiles?.last_name].filter(Boolean).join(' ');
        const email = m.profiles?.email || m.user_id;
        const joined = m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—';
        const role = m.profiles?.role || 'team-member';
        const roleBadgeClass = role === 'org-owner' ? 'teams-badge teams-badge-owner' : role === 'team-owner' ? 'teams-badge teams-badge-owner' : 'teams-badge';
        const roleLabel = role === 'org-owner' ? 'Org Owner' : role === 'team-owner' ? 'Team Owner' : 'Member';
        return `
          <div class="acct-row">
            <div class="acct-row-label">
              <span style="display:flex;align-items:center;gap:6px">
                <span style="color:var(--text-muted)">${name ? esc(name) : esc(email)}</span>
                <span class="teams-badge teams-badge-owner" style="padding:1px 7px;font-size:0.65rem;color:#7aa8f7">${roleLabel}</span>
              </span>
              ${name ? `<span class="acct-row-hint">${esc(email)}</span>` : ''}
              <span class="acct-row-hint">Joined ${joined}</span>
            </div>
            <button class="btn btn-delete tooltip-left" data-tooltip="Remove member" style="font-size:0.75rem;padding:3px 8px" onclick="confirmRemoveMember('${m.id}','${esc(name || email)}')"><svg class="ti ti-user-minus"><use href="img/tabler-sprite.svg#tabler-user-minus"/></svg></button>
          </div>`;
      }).join('') + inviteRows;
    }
  } catch (err) {
    membersPanel.innerHTML = `<p style="color:#ef4444;font-size:0.85rem;padding:8px 0">Error: ${esc(err.message)}</p>`;
  }
};

// ── Org-Owner: Add Team Modal ─────────────────────────────────────
window.openAddTeamModal = function() {
  if (!selectedOrgId) return;
  const body = `
    <div class="form-group">
      <label class="form-label">Team Name *</label>
      <input class="form-input" id="atTeamName" placeholder="e.g. Sales Team"/>
      <span class="form-error" id="atTeamNameErr">Team name is required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Team Password *</label>
      <input class="form-input" type="password" id="atTeamPassword" placeholder="Members will need this to join"/>
      <span class="form-error" id="atTeamPasswordErr">Team password is required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Confirm Password *</label>
      <input class="form-input" type="password" id="atTeamPasswordConfirm" placeholder="Re-enter password"/>
      <span class="form-error" id="atTeamPasswordConfirmErr">Passwords do not match.</span>
    </div>`;

  Modal.open('<svg class="ti ti-users"><use href="img/tabler-sprite.svg#tabler-users"/></svg> Add Team', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" onclick="saveAddTeam()"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save</button>`, 'sm');
};

window.saveAddTeam = async function() {
  const name     = document.getElementById('atTeamName')?.value.trim();
  const password = document.getElementById('atTeamPassword')?.value;

  const passwordConfirm = document.getElementById('atTeamPasswordConfirm')?.value;
  ['atTeamNameErr', 'atTeamPasswordErr', 'atTeamPasswordConfirmErr'].forEach(id => {
    document.getElementById(id)?.classList.remove('show');
  });

  let ok = true;
  if (!name)     { document.getElementById('atTeamNameErr')?.classList.add('show');     ok = false; }
  if (!password)  { document.getElementById('atTeamPasswordErr')?.classList.add('show');  ok = false; }
  if (password && password !== passwordConfirm) { document.getElementById('atTeamPasswordConfirmErr')?.classList.add('show'); ok = false; }
  if (!password) { document.getElementById('atTeamPasswordErr')?.classList.add('show'); ok = false; }
  if (!ok) return;

  try {
    const hashedPassword = await hashPassword(password);
    const ownerId = _orgOwnerSupaUser?.id;
    const { data: team, error } = await supabaseClient
      .from('teams')
      .insert({ org_id: selectedOrgId, name, team_password_hash: hashedPassword, team_password_plain: password, owner_id: ownerId })
      .select()
      .single();
    if (error) throw error;

    Modal.close();
    Toast.success(`Team "${esc(name)}" created!`);
    selectOrg(selectedOrgId); // refresh teams panel
    // Increment org teams count in header
    updateOrgStats(1, 0);
  } catch (err) {
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
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" onclick="sendOrgInvites()"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Send Invites</button>`, 'sm');
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
  } catch (checkErr) {
    console.warn('[sendOrgInvites] pre-check failed:', checkErr.message);
  }

  const emails = uniqueEmails;

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
        // Try to send invite email — non-fatal if Edge Function not yet deployed
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
    selectTeam(selectedTeamId); // refresh members panel
  } catch (err) {
    Toast.danger('Failed to send invites: ' + err.message);
  }
};

window.resendInvite = async function(inviteId, email, teamId) {
  try {
    // Update the existing invite's timestamp and reset to pending
    const { error } = await supabaseClient
      .from('team_invites')
      .update({ status: 'pending', invited_at: new Date().toISOString() })
      .eq('id', inviteId);
    if (error) throw error;

    // Re-send invite email (non-fatal) — fetch team/org/password first
    try {
      const invitedBy = _orgOwnerSupaUser?.id;
      const { data: team } = await supabaseClient
        .from('teams')
        .select('name, org_id, team_password_plain')
        .eq('id', teamId)
        .single();
      let orgName = '';
      if (team?.org_id) {
        const { data: org } = await supabaseClient.from('organizations').select('name').eq('id', team.org_id).single();
        orgName = org?.name || '';
      }
      await supabaseClient.functions.invoke('send-invite', {
        body: {
          email, teamId, invitedBy,
          teamName: team?.name || '',
          orgName,
          teamPassword: team?.team_password_plain || '',
        },
      });
    } catch (_) { /* email sending optional */ }

    Toast.success(`Invite resent to ${email}!`);
  } catch (e) {
    Toast.danger('Failed to resend invite: ' + e.message);
  }
};

window.cancelInvite = async function(inviteId, email, teamName) {
  Modal.open(
    '<svg class="ti ti-mail-off" style="color:var(--danger)"><use href="img/tabler-sprite.svg#tabler-mail-off"/></svg> Cancel Invitation',
    `<p style="color:var(--text-muted);font-size:0.92rem;line-height:1.6">
      Are you sure you want to cancel the invitation for <strong style="color:var(--text-muted)">${esc(email)}</strong>? They will no longer be able to join <strong style="color:var(--text-muted)">${esc(teamName)}</strong> using this invite.
    </p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Keep Invite</button>
     <button class="btn btn-delete" onclick="confirmCancelInvite('${esc(inviteId)}')"><svg class="ti ti-mail-off"><use href="img/tabler-sprite.svg#tabler-mail-off"/></svg> Cancel Invitation</button>`,
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
    await renderTeams();
  } catch (e) {
    Toast.danger('Failed to cancel invitation: ' + e.message);
  }
};

// ── Team-Owner View ───────────────────────────────────────────────
async function renderTeamOwnerView(content, supaUser, profile) {
  // Find team this user owns
  const { data: teams = [] } = await supabaseClient
    .from('teams')
    .select('*')
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
          <span style="color:var(--text-muted);font-size:.88rem">${esc(org?.name || '—')}</span></div>
        <div class="acct-row" style="border-bottom:none"><div class="acct-row-label"><span>Your Role</span></div>
          <span class="teams-badge teams-badge-owner">Team Owner</span></div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title">
          <svg class="ti ti-users-group"><use href="img/tabler-sprite.svg#tabler-users-group"/></svg> Members (${memberRows.length})
          <button class="btn btn-subtle btn-sm" style="margin-left:auto" onclick="openInviteModal('${team.id}')">
            <svg class="ti ti-user-plus"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Invite Members
          </button>
          <button class="btn btn-subtle btn-sm" onclick="openChangeTeamPasswordModal('${team.id}','${esc(team.name)}')">
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
              <button class="btn btn-subtle" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Resend invitation" onclick="resendInvite('${esc(inv.id)}','${esc(inv.email)}','${esc(inv.team_id)}')"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Invite Again</button>
              <button class="btn btn-delete" style="font-size:0.72rem;padding:3px 9px" data-tooltip="Cancel invitation" onclick="cancelInvite('${esc(inv.id)}','${esc(inv.email)}','${esc(team.name)}')"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
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
    const { data: t } = await supabaseClient.from('teams').select('id, name, team_password_hash, owner_id').eq('id', inv.team_id).single();
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
            <button class="btn btn-primary" style="font-size:0.82rem;padding:6px 14px" onclick="openJoinTeamModal('${inv.teams?.id}','${esc(inv.teams?.name || '')}','${inv.id}')">
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
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.organizations?.name || '—')}</span></div>
        <div class="acct-row" style="border-bottom:none"><div class="acct-row-label"><span>Team Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.name)}</span></div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title"><svg class="ti ti-users-group"><use href="img/tabler-sprite.svg#tabler-users-group"/></svg> Team Members</div>
        <div class="acct-row"><div class="acct-row-label"><span>Team Owner</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(ownerProfile?.email || '—')}</span></div>
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
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" onclick="saveNewTeam('${orgId}')"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Create Team</button>`, 'sm');
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

    // Create team — hash password with PBKDF2 before storing
    const hashedAdminPassword = await hashPassword(password);
    const { data: team, error } = await supabaseClient
      .from('teams')
      .insert({ org_id: orgId, name, team_password_hash: hashedAdminPassword, team_password_plain: password, owner_id: ownerId })
      .select()
      .single();
    if (error) throw error;

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
  // Fetch plaintext password for this team
  const { data: teamData } = await supabaseClient
    .from('teams')
    .select('team_password_plain')
    .eq('id', teamId)
    .single();
  const plainPw = teamData?.team_password_plain || '';

  const body = `
    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:16px">
      Enter email addresses to invite (one per line). An invitation will be sent to each unique and valid address.
    </p>
    <div class="form-group">
      <label class="form-label">Email Addresses *</label>
      <textarea class="form-textarea" id="inviteEmails" maxlength="2000" placeholder="alice@example.com&#10;bob@example.com" style="min-height:120px"></textarea>
      <span class="form-error" id="inviteEmailsErr"></span>
    </div>
    <input type="hidden" id="inviteTeamPassword" value="${esc(plainPw)}" />`;

  Modal.open('<svg class="ti ti-mail"><use href="img/tabler-sprite.svg#tabler-mail"/></svg> Invite Members', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" onclick="sendInvites('${teamId}')"><svg class="ti ti-send"><use href="img/tabler-sprite.svg#tabler-send"/></svg> Send Invites</button>`, 'sm');
}

async function sendInvites(teamId) {
  const raw = document.getElementById('inviteEmails').value.trim();
  const allEmails = raw.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
  const teamPassword = document.getElementById('inviteTeamPassword')?.value.trim() || '';

  const errEl = document.getElementById('inviteEmailsErr');
  errEl?.classList.remove('show');

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

    // #3 — self-invite
    if (currentUserEmail && emails.includes(currentUserEmail)) {
      if (errEl) errEl.textContent = 'You cannot invite yourself.';
      errEl?.classList.add('show'); return;
    }

    // #1 — already a member (look up by email via profiles)
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

    // #2 — already has pending invite
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
  } catch (checkErr) {
    console.warn('[sendInvites] pre-check failed:', checkErr.message);
  }

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
        // Insert invite record — must always succeed
        const { error: insertErr } = await supabaseClient.from('team_invites').insert({
          team_id: teamId,
          email,
          invited_by: invitedBy,
          status: 'pending',
        });
        if (insertErr && !insertErr.message.includes('duplicate')) throw insertErr;

        // Call Edge Function to send email — non-fatal if not configured
        try {
          await supabaseClient.functions.invoke('send-invite', {
            body: {
              email,
              teamId,
              invitedBy: invitedBy,
              orgName: team?.organizations?.name || '',
              teamName: team?.name || '',
              teamPassword: teamPassword,
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
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" onclick="doPromote('${teamId}')"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Promote</button>`, 'sm');
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
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" onclick="doRemoveTeam('${teamId}','${teamName.replace(/'/g,"\'")}')"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Remove Team</button>`, 'sm');
};
window.doRemoveTeam = async function(teamId, teamName) {
  Modal.close();
  try {
    const r1 = await supabaseClient.from('team_members').delete().eq('team_id', teamId); if (r1.error) throw new Error('Delete members failed: ' + r1.error.message);
    const r2 = await supabaseClient.from('teams').delete().eq('id', teamId); if (r2.error) throw new Error('Delete team failed: ' + r2.error.message);
    if (r2.error) throw r2.error;
    Toast.success(`Team "${teamName}" removed`);
    const orgToRefresh = selectedOrgId;
    selectedTeamId = null;
    if (orgToRefresh) setTimeout(() => selectOrg(orgToRefresh), 300);
    updateOrgStats(-1, 0);
  } catch(e) { Toast.danger('Error: ' + e.message); console.error('[doRemoveTeam]', e); }
};

window.confirmRemoveMember = function(memberId, memberName) {
  Modal.open('<svg class="ti ti-user-minus"><use href="img/tabler-sprite.svg#tabler-user-minus"/></svg> Remove Member',
    `<p style="color:var(--text-muted);font-size:.95rem">Remove <strong style="color:var(--text-card-title)">${memberName}</strong> from this team? They will lose access to shared jumps.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" onclick="doRemoveMember('${memberId}','${memberName.replace(/'/g,"\'")}')"><svg class="ti ti-user-minus"><use href="img/tabler-sprite.svg#tabler-user-minus"/></svg> Remove</button>`, 'sm');
};
window.removeMember = window.confirmRemoveMember;
window.doRemoveMember = async function(memberId, memberName) {
  Modal.close();
  try {
    { const { error: _e5 } = await supabaseClient.from('team_members').delete().eq('id', memberId); if (_e5) throw new Error('Remove member failed: ' + _e5.message); }
    Toast.success(`${memberName} removed from team`);
    updateOrgStats(0, -1);
    if (selectedTeamId) selectTeam(selectedTeamId);
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
      <input class="form-input" type="password" id="ctpNewPassword" placeholder="Enter new password" autocomplete="new-password"/>
      <span class="form-error" id="ctpNewPasswordErr">Password is required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Confirm Password *</label>
      <input class="form-input" type="password" id="ctpConfirmPassword" placeholder="Confirm new password" autocomplete="new-password"/>
      <span class="form-error" id="ctpConfirmPasswordErr">Passwords do not match.</span>
    </div>`;

  Modal.open('<svg class="ti ti-lock"><use href="img/tabler-sprite.svg#tabler-lock"/></svg> Change Team Password', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" onclick="doChangeTeamPassword('${teamId}','${esc(teamName)}')"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save Password</button>`, 'sm');
};

window.doChangeTeamPassword = async function(teamId, teamName) {
  const newPw      = document.getElementById('ctpNewPassword')?.value;
  const confirmPw  = document.getElementById('ctpConfirmPassword')?.value;

  ['ctpNewPasswordErr', 'ctpConfirmPasswordErr'].forEach(id => document.getElementById(id)?.classList.remove('show'));

  let ok = true;
  if (!newPw)              { document.getElementById('ctpNewPasswordErr')?.classList.add('show'); ok = false; }
  if (newPw !== confirmPw) { document.getElementById('ctpConfirmPasswordErr')?.classList.add('show'); ok = false; }
  if (!ok) return;

  try {
    const hashedPw = await hashPassword(newPw);
    const { error } = await supabaseClient
      .from('teams')
      .update({ team_password_hash: hashedPw, team_password_plain: newPw })
      .eq('id', teamId);
    if (error) throw error;
    Modal.close();
    Toast.success(`Password updated for "${esc(teamName)}"`);
  } catch(e) {
    Toast.danger('Failed to update password: ' + e.message);
  }
};

// ── Join Team Modal & Flow ─────────────────────────────────────────
window.openJoinTeamModal = function(teamId, teamName, inviteId) {
  Modal.open(`<svg class="ti ti-user-plus"><use href="img/tabler-sprite.svg#tabler-user-plus"/></svg> Join Team`, `
    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:16px">
      Enter the team password to join <strong>${esc(teamName)}</strong>.
    </p>
    <div class="form-group">
      <label class="form-label">Team Password *</label>
      <div class="pw-wrap">
        <input class="form-input" type="password" id="joinTeamPassword" placeholder="Enter team password" style="padding-right:38px"/>
        <button type="button" class="pw-eye" tabindex="-1" id="joinTeamPasswordEye"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <span class="form-error" id="joinTeamPasswordErr">Incorrect password.</span>
    </div>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-primary" onclick="doJoinTeam('${teamId}','${esc(teamName)}','${inviteId}')">
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
    // Fetch the team's password hash
    const { data: team, error } = await supabaseClient
      .from('teams')
      .select('team_password_hash')
      .eq('id', teamId)
      .single();
    if (error) throw error;

    // Compare passwords — use SHA-256 hash comparison
    // Hash the input and compare to stored hash
    const inputHash = await hashPassword(pw);
    
    // Support both plain text (legacy) and hashed passwords
    const storedHash = team.team_password_hash;
    const match = storedHash === pw || storedHash === inputHash;
    
    if (!match) {
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
            Visit your <strong>Jumps</strong> page — your team's shared jumps will appear there automatically.
          </p>
        </div>`,
        `<button class="btn btn-subtle" onclick="Modal.close()">Stay here</button>
         <button class="btn btn-primary" onclick="navigateTo('jumps'); Modal.close()"><svg viewBox="0 0 105.74 122.88" style="width:1.4rem;height:1.4rem;fill:white;flex-shrink:0;vertical-align:middle"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83 c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg> Go to Jumps</button>`
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
  if (document.getElementById('teamsStyles')) return;
  const style = document.createElement('style');
  style.id = 'teamsStyles';
  style.textContent = `
    .teams-badge {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 20px;
      font-size: .72rem; font-weight: 600;
      background: rgba(0,194,199,0.12); color: var(--turq);
      border: 1px solid rgba(0,194,199,0.2);
    }
    .teams-badge-owner {
      background: rgba(26,79,214,0.18); color: #7aa8f7;
      border-color: rgba(26,79,214,0.35);
    }
    .teams-badge-pending {
      background: rgba(250,173,20,0.12); color: #e6a817;
      border-color: rgba(250,173,20,0.2);
    }
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
  `;
  document.head.appendChild(style);
}
