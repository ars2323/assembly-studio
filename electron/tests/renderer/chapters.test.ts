import assert from 'node:assert/strict';
import { test } from 'node:test';

import { progress } from '../../src/renderer/app/logic/chapters.ts';

test('progress: chapter, number and the bar', () => {
  const sizes = [2, 4, 3];
  assert.deepEqual(progress(sizes, 0), { chapter: 0, within: 0, number: 1, total: 9, fills: [0.5, 0, 0] });
  assert.deepEqual(progress(sizes, 1), { chapter: 0, within: 1, number: 2, total: 9, fills: [1, 0, 0] });
  assert.deepEqual(progress(sizes, 2), { chapter: 1, within: 0, number: 3, total: 9, fills: [1, 0.25, 0] });
  assert.deepEqual(progress(sizes, 8), { chapter: 2, within: 2, number: 9, total: 9, fills: [1, 1, 1] });
});

test('progress: out of range is held to the ends', () => {
  const sizes = [1, 1];
  assert.equal(progress(sizes, -3).number, 1);
  assert.equal(progress(sizes, 99).number, 2);
  assert.equal(progress(sizes, 99).chapter, 1);
});
