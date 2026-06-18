// ── JumpKit Deployment Checklist Page ────────────────────────────
// Admin-only page for tracking pre-deploy steps across 6 phases.
// Step state (todo/completed) is persisted in localStorage under jk_deploy_state.

const DEPLOY_PHASES = [
  {
    id: 'predeploy', label: 'Pre-Deploy', icon: 'ti-folder-plus', color: '#64748b',
    steps: [
      { id: 'pd-1', text: 'Create a deployment folder at <code>Topics/JumpKit/app/deploy/</code> with the folder name in the format <code>vx.y.z_yyyy-mm-dd</code> (e.g. <code>v1.0.0_2026-06-18</code>). This folder will hold the final installers and release artifacts for this version.' },
    ]
  },
  {
    id: 'testing', label: 'Testing', icon: 'ti-test-pipe', color: '#3b82f6',
    steps: [
      { id: 'test-1', text: 'Run ALL unit tests on <strong>Mac</strong> — all auto tests pass, all manual tests verified.' },
      { id: 'test-2', text: 'Save Mac test results doc via <strong>Save Results</strong> in each section. Note the filename. Save the Mac test file to the deployment folder.' },
      { id: 'test-3', text: 'Run ALL unit tests on <strong>Windows</strong> — all Windows-applicable tests pass.' },
      { id: 'test-4', text: 'Save Windows test results doc. Note the filename. Save the Windows test file to the deployment folder.' },
    ]
  },
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

const DEPLOY_STATE_KEY = 'jk_deploy_state';

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
      (phaseTotal - phaseDone) > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:0.7rem;font-weight:700;background:var(--bg-input);color:var(--text-dim)">${phaseTotal - phaseDone} to do</span>` : ''
    }</span>`;

    const stepsHTML = phase.steps.map((step, si) => {
      const isDone = state[step.id] === 'completed';
      const isLast = si === phase.steps.length - 1;
      const rowBg  = isDone ? 'background:rgba(63,190,113,0.04)' : '';
      const textOp = isDone ? 'opacity:0.45' : '';
      const rowBorder = isLast ? '' : 'border-bottom:1px solid var(--border);';
      return `
        <tr id="deploy-row-${step.id}" style="${rowBorder}${rowBg}">
          <td style="padding:10px 12px;color:var(--text-dim);font-size:0.78rem;font-weight:600;white-space:nowrap;vertical-align:middle;width:60px">#${pi + 1}.${si + 1}</td>
          <td style="padding:10px 12px;font-size:0.86rem;color:var(--text-muted);line-height:1.55;vertical-align:middle;${textOp}" id="deploy-text-${step.id}">${step.text}</td>
          <td style="padding:10px 12px;text-align:right;white-space:nowrap;vertical-align:middle;width:130px">
            <button
              class="btn ${isDone ? '' : 'btn-subtle'}"
              data-deploy-id="${step.id}"
              data-deploy-action="toggle"
              style="font-size:0.78rem;padding:4px 12px;gap:5px;display:inline-flex;align-items:center;${isDone ? 'background:#3fbe71;border-color:#3fbe71;color:#fff' : ''}">
              ${isDone
                ? `<svg class="ti ti-check" style="width:.8rem;height:.8rem;color:inherit"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Completed`
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
            <svg class="ti ${phase.icon}" style="font-size:1.1rem;color:${phase.color}"><use href="img/tabler-sprite.svg#${phase.icon.slice(3)}"/></svg>
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
    <div style="padding:16px 24px 24px 24px;">
      <div style="display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;margin-bottom:20px">
        <div style="padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);display:inline-flex;align-items:center;gap:0">
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:#3fbe71">${done}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Completed</div></div>
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${total - done}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">To Do</div></div>
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${total}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Total</div></div>
        </div>
        <button class="btn btn-subtle" id="deployResetBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-rotate" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.svg#tabler-rotate"/></svg> Reset All
        </button>
      </div>
      ${sectionsHTML}
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
      renderDeployment(); // re-render to update pills + progress
    });
  });

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
