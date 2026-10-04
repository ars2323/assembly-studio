/* src/isa/riscv/core/near-miss.ts and rars-messages.ts: what it says is
   wrong, in both languages, never what the student may have meant; the
   words it leaves alone (RISC-V's names, and MIPS habits written in RISC-V
   code); RARS's messages in the window's words. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nearMiss, rarsHint } from '../../../src/isa/riscv/core/near-miss.ts';
import { rarsMessage } from '../../../src/isa/riscv/core/rars-messages.ts';

test('what is wrong: a word that is no instruction or directive, a register that does not exist', () => {
  assert.deepEqual(nearMiss('x: .wrod 1'), { why: 'unknown', kind: 'directive', token: '.wrod' });
  assert.deepEqual(nearMiss('    .dtaa'), { why: 'unknown', kind: 'directive', token: '.dtaa' });
  assert.deepEqual(nearMiss('    srll t1, t0, 2'), { why: 'unknown', kind: 'instruction', token: 'srll' });
  assert.deepEqual(nearMiss('    ecalll'), { why: 'unknown', kind: 'instruction', token: 'ecalll' });
  assert.deepEqual(nearMiss('    foobar t0'), { why: 'unknown', kind: 'instruction', token: 'foobar' });
  assert.deepEqual(nearMiss('    lw t0, 0(spp)', 'spp'), { why: 'unknown-register', token: 'spp' });
  assert.deepEqual(nearMiss('    add t7, t0, t1'), { why: 'no-such-register', token: 't7', family: 't', range: 't0–t6' });
  assert.deepEqual(nearMiss('    li s12, 1'), { why: 'no-such-register', token: 's12', family: 's', range: 's0–s11' });
  assert.deepEqual(nearMiss('    mv a8, t0'), { why: 'no-such-register', token: 'a8', family: 'a', range: 'a0–a7' });
  assert.deepEqual(nearMiss('    add x32, t0, t1'), { why: 'no-such-register', token: 'x32', family: 'x', range: 'x0–x31' });
  assert.deepEqual(nearMiss('    fadd.s ft12, ft0, ft1'), { why: 'no-such-register', token: 'ft12', family: 'ft', range: 'ft0–ft11' });
});

test('MIPS habits: a $ register, syscall, move', () => {
  assert.deepEqual(nearMiss('    add $t0, t1, t2'), { why: 'mips-register', token: '$t0', bare: 't0' });
  assert.deepEqual(nearMiss('    li $v0, 4'), { why: 'mips-register', token: '$v0', bare: 'v0' });
  assert.deepEqual(nearMiss('    syscall'), { why: 'mips-instruction', token: 'syscall' });
  assert.deepEqual(nearMiss('    move a0, t0'), { why: 'mips-instruction', token: 'move' });
});

test('a line the assembler would accept gets nothing', () => {
  for (const line of ['    .globl main', '    srl t1, t0, 2', 'main: li a7, 10', '    lw t0, 4(t1)', '    .asciz "text"',
    '    add s11, t6, a7', 'loop:', '    beq t0, zero, done   # done', '    la a0, msg', '    fadd.s ft11, fs11, fa7',
    '    add x31, x0, fp', '    ecall', '    ECALL', '    Li a7, 10']) {
    assert.equal(nearMiss(line), null, line);
  }
});

test('labels, strings, numbers and comments are not looked at; a bare word is a register only where RARS named it', () => {
  assert.equal(nearMiss('mian: li a7, 4'), null);
  assert.equal(nearMiss('    j mian'), null);
  assert.equal(nearMiss('    j spp'), null);                   // a label that looks like a register, unflagged
  assert.equal(nearMiss('msg: .asciz ".wrod srll $t0"'), null);
  assert.equal(nearMiss('    li a7, 4   # srll $t0 syscall'), null);
  assert.equal(nearMiss('    .word 0xsrl'), null);
});

test("the hint under RARS's message: what is wrong, no guess, in both languages", () => {
  const both = (message: string, line: string) => [rarsHint(message, line, 'ko'), rarsHint(message, line, 'en')];
  assert.deepEqual(both('"ecalll" is not a recognized operator', 'ecalll'), ['명령어를 확인해 주세요: `ecalll`', 'Check the instruction: `ecalll`']);
  assert.deepEqual(both('"srll" is not a recognized operator', 'srll t1, t0, 2'), ['명령어를 확인해 주세요: `srll`', 'Check the instruction: `srll`']);
  assert.deepEqual(both('"t7": operand is of incorrect type', 'li t7, 1'),
    ['레지스터 이름을 확인해 주세요: `t7`. `t` 레지스터는 `t0–t6` 입니다.', 'Check the register name: `t7`. The `t` registers are `t0–t6`.']);
  assert.deepEqual(both('"spp": operand is of incorrect type', 'addi spp, spp, -4'), ['레지스터 이름을 확인해 주세요: `spp`', 'Check the register name: `spp`']);
  assert.deepEqual(both('"$t0": operand is of incorrect type', 'li $t0, 1'),
    ['RISC-V 레지스터 이름에는 `$` 가 붙지 않습니다.', 'RISC-V register names have no `$`.']);
  assert.deepEqual(both('"$v0": operand is of incorrect type', 'li $v0, 4'),
    ['레지스터 이름을 확인해 주세요. RISC-V 레지스터 이름에는 `$` 가 붙지 않습니다. MIPS 레지스터입니다: `v0`', 'Check the register name. RISC-V register names have no `$`. This is a MIPS register: `v0`']);
  assert.deepEqual(both('"syscall" is not a recognized operator', 'syscall'),
    ['RISC-V 명령어를 확인해 주세요. MIPS 명령어입니다: `syscall`', 'Check the RISC-V instruction. This is a MIPS one: `syscall`']);
  assert.equal(rarsHint('Too many operands', 'li a0, 1, 2', 'en'), '');
  assert.equal(rarsHint('forward reference or invalid parameters for macro "done"', 'done 1', 'en'), '');
  for (const lang of ['ko', 'en'] as const) {
    for (const [m, line] of [['"srll" is not a recognized operator', 'srll t1, t0, 2'], ['"ecal" is not a recognized operator', 'ecal'],
      ['"spp": operand is of incorrect type', 'addi spp, spp, -4'], ['"syscall" is not a recognized operator', 'syscall']]) {
      const hint = rarsHint(m, line, lang);
      assert.doesNotMatch(hint, /mean|→|uses|혹시|\?/, hint);
      assert.doesNotMatch(hint, /`(srl|ecall|sp)`/, hint);
    }
  }
});

test("RARS's messages in the window's words; others as they are", () => {
  assert.equal(rarsMessage('"ecalll" is not a recognized operator', 'ko'), '알 수 없는 명령');
  assert.equal(rarsMessage('"ecalll" is not a recognized operator', 'en'), 'Unknown instruction');
  assert.equal(rarsMessage('"t7": operand is of incorrect type', 'ko'), '피연산자의 종류가 맞지 않음');
  assert.equal(rarsMessage('"b": Too many or incorrectly formatted operands. Expected: b label', 'ko'), '피연산자가 너무 많거나 형식이 틀림');
  assert.equal(rarsMessage('Too many or incorrectly formatted operands. Expected: b label', 'en'), 'Too many operands, or in the wrong form');
  assert.equal(rarsMessage('li a7, 10; ecall\nInvalid language element: 10;', 'ko'), '읽을 수 없는 부분이 있음');
  assert.equal(rarsMessage('Symbol "foo" not found in symbol table.', 'ko'), '정의되지 않은 Label');
  assert.equal(rarsMessage('Something RARS says rarely', 'ko'), null);
});
