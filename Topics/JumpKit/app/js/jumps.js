// ── Jumps Page ─────────────────────────────────────────────────────
let currentJumpFilter = 'active';
const JUMP_FILTERS = ['active','favorites','recent','most-used','archive'];
const FILTER_LABELS = { active:'Active', favorites:'Favorites', recent:'Recent', 'most-used':'Most Used', archive:'Archive' };

function renderJumps() {
  const content = document.getElementById('pageContent');
  content.classList.add('jumps-page');
  refreshStatsBar();
  content.innerHTML = `
    <div class="page-stats-bar">
      <div class="jumps-toolbar">
        <button class="btn btn-subtle btn-sm" id="btnAddJump"><svg class="ti ti-plus"><use href="img/tabler-sprite.svg#tabler-plus"/></svg> Add Jump</button>
        <button class="btn btn-subtle btn-sm" id="btnConfigCols"><svg class="ti ti-layout-columns"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg> Configure Columns</button>
      </div>
      <div class="jump-filter-bar" id="jumpFilterBar">
        <div class="jfb-slider" id="jfbSlider"></div>
        ${JUMP_FILTERS.map(f => `<button class="jfb-tab${f===currentJumpFilter?' active':''}" data-filter="${f}">${FILTER_LABELS[f]}</button>`).join('')}
      </div>
      <div class="jump-search-wrap">
        <svg class="ti ti-search jump-search-icon"><use href="img/tabler-sprite.svg#tabler-search"/></svg>
        <input class="jump-search-input" id="jumpSearch" type="text" placeholder="Search jumps…" autocomplete="off">
      </div>
    </div>
    <div class="columns-area" id="columnsArea"></div>`;

  document.getElementById('btnAddJump').addEventListener('click', () => openAddJumpModal());
  document.getElementById('btnConfigCols').addEventListener('click', () => openConfigColumnsModal());

  document.getElementById('jumpFilterBar').addEventListener('click', e => {
    const tab = e.target.closest('.jfb-tab');
    if (!tab) return;
    currentJumpFilter = tab.dataset.filter;
    document.querySelectorAll('.jfb-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === currentJumpFilter));
    positionFilterSlider();
    refreshStatsBar();
    applyJumpFilter();
  });

  positionFilterSlider();

  document.getElementById('jumpSearch').addEventListener('input', () => applyJumpFilter());

  document.getElementById('columnsArea').addEventListener('contextmenu', e => {
    if (e.target.closest('.jump-item')) return;
    e.preventDefault();
    CtxMenu.show(e.clientX, e.clientY, [
      { icon: '<svg class="ti ti-plus"><use href="img/tabler-sprite.svg#tabler-plus"/></svg>',     label: 'Add Jump',          action: openAddJumpModal },
      { icon: '<svg class="ti ti-settings"><use href="img/tabler-sprite.svg#tabler-settings"/></svg>',  label: 'Configure Columns', action: openConfigColumnsModal },
    ]);
  });

  applyJumpFilter();
}

function positionFilterSlider() {
  const bar = document.getElementById('jumpFilterBar');
  const active = bar && bar.querySelector('.jfb-tab.active');
  const slider = document.getElementById('jfbSlider');
  if (!active || !slider) return;
  slider.style.width  = active.offsetWidth + 'px';
  slider.style.left   = active.offsetLeft + 'px';
}

function applyJumpFilter() {
  const area = document.getElementById('columnsArea');
  if (currentJumpFilter === 'archive') {
    if (area) { area.style.display = ''; area.style.position = ''; }
    renderArchivedInline();
    return;
  }
  if (area) { area.style.display = ''; area.style.position = ''; }
  renderColumns();
}

function getSearchTerm() {
  const el = document.getElementById('jumpSearch');
  return el ? el.value.trim().toLowerCase() : '';
}

function getFilteredJumps() {
  let all = DB.getActiveJumps(currentUser.id);
  if (currentJumpFilter === 'favorites') all = all.filter(j => j.favorite);
  else if (currentJumpFilter === 'recent') {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    all = all.filter(j => j.lastUsed && j.lastUsed >= cutoff);
  } else if (currentJumpFilter === 'most-used') {
    const sorted = [...all].sort((a, b) => (b.clickCount||0) - (a.clickCount||0));
    all = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.1)));
  }
  const q = getSearchTerm();
  if (q) all = all.filter(j =>
    j.name.toLowerCase().includes(q) ||
    (j.url  && j.url.toLowerCase().includes(q)) ||
    (j.description && j.description.toLowerCase().includes(q))
  );
  return all;
}


function renderArchivedInline() {
  const area = document.getElementById('columnsArea');
  if (!area) return;
  area.innerHTML = '';
  area.style.gridTemplateColumns = '1fr';
  area.style.position = '';

  const jumps = DB.getArchivedJumps(currentUser.id);
  const q = getSearchTerm();
  const filtered = q ? jumps.filter(j =>
    j.name.toLowerCase().includes(q) ||
    (j.url && j.url.toLowerCase().includes(q)) ||
    (j.description && j.description.toLowerCase().includes(q))
  ) : jumps;

  if (filtered.length === 0) {
    area.innerHTML = `<div class="no-columns" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100%">
      <div class="big-icon"><svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg></div>
      <p>${q ? 'No archived jumps match your search.' : 'Archive is empty.'}</p>
    </div>`;
    area.style.position = 'relative';
    return;
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:100%;overflow-x:auto';
  wrapper.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border)" id="archiveSortRow">
          <th data-sort="name" style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;user-select:none">Name <svg class="ti ti-selector" style="font-size:0.7rem;opacity:.5"><use href="img/tabler-sprite.svg#tabler-selector"/></svg></th>
          <th data-sort="url" style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;user-select:none">URL <svg class="ti ti-selector" style="font-size:0.7rem;opacity:.5"><use href="img/tabler-sprite.svg#tabler-selector"/></svg></th>
          <th data-sort="lastused" style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;user-select:none">Last Used <svg class="ti ti-selector" style="font-size:0.7rem;opacity:.5"><use href="img/tabler-sprite.svg#tabler-selector"/></svg></th>
          <th data-sort="updatedat" style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;user-select:none">Archived <svg class="ti ti-selector" style="font-size:0.7rem;opacity:.5"><use href="img/tabler-sprite.svg#tabler-selector"/></svg></th>
          <th style="padding:8px 12px;text-align:right;color:var(--text-muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(j => `
        <tr class="archive-row" data-jid="${j.id}" data-name="${esc(j.name).toLowerCase()}" data-url="${esc(j.url).toLowerCase()}" data-lastused="${j.lastUsed||0}" data-updatedat="${j.updatedAt||0}" style="border-bottom:1px solid var(--border);cursor:default;transition:background .15s">
          <td style="padding:10px 12px;font-weight:600;color:var(--text)">${esc(j.name)}</td>
          <td style="padding:10px 12px;color:var(--text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.url)}</td>
          <td style="padding:10px 12px;color:var(--text-muted);white-space:nowrap">${fmtDate(j.lastUsed)}</td>
          <td style="padding:10px 12px;color:var(--text-muted);white-space:nowrap">${fmtDate(j.updatedAt)}</td>
          <td style="padding:10px 12px;text-align:right;white-space:nowrap">
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn btn-subtle" style="font-size:0.78rem;padding:4px 10px" data-jaction="confirm-unarchive" data-id="${esc(j.id)}"><svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore</button>
              <button class="btn btn-delete" style="font-size:0.78rem;padding:4px 10px" data-jaction="confirm-delete" data-id="${esc(j.id)}"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  area.appendChild(wrapper);

  // Sortable column headers
  let _archiveSortCol = null, _archiveSortAsc = true;
  wrapper.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (_archiveSortCol === col) _archiveSortAsc = !_archiveSortAsc;
      else { _archiveSortCol = col; _archiveSortAsc = true; }
      // Update icons
      wrapper.querySelectorAll('th[data-sort] .ti').forEach(i => { i.className = 'ti ti-selector'; i.style.opacity = '.5'; });
      th.querySelector('.ti').className = _archiveSortAsc ? 'ti ti-sort-ascending' : 'ti ti-sort-descending';
      th.querySelector('.ti').style.opacity = '1';
      // Sort rows
      const tbody = wrapper.querySelector('tbody');
      const rows = [...tbody.querySelectorAll('.archive-row')];
      rows.sort((a, b) => {
        const av = a.dataset[col] || '';
        const bv = b.dataset[col] || '';
        const an = parseFloat(av) || 0, bn = parseFloat(bv) || 0;
        const numericCols = ['lastused', 'updatedat'];
        const cmp = numericCols.includes(col) ? (an - bn) : av.localeCompare(bv);
        return _archiveSortAsc ? cmp : -cmp;
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });

  // Right-click context menu on each row
  wrapper.querySelectorAll('.archive-row').forEach(row => {
    const jid = row.dataset.jid;
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      const j = DB.getJumps(currentUser.id).find(j => j.id === jid);
      CtxMenu.show(e.clientX, e.clientY, [
        { icon: '<svg class="ti ti-clipboard"><use href="img/tabler-sprite.svg#tabler-clipboard"/></svg>', label: 'Copy URL', action: () => { if (j) navigator.clipboard.writeText(j.url); } },
        { icon: '<svg class="ti ti-info-circle"><use href="img/tabler-sprite.svg#tabler-info-circle"/></svg>', label: 'Details', action: () => openJumpDetails(jid) },
        { icon: '<svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg>', label: 'Restore', action: () => confirmUnarchive(jid) },
        'divider',
        { icon: '<svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg>', label: 'Delete Permanently', action: () => confirmDelete(jid), danger: true },
      ]);
    });
    row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-hover)');
    row.addEventListener('mouseleave', () => row.style.background = '');
  });
}

