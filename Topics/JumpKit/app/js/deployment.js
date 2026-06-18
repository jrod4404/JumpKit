// ── JumpKit Deployment Checklist Page ────────────────────────────
// Inject layout CSS so page-content becomes a flex column (same trick as tests page)
(function injectDeployStyles() {
  if (document.getElementById('jk-deploy-styles')) return;
  const s = document.createElement('style');
  s.id = 'jk-deploy-styles';
  s.textContent = `.page-content:has(#pageDeployment){overflow:hidden!important;padding:0!important;display:flex!important;flex-direction:column!important;}`;
  document.head.appendChild(s);
})();
// Admin-only page for tracking pre-deploy steps across 6 phases.
// Step state (todo/completed) is persisted in localStorage under jk_deploy_state.

const DEPLOY_PHASES = [
  {
    id: 'codeversion', label: 'Code & Version', icon: 'ti-git-commit', color: '#8b5cf6',
    steps: [
      { id: 'cv-1', text: 'Commit all outstanding changes with a clear release commit message.' },
      { id: 'cv-2', text: 'Note the final <strong>commit ID</strong> (<code>git log --oneline -1</code>) and record it in the changelog.' },
      { id: 'cv-3', text: 'Update <strong>version number</strong> in <code>app/package.json</code> (semver: major.minor.patch).' },
      { id: 'cv-4', text: 'Update any version display in the app UI or About page.' },
      { id: 'cv-5', text: 'Write a full <strong>changelog entry</strong> in JUMPKIT_DOCS.html — all changes, fixes, new features.' },
      { id: 'cv-6', text: 'Commit the version bump + changelog. Push to GitHub.' },
    ]
  },
  {
    id: 'backup', label: 'Backup', icon: 'ti-device-floppy', color: '#10b981',
    steps: [
      { id: 'bk-1', text: 'Create a dated code backup: <code>tar -czf app_backups/app_backup_YYYY-MM-DD.tar.gz --exclude=\'./app/node_modules\' ./app ./landing</code>' },
      { id: 'bk-2', text: 'Confirm the backup saved correctly — spot-check a few files inside the archive.' },
      { id: 'bk-3', text: 'Note the backup filename in the changelog / release notes.' },
    ]
  },
  {
    id: 'build', label: 'Build Installers', icon: 'ti-package', color: '#f97316',
    steps: [
      { id: 'bl-1', text: 'On Mac: run <code>npm run dist</code> to build the <code>.dmg</code> installer.' },
      { id: 'bl-2', text: 'Confirm Mac build completes without errors and the <code>.dmg</code> is notarized by Apple.' },
      { id: 'bl-3', text: 'Test Mac installer: install from the <code>.dmg</code> on a clean Mac, launch, log in, do a few jumps.' },
      { id: 'bl-4', text: 'On Windows: run the Windows build command to produce the <code>.exe</code> / <code>.msi</code> installer.' },
      { id: 'bl-5', text: 'Confirm Windows build completes without errors.' },
      { id: 'bl-6', text: 'Test Windows installer: install and launch on a clean Windows machine, log in, do a few jumps.' },
      { id: 'bl-7', text: 'Note both installer filenames and file sizes. Save both installers into the deployment folder created in Pre-Deploy step 1.' },
    ]
  },
  {
    id: 'landing', label: 'Landing Page & Distribution', icon: 'ti-world-upload', color: '#ec4899',
    steps: [
      { id: 'lp-1', text: 'Upload both installers to the hosting/storage location (Supabase Storage, S3, or GitHub Releases).' },
      { id: 'lp-2', text: 'Update <strong>download links</strong> in <code>landing/index.html</code> to point to the new installers.' },
      { id: 'lp-3', text: 'Update any version number or release date shown on the landing page.' },
      { id: 'lp-4', text: 'Commit and push the landing page — confirm Vercel auto-deploys successfully.' },
      { id: 'lp-5', text: 'Verify live <strong>Mac download link</strong> end-to-end: click → download → install → launch.' },
      { id: 'lp-6', text: 'Verify live <strong>Windows download link</strong> end-to-end.' },
    ]
  },
  {
    id: 'release', label: 'Release & Post-Deploy', icon: 'ti-tag', color: '#f59e0b',
    steps: [
      { id: 'rel-1', text: 'Create a Git release tag: <code>git tag v1.x.x && git push origin v1.x.x</code>' },
      { id: 'rel-2', text: 'Create a <strong>GitHub Release</strong> from the tag — attach both installers, paste the changelog as release notes.' },
      { id: 'rel-3', text: 'Smoke test from the live site: download from <code>jumpkit.app</code>, install, create account, confirm email, log in, upgrade subscription.' },
      { id: 'rel-4', text: 'Update JUMPKIT_DOCS.html with final release date, version, commit ID, installer filenames, and deployment notes.' },
    ]
  },
];

