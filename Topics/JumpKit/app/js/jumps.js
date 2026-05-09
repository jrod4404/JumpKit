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
              <button class="btn btn-subtle" style="font-size:0.78rem;padding:4px 10px" onclick="confirmUnarchive('${j.id}')"><svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore</button>
              <button class="btn btn-delete" style="font-size:0.78rem;padding:4px 10px" onclick="confirmDelete('${j.id}')"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete</button>
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
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-turq" onclick="doUnarchive('${id}')"><svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore</button>`, 'sm');
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
        <button class="btn btn-subtle" onclick="openConfigColumnsModal()"><svg class="ti ti-settings"><use href="img/tabler-sprite.svg#tabler-settings"/></svg> Configure Columns</button>
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

  columns.forEach((col, colIndex) => {
    const colJumps = jumps
      .filter(j => j.columnId === col.id)
      .sort((a, b) => a.name.localeCompare(b.name));

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
  if (window._supabaseProfile?.subscription_status === 'free') {
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
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-save" onclick="saveSharedHotkey('${id}')"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save</button>`, 'sm');

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
      <div style="display:flex;gap:8px;align-items:center;position:relative">
        <input class="form-input" id="jHotkey" tabindex="6" value="${esc(jump?.hotkey || '')}" placeholder="Click here then press combo…" autocomplete="off" style="cursor:pointer;flex:1"/>
        <button type="button" id="btnPickHotkey" style="white-space:nowrap;font-size:0.93rem;padding:10px 14px;border-radius:var(--radius);border:1.5px solid var(--border-input);background:var(--bg-input);color:var(--text);cursor:pointer;transition:border-color var(--transition)" title="Show available hotkeys">
          <svg class="ti ti-keyboard" style="width:1em;height:1em;vertical-align:-0.1em"><use href="img/tabler-sprite.svg#tabler-keyboard"/></svg> Pick
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
    <button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
    <button class="btn btn-subtle" id="btnSaveJump" onclick="saveJump('${editId || ''}')"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> ${editId ? 'Save Changes' : 'Add Jump'}</button>`;

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

  // ── Hotkey picker ───────────────────────────────────────────────
  const btnPickHotkey = document.getElementById('btnPickHotkey');
  const hotkeyPicker  = document.getElementById('hotkeyPicker');
  if (btnPickHotkey && hotkeyPicker) {
    btnPickHotkey.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hotkeyPicker.style.display !== 'none') { hotkeyPicker.style.display = 'none'; return; }

      // Collect all used hotkeys (excluding this jump if editing), normalized to lowercase
      const allJumps  = DB.getJumps(currentUser.id);
      const usedKeys  = new Set(
        allJumps
          .filter(j => j.hotkey && j.id !== (editId || null))
          .map(j => j.hotkey.toLowerCase().replace(/ctrl/i,'ctrl').replace(/cmd/i,'cmd'))
      );
      // Helper: check if a generated combo matches any stored hotkey (normalize mod key)
      function isUsed(combo) {
        const norm = combo.toLowerCase();
        // Also check with swapped mod (Cmd↔Ctrl) for cross-platform stored hotkeys
        const swapped = norm.replace(/^cmd/, 'ctrl').replace(/^ctrl/, 'cmd');
        return usedKeys.has(norm) || usedKeys.has(swapped);
      }

      const mod = 'Ctrl';

      // Build all combos — green if available, red if used
      const allCombos = [];
      for (let i = 65; i <= 90; i++) allCombos.push(`${mod}+Shift+${String.fromCharCode(i)}`);
      for (let i = 1; i <= 9; i++) allCombos.push(`${mod}+Shift+${i}`);

      hotkeyPicker.innerHTML = allCombos.map(k => {
        const used = isUsed(k);
        const bg   = used ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)';
        const col  = used ? '#ef4444' : '#22c55e';
        const cur  = used ? 'default' : 'pointer';
        const onclick = used ? '' : `onclick="document.getElementById('jHotkey').value='${k}';document.getElementById('hotkeyPicker').style.display='none'"`;
        return `<button type="button" ${onclick} style="font-size:0.75rem;padding:4px 10px;margin:3px 2px;border-radius:6px;border:1px solid ${col};background:${bg};color:${col};cursor:${cur};opacity:${used ? '0.7' : '1'}">${k}</button>`;
      }).join('');
      hotkeyPicker.style.display = 'block';
    });

    // Close picker when clicking outside
    document.addEventListener('click', () => { hotkeyPicker.style.display = 'none'; }, { once: false, capture: false });
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
        DB.updateJump(currentUser.id, editId, data);
        // If shared jump owned by this user, push update to Supabase
        const updatedJump = DB.getJumps(currentUser.id).find(j => j.id === editId);
        if (updatedJump?.isShared && updatedJump?.supabaseId) {
          const col = DB.getColumns(currentUser.id).find(c => c.id === updatedJump.columnId);
          if (col?.supabaseId) {
            supabaseClient.from('shared_jumps').update({
              name: data.name,
              url: data.url,
              description: data.description || '',
              reason: data.reason || '',
            }).eq('id', updatedJump.supabaseId).then(({ error }) => {
              if (error) console.warn('shared_jumps update:', error.message);
            });
          }
        }
      } else {
        DB.createJump(currentUser.id, data);
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
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Close</button>
     <button class="btn btn-subtle" onclick="Modal.close(); openEditJumpModal('${id}')"><svg class="ti ti-pencil"><use href="img/tabler-sprite.svg#tabler-pencil"/></svg> Edit</button>`, 'sm');
}

// ── Confirm Delete ─────────────────────────────────────────────────
function confirmDelete(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Permanently delete <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? This cannot be undone.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" onclick="doDelete('${id}')"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete</button>`, 'sm');
}
function doDelete(id) { DB.deleteJump(currentUser.id, id); Modal.close(); renderColumns(); }

// ── Confirm Archive ────────────────────────────────────────────────
function confirmArchive(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg> Archive Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Archive <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? It will be moved to the Archive tab and can be restored any time.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-turq" onclick="doArchive('${id}')"><svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg> Archive</button>`, 'sm');
}
function doArchive(id) { DB.updateJump(currentUser.id, id, { isArchived: true }); Modal.close(); renderColumns(); }

// ── Configure Columns Modal ────────────────────────────────────────
async function openConfigColumnsModal() {
  await fetchOwnedTeams();
  let cols = DB.getColumns(currentUser.id);
  while (cols.length < 10) {
    cols.push({ id: 'new_' + cols.length, userId: currentUser.id, name: '', visible: false, order: cols.length + 1, _new: true });
  }
  cols.sort((a, b) => a.order - b.order);
  renderColConfigModal(cols);
}

// Cached teams for column sharing dropdown (fetched once when modal opens)
let _colConfigTeams = [];

async function fetchOwnedTeams() {
  _colConfigTeams = [];
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const role = await getUserRole(session.user.id);
    if (role !== 'team-owner' && role !== 'org-owner') return;
    const { data: teams = [] } = await supabaseClient
      .from('teams')
      .select('id, name')
      .eq('owner_id', session.user.id);
    _colConfigTeams = teams;
  } catch (_) {}
}