window.doUnarchive = function doUnarchive(id) {
  DB.updateJump(currentUser.id, id, { isArchived: false });
  Modal.close();
  setTimeout(() => {
    const row = document.querySelector(`.archive-row[data-jid="${id}"]`);
    if (row) {
      row.remove();
      // Update count in col-header if present
      const remaining = document.querySelectorAll('.archive-row').length;
      const countEl = document.querySelector('.col-count');
      if (countEl) countEl.textContent = remaining;
      // If no rows left, show empty state
      if (remaining === 0) renderArchivedInline();
    }
  }, 50);
};

window.confirmUnarchive = function confirmUnarchive(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Restore <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong> back to the active Jumps?</p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-turq" data-jaction="do-unarchive" data-id="${esc(id)}"><svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore</button>`, 'sm');
}

function renderColumns() {
  const area = document.getElementById('columnsArea');
  if (!area) return;
  area.innerHTML = '';
  const columns = DB.getColumns(currentUser.id).filter(c => c.visible).sort((a, b) => a.order - b.order);
  const jumps   = getFilteredJumps();


  // Set CSS grid to share width equally among all visible columns
  area.style.gridTemplateColumns = columns.length > 0
    ? `repeat(${columns.length}, minmax(0, 1fr))`
    : '1fr';

  if (columns.length === 0) {
    area.innerHTML = `
      <div class="no-columns">
        <div class="big-icon"><svg class="ti ti-layout-columns"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg></div>
        <h3>No columns yet</h3>
        <p>Right-click here or click "Configure Columns" to create your first jump category.</p>
        <button class="btn btn-subtle" data-jaction="open-config-columns"><svg class="ti ti-settings"><use href="img/tabler-sprite.svg#tabler-settings"/></svg> Configure Columns</button>
      </div>`;
    return;
  }

  // For non-active filters: same column structure, filtered jumps per column
  if (currentJumpFilter !== 'active') {
    const filteredIds = new Set(jumps.map(j => j.id));
    if (filteredIds.size === 0) {
      area.innerHTML = `<div class="no-columns" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100%"><div class="big-icon"><svg class="ti ti-mood-empty"><use href="img/tabler-sprite.svg#tabler-mood-empty"/></svg></div><p>No jumps match this filter.</p></div>`;
      area.style.position = 'relative';
      return;
    }
    const allActive = DB.getActiveJumps(currentUser.id);
    columns.forEach((col, colIndex) => {
      const colJumps = allActive
        .filter(j => j.columnId === col.id && filteredIds.has(j.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (colJumps.length === 0) return; // skip empty columns in filtered views
      const colEl = document.createElement('div');
      colEl.className = 'jump-column';
      colEl.innerHTML = `
        <div class="col-header">
          <span class="col-header-title" title="${esc(col.name)}">${esc(col.name)}</span>
          <span class="col-count">${col.isShared ? `<svg class="ti ti-users" style="width:1.1em;height:1.1em;color:var(--hover-accent);vertical-align:-0.1em;margin-right:3px;margin-top:3px"><use href="img/tabler-sprite.svg#tabler-users"/></svg>` : ''}${colJumps.length}</span>
        </div>
        <div class="col-items">${colJumps.map(j => jumpItemHTML(j, colIndex)).join('')}</div>`;
      area.appendChild(colEl);
    });
    // Use same column width as active view (based on total visible columns, not rendered count)
    area.style.gridTemplateColumns = `repeat(${columns.length}, minmax(0, 1fr))`;
    bindJumpEvents();
    return;
  }

  // Only cap when Supabase profile is confirmed — never use localStorage here.
  // localStorage can be stale (e.g. old 'free' value after upgrade), causing a flash
  // where the paywall nudge renders then immediately disappears once the real profile loads.
  const _freeTier = window._supabaseProfile?.subscription_tier === 'free';

  columns.forEach((col, colIndex) => {
    let colJumps = jumps
      .filter(j => j.columnId === col.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Free tier: cap ALL shared columns at 10 jumps, owned or received.
    // We intentionally do NOT use _ownedTeamIds here — it loads async and caused a render
    // race where the cap would flash on/off depending on load timing.
    // Capping all shared cols is consistent with the save-time enforcement (sync.js + saveJump).
    const isSharedCol = !!(col.isShared && col.teamId);
    let hiddenCount = 0;
    if (_freeTier && isSharedCol && colJumps.length > 10) {
      hiddenCount = colJumps.length - 10;
      colJumps = colJumps.slice(0, 10);
    }

    const upgradeNudge = hiddenCount > 0 ? `
      <div style="margin:4px 6px 6px;padding:7px 10px;background:rgba(80,202,204,0.06);border:1px solid rgba(80,202,204,0.18);border-radius:7px;display:flex;flex-direction:column;align-items:center;gap:6px">
        <span style="font-size:0.72rem;color:var(--text-muted)">+${hiddenCount} more</span>
        <button class="btn btn-primary" style="font-size:0.72rem;padding:4.6px 10px;background:linear-gradient(135deg,#50CACC,#1A4FD6)" data-jaction="show-upgrade-modal" data-title="Shared Jump Limit" data-msg="Upgrade to JumpKit Unlimited to see all shared jumps — unlimited teams, unlimited shared jumps, and unlimited launches.">
          <svg viewBox="0 0 105.74 122.88" style="width:0.8rem;height:0.8rem;fill:white;flex-shrink:0;vertical-align:middle;margin-right:4px"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27 c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82 c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93 c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93 c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99 z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83 c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32 c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42 c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51 c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01 c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55 c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04 c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04 L59.12,9.04z"/></svg> Unlock
        </button>
      </div>` : '';

    const colEl = document.createElement('div');
    colEl.className = 'jump-column';
    colEl.innerHTML = `
      <div class="col-header">
        <span class="col-header-title" title="${esc(col.name)}">${esc(col.name)}</span>
        <span class="col-count">${col.isShared ? `<svg class="ti ti-users" style="width:1.1em;height:1.1em;color:var(--hover-accent);vertical-align:-0.1em;margin-right:3px;margin-top:3px"><use href="img/tabler-sprite.svg#tabler-users"/></svg>` : ''}${colJumps.length}</span>
      </div>
      <div class="col-items" id="col-${col.id}">
        ${colJumps.length === 0
          ? '<div class="empty-col">No jumps yet</div>'
          : colJumps.map(j => jumpItemHTML(j, colIndex)).join('')}
        ${upgradeNudge}
      </div>`;
    area.appendChild(colEl);
  });

  bindJumpEvents();
}

function bindJumpEvents() {
  const tip = document.getElementById('jumpTooltip');
  let tipTimer = null;

  function showTip(e, jid) {
    const jump = DB.getJumps(currentUser.id).find(j => j.id === jid);
    if (!jump) return;
    const prefs = DB.getPrefs(currentUser.id);
    const rows = [];

    // Hotkey: show in tooltip only when the inline pill is hidden
    if (!prefs.showHotkey && jump.hotkey) {
      rows.push(`<div class="tt-row"><span class="tt-label">Hotkey</span><span class="tt-val">${esc(jump.hotkey)}</span></div>`);
    }
    // Description: show in tooltip only when inline description is hidden
    if (!prefs.showDescription && jump.description) {
      rows.push(`<div class="tt-row"><span class="tt-label">About</span><span class="tt-val">${esc(jump.description)}</span></div>`);
    }
    // Added date: always shown
    const added = new Date(jump.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    rows.push(`<div class="tt-row"><span class="tt-label">Added</span><span class="tt-val">${added}</span></div>`);

    if (rows.length === 0) return;
    tip.innerHTML = rows.join('');

    const pad = 12;
    const tw = 260, th = rows.length * 28;
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + tw > window.innerWidth - pad)  x = e.clientX - tw - 8;
    if (y + th > window.innerHeight - pad) y = e.clientY - th - 8;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
    tip.classList.add('visible');
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tip.classList.remove('visible');
  }

  document.querySelectorAll('.jump-item').forEach(el => {
    const jid = el.dataset.id;
    el.addEventListener('click', e => { e.stopPropagation(); hideTip(); handleJumpClick(jid); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); hideTip(); openJumpContextMenu(e.clientX, e.clientY, jid); });
    el.addEventListener('mouseenter', e => { tipTimer = setTimeout(() => showTip(e, jid), 500); });
    el.addEventListener('mousemove',  e => { clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(e, jid), 500); });
    el.addEventListener('mouseleave', () => hideTip());
  });
}

const FAVE_COLORS = ['#ff4d4f','#ff7a45','#faad14','#d4b106','#a0d911','#389e0d','#69c0ff','#1890ff','#9254de','#eb2f96'];

function jumpItemHTML(j, colIndex) {
  const iconName = isURL(j.url) ? 'link' : 'folder';
  const iconColor = j.favorite ? `color:${FAVE_COLORS[colIndex % FAVE_COLORS.length]}` : '';
  const prefs = DB.getPrefs(currentUser.id);
  const isShared = j.isShared || j.teamId;
  return `<div class="jump-item${isShared ? ' jump-item-shared' : ''}" data-id="${j.id}" data-shared="${isShared ? '1' : '0'}">
    <span class="jump-icon"><svg class="ti ti-${iconName}" style="${iconColor};width:1.1rem;height:1.1rem"><use href="img/tabler-sprite.svg#tabler-${iconName}"/></svg></span>
    <div class="jump-info">
      <div class="jump-name">
        ${esc(j.name)}

      </div>
      ${prefs.showDescription && j.description ? `<div class="jump-desc">${esc(j.description)}</div>` : ''}
    </div>
    ${prefs.showHotkey && j.hotkey ? `<span class="jump-hotkey-pill">${esc(j.hotkey)}</span>` : ''}

  </div>`;
}

function isURL(url) { return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('www.'); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function refreshStatsBar() {
  const el = document.getElementById('topbarSubtitle');
  if (el) el.innerHTML = getStatsText(currentJumpFilter);
}

function getStatsText(filter) {
  const allActive   = DB.getActiveJumps(currentUser.id);
  const allArchived = DB.getArchivedJumps(currentUser.id);
  const totalClicks = allActive.reduce((a, j) => a + (j.clickCount || 0), 0);
  const timeSaved   = (totalClicks / 6).toFixed(1);
  if (!filter || filter === 'active')   return `${allActive.length} active &middot; ${totalClicks} clicks &middot; ${timeSaved} min saved`;
  if (filter === 'favorites')           return `${allActive.filter(j=>j.favorite).length} favorites`;
  if (filter === 'recent') { const n = allActive.filter(j=>j.lastUsed && j.lastUsed >= Date.now()-30*24*60*60*1000).length; return `${n} used in last 30 days`; }
  if (filter === 'most-used')           return `top ${Math.max(1,Math.ceil(allActive.length*0.1))} most-used`;
  if (filter === 'archive')             return `${allArchived.length} archived`;
  return '';
}

function handleJumpClick(id) {
  const jump = DB.getJumps(currentUser.id).find(j => j.id === id);
  if (!jump) return;
  DB.incrementClick(currentUser.id, id);
  // Increment trial_launches_used in Supabase for free tier users
  const _subTier = window._supabaseProfile?.subscription_tier;
  if (!_subTier || _subTier === 'free') {
    const newCount = (window._supabaseProfile.trial_launches_used || 0) + 1;
    window._supabaseProfile.trial_launches_used = newCount;
    supabaseClient.from('profiles')
      .update({ trial_launches_used: newCount })
      .eq('id', window._supabaseUser?.id)
      .then(() => {});
    // Check if limit hit
    if (newCount >= 250) {
      showPaywall();
      return;
    }
  }
  refreshStatsBar();
  if (window.activePage === 'stats' && typeof renderStats === 'function') renderStats();
  if (['account','teams','settings'].includes(window.activePage) && typeof renderAccount === 'function') renderAccount();
  Toast.success(`Launched <strong>${esc(jump.name)}</strong>`);
  if (window.electronAPI?.isElectron) {
    window.electronAPI.openUrl(jump.url, !!(jump.isShared || jump.teamId));
  } else {
    window.open(jump.url, '_blank', 'noopener');
  }
}

function openJumpContextMenu(x, y, id) {
  const jump = DB.getJumps(currentUser.id).find(j => j.id === id);
  if (!jump) return;
  const isShared = !!(jump.isShared || jump.teamId);

  const items = [
    { icon: '<svg class="ti ti-clipboard"><use href="img/tabler-sprite.svg#tabler-clipboard"/></svg>', label: 'Copy URL', action: () => { navigator.clipboard.writeText(jump.url); } },
    { icon: '<svg class="ti ti-info-circle"><use href="img/tabler-sprite.svg#tabler-info-circle"/></svg>', label: 'Details', action: () => openJumpDetails(id) },
  ];

  if (isShared) {
    const isOwner = jump.userId === currentUser.id && !jump.supabaseId?.startsWith?.('ext');
    if (isOwner) {
      // Owner: full edit + archive/delete
      items.push({ icon: '<svg class="ti ti-pencil"><use href="img/tabler-sprite.svg#tabler-pencil"/></svg>', label: 'Edit', action: () => openEditJumpModal(id) });
      items.push({ icon: '<svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg>', label: 'Archive', action: () => confirmArchive(id) });
      items.push('divider');
      items.push({ icon: '<svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg>', label: 'Delete', action: () => confirmDelete(id), danger: true });
    } else {
      // Team member: hotkey + favorite only
      items.push({ icon: '<svg class="ti ti-keyboard"><use href="img/tabler-sprite.svg#tabler-keyboard"/></svg>', label: 'Set Hotkey', action: () => openHotkeyModal(id) });
      items.push({ icon: '<svg class="ti ti-star"><use href="img/tabler-sprite.svg#tabler-star"/></svg>', label: jump.favorite ? 'Remove Favorite' : 'Add Favorite', action: () => { DB.updateJump(currentUser.id, id, { favorite: !jump.favorite }); renderColumns(); } });
    }
  } else {
    items.push({ icon: '<svg class="ti ti-pencil"><use href="img/tabler-sprite.svg#tabler-pencil"/></svg>', label: 'Edit', action: () => openEditJumpModal(id) });
    items.push({ icon: '<svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg>', label: 'Archive', action: () => confirmArchive(id) });
    items.push('divider');
    items.push({ icon: '<svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg>', label: 'Delete', action: () => confirmDelete(id), danger: true });
  }

  CtxMenu.show(x, y, items);
}

// Quick hotkey-only modal for shared jumps
function openHotkeyModal(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  if (!j) return;
  const body = `
    <div class="form-group">
      <label class="form-label">Hotkey</label>
      <input class="form-input" id="sharedHotkey" value="${esc(j.hotkey || '')}"
        placeholder="Click here then press combo…" autocomplete="off" style="cursor:pointer"/>
    </div>`;
  Modal.open('<svg class="ti ti-keyboard"><use href="img/tabler-sprite.svg#tabler-keyboard"/></svg> Set Hotkey', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" data-jaction="save-shared-hotkey" data-id="${esc(id)}"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save</button>`, 'sm');

  const inp = document.getElementById('sharedHotkey');
  if (inp) {
    inp.addEventListener('click', () => { inp.dataset.recording = '1'; inp.style.borderColor = 'var(--hover-accent)'; inp.focus(); });
    inp.addEventListener('blur',  () => { delete inp.dataset.recording; inp.style.borderColor = ''; });
    inp.addEventListener('keydown', e => {
      if (!inp.dataset.recording) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { inp.blur(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { inp.value = ''; return; }
      const chord = buildChord(e);
      if (chord) inp.value = chord;
    });
  }
}
function saveSharedHotkey(id) {
  const hotkey = document.getElementById('sharedHotkey').value.trim();
  DB.updateJump(currentUser.id, id, { hotkey });
  Modal.close();
  renderColumns();
}

// ── Add / Edit Jump Modal ──────────────────────────────────────────
function openAddJumpModal()    { openJumpFormModal(null); }
function openEditJumpModal(id) { openJumpFormModal(id); }

function openJumpFormModal(editId) {
  const jump = editId ? DB.getJumps(currentUser.id).find(j => j.id === editId) : null;
  const cols = DB.getColumns(currentUser.id);
  const colOptions = cols.length
    ? cols.map(c => `<option value="${c.id}" ${jump?.columnId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
    : '<option value="">— No columns configured —</option>';

  const body = `
    <div class="form-group">
      <label class="form-label">Jump Name *</label>
      <input class="form-input" id="jName" tabindex="1" value="${esc(jump?.name || '')}" placeholder="e.g. Salesforce Dashboard"/>
      <span class="form-error" id="jNameErr">Name is required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">URL / Path *</label>
      <input class="form-input" id="jUrl" tabindex="2" value="${esc(jump?.url || '')}" placeholder="https://... or \\\\server\\share\\folder"/>
      <span class="form-error" id="jUrlErr">URL or path is required.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Column *</label>
      <input type="hidden" id="jCol" value="${esc(jump?.columnId || '')}"/>
      <div class="custom-select" id="jColDrop">
        <div class="custom-select-trigger" id="jColTrigger" tabindex="3">
          <span id="jColLabel" style="${jump?.columnId ? '' : 'color:var(--text-dim)'}">${ jump?.columnId ? (DB.getColumns(currentUser.id).find(c=>c.id===jump.columnId)?.name || 'Select Column') : 'Select Column'}</span>
          <svg class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
        </div>
        <div class="custom-select-menu" id="jColMenu">
          ${DB.getColumns(currentUser.id).filter(c=>c.visible).sort((a,b)=>a.order-b.order).map(c=>`
            <div class="custom-select-option" data-value="${esc(c.id)}">${esc(c.name)}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:10px">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="jDesc" tabindex="3" placeholder="Optional description">${esc(jump?.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Added Because</label>
      <input class="form-input" id="jReason" tabindex="5" value="${esc(jump?.reason || '')}" placeholder="Optional reminder why this jump was added"/>
    </div>
    <div class="form-group">
      <label class="form-label">Hotkey</label>
      <div style="position:relative">
        <input type="hidden" id="jHotkey" value="${esc(jump?.hotkey || '')}"/>
        <button type="button" id="btnPickHotkey" style="width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:0.93rem;padding:10px 14px;border-radius:var(--radius);border:1.5px solid var(--border-input);background:var(--bg-input);color:var(--text);cursor:pointer;transition:border-color var(--transition)" title="Pick a hotkey">
          <span id="btnPickHotkeyLabel" style="color:${jump?.hotkey ? 'var(--text)' : 'var(--text-dim)'}">${jump?.hotkey ? esc(jump.hotkey) : 'Select a hotkey…'}</span>
          <svg class="ti ti-chevron-down" style="width:1em;height:1em;flex-shrink:0;opacity:0.6"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
        </button>
        <div id="hotkeyPicker" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:8px;margin-top:4px;max-height:180px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.3)"></div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Favorite</label>
      <div class="toggle-wrap">
        <label class="toggle">
          <input type="checkbox" id="jFavorite" ${jump?.favorite ? 'checked' : ''}/>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Time Saved per Launch</label>
      <div style="font-size:0.72rem;font-weight:400;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:6px">Leave blank to use default from Settings</div>
      <div style="display:flex;gap:10px;align-items:center">
        <input class="form-input" id="jTimeSaved" type="text" inputmode="numeric" pattern="[0-9]*" tabindex="7"
          value="${jump?.timeSaved != null ? jump.timeSaved : ''}"
          placeholder="e.g. 30"
          style="max-width:100px"
          onkeydown="const k=event.key; if(k.length===1 && !/[0-9.]/.test(k)) event.preventDefault(); if(k==='.' && this.value.includes('.')) event.preventDefault();"
          oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/>
        <div class="jump-filter-bar" id="jTimeSavedBar" style="height:38px;flex-shrink:0">
          <div class="jfb-slider" id="jTimeSavedPill"></div>
          <button type="button" class="jfb-tab${(!jump?.timeSavedUnit || jump?.timeSavedUnit === 'seconds') ? ' active' : ''}" data-unit="seconds" style="padding:0 12px;font-size:0.8rem">sec</button>
          <button type="button" class="jfb-tab${jump?.timeSavedUnit === 'minutes' ? ' active' : ''}" data-unit="minutes" style="padding:0 12px;font-size:0.8rem">min</button>
        </div>
        <input type="hidden" id="jTimeSavedUnit" value="${jump?.timeSavedUnit || 'seconds'}"/>
      </div>
    </div>
`;

  const footer = `
    <button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
    <button class="btn btn-save" id="btnSaveJump" data-jaction="save-jump" data-id="${esc(editId || '')}"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> ${editId ? 'Save Changes' : 'Add Jump'}</button>`;

  Modal.open(editId ? '<svg class="ti ti-pencil"><use href="img/tabler-sprite.svg#tabler-pencil"/></svg> Edit Jump' : '<svg class="ti ti-plus"><use href="img/tabler-sprite.svg#tabler-plus"/></svg> Add Jump', body, footer);

  // Time Saved unit slider
  (function() {
    const bar   = document.getElementById('jTimeSavedBar');
    const pill  = document.getElementById('jTimeSavedPill');
    const input = document.getElementById('jTimeSavedUnit');
    if (!bar || !pill) return;
    function movePill(activeBtn) {
      pill.style.left   = activeBtn.offsetLeft + 'px';
      pill.style.width  = activeBtn.offsetWidth + 'px';
    }
    // Initial position
    requestAnimationFrame(() => {
      const active = bar.querySelector('.jfb-tab.active');
      if (active) movePill(active);
    });
    bar.querySelectorAll('.jfb-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.jfb-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (input) input.value = btn.dataset.unit;
        movePill(btn);
      });
    });
  })();

  // Custom column dropdown
  const colTrigger = document.getElementById('jColTrigger');
  const colMenu    = document.getElementById('jColMenu');
  const colInput   = document.getElementById('jCol');
  const colLabel   = document.getElementById('jColLabel');
  if (colTrigger) {
    wireDropdown({
      dropId: 'jColDrop', triggerId: 'jColTrigger', menuId: 'jColMenu',
      labelId: 'jColLabel', inputId: 'jCol',
      onSelect: () => { document.getElementById('jColDrop').classList.remove('error'); }
    });
  }

  // ── Hotkey picker ───────────────────────────────────────────────
  const btnPickHotkey = document.getElementById('btnPickHotkey');
  const hotkeyPicker  = document.getElementById('hotkeyPicker');
  if (btnPickHotkey && hotkeyPicker) {
    btnPickHotkey.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hotkeyPicker.style.display !== 'none') { hotkeyPicker.style.display = 'none'; return; }

      // Collect all used hotkeys (excluding this jump if editing) → Map: normalizedKey → jump name
      const allJumps  = DB.getJumps(currentUser.id);
      const usedKeys  = new Map();
      allJumps
        .filter(j => j.hotkey && j.id !== (editId || null))
        .forEach(j => {
          const norm = j.hotkey.toLowerCase().replace(/ctrl/i,'ctrl').replace(/cmd/i,'cmd');
          usedKeys.set(norm, j.name);
        });
      // Helper: return jump name if combo is used, else null
      function usedBy(combo) {
        const norm = combo.toLowerCase();
        const swapped = norm.replace(/^cmd/, 'ctrl').replace(/^ctrl/, 'cmd');
        return usedKeys.get(norm) || usedKeys.get(swapped) || null;
      }

      const mod = 'Ctrl';

      // Build all combos — green if available, red if used
      const allCombos = [];
      for (let i = 65; i <= 90; i++) allCombos.push(`${mod}+Shift+${String.fromCharCode(i)}`);
      for (let i = 0; i <= 9; i++) allCombos.push(`${mod}+Shift+${i}`);

      const clearBtn = `<button type="button" data-jaction="pick-hotkey" data-key="" style="font-size:0.75rem;padding:4px 10px;margin:3px 2px;border-radius:6px;border:1px solid var(--border);background:var(--bg-hover);color:var(--text-muted);cursor:pointer">✕ Clear</button><div style="border-top:1px solid var(--border);margin:6px 0 4px"></div>`;
      hotkeyPicker.innerHTML = clearBtn + allCombos.map(k => {
        const owner  = usedBy(k);
        const bg     = owner ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)';
        const col    = owner ? '#ef4444' : '#22c55e';
        const cur    = owner ? 'default' : 'pointer';
        const jaction = owner ? '' : `data-jaction="pick-hotkey" data-key="${k}"`;
        const ownerAttr = owner ? `data-hotkey-owner="${owner.replace(/"/g,'&quot;')}"` : '';
        return `<button type="button" ${jaction} ${ownerAttr} style="font-size:0.75rem;padding:4px 10px;margin:3px 2px;border-radius:6px;border:1px solid ${col};background:${bg};color:${col};cursor:${cur};opacity:${owner ? '0.7' : '1'}">${k}</button>`;
      }).join('');
      hotkeyPicker.style.display = 'block';

      // Custom instant tooltip for used hotkeys
      let _hkTip = document.getElementById('hotkeyOwnerTip');
      if (!_hkTip) {
        _hkTip = document.createElement('div');
        _hkTip.id = 'hotkeyOwnerTip';
        _hkTip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:0.78rem;color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,0.25);white-space:nowrap;display:none';
        document.body.appendChild(_hkTip);
      }
      hotkeyPicker.addEventListener('mouseover', ev => {
        const target = ev.target.closest('[data-hotkey-owner]');
        if (!target) { _hkTip.style.display = 'none'; return; }
        _hkTip.textContent = 'Used by: ' + target.dataset.hotkeyOwner;
        _hkTip.style.display = 'block';
        const r = target.getBoundingClientRect();
        _hkTip.style.left = r.left + 'px';
        _hkTip.style.top  = (r.bottom + 4) + 'px';
      });
      hotkeyPicker.addEventListener('mouseout', ev => {
        if (!ev.relatedTarget?.closest('[data-hotkey-owner]')) _hkTip.style.display = 'none';
      });
    });

    // Close picker when clicking outside
    document.addEventListener('click', () => {
      hotkeyPicker.style.display = 'none';
      const tip = document.getElementById('hotkeyOwnerTip');
      if (tip) tip.style.display = 'none';
    }, { once: false, capture: false });
  }
}

