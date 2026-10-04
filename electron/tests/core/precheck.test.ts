/* src/core/precheck.ts and isa/riscv/core/precheck.ts: the words they
   report, and -- the point of them -- no report on a program the assembler
   takes.  Every MIPS file of the repository is checked against the core
   itself: each word reported is one SPIM stops at, one after another. */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { parseAssemblerMessage, resolveMessageLine } from '../../src/core/asm-errors.ts';
import { precheckMips, statements } from '../../src/core/precheck.ts';
import { precheckRiscv } from '../../src/isa/riscv/core/precheck.ts';
import { root } from '../helpers/machine.ts';

const repo = path.join(root, '..');
const sFiles = (dir: string): string[] => readdirSync(path.join(repo, dir)).filter((f) => f.endsWith('.s')).map((f) => path.join(dir, f));
const MIPS_FILES = ['CPU', 'electron/tests/samples', 'electron/tests/programs', 'electron/src/examples', 'electron/src/examples/en'].flatMap(sFiles);
const RISCV_FILES = ['electron/tests/riscv/samples', 'electron/tests/riscv/core', 'electron/src/isa/riscv/examples', 'electron/src/isa/riscv/examples/en'].flatMap(sFiles);
const read = (f: string) => readFileSync(path.join(repo, f), 'utf8');

// The core's first syntax error in `text`, as an Editor line; 0 if none.
function firstSyntaxError(text: string): number {
  const lines = text.split('\n');
  for (const raw of spim.assemble(text).errors) {
    const m = parseAssemblerMessage(raw);
    if (m.message === 'syntax error') return resolveMessageLine(m, lines);
  }
  return 0;
}

test('MIPS: the repository has assembly files to check', () => {
  assert.ok(MIPS_FILES.length >= 25, MIPS_FILES.join(' '));
  assert.ok(MIPS_FILES.includes('CPU/exceptions.s'));
});

for (const file of MIPS_FILES) {
  test(`MIPS ${file}: every word reported is one the core stops at`, () => {
    const lines = read(file).split('\n');
    const found = precheckMips(lines.join('\n'));
    // The core stops at the first syntax error: report by report, it is
    // that line; the line emptied, the next.
    for (const word of found) {
      assert.equal(firstSyntaxError(lines.join('\n')), word.line, `${file}: ${word.token} on line ${word.line}`);
      lines[word.line - 1] = '';
    }
    // A file the core takes gets no report at all.
    if (spim.assemble(read(file)).ok) assert.deepEqual(found, []);
  });
}

test('MIPS: the files known to be wrong are reported where they are wrong, and only there', () => {
  const at = (f: string) => precheckMips(read(f)).map((w) => `${w.line} ${w.token}`);
  assert.deepEqual(at('electron/tests/samples/lab04.s'), ['15 srll']);
  assert.deepEqual(at('electron/src/examples/tutorial-error.s'), ['4 srll']);
  assert.deepEqual(at('electron/src/examples/en/tutorial-error.s'), ['4 srll']);
  for (const f of ['electron/tests/samples/lab04-ok.s', 'electron/src/examples/tutorial.s', 'electron/src/examples/en/tutorial.s', 'CPU/exceptions.s']) {
    assert.deepEqual(at(f), [], f);
  }
});

test('MIPS: the user\'s program -- "syscalll" as the last line, no newline after it', () => {
  const program = '.text\n.globl main\nmain:\nli $t0, 1\nli $t1, 2\nadd $t3, $t0, $t1\nli $v0, 10\nsyscalll';
  assert.deepEqual(precheckMips(program), [{ line: 8, source: 'syscalll', token: 'syscalll', kind: 'instruction' }]);
  assert.deepEqual(precheckMips('main:\tlii $v0, 10\t# exit\r\n'), [{ line: 1, source: 'main:\tlii $v0, 10\t# exit', token: 'lii', kind: 'instruction' }]);
  assert.deepEqual(precheckMips('  .global main\n  .wrod 1'), [
    { line: 1, source: '.global main', token: '.global', kind: 'directive' },
    { line: 2, source: '.wrod 1', token: '.wrod', kind: 'directive' },
  ]);
});

