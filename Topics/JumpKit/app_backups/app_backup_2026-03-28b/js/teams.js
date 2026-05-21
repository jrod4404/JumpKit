// ── Teams Page ─────────────────────────────────────────────────────
// Roles: org-owner | team-owner | team-member

async function renderTeams() {
  const content = document.getElementById('pageContent');
  content.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">
    <i class="ti ti-loader" style="font-size:2rem;display:block;margin-bottom:12px;animation:spin 1s linear infinite"></i>
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
        <div class="big-icon"><i class="ti ti-cloud-off"></i></div>
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
    console.log('[Teams] role:', role, 'org_id:', profile?.org_id);

    if (role === 'org-owner') {
      await renderOrgOwnerView(content, supaUser, profile);
    } else if (role === 'team-owner') {
      await renderTeamOwnerView(content, supaUser, profile);
    } else {
      await renderTeamMemberView(content, supaUser, profile);
    }
  } catch (err) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><i class="ti ti-alert-circle"></i></div>
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

  // If no org yet — show create org form
  if (!ownedOrg && !profile.org_id) {
    content.innerHTML = `
      <div class="acct-grid">
        <div class="acct-section">
          <div class="acct-section-title"><i class="ti ti-building"></i> Create Your Organization</div>
          <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px">You haven't set up an organization yet. Create one to start managing teams and sharing jumps.</p>
          <div class="form-group">
            <label class="form-label">Organization Name</label>
            <input class="form-input" id="newOrgName" placeholder="e.g. Acme Corp" style="max-width:320px"/>
          </div>
          <div style="margin-top:8px">
            <button class="btn btn-primary" onclick="createOrganization()"><i class="ti ti-building"></i> Create Organization</button>
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
        await supabaseClient.from('profiles').update({ org_id: org.id }).eq('id', supaUser.id);
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
      <div class="big-icon"><i class="ti ti-alert-circle"></i></div>
      <h3>Error loading organization</h3>
      <p style="color:var(--text-muted)">${esc(err.message)}</p>
    </div>`;
    return;
  }

  if (!org) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><i class="ti ti-building"></i></div>
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
        <div class="acct-section-title"><i class="ti ti-building"></i> Your Organization</div>
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
            <i class="ti ti-users"></i> Your Teams
            <button class="btn btn-subtle" style="margin-left:auto;font-size:0.8rem;padding:3px 10px"
                    onclick="openAddTeamModal()" id="addTeamBtn">
              <i class="ti ti-plus"></i> Add Team
            </button>
          </div>
          <div id="teamsPanel">
            <p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No teams yet.</p>
          </div>
        </div>

        <!-- Members panel -->
        <div class="acct-section">
          <div class="acct-section-title" style="display:flex;align-items:center">
            <i class="ti ti-user-check"></i> Members
            <button class="btn btn-subtle" style="margin-left:auto;font-size:0.8rem;padding:3px 10px"
                    onclick="openInviteMembersModal()" id="inviteBtn" style="display:none">
              <i class="ti ti-mail"></i> Invite Members
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
            <i class="ti ti-chevron-right" style="color:var(--text-muted);font-size:0.8rem"></i>
            <button class="btn btn-delete" style="font-size:0.75rem;padding:3px 8px" onclick="event.stopPropagation();removeTeam('${t.id}','${esc(t.name)}')"><i class="ti ti-trash"></i></button>
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
  membersPanel.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">Loading…</p>`;

  try {
    const { data: members = [], error } = await supabaseClient
      .from('team_members')
      .select('*, profiles(email, first_name, last_name, role)')
      .eq('team_id', teamId);
    if (error) throw error;

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
        ${members.length > 0 ? '<div style="font-size:0.72rem;color:var(--text-dim);padding:8px 0 4px;border-top:1px solid var(--border);margin-top:4px">Pending Invites</div>' : '<div style="font-size:0.72rem;color:var(--text-dim);padding:8px 0 4px">Pending Invites</div>'}
        ${invites.map((inv, i) => `
          <div class="acct-row" ${i === 0 && members.length > 0 ? 'style="border-top:none"' : ''}>
            <div class="acct-row-label">
              <span style="color:var(--text-muted)">${esc(inv.email)}</span>
              <span class="acct-row-hint">Invite pending</span>
            </div>
            <span class="teams-badge teams-badge-pending" style="font-size:0.65rem;padding:1px 7px">Pending</span>
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
            <button class="btn btn-delete" style="font-size:0.75rem;padding:3px 8px" onclick="confirmRemoveMember('${m.id}','${esc(name || email)}')"><i class="ti ti-user-minus"></i></button>
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

  Modal.open('<i class="ti ti-users"></i> Add Team', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-save" onclick="saveAddTeam()"><i class="ti ti-check"></i> Save</button>`, 'sm');
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
    const ownerId = _orgOwnerSupaUser?.id;
    const { data: team, error } = await supabaseClient
      .from('teams')
      .insert({ org_id: selectedOrgId, name, team_password_hash: password, owner_id: ownerId })
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
      <textarea class="form-textarea" id="orgInviteEmails"
        placeholder="alice@example.com&#10;bob@example.com" style="min-height:120px"></textarea>
      <span class="form-error" id="orgInviteEmailsErr">At least one valid email required.</span>
    </div>`;

  Modal.open('<i class="ti ti-mail"></i> Invite Members', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-save" onclick="sendOrgInvites()"><i class="ti ti-send"></i> Send Invites</button>`, 'sm');
};