function saveJump(editId) {
  const name = document.getElementById('jName').value.trim();
  const url  = document.getElementById('jUrl').value.trim();
  let ok = true;
  const colVal = document.getElementById('jCol').value;
  ['jName','jUrl'].forEach(id => document.getElementById(id).classList.remove('error'));
  document.getElementById('jColDrop')?.classList.remove('error');
  ['jNameErr','jUrlErr'].forEach(id => document.getElementById(id) && document.getElementById(id).classList.remove('show'));
  if (!name)   { document.getElementById('jName').classList.add('error'); document.getElementById('jNameErr').classList.add('show'); ok = false; }
  if (!url)    { document.getElementById('jUrl').classList.add('error');  document.getElementById('jUrlErr').classList.add('show');  ok = false; }
  if (!colVal) { document.getElementById('jColDrop')?.classList.add('error'); ok = false; }
  if (!ok) return;

  // Show spinner on save button
  const saveBtn = document.getElementById('btnSaveJump');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<svg class="ti ti-loader-2 spin"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg> Saving…'; }

  const data = {
    name, url,
    description: document.getElementById('jDesc').value.trim(),
    reason:      document.getElementById('jReason').value.trim(),
    columnId:    document.getElementById('jCol').value,
    hotkey:      document.getElementById('jHotkey').value.trim(),
    favorite:    document.getElementById('jFavorite').checked,
    timeSaved:   (() => {
      const v = document.getElementById('jTimeSaved')?.value.trim();
      if (!v) return null;
      const n = parseFloat(v) || 0;
      const unit = document.getElementById('jTimeSavedUnit')?.value;
      return unit === 'minutes' ? n * 60 : n;
    })(),
    timeSavedUnit: document.getElementById('jTimeSavedUnit')?.value || 'seconds',
  };

  setTimeout(() => {
    try {
      if (editId) {
        // Before updating — check if jump is moving OUT of a shared column
        const jumpBeforeEdit = DB.getJumps(currentUser.id).find(j => j.id === editId);
        const prevCol = DB.getColumns(currentUser.id).find(c => c.id === jumpBeforeEdit?.columnId);
        const movingOutOfShared = prevCol?.isShared && data.columnId && data.columnId !== jumpBeforeEdit?.columnId;
        if (movingOutOfShared && jumpBeforeEdit?.supabaseId) {
          // Remove from Supabase shared_jumps
          supabaseClient.from('shared_jumps').delete().eq('id', jumpBeforeEdit.supabaseId)
            .then(({ error }) => { if (error) console.warn('shared_jumps remove (moved out):', error.message); });
          data.supabaseId = null; data.isShared = 0; data.teamId = null;
        }
        DB.updateJump(currentUser.id, editId, data);
        const updatedJump = DB.getJumps(currentUser.id).find(j => j.id === editId);
        const col = DB.getColumns(currentUser.id).find(c => c.id === updatedJump?.columnId);
        if (col?.isShared && col?.teamId && col?.supabaseId) {
          if (updatedJump?.supabaseId) {
            // Already in Supabase — update it
            supabaseClient.from('shared_jumps').update({
              name: data.name, url: data.url,
              description: data.description || '', reason: data.reason || '',
            }).eq('id', updatedJump.supabaseId).then(({ error }) => {
              if (error) console.warn('shared_jumps update:', error.message);
            });
          } else {
            // Moved into a shared column — insert it
            const supabaseId = crypto.randomUUID();
            DB.updateJump(currentUser.id, editId, { supabaseId, isShared: true, teamId: col.teamId });
            supabaseClient.from('shared_jumps').insert({
              id: supabaseId, shared_column_id: col.supabaseId, team_id: col.teamId,
              name: data.name, url: data.url,
              description: data.description || '', reason: data.reason || '',
              position: 0, created_by: window._supabaseUser?.id || currentUser.id,
            }).then(({ error }) => {
              if (error) console.warn('shared_jumps insert (edit):', error.message);
            });
          }
        }
      } else {
        // Free tier: check 10 shared jump limit BEFORE creating the jump
        const _colCheck = DB.getColumns(currentUser.id).find(c => c.id === data.columnId);
        if (_colCheck?.isShared && _colCheck?.teamId) {
          const _tierCheck = window._supabaseProfile?.subscription_tier || 'free';
          if (_tierCheck === 'free') {
            const _sharedCount = DB.getActiveJumps(currentUser.id).filter(j => j.teamId === _colCheck.teamId && j.isShared).length;
            if (_sharedCount >= 10) {
              Modal.close();
              trackPaywallEvent('team_jump_limit').catch(()=>{});
              showUpgradeModal(
                'Shared Jump Limit Reached',
                'The free tier allows up to <strong>10 shared jumps per team</strong>. Upgrade to JumpKit Unlimited for unlimited shared jumps, unlimited teams, and unlimited launches.'
              );
              return;
            }
          }
        }

        const newJump = DB.createJump(currentUser.id, data);
        // If added to a shared column, push to Supabase shared_jumps
        if (newJump) {
          const col = DB.getColumns(currentUser.id).find(c => c.id === data.columnId);
          if (col?.isShared && col?.teamId && col?.supabaseId) {
            const supabaseId = crypto.randomUUID();
            DB.updateJump(currentUser.id, newJump.id, { supabaseId, isShared: true, teamId: col.teamId });
            supabaseClient.from('shared_jumps').insert({
              id: supabaseId,
              shared_column_id: col.supabaseId,
              team_id: col.teamId,
              name: data.name,
              url: data.url,
              description: data.description || '',
              reason: data.reason || '',
              position: 0,
              created_by: window._supabaseUser?.id || currentUser.id,
            }).then(({ error }) => {
              if (error) console.warn('[saveJump] shared_jumps insert:', error.message);
            });
          }
        }
      }
      Modal.close();
      renderColumns();
      Toast.success(editId ? 'Jump updated!' : 'Jump added!');
    } catch (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> ' + (editId ? 'Save Changes' : 'Add Jump'); }
      Toast.danger('Failed to save jump: ' + (err.message || 'Unknown error'));
    }
  }, 1000);
}

