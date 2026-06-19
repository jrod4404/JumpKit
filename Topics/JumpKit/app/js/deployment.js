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
      { id: 'cv-6', text: 'Update <strong>landing page</strong>: bump the version number display and update both download URLs in <code>landing/index.html</code> to point to the new GitHub release assets. Verify the URLs follow the pattern <code>releases/download/vX.Y.Z/JumpKit-X.Y.Z-universal.dmg</code> and <code>releases/download/vX.Y.Z/JumpKit.Setup.X.Y.Z.exe</code>.' },
      { id: 'cv-7', text: 'Commit the version bump + changelog. Push to GitHub.' },
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
      { id: 'bl-0', text: '<strong>Verify admin file exclusions are correct</strong> before building — run pre-flight unit test <strong>#379</strong> from the Testing page. It reads <code>package.json</code> and confirms <code>!js/tests.js</code>, <code>!js/deployment.js</code>, and <code>!js/admin.js</code> are all in <code>build.files</code>. Do not build if #379 fails.' },
      { id: 'bl-1', text: 'On Mac: run the production build command. Admin files are excluded automatically via <code>package.json</code>.', cmd: 'npm run build' },
      { id: 'bl-2', text: 'Confirm Mac build completes without errors and the <code>.dmg</code> is notarized by Apple. Verify notarization with:', cmd: 'spctl -a -vvv -t install dist/JumpKit-*.dmg' },
      { id: 'bl-3', text: 'Test Mac installer: install from the <code>.dmg</code> on a clean Mac, launch, log in, do a few jumps. Confirm the startup guard does <strong>not</strong> show an error dialog (would mean admin files leaked into the build).' },
      { id: 'bl-4', text: 'On Windows: run the production Windows build command. Admin files are excluded automatically.', cmd: 'npm run build:win' },
      { id: 'bl-5', text: 'Confirm Windows build completes without errors.' },
      { id: 'bl-6', text: 'Test Windows installer: install and launch on a clean Windows machine, log in, do a few jumps. Confirm no admin error dialog on startup.' },
      { id: 'bl-7', text: 'Check installer file sizes. Expected ranges: Mac <code>.dmg</code> ~80–120 MB, Windows <code>.exe</code> ~60–90 MB. A dramatically smaller file (e.g. under 20 MB) means files were accidentally excluded from the asar — do not ship.', cmd: 'ls -lh dist/*.dmg dist/*.exe 2>/dev/null || ls -lh dist/' },
      { id: 'bl-9', text: 'Note both installer filenames and file sizes. Save both installers into the deployment folder created in Pre-Deploy step 1.' },
      { id: 'bl-8', text: '<strong>If building a test installer</strong> (for release testing with admin pages included), use the test build commands instead:', cmd: 'npm run build:test      # Mac test build
npm run build:test:win   # Windows test build' },
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
      { id: 'rel-3', text: 'Smoke test from the live site: download from <code>jumpkit.app</code>, install, create account, confirm email, log in, upgrade subscription, add a jump, confirm it launches.' },
      { id: 'rel-4', text: 'Update JUMPKIT_DOCS.html with final release date, version, commit ID, installer filenames, and deployment notes.' },
      { id: 'rel-5', text: '<strong>Rollback plan</strong> (if a critical bug is found post-ship): (1) Revert the landing page download URLs back to the previous version’s GitHub release assets and redeploy via Vercel. (2) Delete or unpublish the new GitHub Release so the auto-updater stops offering it. (3) Document the incident in JUMPKIT_DOCS.html changelog. (4) Fix the bug, re-run the full test cycle, and re-release.' },
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

// ── View state for checklist / all-deployments toggle ──────────
let _deployCurrentView = 'checklist'; // 'checklist' | 'history'

window.renderDeployment = function renderDeployment(view) {
  if (view) _deployCurrentView = view;
  if (_deployCurrentView === 'history') { _renderDeployHistory(); return; }
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
          <td style="padding:10px 12px;font-size:0.86rem;color:var(--text-muted);line-height:1.55;vertical-align:middle" id="deploy-text-${step.id}">
              ${step.text}
              ${step.cmd ? `<div style="margin-top:7px;display:flex;align-items:stretch;gap:0;border:1px solid var(--border);border-radius:7px;overflow:hidden;max-width:480px">
                <code style="flex:1;padding:5px 10px;font-size:0.8rem;background:var(--bg-card);color:var(--text);white-space:pre;overflow-x:auto;line-height:1.5">${step.cmd}</code>
                <button data-deploy-copy="${step.id}" title="Copy command" style="flex-shrink:0;border:none;border-left:1px solid var(--border);background:var(--bg-card);cursor:pointer;padding:0 10px;color:var(--text-muted);display:flex;align-items:center;transition:background .15s" onmouseenter="this.style.background='var(--bg)'" onmouseleave="this.style.background='var(--bg-card)'">
                  <svg class="ti ti-copy" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.svg#tabler-copy"/></svg>
                </button>
              </div>` : ''}
            </td>
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
        <div id="activeRunToggle" style="margin-left:auto;display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0;background:var(--bg-card);box-shadow:0 1px 3px rgba(0,0,0,.06)">
          <button id="deployTabChecklist" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;font-size:0.78rem;letter-spacing:.02em;transition:all .15s;${_deployCurrentView==='checklist'?'background:rgba(13,148,136,0.12);color:#0d9488;font-weight:700':'background:transparent;color:var(--text-muted);font-weight:600'}">
            <svg class="ti ti-checklist" style="width:1.05rem;height:1.05rem;flex-shrink:0;${_deployCurrentView==='checklist'?'color:#0d9488':'color:var(--text-muted)'}"><use href="img/tabler-sprite.svg#tabler-checklist"/></svg>
            Checklist
          </button>
          <button id="deployTabHistory" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;font-size:0.78rem;letter-spacing:.02em;transition:all .15s;${_deployCurrentView==='history'?'background:rgba(13,148,136,0.12);color:#0d9488;font-weight:700':'background:transparent;color:var(--text-muted);font-weight:600'}">
            <svg class="ti ti-world-upload" style="width:1.05rem;height:1.05rem;flex-shrink:0;${_deployCurrentView==='history'?'color:#0d9488':'color:var(--text-muted)'}"><use href="img/tabler-sprite.svg#tabler-world-upload"/></svg>
            All Deployments
          </button>
        </div>
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

  // Wire view toggle tabs
  document.getElementById('deployTabChecklist')?.addEventListener('click', () => renderDeployment('checklist'));
  document.getElementById('deployTabHistory')?.addEventListener('click', () => renderDeployment('history'));

  // Wire copy buttons on steps with commands
  pageContent.querySelectorAll('[data-deploy-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stepId = btn.getAttribute('data-deploy-copy');
      const step   = DEPLOY_PHASES.flatMap(p => p.steps).find(s => s.id === stepId);
      if (!step?.cmd) return;
      navigator.clipboard.writeText(step.cmd).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg class="ti ti-check" style="width:.85rem;height:.85rem;color:#3fbe71"><use href="img/tabler-sprite.svg#tabler-check"/></svg>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }).catch(() => {});
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

// ── All Deployments History View ─────────────────────────────────
async function _renderDeployHistory() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent) return;

  const state = _loadDeployState();
  const { total, done } = _deployTotals(state);

  // Shared header (same as checklist view)
  const headerHTML = `
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
      <div id="activeRunToggle" style="margin-left:auto;display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0;background:var(--bg-card);box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <button id="deployTabChecklist" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-size:0.78rem;font-weight:600;letter-spacing:.02em;transition:all .15s">
          <svg class="ti ti-checklist" style="width:1.05rem;height:1.05rem;flex-shrink:0;color:var(--text-muted)"><use href="img/tabler-sprite.svg#tabler-checklist"/></svg>
          Checklist
        </button>
        <button id="deployTabHistory" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:rgba(13,148,136,0.12);color:#0d9488;font-size:0.78rem;font-weight:700;letter-spacing:.02em;transition:all .15s">
          <svg class="ti ti-world-upload" style="width:1.05rem;height:1.05rem;flex-shrink:0;color:#0d9488"><use href="img/tabler-sprite.svg#tabler-world-upload"/></svg>
          All Deployments
        </button>
      </div>
    </div>`;

  pageContent.innerHTML = `
    <div id="pageDeployment" style="display:flex;flex-direction:column;height:100%">
      ${headerHTML}
      <div style="flex:1;overflow-y:auto;padding:20px 24px 32px 24px">
        <div class="stats-chart-box" style="min-height:unset;overflow-x:auto">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">All Deployments</div>
            <div class="jump-search-wrap">
              <svg class="ti ti-search jump-search-icon"><use href="img/tabler-sprite.svg#tabler-search"/></svg>
              <input id="deployHistSearch" type="text" placeholder="Search deployments..." class="jump-search-input" style="width:210px" />
            </div>
          </div>
          <div id="deployHistTableWrap">
            <div style="padding:32px;text-align:center;color:var(--text-dim)">
              <svg class="ti ti-loader-2" style="font-size:1.6rem;animation:spin 1s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg>
              <div style="margin-top:10px;font-size:0.85rem">Loading deployments…</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // Wire header buttons (same as checklist view)
  document.getElementById('deployManageBtn')?.addEventListener('click', _openDeployManageModal);
  document.getElementById('deploySaveBtn')?.addEventListener('click', _saveDeployResults);
  document.getElementById('deployTabChecklist')?.addEventListener('click', () => renderDeployment('checklist'));
  document.getElementById('deployTabHistory')?.addEventListener('click', () => renderDeployment('history'));
  document.getElementById('deployResetBtn')?.addEventListener('click', () => {
    if (!confirm('Reset all deployment steps to "To Do"?')) return;
    _saveDeployState({});
    renderDeployment();
  });

  // Fetch all deployments from Supabase
  let deployments = [];
  try {
    const { data, error } = await supabaseClient
      .from('deployments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    deployments = data || [];
  } catch (err) {
    document.getElementById('deployHistTableWrap').innerHTML =
      `<div style="padding:24px;text-align:center;color:var(--text-dim)">Failed to load deployments: ${err.message}</div>`;
    return;
  }

  // Status pill helper
  const _statusPill = (s) => {
    if (s === 'deployed')            return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:rgba(63,190,113,0.15);color:#3fbe71">Deployed</span>`;
    if (s === 'testing_complete')    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:rgba(99,102,241,0.15);color:#6366f1">Testing Complete</span>`;
    if (s === 'testing_in_progress') return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b">In Progress</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:var(--bg-input);color:var(--text-dim)">${s || '—'}</span>`;
  };

  // Check helper
  const _check = (v) => v ? `<svg class="ti ti-check" style="color:#3fbe71;font-size:0.9rem"><use href="img/tabler-sprite.svg#tabler-check"/></svg>` : `<span style="color:var(--text-dim)">—</span>`;
  const _fmt = (v) => v ? new Date(v).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
  const _score = (p, t) => (t > 0) ? `${p}/${t}` : '—';

  const buildRow = (d) => `<tr style="border-bottom:1px solid var(--border)">
    <td style="padding:10px 12px;font-size:0.86rem;font-weight:700;color:var(--text);white-space:nowrap">${d.version || '—'}</td>
    <td style="padding:10px 12px">${_statusPill(d.status)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_check(d.mac_finalized_at)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_score(d.mac_tests_passed, d.mac_tests_total)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_check(d.win_finalized_at)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_score(d.win_tests_passed, d.win_tests_total)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);white-space:nowrap">${_fmt(d.mac_finalized_at || d.win_finalized_at || d.created_at)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);white-space:nowrap">${_fmt(d.deployed_at || d.testing_completed_at)}</td>
    <td style="padding:10px 12px;font-size:0.78rem;color:var(--text-dim);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(d.notes||'').replace(/"/g,'&quot;')}">${d.notes || '—'}</td>
  </tr>`;

  const tableHTML = `
    <table id="deployHistTable" style="width:100%;border-collapse:collapse;min-width:860px">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th data-col="version"          style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Version<span class="sort-ind"> ↕</span></th>
          <th data-col="status"           style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Status<span class="sort-ind"> ↕</span></th>
          <th data-col="mac_finalized_at" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:center;cursor:pointer;user-select:none">Mac Done<span class="sort-ind"> ↕</span></th>
          <th style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:center">Mac Score</th>
          <th data-col="win_finalized_at" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:center;cursor:pointer;user-select:none">Win Done<span class="sort-ind"> ↕</span></th>
          <th style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:center">Win Score</th>
          <th data-col="created_at"       style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Started<span class="sort-ind"> ↕</span></th>
          <th data-col="deployed_at"      style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Deployed<span class="sort-ind"> ↕</span></th>
          <th style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left">Notes</th>
        </tr>
      </thead>
      <tbody id="deployHistTbody">${deployments.map(buildRow).join('') || `<tr><td colspan="9" style="padding:32px;text-align:center;color:var(--text-dim)">No deployments found.</td></tr>`}</tbody>
    </table>`;

  document.getElementById('deployHistTableWrap').innerHTML = tableHTML;

  // Sort + search
  let _sortCol = 'created_at', _sortDir = -1, _searchQ = '';
  const _getVal = (d, col) => {
    if (col === 'version') return d.version || '';
    if (col === 'status')  return d.status || '';
    return d[col] ?? '';
  };
  const _rerender = () => {
    let data = [...deployments];
    if (_searchQ) {
      const q = _searchQ.toLowerCase();
      data = data.filter(d => ((d.version||'') + ' ' + (d.status||'') + ' ' + (d.notes||'')).toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      const va = _getVal(a, _sortCol), vb = _getVal(b, _sortCol);
      return va < vb ? _sortDir : va > vb ? -_sortDir : 0;
    });
    const tbody = document.getElementById('deployHistTbody');
    if (tbody) tbody.innerHTML = data.map(buildRow).join('') || `<tr><td colspan="9" style="padding:32px;text-align:center;color:var(--text-dim)">No matches.</td></tr>`;
    document.querySelectorAll('#deployHistTable th[data-col]').forEach(th => {
      const ind = th.querySelector('.sort-ind');
      if (ind) ind.textContent = th.dataset.col === _sortCol ? (_sortDir === -1 ? ' ▼' : ' ▲') : ' ↕';
    });
  };
  document.querySelectorAll('#deployHistTable th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      if (_sortCol === th.dataset.col) _sortDir *= -1;
      else { _sortCol = th.dataset.col; _sortDir = -1; }
      _rerender();
    });
  });
  const searchEl = document.getElementById('deployHistSearch');
  if (searchEl) searchEl.addEventListener('input', e => { _searchQ = e.target.value; _rerender(); });
}

// ── Manage Deployment Modal ───────────────────────────────────────
async function _openDeployManageModal() {
  // Fetch deployments from Supabase
  let deployments = [];
  let fetchError = null;
  try {
    const { data, error } = await supabaseClient
      .from('deployments')
      .select('*')
      .eq('status', 'testing_complete')
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
        <svg class="ti ti-world-upload" style="font-size:2.5rem;color:var(--text-dim);margin-bottom:16px"><use href="img/tabler-sprite.svg#tabler-world-upload"/></svg>
        <p style="margin:0 0 8px;font-size:1rem;font-weight:700;color:var(--text)">No deployments yet</p>
        <p style="margin:0;font-size:0.88rem;color:var(--text-muted);line-height:1.6">No completed testing sessions found. Both Mac and Windows testing must be finalized before a deployment record appears here.<br>Go to <strong style="color:var(--text)">Testing &rarr; Manage Testing</strong> to finalize both platform runs.</p>
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
        const label = `v${d.version} — ${date} [${d.status}]`;
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
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <span><strong style="color:var(--text)">Version:</strong> v${sel.version}</span>
          <span><strong style="color:var(--text)">Mac:</strong> ${sel.mac_finalized_at ? '✅ Finalized' : '⏳ Pending'} ${sel.mac_tests_passed != null ? `(${sel.mac_tests_passed}/${sel.mac_tests_total} passed)` : ''}</span>
          <span><strong style="color:var(--text)">Win:</strong> ${sel.win_finalized_at ? '✅ Finalized' : '⏳ Pending'} ${sel.win_tests_passed != null ? `(${sel.win_tests_passed}/${sel.win_tests_total} passed)` : ''}</span>
          <span><strong style="color:var(--text)">Status:</strong> ${sel.status || '—'}</span>
        </div>
      </div>` : ''}
      <div>
        <label style="${labelStyle}">Deployment Folder</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="dmDeployFolder" type="text" placeholder="Click Choose to pick the deployment folder…" value="${_esc((typeof _loadDeployConfig === 'function' ? _loadDeployConfig().folder : null) || sel?.deployment_folder || '')}" readonly style="${inputStyle};flex:1;cursor:default;color:var(--text-muted);font-size:0.82rem" />
          <button id="dmDeployFolderBtn" class="btn btn-subtle" style="white-space:nowrap;flex-shrink:0">Choose…</button>
        </div>
        <p style="margin:5px 0 0;font-size:0.78rem;color:var(--text-muted)">Deployment files will be saved here and linked to this record.</p>
      </div>
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

  // Wire deployment folder picker
  document.getElementById('dmDeployFolderBtn')?.addEventListener('click', async () => {
    if (!window.electronAPI?.openFileDialog) { alert('File picker not available outside Electron.'); return; }
    const result = await window.electronAPI.openFileDialog({ title: 'Select Deployment Folder', properties: ['openDirectory'] });
    if (!result?.canceled && result?.filePath) {
      const folder = result.filePath;
      document.getElementById('dmDeployFolder').value = folder;
      // Save to deploy config
      if (typeof _loadDeployConfig === 'function') {
        _saveDeployConfig({ ..._loadDeployConfig(), folder });
      }
      // Update Supabase record if one is selected
      const selId = document.getElementById('dmDeploySelect')?.value;
      if (selId) {
        await supabaseClient.from('deployments').update({ deployment_folder: folder }).eq('id', selId).catch(() => {});
      }
      window.Toast?.success('Deployment folder saved.');
    }
  });

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
      '<button class="btn btn-subtle" data-jaction="modal-close">Got it</button>',
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
  <div class="meta">Saved ${dateStr} at ${timeStr}${(sel?.results_file || cfg.resultsFilePath) ? ' &nbsp;|&nbsp; Results: ' + _esc((sel?.results_file || cfg.resultsFilePath || '').split('/').pop()) : ''}</div>
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
