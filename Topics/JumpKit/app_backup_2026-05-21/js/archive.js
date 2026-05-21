// ── Archive Page ───────────────────────────────────────────────────
function renderArchive() {
  const area = document.getElementById('pageContent') || document.getElementById('columnsArea');
  if (!area) return;
  area.style.display = 'block';
  area.innerHTML = `<div id="archiveList"></div>`;
  renderArchiveList();
}

function renderArchiveList() {
  const list  = document.getElementById('archiveList');
  if (!list) return;
  const jumps = DB.getArchivedJumps(currentUser.id);

  if (jumps.length === 0) {
    list.innerHTML = `
      <div class="placeholder-page">
        <div class="big-icon"><svg class="ti ti-archive"><use href="img/tabler-sprite.svg#tabler-archive"/></svg></div>
        <h2>Nothing archived yet</h2>
        <p>When you archive a jump it'll show up here. You can restore it or permanently delete it anytime.</p>
      </div>`;
    return;
  }

  const cols = DB.getColumns(currentUser.id);
  list.className = 'archive-list';
  list.innerHTML = jumps.map(j => {
    const col  = cols.find(c => c.id === j.columnId);
    const icon = isURL(j.url) ? 'ti-link' : 'ti-folder';
    return `
      <div class="archive-item">
        <span style="font-size:1.2rem"><i class="ti ${icon}"></i></span>
        <div class="archive-item-info">
          <div class="archive-item-name">${esc(j.name)} ${j.favorite ? '<svg class="ti ti-star-filled" style="color:#f6ad55;font-size:.85rem"><use href="img/tabler-sprite.svg#tabler-star-filled"/></svg>' : ''}</div>
          <div class="archive-item-url">${esc(j.url)}</div>
          ${col ? `<div style="font-size:.75rem;color:var(--hover-accent);margin-top:2px">${esc(col.name)}</div>` : ''}
        </div>
        <div class="archive-item-actions">
          <button class="btn btn-subtle btn-sm" title="Launch" onclick="handleJumpClick('${j.id}')"><svg class="ti ti-external-link"><use href="img/tabler-sprite.svg#tabler-external-link"/></svg> Launch</button>
          <button class="btn btn-subtle btn-sm" title="Details" onclick="openJumpDetails('${j.id}')"><svg class="ti ti-info-circle"><use href="img/tabler-sprite.svg#tabler-info-circle"/></svg> Details</button>
          <button class="btn btn-subtle btn-sm" title="Edit" onclick="openEditJumpModal('${j.id}')"><svg class="ti ti-pencil"><use href="img/tabler-sprite.svg#tabler-pencil"/></svg> Edit</button>
          <button class="btn btn-subtle btn-sm" title="Restore" onclick="confirmUnarchive('${j.id}')"><svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore</button>
          <button class="btn btn-delete btn-sm" title="Delete" onclick="confirmDeleteArchived('${j.id}')"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete</button>
        </div>
      </div>`;
  }).join('');
}

function confirmUnarchive(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Restore <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong> back to the Jumps page?</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-turq" onclick="doUnarchive('${id}')"><svg class="ti ti-restore"><use href="img/tabler-sprite.svg#tabler-restore"/></svg> Restore</button>`, 'sm');
}
// doUnarchive is defined in jumps.js — do not redefine here

function confirmDeleteArchived(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Permanently Delete',
    `<p style="color:var(--text-muted);font-size:.95rem">Permanently delete <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? This cannot be undone.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><svg class="ti ti-x"><use href="img/tabler-sprite.svg#tabler-x"/></svg> Cancel</button>
     <button class="btn btn-delete" onclick="doDeleteArchived('${id}')"><svg class="ti ti-trash"><use href="img/tabler-sprite.svg#tabler-trash"/></svg> Delete Forever</button>`, 'sm');
}
function doDeleteArchived(id) { DB.deleteJump(currentUser.id, id); Modal.close(); renderArchiveList(); }