// ── Details Modal ──────────────────────────────────────────────────
function openJumpDetails(id) {
  const j   = DB.getJumps(currentUser.id).find(j => j.id === id);
  const col = DB.getColumns(currentUser.id).find(c => c.id === j?.columnId);
  if (!j) return;
  const body = `
    <div class="detail-row"><span class="detail-label">Name</span>       <span class="detail-value">${esc(j.name)}</span></div>
    <div class="detail-row"><span class="detail-label">URL / Path</span> <span class="detail-value">${esc(j.url)}</span></div>
    <div class="detail-row"><span class="detail-label">Description</span><span class="detail-value">${esc(j.description) || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">Added Because</span><span class="detail-value">${esc(j.reason) || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">Column</span>     <span class="detail-value">${col ? esc(col.name) : '— Uncategorized —'}</span></div>
    <div class="detail-row"><span class="detail-label">Hotkey</span>     <span class="detail-value">${j.hotkey ? j.hotkey.split('+').map(k=>`<kbd class="hotkey-badge">${esc(k.trim())}</kbd>`).join('<span style="color:var(--text-dim);padding:0 2px">+</span>') : '—'}</span></div>
    <div class="detail-row"><span class="detail-label">Favorite</span>   <span class="detail-value">${j.favorite ? 'Yes' : 'No'}</span></div>
    <div class="detail-row"><span class="detail-label">Clicks</span>     <span class="detail-value">${j.clickCount || 0}</span></div>
    <div class="detail-row"><span class="detail-label">Last Used</span>  <span class="detail-value">${j.lastUsed ? new Date(j.lastUsed).toLocaleString() : 'Never'}</span></div>
    <div class="detail-row"><span class="detail-label">Created</span>    <span class="detail-value">${new Date(j.createdAt).toLocaleString()}</span></div>`;
  Modal.open('<svg class="ti ti-info-circle"><use href="img/tabler-sprite.svg#tabler-info-circle"/></svg> Jump Details', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>
     <button class="btn btn-subtle" data-jaction="close-edit-jump" data-id="${esc(id)}"><svg class="ti ti-pencil"><use href="img/tabler-sprite.svg#tabler-pencil"/></svg> Edit</button>`, 'sm');
}

// ── Confirm Delete ─────────────────────────────────────────────────
function confirmDelete(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Permanently delete <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? This cannot be undone.</p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" data-jaction="do-delete" data-id="${esc(id)}"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete</button>`, 'sm');
}
function doDelete(id) {
  // If deleting a shared jump, remove from Supabase first
  const jump = DB.getJumps(currentUser.id).find(j => j.id === id);
  if (jump?.isShared && jump?.supabaseId) {
    supabaseClient.from('shared_jumps').delete().eq('id', jump.supabaseId)
      .then(({ error }) => { if (error) console.warn('shared_jumps delete:', error.message); });
  }
  DB.deleteJump(currentUser.id, id);
  Modal.close();
  renderColumns();
}