const DEPLOY_STATE_KEY  = 'jk_deploy_state';
const DEPLOY_CONFIG_KEY = 'jk_deploy_config';

function _loadDeployConfig() {
  try { return JSON.parse(localStorage.getItem(DEPLOY_CONFIG_KEY) || '{}'); } catch(_) { return {}; }
}
function _saveDeployConfig(cfg) {
  try { localStorage.setItem(DEPLOY_CONFIG_KEY, JSON.stringify(cfg)); } catch(_) {}
}

function _loadDeployState() {
  try { return JSON.parse(localStorage.getItem(DEPLOY_STATE_KEY) || '{}'); } catch(_) { return {}; }
}
function _saveDeployState(state) {
  try { localStorage.setItem(DEPLOY_STATE_KEY, JSON.stringify(state)); } catch(_) {}
}

function _deployTotals(state) {
  const total = DEPLOY_PHASES.reduce((n, p) => n + p.steps.length, 0);
  const done  = Object.values(state).filter(v => v === 'completed').length;
  return { total, done };
}

window.renderDeployment = function renderDeployment() {
  const pageContent = document.getElementById('pageContent');

  if (window._supabaseProfile?.role !== 'admin') {
    pageContent.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px">
        <svg class="ti ti-lock" style="font-size:3rem;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-lock"/></svg>
        <h2 style="font-size:1.4rem;font-weight:700;color:var(--text)">403 — Access Restricted</h2>
        <p style="color:var(--text-muted);font-size:0.9rem">This page is only available to administrators.</p>
      </div>`;
    return;
  }

  const state = _loadDeployState();
  const { total, done } = _deployTotals(state);

  // Build section HTML
  const sectionsHTML = DEPLOY_PHASES.map((phase, pi) => {
    const sectionId = `deploy-section-${phase.id}`;
    const chevronId = `deploy-chevron-${phase.id}`;
    const phaseTotal = phase.steps.length;
    const phaseDone  = phase.steps.filter(s => state[s.id] === 'completed').length;

    const pillHTML = `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px">${
      phaseDone > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:0.7rem;font-weight:700;background:rgba(63,190,113,0.15);color:#3fbe71"><svg style="width:.65rem;height:.65rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>${phaseDone}</span>` : ''
    }${
      (phaseTotal - phaseDone) > 0 ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 7px;border-radius:99px;font-size:0.7rem;font-weight:700;background:#6b728022;color:#6b7280">${phaseTotal - phaseDone} To Do</span>` : ''
    }</span>`;

    const stepsHTML = phase.steps.map((step, si) => {
      const isDone = state[step.id] === 'completed';
      const isLast = si === phase.steps.length - 1;
      const rowBg    = isDone ? 'background:rgba(63,190,113,0.04)' : '';
      const rowBorder = isLast ? '' : 'border-bottom:1px solid var(--border);';
      return `
        <tr id="deploy-row-${step.id}" style="${rowBorder}${rowBg};transition:background .15s">
          <td style="padding:10px 12px;color:var(--text-dim);font-size:0.78rem;font-weight:600;white-space:nowrap;vertical-align:middle;width:60px">#${pi + 1}.${si + 1}</td>
          <td style="padding:10px 12px;font-size:0.86rem;color:var(--text-muted);line-height:1.55;vertical-align:middle" id="deploy-text-${step.id}">${step.text}</td>
          <td style="padding:10px 12px;text-align:right;white-space:nowrap;vertical-align:middle;width:130px">
            <button
              class="btn btn-subtle"
              data-deploy-id="${step.id}"
              data-deploy-action="toggle"
              style="font-size:0.78rem;padding:4px 12px;gap:5px;display:inline-flex;align-items:center;${isDone ? 'color:#3fbe71;border-color:rgba(63,190,113,0.3)' : ''}">
              ${isDone
                ? `<svg class="ti ti-check" style="width:.8rem;height:.8rem;color:#3fbe71"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Done`
                : `<svg class="ti ti-clipboard-list" style="width:.8rem;height:.8rem"><use href="img/tabler-sprite.svg#tabler-clipboard-list"/></svg> To Do`
              }
            </button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div style="margin-bottom:28px">
        <div style="padding:14px 4px 0;cursor:pointer;user-select:none" data-deploy-toggle-section="${sectionId}">
          <div style="display:flex;align-items:center;gap:8px">
            <svg class="ti ti-chevron-down" id="${chevronId}" style="font-size:1rem;color:var(--text-muted);transition:transform .2s;transform:rotate(-90deg)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
            <svg class="ti ${phase.icon}" style="font-size:1.1rem;color:var(--text-muted);flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-${phase.icon.slice(3)}"/></svg>
            <span style="font-size:0.8rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)">${phase.label}</span>
            <span style="font-size:0.75rem;color:var(--text-dim);font-weight:500">(${phaseTotal})</span>
            ${pillHTML}
          </div>
        </div>
        <div id="${sectionId}" style="overflow:hidden;transition:max-height .25s ease;margin-left:26px;max-height:0px" data-collapsed="true">
          <div class="card" style="overflow-x:auto;padding:0;border-radius:0 0 var(--radius-lg) var(--radius-lg);margin-top:6px">
            <table style="width:100%;border-collapse:collapse">
              ${stepsHTML}
            </table>
          </div>
        </div>
      </div>`;
  }).join('');

  pageContent.innerHTML = `
    <div id="pageDeployment" style="display:flex;flex-direction:column;height:100%">
      <div style="flex-shrink:0;background:var(--bg);padding:16px 24px 12px 24px;display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;border-bottom:1px solid var(--border)">
        <div style="padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);display:inline-flex;align-items:center;gap:0">
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:#3fbe71">${done}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Done</div></div>
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${total - done}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">To Do</div></div>
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${total}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Total</div></div>
        </div>
        <button class="btn btn-subtle" id="deployResetBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-rotate" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.svg#tabler-rotate"/></svg> Reset All
        </button>
        <button class="btn btn-subtle" id="deployManageBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-adjustments" style="font-size:1.15rem"><use href="img/tabler-sprite.svg#tabler-adjustments"/></svg> Manage Deployment
        </button>
        <button class="btn btn-subtle" id="deploySaveBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-file-download" style="font-size:1.15rem"><use href="img/tabler-sprite.svg#tabler-file-download"/></svg> Save Results
        </button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px 24px 24px 24px">
        ${sectionsHTML}
      </div>
    </div>`;

  // Wire toggle buttons
  pageContent.querySelectorAll('[data-deploy-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deployId;
      const state = _loadDeployState();
      const nowDone = state[id] !== 'completed';
      state[id] = nowDone ? 'completed' : 'todo';
      _saveDeployState(state);
      // Capture which sections are expanded before re-render
      const openSections = new Set();
      pageContent.querySelectorAll('[id^="deploy-section-"]').forEach(sec => {
        if (sec.dataset.collapsed !== 'true') openSections.add(sec.id);
      });
      renderDeployment();
      // Restore expanded sections after re-render
      openSections.forEach(secId => {
        const sec  = document.getElementById(secId);
        const chev = document.getElementById(secId.replace('deploy-section-', 'deploy-chevron-'));
        if (sec)  { sec.style.maxHeight = '2000px'; sec.dataset.collapsed = 'false'; }
        if (chev) chev.style.transform = 'rotate(0deg)';
      });
    });
  });

  // Wire manage button
  document.getElementById('deployManageBtn')?.addEventListener('click', _openDeployManageModal);
  document.getElementById('deploySaveBtn')?.addEventListener('click', _saveDeployResults);

  // Wire section collapse toggles
  pageContent.querySelectorAll('[data-deploy-toggle-section]').forEach(header => {
    header.addEventListener('click', () => {
      const secId  = header.dataset.deployToggleSection;
      const sec    = document.getElementById(secId);
      const chev   = document.getElementById(secId.replace('deploy-section-', 'deploy-chevron-'));
      if (!sec) return;
      const isCollapsed = sec.dataset.collapsed === 'true';
      if (isCollapsed) {
        sec.style.maxHeight = '2000px';
        sec.dataset.collapsed = 'false';
        if (chev) chev.style.transform = 'rotate(0deg)';
      } else {
        sec.style.maxHeight = '0px';
        sec.dataset.collapsed = 'true';
        if (chev) chev.style.transform = 'rotate(-90deg)';
      }
    });
  });

  // Wire reset button
  document.getElementById('deployResetBtn')?.addEventListener('click', () => {
    if (!confirm('Reset all deployment steps to "To Do"?')) return;
    _saveDeployState({});
    renderDeployment();
  });
};

// ── Manage Deployment Modal ───────────────────────────────────────
async function _openDeployManageModal() {
  // Fetch deployments from Supabase
  let deployments = [];
  let fetchError = null;
  try {
    const { data, error } = await supabaseClient
      .from('deployments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) fetchError = error.message;
    else deployments = data || [];
  } catch(e) {
    fetchError = e.message;
    console.warn('[Deployments] Fetch failed:', e.message);
  }

  // If fetch failed, show error state and bail
  if (fetchError) {
    Modal.open(
      '<svg class="ti ti-adjustments" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.svg#tabler-adjustments"/></svg> Manage Deployment',
      `<div style="text-align:center;padding:24px">
        <svg class="ti ti-alert-circle" style="font-size:2rem;color:#e15b59;margin-bottom:12px"><use href="img/tabler-sprite.svg#tabler-alert-circle"/></svg>
        <p style="margin:0 0 8px;font-weight:600;color:var(--text)">Could not load deployments</p>
        <p style="margin:0;font-size:0.85rem;color:var(--text-muted)">${fetchError}</p>
      </div>`,
      '<button class="btn btn-subtle" data-jaction="modal-close">Close</button>',
      'lg'
    );
    return;
  }

  // If no deployments yet, show helpful empty state
  if (deployments.length === 0) {
    Modal.open(
      '<svg class="ti ti-adjustments" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.svg#tabler-adjustments"/></svg> Manage Deployment',
      `<div style="text-align:center;padding:32px 24px">
        <svg class="ti ti-rocket" style="font-size:2.5rem;color:var(--text-dim);margin-bottom:16px"><use href="img/tabler-sprite.svg#tabler-rocket"/></svg>
        <p style="margin:0 0 8px;font-size:1rem;font-weight:700;color:var(--text)">No deployments yet</p>
        <p style="margin:0;font-size:0.88rem;color:var(--text-muted);line-height:1.6">Finalize a testing session first to create a deployment record.<br>Go to <strong style="color:var(--text)">Testing &rarr; Manage Testing</strong> and click <strong style="color:var(--text)">Finalize Testing &amp; Prepare Deployment</strong>.</p>
      </div>`,
      '<button class="btn btn-subtle" data-jaction="modal-close">Got it</button>',
      'lg'
    );
    return;
  }

  const inputStyle = 'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:0.88rem;outline:none';
  const labelStyle = 'display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:6px';
  const selectStyle = inputStyle + ';cursor:pointer';

  const selectedId = window._jkSelectedDeployment?.id || '';

  const optionsHTML = deployments.map(d => {
        const date = new Date(d.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
        const label = `v${d.version} — ${date} (${d.testing_account || 'unknown'}) [${d.status}]`;
        return `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${label}</option>`;
      }).join('');

  const sel = deployments.find(d => d.id === selectedId) || deployments[0] || null;

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div>
        <label style="${labelStyle}">Testing Package</label>
        <select id="dmDeploySelect" style="${selectStyle}">
          ${optionsHTML}
        </select>
        <p style="margin:5px 0 0;font-size:0.78rem;color:var(--text-muted)">Select the finalized testing session for this deployment. Version and folder are auto-applied.</p>
      </div>
      ${sel ? `<div style="padding:10px 14px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border);font-size:0.82rem;color:var(--text-muted)">
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <span><strong style="color:var(--text)">Version:</strong> v${sel.version}</span>
          <span><strong style="color:var(--text)">Tests:</strong> ${sel.tests_passed ?? '—'}✓ ${sel.tests_failed ?? '—'}✗ ${sel.tests_skipped ?? '—'} skipped</span>
          <span><strong style="color:var(--text)">OS:</strong> ${sel.test_os || '—'}</span>
          <span><strong style="color:var(--text)">Folder:</strong> ${sel.deployment_folder ? sel.deployment_folder.split('/').pop() : '—'}</span>
          <span><strong style="color:var(--text)">Status:</strong> ${sel.status || '—'}</span>
        </div>
      </div>` : ''}
      <div>
        <label style="${labelStyle}">Mac Installer Path (optional)</label>
        <input id="dmMacFile" type="text" placeholder="Path to the .dmg installer file…" value="${_esc(sel?.mac_installer_path || '')}" style="${inputStyle}" />
      </div>
      <div>
        <label style="${labelStyle}">Windows Installer Path (optional)</label>
        <input id="dmWinFile" type="text" placeholder="Path to the .exe or .msi installer file…" value="${_esc(sel?.win_installer_path || '')}" style="${inputStyle}" />
      </div>
      <div>
        <label style="${labelStyle}">Notes (optional)</label>
        <textarea id="dmNotes" placeholder="Any release notes or deployment notes…" rows="3" style="${inputStyle};resize:vertical">${_esc(sel?.notes || '')}</textarea>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-subtle" data-jaction="modal-close">Cancel</button>
    <button id="dmFinalizeBtn" class="btn" style="background:#f97316;border-color:#f97316;color:#fff;min-width:160px">
      <svg class="ti ti-rocket" style="width:.9rem;height:.9rem"><use href="img/tabler-sprite.svg#tabler-rocket"/></svg> Finalize Deployment
    </button>
    <button id="dmSaveBtn" class="btn btn-primary" style="min-width:100px">Save</button>`;

  // Re-open modal with full content
  Modal.open(
    '<svg class="ti ti-adjustments" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.svg#tabler-adjustments"/></svg> Manage Deployment',
    body, footer, 'xl'
  );

  // On dropdown change, re-open modal with new selection
  document.getElementById('dmDeploySelect')?.addEventListener('change', (e) => {
    const chosen = deployments.find(d => d.id === e.target.value);
    if (chosen) { window._jkSelectedDeployment = chosen; _openDeployManageModal(); }
  });

  // Set selected deployment on load
  if (sel && !window._jkSelectedDeployment) window._jkSelectedDeployment = sel;

  // Save (installer paths + notes)
  const _el_dmSaveBtn = document.getElementById('dmSaveBtn'); if (_el_dmSaveBtn) _el_dmSaveBtn.onclick = async () => {
    const selId = document.getElementById('dmDeploySelect')?.value;
    if (!selId) return Modal.close();
    const macFile = document.getElementById('dmMacFile').value.trim();
    const winFile = document.getElementById('dmWinFile').value.trim();
    const notes   = document.getElementById('dmNotes').value.trim();
    await supabaseClient.from('deployments').update({ mac_installer_path: macFile, win_installer_path: winFile, notes }).eq('id', selId);
    // Update local selected
    if (window._jkSelectedDeployment?.id === selId) {
      window._jkSelectedDeployment = { ...window._jkSelectedDeployment, mac_installer_path: macFile, win_installer_path: winFile, notes };
    }
    Modal.close();
    window.Toast?.success('Deployment info saved.');
  };

  // Finalize Deployment
  const _el_dmFinalizeBtn = document.getElementById('dmFinalizeBtn'); if (_el_dmFinalizeBtn) _el_dmFinalizeBtn.onclick = async () => {
    const selId = document.getElementById('dmDeploySelect')?.value;
    if (!selId) { alert('Please select a testing package first.'); return; }

    // Fetch latest commit ID
    let commitId = '';
    let commitMsg = '';
    if (window.electronAPI?.getLatestCommitId) {
      const result = await window.electronAPI.getLatestCommitId();
      if (!result?.error) { commitId = result.commitId || ''; commitMsg = result.message || ''; }
    }

    const macFile = document.getElementById('dmMacFile').value.trim();
    const winFile = document.getElementById('dmWinFile').value.trim();
    const notes   = document.getElementById('dmNotes').value.trim();
    const account = window._supabaseUser?.email || '';

    // Show confirmation modal
    Modal.open(
      '<svg class="ti ti-rocket" style="vertical-align:middle;margin-right:6px;color:#f97316"><use href="img/tabler-sprite.svg#tabler-rocket"/></svg> Finalize Deployment',
      `<div style="display:flex;flex-direction:column;gap:14px">
        <p style="margin:0;color:var(--text-muted);font-size:0.88rem">This will mark the deployment as <strong style="color:#f97316">Deployed</strong> in Supabase and record the following:</p>
        <div style="padding:12px 14px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border);font-size:0.85rem;display:flex;flex-direction:column;gap:6px">
          <div><strong style="color:var(--text)">Commit ID:</strong> <code style="color:var(--turq)">${commitId || '(not found)'}</code> ${commitMsg ? `— ${commitMsg}` : ''}</div>
          <div><strong style="color:var(--text)">Deployed by:</strong> ${account}</div>
          <div><strong style="color:var(--text)">Deployed at:</strong> ${new Date().toLocaleString()}</div>
          ${macFile ? `<div><strong style="color:var(--text)">Mac installer:</strong> ${macFile.split('/').pop()}</div>` : ''}
          ${winFile ? `<div><strong style="color:var(--text)">Win installer:</strong> ${winFile.split('/').pop()}</div>` : ''}
        </div>
        <p style="margin:0;font-size:0.82rem;color:var(--text-muted)">This action cannot be undone. Confirm to finalize.</p>
      </div>`,
      `<button class="btn btn-subtle" data-jaction="modal-close">Cancel</button>
       <button id="dmConfirmFinalizeBtn" class="btn" style="background:#f97316;border-color:#f97316;color:#fff">Confirm Finalize Deployment</button>`,
      'lg'
    );

    document.getElementById('dmConfirmFinalizeBtn')?.addEventListener('click', async () => {
      const { error } = await supabaseClient.from('deployments').update({
        commit_id:           commitId,
        deployed_at:         new Date().toISOString(),
        deploy_account:      account,
        status:              'deployed',
        mac_installer_path:  macFile,
        win_installer_path:  winFile,
        notes,
        deploy_results_file: (window._jkSelectedDeployment?.deployment_folder
          ? window._jkSelectedDeployment.deployment_folder.replace(/[/\\]$/, '') + '/' + `JumpKit_Deployment_v${window._jkSelectedDeployment?.version}.html`
          : ''),
      }).eq('id', selId);

      if (error) {
        window.Toast?.danger('Failed to finalize: ' + error.message);
      } else {
        if (window._jkSelectedDeployment?.id === selId) {
          window._jkSelectedDeployment = { ...window._jkSelectedDeployment, status: 'deployed', commit_id: commitId };
        }
        Modal.close();
        window.Toast?.success('Deployment finalized! 🚀');
      }
    });
  };
}

