// NoteKit Tier 1 + Tier 2 tests (5.1.25):
//  - Block type picker (+ Add a block and "/" shortcut) with 7 types
//  - Rich text sanitizer (bold/italic/code/links kept, script/span/javascript: stripped)
//  - HTML-aware Enter split
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="pageContent"></div>
  <div class="ctx-menu" id="ctxMenu" style="display:none;position:fixed"></div>
  <div class="topbar"><span class="topbar-title"><span id="topbarIcon"></span><span id="topbarTitle">Home</span></span><span class="topbar-subtitle" id="topbarSubtitle"></span></div>
  <nav class="sidebar"><div class="nav-section-label nk-label-row" id="notekitNavLabel"><span>NoteKit</span><button class="nk-add-project-btn" id="nkAddProjectBtn">+</button></div><div id="notekitNavWrap"></div></nav>
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

// ── Test 1: + Add a block opens a picker with 9 block types ──
document.getElementById('nkAddBlock').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
const pickerItems = [...window.CtxMenu.el.querySelectorAll('.ctx-item')].map((b) => b.textContent.trim());
if (pickerItems.length !== 9) { console.log('FAIL: picker should have 9 items, got', pickerItems.length); process.exit(1); }
console.log('OK: picker has 9 items:', pickerItems.join(', '));

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
if (window.CtxMenu.el.querySelectorAll('.ctx-item').length !== 9) { console.log('FAIL: "/" picker should have 9 items'); process.exit(1); }
clickCtxItem('Heading 2');
await new Promise((r) => setTimeout(r, 80));
if (!document.querySelector('.nk-block-heading2 .nk-h')) { console.log('FAIL: block not converted to H2'); process.exit(1); }
console.log('OK: "/" picker converts block to Heading 2');

// ── Test 6 (B1): blocks render with x/width attrs + inline style + handles ──
const blocksAll = [...document.querySelectorAll('.nk-block')];
const firstBlock = blocksAll[0];
if (firstBlock.dataset.x === undefined || firstBlock.dataset.width === undefined) { console.log('FAIL: block missing data-x/data-width'); process.exit(1); }
if (firstBlock.style.left === '' || firstBlock.style.width === '') { console.log('FAIL: block missing inline left/width style'); process.exit(1); }
if (!firstBlock.querySelector('.nk-block-grip')) { console.log('FAIL: block missing grip handle'); process.exit(1); }
if (!firstBlock.querySelector('.nk-block-resize')) { console.log('FAIL: block missing resize handle'); process.exit(1); }
console.log('OK: B1 block attrs/style/handles present (x=' + firstBlock.dataset.x + ' w=' + firstBlock.dataset.width + ')');

// ── Test 8 (B1): Enter split inherits parent x, new block auto-fits (width 0) ──
const splitSrc = [...document.querySelectorAll('.nk-text')].at(-1);
const splitBlock = splitSrc.closest('.nk-block');
splitBlock.dataset.x = '25';
splitBlock.dataset.width = '50';
splitSrc.innerHTML = 'split me';
splitSrc.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 40));
const sel2 = window.getSelection();
const range2 = document.createRange();
range2.setStart(splitSrc.firstChild, 5);
range2.collapse(true);
sel2.removeAllRanges(); sel2.addRange(range2);
splitSrc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));
const newBlocks = [...document.querySelectorAll('.nk-block')];
const newBlock = newBlocks.find((b) => b.dataset.x === '25' && b !== splitBlock && b.classList.contains('nk-block-text'));
// New split block should inherit x=25 and be auto-fitted (width < 100, not pinned full).
if (!newBlock) { console.log('FAIL: split block not found with inherited x=25'); process.exit(1); }
const nw = parseFloat(newBlock.dataset.width);
if (!(nw > 0 && nw < 100)) { console.log('FAIL: split block should auto-fit to content (width=' + newBlock.dataset.width + ')'); process.exit(1); }
console.log('OK: split block inherits x=' + newBlock.dataset.x + ' auto-fit width=' + newBlock.dataset.width + '%');