// ── Confirm Archive ────────────────────────────────────────────────
function confirmArchive(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg> Archive Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Archive <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? It will be moved to the Archive tab and can be restored any time.</p>`,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-turq" data-jaction="do-archive" data-id="${esc(id)}"><svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg> Archive</button>`, 'sm');
}
function doArchive(id) { DB.updateJump(currentUser.id, id, { isArchived: true }); Modal.close(); renderColumns(); }

// ── Configure Columns Modal ────────────────────────────────────────
// Team name cache for Configure Columns status labels
let _colConfigTeamNames = {}; // { teamId: teamName }
let _colConfigOwnedTeamIds = new Set(); // teamIds owned by current user

async function openConfigColumnsModal() {
  let cols = DB.getColumns(currentUser.id);
  // Pad to 10 slots by default for new users; allow going beyond 10 via Add Column
  const padTo = Math.max(10, cols.length);
  while (cols.length < padTo) {
    cols.push({ id: 'new_' + cols.length, userId: currentUser.id, name: '', visible: false, order: cols.length + 1, _new: true });
  }
  cols.sort((a, b) => a.order - b.order);

  // Fetch team names + ownership for all teamIds present in columns
  _colConfigTeamNames = {};
  _colConfigOwnedTeamIds = new Set();
  const teamIds = [...new Set([
    ...cols.filter(c => c.teamId).map(c => c.teamId),
    ...cols.flatMap(c => (c.sharedTeams || []).map(st => st.teamId)),
  ])];
  if (teamIds.length > 0) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        const { data: teams = [] } = await supabaseClient
          .from('teams').select('id, name, owner_id').in('id', teamIds);
        teams.forEach(t => {
          _colConfigTeamNames[t.id] = t.name;
          if (t.owner_id === session.user.id) _colConfigOwnedTeamIds.add(t.id);
        });
      }
    } catch (_) {}
  }

  renderColConfigModal(cols);
}

