/* src/isa/riscv/core/explain.ts and the Inspector's immediate line
   (instruction-text.ts): the sentences for a few words, word for word.
   RISC-V's add, addi and sub never trap; branches say whether they will
   be taken with the values now. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decode } from '../../../src/isa/riscv/core/decoder.ts';
import { codeParts, explain } from '../../../src/isa/riscv/core/explain.ts';
import { immediateLine, meaningOf } from '../../../src/isa/riscv/core/instruction-text.ts';

const regs = new Array(32).fill(0);
regs[5] = 0xfffffffb; // t0
regs[6] = 5;          // t1
regs[2] = 0x7fffeffc; // sp
const at = (word: number, pc = 0x00400000) => explain(decode(word), regs, pc);

test('the sentences, word for word', () => {
  assert.deepEqual(at(0x006283b3), { // add t2, t0, t1
    title: 'add — Add',
    sentence: 'rs1(`t0`)에 저장된 값과 rs2(`t1`)에 저장된 값을 더해 rd(`t2`)에 넣습니다. '
      + 'Overflow가 나도 Exception 없이 아래 32비트만 남깁니다.',
  });
  assert.equal(at(0xffb00293).sentence, // addi t0, zero, -5 (li)
    'imm(`-5`) 값을 rd(`t0`)에 넣습니다. (`li` 명령이 이렇게 바뀝니다.)');
  assert.equal(at(0xfe512c23).sentence, // sw t0, -8(sp)
    'rs2(`t0`)에 저장된 값을 rs1(`sp`)에 저장된 주소에서 offset(`-8`)만큼 떨어진 곳에 씁니다.');
  assert.equal(at(0x00628663, 0x0040000c).sentence, // beq t0, t1, +12
    'rs1(`t0`)에 저장된 값과 rs2(`t1`)에 저장된 값이 같으면 PC에서 offset(`12`)만큼 떨어진 `0x00400018` 주소로 Branch합니다.');
  assert.equal(at(0x008000ef, 0x00400010).sentence, // jal ra, +8
    'PC에서 offset(`8`)만큼 떨어진 `0x00400018` 주소로 Jump합니다. 다음 명령의 주소(`0x00400014`)를 rd(`ra`)에 남깁니다.');
  assert.equal(at(0x00000000).title, 'Unknown instruction');
});

test('nothing that is code is outside backticks', () => {
  for (const word of [0x006283b3, 0xffb00293, 0xfe512c23, 0x00628663, 0x008000ef, 0x12345e37]) {
    const plain = codeParts(at(word).sentence).filter((p) => !p.code).map((p) => p.text).join('');
    assert.ok(!/0x|\bx\d/.test(plain), plain);
  }
});

test('the immediate, put together', () => {
  assert.equal(immediateLine(decode(0x00628663)), // beq
    '`imm = 0b0000000001100 = 12` (13비트: 맨 아래 비트는 늘 0이라 명령에 없음, Sign-extend)');
  assert.equal(immediateLine(decode(0xffb00293)), '`imm = 0xffb = -5` (12비트, Sign-extend)');
  assert.equal(immediateLine(decode(0x12345e37)), '`imm = 0x12345000` (위 20비트, 아래 12비트는 0)'); // lui t3, 0x12345
  const slli = decode(0x00129293); // slli t0, t0, 1
  assert.equal(meaningOf(slli.fields!.find((f) => f.name === 'shamt')!, slli), '1 bit');
});

// In English (core/lang.ts).
test('in English: the sentences and the immediate', () => {
  const en = (word: number, pc = 0x00400000) => explain(decode(word), regs, pc, 'en').sentence;
  assert.equal(en(0x006283b3), // add t2, t0, t1
    'Adds the value in rs1 (`t0`) and the value in rs2 (`t1`) and puts the sum in rd (`t2`). '
      + 'On overflow it keeps the lower 32 bits; there is no exception.');
  assert.equal(en(0xffb00293), 'Puts imm (`-5`) in rd (`t0`). (This is what the `li` instruction becomes.)');
  assert.equal(en(0xfe512c23), // sw t0, -8(sp)
    'Writes the value in rs2 (`t0`) to the address in rs1 (`sp`) plus offset (`-8`).');
  assert.equal(en(0x00628663, 0x0040000c), // beq t0, t1, +12
    'Branches to address `0x00400018`, PC plus offset (`12`), if the value in rs1 (`t0`) and the value in rs2 (`t1`) are equal.');
  assert.equal(en(0x008000ef, 0x00400010), // jal ra, +8
    'Jumps to address `0x00400018`, PC plus offset (`8`). The address of the next instruction (`0x00400014`) is left in rd (`ra`).');
  // add, li, sw, beq, jal, lui, slli, ecall, ret
  for (const word of [0x006283b3, 0xffb00293, 0xfe512c23, 0x00628663, 0x008000ef, 0x12345e37, 0x00129293, 0x00000073, 0x00008067]) {
    const s = en(word);
    assert.ok(s !== '' && !/[가-힣]/.test(s), s);
    const plain = codeParts(s).filter((p) => !p.code).map((p) => p.text).join('');
    assert.ok(!/0x|\bx\d/.test(plain), plain);
  }
  assert.equal(immediateLine(decode(0xffb00293), undefined, 'en'), '`imm = 0xffb = -5` (12 bits, sign-extended)');
  assert.equal(immediateLine(decode(0x12345e37), undefined, 'en'), '`imm = 0x12345000` (the upper 20 bits; the lower 12 bits are 0)');
});
