/* src/core/near-miss.ts: what it says is wrong, in both languages, never
   what the student may have meant; and the words it leaves alone. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { spimMessage } from '../../src/core/asm-messages.ts';
import { assemblerHint, editDistance, nearAny, nearMiss, nearMissRule } from '../../src/core/near-miss.ts';

test('the distance counts an insertion, a deletion, a substitution and a swap as one each', () => {
  assert.equal(editDistance('srl', 'srll'), 1);
  assert.equal(editDistance('.asciz', '.asciiz'), 1);
  assert.equal(editDistance('.global', '.globl'), 1);
  assert.equal(editDistance('addu', 'adud'), 1); // a swap
  assert.equal(editDistance('add', 'sub'), 3);
});

test('the rule: nothing for two characters, one letter to five, two from six on', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 9].map(nearMissRule), [0, 0, 1, 1, 2, 2]);
  assert.equal(nearAny('$spp', ['$sp', '$fp']), true);
  assert.equal(nearAny('$sp', ['$sp']), false);
  assert.equal(nearAny('$label', ['$sp', '$fp']), false);
});

test('what is wrong: a word that is no instruction or directive, a register that does not exist, a missing $', () => {
  assert.deepEqual(nearMiss('    .global main'), { why: 'unknown', kind: 'directive', token: '.global' });
  assert.deepEqual(nearMiss('msg: .asciz "hi"'), { why: 'unknown', kind: 'directive', token: '.asciz' });
  assert.deepEqual(nearMiss('    srll $t1, $t0, 2'), { why: 'unknown', kind: 'instruction', token: 'srll' });
  assert.deepEqual(nearMiss('    lii $v0, 10'), { why: 'unknown', kind: 'instruction', token: 'lii' });
  assert.deepEqual(nearMiss('    syscalll'), { why: 'unknown', kind: 'instruction', token: 'syscalll' });
  assert.deepEqual(nearMiss('    foobar $t0'), { why: 'unknown', kind: 'instruction', token: 'foobar' }); // far from every name: still none
  assert.deepEqual(nearMiss('    li $v0, 10; sycall'), { why: 'unknown', kind: 'instruction', token: 'sycall' });
  assert.deepEqual(nearMiss('    li $s10, 1'), { why: 'no-such-register', token: '$s10', family: '$s', range: '$s0–$s7' });
  assert.deepEqual(nearMiss('    add $t10, $t0, $t1'), { why: 'no-such-register', token: '$t10', family: '$t', range: '$t0–$t9' });
  assert.deepEqual(nearMiss('    move $a4, $t0'), { why: 'no-such-register', token: '$a4', family: '$a', range: '$a0–$a3' });
  assert.deepEqual(nearMiss('    add $32, $t0, $t1'), { why: 'no-such-register', token: '$32', family: '$0', range: '$0–$31' });
  assert.deepEqual(nearMiss('    add t0, $t1, $t2'), { why: 'missing-dollar', token: 't0' });
  assert.deepEqual(nearMiss('    li v0, 4'), { why: 'missing-dollar', token: 'v0' });
  assert.deepEqual(nearMiss('    lw $t0, 0($spp)'), { why: 'unknown-register', token: '$spp' });
});

test('a line the assembler would accept gets nothing', () => {
  for (const line of ['    .globl main', '    srl $t1, $t0, 2', 'main: li $v0, 10', '    lw $t0, 4($t1)', '    .asciiz "text"',
    '    add $s7, $t9, $a3', 'loop:', '    beq $t0, $zero, done   # done', '    la $a0, msg', 'x = 4', '    j $L1']) {
    assert.equal(nearMiss(line), null, line);
  }
});

test('labels, strings, numbers and comments are not looked at', () => {
  assert.equal(nearMiss('mian: li $v0, 4'), null);            // a label is the student's own name
  assert.equal(nearMiss('    j mian'), null);                  // so is a label used
  assert.equal(nearMiss('msg: .asciiz ".global srll t0"'), null);
  assert.equal(nearMiss('    li $v0, 4   # srll t0 .global'), null);
  assert.equal(nearMiss('    .word 0xsrl'), null);
});

test('the hint under an assembler message: what is wrong, no guess, in both languages', () => {
  const both = (message: string, line: string) => [assemblerHint(message, line, 'ko'), assemblerHint(message, line, 'en')];
  assert.deepEqual(both('syntax error', '    lii $v0, 10'), ['명령어를 확인해 주세요: `lii`', 'Check the instruction: `lii`']);
  assert.deepEqual(both('syntax error', '    srll $t1, $t0, 2'), ['명령어를 확인해 주세요: `srll`', 'Check the instruction: `srll`']);
  assert.deepEqual(both('syntax error', '    .global main'), ['지시어를 확인해 주세요: `.global`', 'Check the directive: `.global`']);
  assert.deepEqual(both('syntax error', '    li $s10, 1'),
    ['레지스터 이름을 확인해 주세요: `$s10`. `$s` 레지스터는 `$s0–$s7` 입니다.', 'Check the register name: `$s10`. The `$s` registers are `$s0–$s7`.']);
  assert.deepEqual(both('syntax error', '    lw $t0, 0($spp)'), ['레지스터 이름을 확인해 주세요: `$spp`', 'Check the register name: `$spp`']);
  assert.deepEqual(both('syntax error', '    add t0, $t1, $t2'), ['레지스터 이름은 `$` 로 시작합니다.', 'Register names start with `$`.']);
  assert.deepEqual(both('syntax error', '    add $t0 $t1'),
    ['명령어 이름, 레지스터 이름(`$t0` 처럼), 쉼표를 확인해 주세요.', 'Check the instruction name, the register names (like `$t0`) and the commas.']);
  assert.equal(assemblerHint('Label is defined for the second time', 'main:', 'en'), 'Two labels have this name. Rename one of them.');
  assert.equal(assemblerHint('Immediate value is too large for field', 'addi $t0, $t0, 0x12345', 'en'),
    'The value is too big for this instruction. Put it in a register with `li` first.');
  assert.equal(assemblerHint('Unknown character', '.asciiz "abc', 'en'), '');
  assert.equal(assemblerHint('Cannot open file', '', 'ko'), '');
  // Never a guess, in either language.
  for (const lang of ['ko', 'en'] as const) {
    for (const line of ['srll $t1, $t0, 2', '.global main', 'lw $t0, 0($spp)', 'add t0, $t1, $t2', 'sysclal']) {
      const hint = assemblerHint('syntax error', line, lang);
      assert.doesNotMatch(hint, /mean|→|혹시|아닌가요|\?/, hint);
      assert.doesNotMatch(hint, /`(srl|\.globl|\$sp|\$t0|syscall)`/, hint);
    }
  }
});

test("SPIM's messages in the window's words; others as they are", () => {
  assert.equal(spimMessage('syntax error', 'ko'), '문법 오류');
  assert.equal(spimMessage('syntax error', 'en'), 'Syntax error');
  assert.equal(spimMessage('Label is defined for the second time', 'ko'), 'Label 이 두 번 정의됨');
  assert.equal(spimMessage('immediate value (65432) out of range (-32768 .. 32767)', 'ko'), '값이 범위를 벗어남');
  assert.equal(spimMessage('Shift distance can only be in the range 0..31', 'en'), 'Shift amount out of range');
  assert.equal(spimMessage('Unknown character', 'ko'), '알 수 없는 문자');
  assert.equal(spimMessage("Cannot open file: `x.s'", 'ko'), null);
});