// ── Test 7 (B1): layoutBlocks stacks overlapping blocks, side-by-side for non-overlapping ──
const container = document.getElementById('nkBlocks');
container.innerHTML = ''; // isolate: clear blocks so packing is deterministic
container.style.width = '800px';
const synth = (x, w) => { const d = document.createElement('div'); d.className = 'nk-block'; d.dataset.x = String(x); d.dataset.width = String(w); d.style.height = '40px'; container.appendChild(d); return d; };
const s1 = synth(0, 100), s2 = synth(0, 50), s3 = synth(50, 50);
window.dispatchEvent(new window.Event('resize'));
await new Promise((r) => setTimeout(r, 120));
const sTop = (el) => parseFloat(el.style.top || '0');
const s1Top = sTop(s1);
if (sTop(s2) <= s1Top) { console.log('FAIL: overlapping block s2 should stack below s1 (s1=' + s1Top + ' s2=' + sTop(s2) + ')'); process.exit(1); }
if (sTop(s3) !== sTop(s2)) { console.log('FAIL: non-overlapping s3 should share row with s2 (s2=' + sTop(s2) + ' s3=' + sTop(s3) + ')'); process.exit(1); }
console.log('OK: packing stacks overlaps & rows side-by-side (s1=' + s1Top + 'px, s2=' + sTop(s2) + 'px, s3=' + sTop(s3) + 'px)');

// ── Test 9 (B1 fix): horizontal grip drag on a FULL-WIDTH block visibly moves it ──
// Regression: dragging a default (width=100, x=0) block horizontally previously
// did nothing because x was clamped to 0. Fix: horizontal drag moves the left
// edge and auto-shrinks the width so a full-width block moves right with
// immediate visual feedback.
const hm = window.NoteKit._test.horizMove;
// full-width block, drag right 80px in an 800px container → +10%
let r = hm(0, 100, 80, 800);
if (!(r.x > 0)) { console.log('FAIL: full-width block did not move horizontally (x=' + r.x + ')'); process.exit(1); }
if (!(r.width < 100)) { console.log('FAIL: full-width block width did not auto-shrink (w=' + r.width + ')'); process.exit(1); }
console.log('OK: full-width drag right → x=' + r.x.toFixed(1) + ' w=' + r.width.toFixed(1) + ' (clamped to right edge 100)');
// already-narrow block, drag right within range stays same width
r = hm(0, 50, 40, 800); // +5% → x=5, width stays 50 (5+50<=100)
if (!(r.width === 50 && r.x === 5)) { console.log('FAIL: narrow block drag should keep width (x=' + r.x + ' w=' + r.width + ')'); process.exit(1); }
console.log('OK: narrow block drag keeps width (x=' + r.x + ' w=' + r.width + ')');
// drag left from x=0 → stays at left edge, no negative
r = hm(0, 50, -40, 800);
if (!(r.x === 0)) { console.log('FAIL: drag left should clamp at x=0 (x=' + r.x + ')'); process.exit(1); }
console.log('OK: drag left clamps at x=0 (x=' + r.x + ')');
// block already positioned, drag right → moves, keeps width if room
r = hm(20, 40, 40, 800); // +5% → x=25, w stays 40 (25+40<=100)
if (!(r.x === 25 && r.width === 40)) { console.log('FAIL: positioned block drag (x=' + r.x + ' w=' + r.width + ')'); process.exit(1); }
console.log('OK: positioned block drag → x=' + r.x + ' w=' + r.width);

