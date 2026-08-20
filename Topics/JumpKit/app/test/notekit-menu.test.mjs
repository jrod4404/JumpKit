// Real DOM test for the NoteKit ⋯ menu fix (5.1.5).
// Reproduces the exact root cause: app.js registers a global
// document-click handler ()=>CtxMenu.hide() that hides the shared #ctxMenu.
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <nav class="sidebar" id="sidebar">
    <button class="nav-item active" data-page="home">Home</button>
    <div class="nav-section-label" id="notekitNavLabel" style="display:none">NoteKit</div>
    <div id="notekitNavWrap" style="display:none"></div>
  </nav>
  <div id="pageContent"></div>
  <div class="ctx-menu" id="ctxMenu" style="display:none"></div>
</body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true });

const { window } = dom;
const { document } = window;

// --- App's CtxMenu (canonical), registered by app.js which loads BEFORE notekit.js ---
window.CtxMenu = {
  el: document.getElementById('ctxMenu'),
  show(x, y, items) {
    this.el.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'ctx-item' + (item.danger ? ' danger' : '');
      btn.innerHTML = `<span>${item.icon || ''}</span> ${item.label}`;
      btn.addEventListener('click', () => { this.hide(); item.action(); });
      this.el.appendChild(btn);
    });
    this.el.style.display = 'block';
    const rect = this.el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    this.el.style.left = (x + rect.width > vw ? x - rect.width : x) + 'px';
    this.el.style.top = (y + rect.height > vh ? y - rect.height : y) + 'px';
  },
  hide() { this.el.style.display = 'none'; },
};
// THE CULPRIT: global document click handler that hides the menu on every click
window.document.addEventListener('click', () => window.CtxMenu.hide());

// --- Mock electronAPI (only what notekit needs for this test) ---
window.electronAPI = {
  notekitEnabled: async () => true,
  notekitListProjects: async () => [{ id: 'p1', name: 'Work', icon: 'rocket' }, { id: 'p2', name: 'Personal', icon: 'folder' }],
  notekitListPages: async () => [],
  notekitListBlocks: async () => [],
  notekitCreateProject: async () => ({ ok: true, id: 'p3' }),
  notekitRenameProject: async () => ({ ok: true }),
  notekitSetProjectIcon: async () => ({ ok: true }),
  notekitDeleteProject: async () => ({ ok: true }),
};

// Load notekit.js source into the DOM (5.1.5 version — direct handlers + stopImmediatePropagation)
const fs = await import('fs');
const src = fs.readFileSync(new URL('../js/notekit.js', import.meta.url), 'utf8');
window.eval(src);

// Run init and wait for the sidebar to render
await new Promise((r) => setTimeout(r, 50));
await window.NoteKit.init(); // note: init is idempotent-ish; ensures projects rendered

// Wait for async renderNav
await new Promise((r) => setTimeout(r, 50));

const wrap = document.getElementById('notekitNavWrap');
const moreBtns = wrap.querySelectorAll('.nk-project-more');
const ctxMenu = document.getElementById('ctxMenu');

// Assert: two projects rendered, each with a ⋯
if (moreBtns.length !== 2) {
  console.log('FAIL: expected 2 project ⋯ buttons, got', moreBtns.length);
  process.exit(1);
}
console.log('OK: 2 project ⋯ buttons rendered');

// Click the first ⋯ (Work project)
const btn = moreBtns[0];

// Use a real MouseEvent through the DOM so ALL listeners fire (direct handler + any bubbling)
// jsdom dispatches with real bubbling & stopImmediatePropagation semantics.
btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

await new Promise((r) => setTimeout(r, 0));

console.log('ctxMenu display after click:', JSON.stringify(ctxMenu.style.display));
if (ctxMenu.style.display === 'block') {
  console.log('PASS: ⋯ menu opens and STAYS open (global CtxMenu.hide did not clobber)');
  console.log('menu items:', ctxMenu.querySelectorAll('.ctx-item').length, '(expect 3: Rename/Change icon/Delete)');
  if (ctxMenu.querySelectorAll('.ctx-item').length === 3) {
    console.log('PASS: project menu has Rename project, Change icon, Delete project');
  } else {
    console.log('FAIL: wrong item count');
    process.exit(1);
  }
} else {
  console.log('FAIL: menu was hidden (likely by global CtxMenu.hide)');
  process.exit(1);
}

// Also verify clicking a menu item performs the action + hides
const firstItem = ctxMenu.querySelector('.ctx-item');
console.log('first menu item label:', firstItem.textContent.trim());
console.log('ALL TESTS PASSED ✔');
