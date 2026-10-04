/* The tutorial's steps that are the same for both ISAs, or differ only by a
   register's name or a line of the example (the ISA's steps file passes
   them).  Each ISA's chapters (tutorial/steps.ts, isa/riscv/renderer/
   tutorial-steps.ts) are made of these and of its own.  What they say is
   in messages/tutorial.ts, in both languages. */

import type { Step, Tutorial } from './engine.ts';
import { tr, type Msg } from '../i18n.ts';
import { STEPS } from '../messages/tutorial.ts';
import {
  $, $$, button, gutterAndLine, labelTags, lines, pcLine, pinnedReg, reg, regCells, regShown, scrollIn, statusLead, tab, textOf, trow,
} from './targets.ts';

// A register as the steps name it: its key in the Registers panel and its
// name in the example's code (MIPS: both $t3; RISC-V: x28 and t3).
export interface Reg { key: string; name: string }

// The first line of both examples' code (li $t1, 5 / li t1, 5).
const FIRST = /^\s+li\s+\$?t1, 5\b/;

// The alias the student is asked for.
const ALIAS = 'sum';

// ---- 1 the screen ------------------------------------------------------------------------

export const welcome = (isa: string): Step => ({
  id: 'welcome', kind: 'explain', file: 'tutorial.s', view: 'editor',
  title: () => tr(STEPS.welcome.title),
  body: (t) => tr(STEPS.welcome.body, isa, t.host.narrow()),
  targets: () => [$('.toolbar .runctl'), $('.toolbar .tools')],
  prepare: async (t) => { if (t.host.running()) await t.host.stop(); },
});

export const editor = (): Step => ({
  id: 'editor', kind: 'explain', file: 'tutorial.s', view: 'editor',
  title: () => tr(STEPS.editor.title),
  body: () => tr(STEPS.editor.body),
  targets: (t) => [$('.editor-panel .phead'), lines(t, 1, 6)],
  reveal: (t) => t.host.revealLine(1),
});

// ---- 2 assemble ------------------------------------------------------------------------

export const assemble = (): Step => ({
  id: 'assemble', kind: 'practice', file: 'tutorial.s', view: 'editor', keys: ['Ctrl+S'],
  title: () => tr(STEPS.assemble.title),
  doing: () => tr(STEPS.assemble.doing),
  body: () => tr(STEPS.assemble.body),
  targets: () => [button('assemble')],
  prepare: async (t) => { if (t.host.running()) await t.host.stop(); },
  done: (_t, s) => (s.kind === 'assembled' && s.ok ? 'next' : null),
  result: { view: 'editor',
    title: () => tr(STEPS.assemble.result.title),
    body: () => tr(STEPS.assemble.result.body),
    targets: () => [$('.asm .cells'), statusLead(), $('.status .keys')] },
  skip: async (t) => { await t.host.assemble(); },
});

export const textColumns = (): Step => ({
  id: 'text', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
  title: () => tr(STEPS.text.title),
  body: () => tr(STEPS.text.body),
  // The column heads and the first line of the student's code; the card keeps off the rows.
  targets: (t) => [$('.textpanel .theader'), trow(t.addr(FIRST))],
  avoid: () => [$('.textpanel .text')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); t.column('text', 'word'); },
  reveal: (t) => t.host.revealAddr(t.addr(FIRST)),
});

// ---- 3 one line at a time ------------------------------------------------------------------

export const hexDecBin = (r: Reg, after: RegExp): Step => ({
  id: 'radix', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.radix.title),
  body: () => tr(STEPS.radix.body, r.name),
  targets: () => [...regCells(r.key), $('.regs .colboxes')],
  prepare: async (t) => { await t.atLeast(after); t.column('regs', 'dec'); t.column('regs', 'bin'); },
  reveal: (t) => t.host.revealRegister(r.key),
});

const withoutPin = (t: Tutorial, key: string) => {
  const m = t.host.marks();
  if (m.pins.includes(key)) t.host.setMarks({ ...m, pins: m.pins.filter((k) => k !== key) });
};
const withPin = (t: Tutorial, key: string, alias?: string) => {
  const m = t.host.marks();
  const aliases = m.aliases.filter(([k]) => k !== key);
  if (alias) aliases.push([key, alias]);
  t.host.setMarks({ pins: m.pins.includes(key) ? m.pins : [...m.pins, key], aliases: alias === undefined ? m.aliases : aliases });
};

export const pin = (r: Reg, after: RegExp): Step => ({
  id: 'pin', kind: 'practice', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.pin.title),
  doing: () => tr(STEPS.pin.doing, r.name),
  body: () => tr(STEPS.pin.body, r.name),
  targets: () => [reg(r.key)],
  prepare: async (t) => { await t.atLeast(after); withoutPin(t, r.key); t.reveal($(`.rrow[data-reg="${r.key}"] .star`)); },
  reveal: (t) => t.host.revealRegister(r.key),
  done: (_t, s) => (s.kind === 'pin' && s.key === r.key && s.on ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.pin.result.title),
    body: () => tr(STEPS.pin.result.body, r.name),
    targets: () => [$('.regs .pinblock')] },
  skip: async (t) => { withPin(t, r.key); },
});

