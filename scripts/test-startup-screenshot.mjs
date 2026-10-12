import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupScreenshot } from './lib/startup-screenshot.mjs';
const transport = () => new Error('page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot');
function fixture(failures) {
 const counts = { front: 0, paint: 0, capture: 0, phase: 0 };
 const page = {
  bringToFront: async () => { counts.front++; },
  evaluate: async () => { counts.paint++; },
  screenshot: async () => { counts.capture++; const error = failures.shift(); if (error) throw error; return Buffer.from('captured'); },
 };
 return { page, counts, verify: async () => { counts.phase++; } };
}
test('transient capture failure requires a fresh paint and phase check, then a real screenshot', async () => {
 const f = fixture([transport(), transport()]);
 assert.deepEqual(await startupScreenshot(f.page, {}, f.verify), Buffer.from('captured'));
 assert.deepEqual(f.counts, { front: 3, paint: 3, capture: 3, phase: 4 });
});
test('persistent capture failure still fails after exactly three attempts', async () => {
 const f = fixture([transport(), transport(), transport()]);
 await assert.rejects(startupScreenshot(f.page, {}, f.verify), /Unable to capture screenshot/);
 assert.equal(f.counts.capture, 3);
});
test('timeouts and closed targets are not hidden by screenshot retries', async () => {
 for (const message of ['Timeout 30000ms exceeded', 'Target page, context or browser has been closed']) {
  const f = fixture([new Error(message)]);
  await assert.rejects(startupScreenshot(f.page, {}, f.verify), error => error.message === message);
  assert.equal(f.counts.capture, 1);
 }
});
test('failed phase assertion prevents capture', async () => {
 const f = fixture([]);
 await assert.rejects(startupScreenshot(f.page, {}, async () => { throw new Error('Wrong loading state'); }), /Wrong loading state/);
 assert.equal(f.counts.capture, 0);
});
