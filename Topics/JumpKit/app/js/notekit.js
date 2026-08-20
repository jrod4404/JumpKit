/* notekit.js — NoteKit: Projects → Pages → note blocks (feature-flagged).
 * Isolated from the JumpKit architecture: own SQLite store (notekit.db),
 * own nav section, own page. No-op unless NOTEKIT_ENABLED=true.
 * Spec: Topics/JumpKit/NOTEKIT_SPEC.md (locked 2026-08-19).
 */
(() => {
  'use strict';

  const NK = {
    enabled: false,
    projects: [],
    pages: [],
    activeProjectId: null,
    activePageId: null,
    blocks: [],
    saveTimer: null,
    dirty: false,
  };

  // ── Init ────────────────────────────────────────────────────────────
  async function init() {
    const api = window.electronAPI;
    if (!api || typeof api.notekitEnabled !== 'function') return;
    try { NK.enabled = !!(await api.notekitEnabled()); } catch { NK.enabled = false; }
    if (!NK.enabled) return;

    // Show the sidebar section.
    const label = document.getElementById('notekitNavLabel');
    const wrap = document.getElementById('notekitNavWrap');
    if (label) label.style.display = 'block';
    if (wrap) { wrap.style.display = 'block'; renderNav(); }

    // Plus button to the right of the NOTEKIT label → create a new project.
    const addBtn = document.getElementById('nkAddProjectBtn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        promptAddProject();
      });
      // Show only when NoteKit is enabled (the whole section is gated above).
    }

    // Wire the nav item click (we render project tree inside #notekitNavWrap).
    document.addEventListener('click', onNavClick);
  }

  // ── Sidebar tree (projects only — pages render as tabs) ────────────
  async function refreshProjects() {
    const api = window.electronAPI;
    NK.projects = (await api.notekitListProjects()) || [];
  }

  const PROJECT_ICONS = [
    'folder', 'notes', 'clipboard', 'clipboard-list', 'checklist', 'list-check',
    'brain', 'bulb', 'star', 'star-filled', 'tag', 'rocket', 'tool', 'settings',
    'bell', 'bell-off', 'building', 'home', 'users', 'users-group', 'user', 'user-circle',
    'lock', 'search', 'sun', 'moon', 'package', 'keyboard', 'layout', 'layout-grid',
    'layout-columns', 'mail', 'message-circle', 'mouse', 'id-badge', 'link', 'send',
    'sparkles', 'heart', 'flag', 'cloud-off', 'clock-dollar', 'headset', 'apple',
    'brand-apple', 'device-floppy', 'database-export', 'download', 'file-check',
    'archive', 'refresh', 'restore', 'rotate', 'share', 'sort-ascending', 'git-commit',
    'rosette-discount-check', 'help-circle', 'info-circle', 'alert-circle', 'alert-triangle',
  ];

  function projectIconHtml(icon) {
    const name = PROJECT_ICONS.includes(icon) ? icon : 'folder';
    return `<svg class="ti ti-${name} nav-icon"><use href="img/tabler-sprite.min.svg#tabler-${name}"/></svg>`;
  }

  async function renderNav() {
    const wrap = document.getElementById('notekitNavWrap');
    if (!wrap) return;
    await refreshProjects();
    let html = '';
    for (const p of NK.projects) {
      const active = NK.activeProjectId === p.id;
      html += `
        <div class="nk-project" data-project-id="${p.id}">
          <div class="nk-project-row ${active ? 'active' : ''}" data-action="open-project" data-id="${p.id}" title="${esc(p.name)}">
            ${projectIconHtml(p.icon)}
            <span class="nk-project-name">${esc(p.name)}</span>
            <span class="nk-project-more" data-id="${p.id}" title="Project options">⋯</span>
          </div>
        </div>`;
    }
    wrap.innerHTML = html;
    // Wire a DIRECT click handler on each ⋯ so the app's global
    // document-click `CtxMenu.hide()` never hides the menu on the same event.
    wrap.querySelectorAll('.nk-project-more').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        openNkMenuFromBtn(btn);
      });
    });
  }

  function onNavClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    const projectId = el.dataset.project;
    if (action === 'open-project') {
      openProject(id);
    } else if (action === 'tab-page') {
      if (projectId) NK.activeProjectId = projectId;
      openPage(id);
    } else if (action === 'add-page') {
      if (projectId) { NK.activeProjectId = projectId; promptAddPage(projectId); }
    }
  }

  async function openProject(projectId) {
    const api = window.electronAPI;
    NK.activeProjectId = projectId;
    NK.activePageId = null;
    NK.blocks = [];
    // If the project has pages, open the first one; otherwise show the empty project state.
    const pages = (await api.notekitListPages(projectId)) || [];
    renderNav();
    if (pages.length > 0) {
      await openPage(pages[0].id, pages);
    } else {
      renderProjectEmpty(projectId);
    }
  }

  // ── Project / page menus (rename / delete — soft delete) ───────────
  // Use the app's canonical CtxMenu (same #ctxMenu element the app controls),
  // and open via a DIRECT click handler on the ⋯ button that fully stops
  // propagation so the app's global document-click `CtxMenu.hide()` never
  // clobbers the freshly opened menu on the same event.
  function openNkMenuFromBtn(btn) {
    if (!btn) return;
    const id = btn.dataset.id;
    const anchor = btn;
    const rect = anchor.getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 4;
    let html;
    if (btn.dataset.kind === 'page') {
      const projectId = btn.dataset.project;
      html = [
        { label: 'Rename page', action: () => promptRenamePage(id, projectId) },
        { label: 'Delete page', danger: true, action: () => confirmDeletePage(id, projectId) },
      ];
    } else {
      html = [
        { label: 'Rename project', action: () => promptRenameProject(id) },
        { label: 'Change icon', action: () => pickProjectIcon(id) },
        { label: 'Delete project', danger: true, action: () => confirmDeleteProject(id) },
      ];
    }
    if (window.CtxMenu && typeof window.CtxMenu.show === 'function') {
      window.CtxMenu.show(x, y, html);
    } else {
      openNkMenuFallback(anchor, btn.dataset.kind === 'page'
        ? `<button class="ctx-item" data-nk="${id}">Rename page</button>`
        : `<button class="ctx-item" data-nk="${id}">Rename project</button>`);
    }
  }
  function openNkMenuFallback(anchorEl, html) {
    const menu = document.getElementById('ctxMenu');
    if (!menu) return;
    menu.innerHTML = html;
    menu.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
  }


  // ── Project / page icon picker ──────────────────────────────────────
  function nkIconPicker(title, currentIcon) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'nk-modal-overlay';
      overlay.innerHTML = `
        <div class="nk-modal nk-modal-icon" role="dialog" aria-modal="true">
          <div class="nk-modal-title">${esc(title)}</div>
          <div class="nk-icon-grid">
            ${PROJECT_ICONS.map(ic => `
              <button type="button" class="nk-icon-opt ${ic === (currentIcon || 'folder') ? 'selected' : ''}" data-icon="${ic}" title="${ic}">
                <svg class="ti ti-${ic}" style="font-size:1.15rem"><use href="img/tabler-sprite.min.svg#tabler-${ic}"/></svg>
              </button>`).join('')}
          </div>
          <div class="nk-modal-btns">
            <button class="nk-btn" data-nk-modal="cancel">Cancel</button>
            <button class="nk-btn nk-btn-primary" data-nk-modal="ok">OK</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      let chosen = PROJECT_ICONS.includes(currentIcon) ? currentIcon : 'folder';
      const onPick = (e) => {
        const btn = e.target.closest('.nk-icon-opt');
        if (!btn) return;
        chosen = btn.dataset.icon;
        overlay.querySelectorAll('.nk-icon-opt').forEach(b => b.classList.toggle('selected', b === btn));
      };
      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') { e.preventDefault(); close(chosen); }
      };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', onPick);
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
      overlay.querySelector('[data-nk-modal="ok"]').addEventListener('click', () => close(chosen));
      overlay.querySelector('[data-nk-modal="cancel"]').addEventListener('click', () => close(null));
    });
  }

  // ── In-app modal dialogs (window.prompt/confirm are NOT supported in Electron) ──
  function nkPrompt(title, defaultValue = '') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'nk-modal-overlay';
      overlay.innerHTML = `
        <div class="nk-modal" role="dialog" aria-modal="true">
          <div class="nk-modal-title">${esc(title)}</div>
          <input class="nk-modal-input" type="text" value="${esc(defaultValue)}" placeholder="${esc(defaultValue)}"/>
          <div class="nk-modal-btns">
            <button class="nk-btn" data-nk-modal="cancel">Cancel</button>
            <button class="nk-btn nk-btn-primary" data-nk-modal="ok">OK</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('.nk-modal-input');
      input.focus();
      input.select();
      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') { e.preventDefault(); close(input.value); }
      };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
      overlay.querySelector('[data-nk-modal="ok"]').addEventListener('click', () => close(input.value));
      overlay.querySelector('[data-nk-modal="cancel"]').addEventListener('click', () => close(null));
    });
  }

  function nkConfirm(message, okText = 'Delete', danger = true) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'nk-modal-overlay';
      overlay.innerHTML = `
        <div class="nk-modal" role="dialog" aria-modal="true">
          <div class="nk-modal-title">${esc('Confirm')}</div>
          <div class="nk-modal-msg">${esc(message)}</div>
          <div class="nk-modal-btns">
            <button class="nk-btn" data-nk-modal="cancel">Cancel</button>
            <button class="nk-btn ${danger ? 'nk-btn-danger' : 'nk-btn-primary'}" data-nk-modal="ok">${esc(okText)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter') { e.preventDefault(); close(true); }
      };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
      overlay.querySelector('[data-nk-modal="ok"]').addEventListener('click', () => close(true));
      overlay.querySelector('[data-nk-modal="cancel"]').addEventListener('click', () => close(false));
    });
  }

  function promptAddProject() {
    nkPrompt('New project name', 'Untitled').then((name) => {
      if (name === null) return;
      const projectName = name.trim() || 'Untitled';
      nkIconPicker('Choose a project icon', 'folder').then((icon) => {
        window.electronAPI.notekitCreateProject(projectName, icon || 'folder').then((r) => {
          NK.activeProjectId = null;
          renderNav();
          if (r && r.id) {
            NK.activeProjectId = r.id;
            openProject(r.id);
          }
        });
      });
    });
  }
  function pickProjectIcon(id) {
    const p = NK.projects.find(x => x.id === id);
    nkIconPicker('Choose a project icon', p ? p.icon : 'folder').then((icon) => {
      if (icon === null) return;
      window.electronAPI.notekitSetProjectIcon(id, icon).then(() => renderNav());
    });
  }
  function promptRenameProject(id) {
    const p = NK.projects.find(x => x.id === id);
    nkPrompt('Rename project', p ? p.name : '').then((name) => {
      if (name === null || !name.trim()) return;
      window.electronAPI.notekitRenameProject(id, name.trim()).then(() => renderNav());
    });
  }
  function confirmDeleteProject(id) {
    nkConfirm('Delete this project and all its pages? (soft delete — recoverable in DB)').then((ok) => {
      if (!ok) return;
      window.electronAPI.notekitDeleteProject(id).then(() => {
        if (NK.activeProjectId === id) { NK.activeProjectId = null; NK.activePageId = null; showEmpty(); }
        renderNav();
      });
    });
  }
  function promptAddPage(projectId) {
    nkPrompt('New page title', 'Untitled').then((title) => {
      if (title === null) return;
      window.electronAPI.notekitCreatePage(projectId, title.trim() || 'Untitled').then((r) => {
        if (r && r.ok) { NK.activeProjectId = projectId; NK.activePageId = r.id; renderNav(); openPage(r.id); }
      });
    });
  }
  function promptRenamePage(pageId, projectId) {
    const api = window.electronAPI;
    api.notekitListPages(projectId).then((pages) => {
      const pg = (pages || []).find(p => p.id === pageId);
      nkPrompt('Rename page', pg ? pg.title : '').then((title) => {
        if (title === null || !title.trim()) return;
        api.notekitRenamePage(pageId, title.trim()).then(() => {
          renderNav();
          // Refresh open page if it's the one being renamed.
          if (NK.activePageId === pageId) openPage(pageId);
        });
      });
    });
  }
  function confirmDeletePage(pageId, projectId) {
    nkConfirm('Delete this page? (soft delete — recoverable in DB)').then((ok) => {
      if (!ok) return;
      window.electronAPI.notekitDeletePage(pageId).then(() => {
        if (NK.activePageId === pageId) {
          NK.activePageId = null;
          openProject(projectId); // falls back to first page or empty state
        } else {
          renderNav();
          // Refresh the tab row too so the deleted page's tab disappears.
          window.electronAPI.notekitListPages(projectId).then((pages) => {
            renderTabs(pages || []);
          });
        }
      });
    });
  }

  // ── Page view (Notion-like blocks) ──────────────────────────────────
  // ── Page tab bar ───────────────────────────────────────────────────
  function tabsToHtml(pages) {
    const addBtn = `<button class="nk-tab nk-tab-add" data-action="add-page" data-project="${esc(NK.activeProjectId || '')}" title="Add page">+</button>`;
    const tabs = (pages || []).map(pg => `
      <div class="nk-tab ${NK.activePageId === pg.id ? 'active' : ''}" data-action="tab-page" data-id="${esc(pg.id)}" data-project="${esc(NK.activeProjectId || '')}" title="${esc(pg.title)}">
        <svg class="ti ti-file-text" style="font-size:0.85rem"><use href="img/tabler-sprite.min.svg#tabler-file-text"/></svg>
        <span class="nk-tab-name">${esc(pg.title)}</span>
        <span class="nk-tab-more" data-kind="page" data-id="${esc(pg.id)}" data-project="${esc(NK.activeProjectId || '')}" title="Page options">⋯</span>
      </div>`).join('');
    // 'Pages' label left-aligned, then page tabs, then the + page button.
    return `<div class="nk-tabs" id="nkTabs"><span class="nk-tabs-label">Pages</span>${tabs}${addBtn}</div>`;
  }

  function renderTabs(pages) {
    const tabBar = document.getElementById('nkTabs');
    if (!tabBar) return;
    tabBar.outerHTML = tabsToHtml(pages);
    wireTabMoreButtons();
  }

  // Direct click handlers for the page-tab ⋯ (avoids global CtxMenu.hide clobber).
  function wireTabMoreButtons() {
    const bar = document.getElementById('nkTabs');
    if (!bar) return;
    bar.querySelectorAll('.nk-tab-more').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        openNkMenuFromBtn(btn);
      });
    });
  }

  // ── Rich-text floating format bar ────────────────────────────────────
  function wireFmtBar() {
    const bar = document.getElementById('nkFmtBar');
    if (!bar) return;
    bar.querySelectorAll('button[data-fmt]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const kind = btn.dataset.fmt;
        if (kind === 'bold') document.execCommand('bold');
        else if (kind === 'italic') document.execCommand('italic');
        else if (kind === 'code') wrapInlineCode();
        else if (kind === 'link') promptLink();
        else return;
        if (kind === 'bold' || kind === 'italic') {
          const t = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('nk-text') ? document.activeElement : null;
          syncRichInput(t);
        }
        hideFmtBar();
      });
    });
    // Show the bar when a non-collapsed selection exists inside a text block.
    document.addEventListener('selectionchange', debounce(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hideFmtBar(); return; }
      const node = sel.anchorNode;
      const el = node && node.nodeType === 3 ? node.parentElement : node;
      if (!el || !el.closest('.nk-text')) { hideFmtBar(); return; }
      let rect = null;
      try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch { rect = null; }
      if (!rect || (rect.width === 0 && rect.height === 0)) { hideFmtBar(); return; }
      const barEl = document.getElementById('nkFmtBar');
      if (!barEl) return;
      barEl.style.display = 'flex';
      barEl.style.left = Math.max(8, rect.left + rect.width / 2 - 110) + 'px';
      barEl.style.top = (rect.top - barEl.offsetHeight - 8) + 'px';
    }, 120));
    // Hide when clicking anywhere outside the bar.
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest || !e.target.closest('#nkFmtBar')) hideFmtBar();
    });
  }
  function hideFmtBar() {
    const bar = document.getElementById('nkFmtBar');
    if (bar) bar.style.display = 'none';
  }

  const HELP_TEXT = 'Create and update pages and notes';

  async function openPage(pageId, _pages) {
    const content = document.getElementById('pageContent');
    if (!content) return;
    const api = window.electronAPI;
    const pages = _pages || (await api.notekitListPages(NK.activeProjectId)) || [];
    const page = pages.find(p => p.id === pageId);
    if (!page) return;
    NK.activePageId = pageId;
    NK.blocks = (await api.notekitListBlocks(pageId)) || [];
    NK.dirty = false;

    // Keep nav active state in sync with the router.
    if (window.activePage !== 'notekit' && typeof window.navigateTo === 'function') {
      try { window.navigateTo('notekit'); } catch { /* ignore */ }
    }
    document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === 'notekit'));

    const proj = NK.projects.find(p => p.id === NK.activeProjectId);
    setTopbar(proj ? proj.name : 'NoteKit', HELP_TEXT);

    content.innerHTML = `
      ${tabsToHtml(pages)}
      <div class="nk-page-view">
        <div class="nk-blocks" id="nkBlocks"></div>
        <div class="nk-add-block" id="nkAddBlock">+ Add a block</div>
      </div>
      <div class="nk-fmt-bar" id="nkFmtBar" style="display:none">
        <button type="button" data-fmt="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" data-fmt="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button type="button" data-fmt="code" title="Inline code (Ctrl+E)"><code>&lt;/&gt;</code></button>
        <button type="button" data-fmt="link" title="Link (Ctrl+K)">🔗</button>
      </div>`;
    wireTabMoreButtons();
    wireFmtBar();

    const blocksEl = document.getElementById('nkBlocks');
    const addBtn = document.getElementById('nkAddBlock');
    renderBlocks();
    blocksEl.addEventListener('input', onBlocksInput);
    blocksEl.addEventListener('keydown', onBlocksKeydown);
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const rect = addBtn.getBoundingClientRect();
      openBlockPicker(rect.left, rect.bottom + 4, (type) => addBlockAt(NK.blocks.length, type));
    });
    document.addEventListener('keydown', onPageKeydown);
    scheduleSave();
  }

  async function renderProjectEmpty(projectId) {
    const content = document.getElementById('pageContent');
    if (!content) return;
    const api = window.electronAPI;
    const pages = (await api.notekitListPages(projectId)) || [];
    if (pages.length > 0) { await openPage(pages[0].id, pages); return; }
    const project = NK.projects.find(p => p.id === projectId);
    setTopbar(project ? project.name : 'NoteKit', HELP_TEXT);
    content.innerHTML = `
      ${tabsToHtml([])}
      <div class="nk-empty">
        <svg class="ti ti-notes" style="font-size:2.5rem;color:var(--text-muted)"><use href="img/tabler-sprite.min.svg#tabler-notes"/></svg>
        <p>This project has no pages yet.</p>
        <button class="nk-btn nk-btn-primary nk-empty-add" data-action="add-page" data-project="${esc(projectId)}" style="margin-top:14px">+ Add page</button>
      </div>`;
    wireTabMoreButtons();
  }

  function setTopbar(title, subtitle) {
    const t = document.getElementById('topbarTitle');
    const s = document.getElementById('topbarSubtitle');
    const icon = document.getElementById('topbarIcon');
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;
    if (icon) icon.innerHTML = '<svg class="ti ti-notes" style="font-size:1.1rem"><use href="img/tabler-sprite.min.svg#tabler-notes"/></svg>';
  }

  function showEmpty() {
    const content = document.getElementById('pageContent');
    if (!content) return;
    setTopbar('NoteKit', '');
    content.innerHTML = `<div class="nk-empty">
      <svg class="ti ti-notes" style="font-size:2.5rem;color:var(--text-muted)"><use href="img/tabler-sprite.min.svg#tabler-notes"/></svg>
      <p>Select a project from the sidebar, or create one to get started.</p>
    </div>`;
  }

  // ── Block rendering ─────────────────────────────────────────────────
  function renderBlocks() {
    const el = document.getElementById('nkBlocks');
    if (!el) return;
    if (NK.blocks.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = NK.blocks.map((b, i) => blockToHtml(b, i)).join('');
  }

  function blockToHtml(b, i) {
    const base = `data-id="${b.id}" data-idx="${i}"`;
    const remove = `<span class="nk-block-del" data-action="del-block" title="Delete block">✕</span>`;
    switch (b.type) {
      case 'heading':
        return `<div class="nk-block nk-block-heading" ${base}>${remove}<input class="nk-h" data-h="1" value="${esc(b.content)}" placeholder="Heading"/></div>`;
      case 'heading2':
        return `<div class="nk-block nk-block-heading2" ${base}>${remove}<input class="nk-h" data-h="2" value="${esc(b.content)}" placeholder="Heading 2"/></div>`;
      case 'heading3':
        return `<div class="nk-block nk-block-heading3" ${base}>${remove}<input class="nk-h" data-h="3" value="${esc(b.content)}" placeholder="Heading 3"/></div>`;
      case 'checklist': {
        const items = parseList(b.content);
        return `<div class="nk-block nk-block-checklist" ${base}>${remove}
          ${items.map((it, k) => `
            <div class="nk-check-item">
              <input type="checkbox" class="nk-check-box" ${it.done ? 'checked' : ''} data-k="${k}"/>
              <input type="text" class="nk-check-text" value="${esc(it.text)}" data-k="${k}" placeholder="To-do item"/>
            </div>`).join('')}
          <button class="nk-add-item" data-action="add-item">+ item</button>
        </div>`;
      }
      case 'bullet':
      case 'numbered': {
        const items = parseList(b.content);
        const tag = b.type === 'numbered' ? 'ol' : 'ul';
        return `<div class="nk-block nk-block-list" ${base}>${remove}
          <${tag}>${items.map((it, k) => `
            <li><input type="text" class="nk-list-text" value="${esc(it.text)}" data-k="${k}" placeholder="List item"/></li>`).join('')}</${tag}>
          <button class="nk-add-item" data-action="add-item">+ item</button>
        </div>`;
      }
      default:
        return `<div class="nk-block nk-block-text" ${base}>${remove}<div class="nk-text" contenteditable="true">${sanitizeRich(b.content)}</div></div>`;
    }
  }

  // Whitelist sanitizer for rich text: keeps bold/italic/underline/inline code/links/line-breaks.
  const RICH_ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'CODE', 'A', 'BR']);
  function sanitizeRich(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<div id="nk-rich">${html}</div>`, 'text/html');
    const root = doc.getElementById('nk-rich');
    if (!root) return '';
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 1) {
          const tag = child.tagName.toUpperCase();
          if (RICH_ALLOWED.has(tag)) {
            if (tag === 'A') {
              const href = child.getAttribute('href') || '';
              if (!/^(https?:\/\/|mailto:)/i.test(href)) {
                child.removeAttribute('href');
              } else {
                child.setAttribute('target', '_blank');
                child.setAttribute('rel', 'noopener noreferrer');
              }
            }
            // strip all other attributes (keep href only for <a>)
            [...child.attributes].forEach((a) => {
              if (!(tag === 'A' && a.name === 'href')) child.removeAttribute(a.name);
            });
            walk(child);
          } else {
            // unwrap disallowed element, keep its text children
            const parent = child.parentNode;
            while (child.firstChild) parent.insertBefore(child.firstChild, child);
            parent.removeChild(child);
          }
        }
      });
    };
    walk(root);
    return root.innerHTML;
  }

  function parseList(content) {
    try {
      const arr = JSON.parse(content || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  // ── Block interactions ──────────────────────────────────────────────
  function onBlocksInput(e) {
    const t = e.target;
    const blockEl = t.closest('.nk-block');
    if (!blockEl) return;
    const idx = parseInt(blockEl.dataset.idx, 10);
    const b = NK.blocks[idx];
    if (!b) return;
    if (t.classList.contains('nk-text')) {
      b.content = sanitizeRich(t.innerHTML);
    } else if (t.classList.contains('nk-h')) {
      b.content = t.value;
    } else if (t.classList.contains('nk-list-text') || t.classList.contains('nk-check-text')) {
      const items = parseList(b.content);
      const k = parseInt(t.dataset.k, 10);
      items[k] = { ...items[k], text: t.value };
      b.content = JSON.stringify(items);
    } else if (t.classList.contains('nk-check-box')) {
      const items = parseList(b.content);
      const k = parseInt(t.dataset.k, 10);
      items[k] = { ...items[k], done: t.checked };
      b.content = JSON.stringify(items);
    }
    NK.dirty = true;
    scheduleSave();
  }

  function onBlocksKeydown(e) {
    const t = e.target;
    const blockEl = t.closest('.nk-block');
    if (!blockEl) return;
    const idx = parseInt(blockEl.dataset.idx, 10);
    const b = NK.blocks[idx];
    const inText = t.classList.contains('nk-text');
    // Rich-text shortcuts (only inside a text block)
    if (inText && (e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); document.execCommand('bold'); syncRichInput(t); return; }
      if (k === 'i') { e.preventDefault(); document.execCommand('italic'); syncRichInput(t); return; }
      if (k === 'e') { e.preventDefault(); wrapInlineCode(); return; }
      if (k === 'k') { e.preventDefault(); promptLink(); return; }
    }
    // Enter on a text block → split at cursor or new block below (not when Ctrl/Cmd held — that's handled below)
    if (inText && e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if ((t.textContent || '').trim() === '') {
        addBlockAt(idx + 1);
      } else {
        b_content_split(idx);
      }
    }
    // Backspace on empty text block → remove it
    if (inText && e.key === 'Backspace' && (t.textContent || '').trim() === '') {
      e.preventDefault();
      removeBlock(idx);
    }
    // "/" menu shortcut → block type picker at caret
    if (inText && e.key === '/' && !e.shiftKey) {
      e.preventDefault();
      const sel = window.getSelection();
      let x = t.getBoundingClientRect().left, y = t.getBoundingClientRect().top;
      try {
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0).getBoundingClientRect();
          if (r && (r.width || r.height)) { x = r.left; y = r.bottom; }
        }
      } catch { /* fall back to block position */ }
      openBlockPicker(x, y + 4, (type) => setBlockType(idx, type));
    }
    // Ctrl/Cmd+Enter on any block input → new block below
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addBlockAt(idx + 1);
    }
    void b;
  }

  // Persist rich text after execCommand edits (they don't fire input reliably).
  function syncRichInput(t) {
    if (t && t.isConnected) t.dispatchEvent(new Event('input', { bubbles: true }));
    hideFmtBar();
  }

  // Wrap the current selection in <code> (with text-based fallback).
  function wrapInlineCode() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    const t = sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    try {
      const code = document.createElement('code');
      code.textContent = text;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(code);
      range.selectNodeContents(code);
      sel.removeAllRanges(); sel.addRange(range);
    } catch {
      document.execCommand('insertHTML', false, '<code>' + esc(text) + '</code>');
    }
    syncRichInput(t);
  }

  // Link the current selection (prompt for URL, restore selection afterwards).
  function promptLink() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const savedRange = sel.getRangeAt(0).cloneRange();
    const savedEl = sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    nkPrompt('Link URL', 'https://').then((url) => {
      if (!url || !url.trim()) return;
      const el = savedEl && savedEl.isConnected ? savedEl : null;
      if (!el) return;
      el.focus();
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(savedRange);
      const href = /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : 'https://' + url.trim();
      document.execCommand('createLink', false, href);
      syncRichInput(el);
    });
  }

  function b_content_split(idx) {
    const b = NK.blocks[idx];
    const el = document.querySelector(`.nk-block[data-idx="${idx}"] .nk-text`);
    if (!el) return;
    const sel = window.getSelection();
    let before = b.content, after = '';
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const pre = document.createRange();
      pre.setStart(el, 0);
      pre.setEnd(range.startContainer, range.startOffset);
      const post = document.createRange();
      post.setStart(range.startContainer, range.startOffset);
      post.setEnd(el, el.childNodes.length);
      const tmp = document.createElement('div');
      tmp.appendChild(pre.cloneContents());
      before = sanitizeRich(tmp.innerHTML);
      tmp.innerHTML = '';
      tmp.appendChild(post.cloneContents());
      after = sanitizeRich(tmp.innerHTML);
    }
    b.content = before;
    const nb = { id: uid(), type: 'text', content: after };
    NK.blocks.splice(idx + 1, 0, nb);
    renderBlocks();
    scheduleSave();
    focusBlock(idx + 1);
  }

  function setBlockType(idx, type) {
    const b = NK.blocks[idx];
    const prev = b.content;
    b.type = type;
    if (type === 'checklist' || type === 'bullet' || type === 'numbered') {
      b.content = JSON.stringify(prev ? [{ text: prev, done: false }] : [{ text: '', done: false }]);
    }
    renderBlocks();
    scheduleSave();
    focusBlock(idx);
  }

  function normalizeType(t) {
    const s = t.toLowerCase().trim();
    if (s.startsWith('h1') || s === 'heading' || s === 'heading1') return 'heading';
    if (s.startsWith('h2') || s === 'heading2') return 'heading2';
    if (s.startsWith('h3') || s === 'heading3') return 'heading3';
    if (s.startsWith('check')) return 'checklist';
    if (s.startsWith('bullet') || s.startsWith('ul')) return 'bullet';
    if (s.startsWith('num') || s.startsWith('ol')) return 'numbered';
    return 'text';
  }

  function addBlockAt(idx, type = 'text') {
    const nb = { id: uid(), type, content: type === 'checklist' ? JSON.stringify([{ text: '', done: false }]) : (type === 'bullet' || type === 'numbered' ? JSON.stringify([{ text: '' }]) : '') };
    NK.blocks.splice(idx, 0, nb);
    renderBlocks();
    scheduleSave();
    focusBlock(idx);
  }

  // Block type picker (Tier 1): reuse the app's CtxMenu with our block options.
  const BLOCK_PICKER_ITEMS = [
    { label: 'Text', icon: '<svg class="ti ti-text-size" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-text-size"/></svg>', action: null },
    { label: 'Heading 1', icon: '<svg class="ti ti-h-1" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-h-1"/></svg>', action: null },
    { label: 'Heading 2', icon: '<svg class="ti ti-h-2" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-h-2"/></svg>', action: null },
    { label: 'Heading 3', icon: '<svg class="ti ti-h-3" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-h-3"/></svg>', action: null },
    { label: 'Bulleted list', icon: '<svg class="ti ti-list" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-list"/></svg>', action: null },
    { label: 'Numbered list', icon: '<svg class="ti ti-list-numbers" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-list-numbers"/></svg>', action: null },
    { label: 'Checklist', icon: '<svg class="ti ti-checkbox" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-checkbox"/></svg>', action: null },
  ];
  const BLOCK_PICKER_TYPES = ['text', 'heading', 'heading2', 'heading3', 'bullet', 'numbered', 'checklist'];
  function openBlockPicker(x, y, onPick) {
    const items = BLOCK_PICKER_ITEMS.map((it, i) => ({ ...it, action: () => onPick(BLOCK_PICKER_TYPES[i]) }));
    if (window.CtxMenu && typeof window.CtxMenu.show === 'function') {
      window.CtxMenu.show(x, y, items);
    } else {
      // Fallback: simple text prompt (older context without CtxMenu).
      nkPrompt('Block type: text, h1, h2, h3, bullet, numbered, checklist').then((type) => {
        if (type && type.trim()) onPick(normalizeType(type));
      });
    }
  }

  function removeBlock(idx) {
    if (idx < 0 || idx >= NK.blocks.length) return;
    NK.blocks.splice(idx, 1);
    renderBlocks();
    scheduleSave();
  }

  function focusBlock(idx) {
    const el = document.querySelector(`.nk-block[data-idx="${idx}"] input, .nk-block[data-idx="${idx}"] .nk-text`);
    if (el) { el.focus(); if (el.classList.contains('nk-text')) { const r = document.createRange(); const sel = window.getSelection(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); } }
  }

  function onPageKeydown(e) {
    // Cmd/Ctrl+N → new page in current project (only when NoteKit page active)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
      const content = document.getElementById('pageContent');
      if (content && content.querySelector('.nk-page-view') && NK.activeProjectId) {
        e.preventDefault();
        promptAddPage(NK.activeProjectId);
      }
    }
  }

  // Delegate for block delete / add-item buttons (static listeners on blocksEl)
  document.addEventListener('click', (e) => {
    const del = e.target.closest('[data-action="del-block"]');
    if (del) {
      const blockEl = del.closest('.nk-block');
      if (blockEl) removeBlock(parseInt(blockEl.dataset.idx, 10));
      return;
    }
    const addItem = e.target.closest('[data-action="add-item"]');
    if (addItem) {
      const blockEl = addItem.closest('.nk-block');
      if (!blockEl) return;
      const idx = parseInt(blockEl.dataset.idx, 10);
      const b = NK.blocks[idx];
      if (!b) return;
      const items = parseList(b.content);
      items.push(b.type === 'checklist' ? { text: '', done: false } : { text: '' });
      b.content = JSON.stringify(items);
      renderBlocks();
      scheduleSave();
      const inputs = blockEl.querySelectorAll('input[type="text"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  });

  // ── Autosave ────────────────────────────────────────────────────────
  function scheduleSave() {
    NK.dirty = true;
    const state = document.getElementById('nkSaveState');
    if (state) state.textContent = 'Saving…';
    clearTimeout(NK.saveTimer);
    NK.saveTimer = setTimeout(saveNow, 500);
  }

  async function saveNow() {
    if (!NK.dirty || !NK.activePageId) return;
    NK.dirty = false;
    try {
      await window.electronAPI.notekitSaveBlocks(NK.activePageId, NK.blocks);
      const state = document.getElementById('nkSaveState');
      if (state) { state.textContent = 'Saved ✓'; setTimeout(() => { if (state) state.textContent = ''; }, 1500); }
    } catch {
      const state = document.getElementById('nkSaveState');
      if (state) state.textContent = 'Save failed';
      NK.dirty = true;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid() {
    return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'nk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // Expose for app.js page router
  window.NoteKit = {
    init,
    showEmpty,
    isEnabled: () => NK.enabled,
    openPage,
    clearSelection: () => {
      // Called by the router when navigating to a non-Notekit page, so the
      // last-selected project no longer stays highlighted in the sidebar.
      if (!NK.enabled) return;
      NK.activeProjectId = null;
      NK.activePageId = null;
      const wrap = document.getElementById('notekitNavWrap');
      if (wrap) wrap.querySelectorAll('.nk-project-row').forEach(r => r.classList.remove('active'));
    },
  };

  // Auto-init after DOM ready (app.js loads after DOM).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }
})();