window.sendOrgInvites = async function() {
  const raw    = document.getElementById('orgInviteEmails')?.value.trim() || '';
  const emails = raw.split(/[\n,;]+/)
    .map(e => e.trim())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  if (emails.length === 0) {
    document.getElementById('orgInviteEmailsErr')?.classList.add('show');
    return;
  }

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
      Toast.success(`Invited ${sent} member${sent !== 1 ? 's' : ''}!`);
    } else {
      Toast.success(`Sent ${sent} invite${sent !== 1 ? 's' : ''} (${failed} failed).`);
    }
    selectTeam(selectedTeamId); // refresh members panel
  } catch (err) {
    Toast.danger('Failed to send invites: ' + err.message);
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
      <div class="big-icon"><i class="ti ti-users"></i></div>
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
        <div class="acct-section-title"><i class="ti ti-users"></i> Your Team</div>
        <div class="acct-row"><div class="acct-row-label"><span>Team Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.name)}</span></div>
        <div class="acct-row"><div class="acct-row-label"><span>Organization</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(org?.name || '—')}</span></div>
        <div class="acct-row" style="border-bottom:none"><div class="acct-row-label"><span>Your Role</span></div>
          <span class="teams-badge teams-badge-owner">Team Owner</span></div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title">
          <i class="ti ti-users-group"></i> Members (${memberRows.length})
          <button class="btn btn-subtle btn-sm" style="margin-left:auto" onclick="openInviteModal('${team.id}')">
            <i class="ti ti-user-plus"></i> Invite Members
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
        <div class="acct-section-title"><i class="ti ti-mail"></i> Pending Invites (${invites.length})</div>
        ${invites.map(inv => `
          <div class="acct-row">
            <div class="acct-row-label">
              <span>${esc(inv.email)}</span>
              <span class="acct-row-hint">Invited ${new Date(inv.invited_at).toLocaleDateString()}</span>
            </div>
            <span class="teams-badge teams-badge-pending">Pending</span>
          </div>`).join('')}
      </div>` : ''}
    </div>`;

  addTeamsStyles();
}

