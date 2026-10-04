/* src/core/explain.ts.  (a): for every instruction of tt.core.s, the
   registers the sentence names are exactly the registers the core's own
   disassembly names; nothing that is code is left outside backticks.
   (b): the sentences for the Inspector's examples, word for word: the fields
   by name with what the word puts in them, no register's value. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decode } from '../../src/core/decoder.ts';
import { codeParts, explain } from '../../src/core/explain.ts';
import { generalRegisterName } from '../../src/core/registers.ts';
import { coreLine, load } from '../helpers/program.ts';

// Instructions whose sentence names a register the disassembly does not
// (jal: $ra; syscall: $v0 and its arguments) or none it does.
const IMPLICIT = new Set(['jal', 'syscall', 'break', 'nop', 'mfhi', 'mflo', 'mthi', 'mtlo', 'jalr']);

test('tt.core.s: every sentence names the registers the core names', () => {
  const p = load('tests/programs/tt.core.s');
  const regs = Array.from({ length: 32 }, (_, i) => (i * 0x01010101) >>> 0);
  let checked = 0;
  for (const t of p.text) {
    const d = decode(t.word, t.addr, 'SpimNoDelaySlot');
    const e = explain(d, regs, t.addr);
    if (e.sentence === '') continue;
    const plain = codeParts(e.sentence).filter((x) => !x.code).map((x) => x.text).join('');
    assert.ok(!/0x|\$/.test(plain), `code outside backticks: ${e.sentence}`);
    if (IMPLICIT.has(d.name)) continue;
    const fromCore = new Set([...coreLine(t.line).disassembly.replace(/\[.*$/, '').matchAll(/(?<![f\w])\$(\d+)/g)]
      .map((m) => generalRegisterName(Number(m[1]))));
    const fromSentence = new Set(codeParts(e.sentence).filter((x) => x.code && x.text.startsWith('$')).map((x) => x.text));
    assert.deepEqual([...fromSentence].sort(), [...fromCore].sort(), `${t.line}\n${e.sentence}`);
    checked += 1;
  }
  assert.ok(checked > 3000, `${checked} sentences checked`);
});

test('the sentences, word for word', () => {
  const regs = new Array(32).fill(0);
  regs[14] = 0x80000001; // $t6
  regs[8] = 5; regs[9] = 0xfffffffe; regs[29] = 0x7fffffe4; regs[2] = 4;
  const at = (word: number, pc = 0x00400054) => explain(decode(word, pc, 'SpimNoDelaySlot'), regs, pc);
  assert.deepEqual(at(0x000e8843), {
    title: 'sra — Shift Right Arithmetic',
    sentence: 'rt(`$t6`)에 저장된 값을 shamt(`1`)만큼 오른쪽으로 옮겨 rd(`$s1`)에 넣습니다. 빈 자리는 Sign bit로 채웁니다.',
  });
  assert.equal(at(0x01095021).sentence, // addu $t2, $t0, $t1
    'rs(`$t0`)에 저장된 값과 rt(`$t1`)에 저장된 값을 더해 rd(`$t2`)에 넣습니다. Overflow는 무시합니다.');
  assert.equal(at(0x8fa4fffc).sentence, // lw $a0, -4($sp)
    'rs(`$sp`)에 저장된 주소에서 offset(`-4`)만큼 떨어진 곳의 Word를 읽어 rt(`$a0`)에 넣습니다.');
  assert.equal(at(0x2008ffff).sentence, // addi $t0, $zero, -1
    'rs(`$zero`)에 저장된 값에 Sign-extend한 immediate(`-1`) 값을 더해 rt(`$t0`)에 넣습니다. '
    + '부호 있는 Overflow가 일어나면 Exception이 발생합니다.');
  assert.equal(at(0x0000000c).sentence,
    '`$v0` 레지스터에 저장된 번호에 따라 System call을 합니다: print_string — `$a0` 값이 가리키는 문자열을 출력.');
  assert.equal(at(0x0c100009, 0x00400014).sentence,
    '다음 명령의 주소(`0x00400018`)를 `$ra` 레지스터에 남기고 `0x00400024` 주소로 Jump합니다(함수 호출).');
  assert.equal(at(0x03e00008).sentence, 'rs(`$ra`)에 저장된 주소, 곧 이 함수를 부른 곳 다음으로 돌아갑니다.');
  assert.deepEqual(at(0x00000000), { title: 'nop', sentence: '아무것도 하지 않습니다.' });
  // add and sub trap on a signed overflow; addu and subu never do.
  assert.deepEqual(at(0x01285020), { // add $t2, $t1, $t0
    title: 'add — Add',
    sentence: 'rs(`$t1`)에 저장된 값과 rt(`$t0`)에 저장된 값을 더해 rd(`$t2`)에 넣습니다. 부호 있는 Overflow가 일어나면 Exception이 발생합니다.',
  });
  assert.match(at(0x01095023).sentence, /Overflow는 무시합니다\.$/); // subu $t2, $t0, $t1
  assert.equal(at(0x9101fffc).sentence, // lbu $at, -4($t0)
    'rs(`$t0`)에 저장된 주소에서 offset(`-4`)만큼 떨어진 곳의 Byte를 읽어 rt(`$at`)에 넣습니다(Zero-extend).');
  assert.equal(at(0xfc000000).title, 'Not an instruction this simulator implements');
});

test('code parts', () => {
  assert.deepEqual(codeParts('a `b` c'), [{ text: 'a ', code: false }, { text: 'b', code: true }, { text: ' c', code: false }]);
});

// In English (core/lang.ts): every instruction of tt.core.s has a sentence
// in both languages or in neither; the English one has no Hangul, names the
// same registers as the Korean one and keeps code in backticks.  A few word for word.
test('in English: tt.core.s, and the sentences word for word', () => {
  const p = load('tests/programs/tt.core.s');
  const regs = Array.from({ length: 32 }, (_, i) => (i * 0x01010101) >>> 0);
  const named = (s: string) => new Set(codeParts(s).filter((x) => x.code && x.text.startsWith('$')).map((x) => x.text));
  let checked = 0;
  for (const t of p.text) {
    const d = decode(t.word, t.addr, 'SpimNoDelaySlot');
    const ko = explain(d, regs, t.addr, 'ko');
    const en = explain(d, regs, t.addr, 'en');
    assert.equal(en.title, ko.title);
    assert.equal(en.sentence === '', ko.sentence === '', `${t.line}: ${en.sentence}`);
    if (en.sentence === '') continue;
    assert.ok(!/[가-힣]/.test(en.sentence), en.sentence);
    const plain = codeParts(en.sentence).filter((x) => !x.code).map((x) => x.text).join('');
    assert.ok(!/0x|\$/.test(plain), `code outside backticks: ${en.sentence}`);
    assert.deepEqual(named(en.sentence), named(ko.sentence), `${t.line}\n${en.sentence}\n${ko.sentence}`);
    checked += 1;
  }
  assert.ok(checked > 3000, `${checked} sentences checked`);

  const r = new Array(32).fill(0);
  r[14] = 0x80000001; r[8] = 5; r[9] = 0xfffffffe; r[29] = 0x7fffffe4; r[2] = 4;
  const at = (word: number, pc = 0x00400054) => explain(decode(word, pc, 'SpimNoDelaySlot'), r, pc, 'en').sentence;
  assert.equal(at(0x000e8843), // sra $s1, $t6, 1
    'Shifts the value in rt (`$t6`) right by shamt (`1`) and puts the result in rd (`$s1`). The vacated bits are filled with the sign bit.');
  assert.equal(at(0x01095021), // addu $t2, $t0, $t1
    'Adds the value in rs (`$t0`) and the value in rt (`$t1`) and puts the sum in rd (`$t2`). Overflow is ignored.');
  assert.equal(at(0x8fa4fffc), // lw $a0, -4($sp)
    'Reads the word at the address in rs (`$sp`) plus offset (`-4`) and puts it in rt (`$a0`).');
  assert.equal(at(0x0000000c),
    'Makes the system call that the number in `$v0` selects: print_string — prints the string `$a0` points to.');
  assert.equal(at(0x0c100009, 0x00400014),
    'Leaves the address of the next instruction (`0x00400018`) in `$ra` and jumps to address `0x00400024` (a function call).');
  assert.equal(at(0x00000000), 'Does nothing.');
});