async function getUserRole(userId) {
  try {
    const { data } = await supabaseClient.from('profiles').select('role').eq('id', userId).single();
    return data?.role || 'team-member';
  } catch (_) { return 'team-member'; }
}

function _makeColConfigRow(c, i, jumpCount) {
  // Build sharing status label (read-only)
  let statusHTML = '';
  if (c.name && !c._new) {
    const allEntries = [];
    if (c.sharedTeams && c.sharedTeams.length > 0) {
      c.sharedTeams.forEach(st => allEntries.push(st.teamId));
    } else if (c.teamId && c.isShared) {
      allEntries.push(c.teamId);
    }
    if (!c.isShared || allEntries.length === 0) {
      statusHTML = `<span class="col-status-badge col-status-personal">Personal</span>`;
    } else {
      statusHTML = allEntries.map(tid => {
        const teamName = _colConfigTeamNames[tid] || 'Team';
        if (_colConfigOwnedTeamIds.has(tid)) {
          return `<span class="col-status-badge col-status-shared-out" style="margin-right:3px"><svg class="ti ti-users" style="width:.8rem;height:.8rem;vertical-align:middle;margin-right:3px;color:var(--turq)"><use href="img/tabler-sprite.svg#tabler-users"/></svg>${esc(teamName)}</span>`;
        } else {
          return `<span class="col-status-badge col-status-shared-from" style="margin-right:3px"><svg class="ti ti-arrow-down-circle" style="width:.8rem;height:.8rem;vertical-align:middle;margin-right:3px"><use href="img/tabler-sprite.svg#tabler-arrow-down-circle"/></svg>From ${esc(teamName)}</span>`;
        }
      }).join('');
    }
  }

  const isSharedCol = c.isShared;
  const removeBtn = isSharedCol
    ? `<button type="button" class="btn-col-remove tooltip-left" disabled data-tooltip="Team columns can only be hidden, not removed"><svg class="ti ti-trash" style="width:1rem;height:1rem;color:inherit"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button>`
    : `<button type="button" class="btn-col-remove tooltip-left" data-colid="${esc(c.id || '')}" data-colname="${esc(c.name || '')}" data-jumpcount="${jumpCount}" data-tooltip="Remove column"><svg class="ti ti-trash" style="width:1rem;height:1rem;color:inherit"><use href="img/tabler-sprite.svg#tabler-trash"/></svg></button>`;

  return `
  <div class="col-config-item" data-idx="${i}" data-colid="${c.id || ''}" draggable="true">
    <span class="col-drag-handle" title="Drag to reorder"><svg class="ti ti-grip-vertical"><use href="img/tabler-sprite.svg#tabler-grip-vertical"/></svg></span>
    <div class="col-config-field">
      <span class="col-config-label">Column Name</span>
      <input class="form-input" placeholder="Column name" value="${esc(c.name)}" data-field="name" style="font-size:.85rem;padding:7px 10px"/>
    </div>
    <div class="col-config-field" style="align-items:center">
      <span class="col-config-label" style="text-align:center">Visible</span>
      <div class="toggle-wrap" style="justify-content:center">
        <label class="toggle">
          <input type="checkbox" data-field="visible" ${c.visible && c.name ? 'checked' : ''}/>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="col-config-field col-status-field">
      <span class="col-config-label">Sharing</span>
      ${statusHTML}
    </div>
    <div class="col-config-field" style="align-items:center;min-width:36px;flex:0 0 36px">
      ${removeBtn}
    </div>
  </div>`;
}

