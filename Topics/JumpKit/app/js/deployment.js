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
      { id: 'cv-0', text: '<strong>Confirm LemonSqueezy is in live (non-test) mode.</strong> Log in to <a href="https://app.lemonsqueezy.com" target="_blank">app.lemonsqueezy.com</a> → Settings → Store → confirm the store is in <strong>Live</strong> mode (not Test mode). Also verify the webhook URL points to the <strong>production</strong> Supabase edge function. Do not ship in test mode.' },
      { id: 'cv-1', text: 'Commit all outstanding changes with a clear release commit message. Open the step detail to copy the Max prompt.', auto: 'fetch-commit', cmd: 'Pls commit all outstanding changes in the JumpKit app directory with a clear release commit message, then run git log --oneline -1 and report back the final commit ID so I can record it in the changelog.', cmdModalOnly: true },
      { id: 'cv-3', text: 'Update <strong>version number</strong> in <code>app/package.json</code> (semver) and update any version display in the app UI or About page. Open the step detail to copy the Max prompt.', cmd: 'Pls check the current version in app/package.json and report what it is. Also check if there is a version display in the app UI or About page and report where it is. Do not change anything yet — just report what you find so I can confirm the new version number.', cmdModalOnly: true },
      { id: 'cv-5', text: 'Write a full <strong>changelog entry</strong> in JUMPKIT_DOCS.html — all changes, fixes, new features. Open the step detail to copy the Max prompt.', cmd: 'Pls review the recent git commits and the current state of the JumpKit app and draft a full changelog entry for the new release version. List all changes, fixes, and new features in plain English. Do not write to any files yet — just output the draft so I can review and approve it first.', cmdModalOnly: true },
      { id: 'cv-5a', text: 'Check and refresh <strong>JUMPKIT_DOCS.html</strong> documentation — verify all sections accurately reflect the current codebase. Open the step detail to copy the Max audit prompt. Then save a copy of JUMPKIT_DOCS.html into the deploy folder for this release (e.g. deploy/vX.Y.Z_YYYY-MM-DD/JUMPKIT_DOCS.html).', cmd: 'Please review the entire jumpkit app code base and the entire jumpkit_docs.html document and list out all updates and/or changes needed to correctly reflect the codebase in the html documentation file. Pls do not make any documentation changes but list out one by one which changes you would propose to make.', cmdModalOnly: true },
    ]
  },
  {
    id: 'backup', label: 'Backup', icon: 'ti-device-floppy', color: '#10b981',
    steps: [
      { id: 'bk-1', text: 'Create a dated code backup and note the filename in the changelog. Open the step detail to copy the Max prompt.', cmd: 'Pls do a dated full app backup (tar -czf) and save into the app_backups folder using the naming convention and exclusion below:\n\napp_backups/app_backup_YYYY-MM-DD.tar.gz --exclude=\'./app/node_modules\' ./app ./landing', cmdModalOnly: true },
      { id: 'bk-2', text: 'Confirm the backup saved correctly. Open the step detail to copy the Max prompt.', cmd: 'Pls confirm the most recent backup in the app_backups folder was saved correctly: list the file with its size (ls -lh app_backups/ | tail -5), then run a quick integrity check (tar -tzf <backup-filename> | head -20) and confirm no errors.', cmdModalOnly: true },
    ]
  },
  {
    id: 'build', label: 'Build Installers', icon: 'ti-package', color: '#f97316',
    steps: [
      { id: 'bl-0', text: '<strong>Verify admin file exclusions</strong> before building. Open the step detail to copy the Max prompt.', cmd: 'Pls check app/package.json and confirm that !js/tests.js, !js/deployment.js, and !js/admin.js are all present in the build.files exclusions array. Report exactly what you find — do not proceed with a build if any of these are missing.', cmdModalOnly: true },
      { id: 'bl-4-pre', text: '<strong>Verify Windows production build requirements in <code>package.json</code> before building.</strong> Open the step detail to copy the Max prompt.', cmd: 'Pls check app/package.json and confirm all of the following for the Windows production build:\n1. build.productName is exactly "JumpKit" (capital J and K)\n2. build.win.icon points to assets/icon.ico\n3. executableName is NOT set in the production config (must default to jumpkit)\n4. build.nsis.oneClick is true\nReport exactly what you find for each item.', cmdModalOnly: true },
      { id: 'bl-1', text: 'Run the Mac production build. Open the step detail to copy the Max prompts. <strong>Check file sizes and record below.</strong>', cmd: 'Pls run the JumpKit production Mac build from the app directory (npm run build) and report back: (1) whether it completed without errors, (2) the output .dmg filename(s) and file sizes, and (3) any warnings worth noting. And pls confirm the admin pages (users page, testing page, and deployments page) are excluded from the build since this is a production build.', cmd2: 'Pls copy the two built mac installers into the deploy folder below: app/deploy/vx.y.z/installers/prod', cmdModalOnly: true },
      { id: 'bl-2', text: 'Verify Mac .dmg notarization. Open the step detail to copy the Max prompt.', cmd: 'Pls verify the Mac .dmg is notarized by Apple by running: spctl -a -vvv -t install dist/JumpKit-*.dmg\nReport the full output. A passing result should show "accepted" with source "Notarized Developer ID".', cmdModalOnly: true },
      { id: 'bl-4', text: 'Run the Windows production build. Open the step detail to copy the Max prompts. <strong>Check file sizes and record below.</strong>', cmd: 'Pls run the JumpKit Windows production build from the app directory: npm run build:win\nReport back: (1) whether it completed without errors, (2) the output .exe filename and file size, (3) confirm the filename includes "JumpKit" (capital J+K) not "jumpkit", and (4) any warnings. And pls confirm the admin pages (users page, testing page, and deployments page) are excluded from the build since this is a production build.', cmd2: 'Pls copy the built win installer into the deploy folder below: app/deploy/vx.y.z/installers/prod', cmdModalOnly: true },
      { id: 'bl-8', text: '<strong>If building a test installer</strong> (for release testing with admin pages included), use the test build commands instead. <strong>Check file sizes and record below.</strong>', cmd: 'Pls build the macOS and Windows test installers ie installers which include the admin pages: Users, Testing, Deployments. After building, pls copy them into the folder below and report out the file names and file sizes.', cmdModalOnly: true },
      { id: 'bl-6', text: '<strong>Manual:</strong> Test Windows installer on a clean Windows machine — install, launch, log in, do a few jumps. Confirm: installer header shows "JumpKit Setup", desktop shortcut shows "JumpKit", no admin error on startup.' },
      { id: 'bl-3', text: '<strong>Manual:</strong> Test Mac installer on a clean Mac — install from the .dmg, launch, log in, do a few jumps. Confirm no admin error dialog on startup.' },
    ]
  },
  {
    id: 'landing', label: 'Landing Page & Distribution', icon: 'ti-world-upload', color: '#ec4899',
    steps: [
      { id: 'lp-0', text: 'Create Git release tag, publish GitHub Release, and upload installers. Open the step detail to copy the Max prompt.', cmd: 'Pls do the following in order for the JumpKit release:\n\n1. Check the current version in app/package.json and confirm the version number.\n2. Create a Git release tag for that version: git tag vX.Y.Z && git push origin vX.Y.Z — report the tag name and confirm the push succeeded.\n3. Find the built production installers in app/deploy/ (look for the most recent vX.Y.Z folder under installers/prod) and list the filenames and sizes.\n4. Using the GitHub CLI (gh release create), create a GitHub Release from that tag with the following:\n   - Title: JumpKit vX.Y.Z\n   - Attach ALL electron-builder output files: .dmg arm64, .dmg x64, .exe, latest-mac.yml, latest.yml, and the arm64-mac.zip. Do NOT skip the .yml and .zip — electron-updater requires them for auto-update to work without ERR_UPDATER_ZIP_FILE_NOT_FOUND\n   - Mark as latest release (not pre-release, not draft)\n   - For release notes, pull the most recent changelog entry from JUMPKIT_DOCS.html or CHANGELOG.md\n5. After creating the release, fetch https://api.github.com/repos/jrod4404/JumpKit/releases/latest and confirm: tag_name matches, draft=false, and assets include latest-mac.yml, arm64-mac.zip, and all installer files.\n6. Report the final GitHub release URL and confirm assets include: arm64.dmg, x64.dmg, .exe, latest-mac.yml, latest.yml, arm64-mac.zip. All are required for auto-update to work.\nNOTE: GitHub repo must remain PUBLIC — electron-updater has no embedded auth token, so private repos will silently fail to detect updates.', cmdModalOnly: true },
      { id: 'lp-2', text: 'Update landing page: download links, version number, and release date in <code>landing/index.html</code>. Open the step detail to copy the Max prompt.', cmd: 'Pls update landing/index.html with the following for the new release:\n1. Update both download URLs to point to the new GitHub release assets. Mac pattern: releases/download/vX.Y.Z/JumpKit-X.Y.Z-universal.dmg — Windows pattern: releases/download/vX.Y.Z/JumpKit.Setup.X.Y.Z.exe\n2. Update any version number or release date displayed on the landing page.\nReport exactly what you changed.', cmdModalOnly: true },
      { id: 'lp-2a', text: 'Update post-payment email download links in <code>app/emails/pending-upgrade-email.html</code> — ensure the Mac and Windows download URLs match the just-published GitHub release. Open the step detail to copy the Max prompt.', cmd: 'Pls check app/emails/pending-upgrade-email.html and update the two GitHub download links (Mac .dmg and Windows .exe) to point to the current release version. Steps:\n\n1. Read the file and find the two <a href> download buttons ("Download for macOS" and "Download for Windows").\n2. Fetch https://api.github.com/repos/jrod4404/JumpKit/releases/latest and get the current tag_name and the exact asset filenames for the .dmg and .exe.\n3. Update both href URLs in the email to use the correct release tag and filenames.\n4. Report the old URLs, the new URLs, and confirm the change was saved.\n\nThe correct URL pattern is: https://github.com/jrod4404/JumpKit/releases/download/vX.Y.Z/<filename>', cmdModalOnly: true },
      { id: 'lp-4', text: 'Commit and push landing page changes, then manually deploy to Vercel and alias both domains. Open the step detail to copy the Max prompt.', cmd: 'Pls do the following in order to publish the landing page:\n\n1. Commit and push the landing page changes to GitHub with a clear commit message (e.g. "Landing: update download links and version for vX.Y.Z"). Report the commit ID.\n\n2. Run the Vercel production deploy from the landing directory:\n   cd Topics/JumpKit/landing && vercel --prod\n   Note the new deployment URL from the output (e.g. https://jumpkit-landing-XXXXXXX-jeffroder-3196s-projects.vercel.app).\n\n3. Alias BOTH domains to the new deployment URL — www.jumpkit.app redirects to jumpkit.app, so both must be aliased or only jumpkit.app will update:\n   vercel alias set <deployment-url> jumpkit.app\n   vercel alias set <deployment-url> www.jumpkit.app\n\n4. Verify the live site is serving the new version by running:\n   curl -sL https://jumpkit.app | grep -o "JumpKit[^\'\"<]*\\.(dmg|exe)"\n   Confirm the output shows the new version filenames (e.g. v0.1.6), NOT the old version.\n\n5. Report the commit ID, the Vercel deployment URL, and confirm both alias commands succeeded.\n\nNote: Git-push-triggered Vercel auto-deploys do NOT automatically update the jumpkit.app domain alias — the manual vercel --prod + alias steps are always required.', cmdModalOnly: true },
      { id: 'lp-5', text: '<strong>Manual:</strong> Verify live Mac download end-to-end: click download link on jumpkit.app → download → install → launch.' },
      { id: 'lp-6', text: '<strong>Manual:</strong> Verify live Windows download end-to-end: click download link on jumpkit.app → download → install → launch.' },
    ]
  },
  {
    id: 'release', label: 'Post-Deploy', icon: 'ti-tag', color: '#f59e0b',
    steps: [
      { id: 'rel-0', text: '<strong>Create pseudo next release</strong> — create a throwaway GitHub release one version above the just-deployed release to verify the auto-update pipeline end-to-end before closing out the deployment. Open the step detail to copy the Max prompt.', cmd: 'Pls do the following to create a pseudo next release for auto-update testing:\n\nKEY REQUIREMENTS (learned from v0.1.6 test):\n- Version in latest-mac.yml must be plain X.Y.Z (no -test suffix) — electron-updater skips pre-release versions for stable users\n- GitHub release must be non-pre-release (--latest flag)\n- latest-mac.yml must include BOTH a .dmg AND a .zip entry — MacUpdater throws ERR_UPDATER_ZIP_FILE_NOT_FOUND without the zip\n- GitHub repo must be public — private repos return 404 to unauthenticated updater requests\n- Banner fix: update downloads silently, then banner appears in app — user clicks Restart & Update (does NOT auto-install silently)\n\nSTEPS:\n1. Determine pseudo version: current patch + 1, no suffix (e.g. 0.1.6 → 0.1.7).\n2. Update app/package.json version to pseudo version.\n3. Commit: git commit -am \"chore: pseudo release for auto-update testing vX.Y.Z\"\n4. Tag: git tag vX.Y.Z-test && git push origin vX.Y.Z-test\n5. Create zip of installed app: cd /Applications && zip -r /tmp/JumpKit-X.Y.Z-arm64-mac.zip JumpKit.app\n6. Get zip SHA512: openssl dgst -sha512 -binary /tmp/JumpKit-X.Y.Z-arm64-mac.zip | base64\n7. Get zip size: wc -c < /tmp/JumpKit-X.Y.Z-arm64-mac.zip\n8. Get DMG SHA512 from the real release installer.\n9. Write latest-mac.yml with version X.Y.Z listing both the .dmg and .zip entries with correct sha512+size.\n10. Create GitHub release (non-pre-release): gh release create vX.Y.Z-test --title \"JumpKit vX.Y.Z-test (pseudo)\" --notes \"Pseudo — auto-update test only. Will be deleted.\"\n11. Upload to release: latest-mac.yml, renamed .dmg, and .zip.\n12. Verify YAML reachable: curl -sL https://github.com/jrod4404/JumpKit/releases/latest/download/latest-mac.yml\n13. Quit and relaunch the installed production app. Wait ~60s for download. Banner should appear.\n14. Report: tag name, release URL, asset list, and whether banner appeared.\n\nCleanup after step 5.1 passes: revert package.json to real version, commit, push, delete pseudo tag and GitHub release.', cmdModalOnly: true },
      { id: 'rel-4a', text: '<strong>Auto-update E2E</strong> (Test #141): open the previously installed production build, wait up to 30 seconds for the "A new version of JumpKit is available" banner. Click <strong>Restart & Update</strong> and confirm the app relaunches at the new version.' },
      { id: 'rel-5', text: '<strong>Rollback plan</strong> (if a critical bug is found post-ship): (1) Revert landing page download URLs to the previous version and redeploy. (2) Unpublish the GitHub Release. (3) Document the incident in JUMPKIT_DOCS.html. (4) Fix, re-test, and re-release.' },
    ]
  },
];