export const alias = (r: Reg, after: RegExp): Step => ({
  id: 'alias', kind: 'practice', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.alias.title),
  doing: () => tr(STEPS.alias.doing, ALIAS),
  body: () => tr(STEPS.alias.body, r.name, ALIAS),
  targets: () => [pinnedReg(r.key)],
  prepare: async (t) => {
    await t.atLeast(after);
    withPin(t, r.key, '');
    t.reveal($(`.pinblock .rrow[data-pin="${r.key}"] .alias`));
  },
  done: (_t, s) => (s.kind === 'alias' && s.key === r.key && s.alias !== '' ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.alias.result.title),
    body: (t) => tr(STEPS.alias.result.body, r.name, t.host.marks().aliases.find(([k]) => k === r.key)?.[1] ?? ALIAS),
    targets: () => [pinnedReg(r.key)] },
  skip: async (t) => { withPin(t, r.key, ALIAS); },
});

// ---- 4 memory ------------------------------------------------------------------------------

export const dataTab = (): Step => ({
  id: 'data', kind: 'practice', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.data.title),
  doing: () => tr(STEPS.data.doing),
  body: () => tr(STEPS.data.body),
  targets: () => [tab('Data')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); if (t.host.tab() === 'data') t.host.setTab('text'); },
  done: (_t, s) => (s.kind === 'tab' && s.tab === 'data' ? 'next' : null),
  result: { view: 'run', tab: 'data',
    title: () => tr(STEPS.data.result.title),
    body: () => tr(STEPS.data.result.body),
    targets: () => [labelTags('msg'), labelTags('msg')?.nextElementSibling],
    reveal: () => scrollIn(labelTags('msg')) },
  skip: async (t) => { t.host.setTab('data'); },
});

// ---- 5 running ----------------------------------------------------------------------------

export const breakpoint = (print: RegExp): Step => ({
  id: 'breakpoint', kind: 'practice', file: 'tutorial.s', view: 'editor',
  title: (t) => tr(STEPS.breakpoint.title, t.line(print)),
  doing: (t) => tr(STEPS.breakpoint.doing, t.line(print)),
  body: (t) => tr(STEPS.breakpoint.body, t.line(print)),
  targets: (t) => [gutterAndLine(t, t.line(print))],
  prepare: async (t) => {
    await t.notFinished();
    if (t.host.breakpointLines().includes(t.line(print))) await t.host.setBreakpointLine(t.line(print), false);
  },
  reveal: (t) => t.host.revealLine(t.line(print)),
  done: (t, s) => (s.kind === 'breakpoint' && s.on && s.line === t.line(print) ? 'next' : null),
  skip: async (t) => { await t.host.setBreakpointLine(t.line(print), true); },
});

export const run = (print: RegExp): Step => ({
  id: 'run', kind: 'practice', file: 'tutorial.s', keys: ['F5'],
  title: () => tr(STEPS.run.title),
  doing: () => tr(STEPS.run.doing),
  body: () => tr(STEPS.run.body),
  targets: () => [button('run')],
  prepare: async (t) => {
    await t.notFinished();
    if (!t.host.breakpointLines().includes(t.line(print))) await t.host.setBreakpointLine(t.line(print), true);
    if ((t.host.pc() ?? 0) >= t.addr(print) && (t.host.pc() ?? 0) < 0x80000000) await t.host.restart();
  },
  done: (_t, s) => (s.kind === 'stopped' && (s.reason === 'breakpoint' || s.reason === 'exit') ? 'next' : null),
  result: {
    title: (t) => tr(STEPS.run.result.title, t.host.finished()),
    body: (t) => tr(STEPS.run.result.body, t.host.finished()),
    targets: (t) => [statusLead(), ...(t.host.finished() ? [] : pcLine(t))],
    reveal: (t) => { if (!t.host.narrow() && !t.host.finished()) t.host.revealLine(t.line(print)); } },
  skip: async (t) => { await t.host.run(); },
});

export const slow = (): Step => ({
  id: 'slow', kind: 'practice', file: 'tutorial.s', keys: ['F5'],
  title: () => tr(STEPS.slow.title),
  doing: () => tr(STEPS.slow.doing),
  body: () => tr(STEPS.slow.body),
  targets: () => [$('.speedbox'), button('run')],
  // The Editor's lines are what to watch: the card keeps off them.
  avoid: (t) => (t.host.narrow() ? [] : [$('.editor-panel .cm-scroller')]),
  prepare: async (t) => { await t.notFinished(); },
  done: (_t, s) => (s.kind === 'slow-ended' ? 'next' : null),
  skip: async (t) => { if (t.host.running()) await t.host.stop(); },
  leave: async (t) => { if (t.host.running()) await t.host.stop(); await t.host.setSpeed('fast'); },
});