test('MIPS: what is not an instruction\'s place is left alone', () => {
  for (const line of [
    '', '   ', '# srll comment only', 'main:', 'main: loop:  # two labels', 'main :  li $v0, 10',
    'x = 5', 'size=4', '  li $v0, 10; syscall', 'msg: .asciiz "srll; foo # bar"', "  li $t0, '#'  # a character",
    "  li $t0, ';'", '  .word 1, 2, 3', '$L1: nop', '  mfc0 $t0, $12', '  eret', '  .set noat', '  .kdata', '  .ktext 0x80000180',
    '  la $a0, msg', '  bne $t0, $zero, done', '  sw $ra, 0($sp)', '  l.s $f0, 0($a0)', '  cvt.s.w $f2, $f0', '  mul.d $f0, $f2, $f4',
    '  10', '  $t0, $t1', '  , li $t0, 1',  // not a name first: the core's to report
  ]) {
    assert.deepEqual(precheckMips(line), [], line);
  }
  // A ';' starts another statement, which is looked at too.
  assert.deepEqual(precheckMips('li $v0, 10; sycall').map((w) => w.token), ['sycall']);
  // SPIM looks a word up as it is written.
  assert.deepEqual(precheckMips('  ADD $t0, $t1, $t2').map((w) => w.token), ['ADD']);
});

test('statements(): comments, strings and characters', () => {
  assert.deepEqual(statements('a; b # c; d'), ['a', ' b ']);
  assert.deepEqual(statements('.asciiz "x;#y"; nop'), ['.asciiz "x;#y"', ' nop']);
  assert.deepEqual(statements("li $t0, '#' # c"), ["li $t0, '#' "]);
  assert.deepEqual(statements('.asciiz "a\\"b;c"'), ['.asciiz "a\\"b;c"']);
  assert.deepEqual(statements('a; b', null), ['a; b']);
});

test('RISC-V: the repository\'s programs get no report but for the line written wrong on purpose', () => {
  assert.ok(RISCV_FILES.length >= 6, RISCV_FILES.join(' '));
  for (const f of RISCV_FILES) {
    const want = /tutorial-error\.s$/.test(f) ? ['4 adi'] : [];
    assert.deepEqual(precheckRiscv(read(f)).map((w) => `${w.line} ${w.token}`), want, f);
  }
});

test('RISC-V: the misspelt word, as RARS reports it ("is not a recognized operator")', () => {
  assert.deepEqual(precheckRiscv('.text\nmain:\nli a7, 10\necalll'), [{ line: 4, source: 'ecalll', token: 'ecalll', kind: 'instruction' }]);
  assert.deepEqual(precheckRiscv('main: lii a7, 10 # x\n  .wrod 1').map((w) => `${w.line} ${w.kind} ${w.token}`),
    ['1 instruction lii', '2 directive .wrod']);
  // MIPS's names are not RISC-V's.
  assert.deepEqual(precheckRiscv('  syscall\n  move a0, t0').map((w) => w.token), ['syscall', 'move']);
});

test('RISC-V: what RARS takes is left alone', () => {
  const program = [
    '.eqv EXIT ecall', '.eqv SIZE 4', '.macro done', '  li a7, 10', '  EXIT', '.end_macro',
    '.macro print_int (%x)', '  %x a0, a0', '  bogus inside a macro is read where it is used', '.end_macro',
    '.data', 'msg: .string "srll # ;"', 'n: .word SIZE', '.text', 'main:', '  LI a7, 1', '  ECALL', '  fcvt.w.s t0, ft0',
    '  fence.i', '  csrrw zero, ustatus, zero', '  print_int (5)', '  EXIT', '  done', "  li t0, '#'", 'b: nop', '  .GLOBL main',
    '  10', '  $t0', '  li a7, 10; ecall',
  ].join('\n');
  assert.deepEqual(precheckRiscv(program), []);
  // An .include may bring macros this file does not show.
  assert.deepEqual(precheckRiscv('.include "macros.s"\n  print_hello'), []);
});
