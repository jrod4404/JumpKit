// ============================================================
// JumpKit — Onboarding Modal
// ============================================================
// 3-step inline onboarding shown once after first login.
// Step 1: Welcome
// Step 2: Configure Columns
// Step 3: Add First Jump
// Tracked server-side via profiles.onboarding_completed
// ============================================================

async function checkAndShowOnboarding() {
  if (!_supabaseUser) return;
  try {
    const { data } = await supabaseClient
      .from('profiles')
      .select('onboarding_completed, first_name')
      .eq('id', _supabaseUser.id)
      .single();
    if (!data || data.onboarding_completed) return;
    showOnboardingModal(data.first_name || '');
  } catch (_) {}
}

async function markOnboardingComplete() {
  if (!_supabaseUser) return;
  try {
    await supabaseClient
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', _supabaseUser.id);
  } catch (_) {}
}

function showOnboardingModal(firstName) {
  // Remove any existing onboarding overlay
  const existing = document.getElementById('onboardingOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'onboardingOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9998;padding:20px';

  overlay.innerHTML = `
    <div id="onboardingCard" style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;width:100%;max-width:520px;box-shadow:0 8px 40px rgba(0,0,0,0.5);overflow:hidden">
      <!-- Progress bar -->
      <div style="height:4px;background:var(--bg-input);position:relative">
        <div id="onboardingProgress" style="height:100%;background:linear-gradient(90deg,#50CACC,#1A4FD6);width:33.3%;transition:width 0.4s ease;border-radius:4px"></div>
      </div>
      <div id="onboardingContent" style="padding:40px 36px 32px"></div>
    </div>`;

  document.body.appendChild(overlay);
  renderOnboardingStep(1, firstName);
}

function setOnboardingProgress(step) {
  const pct = step === 1 ? '33.3%' : step === 2 ? '66.6%' : '100%';
  const bar = document.getElementById('onboardingProgress');
  if (bar) bar.style.width = pct;
}

function renderOnboardingStep(step, firstName) {
  setOnboardingProgress(step);
  const content = document.getElementById('onboardingContent');
  if (!content) return;

  if (step === 1) {
    content.innerHTML = `
      <div style="text-align:center">
        <div style="width:64px;height:64px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
          <svg viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <h2 style="color:var(--text);font-size:1.4rem;font-weight:700;margin:0 0 12px">Welcome to JumpKit! 🎉</h2>
        <p style="color:var(--text-muted);font-size:0.93rem;line-height:1.7;margin:0 0 32px">
          Let's get you set up in under a minute. We'll walk you through two quick steps so JumpKit is ready to use right away.
        </p>
        <button id="obNext1" class="btn btn-primary" style="width:100%;padding:13px;font-size:0.95rem;font-weight:700">
          Let's Go <svg class="ti ti-arrow-right" style="vertical-align:middle;margin-left:4px;color:#fff"><use href="img/tabler-sprite.svg#tabler-arrow-right"/></svg>
        </button>
      </div>`;
    document.getElementById('obNext1').addEventListener('click', () => renderOnboardingStep(2, firstName));

  } else if (step === 2) {
    // Build column config rows from current user's columns
    const cols = DB.getColumns(currentUser.id);
    const rows = cols.map((c, i) => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="color:var(--text-muted);font-size:0.8rem;width:18px;text-align:right;flex-shrink:0">${i + 1}</span>
        <input type="text" class="ob-col-name" data-colid="${escHtml(c.id)}" value="${escHtml(c.name)}"
          style="flex:1;background:var(--bg-input);border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:0.88rem;outline:none"
          placeholder="Column name" maxlength="32" />
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0">
          <input type="checkbox" class="ob-col-vis" data-colid="${escHtml(c.id)}" ${c.visible ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:#50CACC;cursor:pointer" />
          <span style="color:var(--text-muted);font-size:0.8rem">Visible</span>
        </label>
      </div>`).join('');

    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <div style="width:40px;height:40px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg class="ti ti-layout-columns" style="width:20px;height:20px;color:#50CACC"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg>
          </div>
          <div>
            <h2 style="color:var(--text);font-size:1.15rem;font-weight:700;margin:0 0 2px">Configure Your Columns</h2>
            <p style="color:var(--text-muted);font-size:0.8rem;margin:0;opacity:0.7">Step 1 of 2</p>
          </div>
        </div>
        <p style="color:var(--text-muted);font-size:0.88rem;line-height:1.6;margin:0 0 6px">
          Columns are the categories you use to organize your jumps. Name them to match how you work — e.g. <em>Projects</em>, <em>Tools</em>, <em>Clients</em>.
        </p>
        <p style="color:var(--text-muted);font-size:0.82rem;line-height:1.5;margin:0 0 16px;opacity:0.75">
          Use the <strong style="color:var(--text)">Visible</strong> checkbox to show or hide each column in your jumps view.
        </p>
        <div id="obColRows" style="max-height:260px;overflow-y:auto;padding-right:4px">${rows}</div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button id="obBack2" class="btn btn-subtle" style="flex:0 0 auto;padding:11px 18px">
            <svg class="ti ti-arrow-left" style="vertical-align:middle"><use href="img/tabler-sprite.svg#tabler-arrow-left"/></svg>
          </button>
          <button id="obNext2" class="btn btn-primary" style="flex:1;padding:13px;font-size:0.95rem;font-weight:700">
            Save & Continue <svg class="ti ti-arrow-right" style="vertical-align:middle;margin-left:4px"><use href="img/tabler-sprite.svg#tabler-arrow-right"/></svg>
          </button>
        </div>
      </div>`;

    document.getElementById('obBack2').addEventListener('click', () => renderOnboardingStep(1, firstName));
    document.getElementById('obNext2').addEventListener('click', () => {
      // Save column names + visibility
      const nameInputs = document.querySelectorAll('.ob-col-name');
      const visInputs  = document.querySelectorAll('.ob-col-vis');
      let cols = DB.getColumns(currentUser.id);
      nameInputs.forEach(inp => {
        const id = inp.dataset.colid;
        cols = cols.map(c => c.id === id ? { ...c, name: inp.value.trim() || c.name } : c);
      });
      visInputs.forEach(inp => {
        const id = inp.dataset.colid;
        cols = cols.map(c => c.id === id ? { ...c, visible: inp.checked } : c);
      });
      DB.saveColumns(currentUser.id, cols);
      renderOnboardingStep(3, firstName);
    });

  } else if (step === 3) {
    // Build column dropdown from visible columns
    const cols = DB.getColumns(currentUser.id).filter(c => c.visible).sort((a, b) => a.order - b.order);
    const colOptions = cols.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');

    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <div style="width:40px;height:40px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div>
            <h2 style="color:var(--text);font-size:1.15rem;font-weight:700;margin:0 0 2px">Add Your First Jump</h2>
            <p style="color:var(--text-muted);font-size:0.8rem;margin:0;opacity:0.7">Step 2 of 2</p>
          </div>
        </div>
        <p style="color:var(--text-muted);font-size:0.88rem;line-height:1.6;margin:0 0 18px">
          A Jump is any URL, folder path, or file share you want instant access to. Add your most-used one now.
        </p>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:5px">Name</label>
          <input id="obJumpName" type="text" placeholder="e.g. Jira Board" maxlength="60"
            style="width:100%;background:var(--bg-input);border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:0.9rem;outline:none;box-sizing:border-box" />
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:5px">URL or Path</label>
          <input id="obJumpUrl" type="text" placeholder="https://... or \\\\server\\share"
            style="width:100%;background:var(--bg-input);border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:0.9rem;outline:none;box-sizing:border-box" />
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:5px">Column</label>
          <div class="custom-select" id="obColSelect" tabindex="0">
            <div class="custom-select-trigger" id="obColTrigger">
              <span id="obColLabel">${cols.length ? escHtml(cols[0].name) : ''}</span>
              <svg class="ti ti-chevron-down" style="width:16px;height:16px;opacity:0.6"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
            </div>
            <div class="custom-select-menu" id="obColMenu">
              ${cols.map(c => `<div class="custom-select-option" data-value="${escHtml(c.id)}">${escHtml(c.name)}</div>`).join('')}
            </div>
          </div>
          <input type="hidden" id="obJumpCol" value="${cols.length ? escHtml(cols[0].id) : ''}" />
        </div>
        <div id="obJumpErr" style="color:#f87171;font-size:0.82rem;margin-bottom:10px;display:none"></div>
        <div style="display:flex;gap:10px">
          <button id="obBack3" class="btn btn-subtle" style="flex:0 0 auto;padding:11px 18px">
            <svg class="ti ti-arrow-left" style="vertical-align:middle"><use href="img/tabler-sprite.svg#tabler-arrow-left"/></svg>
          </button>
          <button id="obFinish" class="btn btn-primary" style="flex:1;padding:13px;font-size:0.95rem;font-weight:700">
            <svg class="ti ti-check" style="vertical-align:middle;margin-right:4px"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Finish Setup
          </button>
        </div>
      </div>`;

    document.getElementById('obBack3').addEventListener('click', () => renderOnboardingStep(2, firstName));

    // Wire custom column select
    const obTrigger = document.getElementById('obColTrigger');
    const obMenu    = document.getElementById('obColMenu');
    const obSelect  = document.getElementById('obColSelect');
    if (obTrigger && obMenu) {
      obTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        obMenu.classList.toggle('open');
        obSelect.classList.toggle('open');
      });
      obMenu.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.addEventListener('click', () => {
          document.getElementById('obJumpCol').value = opt.dataset.value;
          document.getElementById('obColLabel').textContent = opt.textContent;
          obMenu.classList.remove('open');
          obSelect.classList.remove('open');
        });
      });
      document.addEventListener('click', function closeObDrop(e) {
        if (!obSelect.contains(e.target)) {
          obMenu.classList.remove('open');
          obSelect.classList.remove('open');
          document.removeEventListener('click', closeObDrop);
        }
      });
    }

    document.getElementById('obFinish').addEventListener('click', async () => {
      const name    = document.getElementById('obJumpName').value.trim();
      const url     = document.getElementById('obJumpUrl').value.trim();
      const colId   = document.getElementById('obJumpCol').value;
      const errEl   = document.getElementById('obJumpErr');
      errEl.style.display = 'none';

      if (!name) { errEl.textContent = 'Please enter a name.'; errEl.style.display = 'block'; return; }
      if (!url)  { errEl.textContent = 'Please enter a URL or path.'; errEl.style.display = 'block'; return; }

      // Save the jump
      DB.addJump(currentUser.id, { name, url, columnId: colId, favorite: false, hotkey: '', notes: '' });

      // Mark onboarding complete server-side
      await markOnboardingComplete();

      // Close overlay, refresh jumps view
      const overlay = document.getElementById('onboardingOverlay');
      if (overlay) overlay.remove();
      if (typeof renderColumns === 'function') renderColumns();
    });
  }
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
