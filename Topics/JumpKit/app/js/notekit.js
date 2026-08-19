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

    // Wire the nav item click (we render project tree inside #notekitNavWrap).
    document.addEventListener('click', onNavClick);
  }

  // ── Sidebar tree ────────────────────────────────────────────────────
  async function refreshProjects() {
    const api = window.electronAPI;
    NK.projects = (await api.notekitListProjects()) || [];
  }

  async function renderNav() {
    const wrap = document.getElementById('notekitNavWrap');
    if (!wrap) return;
    await refreshProjects();
    let html = '';
    for (const p of NK.projects) {
      const pages = (await window.electronAPI.notekitListPages(p.id)) || [];
      const open = NK.activeProjectId === p.id;
      html += `
        <div class="nk-project" data-project-id="${p.id}">
          <div class="nk-project-row ${open ? 'active' : ''}" data-action="toggle-project" data-id="${p.id}">
            <svg class="ti ti-folder nav-icon" style="font-size:1rem"><use href="img/tabler-sprite.min.svg#tabler-folder"/></svg>
            <span class="nk-project-name">${esc(p.name)}</span>
            <span class="nk-project-more" data-action="project-menu" data-id="${p.id}" title="Project options">⋯</span>
          </div>
          ${open ? `<div class="nk-pages">
            ${pages.map(pg => `
              <div class="nk-page-row ${NK.activePageId === pg.id ? 'active' : ''}" data-action="open-page" data-id="${pg.id}" data-project="${p.id}">
                <svg class="ti ti-file-text nav-icon" style="font-size:0.9rem"><use href="img/tabler-sprite.min.svg#tabler-file-text"/></svg>
                <span class="nk-page-name">${esc(pg.title)}</span>
              </div>`).join('')}
            <div class="nk-add-page" data-action="add-page" data-project="${p.id}">+ Add page</div>
          </div>` : ''}
        </div>`;
    }
    html += `<div class="nk-add-project" data-action="add-project">+ Add project</div>`;
    wrap.innerHTML = html;
  }

  function onNavClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    const projectId = el.dataset.project;
    if (action === 'toggle-project') {
      NK.activeProjectId = (NK.activeProjectId === id) ? null : id;
      if (NK.activeProjectId) NK.activePageId = null;
      renderNav();
    } else if (action === 'add-project') {
      promptAddProject();
    } else if (action === 'project-menu') {
      e.stopPropagation();
      showProjectMenu(el, id);
    } else if (action === 'add-page') {
      promptAddPage(projectId);
    } else if (action === 'open-page') {
      NK.activeProjectId = projectId;
      NK.activePageId = id;
      renderNav();
      openPage(id);
    }
  }

  // ── Project / page menus (rename / delete — soft delete) ───────────
  function showProjectMenu(anchorEl, id) {
    const menu = document.getElementById('ctxMenu');
    if (!menu) return;
    menu.innerHTML = '';
    menu.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.innerHTML = `
      <button class="ctx-item" data-nk-menu="rename-project" data-id="${id}">Rename project</button>
      <button class="ctx-item danger" data-nk-menu="delete-project" data-id="${id}">Delete project</button>`;
    menu.onclick = (e) => {
      const b = e.target.closest('[data-nk-menu]');
      if (!b) return;
      const i = b.dataset.id;
      if (b.dataset.nkMenu === 'rename-project') promptRenameProject(i);
      if (b.dataset.nkMenu === 'delete-project') confirmDeleteProject(i);
      menu.style.display = 'none';
    };
    const close = (ev) => { if (!menu.contains(ev.target) && !anchorEl.contains(ev.target)) { menu.style.display = 'none'; document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
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
      window.electronAPI.notekitCreateProject(name.trim() || 'Untitled').then(() => {
        NK.activeProjectId = null; renderNav();
      });
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

  // ── Page view (Notion-like blocks) ──────────────────────────────────
  async function openPage(pageId) {
    const content = document.getElementById('pageContent');
    if (!content) return;
    const api = window.electronAPI;
    const pages = (await api.notekitListPages(NK.activeProjectId)) || [];
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

    setTopbar('NoteKit — ' + page.title, 'Projects → Pages → Notes');

    content.innerHTML = `
      <div class="nk-page-view">
        <div class="nk-page-title-wrap">
          <input class="nk-page-title" id="nkPageTitle" value="${esc(page.title)}" placeholder="Untitled"/>
          <span class="nk-save-state" id="nkSaveState"></span>
        </div>
        <div class="nk-blocks" id="nkBlocks"></div>
        <div class="nk-add-block" id="nkAddBlock">+ Add a block</div>
      </div>`;

    const titleInput = document.getElementById('nkPageTitle');
    titleInput.addEventListener('input', debounce(() => {
      api.notekitRenamePage(pageId, titleInput.value.trim() || 'Untitled');
      renderNav();
    }, 600));

    const blocksEl = document.getElementById('nkBlocks');
    const addBtn = document.getElementById('nkAddBlock');
    renderBlocks();
    blocksEl.addEventListener('input', onBlocksInput);
    blocksEl.addEventListener('keydown', onBlocksKeydown);
    addBtn.addEventListener('click', () => addBlockAt(NK.blocks.length));
    document.addEventListener('keydown', onPageKeydown);
    scheduleSave();
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
    setTopbar('NoteKit', 'Projects → Pages → Notes');
    content.innerHTML = `<div class="nk-empty">
      <svg class="ti ti-notes" style="font-size:2.5rem;color:var(--text-muted)"><use href="img/tabler-sprite.min.svg#tabler-notes"/></svg>
      <p>Select a page from the sidebar, or create a project to get started.</p>
    </div>`;
  }

  // ── Block rendering ─────────────────────────────────────────────────
  function renderBlocks() {
    const el = document.getElementById('nkBlocks');
    if (!el) return;
    if (NK.blocks.length === 0) {
      el.innerHTML = `<div class="nk-blocks-empty">This page is empty. Click “+ Add a block” below.</div>`;
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
        return `<div class="nk-block nk-block-text" ${base}>${remove}<div class="nk-text" contenteditable="true" data-plain="true">${esc(b.content)}</div></div>`;
    }
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
      b.content = t.innerText;
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
    // Enter on a text block → split at cursor or new block below
    if (t.classList.contains('nk-text') && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const sel = window.getSelection();
      const offset = sel && sel.anchorNode ? sel.anchorOffset : t.innerText.length;
      if (t.innerText.trim() === '') {
        addBlockAt(idx + 1);
      } else {
        b_content_split(idx, offset);
      }
    }
    // Backspace on empty text block → remove it
    if (t.classList.contains('nk-text') && e.key === 'Backspace' && t.innerText.trim() === '') {
      e.preventDefault();
      removeBlock(idx);
    }
    // "/" menu shortcut → simple type picker (v1)
    if (t.classList.contains('nk-text') && e.key === '/' && !e.shiftKey) {
      e.preventDefault();
      nkPrompt('Block type: text, h1, h2, h3, checklist, bullet, numbered').then((type) => {
        if (type && type.trim()) {
          setBlockType(idx, normalizeType(type));
        }
      });
    }
    // Ctrl/Cmd+Enter on any block input → new block below
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addBlockAt(idx + 1);
    }
    void b;
  }

  function b_content_split(idx, offset) {
    const b = NK.blocks[idx];
    const before = b.content.slice(0, offset);
    const after = b.content.slice(offset);
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
  };

  // Auto-init after DOM ready (app.js loads after DOM).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }
})();