const DEPLOY_STATE_KEY  = 'jk_deploy_state';
const DEPLOY_CONFIG_KEY = 'jk_deploy_config';
const DEPLOY_NOTES_KEY  = 'jk_deploy_notes';

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

function _loadDeployNotes() {
  try { return JSON.parse(localStorage.getItem(DEPLOY_NOTES_KEY) || '{}'); } catch(_) { return {}; }
}
function _saveDeployNotes(notes) {
  try { localStorage.setItem(DEPLOY_NOTES_KEY, JSON.stringify(notes)); } catch(_) {}
}

function _deployTotals(state) {
  // Build a set of valid step IDs from the current phase definitions.
  // State may contain stale keys from removed/merged steps — exclude those
  // so done/skipped counts only reflect steps that actually exist.
  const validIds = new Set(DEPLOY_PHASES.flatMap(p => p.steps.map(s => s.id)));
  const total   = validIds.size;
  const done    = [...validIds].filter(id => state[id] === 'completed').length;
  const skipped = [...validIds].filter(id => state[id] === 'skipped').length;
  return { total, done, skipped };
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
        <svg class="ti ti-lock" style="font-size:3rem;color:var(--text-muted)"><use href="img/tabler-sprite.min.svg#tabler-lock"/></svg>
        <h2 style="font-size:1.4rem;font-weight:700;color:var(--text)">403 — Access Restricted</h2>
        <p style="color:var(--text-muted);font-size:0.9rem">This page is only available to administrators.</p>
      </div>`;
    return;
  }

  const state = _loadDeployState();
  const { total, done, skipped } = _deployTotals(state);
  const todo = total - done - skipped;

  // Build section HTML
  const sectionsHTML = DEPLOY_PHASES.map((phase, pi) => {
    const sectionId = `deploy-section-${phase.id}`;
    const chevronId = `deploy-chevron-${phase.id}`;
    const phaseTotal   = phase.steps.length;
    const phaseDone     = phase.steps.filter(s => state[s.id] === 'completed').length;
    const phaseSkipped  = phase.steps.filter(s => state[s.id] === 'skipped').length;
    const phaseTodo     = phaseTotal - phaseDone - phaseSkipped;

    const pillHTML = `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px">${
      phaseDone > 0 ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;background:rgba(63,190,113,0.12);color:#3fbe71">${phaseDone} Done</span>` : ''
    }${
      phaseSkipped > 0 ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#9ca3af22;color:#9ca3af">${phaseSkipped} Skipped</span>` : ''
    }${
      phaseTodo > 0 ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#6b728022;color:#6b7280">${phaseTodo} To Do</span>` : ''
    }</span>`;

    const stepsHTML = phase.steps.map((step, si) => {
      const isDone    = state[step.id] === 'completed';
      const isSkipped  = state[step.id] === 'skipped';
      const isLast = si === phase.steps.length - 1;
      const rowBg    = isDone ? 'background:rgba(63,190,113,0.04)' : '';
      const rowBorder = isLast ? '' : 'border-bottom:1px solid var(--border);';
      return `
        <tr id="deploy-row-${step.id}" style="${rowBorder}${rowBg};transition:background .15s">
          <td style="padding:10px 12px;color:var(--text-dim);font-size:0.78rem;font-weight:600;white-space:nowrap;vertical-align:middle;width:60px">#${pi + 1}.${si + 1}</td>
          <td style="padding:10px 12px;font-size:0.86rem;color:var(--text-muted);line-height:1.55;vertical-align:middle" id="deploy-text-${step.id}">
              ${step.text}
              ${(step.cmd && !step.cmdModalOnly) ? `<div style="margin-top:7px;display:flex;align-items:stretch;gap:0;border:1px solid var(--border);border-radius:7px;overflow:hidden;max-width:480px">
                <code style="flex:1;padding:5px 10px;font-size:0.8rem;background:var(--bg-card);color:var(--text);white-space:pre;overflow-x:auto;line-height:1.5">${step.cmd}</code>
                <button data-deploy-copy="${step.id}" title="Copy command" style="flex-shrink:0;border:none;border-left:1px solid var(--border);background:var(--bg-card);cursor:pointer;padding:0 10px;color:var(--text-muted);display:flex;align-items:center;transition:background .15s" onmouseenter="this.style.background='var(--bg)'" onmouseleave="this.style.background='var(--bg-card)'">
                  <svg class="ti ti-copy" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.min.svg#tabler-copy"/></svg>
                </button>
              </div>` : ''}
            </td>
          <td style="padding:10px 12px;text-align:center;white-space:nowrap;vertical-align:middle;width:110px">
            ${step.auto ? `<div style="display:flex;flex-direction:column;align-items:center;gap:5px">
                <button data-deploy-auto="${step.id}" class="btn btn-subtle" style="font-size:0.78rem;padding:4px 12px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap">
                  <svg class="ti ti-player-play" style="width:.8rem;height:.8rem"><use href="img/tabler-sprite.min.svg#tabler-player-play"/></svg> Auto Check
                </button>
                <span id="deploy-auto-result-${step.id}" style="display:none;font-size:0.72rem;padding:2px 7px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);text-align:left;line-height:1.4;max-width:200px"></span>
              </div>` : ''}
          </td>
          <td style="padding:10px 12px;text-align:right;white-space:nowrap;vertical-align:middle;width:130px">
            <button
              class="btn btn-subtle"
              data-deploy-id="${step.id}"
              data-deploy-action="step-detail"
              style="font-size:0.78rem;padding:4px 12px;gap:5px;display:inline-flex;align-items:center;${isDone ? 'color:#3fbe71;border-color:rgba(63,190,113,0.3);background:rgba(63,190,113,0.12)' : isSkipped ? 'color:#9ca3af;border-color:rgba(107,114,128,0.25);background:rgba(107,114,128,0.10)' : ''}">
              ${isDone
                ? `<svg class="ti ti-check" style="width:.8rem;height:.8rem;color:#3fbe71"><use href="img/tabler-sprite.min.svg#tabler-check"/></svg> Done`
                : isSkipped
                  ? `<svg class="ti ti-minus" style="width:.8rem;height:.8rem;color:#9ca3af"><use href="img/tabler-sprite.min.svg#tabler-minus"/></svg> Skipped`
                  : `<svg class="ti ti-clipboard-list" style="width:.8rem;height:.8rem"><use href="img/tabler-sprite.min.svg#tabler-clipboard-list"/></svg> To Do`
              }
            </button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div style="margin-bottom:28px">
        <div style="padding:14px 4px 0;cursor:pointer;user-select:none" data-deploy-toggle-section="${sectionId}">
          <div style="display:flex;align-items:center;gap:8px">
            <svg class="ti ti-chevron-down" id="${chevronId}" style="font-size:1rem;color:var(--text-muted);transition:transform .2s;transform:rotate(-90deg)"><use href="img/tabler-sprite.min.svg#tabler-chevron-down"/></svg>
            <svg class="ti ${phase.icon}" style="font-size:1.1rem;color:var(--text-muted);flex-shrink:0"><use href="img/tabler-sprite.min.svg#tabler-${phase.icon.slice(3)}"/></svg>
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
          ${skipped > 0 ? `<div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:#9ca3af">${skipped}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Skipped</div></div>` : ''}
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${todo}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">To Do</div></div>
          <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${total}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Total</div></div>
        </div>

        <button class="btn btn-subtle" id="deployManageBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-adjustments" style="font-size:1.15rem"><use href="img/tabler-sprite.min.svg#tabler-adjustments"/></svg> Manage Deployment
        </button>
        <button class="btn btn-subtle" id="deploySaveBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
          <svg class="ti ti-file-download" style="font-size:1.15rem"><use href="img/tabler-sprite.min.svg#tabler-file-download"/></svg> Save Results
        </button>
        <div id="activeRunToggle" style="margin-left:auto;display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0;background:var(--bg-card);box-shadow:0 1px 3px rgba(0,0,0,.06)">
          <button id="deployTabChecklist" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;font-size:0.78rem;letter-spacing:.02em;transition:all .15s;${_deployCurrentView==='checklist'?'background:rgba(13,148,136,0.12);color:#0d9488;font-weight:700':'background:transparent;color:var(--text-muted);font-weight:600'}">
            <svg class="ti ti-checklist" style="width:1.05rem;height:1.05rem;flex-shrink:0;${_deployCurrentView==='checklist'?'color:#0d9488':'color:var(--text-muted)'}"><use href="img/tabler-sprite.min.svg#tabler-checklist"/></svg>
            Checklist
          </button>
          <button id="deployTabHistory" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;font-size:0.78rem;letter-spacing:.02em;transition:all .15s;${_deployCurrentView==='history'?'background:rgba(13,148,136,0.12);color:#0d9488;font-weight:700':'background:transparent;color:var(--text-muted);font-weight:600'}">
            <svg class="ti ti-world-upload" style="width:1.05rem;height:1.05rem;flex-shrink:0;${_deployCurrentView==='history'?'color:#0d9488':'color:var(--text-muted)'}"><use href="img/tabler-sprite.min.svg#tabler-world-upload"/></svg>
            All Deployments
          </button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px 24px 24px 24px">
        ${sectionsHTML}
      </div>
    </div>`;

  // Wire step-detail buttons (open detail modal)
  pageContent.querySelectorAll('[data-deploy-action="step-detail"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _openDeployStepModal(btn.dataset.deployId);
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
        btn.innerHTML = '<svg class="ti ti-check" style="width:.85rem;height:.85rem;color:#3fbe71"><use href="img/tabler-sprite.min.svg#tabler-check"/></svg>';
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


  // ── Wire automation "Auto Check" buttons ──────────────────────────
  pageContent.querySelectorAll('[data-deploy-auto]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stepId  = btn.dataset.deployAuto;
      const step    = DEPLOY_PHASES.flatMap(p => p.steps).find(s => s.id === stepId);
      const resultEl = document.getElementById(`deploy-auto-result-${stepId}`);
      if (!step || !resultEl) return;

      const _setResult = (ok, html) => {
        if (ok) {
          // Strip HTML tags to get plain text for the step notes
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const noteText = (tmp.textContent || tmp.innerText || '').trim() || html.replace(/<[^>]*>/g, '').trim();
          // Persist: save note + mark step completed
          const n = _loadDeployNotes(); n[stepId] = noteText; _saveDeployNotes(n);
          const s = _loadDeployState(); s[stepId] = 'completed'; _saveDeployState(s);
          // Re-render — Done state replaces the button row; no extra pill needed
          window.renderDeployment();
        } else {
          // Failure: show red pill inline so user sees what went wrong
          resultEl.style.display = 'inline-flex';
          resultEl.style.alignItems = 'center';
          resultEl.style.gap = '5px';
          resultEl.style.background  = 'rgba(239,68,68,0.08)';
          resultEl.style.borderColor = 'rgba(239,68,68,0.35)';
          resultEl.style.color       = '#ef4444';
          resultEl.innerHTML = html;
        }
      };
      const _setLoading = () => {
        btn.disabled = true;
        resultEl.style.display = 'inline-flex';
        resultEl.style.alignItems = 'center';
        resultEl.style.background = 'var(--bg-card)';
        resultEl.style.borderColor = 'var(--border)';
        resultEl.style.color = 'var(--text-muted)';
        resultEl.innerHTML = '<svg style="width:.7rem;height:.7rem;animation:spin 0.8s linear infinite"><use href="img/tabler-sprite.min.svg#tabler-loader-2"/></svg> Checking…';
      };
      const _done = () => { btn.disabled = false; };

      if (step.auto === 'fetch-commit') {
        _setLoading();
        try {
          const r = await window.electronAPI.getLatestCommitId();
          if (r.error) throw new Error(r.error);
          _setResult(true, `✓ <code style="font-size:0.78rem">${_esc(r.commitId)}</code> — ${_esc(r.message)}`);
        } catch (e) { _setResult(false, `✗ ${_esc(e.message)}`); }
        _done();

      } else if (step.auto === 'check-dist-sizes') {
        _setLoading();
        try {
          const r = await window.electronAPI.listDistFiles();
          if (!r.ok) throw new Error(r.error);
          if (!r.files.length) throw new Error('No .dmg or .exe found in dist/ — build first.');
          const rows = r.files.map(f => {
            const mb   = parseFloat(f.sizeMb);
            const warn = mb < 20;
            const col  = warn ? '#ef4444' : '#3fbe71';
            return `<span style="color:${col}">${warn ? '✗' : '✓'} ${_esc(f.name)} — ${_esc(f.sizeMb)}</span>`;
          }).join('<br>');
          const allOk = r.files.every(f => parseFloat(f.sizeMb) >= 20);
          _setResult(allOk, rows);
        } catch (e) { _setResult(false, `✗ ${_esc(e.message)}`); }
        _done();

      } else if (step.auto === 'check-ssl') {
        _setLoading();
        try {
          const r = await fetch('https://www.jumpkit.app', { cache: 'no-store', redirect: 'follow' });
          if (!r.ok && r.status !== 0) throw new Error(`HTTPS returned status ${r.status}`);
          // Check HTTP → HTTPS redirect: fetch follows it automatically; if we end up at https it worked
          let redirectOk = false;
          try {
            const r2 = await fetch('http://jumpkit.app', { cache: 'no-store', redirect: 'follow' });
            redirectOk = r2.url.startsWith('https://');
          } catch (_) { redirectOk = false; }
          const httpsOk = r.url?.startsWith('https://') || true; // fetch error = no SSL issue in Electron
          _setResult(true, `✓ HTTPS OK${redirectOk ? ' – HTTP redirects to HTTPS ✓' : ' – HTTP redirect check failed (may be network/CORS)'}`);
        } catch (e) { _setResult(false, `✗ ${_esc(e.message)}`); }
        _done();

      } else if (step.auto === 'verify-gh-release') {
        _setLoading();
        try {
          const r   = await fetch('https://api.github.com/repos/jrod4404/JumpKit/releases/latest', { cache: 'no-store' });
          const pkg = await r.json();
          if (!r.ok) throw new Error(pkg.message || `GitHub API returned ${r.status}`);
          const tag = pkg.tag_name || '(none)';
          _setResult(true, `✓ Latest release tag: <strong>${_esc(tag)}</strong> — published ${_esc((pkg.published_at || '').slice(0,10))}`);
        } catch (e) { _setResult(false, `✗ ${_esc(e.message)}`); }
        _done();

      } else if (step.auto === 'verify-gh-assets') {
        _setLoading();
        try {
          const r    = await fetch('https://api.github.com/repos/jrod4404/JumpKit/releases/latest', { cache: 'no-store' });
          const pkg  = await r.json();
          if (!r.ok) throw new Error(pkg.message || `GitHub API returned ${r.status}`);
          const names    = (pkg.assets || []).map(a => a.name);
          const hasMacYml = names.includes('latest-mac.yml');
          const hasWinYml = names.includes('latest.yml');
          const allOk     = hasMacYml && hasWinYml;
          _setResult(allOk,
            `${hasMacYml ? '✓' : '✗'} latest-mac.yml — ${hasWinYml ? '✓' : '✗'} latest.yml` +
            `<span style="color:var(--text-muted);font-size:0.74rem"> (${names.length} asset${names.length!==1?'s':''} total)</span>`);
        } catch (e) { _setResult(false, `✗ ${_esc(e.message)}`); }
        _done();
      }
    });
  });
};

// ── All Deployments History View ─────────────────────────────────
async function _renderDeployHistory() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent) return;

  const state = _loadDeployState();
  const { total, done, skipped } = _deployTotals(state);
  const todo = total - done - skipped;

  // Shared header (same as checklist view)
  const headerHTML = `
    <div style="flex-shrink:0;background:var(--bg);padding:16px 24px 12px 24px;display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;border-bottom:1px solid var(--border)">
      <div style="padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);display:inline-flex;align-items:center;gap:0">
        <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:#3fbe71">${done}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Done</div></div>
        ${skipped > 0 ? `<div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:#9ca3af">${skipped}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Skipped</div></div>` : ''}
        <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${todo}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">To Do</div></div>
        <div style="text-align:center;padding:2px 10px"><div style="font-size:1.3rem;font-weight:900;color:var(--text-muted)">${total}</div><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-top:1px">Total</div></div>
      </div>

      <button class="btn btn-subtle" id="deployManageBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
        <svg class="ti ti-adjustments" style="font-size:1.15rem"><use href="img/tabler-sprite.min.svg#tabler-adjustments"/></svg> Manage Deployment
      </button>
      <button class="btn btn-subtle" id="deploySaveBtn" style="display:flex;align-items:center;gap:.5rem;font-size:1rem;padding:6px 13px">
        <svg class="ti ti-file-download" style="font-size:1.15rem"><use href="img/tabler-sprite.min.svg#tabler-file-download"/></svg> Save Results
      </button>
      <div id="activeRunToggle" style="margin-left:auto;display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0;background:var(--bg-card);box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <button id="deployTabChecklist" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-size:0.78rem;font-weight:600;letter-spacing:.02em;transition:all .15s">
          <svg class="ti ti-checklist" style="width:1.05rem;height:1.05rem;flex-shrink:0;color:var(--text-muted)"><use href="img/tabler-sprite.min.svg#tabler-checklist"/></svg>
          Checklist
        </button>
        <button id="deployTabHistory" style="display:inline-flex;align-items:center;gap:6px;padding:5px 15px;border:none;cursor:pointer;background:rgba(13,148,136,0.12);color:#0d9488;font-size:0.78rem;font-weight:700;letter-spacing:.02em;transition:all .15s">
          <svg class="ti ti-world-upload" style="width:1.05rem;height:1.05rem;flex-shrink:0;color:#0d9488"><use href="img/tabler-sprite.min.svg#tabler-world-upload"/></svg>
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
              <svg class="ti ti-search jump-search-icon"><use href="img/tabler-sprite.min.svg#tabler-search"/></svg>
              <input id="deployHistSearch" type="text" placeholder="Search deployments..." class="jump-search-input" style="width:210px" />
            </div>
          </div>
          <div id="deployHistTableWrap">
            <div style="padding:32px;text-align:center;color:var(--text-dim)">
              <svg class="ti ti-loader-2" style="font-size:1.6rem;animation:spin 1s linear infinite"><use href="img/tabler-sprite.min.svg#tabler-loader-2"/></svg>
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


  // Fetch all deployments from Supabase
  let deployments = [];
  try {
    const { data, error } = await supabaseClient
      .from('deployments')
      .select('id,version,status,created_at,testing_completed_at,deployed_at,mac_finalized_at,win_finalized_at,mac_tests_passed,mac_tests_total,win_tests_passed,win_tests_total,deployment_folder,commit_id,deploy_account,vercel_commit_id,backup_path,deploy_notes,deploy_checks_passed,deploy_checks_skipped,deploy_checks_todo,deploy_checks_total')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    deployments = data || [];
  } catch (err) {
    document.getElementById('deployHistTableWrap').innerHTML =
      `<div style="padding:24px;text-align:center;color:var(--text-dim)">Failed to load deployments: ${_esc(err.message)}</div>`;
    return;
  }

  // Status pill helper
  const _statusPill = (s) => {
    if (s === 'deployed')            return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:rgba(63,190,113,0.15);color:#3fbe71">Deployed</span>`;
    if (s === 'testing_complete')    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:rgba(99,102,241,0.15);color:#6366f1">Testing Complete</span>`;
    if (s === 'testing_in_progress') return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b">In Progress</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:700;background:var(--bg-input);color:var(--text-dim)">${_esc(s || '—')}</span>`;
  };

  // Check helper
  const _check = (v) => v ? `<span style="display:inline-flex;align-items:center;justify-content:center;padding:2px 10px;border-radius:99px;background:#3fbe7133"><svg class="ti ti-check" style="color:#3fbe71;font-size:0.99rem"><use href="img/tabler-sprite.min.svg#tabler-check"/></svg></span>` : `<span style="color:var(--text-dim)">—</span>`;
  const _fmt = (v) => v ? new Date(v).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
  const _score = (p, t) => (t > 0) ? `${p}/${t}` : '—';

  const buildRow = (d, isLast = false) => `<tr style="${isLast ? '' : 'border-bottom:1px solid var(--border)'}">
    <td style="padding:10px 12px;font-size:0.86rem;font-weight:700;color:var(--text);white-space:nowrap">${_esc(d.version || '—')}</td>
    <td style="padding:10px 12px">${_statusPill(d.status)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_check(d.mac_finalized_at)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_score(d.mac_tests_passed, d.mac_tests_total)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_check(d.win_finalized_at)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);text-align:center">${_score(d.win_tests_passed, d.win_tests_total)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);white-space:nowrap">${_fmt(d.mac_finalized_at || d.win_finalized_at || d.created_at)}</td>
    <td style="padding:10px 12px;font-size:0.82rem;color:var(--text-muted);white-space:nowrap">${_fmt(d.deployed_at || d.testing_completed_at)}</td>
    <td style="padding:10px 12px;text-align:center"><button class="btn btn-subtle" style="font-size:0.72rem;padding:4px 12px;display:inline-flex;align-items:center;gap:5px" data-deploy-details="${_esc(d.id)}"><svg class="ti ti-info-circle" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.min.svg#tabler-info-circle"/></svg>Details</button></td>
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
          <th style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:center">Details</th>
        </tr>
      </thead>
      <tbody id="deployHistTbody">${deployments.map((d,i,a) => buildRow(d, i===a.length-1)).join('') || `<tr><td colspan="9" style="padding:32px;text-align:center;color:var(--text-dim)">No deployments found.</td></tr>`}</tbody>
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
      data = data.filter(d => ((d.version||'') + ' ' + (d.status||'') + ' ' + (d.deploy_notes||'')).toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      const va = _getVal(a, _sortCol), vb = _getVal(b, _sortCol);
      return va < vb ? _sortDir : va > vb ? -_sortDir : 0;
    });
    const tbody = document.getElementById('deployHistTbody');
    if (tbody) tbody.innerHTML = data.map((d,i,a) => buildRow(d, i===a.length-1)).join('') || `<tr><td colspan="9" style="padding:32px;text-align:center;color:var(--text-dim)">No matches.</td></tr>`;
    document.querySelectorAll('#deployHistTable th[data-col]').forEach(th => {
      const ind = th.querySelector('.sort-ind');
      if (ind) ind.textContent = th.dataset.col === _sortCol ? (_sortDir === -1 ? ' ▼' : ' ▲') : ' ↕';
    });
  };

  // ── Details button handler ───────────────────────────────────────────
  document.getElementById('deployHistTableWrap').addEventListener('click', e => {
    const btn = e.target.closest('[data-deploy-details]');
    if (!btn) return;
    const id = btn.dataset.deployDetails;
    const d  = deployments.find(x => x.id === id);
    if (!d) return;

    const _fmtFull = (v) => v ? new Date(v).toLocaleString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const _kv = (label, val) => val != null && val !== '' && val !== '—'
      ? `<tr>
          <td style="padding:5px 12px 5px 0;font-size:0.8rem;color:var(--text-muted);white-space:nowrap;vertical-align:top;width:200px;min-width:160px">${label}</td>
          <td style="padding:5px 0;font-size:0.8rem;color:var(--text);word-break:break-all">${_esc(String(val))}</td>
        </tr>`
      : '';
    const _block = (title, rows) => {
      const body = rows.filter(Boolean).join('');
      if (!body) return '';
      return `<div style="margin-bottom:20px">
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:8px">${title}</div>
        <table style="border-collapse:collapse;width:100%">${body}</table>
      </div>`;
    };

    const body = `<div style="display:flex;flex-direction:column;gap:0;padding:4px 0">
      ${_block('Release', [
        _kv('Version',           d.version),
        _kv('Status',            d.status),
        _kv('Session Started',   _fmtFull(d.created_at)),
        _kv('Deployment Folder', d.deployment_folder),
      ])}
      ${_block('Mac Testing', [
        _kv('Finalized At',    _fmtFull(d.mac_finalized_at)),
        _kv('Account',         d.mac_testing_account),
        _kv('Tests Passed',    d.mac_tests_passed != null ? d.mac_tests_passed : null),
        _kv('Tests Failed',    d.mac_tests_failed  != null ? d.mac_tests_failed  : null),
        _kv('Tests Skipped',   d.mac_tests_skipped != null ? d.mac_tests_skipped : null),
        _kv('Tests Total',     d.mac_tests_total   != null ? d.mac_tests_total   : null),
      ])}
      ${_block('Windows Testing', [
        _kv('Finalized At',    _fmtFull(d.win_finalized_at)),
        _kv('Account',         d.win_testing_account),
        _kv('Tests Passed',    d.win_tests_passed != null ? d.win_tests_passed : null),
        _kv('Tests Failed',    d.win_tests_failed  != null ? d.win_tests_failed  : null),
        _kv('Tests Skipped',   d.win_tests_skipped != null ? d.win_tests_skipped : null),
        _kv('Tests Total',     d.win_tests_total   != null ? d.win_tests_total   : null),
      ])}
      ${_block('Deployment', [
        _kv('Deployed At',       _fmtFull(d.deployed_at)),
        _kv('Deploy Account',    d.deploy_account),
        _kv('Commit ID',         d.commit_id),
        _kv('Vercel Commit',     d.vercel_commit_id),
        _kv('Backup Path',       d.backup_path),
        _kv('Notes',             d.deploy_notes),
      ])}
      ${_block('Deployment Checks', [
        _kv('Passed',  d.deploy_checks_passed  != null ? d.deploy_checks_passed  : null),
        _kv('Skipped', d.deploy_checks_skipped != null ? d.deploy_checks_skipped : null),
        _kv('To Do',   d.deploy_checks_todo    != null ? d.deploy_checks_todo    : null),
        _kv('Total',   d.deploy_checks_total   != null ? d.deploy_checks_total   : null),
      ])}
    </div>`;

    Modal.open(
      `<svg class="ti ti-world-upload" style="vertical-align:middle;margin-right:6px;color:var(--turq)"><use href="img/tabler-sprite.min.svg#tabler-world-upload"/></svg> Deployment v${_esc(d.version || '—')}`,
      body,
      '<button class="btn btn-subtle" data-jaction="modal-close">Close</button>',
      'md'
    );
  });

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
// ── Step detail modal ─────────────────────────────────────────────────────