function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Save Deploy Results ───────────────────────────────────────────
async function _saveDeployResults() {
  const sel = window._jkSelectedDeployment;
  const cfg = _loadDeployConfig();
  const version = sel?.version || cfg.version;
  const folder  = sel?.deployment_folder || cfg.folder;

  if (!version || !folder) {
    Modal.open(
      '<svg class="ti ti-alert-triangle" style="vertical-align:middle;margin-right:6px;color:#f59e0b"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg> Not Configured',
      `<p style="margin:0 0 10px">Please set a <strong>version number</strong> and <strong>deployment folder</strong> before saving.</p>
       <p style="margin:0;font-size:0.88rem;color:var(--text-muted)">Click <strong style="color:var(--text)">Manage Deployment</strong> to configure these.</p>`,
      '<button class="btn btn-primary" data-jaction="modal-close">Got it</button>',
      'sm'
    );
    return;
  }

  if (!window.electronAPI?.writeFileDirect) {
    alert('File I/O not available — not running in Electron.');
    return;
  }

  const state = _loadDeployState();
  const now   = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const total = DEPLOY_PHASES.reduce((n, p) => n + p.steps.length, 0);
  const done  = Object.values(state).filter(v => v === 'completed').length;

  const sectionsHtml = DEPLOY_PHASES.map((phase, pi) => {
    const rows = phase.steps.map((step, si) => {
      const isDone = state[step.id] === 'completed';
      const bg    = isDone ? 'background:#f0fdf4' : '';
      const color = isDone ? 'color:#16a34a' : 'color:#374151';
      const status = isDone
        ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:0.75rem;font-weight:700;background:#dcfce7;color:#16a34a;border:1px solid #bbf7d0">✓ Done</span>'
        : '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:0.75rem;font-weight:700;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb">To Do</span>';
      return `<tr style="border-bottom:1px solid #e5e7eb;${bg}">
        <td style="padding:8px 12px;font-size:0.75rem;font-weight:600;color:#9ca3af;white-space:nowrap">#${pi+1}.${si+1}</td>
        <td style="padding:8px 12px;font-size:0.85rem;${color};line-height:1.5">${step.text}</td>
        <td style="padding:8px 12px;text-align:right;white-space:nowrap">${status}</td>
      </tr>`;
    }).join('');
    const phaseDone = phase.steps.filter(s => state[s.id] === 'completed').length;
    return `<div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0 6px;border-bottom:2px solid #e5e7eb;margin-bottom:0">
        <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280">${_esc(phase.label)}</span>
        <span style="font-size:0.72rem;color:#9ca3af">${phaseDone}/${phase.steps.length}</span>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>JumpKit Deployment v${_esc(version)}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827;margin:0;padding:24px}
    .container{max-width:860px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    h1{font-size:1.4rem;font-weight:800;margin:0 0 4px}
    .meta{font-size:0.82rem;color:#6b7280;margin-bottom:24px}
    .summary{display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap}
    .stat{text-align:center;padding:10px 20px;border-radius:10px;border:1px solid #e5e7eb;min-width:80px}
    .stat-val{font-size:1.4rem;font-weight:900}
    .stat-lbl{font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-top:2px}
  </style>
</head>
<body>
<div class="container">
  <h1>JumpKit Deployment v${_esc(version)}</h1>
  <div class="meta">Saved ${dateStr} at ${timeStr}${(sel?.mac_results_file || cfg.macFile) ? ' &nbsp;|&nbsp; Mac: ' + _esc((sel?.mac_results_file || cfg.macFile).split('/').pop()) : ''}${(sel?.win_results_file || cfg.winFile) ? ' &nbsp;|&nbsp; Win: ' + _esc((sel?.win_results_file || cfg.winFile).split('/').pop()) : ''}</div>
  <div class="summary">
    <div class="stat"><div class="stat-val" style="color:#16a34a">${done}</div><div class="stat-lbl">Done</div></div>
    <div class="stat"><div class="stat-val" style="color:#6b7280">${total - done}</div><div class="stat-lbl">To Do</div></div>
    <div class="stat"><div class="stat-val" style="color:#374151">${total}</div><div class="stat-lbl">Total</div></div>
  </div>
  ${sectionsHtml}
</div>
</body>
</html>`;

  const sep      = folder.includes('\\') ? '\\' : '/';
  const fileName = `JumpKit_Deployment_v${version}.html`;
  const filePath = folder.replace(/[/\\]$/, '') + sep + fileName;

  try {
    const result = await window.electronAPI.writeFileDirect(filePath, html);
    if (result?.error) throw new Error(result.error);
    window.Toast?.success(`Saved: ${fileName}`);
  } catch (err) {
    alert(`Failed to save deployment results:\n${err.message}`);
  }
}