function renderColConfigModal(cols) {
  // Build jump count map for remove confirmation
  const jumpCounts = {};
  DB.getJumps(currentUser.id).forEach(j => {
    jumpCounts[j.columnId] = (jumpCounts[j.columnId] || 0) + 1;
  });

  const rows = cols.map((c, i) => _makeColConfigRow(c, i, jumpCounts[c.id] || 0)).join('');

  const body = `
    <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">
      Drag to reorder. To share columns with a team, go to <strong>Account → My Teams</strong>.
    </p>
    <div class="col-config-list" id="colConfigList">${rows}</div>
    <button type="button" id="btnAddColRow" class="btn btn-subtle" style="margin-top:12px;display:flex;align-items:center;gap:6px;font-size:.85rem">
      <svg class="ti ti-plus" style="width:1rem;height:1rem"><use href="img/tabler-sprite.svg#tabler-plus"/></svg> Add Column
    </button>`;

  Modal.open('<svg class="ti ti-layout-columns"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg> Configure Columns', body,
    `<button class="btn btn-subtle" data-jaction="modal-close"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" id="btnSaveColumns" data-jaction="save-columns"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save Columns</button>`, 'lg');

  initColDragDrop();
  _initColConfigActions();
}

function _initColConfigActions() {
  // Add Column button
  const addBtn = document.getElementById('btnAddColRow');
  if (addBtn) {
    addBtn.onclick = () => {
      const list = document.getElementById('colConfigList');
      if (!list) return;
      const idx = list.querySelectorAll('.col-config-item').length;
      const blankCol = { id: 'new_' + Date.now(), userId: currentUser.id, name: '', visible: false, order: idx + 1, _new: true };
      list.insertAdjacentHTML('beforeend', _makeColConfigRow(blankCol, idx, 0));
      // Wire remove on the new row
      const newRow = list.lastElementChild;
      const newRemoveBtn = newRow.querySelector('.btn-col-remove');
      if (newRemoveBtn) _wireRemoveBtn(newRemoveBtn);
      initColDragDrop();
    };
  }
  // Wire existing remove buttons
  document.querySelectorAll('.btn-col-remove').forEach(btn => _wireRemoveBtn(btn));
}

