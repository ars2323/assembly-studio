/* src/isa/riscv/core/image.ts: a RISC-V program's image from the engine's
   answers.  The answers here are the shapes RarsProbe gives
   (docs/engine-protocol.md 5.2, 5.8, 5.9), values as RARS 1.6 gave them. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ImageError } from '../../../src/core/asx.ts';
import {
  DATA_END_LABEL, dataScanRange, endianOf, hexBytes, RARS, riscvImage, splitDataEnd, withDataEnd, type RiscvReads,
} from '../../../src/isa/riscv/core/image.ts';
import type { Symbol, TextWord } from '../../../src/isa/riscv/sim/protocol.ts';

const word = (addr: number, code: number): TextWord => ({ addr, code, basic: '', line: 1, src: '' });
const sym = (name: string, addr: number, segment: 'text' | 'data', global = false): Symbol => ({ name, addr, segment, global });
const x = Array.from({ length: 32 }, (_, i) => (i === 2 ? 0x7fffeffc : i === 3 ? 0x10008000 : 0));

function reads(over: Partial<RiscvReads>): RiscvReads {
  const from = RARS.dataSegmentBase;
  return {
    pc: RARS.textBase, text: [word(0x00400000, 0x00000013)], symbols: [], dataEnd: null, x, endian: 'little',
    memory: { from, bytes: new Uint8Array(RARS.heapBase - from) }, ...over,
  };
}
// Memory from the data segment's base with these bytes put at these addresses.
function memory(at: Record<number, number[]>): RiscvReads['memory'] {
  const from = RARS.dataSegmentBase;
  const bytes = new Uint8Array(RARS.heapBase - from);
  for (const [a, bs] of Object.entries(at)) bytes.set(bs, Number(a) - from);
  return { from, bytes };
}

test('the label goes after the program, on lines of its own', () => {
  const src = 'main: nop';
  assert.equal(withDataEnd(src), `main: nop\n.data\n${DATA_END_LABEL}:\n`);
  assert.equal(withDataEnd(src).split('\n')[0], src); // the program's lines keep their numbers
});

test('splitDataEnd: the appended label is taken out, a program\'s own is not', () => {
  const symbols = [sym('result', 0x10010000, 'data'), sym(DATA_END_LABEL, 0x10010004, 'data'), sym('main', 0x00400000, 'text', true)];
  assert.deepEqual(splitDataEnd(symbols, true), { symbols: [symbols[0], symbols[2]], dataEnd: 0x10010004 });
  assert.deepEqual(splitDataEnd(symbols, false), { symbols, dataEnd: null });
});

test('bytes and byte order', () => {
  assert.deepEqual([...hexBytes('04030201ff')], [4, 3, 2, 1, 255]);
  assert.equal(endianOf([4, 3, 2, 1]), 'little');
  assert.equal(endianOf([1, 2, 3, 4]), 'big');
  assert.throws(() => endianOf([0, 0, 0, 0]));
});

test('scan range: the data segment to the heap, widened to labels and the next datum', () => {
  assert.deepEqual(dataScanRange([], null), { from: 0x10000000, to: 0x10040000 });
  assert.deepEqual(dataScanRange([sym('far', 0x10050000, 'data'), sym('main', 0x00400000, 'text')], 0x10050010),
    { from: 0x10000000, to: 0x10050010 });
});

test('lab04: text words, entry, sp and gp, one data word, labels by address', () => {
  // tests/riscv/samples/lab04-ok.s as RARS assembles it (first and last words).
  const text = [word(0x00400000, -252644681), word(0x00400004, 0x0f028293), word(0x00400050, 0x00000073)];
  const img = riscvImage(reads({
    text,
    symbols: [sym('result', 0x10010000, 'data'), sym('main', 0x00400000, 'text', true)],
    dataEnd: 0x10010004,
  }));
  assert.equal(img.isa, 'riscv');
  assert.equal(img.endian, 'little');
  assert.equal(img.entry, 0x00400000);
  assert.deepEqual(img.regs, [{ name: 'sp', value: 0x7fffeffc }, { name: 'gp', value: 0x10008000 }]);
  assert.equal(img.text.addr, 0x00400000);
  assert.equal(img.text.words.length, 0x54 / 4);
  assert.equal(img.text.words[0], 0xf0f0f2b7);   // unsigned
  assert.equal(img.text.words[1], 0x0f028293);
  assert.ok(img.text.words.slice(2, -1).every((w) => w === 0)); // the gap left between the given words
  assert.equal(img.text.words[0x50 / 4], 0x00000073);
  assert.deepEqual(img.data, { addr: 0x10010000, bytes: new Uint8Array(4) }); // .word 0: allocated, all zero
  assert.deepEqual(img.symbols, [{ name: 'main', addr: 0x00400000 }, { name: 'result', addr: 0x10010000 }]);
});

test('data: to the next datum (a trailing .space), to the last byte that is not zero, down to .extern', () => {
  const symbols = [sym('buf', 0x10010000, 'data'), sym('b2', 0x10010028, 'data'), sym('last', 0x1001002b, 'data')];
  const mem = memory({ 0x10010028: [1, 2, 3] });
  // The next datum after `last: .space 6`.
  let img = riscvImage(reads({ symbols, dataEnd: 0x10010031, memory: mem }));
  assert.equal(img.data?.addr, 0x10010000);
  assert.equal(img.data?.bytes.length, 0x31);
  assert.deepEqual([...img.data!.bytes.subarray(0x28, 0x2b)], [1, 2, 3]);
  // No label appended (the program had one of that name): up to the last label or byte.
  img = riscvImage(reads({ symbols, memory: mem }));
  assert.equal(img.data?.bytes.length, 0x2b);
  // A byte above everything the labels say.
  img = riscvImage(reads({ symbols: [], memory: memory({ 0x10010100: [9] }) }));
  assert.deepEqual([img.data?.addr, img.data?.bytes.length, img.data?.bytes.at(-1)], [0x10010000, 0x101, 9]);
  // .extern: its label is below .data, in the scan range.
  img = riscvImage(reads({ symbols: [sym('ext', 0x10000000, 'data', true), ...symbols], dataEnd: 0x10010031, memory: mem }));
  assert.equal(img.data?.addr, 0x10000000);
  assert.equal(img.data?.bytes.length, 0x10031);
  assert.equal(img.data?.bytes[0x10028], 1);
});

test('no data at all: no .data', () => {
  assert.equal(riscvImage(reads({ dataEnd: 0x10010000 })).data, null);
  assert.equal(riscvImage(reads({})).data, null);
});

test('text that does not start at the start address: the image starts at the entry', () => {
  const img = riscvImage(reads({ text: [word(0x00400100, 0x00000013)] }));
  assert.equal(img.entry, 0x00400000);
  assert.equal(img.text.addr, 0x00400000);
  assert.equal(img.text.words.length, 0x41);
  assert.equal(img.text.words[0x40], 0x13);
});

test('a program with no instructions has no image', () => {
  assert.throws(() => riscvImage(reads({ text: [] })), ImageError);
});

test('symbols: local and global, by address then name', () => {
  const img = riscvImage(reads({
    symbols: [sym('loop', 0x00400008, 'text'), sym('b', 0x10010000, 'data'), sym('main', 0x00400000, 'text', true), sym('a', 0x10010000, 'data')],
  }));
  assert.deepEqual(img.symbols.map((s) => s.name), ['main', 'loop', 'a', 'b']);
});