// Flat ordered list of every step with its phase metadata attached
function _getOrderedDeploySteps() {
  return DEPLOY_PHASES.flatMap((phase, pi) =>
    phase.steps.map((step, si) => ({
      ...step,
      phaseLabel: phase.label,
      phaseIcon:  phase.icon,
      stepNum:    `#${pi + 1}.${si + 1}`,
    }))
  );
}

function _buildDeployStepContent(stepId) {
  const ordered    = _getOrderedDeploySteps();
  const currentIdx = ordered.findIndex(s => s.id === stepId);
  const step       = ordered[currentIdx];
  if (!step) return null;

  const prevId = currentIdx > 0 ? ordered[currentIdx - 1].id : null;
  const nextId = currentIdx < ordered.length - 1 ? ordered[currentIdx + 1].id : null;

  const state   = _loadDeployState();
  const notes   = _loadDeployNotes();
  const isDone    = state[stepId] === 'completed';
  const isSkipped  = state[stepId] === 'skipped';
  const noteVal = notes[stepId] || '';

  const statusColor  = isDone ? '#3fbe71' : isSkipped ? '#9ca3af' : '#6b7280';
  const statusBg     = isDone ? 'rgba(63,190,113,0.12)' : isSkipped ? 'rgba(156,163,175,0.12)' : 'rgba(107,114,128,0.12)';
  const statusBorder = isDone ? 'rgba(63,190,113,0.3)' : isSkipped ? 'rgba(156,163,175,0.25)' : 'rgba(107,114,128,0.3)';
  const statusLabel  = isDone ? '✓ Done' : isSkipped ? '– Skipped' : '– To Do';

  const tdLabel = 'padding:8px 28px 8px 0;color:var(--text-muted);font-weight:600;width:80px;vertical-align:top;white-space:nowrap;font-size:0.86rem';
  const tdValue = 'padding:8px 0;color:var(--text);line-height:1.6;font-size:0.86rem';

  const bodyHTML = `
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="${tdLabel}">Step</td>
        <td style="${tdValue}">${_esc(step.stepNum)}</td>
      </tr>
      <tr>
        <td style="${tdLabel}">Phase</td>
        <td style="${tdValue}">${_esc(step.phaseLabel)}</td>
      </tr>
      <tr>
        <td style="${tdLabel}">Status</td>
        <td style="padding:8px 0">
          <span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder}">${statusLabel}</span>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid var(--border);margin:6px 0 10px"></div>
    <div style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">Details</div>
    <div style="font-size:0.86rem;color:var(--text);line-height:1.65;margin-bottom:${step.cmd ? '10px' : '0'}">${step.text}</div>
    ${step.cmd ? `
      <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:${step.cmd2 ? '8px' : '12px'}">
        <code style="flex:1;font-size:0.78rem;background:var(--bg-input);padding:6px 10px;border-radius:6px;color:var(--text);white-space:pre-wrap;word-break:break-all;line-height:1.5">${_esc(step.cmd)}</code>
        <button id="deployStepCopyCmd" class="btn btn-subtle" title="Copy" style="flex-shrink:0;padding:5px 7px;margin-top:1px">
          <svg class="ti ti-copy" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.min.svg#tabler-copy"/></svg>
        </button>
      </div>` : ''}
    ${step.cmd2 ? `
      <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:12px">
        <code style="flex:1;font-size:0.78rem;background:var(--bg-input);padding:6px 10px;border-radius:6px;color:var(--text);white-space:pre-wrap;word-break:break-all;line-height:1.5">${_esc(step.cmd2)}</code>
        <button id="deployStepCopyCmd2" class="btn btn-subtle" title="Copy" style="flex-shrink:0;padding:5px 7px;margin-top:1px">
          <svg class="ti ti-copy" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.min.svg#tabler-copy"/></svg>
        </button>
      </div>` : ''}
    <div style="border-top:1px solid var(--border);margin:10px 0 10px"></div>
    ${stepId === 'cv-1' ? (() => {
      const saved = (_loadDeployConfig().commit_id || '');
      return `<label style="display:block;font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">Commit ID</label>
      <input id="deployStepCommitId" class="form-input" type="text" placeholder="e.g. a1b2c3d"
        value="${_esc(saved)}" style="font-size:0.85rem;margin-bottom:12px;width:100%;box-sizing:border-box" />`;
    })() : ''}
    ${stepId === 'bk-1' ? (() => {
      const saved = (_loadDeployConfig().backup_path || '');
      return `<label style="display:block;font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">Backup File Path</label>
      <input id="deployStepBackupPath" class="form-input" type="text" placeholder="e.g. app_backups/app_backup_2026-07-02.tar.gz"
        value="${_esc(saved)}" style="font-size:0.85rem;margin-bottom:12px;width:100%;box-sizing:border-box" />`;
    })() : ''}
    ${stepId === 'lp-4' ? (() => {
      const saved = (_loadDeployConfig().vercel_commit_id || '');
      return `<label style="display:block;font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">Vercel Commit ID</label>
      <input id="deployStepVercelCommitId" class="form-input" type="text" placeholder="e.g. 347b17b"
        value="${_esc(saved)}" style="font-size:0.85rem;margin-bottom:12px;width:100%;box-sizing:border-box" />`;
    })() : ''}
    <label style="display:block;font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">Notes</label>
    <textarea id="deployStepNotes" class="form-textarea" rows="3"
      placeholder="Add notes for this deployment check…"
      style="font-size:0.85rem;line-height:1.5;min-height:72px">${_esc(noteVal)}</textarea>`;

  const footerHTML = `
    <div style="display:flex;gap:8px;align-items:center;width:100%">
      <button id="deployStepPrevBtn" class="btn btn-subtle" ${prevId ? `data-deploy-nav="${prevId}"` : 'disabled'}>
        <svg class="ti ti-chevron-left" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.min.svg#tabler-chevron-left"/></svg> Prev
      </button>
      <button id="deployStepNextBtn" class="btn btn-subtle" ${nextId ? `data-deploy-nav="${nextId}"` : 'disabled'}>
        Next <svg class="ti ti-chevron-right" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.min.svg#tabler-chevron-right"/></svg>
      </button>
      <button id="deployStepDoneBtn" class="btn btn-subtle" style="color:#3fbe71;border-color:rgba(63,190,113,0.3)">
        <svg class="ti ti-check" style="color:#3fbe71"><use href="img/tabler-sprite.min.svg#tabler-check"/></svg> Mark as Done
      </button>
      <button id="deployStepTodoBtn" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;font-size:0.85rem">
        <svg class="ti ti-clipboard-list" style="width:.85rem;height:.85rem"><use href="img/tabler-sprite.min.svg#tabler-clipboard-list"/></svg> Mark as To Do
      </button>
      <button id="deployStepSkipBtn" class="btn btn-subtle" style="display:inline-flex;align-items:center;gap:5px;font-size:0.85rem;color:#6b7280;border-color:rgba(107,114,128,0.3)">
        <svg class="ti ti-minus" style="width:.85rem;height:.85rem;color:#6b7280"><use href="img/tabler-sprite.min.svg#tabler-minus"/></svg> Mark as Skipped
      </button>
      <button class="btn btn-subtle" data-jaction="modal-close" style="margin-left:auto"><svg class="ti ti-x"><use href="img/tabler-sprite.min.svg#tabler-x"/></svg> Close</button>
    </div>`;

  const modalTitle = `<svg class="ti ${step.phaseIcon}" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.min.svg#tabler-${step.phaseIcon.slice(3)}"/></svg> ${_esc(step.stepNum)} — ${_esc(step.phaseLabel)}`;

  return { title: modalTitle, body: bodyHTML, footer: footerHTML, prevId, nextId, stepId, cmd: step.cmd || null, cmd2: step.cmd2 || null };
}

