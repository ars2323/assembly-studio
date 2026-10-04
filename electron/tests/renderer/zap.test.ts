import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bolt, fork, pathOf } from '../../src/renderer/app/panels/zap.ts';

const seeded = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test('bolt: from a to b, 2^depth segments, bent but near the line', () => {
  const pts = bolt([0, 0], [100, 0], 0.3, 4, seeded(7));
  assert.equal(pts.length, 17);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[16], [100, 0]);
  assert.ok(pts.some(([, y]) => Math.abs(y) > 1));            // jagged
  assert.ok(pts.every(([, y]) => Math.abs(y) < 30));           // not wild
});

test('fork: starts on the bolt', () => {
  const main = bolt([0, 0], [80, 40], 0.3, 4, seeded(3));
  const f = fork(main, seeded(5));
  assert.ok(main.some((p) => p[0] === f[0][0] && p[1] === f[0][1]));
  assert.match(pathOf(f), /^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+)+$/);
});
