/* Step back on the SPIM core (native/src/backstep.h, addon.cc "step
   back"): which memory an instruction may write; the history, at most
   1000 instructions and gone at assemble; and each step back giving the
   machine exactly as it was -- after single steps, after a fast run to a
   breakpoint, at the end of a program, over a read syscall. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { root } from '../helpers/machine.ts';

const iType = (op: number, rs: number, rt: number, imm: number) => ((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const regs = (set: Record<number, number>) => Array.from({ length: 32 }, (_, i) => set[i] ?? 0);
const SYSCALL = 0x0000000c;
const S0 = 16, T0 = 8, V0 = 2, A0 = 4, A1 = 5, A2 = 6;

test('storeSpans: the stores, at base + offset, of their size', () => {
  const r = regs({ [S0]: 0x10010010 });
  const at = (op: number, imm: number) => spim.storeSpans(iType(op, S0, T0, imm), r);
  assert.deepEqual(at(0x28, 3), [{ addr: 0x10010013, size: 1 }]);      // sb
  assert.deepEqual(at(0x29, -2), [{ addr: 0x1001000e, size: 2 }]);     // sh
  assert.deepEqual(at(0x2b, 4), [{ addr: 0x10010014, size: 4 }]);      // sw
  assert.deepEqual(at(0x38, 0), [{ addr: 0x10010010, size: 4 }]);      // sc
  assert.deepEqual(at(0x39, 8), [{ addr: 0x10010018, size: 4 }]);      // swc1
  assert.deepEqual(at(0x3d, -8), [{ addr: 0x10010008, size: 8 }]);     // sdc1
  // swl / swr write part of the aligned word: all of it is kept.
  assert.deepEqual(at(0x2a, 5), [{ addr: 0x10010014, size: 4 }]);      // swl
  assert.deepEqual(at(0x2e, 7), [{ addr: 0x10010014, size: 4 }]);      // swr
  // The offset is signed; the address wraps as the core's does.
  assert.deepEqual(spim.storeSpans(iType(0x2b, 0, T0, -4), regs({})), [{ addr: 0xfffffffc, size: 4 }]);
});

test('storeSpans: no store, no span', () => {
  const r = regs({ [S0]: 0x10010010 });
  for (const op of [0x20, 0x23, 0x24, 0x08, 0x09, 0x0f, 0x31, 0x35]) {   // lb lw lbu addi addiu lui lwc1 ldc1
    assert.deepEqual(spim.storeSpans(iType(op, S0, T0, 4), r), [], `op ${op.toString(16)}`);
  }
  assert.deepEqual(spim.storeSpans(iType(0x3a, S0, T0, 4), r), []);    // swc2: coprocessor 2 raises an exception
  assert.deepEqual(spim.storeSpans(0x01095020, r), []);                 // add $t2, $t0, $t1
  assert.deepEqual(spim.storeSpans(0, r), []);                          // nop
});

test('storeSpans: read_string and read write their buffer; other syscalls nothing', () => {
  assert.deepEqual(spim.storeSpans(SYSCALL, regs({ [V0]: 8, [A0]: 0x10010000, [A1]: 20 })), [{ addr: 0x10010000, size: 20 }]);
  assert.deepEqual(spim.storeSpans(SYSCALL, regs({ [V0]: 14, [A0]: 3, [A1]: 0x10010040, [A2]: 16 })), [{ addr: 0x10010040, size: 16 }]);
  assert.deepEqual(spim.storeSpans(SYSCALL, regs({ [V0]: 8, [A0]: 0x10010000, [A1]: 0 })), []);   // nothing to read into
  assert.deepEqual(spim.storeSpans(SYSCALL, regs({ [V0]: 8, [A0]: 0x10010000, [A1]: -1 })), []);
  for (const v0 of [1, 4, 5, 9, 10, 11, 12, 17]) {
    assert.deepEqual(spim.storeSpans(SYSCALL, regs({ [V0]: v0, [A0]: 0x10010000, [A1]: 8, [A2]: 8 })), [], `syscall ${v0}`);
  }
});

// ---- the machine ----------------------------------------------------------------------------

const sample = (name: string) => readFileSync(path.join(root, 'tests/samples', name), 'utf8');

// Registers, the user data segment's first words and the stack in use.
function state(): string {
  const r = spim.registers();
  const s = spim.segments();
  const sp = r.general[29] >>> 0;
  const from = sp >= s.stackBot && sp < s.stackTop ? Math.max(s.stackBot, (sp - 64) & ~3) : s.stackTop - 64;
  return JSON.stringify({ r, data: spim.readWords(s.dataBot, 64), stack: spim.readWords(from, (s.stackTop - from) / 4) });
}

function assemble(source: string, machine?: Partial<spim.MachineOptions>): void {
  const a = spim.assemble(source, { machine });
  assert.ok(a.ok, a.errors.join('\n'));
}

// Steps until the program stops, the state before each step, and the state at the end.
function stepThrough(max = 100_000): { states: string[]; end: string; why: spim.RunStop } {
  const states: string[] = [];
  spim.run(0, 'each'); // the program started: PC at its start
  let why: spim.RunStop = 'limit';
  for (let i = 0; i < max && why === 'limit'; i += 1) {
    states.push(state());
    why = spim.run(1, 'each');
  }
  return { states, end: state(), why };
}

function backThrough(states: string[], label: string): number {
  let n = 0;
  for (let i = states.length - 1; i >= 0; i -= 1) {
    const b = spim.backstep();
    if (!b.undone) break;
    assert.equal(state(), states[i], `${label}: back ${n + 1}, before step ${i + 1}`);
    n += 1;
  }
  return n;
}

test('each step undone gives the machine as it was before it (lab04-ok.s, stores-loop.s)', () => {
  for (const name of ['lab04-ok.s', 'stores-loop.s']) {
    assemble(sample(name));
    const { states, why } = stepThrough();
    assert.equal(why, 'exit', name);
    assert.ok(states.length < 1000, name);
    assert.equal(spim.history().depth, states.length, name);
    assert.equal(backThrough(states, name), states.length, name);
    assert.equal(spim.backstep().undone, false, `${name}: nothing more`);
  }
});

test('the end of a program is undone too, and it runs on again from there', () => {
  assemble(sample('stores-loop.s'));
  const { states, end } = stepThrough();
  // Back over exit: PC on the exit syscall, the program no longer over.
  assert.equal(spim.backstep().undone, true);
  assert.equal(state(), states[states.length - 1]);
  assert.equal(spim.run(1, 'each'), 'exit');
  assert.equal(state(), end);
  assert.equal(spim.consoleOutput().length > 0, true);
});

test('the history keeps the last 1000 instructions; assemble and an unrecorded run drop it', () => {
  const loop = '        .data\nx: .word 0\n        .text\nmain:   li $t0, 0\nloop:   addiu $t0, $t0, 1\n        sw $t0, x\n        blt $t0, 2000, loop\n        li $v0, 10\n        syscall\n';
  assemble(loop);
  spim.run(1200, 'each');
  assert.deepEqual(spim.history(), { depth: 1000, limit: 1000, possible: true });
  const before = spim.registers();
  for (let i = 0; i < 1000; i += 1) assert.equal(spim.backstep().undone, true, `back ${i + 1}`);
  assert.equal(spim.backstep().undone, false);
  assert.equal(spim.history().depth, 0);
  assert.notDeepEqual(spim.registers(), before);
  spim.run(5, 'each');
  assert.equal(spim.history().depth, 5);
  spim.run(5, 'off');
  assert.equal(spim.history().depth, 0);
  spim.run(5, 'each');
  assemble(loop);
  assert.equal(spim.history().depth, 0);
});

test('after a fast run to a breakpoint, step back retraces the run exactly', () => {
  const source = sample('stores-loop.s');
  const findDone = () => spim.textSegment().find((w) => /;\s*\d+: lw\s+\$a0, sum/.test(w.line))!.addr;
  // The reference: the same program stepped to the breakpoint.
  assemble(source);
  assert.ok(spim.setBreakpoint(findDone()));
  const { states, end, why } = stepThrough();
  assert.equal(why, 'breakpoint');
  // The run, in the window's slices of 10000.
  assemble(source);
  spim.setBreakpoint(findDone());
  let stop: spim.RunStop = 'limit';
  while (stop === 'limit') stop = spim.run(10_000, 'slice');
  assert.equal(stop, 'breakpoint');
  assert.equal(state(), end);
  // The last state is the breakpoint's, whose instruction has not run.
  assert.equal(spim.history().depth, states.length - 1);
  assert.equal(backThrough(states.slice(0, -1), 'run'), states.length - 1);
  // From there on it runs as before: to the same breakpoint.
  while ((stop = spim.run(10_000, 'slice')) === 'limit');
  assert.equal(stop, 'breakpoint');
  assert.equal(state(), end);
});

test('a long run stopped between slices keeps its last 1000 instructions', () => {
  const loop = '        .data\nx: .word 0\n        .text\nmain:   li $t0, 0\nloop:   addiu $t0, $t0, 1\n        sw $t0, x\n        b loop\n';
  // The reference: 30000 instructions, the last 1000 stepped.
  assemble(loop);
  spim.run(29_000, 'off');
  const states: string[] = [];
  for (let i = 0; i < 1000; i += 1) { states.push(state()); spim.run(1, 'each'); }
  const end = state();
  // The run: three slices, then the user's stop.
  assemble(loop);
  for (let i = 0; i < 3; i += 1) assert.equal(spim.run(10_000, 'slice'), 'limit');
  assert.equal(spim.history().depth, 0); // not yet
  spim.settleHistory();
  assert.equal(state(), end);
  assert.equal(spim.history().depth, 1000);
  assert.equal(backThrough(states, 'stopped run'), 1000);
});

test('a run that stops early in a slice reaches back into the slice before it', () => {
  const loop = '        .data\nx: .word 0\n        .text\nmain:   li $t0, 0\nloop:   addiu $t0, $t0, 1\n        sw $t0, x\n        blt $t0, 2500, loop\nend:    li $v0, 10\n        syscall\n';
  assemble(loop);
  // The reference: the last 1000 instructions stepped.
  const { states } = stepThrough();
  assert.ok(states.length > 10_000 && states.length < 20_000, `${states.length}`); // it ends in the run's second slice
  // The run.
  assemble(loop);
  let stop: spim.RunStop;
  let slices = 0;
  while ((stop = spim.run(10_000, 'slice')) === 'limit') slices += 1;
  assert.equal(stop, 'exit');
  assert.equal(slices, 1);
  assert.equal(spim.history().depth, 1000);
  assert.equal(backThrough(states.slice(-1000), 'into the slice before'), 1000);
  assert.equal(spim.backstep().undone, false);
});

test('a run that grows the heap (sbrk) on its way to a breakpoint keeps its history', () => {
  const source = '        .text\nmain:   li $a0, 64\n        li $v0, 9\n        syscall\n        li $t0, 0x1234\n        sw $t0, 8($v0)\n        lw $t1, 8($v0)\nstop:   li $v0, 10\n        syscall\n';
  const stopAt = () => spim.textSegment().find((w) => /;\s*\d+: li\s+\$v0, 10/.test(w.line))!.addr;
  assemble(source);
  spim.setBreakpoint(stopAt());
  const { states, end } = stepThrough();
  assemble(source);
  spim.setBreakpoint(stopAt());
  assert.equal(spim.run(10_000, 'slice'), 'breakpoint');
  assert.equal(state(), end);
  assert.equal(spim.history().depth, states.length - 1);
  const heap = spim.registers().general[2];
  assert.equal(spim.readWords(heap + 8, 1)[0], 0x1234);
  assert.equal(backThrough(states.slice(0, -1), 'sbrk'), states.length - 1);
  assert.equal(spim.readWords(heap + 8, 1)[0], 0); // the store undone; the memory sbrk added stays
});

test('over a read syscall: its registers and buffer come back, the input stays read', () => {
  const source = '        .data\nbuf: .space 16\n        .text\nmain:   la $a0, buf\n        li $a1, 16\n        li $v0, 8\n        syscall\n        li $v0, 10\n        syscall\n';
  assemble(source);
  spim.run(0, 'each');
  while (spim.run(1, 'each') === 'limit' && spim.registers().general[2] !== 8);
  const before = state();
  assert.equal(spim.run(1, 'each'), 'input'); // no input yet: nothing ran, nothing recorded
  assert.equal(state(), before);
  const depth = spim.history().depth;
  spim.provideInput('hello\n');
  assert.equal(spim.run(1, 'each'), 'limit');
  assert.equal(spim.history().depth, depth + 1);
  assert.notEqual(state(), before);
  const b = spim.backstep();
  assert.deepEqual(b, { undone: true, io: true });
  assert.equal(state(), before);
  // The line was taken: the syscall asks again.
  assert.equal(spim.run(1, 'each'), 'input');
});

test('with delayed loads there is no history', () => {
  assemble(sample('lab04-ok.s'), { delayedLoads: true });
  spim.run(5, 'each');
  assert.deepEqual(spim.history(), { depth: 0, limit: 1000, possible: false });
  assert.equal(spim.backstep().undone, false);
});

test('with delayed branches the branch and its delay slot are one step, undone together', () => {
  const source = '        .data\nx: .word 7\n        .text\nmain:   la $s0, x\n        li $t0, 5\n        b next\n        sw $t0, 0($s0)\nnext:   li $v0, 10\n        syscall\n';
  assemble(source, { delayedBranches: true });
  const { states, why } = stepThrough();
  assert.equal(why, 'exit');
  assert.equal(backThrough(states, 'delayed'), states.length);
});
