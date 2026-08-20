// NoteKit Tier 1 + Tier 2 tests (5.1.25):
//  - Block type picker (+ Add a block and "/" shortcut) with 7 types
//  - Rich text sanitizer (bold/italic/code/links kept, script/span/javascript: stripped)
//  - HTML-aware Enter split
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="pageContent"></div>
  <div class="ctx-menu" id="ctxMenu" style="display:none;position:fixed"></div>
  <div class="topbar"><span class="topbar-title"><span id="topbarIcon"></span><span id="topbarTitle">Home</span></span><span class="topbar-subtitle" id="topbarSubtitle"></span></div>
  <nav class="sidebar"><div class="nav-section-label nk-label-row" id="notekitNavLabel"><span>NOTEKIT</span><button class="nk-add-project-btn" id="nkAddProjectBtn">+</button></div><div id="notekitNavWrap"></div></nav>
</body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true });

const { window } = dom;
const { document } = window;

// Canonical app CtxMenu (renders items, hides on click)
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
  },
  hide() { this.el.style.display = 'none'; },
};
document.addEventListener('click', () => window.CtxMenu.hide());

window.electronAPI = {
  notekitEnabled: async () => true,
  notekitListProjects: async () => [{ id: 'p1', name: 'Work', icon: 'rocket' }],
  notekitListPages: async () => [{ id: 'pg1', title: 'Page 1' }],
  notekitListBlocks: async () => [],
  notekitSaveBlocks: async () => ({}),
  notekitCreateProject: async () => ({ ok: true, id: 'p3' }),
  notekitRenameProject: async () => ({}),
  notekitSetProjectIcon: async () => ({}),
  notekitDeleteProject: async () => ({}),
  notekitCreatePage: async () => ({ ok: true, id: 'pg3' }),
  notekitRenamePage: async () => ({}),
  notekitDeletePage: async () => ({}),
};

const fs = await import('fs');
window.eval(fs.readFileSync(new URL('../js/notekit.js', import.meta.url), 'utf8'));

await window.NoteKit.init();
await new Promise((r) => setTimeout(r, 50));
document.querySelector('.nk-project-row').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 120));

const clickCtxItem = (label) => {
  const btn = [...window.CtxMenu.el.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes(label));
  if (!btn) { console.log('FAIL: menu item not found:', label); process.exit(1); }
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

// ── Test 1: + Add a block opens a picker with 7 block types ──
document.getElementById('nkAddBlock').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
const pickerItems = [...window.CtxMenu.el.querySelectorAll('.ctx-item')].map((b) => b.textContent.trim());
if (pickerItems.length !== 7) { console.log('FAIL: picker should have 7 items, got', pickerItems.length); process.exit(1); }
console.log('OK: picker has 7 items:', pickerItems.join(', '));

// ── Test 2: pick Checklist → checklist block created ──
clickCtxItem('Checklist');
await new Promise((r) => setTimeout(r, 80));
if (!document.querySelector('.nk-block-checklist')) { console.log('FAIL: checklist block not created'); process.exit(1); }
console.log('OK: checklist block created');

// ── Test 3: rich text sanitizer via input + re-render ──
document.getElementById('nkAddBlock').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
clickCtxItem('Text');
await new Promise((r) => setTimeout(r, 80));
const txt = document.querySelector('.nk-text');
txt.innerHTML = '<b>bold</b><script>alert(1)</script><span onclick="x">spanned</span><a href="javascript:evil">bad</a> <a href="https://ok.com">good</a>';
txt.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));
// trigger a re-render (Ctrl+Enter adds a block below)
txt.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));
const firstText = document.querySelector('.nk-text');
const checks = {
  'script removed': !firstText.querySelector('script'),
  'span unwrapped': !firstText.querySelector('span'),
  'javascript: link stripped': !firstText.querySelector('a[href^="javascript"]'),
  'bold kept': !!firstText.querySelector('b'),
  'https link kept': !!firstText.querySelector('a[href="https://ok.com"]'),
};
let ok = true;
for (const [k, v] of Object.entries(checks)) {
  if (!v) { console.log('FAIL:', k); ok = false; }
  else console.log('OK:', k);
}
if (!ok) process.exit(1);

// ── Test 4: HTML-aware Enter split ──
const blocksBefore = document.querySelectorAll('.nk-block').length;
const txt2 = [...document.querySelectorAll('.nk-text')].at(-1);
txt2.innerHTML = 'Hello <b>bold</b> world';
txt2.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 40));
const textNode = txt2.firstChild; // "Hello "
const sel = window.getSelection();
const range = document.createRange();
range.setStart(textNode, 6);
range.collapse(true);
sel.removeAllRanges(); sel.addRange(range);
txt2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));
const texts = [...document.querySelectorAll('.nk-text')];
const splitOk = texts.length >= 2 && texts[texts.length - 2].innerHTML.includes('Hello') && texts[texts.length - 1].innerHTML.includes('bold');
console.log(splitOk ? 'OK: HTML-aware split (before="' + texts[texts.length - 2].innerHTML + '" after="' + texts[texts.length - 1].innerHTML + '")' : 'FAIL: split');
if (!splitOk) process.exit(1);

// ── Test 5: "/" opens the picker and converts block type ──
const lastText = texts[texts.length - 1];
lastText.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
if (window.CtxMenu.el.querySelectorAll('.ctx-item').length !== 7) { console.log('FAIL: "/" picker should have 7 items'); process.exit(1); }
clickCtxItem('Heading 2');
await new Promise((r) => setTimeout(r, 80));
if (!document.querySelector('.nk-block-heading2 .nk-h')) { console.log('FAIL: block not converted to H2'); process.exit(1); }
console.log('OK: "/" picker converts block to Heading 2');

console.log('ALL BLOCK TESTS PASSED ✔');
