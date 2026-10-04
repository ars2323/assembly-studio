/* src/isa/riscv/core/decoder.ts against RARS itself.

   tests/riscv/core/rars-words.json holds words RARS assembled from
   rars-words.s beside it with what RARS prints for each (its `basic`),
   made through the engine.  The decoder sees the
   word only; its name, its format and its fields (registers and immediate,
   all six formats) must agree with what RARS says the word is.  The
   immediate is checked twice: put together from its scattered pieces
   (immediateParts, what the Inspector draws) and from the spec's formula
   (immediateOf); both must be RARS's number. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { decode, FORMATS, formatOf, immediateOf, immediateParts, reassemble, type ImmediateParts } from '../../../src/isa/riscv/core/decoder.ts';

const words: { code: number; basic: string; line: number }[] =
  JSON.parse(readFileSync(path.join(import.meta.dirname, 'rars-words.json'), 'utf8')).words;

// "addi x10,x0,5" -> name "addi", operands ["x10", "x0", "5"]; "lw x14,0(x2)" -> ["x14", "0", "x2"]
function parse(basic: string): { name: string; ops: string[] } {
  const [name, rest = ''] = basic.trim().split(/\s+/, 2);
  return { name, ops: rest.split(/[,()]/).map((s) => s.trim()).filter(Boolean) };
}
const regNum = (s: string) => Number(/^[xf](\d+)$/.exec(s)?.[1] ?? NaN);
const num = (s: string) => (/^0x/i.test(s) ? parseInt(s, 16) | 0 : Number(s));

export function checkWord(w: { code: number; basic: string }, decoder = decode, parts: (word: number) => ImmediateParts | null = immediateParts): void {
  const d = decoder(w.code);
  const { name, ops } = parse(w.basic);
  assert.equal(d.name, name, `${w.basic}: name`);
  assert.ok(d.known, w.basic);
  if (!d.fields) return;
  assert.equal(reassemble(d), w.code >>> 0, `${w.basic}: fields tile the word`);
  const field = (n: string) => d.fields!.find((f) => f.name === n)?.value;
  // The immediate: from its pieces (what the Inspector draws) and from the formula, the same number.
  const p = parts(w.code);
  const imm = p ? p.value : null;
  if (p) assert.equal(p.value, immediateOf(w.code, d.format), `${w.basic}: the pieces put together = the formula`);
  const reg = (n: string) => field(n);
  switch (d.format) {
    case 'R':
      if (!name.startsWith('f')) assert.deepEqual([reg('rd'), reg('rs1'), reg('rs2')], ops.map(regNum), `${w.basic}: rd rs1 rs2`);
      break;
    case 'I':
      if (['lb', 'lh', 'lw', 'lbu', 'lhu', 'flw', 'fld'].includes(name) && ops.length === 3) {
        // lw x14,0(x2): rd, imm, rs1 (jalr prints as jalr x1,x6,0: rd, rs1, imm, below)
        assert.deepEqual([reg('rd'), imm, reg('rs1')], [regNum(ops[0]), num(ops[1]), regNum(ops[2])], `${w.basic}: rd imm rs1`);
      } else if (['slli', 'srli', 'srai'].includes(name)) {
        assert.deepEqual([reg('rd'), reg('rs1'), reg('shamt')], [regNum(ops[0]), regNum(ops[1]), num(ops[2])], w.basic);
      } else if (ops.length === 3 && !name.startsWith('csr')) {
        assert.deepEqual([reg('rd'), reg('rs1'), imm], [regNum(ops[0]), regNum(ops[1]), num(ops[2])], `${w.basic}: rd rs1 imm`);
      }
      break;
    case 'S': // sw x12,0x000007ff(x8): rs2, imm, rs1
      assert.deepEqual([reg('rs2'), imm, reg('rs1')], [regNum(ops[0]), num(ops[1]), regNum(ops[2])], `${w.basic}: rs2 imm rs1`);
      break;
    case 'B': // beq x10,x11,0xffffff30: rs1, rs2, the offset in bytes
      assert.deepEqual([reg('rs1'), reg('rs2'), imm], [regNum(ops[0]), regNum(ops[1]), num(ops[2])], `${w.basic}: rs1 rs2 offset`);
      break;
    case 'U': // lui x10,0x00012345: rd, the upper 20 bits
      assert.deepEqual([reg('rd'), (imm! >>> 12)], [regNum(ops[0]), num(ops[1]) >>> 0], `${w.basic}: rd imm[31:12]`);
      break;
    case 'J': // jal x1,0xffffff08: rd, the offset in bytes
      assert.deepEqual([reg('rd'), imm], [regNum(ops[0]), num(ops[1])], `${w.basic}: rd offset`);
      break;
  }
}

test('every word RARS assembled: the decoder names it as RARS does, and takes all six formats apart as RARS reads them', () => {
  assert.ok(words.length > 60, 'the corpus is there');
  for (const w of words) checkWord(w);
  const formats = new Set(words.map((w) => formatOf(w.code)));
  for (const f of ['R', 'I', 'S', 'B', 'U', 'J']) assert.ok(formats.has(f as never), `corpus covers ${f}`);
});

test('negative control: a decoder that swaps two names is caught', () => {
  const swapped = (word: number) => {
    const d = decode(word);
    return d.name === 'sub' ? { ...d, name: 'add' } : d;
  };
  assert.throws(() => { for (const w of words) checkWord(w, swapped); }, /name/);
});

test('the corpus sets every bit of every immediate somewhere, each sign, and B/J offsets bit 11 and 12 alone', () => {
  for (const f of ['I', 'S', 'B', 'U', 'J'] as const) {
    const ps = words.map((w) => immediateParts(w.code)).filter((p, i) => p && formatOf(words[i].code) === f) as ImmediateParts[];
    const covered = new Set<number>();
    for (const p of ps) for (const piece of p.pieces) for (let b = piece.immLow; b <= piece.immHigh; b += 1) if ((p.value >>> b) & 1) covered.add(b);
    const wanted = ps[0].pieces.flatMap((piece) => Array.from({ length: piece.immHigh - piece.immLow + 1 }, (_, i) => piece.immLow + i))
      .filter((b) => !((f === 'B' || f === 'J') && b === 1)); // 4-byte aligned code: bit 1 of an offset is 0
    assert.deepEqual(wanted.filter((b) => !covered.has(b)), [], `${f}: immediate bits never 1 in the corpus`);
    if (f !== 'U') assert.ok(ps.some((p) => p.value < 0) && ps.some((p) => p.value > 0), `${f}: both signs`);
  }
});

test('the pieces of B and J: the always-0 lowest bit, and where bit 11 comes from', () => {
  const beq = immediateParts(0x0083d0e3 | 0)!; // bge x7,x8,0x800
  assert.equal(beq.width, 13);
  assert.equal(beq.zeros, 1);
  assert.deepEqual(beq.pieces.find((p) => p.immHigh === 11), { field: 'imm[4:1|11]', wordHigh: 7, wordLow: 7, immHigh: 11, immLow: 11, value: 1 });
  const jal = immediateParts(0x0010046f)!;     // jal x8,0x800
  assert.equal(jal.width, 21);
  assert.deepEqual(jal.pieces.find((p) => p.immHigh === 11), { field: 'imm[20|10:1|11|19:12]', wordHigh: 20, wordLow: 20, immHigh: 11, immLow: 11, value: 1 });
  const lui = immediateParts(0x80000537 | 0)!;  // lui x10,0x80000
  assert.deepEqual([lui.width, lui.zeros, lui.signExtended, lui.value >>> 0], [32, 12, false, 0x80000000]);
  assert.equal(immediateParts(0x00000073), null);  // ecall: no immediate to put together
  assert.equal(immediateParts(0x01f39313), null);  // slli: shamt, a plain field
});

test('negative control: a B decoder that takes imm[11] from bit 8 instead of bit 7 is caught', () => {
  const wrong = (word: number): ImmediateParts | null => {
    const p = immediateParts(word);
    if (!p || formatOf(word) !== 'B') return p;
    const b11 = (word >>> 8) & 1;
    const value = ((p.value & ~(1 << 11)) | (b11 << 11)) << 19 >> 19;
    return { ...p, value };
  };
  assert.throws(() => { for (const w of words) checkWord(w, decode, wrong); }, /pieces put together|offset/);
});

test('every format but R4 is taken apart; a fused multiply-add says so instead', () => {
  assert.deepEqual(Object.keys(FORMATS).sort(), ['B', 'I', 'J', 'R', 'S', 'U']);
  assert.equal(decode(0x00b50543 | 0).format, 'R4'); // fmadd.s
  assert.equal(decode(0x00b50543 | 0).fields, null);
});
