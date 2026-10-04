/* The RISC-V tutorial: eight chapters over src/isa/riscv/examples/
   tutorial.s (and tutorial-error.s in chapter 7).  The engine is
   renderer/app/tutorial/engine.ts; the steps both ISAs share,
   renderer/app/tutorial/common.ts.  The Registers panel knows a register
   by its number (x28), the code by its name (t3): the steps name both. */

import * as common from '../../../renderer/app/tutorial/common.ts';
import { tr } from '../../../renderer/app/i18n.ts';
import { CHAPTERS as NAMES, RISCV, STEPS } from '../../../renderer/app/messages/tutorial.ts';
import type { Chapter, Step } from '../../../renderer/app/tutorial/engine.ts';
import {
  $, $$, button, dataCell, ifShown, lines, pcLine, reg, scrollIn, sideLine, statusChanged, trow,
} from '../../../renderer/app/tutorial/targets.ts';

// The example's lines the steps are about.
const ADD = /^\s+add\s+t3, t1, t2/;
const SUB = /^\s+sub\s+t4/;
const BIG = /li\s+t0, 0x12345678/;
const SW = /^\s+sw\s+t3, 0\(a1\)/;
const LW = /^\s+lw\s+s0, 0\(a1\)/;
const PRINT = /^\s+li\s+a7, 4\b/;
const ECALL = /^\s+ecall/;              // the first: it prints msg
const READ = /^\s+li\s+a7, 5\b/;
// (For the tests: each is one line of the example, in both languages.)
export const LINES = { ADD, SUB, BIG, SW, LW, PRINT, ECALL, READ };
const T3 = { key: 'x28', name: 't3' };
const SP = 'x2';
const stackTag = () => $$('.dtags.dsec-stack').find((e) => /\bsp\b/.test(e.textContent ?? '')) ?? null;
const radixBoxes = () => $('.textpanel [role=radiogroup]');

const twoWords: Step = {
  id: 'pseudo', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
  title: () => tr(STEPS.pseudo.title),
  body: () => tr(STEPS.pseudo.body, 'li t0, 0x12345678', 'addi', 20, 12),
  targets: (t) => [...sideLine(t, BIG), trow(t.addr(BIG)), trow(t.addr(BIG) + 4)],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  reveal: (t) => { t.host.revealAddr(t.addr(BIG) + 4); if (!t.host.narrow()) t.host.revealLine(t.line(BIG)); },
};

const registers: Step = {
  id: 'registers', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => tr(RISCV.registers.title),
  body: () => tr(RISCV.registers.body),
  targets: () => [reg('x5'), ...ifShown($('.regs .fold'))],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  reveal: () => scrollIn(reg('x5')),
};

const step: Step = {
  id: 'step', kind: 'practice', file: 'tutorial.s', view: 'editor', keys: ['F10'],
  title: () => tr(STEPS.step.title),
  doing: () => tr(STEPS.step.doing),
  body: () => tr(RISCV.step.body),
  targets: (t) => [button('step'), lines(t, t.line(ADD))],
  prepare: async (t) => { if (t.host.pc() !== t.addr(ADD) || !t.host.assembled()) await t.exactly(ADD); },
  reveal: (t) => t.host.revealLine(t.line(ADD)),
  done: (_t, s) => (s.kind === 'stopped' ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.step.result.title),
    body: (t) => tr(STEPS.step.result.body, 'x28 t3', t.host.narrow()),
    targets: (t) => [reg(T3.key), ...pcLine(t)],
    reveal: (t) => t.host.revealRegister(T3.key) },
  skip: async (t) => { await t.host.step(); },
};

const changed: Step = {
  id: 'changed', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.changed.title),
  body: () => tr(RISCV.changed.body),
  targets: () => [reg(T3.key), statusChanged()],
  prepare: async (t) => { if (t.host.pc() !== t.addr(SUB)) await t.exactly(SUB); },
  reveal: (t) => t.host.revealRegister(T3.key),
};

const bits: Step = {
  id: 'bits', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text', quietPc: true,
  title: () => tr(STEPS.bits.title),
  body: () => tr(STEPS.bits.body, 'funct7 · rs2 · rs1 · funct3 · rd · opcode', document.querySelector('.trow.sel .word')?.textContent ?? ''),
  targets: () => [...['funct7', 'rs2', 'rs1', 'funct3', 'rd', 'opcode'].map((f) => $(`.insp .fbox.f-${f}`)), $('.trow.sel .word')],
  avoid: () => [$('.insp .ihead'), $('.trow.sel')],
  prepare: async (t) => { await t.atLeast(SUB); t.column('text', 'word'); },
  inspect: (t) => t.addr(ADD),
  reveal: (t) => t.host.revealAddr(t.addr(ADD)),
};

const store: Step = {
  id: 'store', kind: 'practice', file: 'tutorial.s', view: 'run', tab: 'data', keys: ['F10'],
  title: () => tr(STEPS.store.title),
  doing: () => tr(RISCV.store.doing),
  body: (t) => tr(RISCV.store.body, t.host.narrow()),
  targets: (t) => [...sideLine(t, SW), dataCell(t, 'total')],
  prepare: async (t) => { await t.between(SW, LW); },
  reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(SW)); scrollIn(dataCell(t, 'total')); },
  done: (t, s) => (s.kind === 'stopped' && ((t.host.pc() ?? 0) >= t.addr(LW) || t.host.finished()) ? 'next' : null),
  result: { view: 'run', tab: 'data',
    title: () => tr(STEPS.store.result.title),
    body: () => tr(STEPS.store.result.body, 't3'),
    targets: (t) => [dataCell(t, 'total'), radixBoxes()],
    reveal: (t) => scrollIn(dataCell(t, 'total')) },
  skip: async (t) => { await t.host.runUntil(t.addr(LW)); },
};

const stack: Step = {
  id: 'stack', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'data',
  title: () => tr(STEPS.stack.title, 'sp'),
  body: () => tr(RISCV.stack.body),
  targets: () => [stackTag(), $('.drow.dsec-stack .dval.pointed'), reg(SP)],
  prepare: async (t) => { await t.between(PRINT, ECALL); },
  reveal: (t) => { scrollIn(stackTag()); t.host.revealRegister(SP); },
};

export const CHAPTERS: Chapter[] = [
  { title: NAMES.screen, steps: [common.welcome('RISC-V'), common.editor()] },
  { title: NAMES.assemble, steps: [common.assemble(), common.textColumns(false), twoWords, registers] },
  { title: NAMES.step, steps: [step, changed, common.stepBack(T3, ADD, SUB)] },
  { title: NAMES.registers, steps: [common.hexDecBin(T3, SUB), common.pin(T3, SUB), common.alias(T3, SUB), common.inspect(ADD, SUB), bits] },
  { title: NAMES.memory, steps: [common.dataTab(), store, stack] },
  { title: NAMES.run, steps: [common.breakpoint(PRINT), common.run(PRINT), common.reset(T3), common.slow(PRINT)] },
  { title: NAMES.io, steps: [
    common.consoleIo(PRINT, READ, RISCV.console.says), common.undoIo(PRINT, 'li a7, 10', 'ecall'),
    common.error(), common.fixLine()] },
  { title: NAMES.yours, steps: [common.tools(), common.editing(), common.settings(false), common.separators(), common.switches(), common.end()] },
];
