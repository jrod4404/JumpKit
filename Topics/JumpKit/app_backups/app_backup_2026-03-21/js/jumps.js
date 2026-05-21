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
        <button class="btn btn-subtle btn-sm" id="btnAddJump"><i class="ti ti-plus"></i> Add Jump</button>
        <button class="btn btn-subtle btn-sm" id="btnConfigCols"><i class="ti ti-settings"></i> Configure Columns</button>
      </div>
      <div class="jump-filter-bar" id="jumpFilterBar">
        <div class="jfb-slider" id="jfbSlider"></div>
        ${JUMP_FILTERS.map(f => `<button class="jfb-tab${f===currentJumpFilter?' active':''}" data-filter="${f}">${FILTER_LABELS[f]}</button>`).join('')}
      </div>
      <div class="jump-search-wrap">
        <i class="ti ti-search jump-search-icon"></i>
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
      { icon: '<i class="ti ti-plus"></i>',     label: 'Add Jump',          action: openAddJumpModal },
      { icon: '<i class="ti ti-settings"></i>',  label: 'Configure Columns', action: openConfigColumnsModal },
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
  if (currentJumpFilter === 'archive') { renderArchive(); return; }
  if (area) area.style.display = '';
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
        <div class="big-icon"><i class="ti ti-layout-columns"></i></div>
        <h3>No columns yet</h3>
        <p>Right-click here or click "Configure Columns" to create your first jump category.</p>
        <button class="btn btn-subtle" onclick="openConfigColumnsModal()"><i class="ti ti-settings"></i> Configure Columns</button>
      </div>`;
    return;
  }

  // For non-active filters: same column structure, filtered jumps per column
  if (currentJumpFilter !== 'active') {
    const filteredIds = new Set(jumps.map(j => j.id));
    if (filteredIds.size === 0) {
      area.innerHTML = `<div class="no-columns"><div class="big-icon"><i class="ti ti-mood-empty"></i></div><p>No jumps match this filter.</p></div>`;
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
          <span>${col.name}</span>
          <span class="col-count">${colJumps.length}</span>
        </div>
        <div class="col-items">${colJumps.map(j => jumpItemHTML(j, colIndex)).join('')}</div>`;
      area.appendChild(colEl);
    });
    // Use same column width as active view (based on total visible columns, not rendered count)
    area.style.gridTemplateColumns = `repeat(${columns.length}, minmax(0, 1fr))`;
    bindJumpEvents();
    return;
  }

  columns.forEach((col, colIndex) => {
    const colJumps = jumps
      .filter(j => j.columnId === col.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    const colEl = document.createElement('div');
    colEl.className = 'jump-column';
    colEl.innerHTML = `
      <div class="col-header">
        <span>${col.name}</span>
        <span class="col-count">${colJumps.length}</span>
      </div>
      <div class="col-items" id="col-${col.id}">
        ${colJumps.length === 0
          ? '<div class="empty-col">No jumps yet</div>'
          : colJumps.map(j => jumpItemHTML(j, colIndex)).join('')}
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
  const icon = isURL(j.url) ? 'ti-link' : 'ti-folder';
  const iconColor = j.favorite ? `color:${FAVE_COLORS[colIndex % FAVE_COLORS.length]}` : '';
  const prefs = DB.getPrefs(currentUser.id);
  return `<div class="jump-item" data-id="${j.id}">
    <span class="jump-icon"><i class="ti ${icon}" style="${iconColor}"></i></span>
    <div class="jump-info">
      <div class="jump-name">${esc(j.name)}</div>
      ${prefs.showDescription && j.description ? `<div class="jump-desc">${esc(j.description)}</div>` : ''}
    </div>
    ${prefs.showHotkey && j.hotkey ? `<span class="jump-hotkey-pill">${esc(j.hotkey)}</span>` : ''}
    ${j.favorite ? `<span class="jump-fav"><i class="ti ti-star-filled" style="color:${FAVE_COLORS[colIndex % FAVE_COLORS.length]}"></i></span>` : ''}
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
  refreshStatsBar();
  Toast.success(`Launched <strong>${esc(jump.name)}</strong>`);
  if (window.electronAPI?.isElectron) {
    window.electronAPI.openUrl(jump.url);
  } else {
    window.open(jump.url, '_blank', 'noopener');
  }
}

function openJumpContextMenu(x, y, id) {
  const jump = DB.getJumps(currentUser.id).find(j => j.id === id);
  if (!jump) return;
  CtxMenu.show(x, y, [
    { icon: '<i class="ti ti-clipboard"></i>',     label: 'Copy URL',  action: () => { navigator.clipboard.writeText(jump.url); } },
    { icon: '<i class="ti ti-info-circle"></i>',   label: 'Details',   action: () => openJumpDetails(id) },
    { icon: '<i class="ti ti-pencil"></i>',        label: 'Edit',      action: () => openEditJumpModal(id) },
    { icon: '<i class="ti ti-archive"></i>',       label: 'Archive',   action: () => confirmArchive(id) },
    'divider',
    { icon: '<i class="ti ti-trash"></i>',         label: 'Delete',    action: () => confirmDelete(id), danger: true },
  ]);
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
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="jDesc" tabindex="3" placeholder="Optional description">${esc(jump?.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Column *</label>
      <input type="hidden" id="jCol" value="${esc(jump?.columnId || '')}"/>
      <div class="custom-select" id="jColDrop">
        <div class="custom-select-trigger" id="jColTrigger" tabindex="4">
          <span id="jColLabel">${jump?.columnId ? (DB.getColumns(currentUser.id).find(c=>c.id===jump.columnId)?.name || '— Select Column —') : '— Select Column —'}</span>
          <i class="ti ti-chevron-down" style="font-size:.8rem;color:var(--text-dim)"></i>
        </div>
        <div class="custom-select-menu" id="jColMenu">
          ${DB.getColumns(currentUser.id).filter(c=>c.visible).sort((a,b)=>a.order-b.order).map(c=>`
            <div class="custom-select-option" data-value="${esc(c.id)}">${esc(c.name)}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Added Because</label>
      <input class="form-input" id="jReason" tabindex="5" value="${esc(jump?.reason || '')}" placeholder="Optional reminder why this jump was added"/>
    </div>
    <div class="form-group">
      <label class="form-label">Hotkey</label>
      <input class="form-input" id="jHotkey" tabindex="6" value="${esc(jump?.hotkey || '')}" placeholder="Click here then press combo…" autocomplete="off" style="cursor:pointer"/>
    </div>
    <div class="form-group">
      <label class="form-label">Favorite</label>
      <div class="toggle-wrap">
        <label class="toggle">
          <input type="checkbox" id="jFavorite" ${jump?.favorite ? 'checked' : ''}/>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">Mark as favorite</span>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
    <button class="btn btn-save" onclick="saveJump('${editId || ''}')"><i class="ti ti-check"></i> ${editId ? 'Save Changes' : 'Add Jump'}</button>`;

  Modal.open(editId ? '<i class="ti ti-pencil"></i> Edit Jump' : '<i class="ti ti-plus"></i> Add Jump', body, footer);

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

  // Hotkey recorder — captures combo on keydown, clears on Backspace/Delete
  const hotkeyInput = document.getElementById('jHotkey');
  if (hotkeyInput) {
    hotkeyInput.addEventListener('click', () => {
      hotkeyInput.dataset.recording = '1';
      hotkeyInput.style.borderColor = 'var(--hover-accent)';
      hotkeyInput.placeholder = 'Press your key combo…';
      hotkeyInput.focus();
    });
    hotkeyInput.addEventListener('blur', () => {
      delete hotkeyInput.dataset.recording;
      hotkeyInput.style.borderColor = '';
      hotkeyInput.placeholder = 'Click here then press combo…';
    });
    hotkeyInput.addEventListener('keydown', e => {
      if (!hotkeyInput.dataset.recording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { hotkeyInput.blur(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { hotkeyInput.value = ''; return; }
      const chord = buildChord(e);
      if (chord) hotkeyInput.value = chord;
    });
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

  const data = {
    name, url,
    description: document.getElementById('jDesc').value.trim(),
    reason:      document.getElementById('jReason').value.trim(),
    columnId:    document.getElementById('jCol').value,
    hotkey:      document.getElementById('jHotkey').value.trim(),
    favorite:    document.getElementById('jFavorite').checked,
  };

  if (editId) { DB.updateJump(currentUser.id, editId, data); }
  else        { DB.createJump(currentUser.id, data); }
  Modal.close();
  renderColumns();
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
  Modal.open('<i class="ti ti-info-circle"></i> Jump Details', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Close</button>
     <button class="btn btn-subtle" onclick="Modal.close(); openEditJumpModal('${id}')"><i class="ti ti-pencil"></i> Edit</button>`, 'sm');
}

// ── Confirm Delete ─────────────────────────────────────────────────
function confirmDelete(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<i class="ti ti-trash"></i> Delete Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Permanently delete <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? This cannot be undone.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-delete" onclick="doDelete('${id}')"><i class="ti ti-trash"></i> Delete</button>`, 'sm');
}
function doDelete(id) { DB.deleteJump(currentUser.id, id); Modal.close(); renderColumns(); }

// ── Confirm Archive ────────────────────────────────────────────────
function confirmArchive(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<i class="ti ti-archive"></i> Archive Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Archive <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? It will be moved to the Archive tab and can be restored any time.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-turq" onclick="doArchive('${id}')"><i class="ti ti-archive"></i> Archive</button>`, 'sm');
}
function doArchive(id) { DB.updateJump(currentUser.id, id, { isArchived: true }); Modal.close(); renderColumns(); }

// ── Configure Columns Modal ────────────────────────────────────────
function openConfigColumnsModal() {
  let cols = DB.getColumns(currentUser.id);
  while (cols.length < 10) {
    cols.push({ id: 'new_' + cols.length, userId: currentUser.id, name: '', visible: false, order: cols.length + 1, _new: true });
  }
  cols.sort((a, b) => a.order - b.order);
  renderColConfigModal(cols);
}

function renderColConfigModal(cols) {
  const rows = cols.map((c, i) => `
    <div class="col-config-item" data-idx="${i}" draggable="true">
      <span class="col-drag-handle" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></span>
      <input class="form-input" placeholder="Column name" value="${esc(c.name)}" data-field="name" style="font-size:.85rem;padding:7px 10px"/>
      <div class="toggle-wrap" style="justify-content:center">
        <label class="toggle">
          <input type="checkbox" data-field="visible" ${c.visible && c.name ? 'checked' : ''}/>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <span style="font-size:.72rem;color:var(--text-dim);text-align:center">Visible</span>
    </div>`).join('');

  const body = `
    <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">
      Define up to 10 columns. Drag to reorder. Named + visible columns appear on the Jumps page left to right.
    </p>
    <div class="col-config-list" id="colConfigList">${rows}</div>`;

  Modal.open('<i class="ti ti-layout-columns"></i> Configure Columns', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-save" onclick="saveColumns()"><i class="ti ti-check"></i> Save Columns</button>`, 'lg');
  initColDragDrop();
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

function saveColumns() {
  const items    = document.querySelectorAll('.col-config-item');
  const existing = DB.getColumns(currentUser.id);
  const updated  = [];
  items.forEach((item, i) => {
    const name    = item.querySelector('[data-field="name"]').value.trim();
    const visible = item.querySelector('[data-field="visible"]').checked && name.length > 0;
    const order   = i + 1;
    const existingCol = existing[i];
    if (name) {
      if (existingCol && !existingCol._new) updated.push({ ...existingCol, name, visible, order });
      else updated.push({ id: 'col_' + Date.now() + '_' + i, userId: currentUser.id, name, visible, order, createdAt: Date.now() });
    } else if (existingCol && !existingCol._new) {
      updated.push({ ...existingCol, visible: false, order });
    }
  });
  DB.saveColumns(currentUser.id, updated.filter(c => c.name));
  Modal.close();
  renderColumns();
}
