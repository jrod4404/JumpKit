// ── Archive Page ───────────────────────────────────────────────────
function renderArchive() {
  const area = document.getElementById('columnsArea');
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
      <div class="no-columns">
        <div class="big-icon"><i class="ti ti-archive"></i></div>
        <h3>Archive is empty</h3>
        <p>Archived jumps appear here. Restore or permanently delete them from this page.</p>
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
          <div class="archive-item-name">${esc(j.name)} ${j.favorite ? '<i class="ti ti-star-filled" style="color:#f6ad55;font-size:.85rem"></i>' : ''}</div>
          <div class="archive-item-url">${esc(j.url)}</div>
          ${col ? `<div style="font-size:.75rem;color:var(--hover-accent);margin-top:2px">${esc(col.name)}</div>` : ''}
        </div>
        <div class="archive-item-actions">
          <button class="btn btn-subtle btn-sm" title="Launch" onclick="handleJumpClick('${j.id}')"><i class="ti ti-external-link"></i> Launch</button>
          <button class="btn btn-subtle btn-sm" title="Details" onclick="openJumpDetails('${j.id}')"><i class="ti ti-info-circle"></i> Details</button>
          <button class="btn btn-subtle btn-sm" title="Edit" onclick="openEditJumpModal('${j.id}')"><i class="ti ti-pencil"></i> Edit</button>
          <button class="btn btn-subtle btn-sm" title="Restore" onclick="confirmUnarchive('${j.id}')"><i class="ti ti-restore"></i> Restore</button>
          <button class="btn btn-delete btn-sm" title="Delete" onclick="confirmDeleteArchived('${j.id}')"><i class="ti ti-trash"></i> Delete</button>
        </div>
      </div>`;
  }).join('');
}

function confirmUnarchive(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<i class="ti ti-restore"></i> Restore Jump',
    `<p style="color:var(--text-muted);font-size:.95rem">Restore <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong> back to the Jumps page?</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-turq" onclick="doUnarchive('${id}')"><i class="ti ti-restore"></i> Restore</button>`, 'sm');
}
function doUnarchive(id) { DB.updateJump(currentUser.id, id, { isArchived: false }); Modal.close(); renderArchiveList(); }

function confirmDeleteArchived(id) {
  const j = DB.getJumps(currentUser.id).find(j => j.id === id);
  Modal.open('<i class="ti ti-trash"></i> Permanently Delete',
    `<p style="color:var(--text-muted);font-size:.95rem">Permanently delete <strong style="color:var(--text-card-title)">${esc(j?.name)}</strong>? This cannot be undone.</p>`,
    `<button class="btn btn-subtle" onclick="Modal.close()"><i class="ti ti-x"></i> Cancel</button>
     <button class="btn btn-delete" onclick="doDeleteArchived('${id}')"><i class="ti ti-trash"></i> Delete Forever</button>`, 'sm');
}
function doDeleteArchived(id) { DB.deleteJump(currentUser.id, id); Modal.close(); renderArchiveList(); }
