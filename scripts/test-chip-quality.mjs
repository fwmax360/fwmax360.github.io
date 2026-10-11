import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipQuality } from '../src/lib/chip-quality.ts';
test('Quality follows capability evidence without guessing absent memory values', () => {
 assert.deepEqual(chipQuality({ width: 1440 }), { tier: 'full', manual: false, dpr: 2, fps: 60 });
 assert.equal(chipQuality({ width: 390 }).tier, 'balanced');
 assert.equal(chipQuality({ width: 1440, reduced: true }).tier, 'balanced');
 assert.equal(chipQuality({ width: 1440, memory: 4 }).tier, 'economy');
 for (const extra of [{ memory: 2 }, { cores: 2 }, { saveData: true }, { connection: '2g' }, { connection: 'slow-2g' }]) {
  const result = chipQuality({ width: 1440, ...extra });
  assert.equal(result.manual, true); assert.equal(result.dpr, 1); assert.equal(result.fps, 30);
 }
});
