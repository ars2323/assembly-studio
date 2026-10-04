/* The tutorial's steps that are the same for both ISAs, or differ only by a
   register's name or a line of the example (the ISA's steps file passes
   them).  Each ISA's chapters (tutorial/steps.ts, isa/riscv/renderer/
   tutorial-steps.ts) are made of these and of its own.  What they say is
   in messages/tutorial.ts, in both languages. */

import type { Step, Tutorial } from './engine.ts';
import { tr, type Msg } from '../i18n.ts';
import { STEPS } from '../messages/tutorial.ts';
import {
  $, $$, button, gutterAndLine, ifShown, labelTags, lines, pcLine, pinnedReg, reg, regCells, regShown, scrollIn, statusBackIo, statusLead,
  tab, textOf, toolIcons, trow,
} from './targets.ts';

// A register as the steps name it: its key in the Registers panel and its
// name in the example's code (MIPS: both $t3; RISC-V: x28 and t3).
export interface Reg { key: string; name: string }

// The first line of both examples' code (li $t1, 5 / li t1, 5).
export const FIRST = /^\s+li\s+\$?t1, 5\b/;

// The alias the student is asked for.
const ALIAS = 'sum';

// The number the Console step types for the student (Skip), and the one it asks for.
const NUMBER = '30';

// ---- running the example on, quietly (prepare, skip) ----------------------------------------

// Runs on (as F5 does) until the program waits for its line or has ended;
// a red dot on the way is run past.
async function runToInput(t: Tutorial): Promise<void> {
  for (let i = 0; i < 4 && !t.host.waiting() && !t.host.finished(); i += 1) {
    void t.host.run(); // (RISC-V's run is still on its way while it waits for the line)
    await t.until(() => t.host.running(), 300);
    await t.until(() => !t.host.running());
  }
}

// The program run to its end, the number typed when it asks: the Console
// holds its output.  `print`: the line from which it prints and reads.
async function toEnd(t: Tutorial, print: RegExp): Promise<void> {
  if (t.host.finished()) return;
  await t.atLeast(print);
  await runToInput(t);
  if (t.host.waiting()) await t.host.input(NUMBER);
}

// ---- 1 a look around ---------------------------------------------------------------------

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

// ---- 2 assembling ------------------------------------------------------------------------

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

// `kernel`: the ISA's Text has kernel instructions, folded away (MIPS).
export const textColumns = (kernel: boolean): Step => ({
  id: 'text', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
  title: () => tr(STEPS.text.title),
  body: () => tr(STEPS.text.body, kernel),
  // The column heads, the first line of the student's code and the fold
  // line under the list; the card keeps off the rows.
  targets: (t) => [$('.textpanel .theader'), trow(t.addr(FIRST)), ...(kernel ? ifShown($('.textpanel .fold')) : [])],
  avoid: () => [$('.textpanel .text')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); t.column('text', 'word'); },
  reveal: (t) => t.host.revealAddr(t.addr(FIRST)),
});

// ---- 3 one line forward, one back ----------------------------------------------------------

// `add`: the line that has just run (PC on `next`); `r` the register it changed.
export const stepBack = (r: Reg, add: RegExp, next: RegExp): Step => ({
  id: 'stepback', kind: 'practice', file: 'tutorial.s', view: 'run', keys: ['Shift+F10'],
  title: () => tr(STEPS.stepback.title),
  doing: () => tr(STEPS.stepback.doing),
  body: () => tr(STEPS.stepback.body),
  targets: () => [button('stepback'), reg(r.key)],
  // The Editor's lines where the PC line goes back: the card keeps off them.
  avoid: (t) => (t.host.narrow() ? [] : [lines(t, t.line(add), t.line(next))]),
  prepare: async (t) => { if (t.host.pc() !== t.addr(next)) await t.exactly(next); },
  reveal: (t) => t.host.revealRegister(r.key),
  done: (_t, s) => (s.kind === 'back' ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.stepback.result.title),
    body: () => tr(STEPS.stepback.result.body, r.name),
    targets: (t) => [reg(r.key), ...pcLine(t), statusLead()],
    reveal: (t) => { t.host.revealRegister(r.key); if (!t.host.narrow()) t.host.revealLine(t.line(add)); } },
  skip: async (t) => { await t.host.stepBack(); },
});

