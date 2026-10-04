import assert from 'node:assert/strict';
import { test } from 'node:test';

import { agoText } from '../../src/renderer/app/logic/ago.ts';

test('agoText: just now, seconds, minutes, hours', () => {
  const at = new Date('2026-10-04T10:00:00Z');
  const after = (s: number) => agoText(at, at.getTime() + s * 1000);
  assert.equal(after(0), 'just now');
  assert.equal(after(4), 'just now');
  assert.equal(after(5), '5s ago');
  assert.equal(after(59), '59s ago');
  assert.equal(after(60), '1 min ago');
  assert.equal(after(3599), '59 min ago');
  assert.equal(after(7200), '2 h ago');
  assert.equal(after(-3), 'just now');   // a clock set back is not "in the future"
});

test('agoText in Korean: the status words are English in both languages', () => {
  const at = new Date('2026-10-04T10:00:00Z');
  const after = (s: number) => agoText(at, at.getTime() + s * 1000, 'ko');
  assert.deepEqual([0, 5, 60, 7200].map(after), ['just now', '5s ago', '1 min ago', '2 h ago']);
});