function _wireRemoveBtn(btn) {
  if (btn.disabled) return;
  btn.onclick = () => {
    const row = btn.closest('.col-config-item');
    if (!row) return;
    const colName  = btn.dataset.colname || '';
    const jumpCount = parseInt(btn.dataset.jumpcount || '0', 10);
    if (jumpCount > 0) {
      // Inline confirmation — grid-column:1/-1 spans all 5 grid tracks
      row.style.display = 'block';
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;width:100%;box-sizing:border-box">
          <svg class="ti ti-alert-triangle" style="width:1.2rem;height:1.2rem;color:#e15b59;flex-shrink:0"><use href="img/tabler-sprite.svg#tabler-alert-triangle"/></svg>
          <span style="flex:1;font-size:.88rem;color:var(--text);min-width:0">Delete <strong>${esc(colName)}</strong> and all <strong>${jumpCount}</strong> jump${jumpCount !== 1 ? 's' : ''} inside?</span>
          <button type="button" class="btn btn-subtle" id="btnRemoveCancel" style="font-size:.82rem;padding:5px 14px;flex-shrink:0">Cancel</button>
          <button type="button" class="btn btn-delete" id="btnRemoveConfirm" style="font-size:.82rem;padding:5px 14px;flex-shrink:0">Yes, Delete</button>
        </div>`;
      row.querySelector('#btnRemoveCancel').onclick = () => {
        // Re-render that row from DB
        const existingCol = DB.getColumns(currentUser.id).find(c => c.id === btn.dataset.colid);
        if (existingCol) {
          const jc = DB.getJumps(currentUser.id).filter(j => j.columnId === existingCol.id).length;
          row.outerHTML = _makeColConfigRow(existingCol, parseInt(row.dataset.idx || '0'), jc);
          document.querySelectorAll('.btn-col-remove').forEach(b => _wireRemoveBtn(b));
        } else {
          row.remove();
        }
      };
      row.querySelector('#btnRemoveConfirm').onclick = () => {
        // Immediately delete from DB + orphaned jumps, then refresh UI
        const colId = btn.dataset.colid;
        if (colId && !colId.startsWith('new_')) {
          const allCols  = DB.getColumns(currentUser.id);
          const orphans  = window.JK.logic.orphanedJumps(DB.getJumps(currentUser.id), [colId]);
          orphans.forEach(j => DB.deleteJump(currentUser.id, j.id));
          DB.saveColumns(currentUser.id, allCols.filter(c => c.id !== colId));
          renderColumns(); // refresh jumps page immediately
        }
        row.remove();
        // Re-index remaining rows
        document.querySelectorAll('.col-config-item').forEach((el, i) => { el.dataset.idx = i; });
      };
    } else {
      row.remove();
      document.querySelectorAll('.col-config-item').forEach((el, i) => { el.dataset.idx = i; });
    }
  };
}



function initColDragDrop() {
  const list = document.getElementById('colConfigList');
  if (!list) return;
  let dragEl = null;
  list.addEventListener('dragstart', e => {
    dragEl = e.target.closest('.col-config-item');
    if (!dragEl) return;
    dragEl.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });
  list.addEventListener('dragend', () => {
    if (dragEl) dragEl.style.opacity = '';
    list.querySelectorAll('.col-config-item').forEach((el, i) => { el.dataset.idx = i; el.classList.remove('drag-over'); });
    dragEl = null;
  });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.col-config-item');
    if (!target || target === dragEl) return;
    list.querySelectorAll('.col-config-item').forEach(el => el.classList.remove('drag-over'));
    target.classList.add('drag-over');
    const after = e.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    list.insertBefore(dragEl, after ? target.nextSibling : target);
  });
  list.addEventListener('dragleave', e => { e.target.closest?.('.col-config-item')?.classList.remove('drag-over'); });
  list.addEventListener('drop', e => { e.preventDefault(); list.querySelectorAll('.col-config-item').forEach(el => el.classList.remove('drag-over')); });
}

async function saveColumns() {
  const saveBtn = document.getElementById('btnSaveColumns');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<svg class="ti ti-loader-2 spin"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg> Saving…'; }

  await new Promise(r => setTimeout(r, 1000));

  const items    = document.querySelectorAll('.col-config-item');
  const existing = DB.getColumns(currentUser.id);
  const updated  = [];

  items.forEach((item, i) => {
    const name    = item.querySelector('[data-field="name"]').value.trim();
    const visible = item.querySelector('[data-field="visible"]').checked && name.length > 0;
    const order   = i + 1;
    const colId   = item.dataset.colid;
    const existingCol = colId ? existing.find(c => c.id === colId) : existing[i];

    if (name) {
      if (existingCol && !existingCol._new) {
        // Preserve all sharing state — only update name, visible, order
        updated.push({ ...existingCol, name, visible, order });
      } else {
        updated.push({ id: 'col_' + Date.now() + '_' + i, userId: currentUser.id, name, visible, order, createdAt: Date.now(), isShared: false, teamId: null });
      }
    } else if (existingCol && !existingCol._new) {
      // Empty name row — hide but preserve sharing state
      updated.push({ ...existingCol, visible: false, order });
    }
  });

  const savedCols = updated.filter(c => c.name);
  DB.saveColumns(currentUser.id, savedCols);

  // Delete orphaned jumps for removed personal cols — delegates to JK.logic (tested by test 160)
  const savedColIds  = new Set(savedCols.map(c => c.id));
  const removedIds   = window.JK.logic.removedPersonalColIds(existing, savedColIds);
  const toDelete     = window.JK.logic.orphanedJumps(DB.getJumps(currentUser.id), removedIds);
  toDelete.forEach(j => DB.deleteJump(currentUser.id, j.id));

  // Sync name changes for owner's shared columns to Supabase
  for (const col of updated) {
    const was = existing.find(c => c.id === col.id);
    if (!was || was.name === col.name) continue;
    // New format: sharedTeams array
    const sharedTeams = col.sharedTeams || [];
    for (const st of sharedTeams) {
      if (st.supabaseId && _colConfigOwnedTeamIds.has(st.teamId)) {
        try {
          await supabaseClient.from('shared_columns').update({ name: col.name }).eq('id', st.supabaseId);
        } catch (err) { console.warn('Failed to sync column rename (sharedTeams):', err.message); }
      }
    }
    // Old format: single teamId
    if (col.isShared && col.teamId && col.supabaseId && _colConfigOwnedTeamIds.has(col.teamId)) {
      try {
        await supabaseClient.from('shared_columns').update({ name: col.name }).eq('id', col.supabaseId);
      } catch (err) { console.warn('Failed to sync column rename:', err.message); }
    }
  }

  Modal.close();
  renderColumns();
  Toast.success('Columns saved!');
}

// syncColumnToSupabase(col, teamId)
// teamId is required for multi-team support. Falls back to col.teamId for old-format columns.
async function syncColumnToSupabase(col, teamId) {
  const resolvedTeamId = teamId || col.teamId;
  if (!resolvedTeamId) { console.warn('syncColumnToSupabase: no teamId'); return; }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const localUserId = session.user.id;

    // ── Resolve supabase column ID for this (col, team) pair ──
    // New format: look up from sharedTeams array
    // Old format: use col.supabaseId directly
    let colSupabaseId;
    const sharedTeams = Array.isArray(col.sharedTeams) ? col.sharedTeams : [];
    const stEntry = sharedTeams.find(st => st.teamId === resolvedTeamId);

    if (stEntry) {
      // Already in sharedTeams — use or generate supabase ID
      if (!stEntry.supabaseId) stEntry.supabaseId = crypto.randomUUID();
      colSupabaseId = stEntry.supabaseId;
      // Persist updated sharedTeams
      const updatedSharedTeams = sharedTeams.map(st => st.teamId === resolvedTeamId ? stEntry : st);
      DB.saveColumns(localUserId, DB.getColumns(localUserId).map(c =>
        c.id === col.id ? { ...c, sharedTeams: updatedSharedTeams } : c
      ));
    } else if (col.teamId === resolvedTeamId && col.supabaseId) {
      // Old single-team format — use existing supabaseId
      colSupabaseId = col.supabaseId;
    } else {
      // Fallback: generate new ID
      colSupabaseId = crypto.randomUUID();
    }

    // Upsert shared_column row for this (col, team)
    const { data: sc, error: scErr } = await supabaseClient
      .from('shared_columns')
      .upsert({
        id: colSupabaseId,
        team_id: resolvedTeamId,
        name: col.name,
        position: col.order,
        created_by: localUserId,
      }, { onConflict: 'id', ignoreDuplicates: false })
      .select()
      .single();
    if (scErr) { console.warn('shared_column upsert:', scErr.message); return; }

    // Upsert all jumps in this column for this team
    let jumps = DB.getActiveJumps(localUserId).filter(j => j.columnId === col.id);

    // Free tier: max 10 shared jumps per team
    const tier = window._supabaseProfile?.subscription_tier || 'free';
    if (tier === 'free' && jumps.length > 10) {
      trackPaywallEvent('team_jump_limit').catch(()=>{});
      showUpgradeModal(
        'Shared Jump Limit Reached',
        'The free tier allows up to <strong>10 shared jumps per team</strong>. Only the first 10 will be synced. Upgrade to JumpKit Unlimited for unlimited shared jumps.'
      );
      jumps = jumps.slice(0, 10);
    }
    for (const j of jumps) {
      // Get or generate a per-(jump, team) supabase ID
      const supabaseIdMap = (j.supabaseIdMap && typeof j.supabaseIdMap === 'object') ? { ...j.supabaseIdMap } : {};
      if (!supabaseIdMap[resolvedTeamId]) {
        // Migrate old single-team format if applicable
        if (j.teamId === resolvedTeamId && j.supabaseId) {
          supabaseIdMap[resolvedTeamId] = j.supabaseId;
        } else {
          supabaseIdMap[resolvedTeamId] = crypto.randomUUID();
        }
        DB.updateJump(localUserId, j.id, { supabaseIdMap, isShared: true });
      }
      const jumpSupabaseId = supabaseIdMap[resolvedTeamId];

      await supabaseClient.from('shared_jumps').upsert({
        id: jumpSupabaseId,
        shared_column_id: sc.id,
        team_id: resolvedTeamId,
        name: j.name,
        url: j.url,
        description: j.description || '',
        reason: j.reason || '',
        position: 0,
        created_by: localUserId,
      }, { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('syncColumnToSupabase error:', err.message);
  }
}

// unshareColumnFromSupabase(col, teamId)
// teamId is required for multi-team support. Falls back to col.teamId for old-format columns.
async function unshareColumnFromSupabase(col, teamId) {
  const resolvedTeamId = teamId || col.teamId;
  try {
    // Resolve the supabase column ID for this (col, team) pair
    const sharedTeams = Array.isArray(col.sharedTeams) ? col.sharedTeams : [];
    const stEntry = sharedTeams.find(st => st.teamId === resolvedTeamId);
    const colSupabaseId = stEntry?.supabaseId || (col.teamId === resolvedTeamId ? col.supabaseId : null);

    if (colSupabaseId) {
      await supabaseClient.from('shared_columns').delete().eq('id', colSupabaseId);
    }

    // Clear per-team supabase jump IDs and update isShared status
    const localUser = DB.getCurrentUser();
    if (localUser) {
      const jumps = DB.getActiveJumps(localUser.id).filter(j => j.columnId === col.id);
      for (const j of jumps) {
        const supabaseIdMap = { ...(j.supabaseIdMap || {}) };
        delete supabaseIdMap[resolvedTeamId];
        // Determine if still shared with any other team
        const remainingTeams = Object.keys(supabaseIdMap);
        DB.updateJump(localUser.id, j.id, {
          supabaseIdMap,
          isShared: remainingTeams.length > 0 ? 1 : 0,
          // Keep teamId/supabaseId if still used by old format or other path
        });
      }
    }
  } catch (err) {
    console.warn('unshareColumnFromSupabase error:', err.message);
  }
}

// ── Event delegation — replaces inline onclick handlers ───────────
// Listens at document level; keyed on data-jaction to avoid conflicts
// with other files' delegated listeners.
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-jaction]');
  if (!btn) return;
  const action = btn.dataset.jaction;
  const id     = btn.dataset.id || '';

  switch (action) {
    case 'confirm-unarchive':   confirmUnarchive(id); break;
    case 'confirm-delete':      confirmDelete(id); break;
    case 'do-unarchive':        doUnarchive(id); break;
    case 'do-delete':           doDelete(id); break;
    case 'do-archive':          doArchive(id); break;
    case 'open-config-columns': openConfigColumnsModal(); break;
    case 'save-jump':           saveJump(id); break;
    case 'save-shared-hotkey':  saveSharedHotkey(id); break;
    case 'save-columns':        saveColumns(); break;
    case 'close-edit-jump':     Modal.close(); openEditJumpModal(id); break;
    case 'pick-hotkey': {
      e.stopPropagation(); // prevent hotkeyPicker close-on-click listener from firing
      const inp    = document.getElementById('jHotkey');
      const lbl    = document.getElementById('btnPickHotkeyLabel');
      const picker = document.getElementById('hotkeyPicker');
      const key    = btn.dataset.key || '';
      if (inp) inp.value = key;
      if (lbl) {
        lbl.textContent = key || 'Select a hotkey…';
        lbl.style.color = key ? 'var(--text)' : 'var(--text-dim)';
      }
      if (picker) picker.style.display = 'none';
      break;
    }
  }
});
