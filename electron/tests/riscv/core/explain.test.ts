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
    sentence: '`x5`(`t0`) 값(`0xfffffffb`)과 `x6`(`t1`) 값(`0x00000005`)을 더해 `x7`(`t2`) 레지스터에 넣습니다. '
      + 'Overflow가 나도 Exception 없이 아래 32비트만 남깁니다.',
  });
  assert.equal(at(0xffb00293).sentence, // addi t0, zero, -5 (li)
    'Immediate 값(`-5`)을 `x5`(`t0`) 레지스터에 넣습니다. (`li` 명령이 이렇게 바뀝니다.)');
  assert.equal(at(0xfe512c23).sentence, // sw t0, -8(sp)
    '`x5`(`t0`) 값(`0xfffffffb`)의 Word를 `x2`(`sp`) 값(`0x7fffeffc`)에 Offset(`-8`)을 더한 `0x7fffeff4` 주소에 씁니다.');
  assert.equal(at(0x00628663, 0x0040000c).sentence, // beq t0, t1, +12
    '`x5`(`t0`) 값(`0xfffffffb`)과 `x6`(`t1`) 값(`0x00000005`)이 같으면 `0x00400018` 주소(PC + Offset `12`)로 Branch합니다. '
      + '지금 값으로는 Branch하지 않고 다음 명령으로 갑니다.');
  assert.equal(at(0x008000ef, 0x00400010).sentence, // jal ra, +8
    '`0x00400018` 주소(PC + Offset `8`)로 Jump합니다. 다음 명령의 주소(`0x00400014`)를 `x1`(`ra`) 레지스터에 남깁니다.');
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
    'Adds `x5` (`t0`, `0xfffffffb`) and `x6` (`t1`, `0x00000005`) and puts the sum in `x7` (`t2`). '
      + 'On overflow it keeps the lower 32 bits; there is no exception.');
  assert.equal(en(0xffb00293), 'Puts the immediate (`-5`) in `x5` (`t0`). (This is what the `li` instruction becomes.)');
  assert.equal(en(0xfe512c23), // sw t0, -8(sp)
    'Writes the word of `x5` (`t0`, `0xfffffffb`) to `x2` (`sp`, `0x7fffeffc`) + offset `-8` = `0x7fffeff4`.');
  assert.equal(en(0x00628663, 0x0040000c), // beq t0, t1, +12
    'Branches to address `0x00400018` (PC + offset `12`) if `x5` (`t0`, `0xfffffffb`) and `x6` (`t1`, `0x00000005`) are equal. '
      + 'With the values now, it does not branch and goes on to the next instruction.');
  assert.equal(en(0x008000ef, 0x00400010), // jal ra, +8
    'Jumps to address `0x00400018` (PC + offset `8`). The address of the next instruction (`0x00400014`) is left in `x1` (`ra`).');
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
