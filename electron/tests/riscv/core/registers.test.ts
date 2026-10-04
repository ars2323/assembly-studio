/* src/isa/riscv/core/registers.ts: RISC-V's names, both ways, and the groups. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ABI_NAMES, abiName, bothNames, findRegister, FP_ABI_NAMES, REGISTER_GROUPS } from '../../../src/isa/riscv/core/registers.ts';

test('ABI names (the RISC-V calling convention)', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8, 10, 17, 18, 27, 28, 31].map(abiName),
    ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 's0', 'a0', 'a7', 's2', 's11', 't3', 't6']);
  assert.equal(bothNames(8), 'x8 (s0/fp)');
  assert.equal(new Set(ABI_NAMES).size, 32);
  assert.equal(new Set(FP_ABI_NAMES).size, 32);
});

test('findRegister: numbers and ABI names, both files; nothing else', () => {
  assert.deepEqual(findRegister('x10'), { file: 'x', number: 10 });
  assert.deepEqual(findRegister('A0'), { file: 'x', number: 10 });
  assert.deepEqual(findRegister('fp'), { file: 'x', number: 8 });
  assert.deepEqual(findRegister('f31'), { file: 'f', number: 31 });
  assert.deepEqual(findRegister('fs11'), { file: 'f', number: 27 });
  for (const no of ['x32', '$t0', 't7', 'f32', '', 'r1']) assert.equal(findRegister(no), null, no);
});

test('the groups hold x0..x31 each exactly once', () => {
  const all = REGISTER_GROUPS.flatMap((g) => g.numbers).sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 32 }, (_, i) => i));
});