async function getUserRole(userId) {
  try {
    const { data } = await supabaseClient.from('profiles').select('role').eq('id', userId).single();
    return data?.role || 'team-member';
  } catch (_) { return 'team-member'; }
}

function renderColConfigModal(cols) {
  const showTeamShare = _colConfigTeams.length > 0;

  const rows = cols.map((c, i) => {
    const teamLabel = c.teamId
      ? (_colConfigTeams.find(t => t.id === c.teamId)?.name || 'Personal only')
      : 'Personal only';
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
      ${showTeamShare ? `
      <div class="col-config-field">
        <span class="col-config-label">Share With</span>
        <div class="custom-select col-share-drop" data-colidx="${i}" style="font-size:.78rem">
          <div class="custom-select-trigger col-share-trigger" style="height:38px">
            <span class="col-share-label">${esc(teamLabel)}</span>
            <svg class="ti ti-chevron-down" style="font-size:.75rem;color:var(--text-dim)"><use href="img/tabler-sprite.svg#tabler-chevron-down"/></svg>
          </div>
          <div class="custom-select-menu col-share-menu">
            <div class="custom-select-option${!c.teamId ? ' selected' : ''}" data-value="">Personal only</div>
            ${_colConfigTeams.map(t => `<div class="custom-select-option${c.teamId === t.id ? ' selected' : ''}" data-value="${t.id}">${esc(t.name)}</div>`).join('')}
          </div>
        </div>
        <input type="hidden" class="col-teamid-input" data-field="teamId" value="${esc(c.teamId || '')}" />
      </div>` : ''}
    </div>`;
  }).join('');

  const body = `
    <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">
      Define up to 10 columns. Drag to reorder. Named + visible columns appear on the Jumps page left to right.
    </p>
    <div class="col-config-list" id="colConfigList">${rows}</div>`;

  Modal.open('<svg class="ti ti-layout-columns"><use href="img/tabler-sprite.svg#tabler-layout-columns"/></svg> Configure Columns', body,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-subtle" id="btnSaveColumns" onclick="saveColumns()"><svg class="ti ti-check"><use href="img/tabler-sprite.svg#tabler-check"/></svg> Save Columns</button>`, 'lg');
  initColDragDrop();
  
  // Wire up custom-select dropdowns for team sharing
  if (showTeamShare) {
    setTimeout(() => {
      document.querySelectorAll('.col-share-drop').forEach(drop => {
        const trigger = drop.querySelector('.col-share-trigger');
        const menu = drop.querySelector('.col-share-menu');
        const label = drop.querySelector('.col-share-label');
        const hiddenInput = drop.parentElement.querySelector('.col-teamid-input');
        
        if (trigger && menu) {
          trigger.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = menu.classList.contains('open');
            // Close all other dropdowns
            document.querySelectorAll('.col-share-menu.open').forEach(m => {
              if (m !== menu) m.classList.remove('open');
            });
            if (isOpen) {
              menu.classList.remove('open');
            } else {
              menu.classList.add('open');
            }
          });
          
          menu.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.addEventListener('click', () => {
              const value = opt.dataset.value || '';
              const text = opt.textContent;
              // Update label
              label.textContent = text;
              // Update hidden input
              if (hiddenInput) hiddenInput.value = value;
              // Update selected state
              menu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
              opt.classList.add('selected');
              // Close menu
              menu.classList.remove('open');
            });
          });
        }
      });
      // Close col-share dropdowns on outside click — scoped to modal, removed when modal closes
      const _colConfigModal = document.getElementById('modalBox');
      const _colShareCloseHandler = e => {
        if (!e.target.closest('.col-share-drop')) {
          document.querySelectorAll('.col-share-menu.open').forEach(m => m.classList.remove('open'));
        }
      };
      if (_colConfigModal) {
        _colConfigModal.addEventListener('mousedown', _colShareCloseHandler);
      }
    }, 0);
  }
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
  // Show spinner on save button
  const saveBtn = document.getElementById('btnSaveColumns');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<svg class="ti ti-loader-2 spin"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg> Saving…'; }

  await new Promise(r => setTimeout(r, 1000));

  const items    = document.querySelectorAll('.col-config-item');
  const existing = DB.getColumns(currentUser.id);
  const updated  = [];
  const toShare  = [];  // columns being assigned to a team
  const toUnshare = []; // columns being removed from a team

  items.forEach((item, i) => {
    const name     = item.querySelector('[data-field="name"]').value.trim();
    const visible  = item.querySelector('[data-field="visible"]').checked && name.length > 0;
    const order    = i + 1;
    const teamIdInput = item.querySelector('.col-teamid-input');
    const teamId   = teamIdInput ? (teamIdInput.value || null) : null;
    const isShared = !!teamId;
    const colId = item.dataset.colid;
    const existingCol = colId ? existing.find(c => c.id === colId) : existing[i];

    if (name) {
      let col;
      if (existingCol && !existingCol._new) {
        // Detect team sharing change
        const wasShared = !!existingCol.teamId;
        if (isShared) toShare.push({ ...existingCol, name, visible, order, isShared: 1, teamId });
        else if (wasShared && !isShared) toUnshare.push(existingCol);
        col = { ...existingCol, name, visible, order, isShared: isShared ? 1 : 0, teamId: teamId || null };
      } else {
        col = { id: 'col_' + Date.now() + '_' + i, userId: currentUser.id, name, visible, order, createdAt: Date.now(), isShared: isShared ? 1 : 0, teamId: teamId || null };
        if (isShared) toShare.push(col);
      }
      updated.push(col);
    } else if (existingCol && !existingCol._new) {
      if (existingCol.teamId) toUnshare.push(existingCol);
      updated.push({ ...existingCol, visible: false, order, isShared: 0, teamId: null });
    }
  });

  DB.saveColumns(currentUser.id, updated.filter(c => c.name));

  // Sync to Supabase for newly shared columns
  for (const col of toShare) {
    await syncColumnToSupabase(col);
  }
  // Remove from Supabase for unshared columns
  for (const col of toUnshare) {
    await unshareColumnFromSupabase(col);
  }
  // Sync position updates for already-shared columns that were reordered
  for (const col of updated) {
    if (col.isShared && col.teamId && col.supabaseId) {
      const was = existing.find(c => c.id === col.id);
      if (was && was.order !== col.order) {
        try {
          await supabaseClient
            .from('shared_columns')
            .update({ position: col.order })
            .eq('id', col.supabaseId);
        } catch (err) {
          console.warn('Failed to sync column reorder:', err.message);
        }
      }
    }
  }

  Modal.close();
  renderColumns();
  Toast.success('Columns saved!');
}