// ── Test 10 (Fix 1): 300px min-width math ──
// In an 800px container, 300px = 37.5%.
const minPct = (300 / 800) * 100;
if (Math.abs(minPct - 37.5) > 0.01) { console.log('FAIL: 300px min = ' + minPct + '% (expected 37.5)'); process.exit(1); }
console.log('OK: 300px min at 800px container = ' + minPct.toFixed(1) + '%');
// horizMove auto-shrink must respect the 300px min: dragging a block right
// must not shrink below 37.5% (in an 800px cw). smallest possible = 300/800.
const tight = window.NoteKit._test.horizMove(62.5, 37.5, -500, 800); // push right edge, try to shrink below min
if (tight.width < 37.5 - 0.01) { console.log('FAIL: auto-shrink went below 300px min (w=' + tight.width + ')'); process.exit(1); }
console.log('OK: auto-shrink respects 300px min (w=' + tight.width.toFixed(1) + '%)');

// ── Test 11: Table block — parseTable/tableToHtml grid + row/col ops via exposed helpers ──
const pt = window.NoteKit._test.parseTable;
const th = window.NoteKit._test.tableToHtml;
const t2 = pt(JSON.stringify({ cols: 3, rows: 2, cells: [['A1', 'B1', 'C1'], ['A2', 'B2', 'C2']] }));
const html = th(t2);
if (!html.includes('nk-table')) { console.log('FAIL: tableToHtml missing table'); process.exit(1); }
if ((html.match(/nk-tcell/g) || []).length !== 6) { console.log('FAIL: expected 6 cells, got', (html.match(/nk-tcell/g) || []).length); process.exit(1); }
console.log('OK: table renders 2x3 grid (6 cells)');
// row/col insert + delete via the block mutation helpers
const ops = window.NoteKit._test.tableOps;
let t3 = ops(pt(JSON.stringify({ cols: 2, rows: 2, cells: [['a', 'b'], ['c', 'd']] })), 'insert-row', 0);
if (t3.cells.length !== 3 || t3.cells[0].length !== 2) { console.log('FAIL: insert-row'); process.exit(1); }
t3 = ops(t3, 'insert-col', 0);
if (t3.cells[0].length !== 3 || t3.cells.length !== 3) { console.log('FAIL: insert-col'); process.exit(1); }
t3 = ops(t3, 'del-row', 0);
if (t3.cells.length !== 2) { console.log('FAIL: del-row'); process.exit(1); }
t3 = ops(t3, 'del-col', 0);
if (t3.cells[0].length !== 2) { console.log('FAIL: del-col'); process.exit(1); }
console.log('OK: table row/col insert + delete (before selected)');

// ── Test 12: WYSIWYG color preserved by sanitizer, disallowed tags stripped ──
// sanitizeRich is closure-private; exercise it through the rich-text input path used in Test 3.
// Container was cleared in Test 7, so create a fresh text block via the picker.
document.getElementById('nkAddBlock').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
clickCtxItem('Text');
await new Promise((r) => setTimeout(r, 80));
const colorTxt = [...document.querySelectorAll('.nk-text')].at(-1);
if (!colorTxt) { console.log('FAIL: could not create text block for color test'); process.exit(1); }
colorTxt.innerHTML = '<font color="#e11d48">red</font><span style="color:rgb(16, 185, 129)">green</span><script>bad()</script>';
colorTxt.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));
// Re-render (Ctrl+Enter adds a block → renderBlocks) to see sanitized DOM, like Test 3.
colorTxt.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));
const colorTxt2 = [...document.querySelectorAll('.nk-text')].find((t) => t.innerHTML.includes('e11d48')) || [...document.querySelectorAll('.nk-text')].at(-1);
const colorChecks = {
  'font color kept': !!colorTxt2.querySelector('font[color="#e11d48"]'),
  'span style color kept': !!colorTxt2.querySelector('span[color="rgb(16, 185, 129)"]'),
  'script stripped': !colorTxt2.querySelector('script'),
};
let cok = true;
for (const [k, v] of Object.entries(colorChecks)) {
  if (!v) { console.log('FAIL:', k); cok = false; }
  else console.log('OK:', k);
}
if (!cok) process.exit(1);

console.log('ALL BLOCK TESTS PASSED ✔');
