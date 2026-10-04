/* The Assemble panel's body, under the Editor: what the last assemble did
   (both windows, MIPS and RISC-V; app.ts says which and when).

     fresh       [Not assembled]                      and what Ctrl+S will do
     busy        [Assembling…]                         (only one that takes a while)
     assembled   [Assembled | 14 instructions | Saved | 12:55:59]
                 and, once the code has changed since, that Run still uses it
     errors      [2 errors | Not assembled | 12:55:59] what to do, the list
                 (each error: its line, the message, the line's text, a hint),
                 a button to the first error's line

   The first cell is the state, in its colour (cells.ts, app.css "cells").
   The error list keeps the classes the tutorial points at (.notice h3,
   .item, .row .btn). */

import { ago, cell, count, lead, plural } from '../cells.ts';
import { code, codeText, h, withHex } from '../dom.ts';

const ctrlS = () => h('kbd', {}, 'Ctrl+S');
const saveCell = (note: string, warn: boolean) => (note ? cell(warn ? 'warn' : '', note) : null);

export function freshState(saves: boolean, saveNote: string, saveWarn: boolean): HTMLElement {
  return h('div', { class: 'asm-state' },
    h('div', { class: 'cells' }, lead('idle', 'Not assembled'), saveCell(saveNote, saveWarn)),
    h('p', { class: 'asm-note' }, 'Press ', ctrlS(), ` to ${saves ? 'save and ' : ''}assemble. The result and any errors show up here.`));
}

export function busyState(): HTMLElement {
  return h('div', { class: 'asm-state' }, h('div', { class: 'cells' }, lead('run', 'Assembling…')));
}

export function assembledState(o: { instructions: number; at: Date; saveNote: string; saveWarn: boolean; edited: boolean }): HTMLElement {
  return h('div', { class: 'asm-state' },
    h('div', { class: 'cells' }, lead('ok', 'Assembled'), cell('', count(o.instructions, 'instruction')),
      saveCell(o.saveNote, o.saveWarn), cell('time', ago(o.at))),
    o.edited ? h('p', { class: 'asm-note warn' }, 'Edited since. Run and Step use this assembled code until you press ', ctrlS(), '.') : null);
}

export interface AsmError {
  line: number;     // the Editor's, 0 if none
  message: string;  // the assembler's own words
  source: string;   // the line's text, '' if none
  hint: string;     // what to do (near-miss.ts), `code` in backticks; '' if nothing
}

export function errorList(o: {
  errors: AsmError[];
  at: Date | null;     // when that assemble was
  kept: boolean;       // a program is in the machine still (the Run side shows it)
  narrow: boolean;     // Editor and Run are tabs
  goTo(line: number): void;
  toEditor(): void;
}): HTMLElement {
  const first = o.errors.find((e) => e.line > 0) ?? o.errors[0];
  const go = h('button', { class: 'btn primary', type: 'button' }, first.line ? `Go to line ${first.line}` : 'Go to the Editor');
  go.addEventListener('click', () => (first.line ? o.goTo(first.line) : o.toEditor()));
  const items = o.errors.map((e) => {
    const where = h('button', { class: 'linkbtn line', type: 'button', disabled: !e.line, title: e.line ? `Go to line ${e.line}` : undefined },
      e.line ? `Line ${e.line}` : '');
    where.addEventListener('click', () => { if (e.line) o.goTo(e.line); });
    return h('div', { class: 'item' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '!'), where,
      h('span', { class: 'msg' },
        h('span', { class: 'what' }, withHex(e.message)),
        e.source ? code(e.source, 'src') : null,
        e.hint ? h('span', { class: 'hint' }, codeText(e.hint)) : null));
  });
  // The state, what to do, the errors each with its line; the button goes
  // to the first.  With a program in the machine, it is still there.
  const n = o.errors.length;
  return h('div', { class: 'notice-host' }, h('div', { class: 'notice' }, h('div', { class: 'say' },
    h('h3', { class: 'cells' }, lead('err', plural(n, 'error')), cell('', o.kept ? 'Last program kept' : 'Not assembled'),
      o.at ? cell('time', ago(o.at)) : null),
    h('p', { class: 'asm-note' }, n > 1 ? 'Fix them from the top, then press ' : 'Fix the line below, then press ', ctrlS(), ' again.',
      o.kept ? ` The ${o.narrow ? 'Run tab' : 'Run side'} still shows the last program that assembled.` : ''),
    h('div', { class: 'items' }, ...items),
    h('div', { class: 'row' }, go))));
}