function _wireDeployStepModal(ctx) {
  // ctx = { stepId, prevId, nextId, cmd, cmd2 }
  const { stepId, cmd, cmd2 } = ctx;

  // In-place navigation
  ['deployStepPrevBtn', 'deployStepNextBtn'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn || btn.disabled) return;
    const navId = btn.dataset.deployNav;
    btn.addEventListener('click', () => {
      const content = _buildDeployStepContent(navId);
      if (!content) return;
      const mt = document.getElementById('modalTitle');
      const mb = document.getElementById('modalBody');
      const mf = document.getElementById('modalFooter');
      if (mt) mt.innerHTML = content.title;
      if (mb) mb.innerHTML = content.body;
      if (mf) mf.innerHTML = content.footer;
      _wireDeployStepModal(content);
    });
  });

  // Helper: persist notes, set state, close + re-render
  const _applyAndClose = (newState) => {
    const n = _loadDeployNotes();
    n[stepId] = document.getElementById('deployStepNotes')?.value || '';
    _saveDeployNotes(n);
    // Persist step-specific extra fields
    const commitIdEl        = document.getElementById('deployStepCommitId');
    const backupPathEl      = document.getElementById('deployStepBackupPath');
    const vercelCommitIdEl  = document.getElementById('deployStepVercelCommitId');
    if (commitIdEl)        _saveDeployConfig({ ..._loadDeployConfig(), commit_id:        commitIdEl.value.trim() });
    if (backupPathEl)      _saveDeployConfig({ ..._loadDeployConfig(), backup_path:      backupPathEl.value.trim() });
    if (vercelCommitIdEl)  _saveDeployConfig({ ..._loadDeployConfig(), vercel_commit_id: vercelCommitIdEl.value.trim() });
    const s = _loadDeployState();
    s[stepId] = newState;
    _saveDeployState(s);
    const pc = document.getElementById('pageContent');
    const openSections = new Set();
    pc?.querySelectorAll('[id^="deploy-section-"]').forEach(sec => {
      if (sec.dataset.collapsed !== 'true') openSections.add(sec.id);
    });
    Modal.close();
    renderDeployment();
    openSections.forEach(secId => {
      const sec  = document.getElementById(secId);
      const chev = document.getElementById(secId.replace('deploy-section-', 'deploy-chevron-'));
      if (sec)  { sec.style.maxHeight = '2000px'; sec.dataset.collapsed = 'false'; }
      if (chev) chev.style.transform = 'rotate(0deg)';
    });
  };

  document.getElementById('deployStepDoneBtn')?.addEventListener('click', () => _applyAndClose('completed'));
  document.getElementById('deployStepTodoBtn')?.addEventListener('click', () => _applyAndClose('todo'));
  document.getElementById('deployStepSkipBtn')?.addEventListener('click', () => _applyAndClose('skipped'));

  // Auto-save notes
  document.getElementById('deployStepNotes')?.addEventListener('input', (e) => {
    const n = _loadDeployNotes();
    n[stepId] = e.target.value;
    _saveDeployNotes(n);
  });

  // Auto-save commit ID (cv-1) and backup path (bk-1) into deploy config
  document.getElementById('deployStepCommitId')?.addEventListener('input', (e) => {
    _saveDeployConfig({ ..._loadDeployConfig(), commit_id: e.target.value.trim() });
  });
  document.getElementById('deployStepBackupPath')?.addEventListener('input', (e) => {
    _saveDeployConfig({ ..._loadDeployConfig(), backup_path: e.target.value.trim() });
  });
  document.getElementById('deployStepVercelCommitId')?.addEventListener('input', (e) => {
    _saveDeployConfig({ ..._loadDeployConfig(), vercel_commit_id: e.target.value.trim() });
  });

  // Copy command
  if (cmd) {
    document.getElementById('deployStepCopyCmd')?.addEventListener('click', () => {
      navigator.clipboard.writeText(cmd).then(() => {
        const btn = document.getElementById('deployStepCopyCmd');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg class="ti ti-check" style="width:.85rem;height:.85rem;color:#3fbe71"><use href="img/tabler-sprite.min.svg#tabler-check"/></svg>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }).catch(() => {});
    });
  }
  // Copy command 2
  if (cmd2) {
    document.getElementById('deployStepCopyCmd2')?.addEventListener('click', () => {
      navigator.clipboard.writeText(cmd2).then(() => {
        const btn = document.getElementById('deployStepCopyCmd2');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg class="ti ti-check" style="width:.85rem;height:.85rem;color:#3fbe71"><use href="img/tabler-sprite.min.svg#tabler-check"/></svg>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }).catch(() => {});
    });
  }
}

