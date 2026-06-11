// ============================================================
// JumpKit — Onboarding Modal
// ============================================================
// 5-step inline onboarding shown once after first login.
// Step 1: Welcome
// Step 2: ROI Setup
// Step 3: Configure Columns
// Step 4: Add First Jump
// Step 5: Keep or Remove example jumps
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
        <div id="onboardingProgress" style="height:100%;background:linear-gradient(90deg,#50CACC,#1A4FD6);width:20%;transition:width 0.4s ease;border-radius:4px"></div>
      </div>
      <div id="onboardingContent" style="padding:40px 36px 32px"></div>
    </div>`;

  document.body.appendChild(overlay);
  renderOnboardingStep(1, firstName);
}

function setOnboardingProgress(step) {
  const pct = step === 1 ? '20%' : step === 2 ? '40%' : step === 3 ? '60%' : step === 4 ? '80%' : '100%';
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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.74 122.88" fill="#50CACC" style="width:32px;height:32px;display:block"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83 c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg>
        </div>
        <h2 style="color:var(--text);font-size:1.4rem;font-weight:700;margin:0 0 12px">Welcome to JumpKit! 🎉</h2>
        <p style="color:var(--text-muted);font-size:0.93rem;line-height:1.7;margin:0 0 32px">
          Let's get you set up in under a minute. We'll walk you through four quick steps so JumpKit is ready to use right away.
        </p>
        <button id="obNext1" class="btn btn-primary" style="width:100%;padding:13px;font-size:0.95rem;font-weight:700">
          Let's Go <svg class="ti ti-arrow-right" style="vertical-align:middle;margin-left:6px;color:#fff;width:20px;height:20px;stroke-width:3"><use href="img/tabler-sprite.svg#tabler-arrow-right"/></svg>
        </button>
      </div>`;
    document.getElementById('obNext1').addEventListener('click', () => renderOnboardingStep(2, firstName));

  } else if (step === 2) {
    // ROI Setup step
    const prefs = DB.getPrefs(currentUser.id);
    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <div style="width:52px;height:52px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg class="ti ti-clock-dollar" style="width:26px;height:26px;color:#50CACC"><use href="img/tabler-sprite.svg#tabler-clock-dollar"/></svg>
          </div>
          <div>
            <h2 style="color:var(--text);font-size:1.15rem;font-weight:700;margin:0 0 2px">Set Up Your ROI</h2>
            <p style="color:var(--text-muted);font-size:0.8rem;margin:0;opacity:0.7">Step 1 of 4</p>
          </div>
        </div>
        <p style="color:var(--text-muted);font-size:0.88rem;line-height:1.6;margin:0 0 18px">
          JumpKit tracks time and money saved every time you launch a jump. Set your defaults &mdash; you can change these any time in Settings.
        </p>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:5px">
            Time saved per click
            <span style="font-weight:400;opacity:0.7"> (seconds)</span>
          </label>
          <div style="display:flex;align-items:center;gap:10px">
            <input id="obTimePerClick" type="number" min="1" max="600" value="${prefs.timePerClick || 10}"
              style="flex:1;background:var(--bg-input);border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:0.9rem;outline:none;box-sizing:border-box" />
            <span style="color:var(--text-muted);font-size:0.85rem;white-space:nowrap;flex-shrink:0">sec / click</span>
          </div>
          <p style="color:var(--text-muted);font-size:0.78rem;margin:5px 0 0;opacity:0.65">How many seconds does using a jump save you vs. navigating manually?</p>
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:5px">
            Your hourly rate
            <span style="font-weight:400;opacity:0.7"> ($/hr)</span>
          </label>
          <div style="display:flex;align-items:center;gap:10px">
            <input id="obDollarsPerHour" type="number" min="1" max="10000" value="${prefs.dollarsPerHour || 50}"
              style="flex:1;background:var(--bg-input);border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:0.9rem;outline:none;box-sizing:border-box" />
            <span style="color:var(--text-muted);font-size:0.85rem;white-space:nowrap;flex-shrink:0">$ / hr</span>
          </div>
          <p style="color:var(--text-muted);font-size:0.78rem;margin:5px 0 0;opacity:0.65">Used to calculate the dollar value of time saved &mdash; yours and your team's.</p>
        </div>
        <div id="obRoiErr" style="color:#f87171;font-size:0.82rem;margin-bottom:10px;display:none"></div>
        <div style="display:flex;gap:10px">
          <button id="obBack2" class="btn btn-subtle" style="flex:0 0 auto;padding:11px 18px">
            <svg class="ti ti-arrow-left" style="vertical-align:middle"><use href="img/tabler-sprite.svg#tabler-arrow-left"/></svg>
          </button>
          <button id="obNextRoi" class="btn btn-primary" style="flex:1;padding:13px;font-size:0.95rem;font-weight:700">
            Save & Continue <svg class="ti ti-arrow-right" style="vertical-align:middle;margin-left:6px;color:#fff;width:20px;height:20px;stroke-width:3"><use href="img/tabler-sprite.svg#tabler-arrow-right"/></svg>
          </button>
        </div>
      </div>`;

    document.getElementById('obBack2').addEventListener('click', () => renderOnboardingStep(1, firstName));
    document.getElementById('obNextRoi').addEventListener('click', () => {
      const tpc = parseInt(document.getElementById('obTimePerClick').value, 10);
      const dph = parseInt(document.getElementById('obDollarsPerHour').value, 10);
      const errEl = document.getElementById('obRoiErr');
      errEl.style.display = 'none';
      if (!tpc || tpc < 1) { errEl.textContent = 'Please enter a valid time per click (min 1 second).'; errEl.style.display = 'block'; return; }
      if (!dph || dph < 1) { errEl.textContent = 'Please enter a valid hourly rate (min $1).'; errEl.style.display = 'block'; return; }
      DB.savePrefs(currentUser.id, { timePerClick: tpc, dollarsPerHour: dph });
      renderOnboardingStep(3, firstName);
    });

  } else if (step === 3) {
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
          <div style="width:52px;height:52px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg class="ti ti-layout-columns" style="width:26px;height:26px;color:#50CACC"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg>
          </div>
          <div>
            <h2 style="color:var(--text);font-size:1.15rem;font-weight:700;margin:0 0 2px">Configure Your Columns</h2>
            <p style="color:var(--text-muted);font-size:0.8rem;margin:0;opacity:0.7">Step 2 of 4</p>
          </div>
        </div>
        <p style="color:var(--text-muted);font-size:0.88rem;line-height:1.6;margin:0 0 16px">
          Columns are the categories you use to organize your jumps. Name them to match how you work — e.g. <em>Projects</em>, <em>Tools</em>, <em>Clients</em>. Use the <strong style="color:var(--text)">Visible</strong> checkbox to show or hide each column in your jumps view.
        </p>
        <div id="obColRows" style="max-height:260px;overflow-y:auto;padding-right:4px">${rows}</div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button id="obBackCols" class="btn btn-subtle" style="flex:0 0 auto;padding:11px 18px">
            <svg class="ti ti-arrow-left" style="vertical-align:middle"><use href="img/tabler-sprite.svg#tabler-arrow-left"/></svg>
          </button>
          <button id="obNextCols" class="btn btn-primary" style="flex:1;padding:13px;font-size:0.95rem;font-weight:700">
            Save & Continue <svg class="ti ti-arrow-right" style="vertical-align:middle;margin-left:6px;color:#fff;width:20px;height:20px;stroke-width:3"><use href="img/tabler-sprite.svg#tabler-arrow-right"/></svg>
          </button>
        </div>
      </div>`;

    document.getElementById('obBackCols').addEventListener('click', () => renderOnboardingStep(2, firstName));
    document.getElementById('obNextCols').addEventListener('click', () => {
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
      renderOnboardingStep(4, firstName);
    });

  } else if (step === 4) {
    // Build column dropdown from visible columns
    const cols = DB.getColumns(currentUser.id).filter(c => c.visible).sort((a, b) => a.order - b.order);
    const colOptions = cols.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');

    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <div style="width:52px;height:52px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.74 122.88" fill="#50CACC" style="width:26px;height:26px;display:block"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83 c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg>
          </div>
          <div>
            <h2 style="color:var(--text);font-size:1.15rem;font-weight:700;margin:0 0 2px">Add Your First Jump</h2>
            <p style="color:var(--text-muted);font-size:0.8rem;margin:0;opacity:0.7">Step 3 of 4</p>
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
            <svg class="ti ti-check" style="vertical-align:middle;margin-right:6px;color:#fff;width:20px;height:20px;stroke-width:3"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save and Finish
          </button>
        </div>
      </div>`;

    document.getElementById('obBack3').addEventListener('click', () => renderOnboardingStep(3, firstName));

    // Wire custom column select — use fixed positioning so menu escapes modal overflow
    const obTrigger = document.getElementById('obColTrigger');
    const obMenu    = document.getElementById('obColMenu');
    const obSelect  = document.getElementById('obColSelect');
    if (obTrigger && obMenu) {
      // Override menu to fixed position so it overlays the modal
      obMenu.style.position = 'fixed';
      obMenu.style.zIndex   = '99999';
      obMenu.style.minWidth = '0'; // prevent CSS min-width:100% expanding to viewport

      function positionObMenu() {
        const trigRect = obTrigger.getBoundingClientRect();
        obMenu.style.left     = trigRect.left + 'px';
        obMenu.style.top      = (trigRect.bottom + 4) + 'px';
        obMenu.style.width    = trigRect.width + 'px';
        obMenu.style.maxWidth = trigRect.width + 'px';
      }

      obTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = obMenu.classList.contains('open');
        obMenu.classList.toggle('open', !isOpen);
        obSelect.classList.toggle('open', !isOpen);
        if (!isOpen) positionObMenu();
      });

      obMenu.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          document.getElementById('obJumpCol').value = opt.dataset.value;
          document.getElementById('obColLabel').textContent = opt.textContent;
          obMenu.classList.remove('open');
          obSelect.classList.remove('open');
        });
      });

      document.addEventListener('click', function closeObDrop(e) {
        if (!obSelect.contains(e.target) && !obMenu.contains(e.target)) {
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
      const btn     = document.getElementById('obFinish');
      errEl.style.display = 'none';

      if (!name) { errEl.textContent = 'Please enter a name.'; errEl.style.display = 'block'; return; }
      if (!url)  { errEl.textContent = 'Please enter a URL or path.'; errEl.style.display = 'block'; return; }

      // Show spinner
      btn.disabled = true;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="width:20px;height:20px;vertical-align:middle;animation:ob-spin 1.4s linear infinite"><circle cx="12" cy="12" r="9" stroke-opacity="0.3"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>`;

      // Inject spin animation once
      if (!document.getElementById('ob-spin-style')) {
        const s = document.createElement('style');
        s.id = 'ob-spin-style';
        s.textContent = '@keyframes ob-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(s);
      }

      // Save the jump
      DB.createJump(currentUser.id, { name, url, columnId: colId, favorite: false, hotkey: '', notes: '' });

      // Go to seed jumps step
      renderOnboardingStep(5, firstName);
    });
  } else if (step === 5) {
    // Seed jumps step — keep or remove example jumps
    const seedUrls = ['https://google.com', 'https://slack.com', '~', 'C:\\'];
    const seedJumps = DB.getJumps(currentUser.id).filter(j =>
      !j.isArchived && seedUrls.some(u => j.url === u)
    );

    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <div style="width:52px;height:52px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg class="ti ti-list-check" style="width:26px;height:26px;color:#50CACC"><use href="img/tabler-sprite.svg#tabler-list-check"/></svg>
          </div>
          <div>
            <h2 style="color:var(--text);font-size:1.15rem;font-weight:700;margin:0 0 2px">Example Jumps</h2>
            <p style="color:var(--text-muted);font-size:0.8rem;margin:0;opacity:0.7">Step 4 of 4</p>
          </div>
        </div>
        <p style="color:var(--text-muted);font-size:0.88rem;line-height:1.6;margin:12px 0 16px">
          We added a few example jumps to help you get started. Check the ones you want to keep &mdash; uncheck any you don't need.
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
          ${seedJumps.slice(0, 4).map(j => { const isDir = /^(~|[A-Za-z]:\\|\/)/.test(j.url); return `
            <label style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border);cursor:pointer">
              <input type="checkbox" class="ob-seed-cb" data-jumpid="${escHtml(j.id)}" checked
                style="width:16px;height:16px;accent-color:#50CACC;cursor:pointer;flex-shrink:0" />
              <svg class="ti" style="width:15px;height:15px;color:var(--text-muted);flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-${isDir ? 'folder' : 'link'}"/></svg>
              <span style="font-size:0.88rem;color:var(--text);font-weight:500;flex:1">${escHtml(j.name)}</span>
              <span style="font-size:0.78rem;color:var(--text-muted);opacity:0.65;white-space:nowrap">${escHtml(j.url)}</span>
            </label>`;}).join('')}
        </div>
        <div style="display:flex;gap:10px">
          <button id="obBack5" class="btn btn-subtle" style="flex:0 0 auto;padding:11px 18px">
            <svg class="ti ti-arrow-left" style="vertical-align:middle"><use href="img/tabler-sprite.svg#tabler-arrow-left"/></svg>
          </button>
          <button id="obFinishSeed" class="btn btn-primary" style="flex:1;padding:13px;font-size:0.95rem;font-weight:700">
            <svg class="ti ti-check" style="vertical-align:middle;margin-right:6px;color:#fff;width:20px;height:20px;stroke-width:3"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Finish
          </button>
        </div>
      </div>`;

    document.getElementById('obBack5').addEventListener('click', () => renderOnboardingStep(4, firstName));

    document.getElementById('obFinishSeed').addEventListener('click', async () => {
      // Delete unchecked seed jumps
      document.querySelectorAll('.ob-seed-cb').forEach(cb => {
        if (!cb.checked) {
          const j = seedJumps.find(s => s.id === cb.dataset.jumpid);
          if (j) DB.deleteJump(currentUser.id, j.id);
        }
      });
      await markOnboardingComplete();
      renderOnboardingComplete();
    });
  }
}

function renderOnboardingComplete() {
  setOnboardingProgress(4); // fill bar to 100%
  const content = document.getElementById('onboardingContent');
  if (!content) return;
  content.innerHTML = `
    <div style="text-align:center">
      <div style="width:64px;height:64px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
        <svg viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <h2 style="color:var(--text);font-size:1.4rem;font-weight:700;margin:0 0 12px">You're all set! 🎉</h2>
      <p style="color:var(--text-muted);font-size:0.93rem;line-height:1.7;margin:0 0 32px">
        Your columns are configured and your first jump is saved. Time to start jumping!
      </p>
      <button id="obGoToJumps" class="btn btn-primary" style="width:100%;padding:13px;font-size:0.95rem;font-weight:700">
        Go to Your Jumps Page <svg class="ti ti-arrow-right" style="vertical-align:middle;margin-left:6px;color:#fff;width:20px;height:20px;stroke-width:3"><use href="img/tabler-sprite.svg#tabler-arrow-right"/></svg>
      </button>
    </div>`;

  document.getElementById('obGoToJumps').addEventListener('click', () => {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.remove();
    if (typeof navigateTo === 'function') { navigateTo('jumps'); }
    else if (typeof renderColumns === 'function') { renderColumns(); }
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
