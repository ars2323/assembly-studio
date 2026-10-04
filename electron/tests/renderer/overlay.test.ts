import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mixPalette, type Palette } from '../../src/renderer/app/logic/overlay.ts';

test('mixPalette: from one theme to the other, the symbols turning at the middle', () => {
  const dark: Palette = { surface: [20, 20, 20], scrim: [0, 0, 0], symbol: '#e6e6e6' };
  const light: Palette = { surface: [220, 220, 220], scrim: [100, 100, 100], symbol: '#1a1a1a' };
  assert.deepEqual(mixPalette(dark, light, 0), dark);
  assert.deepEqual(mixPalette(dark, light, 1), light);
  assert.deepEqual(mixPalette(dark, light, 0.25), { surface: [70, 70, 70], scrim: [25, 25, 25], symbol: '#e6e6e6' });
  assert.equal(mixPalette(dark, light, 0.5).symbol, '#1a1a1a');
  assert.deepEqual(mixPalette(dark, light, 2), light); // past the end: the end
});
