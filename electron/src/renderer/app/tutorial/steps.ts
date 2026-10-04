/* The MIPS tutorial: seven chapters over src/examples/tutorial.s (and
   tutorial-error.s in chapter 6).  The engine is tutorial/engine.ts; the
   steps both ISAs share, tutorial/common.ts. */

import * as common from './common.ts';
import { tr } from '../i18n.ts';
import { CHAPTERS as NAMES, MIPS, STEPS } from '../messages/tutorial.ts';
import type { Chapter, Step } from './engine.ts';
import { $, $$, button, dataCell, groupBox, lines, scrollGroup, pcLine, reg, scrollIn, sideLine, statusChanged, trow } from './targets.ts';

// The example's lines the steps are about.
const ADD = /^\s+add\s+\$t3/;
const SUB = /^\s+sub\s+\$t4/;
const BIG = /li\s+\$t0, 0x12345678/;
const SW = /^\s+sw\s+\$t3, total/;
const LW = /^\s+lw\s+\$s0, total/;
const PRINT = /^\s+li\s+\$v0, 4\b/;
const SYSCALL = /^\s+syscall/;          // the first: it prints msg
const T3 = { key: '$t3', name: '$t3' };
const stackTag = () => $$('.dtags.dsec-stack').find((e) => e.textContent?.includes('$sp')) ?? null;

const twoWords: Step = {
  id: 'pseudo', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
  title: () => tr(STEPS.pseudo.title),
  body: () => tr(STEPS.pseudo.body, 'li $t0, 0x12345678', 'ori', 16, 16),
  targets: (t) => [...sideLine(t, BIG), trow(t.addr(BIG)), trow(t.addr(BIG) + 4)],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  reveal: (t) => { t.host.revealAddr(t.addr(BIG) + 4); if (!t.host.narrow()) t.host.revealLine(t.line(BIG)); },
};

const registers: Step = {
  id: 'registers', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => tr(MIPS.registers.title),
  body: () => tr(MIPS.registers.body),
  targets: () => [groupBox('Temporaries')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  reveal: () => scrollGroup('Temporaries'),
};

const step: Step = {
  id: 'step', kind: 'practice', file: 'tutorial.s', view: 'editor', keys: ['F10'],
  title: () => tr(STEPS.step.title),
  doing: () => tr(STEPS.step.doing),
  body: () => tr(MIPS.step.body),
  targets: (t) => [button('step'), lines(t, t.line(ADD))],
  prepare: async (t) => { if (t.host.pc() !== t.addr(ADD) || !t.host.assembled()) await t.exactly(ADD); },
  reveal: (t) => t.host.revealLine(t.line(ADD)),
  done: (_t, s) => (s.kind === 'stopped' ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.step.result.title),
    body: (t) => tr(STEPS.step.result.body, '$t3', t.host.narrow()),
    targets: (t) => [reg('$t3'), ...pcLine(t)],
    reveal: (t) => t.host.revealRegister('$t3') },
  skip: async (t) => { await t.host.step(); },
};

const changed: Step = {
  id: 'changed', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.changed.title),
  body: () => tr(MIPS.changed.body),
  targets: () => [reg('$t3'), statusChanged()],
  prepare: async (t) => { if (t.host.pc() !== t.addr(SUB)) await t.exactly(SUB); },
  reveal: (t) => t.host.revealRegister('$t3'),
};

const inspector: Step = {
  id: 'inspector', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text', quietPc: true,
  title: () => tr(STEPS.inspector.title),
  body: () => tr(STEPS.inspector.body),
  targets: () => [$('.insp .ititle'), $('.insp .bitgrid'), $('.insp .phead')],
  prepare: async (t) => { await t.atLeast(SUB); },
  inspect: (t) => t.addr(ADD),
};

const bits: Step = {
  id: 'bits', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text', quietPc: true,
  title: () => tr(STEPS.bits.title),
  body: () => tr(STEPS.bits.body, 'opcode · rs · rt · rd · shamt · funct', document.querySelector('.trow.sel .word')?.textContent ?? ''),
  targets: () => [...['opcode', 'rs', 'rt', 'rd', 'shamt', 'funct'].map((f) => $(`.insp .fbox.f-${f}`)), $('.trow.sel .word')],
  avoid: () => [$('.insp .ihead'), $('.trow.sel')],
  prepare: async (t) => { await t.atLeast(SUB); t.column('text', 'word'); },
  inspect: (t) => t.addr(ADD),
  reveal: (t) => t.host.revealAddr(t.addr(ADD)),
};

const store: Step = {
  id: 'store', kind: 'practice', file: 'tutorial.s', view: 'run', tab: 'data', keys: ['F10'],
  title: () => tr(STEPS.store.title),
  doing: () => tr(MIPS.store.doing),
  body: (t) => tr(MIPS.store.body, t.host.narrow()),
  targets: (t) => [...sideLine(t, SW), dataCell(t, 'total')],
  prepare: async (t) => { await t.between(SW, LW); },
  reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(SW)); scrollIn(dataCell(t, 'total')); },
  done: (t, s) => (s.kind === 'stopped' && ((t.host.pc() ?? 0) >= t.addr(LW) || t.host.finished()) ? 'next' : null),
  result: { view: 'run', tab: 'data',
    title: () => tr(STEPS.store.result.title),
    body: () => tr(STEPS.store.result.body, '$t3'),
    targets: (t) => [dataCell(t, 'total')],
    reveal: (t) => scrollIn(dataCell(t, 'total')) },
  skip: async (t) => { await t.host.runUntil(t.addr(LW)); },
};

const stack: Step = {
  id: 'stack', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'data',
  title: () => tr(STEPS.stack.title, '$sp'),
  body: () => tr(MIPS.stack.body),
  targets: () => [stackTag(), $('.drow.dsec-stack .dval.pointed'), reg('$sp')],
  prepare: async (t) => { await t.between(PRINT, SYSCALL); },
  reveal: (t) => { scrollIn(stackTag()); t.host.revealRegister('$sp'); },
};

export const CHAPTERS: Chapter[] = [
  { title: NAMES.screen, steps: [common.welcome('MIPS'), common.editor()] },
  { title: NAMES.assemble, steps: [common.assemble(), common.textColumns(), twoWords, registers] },
  { title: NAMES.step, steps: [step, changed, common.hexDecBin(T3, SUB), common.pin(T3, SUB), common.alias(T3, SUB), inspector, bits] },
  { title: NAMES.memory, steps: [common.dataTab(), store, stack] },
  { title: NAMES.run, steps: [common.breakpoint(PRINT), common.run(PRINT), common.slow(), common.reset(T3)] },
  { title: NAMES.output, steps: [
    common.console(SYSCALL, MIPS.console.says, MIPS.console.printed),
    common.error(), common.fixLine()] },
  { title: NAMES.screenYours, steps: [common.separators(), common.theme(), common.end()] },
];