// ── Team-Member View ──────────────────────────────────────────────
async function renderTeamMemberView(content, supaUser, profile) {
  // Find membership
  const { data: memberRows = [] } = await supabaseClient
    .from('team_members')
    .select('*, teams(name, org_id, owner_id, organizations(name))')
    .eq('user_id', supaUser.id);

  if (memberRows.length === 0) {
    content.innerHTML = `<div class="no-columns">
      <div class="big-icon"><i class="ti ti-users"></i></div>
      <h3>No team yet</h3>
      <p>Ask your team owner to invite you, or use <strong>Join a Team</strong> on the sign-in screen.</p>
    </div>`;
    return;
  }

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

  content.innerHTML = `
    <div class="acct-grid">
      <div class="acct-section">
        <div class="acct-section-title"><i class="ti ti-building"></i> Organization</div>
        <div class="acct-row"><div class="acct-row-label"><span>Org Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.organizations?.name || '—')}</span></div>
        <div class="acct-row" style="border-bottom:none"><div class="acct-row-label"><span>Team Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(team.name)}</span></div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title"><i class="ti ti-users-group"></i> Team Members</div>
        <div class="acct-row"><div class="acct-row-label"><span>Team Owner</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(ownerProfile?.email || '—')}</span></div>
        ${allMembers.map(m => `
          <div class="acct-row">
            <div class="acct-row-label"><span>${esc(m.profiles?.email || m.user_id)}</span></div>
            <span class="teams-badge">Member</span>
          </div>`).join('')}
      </div>
    </div>`;

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

  Modal.open('<i class="ti ti-users"></i> Create Team', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-save" onclick="saveNewTeam('${orgId}')"><i class="ti ti-check"></i> Create Team</button>`, 'sm');
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

    // Create team (NOTE: team_password_hash stored as plaintext here for simplicity)
    // TODO: Jeff — for production, hash the password via an Edge Function before storing
    const { data: team, error } = await supabaseClient
      .from('teams')
      .insert({ org_id: orgId, name, team_password_hash: password, owner_id: ownerId })
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
function openInviteModal(teamId) {
  const body = `
    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:16px">
      Enter email addresses to invite (one per line). An invitation email will be sent with instructions.
    </p>
    <div class="form-group">
      <label class="form-label">Email Addresses *</label>
      <textarea class="form-textarea" id="inviteEmails" placeholder="alice@example.com&#10;bob@example.com" style="min-height:120px"></textarea>
      <span class="form-error" id="inviteEmailsErr">At least one valid email required.</span>
    </div>`;

  Modal.open('<i class="ti ti-mail"></i> Invite Members', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-save" onclick="sendInvites('${teamId}')"><i class="ti ti-send"></i> Send Invites</button>`, 'sm');
}

async function sendInvites(teamId) {
  const raw = document.getElementById('inviteEmails').value.trim();
  const emails = raw.split(/[\n,;]+/).map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  if (emails.length === 0) {
    document.getElementById('inviteEmailsErr').classList.add('show');
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const invitedBy = session?.user?.id;

    // Fetch team info for email
    const { data: team } = await supabaseClient
      .from('teams')
      .select('name, organizations(name)')
      .eq('id', teamId)
      .single();

    let sent = 0, failed = 0;
    for (const email of emails) {
      try {
        // Insert invite record
        await supabaseClient.from('team_invites').insert({
          team_id: teamId,
          email,
          invited_by: invitedBy,
          status: 'pending',
        });

        // Call Edge Function to send email
        const { error: fnErr } = await supabaseClient.functions.invoke('send-invite', {
          body: {
            email,
            teamId,
            invitedBy: invitedBy,
            orgName: team?.organizations?.name || '',
            teamName: team?.name || '',
            teamPassword: team?.team_password_hash || '',
          },
        });
        if (fnErr) throw fnErr;
        sent++;
      } catch (_) {
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

  Modal.open('<i class="ti ti-user-up"></i> Promote to Team Owner', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-save" onclick="doPromote('${teamId}')"><i class="ti ti-check"></i> Promote</button>`, 'sm');
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
    await supabaseClient.from('profiles').update({ role: 'team-owner' }).eq('id', userId);
    await supabaseClient.from('teams').update({ owner_id: userId }).eq('id', teamId);

    Modal.close();
    Toast.success(`Promoted ${email} to team owner.`);
    renderTeams();
  } catch (err) {
    Toast.danger('Failed to promote: ' + err.message);
  }
}

// ── Teams CSS ─────────────────────────────────────────────────────

window.removeTeam = function(teamId, teamName) {
  Modal.open('<i class="ti ti-trash"></i> Remove Team',
    `<p style="color:var(--text-muted);font-size:.95rem">Remove team <strong style="color:var(--text-card-title)">${teamName}</strong> and all its members? This cannot be undone.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-delete" onclick="doRemoveTeam('${teamId}','${teamName.replace(/'/g,"\'")}')"><i class="ti ti-trash"></i> Remove Team</button>`, 'sm');
};
window.doRemoveTeam = async function(teamId, teamName) {
  Modal.close();
  try {
    const r1 = await supabaseClient.from('team_members').delete().eq('team_id', teamId);
    const r2 = await supabaseClient.from('teams').delete().eq('id', teamId);
    if (r2.error) throw r2.error;
    Toast.success(`Team "${teamName}" removed`);
    const orgToRefresh = selectedOrgId;
    selectedTeamId = null;
    if (orgToRefresh) setTimeout(() => selectOrg(orgToRefresh), 300);
    updateOrgStats(-1, 0);
  } catch(e) { Toast.danger('Error: ' + e.message); console.error('[doRemoveTeam]', e); }
};

window.confirmRemoveMember = function(memberId, memberName) {
  Modal.open('<i class="ti ti-user-minus"></i> Remove Member',
    `<p style="color:var(--text-muted);font-size:.95rem">Remove <strong style="color:var(--text-card-title)">${memberName}</strong> from this team? They will lose access to shared jumps.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-delete" onclick="doRemoveMember('${memberId}','${memberName.replace(/'/g,"\'")}')"><i class="ti ti-user-minus"></i> Remove</button>`, 'sm');
};
window.removeMember = window.confirmRemoveMember;
window.doRemoveMember = async function(memberId, memberName) {
  Modal.close();
  try {
    await supabaseClient.from('team_members').delete().eq('id', memberId);
    Toast.success(`${memberName} removed from team`);
    updateOrgStats(0, -1);
    if (selectedTeamId) selectTeam(selectedTeamId);
  } catch(e) { Toast.danger('Error: ' + e.message); }
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