function _openDeployStepModal(stepId) {
  const content = _buildDeployStepContent(stepId);
  if (!content) return;
  Modal.open(content.title, content.body, content.footer, 'xl');
  _wireDeployStepModal(content);
}

async function _openDeployManageModal() {
  // Fetch deployments from Supabase
  let deployments = [];
  let fetchError = null;
  try {
    const { data, error } = await supabaseClient
      .from('deployments')
      .select('id,version,status,created_at,testing_completed_at,deployed_at,mac_finalized_at,win_finalized_at,mac_tests_passed,mac_tests_total,win_tests_passed,win_tests_total,deployment_folder,commit_id,deploy_account,vercel_commit_id,backup_path,deploy_notes,deploy_checks_passed,deploy_checks_skipped,deploy_checks_todo,deploy_checks_total')
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
      '<svg class="ti ti-adjustments" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.min.svg#tabler-adjustments"/></svg> Manage Deployment',
      `<div style="text-align:center;padding:24px">
        <svg class="ti ti-alert-circle" style="font-size:2rem;color:#e15b59;margin-bottom:12px"><use href="img/tabler-sprite.min.svg#tabler-alert-circle"/></svg>
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
      '<svg class="ti ti-adjustments" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.min.svg#tabler-adjustments"/></svg> Manage Deployment',
      `<div style="text-align:center;padding:32px 24px">
        <svg class="ti ti-world-upload" style="font-size:2.5rem;color:var(--text-dim);margin-bottom:16px"><use href="img/tabler-sprite.min.svg#tabler-world-upload"/></svg>
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

  // Custom-select dropdown options (matches the rest of the app's dropdown style)
  const dmSelectOptions = deployments.map(d => {
    const date = new Date(d.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const label = `v${d.version} — ${date} [${d.status}]`;
    return `<div class="custom-select-option${d.id === selectedId ? ' selected' : ''}" data-value="${d.id}">${label}</div>`;
  }).join('');

  const sel = deployments.find(d => d.id === selectedId) || deployments[0] || null;
  const dmSelectLabel = sel
    ? `v${sel.version} — ${new Date(sel.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })} [${sel.status}]`
    : 'Select a testing package…';

  // Pill helpers (local so we don't depend on _renderDeployHistory's closure)
  const _finalizedPill = (finalized) => finalized
    ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(63,190,113,0.15);color:#3fbe71;border:1px solid rgba(63,190,113,0.3)">Finalized</span>`
    : `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3)">Pending</span>`;
  const _dmStatusPill = (s) => {
    if (s === 'deployed')            return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(63,190,113,0.15);color:#3fbe71;border:1px solid rgba(63,190,113,0.3)">Deployed</span>`;
    if (s === 'testing_complete')    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(63,190,113,0.15);color:#3fbe71;border:1px solid rgba(63,190,113,0.3)">Testing Complete</span>`;
    if (s === 'testing_in_progress') return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3)">In Progress</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;background:var(--bg-input);color:var(--text-dim);border:1px solid var(--border)">${_esc(s || '—')}</span>`;
  };

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div>
        <label style="${labelStyle}">Testing Package</label>
        <div class="custom-select" id="dmDeploySelectDrop" style="width:100%">
          <div class="custom-select-trigger" id="dmDeploySelectTrigger">
            <span id="dmDeploySelectLabel">${_esc(dmSelectLabel)}</span>
            <svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.min.svg#tabler-chevron-down"/></svg>
          </div>
          <div class="custom-select-menu" id="dmDeploySelectMenu">${dmSelectOptions}</div>
          <input type="hidden" id="dmDeploySelect" value="${_esc(sel?.id || '')}" />
        </div>
        <p style="margin:5px 0 0;font-size:0.78rem;color:var(--text-muted)">Select the finalized testing session for this deployment. Version and folder are auto-applied.</p>
      </div>
      ${sel ? `<div style="padding:10px 14px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border);font-size:0.82rem;color:var(--text-muted)">
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
          <span><strong style="color:var(--text)">Version:</strong> v${sel.version}</span>
          <span style="display:inline-flex;align-items:center;gap:6px"><strong style="color:var(--text)">Mac:</strong> ${_finalizedPill(!!sel.mac_finalized_at)}${sel.mac_tests_passed != null ? `<span style="color:var(--text-muted)">(${sel.mac_tests_passed}/${sel.mac_tests_total} passed)</span>` : ''}</span>
          <span style="display:inline-flex;align-items:center;gap:6px"><strong style="color:var(--text)">Win:</strong> ${_finalizedPill(!!sel.win_finalized_at)}${sel.win_tests_passed != null ? `<span style="color:var(--text-muted)">(${sel.win_tests_passed}/${sel.win_tests_total} passed)</span>` : ''}</span>
          <span style="display:inline-flex;align-items:center;gap:6px"><strong style="color:var(--text)">Status:</strong> ${_dmStatusPill(sel.status)}</span>
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
        <label style="${labelStyle}">Notes (optional)</label>
        <textarea id="dmNotes" placeholder="Any release notes or deployment notes…" rows="3" style="${inputStyle};resize:vertical">${_esc(sel?.notes || '')}</textarea>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-subtle" data-jaction="modal-close">Cancel</button>
    <button id="dmFinalizeBtn" class="btn" style="background:linear-gradient(135deg,#50CACC,#1A4FD6);border:none;color:#fff;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:6px">
      <svg class="ti ti-rocket" style="width:1.035rem;height:1.035rem;color:#fff"><use href="img/tabler-sprite.min.svg#tabler-rocket"/></svg> Finalize Deployment
    </button>
    <button id="dmSaveBtn" class="btn btn-primary" style="min-width:100px;display:inline-flex;align-items:center;justify-content:center;gap:6px">
      <svg class="ti ti-device-floppy" style="width:1.035rem;height:1.035rem;color:currentColor"><use href="img/tabler-sprite.min.svg#tabler-device-floppy"/></svg> Save
    </button>`;

  // Re-open modal with full content
  Modal.open(
    '<svg class="ti ti-adjustments" style="vertical-align:middle;margin-right:6px"><use href="img/tabler-sprite.min.svg#tabler-adjustments"/></svg> Manage Deployment',
    body, footer, 'xl'
  );

  // Defer all wiring by 200ms — Modal.open() may be queued (if called while another modal is open,
  // e.g. from onSelect re-calling _openDeployManageModal). The queued modal renders after ~160ms,
  // so 200ms ensures the DOM is ready before we try to getElementById any buttons.
  setTimeout(() => {
  // Wire custom-select dropdown for testing package (matches the app's dropdown style)
  if (typeof window.wireDropdown === 'function') {
    window.wireDropdown({
      dropId: 'dmDeploySelectDrop',
      triggerId: 'dmDeploySelectTrigger',
      menuId: 'dmDeploySelectMenu',
      labelId: 'dmDeploySelectLabel',
      inputId: 'dmDeploySelect',
      onSelect: (opt) => {
        const chosen = deployments.find(d => d.id === opt.dataset.value);
        if (chosen) { window._jkSelectedDeployment = chosen; _openDeployManageModal(); }
      },
    });
  }

  // Set selected deployment on load
  if (sel && !window._jkSelectedDeployment) window._jkSelectedDeployment = sel;

  // Wire deployment folder picker
  document.getElementById('dmDeployFolderBtn')?.addEventListener('click', async () => {
    if (!window.electronAPI?.openFileDialog) { alert('File picker not available outside Electron.'); return; }
    try {
      const result = await window.electronAPI.openFileDialog({ title: 'Select Deployment Folder', properties: ['openDirectory'] });
      if (!result?.canceled && result?.filePath) {
        const folder = result.filePath;
        document.getElementById('dmDeployFolder').value = folder;
        // Save to deploy config — write both 'folder' (legacy) and 'deployment_folder' (metadata tab)
        if (typeof _loadDeployConfig === 'function') {
          _saveDeployConfig({ ..._loadDeployConfig(), folder, deployment_folder: folder });
        }
        // Update Supabase record if one is selected
        const selId = document.getElementById('dmDeploySelect')?.value;
        if (selId) {
          const { error } = await supabaseClient.from('deployments').update({ deployment_folder: folder }).eq('id', selId);
          if (error) throw error;
          if (window._jkSelectedDeployment?.id === selId) {
            window._jkSelectedDeployment = { ...window._jkSelectedDeployment, deployment_folder: folder };
          }
        }
        // Refresh the release-docs metadata tab so the new folder shows up immediately
        try {
          if (typeof _autoSaveAllSections === 'function') await _autoSaveAllSections();
        } catch(e) { console.warn('[deployFolderBtn] release-docs autoSave failed:', e); }
        window.Toast?.success('Deployment folder saved.');
      }
    } catch (e) {
      window.Toast?.danger('Failed to save deployment folder: ' + (e.message || 'Unknown error'));
    }
  });

  // Save notes
  const _el_dmSaveBtn = document.getElementById('dmSaveBtn'); if (_el_dmSaveBtn) _el_dmSaveBtn.onclick = async () => {
    const selId = document.getElementById('dmDeploySelect')?.value;
    if (!selId) return Modal.close();
    const originalHTML = _el_dmSaveBtn.innerHTML;
    _el_dmSaveBtn.disabled = true;
    _el_dmSaveBtn.innerHTML = '<svg class="ti ti-loader" style="width:1.035rem;height:1.035rem;color:currentColor;animation:spin 1s linear infinite"><use href="img/tabler-sprite.min.svg#tabler-loader"/></svg> Saving…';
    const notes   = document.getElementById('dmNotes').value.trim();
    const deployFolderEl = document.getElementById('dmDeployFolder');
    const deployFolderVal = deployFolderEl?.value.trim() || '';
    try {
      const { error } = await supabaseClient.from('deployments').update({ deploy_notes: notes }).eq('id', selId);
      if (error) throw error;
      // Update local selected
      if (window._jkSelectedDeployment?.id === selId) {
        window._jkSelectedDeployment = { ...window._jkSelectedDeployment, deploy_notes: notes };
      }

      // Mirror whatever data is available into jk_deploy_config so the release-docs metadata tab's
      // 'Finalized Deployment' section reflects the current state (even before Finalize Deployment).
      // Status = the row's current status (usually 'testing_complete') until Finalize flips it to 'deployed'.
      try {
        const currentStatus = window._jkSelectedDeployment?.status || 'testing_complete';
        const cfg = _loadDeployConfig();
        _saveDeployConfig({
          ...cfg,
          deployment_status:    currentStatus,
          deployment_folder:    deployFolderVal || window._jkSelectedDeployment?.deployment_folder || cfg.folder || '',
          deploy_notes:         notes,
          // deployed_at, deploy_account, commit_id stay unset until Finalize
        });
      } catch(e) { console.warn('[dmSaveBtn] deployConfig mirror failed:', e); }

      // Trigger release-docs autosave so the metadata tab picks up the saved data
      try {
        if (typeof _autoSaveAllSections === 'function') await _autoSaveAllSections();
      } catch(e) { console.warn('[dmSaveBtn] release-docs autoSave failed:', e); }

      Modal.close();
      window.Toast?.success('Deployment info saved.');
    } catch (e) {
      window.Toast?.danger('Failed to save deployment info: ' + (e.message || 'Unknown error'));
      _el_dmSaveBtn.disabled = false;
      _el_dmSaveBtn.innerHTML = originalHTML;
    }
  };

  // Finalize Deployment
  const _el_dmFinalizeBtn = document.getElementById('dmFinalizeBtn'); if (_el_dmFinalizeBtn) _el_dmFinalizeBtn.onclick = async () => {
    const selId = document.getElementById('dmDeploySelect')?.value;
    if (!selId) { alert('Please select a testing package first.'); return; }

    // Record that deployment was initiated in the release docs changelog
    if (typeof _addChangelogEntry === 'function') {
      _addChangelogEntry('Deployment — Finalize Started');
      try {
        if (typeof _autoSaveAllSections === 'function') await _autoSaveAllSections();
      } catch(_) {}
    }

    // Fetch latest commit ID
    let commitId = '';
    let commitMsg = '';
    if (window.electronAPI?.getLatestCommitId) {
      const result = await window.electronAPI.getLatestCommitId();
      if (!result?.error) { commitId = result.commitId || ''; commitMsg = result.message || ''; }
    }

    const notes          = document.getElementById('dmNotes').value.trim();
    const account        = window._supabaseUser?.email || '';
    const _finalCfg      = _loadDeployConfig();
    const vercelCommitId = _finalCfg.vercel_commit_id || '';
    const backupPath     = _finalCfg.backup_path || '';

    // ── Replace modal content in-place for confirmation ──────────────────────────────
    // DO NOT call Modal.close() + Modal.open() here — if any modal is queued from the
    // onSelect re-render of _openDeployManageModal, closing would drain the queue and
    // the queued modal would open BEFORE our confirmation, preventing it from showing.
    // Replacing body/footer innerHTML directly sidesteps the queue entirely.
    const _modalBody   = document.getElementById('modalBody');
    const _modalFooter = document.getElementById('modalFooter');
    const _modalTitle  = document.getElementById('modalTitle');
    if (!_modalBody || !_modalFooter) { alert('Modal not found — please try again.'); return; }

    _modalTitle.innerHTML  = '<svg class="ti ti-rocket" style="vertical-align:middle;margin-right:6px;color:#f97316"><use href="img/tabler-sprite.min.svg#tabler-rocket"/></svg> Finalize Deployment';
    _modalBody.innerHTML   = `<div style="display:flex;flex-direction:column;gap:14px">
      <p style="margin:0;color:var(--text-muted);font-size:0.88rem">This will mark the deployment as <strong style="color:#f97316">Deployed</strong> in Supabase and record the following:</p>
      <div style="padding:12px 14px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border);font-size:0.85rem;display:flex;flex-direction:column;gap:6px">
        <div><strong style="color:var(--text)">Commit ID:</strong> <code style="color:var(--turq)">${_esc(commitId || '(not found)')}</code> ${commitMsg ? ` — ${_esc(commitMsg)}` : ''}</div>
        <div><strong style="color:var(--text)">Deployed by:</strong> ${_esc(account || '(unknown)')}</div>
        <div><strong style="color:var(--text)">Deployed at:</strong> ${new Date().toLocaleString()}</div>

      </div>
      <p style="margin:0;font-size:0.82rem;color:var(--text-muted)">This action cannot be undone. Confirm to finalize.</p>
    </div>`;
    _modalFooter.innerHTML = `<button class="btn btn-subtle" id="dmCancelFinalizeBtn">Cancel</button>
      <button id="dmConfirmFinalizeBtn" class="btn" style="background:linear-gradient(135deg,#00C2C7,#00a0a5);border-color:#00b0b5;color:#fff">Confirm Finalize Deployment</button>`;

    document.getElementById('dmCancelFinalizeBtn')?.addEventListener('click', () => Modal.close());

    document.getElementById('dmConfirmFinalizeBtn')?.addEventListener('click', async () => {
      // Disable button to prevent double-submit
      const confirmBtn = document.getElementById('dmConfirmFinalizeBtn');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Finalizing…'; }

      const deployedAtIso = new Date().toISOString();

      const _deployState2  = _loadDeployState();
      const { total: _dTotal, done: _dDone, skipped: _dSkipped } = _deployTotals(_deployState2);

      const { error } = await supabaseClient.from('deployments').update({
        commit_id:             commitId,
        deployed_at:           deployedAtIso,
        deploy_account:        account,
        status:                'deployed',
        vercel_commit_id:      vercelCommitId,
        backup_path:           backupPath,
        deploy_notes:          notes,
        deploy_checks_passed:  _dDone,
        deploy_checks_skipped: _dSkipped,
        deploy_checks_todo:    _dTotal - _dDone - _dSkipped,
        deploy_checks_total:   _dTotal,
      }).eq('id', selId);

      if (error) {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Finalize Deployment'; }
        window.Toast?.danger('Failed to finalize: ' + error.message);
      } else {
        if (window._jkSelectedDeployment?.id === selId) {
          window._jkSelectedDeployment = { ...window._jkSelectedDeployment, status: 'deployed', commit_id: commitId };
        }

        // Mirror the Supabase deployment payload into jk_deploy_config so the release-docs
        // HTML metadata tab shows the same 'Finalized Deployment' data on next autosave.
        try {
          const cfg = _loadDeployConfig();
          _saveDeployConfig({
            ...cfg,
            deployment_status:    'deployed',
            deployed_at:          deployedAtIso,
            deploy_account:       account,
            commit_id:            commitId,
            deployment_folder:    window._jkSelectedDeployment?.deployment_folder || cfg.folder || '',
            deploy_notes:         notes,
            vercel_commit_id:     vercelCommitId,
            backup_path:          backupPath,
            deploy_checks_passed:  _dDone,
            deploy_checks_skipped: _dSkipped,
            deploy_checks_todo:    _dTotal - _dDone - _dSkipped,
            deploy_checks_total:   _dTotal,
          });
        } catch(e) { console.warn('[FinalizeDeployment] deployConfig mirror failed:', e); }

        // Reset deploy checklist state so next deployment starts fresh
        _saveDeployState({});
        _saveDeployNotes({});
        _saveDeployConfig({});   // clear local deploy session config
        window._jkSelectedDeployment = null;

        // Record deployment finalized in the release docs changelog, then autosave
        if (typeof _addChangelogEntry === 'function') _addChangelogEntry('Deployment — Finalized');

        // Trigger release-docs autosave so the metadata tab picks up the new deployment data
        try {
          if (typeof _autoSaveAllSections === 'function') await _autoSaveAllSections();
        } catch(e) { console.warn('[FinalizeDeployment] release-docs autoSave failed:', e); }

        // Show success modal (replace content in-place, then close after user acknowledges)
        _modalTitle.innerHTML  = '<svg class="ti ti-circle-check" style="vertical-align:middle;margin-right:6px;color:#22c55e"><use href="img/tabler-sprite.min.svg#tabler-circle-check"/></svg> Deployment Finalized';
        _modalBody.innerHTML   = `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 0">
          <svg class="ti ti-circle-check" style="width:3rem;height:3rem;color:#22c55e"><use href="img/tabler-sprite.min.svg#tabler-circle-check"/></svg>
          <p style="margin:0;font-size:1rem;font-weight:700;color:var(--text)">Deployment Finalized Successfully! 🚀</p>
          <div style="padding:12px 14px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border);font-size:0.85rem;width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:6px">
            <div><strong style="color:var(--text)">Version:</strong> v${_esc(window._jkSelectedDeployment?.version || '')}</div>
            <div><strong style="color:var(--text)">Deployed at:</strong> ${new Date(deployedAtIso).toLocaleString()}</div>
            <div><strong style="color:var(--text)">Deployed by:</strong> ${_esc(account || '(unknown)')}</div>
            ${commitId ? `<div><strong style="color:var(--text)">Commit:</strong> <code style="color:var(--turq)">${_esc(commitId)}</code>${commitMsg ? ` — ${_esc(commitMsg)}` : ''}</div>` : ''}
          </div>
          <p style="margin:0;font-size:0.82rem;color:var(--text-muted)">The deployment record has been updated in Supabase. You can close this dialog.</p>
        </div>`;
        _modalFooter.innerHTML = `<button class="btn btn-primary" id="dmFinalizeOkBtn">Done</button>`;
        document.getElementById('dmFinalizeOkBtn')?.addEventListener('click', () => {
          Modal.close();
          renderDeployment(); // refresh checklist to reflect new deployed status
        });
      }
    });
  };
  }, 200); // end deferred wiring — gives queued Modal.open() time to render before getElementById calls
}

function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Build deploy tab HTML (mirrors the template in tests.js) ─────
function _buildDeployTabHtml(state, notes) {
  const phases = DEPLOY_PHASES || [];
  if (!phases.length) return '<div style="padding:28px 32px;font-size:0.85rem;color:#9ca3af">Deployment checklist data unavailable.</div>';

  const totalSteps   = phases.reduce((n, p) => n + p.steps.length, 0);
  const doneSteps    = phases.reduce((n, p) => n + p.steps.filter(s => state[s.id] === 'completed').length, 0);
  const skippedSteps = phases.reduce((n, p) => n + p.steps.filter(s => state[s.id] === 'skipped').length, 0);
  const todoSteps    = totalSteps - doneSteps - skippedSteps;
  const pctDone      = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const statPill = (val, label, color) =>
    `<div class="stat"><div class="stat-val" style="color:${color}">${val}</div><div class="stat-lbl">${label}</div></div>`;
  const statsBar = `<div class="stats-bar">
        ${statPill(doneSteps, 'Done', '#3fbe71')}
        ${skippedSteps > 0 ? statPill(skippedSteps, 'Skipped', '#9ca3af') : ''}
        ${statPill(todoSteps, 'To Do', '#6b7280')}
        ${statPill(totalSteps, 'Total', '#374151')}
      </div>`;

  const _plainPreview = (html, max = 110) => {
    const s = String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
  };

  const _dcPill = (val, label, color) => val > 0
    ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${color}22;color:${color}">${val} ${label}</span>`
    : '';

  const _phaseEmoji = {
    'ti-git-commit':    '🔖',
    'ti-device-floppy': '💾',
    'ti-package':       '📦',
    'ti-world-upload':  '🌐',
    'ti-tag':           '🏷️',
  };
  const _phaseIconSvg = (iconKey) => {
    const emoji = _phaseEmoji[iconKey] || '';
    return emoji ? `<span style="font-size:14px;vertical-align:middle;margin-right:6px;line-height:1">${emoji}</span>` : '';
  };

  const phaseRows = phases.map((phase, pi) => {
    const phaseDone    = phase.steps.filter(s => state[s.id] === 'completed').length;
    const phaseSkipped = phase.steps.filter(s => state[s.id] === 'skipped').length;
    const phaseTotal   = phase.steps.length;
    const phaseTodo    = phaseTotal - phaseDone - phaseSkipped;
    const tbodyId = `deploy-sec-tbody-${phase.id}`;
    const btnId   = `deploy-sec-btn-${phase.id}`;
    const spacer  = pi > 0 ? `<tr><td colspan="3" style="padding:14px 0"></td></tr>` : '';
    const pillsHtml = `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;vertical-align:middle">`
      + _dcPill(phaseDone,    'Done',    '#3fbe71')
      + _dcPill(phaseSkipped, 'Skipped', '#9ca3af')
      + _dcPill(phaseTodo,    'To Do',   '#6b7280')
      + `</span>`;
    const header = `<tr style="cursor:pointer" onclick="(function(){var b=document.getElementById('${tbodyId}');var i=document.getElementById('${btnId}');var hidden=b.style.display==='none';b.style.display=hidden?'':'none';i.textContent=hidden?'▾':'▸';})()">
          <td colspan="3" style="padding:14px 12px 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;background:#f9fafb;border-top:2px solid #e5e7eb;user-select:none">
            <span id="${btnId}" style="margin-right:8px;font-size:20px;line-height:1;vertical-align:middle">▸</span>${_phaseIconSvg(phase.icon)}${_esc(phase.label)} <span style="font-weight:400;color:#9ca3af;letter-spacing:0;text-transform:none">(${phaseTotal})</span>
            ${pillsHtml}
          </td>
        </tr>`;
    const stepRows = phase.steps.map((step, si) => {
      const done    = state[step.id] === 'completed';
      const skipped = state[step.id] === 'skipped';
      const stepNum = `#${pi + 1}.${si + 1}`;
      const stateBtn = done
        ? `<button onclick="jkShowDeployStep('${step.id}')" style="display:inline-flex;align-items:center;gap:5px;padding:5px 13px;border-radius:20px;font-size:0.82rem;font-weight:700;background:rgba(63,190,113,0.12);color:#3fbe71;border:1px solid rgba(63,190,113,0.3);cursor:pointer;white-space:nowrap;line-height:1">✔ Done</button>`
        : skipped
          ? `<button onclick="jkShowDeployStep('${step.id}')" style="display:inline-flex;align-items:center;gap:5px;padding:5px 13px;border-radius:20px;font-size:0.82rem;font-weight:700;background:rgba(156,163,175,0.12);color:#9ca3af;border:1px solid rgba(156,163,175,0.25);cursor:pointer;white-space:nowrap;line-height:1">– Skipped</button>`
          : `<button onclick="jkShowDeployStep('${step.id}')" style="display:inline-flex;align-items:center;gap:5px;padding:5px 13px;border-radius:20px;font-size:0.82rem;font-weight:700;background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;cursor:pointer;white-space:nowrap;line-height:1">To Do</button>`;
      const preview = _plainPreview(step.text);
      return `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:7px 10px;font-size:12px;color:#9ca3af;font-weight:600;white-space:nowrap;vertical-align:middle;width:60px">${stepNum}</td>
            <td style="padding:7px 10px;font-size:12px;color:#1f2937;line-height:1.5;vertical-align:middle">${_esc(preview)}</td>
            <td style="padding:7px 10px;text-align:right;white-space:nowrap;vertical-align:middle;width:110px">${stateBtn}</td>
          </tr>`;
    }).join('');
    return `${spacer}${header}<tbody id="${tbodyId}" style="display:none">${stepRows}</tbody>`;
  }).join('');

  return `\n    ${statsBar}<table style="width:100%;border-collapse:collapse">${phaseRows}</table>\n`;
}

// ── Save Deploy Results ───────────────────────────────────────────
async function _saveDeployResults() {
  const sel = window._jkSelectedDeployment;
  const cfg = _loadDeployConfig();
  const version = sel?.version || cfg.version;
  const folder  = sel?.deployment_folder || cfg.folder;

  if (!version || !folder) {
    Modal.open(
      '<svg class="ti ti-alert-triangle" style="vertical-align:middle;margin-right:6px;color:#f59e0b"><use href="img/tabler-sprite.min.svg#tabler-alert-triangle"/></svg> Not Configured',
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
  // Use validIds so stale state keys from removed steps don't inflate counts
  const { total, done, skipped: skippedCount } = _deployTotals(state);
  const todoCount = total - done - skippedCount;

  // Persist check counts into deploy config so the release-docs Summary tab can display them
  _saveDeployConfig({ ..._loadDeployConfig(), deploy_checks_passed: done, deploy_checks_skipped: skippedCount, deploy_checks_todo: todoCount, deploy_checks_total: total });

  const sectionsHtml = DEPLOY_PHASES.map((phase, pi) => {
    const rows = phase.steps.map((step, si) => {
      const isDone    = state[step.id] === 'completed';
      const isSkipped = state[step.id] === 'skipped';
      const bg    = isDone ? 'background:#f0fdf4' : '';
      const color = isDone ? 'color:#16a34a' : isSkipped ? 'color:#9ca3af' : 'color:#374151';
      const status = isDone
        ? '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(63,190,113,0.12);color:#3fbe71;border:1px solid rgba(63,190,113,0.3)">✓ Done</span>'
        : isSkipped
          ? '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(156,163,175,0.12);color:#9ca3af;border:1px solid rgba(156,163,175,0.25)">– Skipped</span>'
          : '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;font-size:0.72rem;font-weight:700;background:rgba(107,114,128,0.12);color:#6b7280;border:1px solid rgba(107,114,128,0.3)">To Do</span>';
      return `<tr style="border-bottom:1px solid #e5e7eb;${bg}">
        <td style="padding:8px 12px;font-size:0.75rem;font-weight:600;color:#9ca3af;white-space:nowrap">#${pi+1}.${si+1}</td>
        <td style="padding:8px 12px;font-size:0.85rem;${color};line-height:1.5">${step.text}</td>
        <td style="padding:8px 12px;text-align:right;white-space:nowrap">${status}</td>
      </tr>`;
    }).join('');
    const phaseDone    = phase.steps.filter(s => state[s.id] === 'completed').length;
    const phaseSkipped = phase.steps.filter(s => state[s.id] === 'skipped').length;
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
    <div class="stat"><div class="stat-val" style="color:#3fbe71">${done}</div><div class="stat-lbl">Done</div></div>
    ${skippedCount > 0 ? `<div class="stat"><div class="stat-val" style="color:#9ca3af">${skippedCount}</div><div class="stat-lbl">Skipped</div></div>` : ''}
    <div class="stat"><div class="stat-val" style="color:#6b7280">${todoCount}</div><div class="stat-lbl">To Do</div></div>
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
    if (!result?.ok) throw new Error(result?.reason || 'Write failed');
    window.Toast?.success(`Saved: ${fileName}`);
    // Record in release docs changelog
    if (typeof _addChangelogEntry === 'function') _addChangelogEntry('Deployment — Results Saved');
  } catch (err) {
    alert(`Failed to save deployment results:\n${err.message}`);
    return;
  }

  // ── Also patch _jkDeploy in the release docs HTML so the Deployment Checklist tab reflects current state ──
  const releasePath = cfg.resultsFilePath || sel?.results_file;
  if (!releasePath) {
    window.Toast?.warning('Release docs path not set — open Testing → Manage Testing to configure.');
    return;
  }
  if (!window.electronAPI?.readFile) {
    return;
  }
  try {
    const notes = _loadDeployNotes();
    // Build _deployDetail matching the shape baked in by tests.js
    const newDeployDetail = {};
    DEPLOY_PHASES.forEach((phase, pi) => {
      phase.steps.forEach((step, si) => {
        newDeployDetail[step.id] = {
          id: step.id,
          stepNum: `${pi + 1}.${si + 1}`,
          phaseId: phase.id,
          phaseLabel: phase.label,
          phaseColor: phase.color,
          phaseIcon: phase.icon,
          text: step.text,
          cmd: step.cmd || null,
          done: state[step.id] === 'completed',
          skipped: state[step.id] === 'skipped',
          note: notes[step.id] || '',
        };
      });
    });
    const readResult = await window.electronAPI.readFile(releasePath);
    if (!readResult?.ok || !readResult?.content) throw new Error(readResult?.reason || 'Could not read release docs file');
    let content = readResult.content;

    // ── 1. Patch _jkDeploy data blob ──────────────────────────────────────
    const MARKER = 'const _jkDeploy = ';
    const markerIdx = content.indexOf(MARKER);
    if (markerIdx === -1) throw new Error('_jkDeploy marker not found in release docs HTML — re-save from the Testing page first');
    const lineEnd = content.indexOf('\n', markerIdx);
    const endIdx  = lineEnd === -1 ? content.length : lineEnd;
    const newBlob = `${MARKER}${JSON.stringify(newDeployDetail).replace(/<\/script>/gi, '<\\u002fscript>')};`;
    content = content.slice(0, markerIdx) + newBlob + content.slice(endIdx);

    // ── 2. Replace deployment tab body HTML between markers ───────────────
    const TAB_START = '<!-- JK_DEPLOY_TAB_BODY_START -->';
    const TAB_END   = '<!-- JK_DEPLOY_TAB_BODY_END -->';
    const tabStartIdx = content.indexOf(TAB_START);
    const tabEndIdx   = content.indexOf(TAB_END);
    if (tabStartIdx !== -1 && tabEndIdx !== -1 && tabEndIdx > tabStartIdx) {
      const freshTabHtml = _buildDeployTabHtml(state, notes);
      content = content.slice(0, tabStartIdx + TAB_START.length)
              + freshTabHtml
              + content.slice(tabEndIdx);
    } else {
    }

    const writeResult = await window.electronAPI.writeFileDirect(releasePath, content);
    if (!writeResult?.ok) throw new Error(writeResult?.reason || 'Write failed');
    window.Toast?.success('Release docs updated ✔');
  } catch (err) {
    window.Toast?.danger(`Release docs update failed: ${err.message}`);
  }

  // Re-bake the full release docs HTML so the Summary tab picks up the latest
  // jk_deploy_config values (commit_id, backup_path, etc.) that were saved by
  // the step input boxes. This overwrites the patch above with an equivalent
  // full rebuild — all fields are read fresh from localStorage.
  try {
    if (typeof _autoSaveAllSections === 'function') await _autoSaveAllSections();
  } catch (e) { console.warn('[saveDeployResults] autoSave after patch failed:', e); }
}