// ---- 4 Registers and the Inspector -------------------------------------------------------------

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

// A row of Text clicked: the Inspector stays on that instruction (`add`, run already: PC past `after`).
export const inspect = (add: RegExp, after: RegExp): Step => ({
  id: 'inspect', kind: 'practice', file: 'tutorial.s', view: 'run', tab: 'text', quietPc: true,
  title: () => tr(STEPS.inspect.title),
  doing: () => tr(STEPS.inspect.doing),
  body: () => tr(STEPS.inspect.body),
  targets: (t) => [trow(t.addr(add))],
  prepare: async (t) => { await t.atLeast(after); },
  reveal: (t) => t.host.revealAddr(t.addr(add)),
  done: (t, s) => (s.kind === 'select' && s.addr === t.addr(add) ? 'next' : null),
  result: { view: 'run', tab: 'text',
    title: () => tr(STEPS.inspect.result.title),
    body: () => tr(STEPS.inspect.result.body),
    targets: () => [$('.insp .ititle'), $('.insp .bitgrid'), $('.insp .phead')],
    avoid: (t) => [trow(t.addr(add))] },
  skip: async (t) => { t.host.pin(t.addr(add)); },
});

// ---- 5 memory ------------------------------------------------------------------------------

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

// ---- 6 controlling a run ---------------------------------------------------------------------

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
  // The same dot in Text.
  result: { tab: 'text',
    title: () => tr(STEPS.breakpoint.result.title),
    body: () => tr(STEPS.breakpoint.result.body),
    targets: (t) => [...(t.host.narrow() ? [] : [gutterAndLine(t, t.line(print))]), trow(t.addr(print))],
    reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(print)); t.host.revealAddr(t.addr(print)); } },
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

// From before `print` (the program reads nothing on the way), so that the run ends at the red dot or at Esc.
export const slow = (print: RegExp): Step => ({
  id: 'slow', kind: 'practice', file: 'tutorial.s', keys: ['F5'],
  title: () => tr(STEPS.slow.title),
  doing: () => tr(STEPS.slow.doing),
  body: () => tr(STEPS.slow.body),
  targets: () => [$('.speedbox'), button('run')],
  // The Editor's lines are what to watch: the card keeps off them.
  avoid: (t) => (t.host.narrow() ? [] : [$('.editor-panel .cm-scroller')]),
  // From the first line of `main` (MIPS's start-up code is not the Editor's: no PC line there).
  prepare: async (t) => {
    await t.notFinished();
    const pc = t.host.pc() ?? 0;
    if (pc >= t.addr(print) && pc < 0x80000000) await t.host.restart();
    await t.atLeast(FIRST);
  },
  done: (_t, s) => (s.kind === 'slow-ended' ? 'next' : null),
  skip: async (t) => { if (t.host.running()) await t.host.stop(); },
  leave: async (t) => { if (t.host.running()) await t.host.stop(); await t.host.setSpeed('fast'); },
});

// ---- 7 input, output and errors ----------------------------------------------------------------

/* Run, the program prints and waits for a number (phase 0); typed and
   Enter, it adds, prints and ends (phase 1).  `print`: the first line that
   prints; `read`: the line that asks for the number; `says`: how the ISA
   prints and reads (its messages). */
