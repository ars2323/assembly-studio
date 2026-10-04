/* Step back's key and status-bar words (src/renderer/app/logic/stepback.ts),
   and which RISC-V ecalls leave the Console as it is
   (src/isa/riscv/renderer/logic/stepback.ts). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backKeys, isStepBackKey } from '../../src/renderer/app/logic/stepback.ts';
import { STATUS } from '../../src/renderer/app/messages/assemble.ts';
import { isIoEcall } from '../../src/isa/riscv/renderer/logic/stepback.ts';

const key = (k: string, mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
  ({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

test('Shift+F10 alone is step back; F10 is Step', () => {
  assert.equal(isStepBackKey(key('F10', { shiftKey: true })), true);
  assert.equal(isStepBackKey(key('F10')), false);
  assert.equal(isStepBackKey(key('F10', { shiftKey: true, ctrlKey: true })), false);
  assert.equal(isStepBackKey(key('F10', { shiftKey: true, altKey: true })), false);
  assert.equal(isStepBackKey(key('F5', { shiftKey: true })), false);
});

test('the status bar after a step back', () => {
  assert.equal(STATUS.stepBack.en('0x00400024'), 'Stepped back · PC `0x00400024`');
  assert.equal(STATUS.stepBack.ko('0x00400024'), '한 단계 되돌림 · PC `0x00400024`');
  assert.deepEqual(backKeys(true)[0], ['Shift+F10', 'Step back']);
  assert.ok(!backKeys(false).some(([k]) => k === 'Shift+F10'));
});

test('RISC-V: the ecalls that print or read', () => {
  const ECALL = 0x00000073;
  for (const a7 of [1, 4, 5, 8, 11, 12, 34, 63, 64, 1024]) assert.equal(isIoEcall(ECALL, a7), true, `a7 ${a7}`);
  for (const a7 of [9, 10, 17, 30, 93]) assert.equal(isIoEcall(ECALL, a7), false, `a7 ${a7}`);
  assert.equal(isIoEcall(0x00100073, 1), false); // ebreak
  assert.equal(isIoEcall(0x00a00893, 1), false); // li a7, 10
});
