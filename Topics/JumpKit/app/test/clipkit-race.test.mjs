// Regression test for the capture-result race (v5.1.37):
// overlay.close() fires the 'closed' handler which calls done({cancelled:true}).
// If done(rec) runs AFTER close(), the successful capture is discarded and the
// renderer sees cancelled — the file saves but nothing shows ("no img is saved").
import { test } from 'node:test';
import assert from 'node:assert';

function simulate(oldOrder) {
  let settled = false;
  let resolved = null;
  const done = (v) => { if (!settled) { settled = true; resolved = v; } };
  const overlayClose = () => done({ cancelled: true }); // 'closed' handler
  if (oldOrder) {
    overlayClose();                    // close() first
    done({ id: 'cap-1', width: 300 }); // then done(rec) — discarded
  } else {
    done({ id: 'cap-1', width: 300 }); // done(rec) first
    overlayClose();                    // closed → no-op (settled)
  }
  return resolved;
}

test('old order (close before done) loses the capture', () => {
  const r = simulate(true);
  assert.deepStrictEqual(r, { cancelled: true });
});

test('fixed order (done before close) keeps the capture record', () => {
  const r = simulate(false);
  assert.deepStrictEqual(r, { id: 'cap-1', width: 300 });
});
