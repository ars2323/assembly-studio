/* The Assemble panel's body, under the Editor: what the last assemble did
   (both windows, MIPS and RISC-V; app.ts says which and when).

     fresh       [Not assembled]                      and what Ctrl+S will do
     busy        [Assembling…]                         (only one that takes a while)
     assembled   [Assembled | 14 instructions | Saved | 12:55:59]
                 and, once the code has changed since, that Run still uses it
     errors      [2 errors | Not assembled | 12:55:59] what to do, the list
                 (each error: its line, the message, the line's text, a hint),
                 a button to the first error's line

   In the language in use (messages/assemble.ts); the window draws it again
   when the language changes.  The first cell is the state, in its colour
   (cells.ts, app.css "cells").  The error list keeps the classes the
   tutorial points at (.notice h3, .item, .row .btn). */

import { ago, cell, count, lead } from '../cells.ts';
import { code, codeText, h, icon, withHex } from '../dom.ts';
import { tr } from '../i18n.ts';
import { ASSEMBLE } from '../messages/assemble.ts';

type Part = string | { key: string };
const said = (parts: Part[]): (string | HTMLElement)[] => parts.map((p) => (typeof p === 'string' ? p : h('kbd', {}, p.key)));
const saveCell = (note: string, warn: boolean) => (note ? cell(warn ? 'warn' : '', note) : null);

export function freshState(saves: boolean, saveNote: string, saveWarn: boolean): HTMLElement {
  return h('div', { class: 'asm-state' },
    h('div', { class: 'cells' }, lead('idle', tr(ASSEMBLE.notAssembled)), saveCell(saveNote, saveWarn)),
    h('p', { class: 'asm-note' }, ...said(tr(ASSEMBLE.fresh, saves))));
}

export function busyState(): HTMLElement {
  return h('div', { class: 'asm-state' }, h('div', { class: 'cells' }, lead('run', tr(ASSEMBLE.assembling))));
}

// Edits since are the Editor's dot (beside the file's name), not a note here.
export function assembledState(o: { instructions: number; at: Date; saveNote: string; saveWarn: boolean }): HTMLElement {
  return h('div', { class: 'asm-state' },
    h('div', { class: 'cells' }, lead('ok', tr(ASSEMBLE.assembled)), cell('', count(o.instructions, ASSEMBLE.instructions)),
      saveCell(o.saveNote, o.saveWarn), cell('time', ago(o.at))));
}

export interface AsmError {
  line: number;     // the Editor's, 0 if none
  message: string;  // what is wrong, in the language in use (asm-messages.ts), or the assembler's own words
  raw: string;      // the assembler's own words when `message` is not them; '' if none
  source: string;   // the line's text, '' if none
  hint: string;     // what is wrong on the line (near-miss.ts), `code` in backticks; '' if nothing
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
  const go = h('button', { class: 'btn small goline', type: 'button' },
    h('span', {}, first.line ? tr(ASSEMBLE.goToLine, first.line) : tr(ASSEMBLE.toEditor)), icon('arrow-right'));
  go.addEventListener('click', () => (first.line ? o.goTo(first.line) : o.toEditor()));
  const items = o.errors.map((e) => {
    const where = h('button', { class: 'linkbtn line', type: 'button', disabled: !e.line, title: e.line ? tr(ASSEMBLE.goToLine, e.line) : undefined },
      e.line ? tr(ASSEMBLE.line, e.line) : '');
    where.addEventListener('click', () => { if (e.line) o.goTo(e.line); });
    // The assembler's own words beside the window's: what its documentation and a search know.
    const raw = e.raw && e.raw !== e.message ? h('span', { class: 'raw' }, withHex(e.raw)) : null;
    return h('div', { class: 'item' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '!'), where,
      h('span', { class: 'msg' },
        h('span', { class: 'what', title: raw ? tr(ASSEMBLE.engineSaid, e.raw) : undefined }, withHex(e.message), raw),
        e.source ? code(e.source, 'src') : null,
        e.hint ? h('span', { class: 'hint' }, codeText(e.hint)) : null));
  });
  // The state, what to do, the errors each with its line; the button goes
  // to the first.  With a program in the machine, it is still there.
  const n = o.errors.length;
  return h('div', { class: 'notice-host' }, h('div', { class: 'notice' }, h('div', { class: 'say' },
    h('h3', { class: 'cells' }, lead('err', tr(ASSEMBLE.errors, n)), cell('', tr(o.kept ? ASSEMBLE.kept : ASSEMBLE.notAssembled)),
      o.at ? cell('time', ago(o.at)) : null),
    h('p', { class: 'asm-note' }, ...said(tr(ASSEMBLE.fix, n > 1)), o.kept ? tr(ASSEMBLE.keptNote, o.narrow) : ''),
    h('div', { class: 'items' }, ...items),
    h('div', { class: 'row' }, go))));
}