async function syncColumnToSupabase(col) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    // Use a stable UUID for Supabase — generate once and store locally
    if (!col.supabaseId) {
      col.supabaseId = crypto.randomUUID();
      DB.saveColumns(currentUser.id, DB.getColumns(currentUser.id).map(c => c.id === col.id ? { ...c, supabaseId: col.supabaseId } : c));
    }

    // Upsert shared_column — use unique constraint (team_id, created_by, name) to prevent dupes
    const { data: sc, error: scErr } = await supabaseClient
      .from('shared_columns')
      .upsert({
        id: col.supabaseId,
        team_id: col.teamId,
        name: col.name,
        position: col.order,
        created_by: session.user.id,
      }, { onConflict: 'team_id,created_by,name', ignoreDuplicates: false })
      .select()
      .single();
    if (scErr) { console.warn('shared_column upsert:', scErr.message); return; }

    // Upsert all jumps in this column
    const jumps = DB.getActiveJumps(currentUser.id).filter(j => j.columnId === col.id);
    for (const j of jumps) {
      // Generate a stable UUID for Supabase if not already set
      if (!j.supabaseId) {
        j.supabaseId = crypto.randomUUID();
        DB.updateJump(currentUser.id, j.id, { supabaseId: j.supabaseId });
      }
      await supabaseClient.from('shared_jumps').upsert({
        id: j.supabaseId,
        shared_column_id: sc.id,
        team_id: col.teamId,
        name: j.name,
        url: j.url,
        description: j.description || '',
        reason: j.reason || '',
        position: 0,
        created_by: session.user.id,
      }, { onConflict: 'id' });

      // Mark local jump as shared
      DB.updateJump(currentUser.id, j.id, { isShared: 1, teamId: col.teamId });
    }
  } catch (err) {
    console.warn('syncColumnToSupabase error:', err.message);
  }
}

async function unshareColumnFromSupabase(col) {
  try {
    // Delete shared_jumps for this column then the column itself
    // (cascade should handle it, but let's be explicit)
    await supabaseClient.from('shared_columns').delete().eq('id', col.supabaseId || col.id);
    // Mark local jumps as not shared
    const jumps = DB.getActiveJumps(currentUser.id).filter(j => j.columnId === col.id);
    for (const j of jumps) {
      DB.updateJump(currentUser.id, j.id, { isShared: 0, teamId: null });
    }
  } catch (err) {
    console.warn('unshareColumnFromSupabase error:', err.message);
  }
}
