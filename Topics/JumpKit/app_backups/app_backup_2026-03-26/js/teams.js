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
async function renderOrgOwnerView(content, supaUser, profile) {
  // Fetch org
  const { data: org } = await supabaseClient
    .from('organizations')
    .select('*')
    .eq('id', profile.org_id)
    .single();

  // Fetch teams in org
  const { data: teams = [] } = await supabaseClient
    .from('teams')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at');

  // Fetch team member counts
  const teamIds = teams.map(t => t.id);
  let memberCounts = {};
  if (teamIds.length) {
    const { data: members = [] } = await supabaseClient
      .from('team_members')
      .select('team_id')
      .in('team_id', teamIds);
    members.forEach(m => { memberCounts[m.team_id] = (memberCounts[m.team_id] || 0) + 1; });
  }

  content.innerHTML = `
    <div class="acct-grid">
      <div class="acct-section">
        <div class="acct-section-title"><i class="ti ti-building"></i> Organization</div>
        <div class="acct-row">
          <div class="acct-row-label"><span>Name</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${esc(org?.name || '—')}</span>
        </div>
        <div class="acct-row">
          <div class="acct-row-label"><span>Your Role</span></div>
          <span class="teams-badge teams-badge-owner">Org Owner</span>
        </div>
        <div class="acct-row" style="border-bottom:none">
          <div class="acct-row-label"><span>Teams</span></div>
          <span style="color:var(--text-muted);font-size:.88rem">${teams.length}</span>
        </div>
      </div>

      <div class="acct-section">
        <div class="acct-section-title">
          <i class="ti ti-users"></i> Teams
          <button class="btn btn-subtle btn-sm" style="margin-left:auto" onclick="openCreateTeamModal('${esc(profile.org_id)}')">
            <i class="ti ti-plus"></i> Create Team
          </button>
        </div>
        <div id="teamsListEl">
          ${teams.length === 0
            ? '<p style="color:var(--text-muted);font-size:.88rem;padding:12px 0">No teams yet. Create your first one.</p>'
            : teams.map(t => `
              <div class="acct-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                <div style="display:flex;align-items:center;gap:12px;width:100%">
                  <span style="font-weight:600;color:var(--text)">${esc(t.name)}</span>
                  <span style="font-size:.75rem;color:var(--text-muted)">${memberCounts[t.id] || 0} member${memberCounts[t.id] !== 1 ? 's' : ''}</span>
                  <button class="btn btn-subtle btn-sm" style="margin-left:auto;font-size:.78rem" onclick="openPromoteUserModal('${t.id}')">
                    <i class="ti ti-user-up"></i> Promote User
                  </button>
                </div>
              </div>`).join('')}
        </div>
      </div>
    </div>`;

  addTeamsStyles();
}

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
      background: rgba(26,79,214,0.12); color: #6a9ff5;
      border-color: rgba(26,79,214,0.2);
    }
    .teams-badge-pending {
      background: rgba(250,173,20,0.12); color: #e6a817;
      border-color: rgba(250,173,20,0.2);
    }
  `;
  document.head.appendChild(style);
}
