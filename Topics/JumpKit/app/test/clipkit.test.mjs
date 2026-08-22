// ClipKit renderer tests:
//  - init shows the CLIPKIT sidebar section when enabled
//  - render() builds the Captures page with New Capture button + history cards
//  - New Capture calls clipkitCapture; clicking a card opens the full-size viewer; right-click shows the copy/delete menu
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="pageContent"></div>
  <nav class="sidebar">
    <div class="nav-section-label" id="clipkitNavLabel" style="display:none">ClipKit</div>
    <button class="nav-item" data-page="clipkit" id="clipkitNavBtn" style="display:none">Captures</button>
  </nav>
</body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true });

const { window } = dom;
const { document } = window;

const history = [
  { id: 'cap-1', path: 'C:\\Users\\j\\clipkit\\captures\\cap-1.png', width: 640, height: 400, ts: Date.now() - 10000 },
  { id: 'cap-2', path: '/Users/j/clipkit/captures/cap-2.png', width: 800, height: 600, ts: Date.now() },
];
const calls = { capture: 0, copy: [], delete: [] };
window.electronAPI = {
  clipkitEnabled: async () => true,
  clipkitHistory: async () => history,
  clipkitCapture: async () => { calls.capture++; return { id: 'cap-new', path: 'p.png', width: 10, height: 10, ts: Date.now() }; },
  clipkitCopy: async (id) => { calls.copy.push(id); return { ok: true }; },
  clipkitDelete: async (id) => { calls.delete.push(id); return { ok: true }; },
};

window.eval(fs.readFileSync('./js/clipkit.js', 'utf8'));

// init should reveal sidebar section
await new Promise((r) => setTimeout(r, 400));
const label = document.getElementById('clipkitNavLabel');
const btn = document.getElementById('clipkitNavBtn');
if (label.style.display !== 'block') { console.log('FAIL: CLIPKIT nav label not shown'); process.exit(1); }
if (btn.style.display !== 'flex') { console.log('FAIL: CLIPKIT nav button not shown (display=' + btn.style.display + ')'); process.exit(1); }
console.log('OK: init reveals CLIPKIT sidebar section');

// render builds the page
await window.ClipKit.render();
await new Promise((r) => setTimeout(r, 40));
const content = document.getElementById('pageContent');
if (!content.innerHTML.includes('New Capture')) { console.log('FAIL: New Capture button missing'); process.exit(1); }
const cards = content.querySelectorAll('.ck-card');
if (cards.length !== 2) { console.log('FAIL: expected 2 history cards, got', cards.length); process.exit(1); }
console.log('OK: render shows New Capture + ' + cards.length + ' history cards');

// clicking a card opens the full-size viewer (not a copy)
cards[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 40));
const viewer = document.getElementById('ckViewer');
if (!viewer || viewer.style.display !== 'flex') { console.log('FAIL: card click did not open the full-size viewer'); process.exit(1); }
if (!viewer.innerHTML.includes('cap-1')) { console.log('FAIL: viewer does not show the clicked capture'); process.exit(1); }
if (calls.copy.length !== 0) { console.log('FAIL: card click should not copy directly', JSON.stringify(calls.copy)); process.exit(1); }
console.log('OK: clicking a capture opens the full-size viewer');

// viewer copy button copies the capture
await window.ClipKit.copyFromViewer();
await new Promise((r) => setTimeout(r, 40));
if (calls.copy.length !== 1 || calls.copy[0] !== 'cap-1') { console.log('FAIL: viewer copy did not copy', JSON.stringify(calls.copy)); process.exit(1); }
console.log('OK: viewer Copy to clipboard works');

// right-click on a card shows the context menu with Copy + Delete
cards[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
await new Promise((r) => setTimeout(r, 40));
const menu = document.getElementById('ckMenu');
if (!menu || menu.style.display !== 'block') { console.log('FAIL: right-click did not open the context menu'); process.exit(1); }
if (!menu.innerHTML.includes('Copy to clipboard') || !menu.innerHTML.includes('Delete')) { console.log('FAIL: context menu missing Copy/Delete options'); process.exit(1); }
console.log('OK: right-click shows Copy/Delete context menu');

// menu Delete removes the capture
menu.querySelector('[data-ck-menu-del]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 60));
if (calls.delete.length !== 1 || calls.delete[0] !== 'cap-1') { console.log('FAIL: menu delete did not delete', JSON.stringify(calls.delete)); process.exit(1); }
console.log('OK: context menu Delete works');

console.log('ALL CLIPKIT TESTS PASSED ✔');
