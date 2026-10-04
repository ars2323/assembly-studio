import assert from 'node:assert/strict';
import { test } from 'node:test';

import { progressFill, progressText } from '../../src/renderer/app/logic/update-progress.ts';

const MB = 1024 * 1024;

test('progressText: the percentage, and what has come of the whole in MB', () => {
  assert.deepEqual(progressText({ percent: 40, transferred: 56.5 * MB, total: 141.3 * MB }), { percent: '40%', size: '56.5 / 141.3 MB' });
  assert.deepEqual(progressText({ percent: 0, transferred: 0, total: 141.3 * MB }), { percent: '0%', size: '0.0 / 141.3 MB' });
  assert.deepEqual(progressText({ percent: 100, transferred: 141.3 * MB, total: 141.3 * MB }), { percent: '100%', size: '141.3 / 141.3 MB' });
});

test('progressText: rounded down, so 100% only when it is all there', () => {
  assert.equal(progressText({ percent: 99.96, transferred: 1, total: 2 }).percent, '99%');
  assert.equal(progressText({ percent: 40.7, transferred: 1, total: 2 }).percent, '40%');
});

test('progressText: no total, no size; nonsense kept within bounds', () => {
  assert.deepEqual(progressText({ percent: 12, transferred: 5 * MB, total: 0 }), { percent: '12%', size: '' });
  assert.deepEqual(progressText({ percent: NaN, transferred: NaN, total: NaN }), { percent: '0%', size: '' });
  assert.equal(progressText({ percent: 130, transferred: 3 * MB, total: 2 * MB }).size, '2.0 / 2.0 MB');
  assert.equal(progressText({ percent: -5, transferred: -1, total: 2 * MB }).percent, '0%');
});

test('progressFill: the bar, 0 to 100', () => {
  assert.equal(progressFill({ percent: 40.9, transferred: 0, total: 0 }), 40);
  assert.equal(progressFill({ percent: 250, transferred: 0, total: 0 }), 100);
  assert.equal(progressFill({ percent: -1, transferred: 0, total: 0 }), 0);
});
