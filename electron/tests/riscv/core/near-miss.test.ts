/* src/isa/riscv/core/near-miss.ts: the slips it names, and the words it leaves alone
   (RISC-V's names, and MIPS habits written in RISC-V code). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { editDistance, nearMiss, nearMissRule, nearest } from '../../../src/isa/riscv/core/near-miss.ts';

test('the distance counts an insertion, a deletion, a substitution and a swap as one each', () => {
  assert.equal(editDistance('srl', 'srll'), 1);
  assert.equal(editDistance('.asciz', '.ascii'), 1);
  assert.equal(editDistance('ecal', 'ecall'), 1);
  assert.equal(editDistance('addi', 'adid'), 1); // a swap
  assert.equal(editDistance('add', 'sub'), 3);
});

test('the rule: nothing for two characters, one letter to five, two from six on', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 9].map(nearMissRule), [0, 0, 1, 1, 2, 2]);
});

test('the typical slips are named', () => {
  assert.deepEqual(nearMiss('x: .wrod 1'), { why: 'spelling', kind: 'directive', token: '.wrod', meant: '.word' });
  assert.deepEqual(nearMiss('    .dtaa'), { why: 'spelling', kind: 'directive', token: '.dtaa', meant: '.data' });
  assert.deepEqual(nearMiss('    srll t1, t0, 2'), { why: 'spelling', kind: 'instruction', token: 'srll', meant: 'srl' });
  assert.deepEqual(nearMiss('    addd t0, t1, t2'), { why: 'spelling', kind: 'instruction', token: 'addd', meant: 'add' });
  assert.deepEqual(nearMiss('    ecal'), { why: 'spelling', kind: 'instruction', token: 'ecal', meant: 'ecall' });
  assert.deepEqual(nearMiss('    lw t0, 0(spp)', 'spp'), { why: 'spelling', kind: 'register', token: 'spp', meant: 'sp' });
  assert.deepEqual(nearMiss('    add t7, t0, t1'), { why: 'no-such-register', token: 't7', family: 't', range: 't0–t6' });
  assert.deepEqual(nearMiss('    li s12, 1'), { why: 'no-such-register', token: 's12', family: 's', range: 's0–s11' });
  assert.deepEqual(nearMiss('    mv a8, t0'), { why: 'no-such-register', token: 'a8', family: 'a', range: 'a0–a7' });
  assert.deepEqual(nearMiss('    add x32, t0, t1'), { why: 'no-such-register', token: 'x32', family: 'x', range: 'x0–x31' });
  assert.deepEqual(nearMiss('    fadd.s ft12, ft0, ft1'), { why: 'no-such-register', token: 'ft12', family: 'ft', range: 'ft0–ft11' });
});

test('MIPS habits: a $ register, syscall, move', () => {
  assert.deepEqual(nearMiss('    add $t0, t1, t2'), { why: 'mips', token: '$t0', meant: 't0' });
  assert.deepEqual(nearMiss('    li $v0, 4'), { why: 'mips', token: '$v0', meant: 'v0' });   // no v0 in RISC-V: the hint says only that $ goes
  assert.deepEqual(nearMiss('    lw t0, 4($29)'), { why: 'mips', token: '$29', meant: 'x29' });
  assert.deepEqual(nearMiss('    syscall'), { why: 'mips', token: 'syscall', meant: 'ecall' });
  assert.deepEqual(nearMiss('    move a0, t0'), { why: 'mips', token: 'move', meant: 'mv' });
});

test('a line the assembler would accept gets no guess', () => {
  for (const line of ['    .globl main', '    srl t1, t0, 2', 'main: li a7, 10', '    lw t0, 4(t1)', '    .asciz "text"',
    '    add s11, t6, a7', 'loop:', '    beq t0, zero, done   # done', '    la a0, msg', '    fadd.s ft11, fs11, fa7',
    '    add x31, x0, fp', '    ecall']) {
    assert.equal(nearMiss(line), null, line);
  }
});

test('a word far from every name, or as near to two, gets no guess', () => {
  assert.equal(nearMiss('    foobar t0'), null);       // nothing within two
  assert.equal(nearMiss('    xyz t0'), null);          // nothing within one
  assert.equal(nearMiss('    ad t0, t1, t2'), null);   // two characters: never
  assert.equal(nearest('sr', ['srl', 'sra', 'sll']), null);
  // Ties: the one sharing the longest prefix, then the longest suffix, else none.
  assert.equal(nearest('srll', ['srl', 'sll']), 'srl');         // prefix srl (3) over s (1)
  assert.equal(nearest('sbb', ['sb', 'sub']), 'sb');            // prefix sb (2) over s (1)
  assert.equal(nearest('.asciz', ['.ascii', '.asciiz']), '.asciiz'); // prefix tied at .asci; suffix z decides
  assert.equal(nearest('sbb', ['sub', 'sll']), 'sub');          // prefix tied at s; suffix b decides
  assert.equal(nearest('xll', ['sll', 'all']), null);           // prefix 0 and suffix ll for both: no guess
});

test('labels, strings, numbers and comments are not looked at; a bare word is a register guess only where RARS named it', () => {
  assert.equal(nearMiss('mian: li a7, 4'), null);             // a label is the student's own name
  assert.equal(nearMiss('    j mian'), null);                  // so is a label used
  assert.equal(nearMiss('    j spp'), null);                   // a label that looks like a register, unflagged
  assert.equal(nearMiss('msg: .asciz ".wrod srll $t0"'), null);
  assert.equal(nearMiss('    li a7, 4   # srll $t0 syscall'), null);
  assert.equal(nearMiss('    .word 0xsrl'), null);
});