export const consoleIo = (print: RegExp, read: RegExp, says: Msg): Step => ({
  id: 'console', kind: 'practice', file: 'tutorial.s', view: 'run', phases: 2,
  keys: (t) => (t.phase === 0 ? ['F5'] : []),
  title: (t) => tr(STEPS.console.title, t.phase),
  doing: (t) => tr(STEPS.console.doing, t.phase),
  body: (t) => tr(STEPS.console.body, t.phase, tr(says)),
  targets: (t) => (t.phase === 0 ? [button('run'), $('.console')] : [$('.console .cinrow')]),
  // What the program printed is what to read before typing: the card keeps off it.
  avoid: (t) => (t.phase === 1 ? [$('.console .clog')] : []),
  prepare: async (t) => {
    await t.between(print, read);
    if (t.host.expandConsole()) t.did.push('console opened');
  },
  done: (t, s) => (s.kind !== 'stopped' ? null
    : t.phase === 0 ? (s.reason === 'input' ? 'phase' : null)
    : s.reason === 'exit' || s.reason === 'error' ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.console.result.title),
    body: () => tr(STEPS.console.result.body),
    targets: () => [$('.console .clog'), $('.console .phead .hbtn'), statusLead()] },
  skip: async (t) => {
    if (t.phase === 0) await runToInput(t);
    else await t.host.input(NUMBER);
  },
});

// Step back over the end: `exit` (the line that asks for the end) and the
// `call` that printed are undone; the Console keeps what was printed.
export const undoIo = (print: RegExp, exit: string, call: string): Step => ({
  id: 'undo', kind: 'practice', file: 'tutorial.s', view: 'run', keys: ['Shift+F10'],
  title: () => tr(STEPS.undo.title),
  doing: () => tr(STEPS.undo.doing),
  body: () => tr(STEPS.undo.body, exit, call),
  targets: () => [button('stepback'), $('.console .clog')],
  avoid: (t) => (t.host.narrow() ? [] : [$('.editor-panel .cm-scroller')]),
  prepare: async (t) => { await toEnd(t, print); if (t.host.expandConsole()) t.did.push('console opened'); },
  done: (_t, s) => (s.kind === 'back' && s.io ? 'next' : null),
  result: { view: 'run',
    title: () => tr(STEPS.undo.result.title),
    body: () => tr(STEPS.undo.result.body),
    targets: () => [$('.console .clog'), statusBackIo()] },
  skip: async (t) => { for (let i = 0; i < 4 && !statusBackIo(); i += 1) await t.host.stepBack(); },
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

// ---- 8 writing your own --------------------------------------------------------------------------

export const tools = (): Step => ({
  id: 'tools', kind: 'explain', file: 'tutorial.s',
  title: () => tr(STEPS.tools.title),
  body: () => tr(STEPS.tools.body),
  targets: () => toolIcons(),
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
});

export const editing = (): Step => ({
  id: 'editing', kind: 'explain', file: 'tutorial.s', view: 'editor',
  title: () => tr(STEPS.editing.title),
  body: () => tr(STEPS.editing.body),
  targets: (t) => [$('.editor-panel .phead'), lines(t, t.line(FIRST), t.line(FIRST) + 3)],
  reveal: (t) => t.host.revealLine(t.line(FIRST)),
});

// `advanced`: the ISA's Settings has Advanced (MIPS).
export const settings = (advanced: boolean): Step => ({
  id: 'settings', kind: 'explain', file: 'tutorial.s',
  title: () => tr(STEPS.settings.title),
  body: () => tr(STEPS.settings.body, advanced),
  targets: () => toolIcons().slice(-1),
});

export const separators = (): Step => ({
  id: 'separators', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => tr(STEPS.separators.title),
  body: (t) => tr(STEPS.separators.body, t.host.narrow()),
  // The Registers | Text splitter first: the card stands beside it, over Text.
  targets: () => [$('.run-grid > .rsplit'), $('.leftcol > .vgrip'), $('.centre > .vgrip'), $('.split > .splitter'), $('.pane-editor > .vgrip')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
});

export const switches = (): Step => ({
  id: 'switches', kind: 'explain', file: 'tutorial.s',
  title: () => tr(STEPS.switches.title),
  body: () => tr(STEPS.switches.body),
  targets: () => [$('.status .stheme .lang-switch'), $('.status .stheme .theme-switch')],
});

export const end = (): Step => ({
  id: 'end', kind: 'end', file: 'tutorial.s',
  // Ends on the example, assembled and whole (not on the error example).
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  title: () => tr(STEPS.end.title),
  body: () => tr(STEPS.end.body),
  targets: () => $$('.toolbar .tools .iconbtn').slice(0, 2),
});