export const reset = (r: Reg): Step => ({
  id: 'reset', kind: 'practice', file: 'tutorial.s',
  title: () => tr(STEPS.reset.title),
  doing: () => tr(STEPS.reset.doing),
  body: () => tr(STEPS.reset.body),
  targets: () => [button('reset')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  done: (_t, s) => (s.kind === 'reset' ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.reset.result.title),
    body: () => tr(STEPS.reset.result.body, r.name),
    targets: () => [regShown(r.key), statusLead()],
    reveal: (t) => t.host.revealRegister(r.key) },
  skip: async (t) => { await t.host.restart(); },
});

// ---- 6 output and errors ---------------------------------------------------------------------

// `call`: the line that prints msg (its regular expression), and how the step says it (the ISA's messages).
export const console = (call: RegExp, say: Msg, printed: Msg): Step => ({
  id: 'console', kind: 'practice', file: 'tutorial.s', view: 'run', keys: ['F5'],
  title: () => tr(STEPS.console.title),
  doing: () => tr(STEPS.console.doing),
  body: (t) => tr(STEPS.console.body, t.host.narrow(), t.line(call), tr(say)),
  targets: (t) => [...(t.host.narrow() ? [] : [lines(t, t.line(call))]), $('.console')],
  prepare: async (t) => { await t.notFinished(); if (t.host.expandConsole()) t.did.push('console opened'); },
  reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(call)); },
  done: (_t, s) => (s.kind === 'stopped' && (s.reason === 'exit' || s.reason === 'error') ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.console.result.title),
    body: () => tr(STEPS.console.result.body, tr(printed)),
    targets: () => [$('.console .clog'), statusLead()] },
  skip: async (t) => { for (let i = 0; i < 3 && !t.host.finished(); i += 1) await t.host.run(); },
});

export const error = (): Step => ({
  id: 'error', kind: 'practice', file: 'tutorial-error.s', view: 'editor', phases: 2,
  keys: (t) => (t.phase === 0 ? ['Ctrl+S'] : []),
  title: (t) => tr(STEPS.error.title, t.phase),
  doing: (t) => tr(STEPS.error.doing, t.phase, String(t.host.errorLine() ?? '')),
  body: (t) => tr(STEPS.error.body, t.phase, String(t.host.errorLine() ?? '')),
  targets: (t) => (t.phase === 0 ? [button('assemble')]
    : [textOf($('.asm .notice h3')), $('.asm .item'), $('.asm .row .btn')]),
  reveal: () => scrollIn($('.asm .row .btn')),
  // The Editor's line with the error is part of what to look at: the card keeps off it.
  avoid: (t) => { const n = t.host.errorLine(); return t.phase === 1 && n && !t.host.narrow() ? [lines(t, n)] : []; },
  prepare: async (t) => { t.host.showView('editor'); },
  done: (_t, s) => (s.kind === 'assembled' && !s.ok ? 'phase' : s.kind === 'goto' ? 'next' : null),
  skip: async (t) => {
    if (t.phase === 0) { await t.host.assemble(); return; }
    const n = t.host.errorLine();
    if (n) t.host.goToLine(n);
  },
});

// "Go to line N" took the student to the line: show them where they are.
export const fixLine = (): Step => ({
  id: 'fix', kind: 'explain', file: 'tutorial-error.s', view: 'editor',
  prepare: async (t) => {
    if (!t.host.errorLine()) await t.host.assemble();
    const n = t.host.errorLine();
    if (n) t.host.goToLine(n);
  },
  title: () => tr(STEPS.fix.title),
  body: (t) => tr(STEPS.fix.body, String(t.host.errorLine() ?? '')),
  targets: (t) => { const n = t.host.errorLine(); return n ? [lines(t, n)] : []; },
  reveal: (t) => { const n = t.host.errorLine(); if (n) t.host.revealLine(n); },
});

// ---- 7 your own screen ------------------------------------------------------------------------

export const separators = (): Step => ({
  id: 'separators', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.separators.title),
  body: (t) => tr(STEPS.separators.body, t.host.narrow()),
  // The Registers | Text splitter first: the card stands beside it, over Text.
  targets: () => [$('.run-grid > .rsplit'), $('.leftcol > .vgrip'), $('.centre > .vgrip'), $('.split > .splitter'), $('.pane-editor > .vgrip')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
});

export const theme = (): Step => ({
  id: 'theme', kind: 'explain', file: 'tutorial.s',
  title: () => tr(STEPS.theme.title),
  body: () => tr(STEPS.theme.body),
  targets: () => [$('.status .stheme .theme-switch')],
});

export const end = (): Step => ({
  id: 'end', kind: 'end', file: 'tutorial.s',
  // Ends on the example, assembled and whole (not on the error example).
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  title: () => tr(STEPS.end.title),
  body: () => tr(STEPS.end.body),
  targets: () => $$('.toolbar .tools .iconbtn').slice(0, 2),
});
