/* RISC-V's look at the program before the engine gets it (MIPS's is
   src/core/precheck.ts, which says why): every statement starts with an
   instruction (pseudo instructions included) or a directive RARS knows
   (op-table.ts, generated from RARS's source), or with the name of one of
   the program's own macros or .eqv names.  RARS reports such a word too
   ('"ecalll" is not a recognized operator'); here it is the same report,
   on the same line, in the window's words, whichever engine answers.

   Only what is certainly wrong is reported:
     - RARS takes names in any case (ECALL, Li): so does this;
     - a statement is a line without its comment (# outside a string or a
       character) and without the labels in front of it; RARS has no ';'
       between statements;
     - a line inside .macro ... .end_macro is not looked at (RARS reads it
       only where the macro is used, its %parameters put in);
     - a word that is the name of a macro (.macro name) or of an .eqv
       anywhere in the file is the program's own;
     - with an .include, nothing is reported: the included file may define
       macros and .eqv names this file cannot see;
     - only a first word that is a name is looked at. */

import { OP_TABLE } from './op-table.ts';
import { firstName, statements, withoutLabels, type UnknownWord } from '../../../core/precheck.ts';

export type { UnknownWord };

const INSTRUCTIONS = new Set(OP_TABLE.filter(([, t]) => t !== 'directive').map(([n]) => n));
const DIRECTIVES = new Set(OP_TABLE.filter(([, t]) => t === 'directive').map(([n]) => n));

// Each line's one statement: no comment, no labels.
const statementOf = (line: string): string => withoutLabels(statements(line, null)[0]);

export function precheckRiscv(source: string): UnknownWord[] {
  const lines = source.split('\n').map((l) => l.replace(/\r$/, ''));
  const words = lines.map((l) => {
    const s = statementOf(l);
    return { s, word: firstName(s) };
  });
  // The program's own names: its macros and its .eqv names.
  const own = new Set<string>();
  for (const { s, word } of words) {
    const lower = word?.toLowerCase();
    if (lower === '.include') return [];
    if (lower === '.macro' || lower === '.eqv') {
      const name = /^\S+\s+([A-Za-z_.][\w.]*)/.exec(s)?.[1];
      if (name) own.add(name.toLowerCase());
    }
  }
  const found: UnknownWord[] = [];
  let inMacro = false;
  words.forEach(({ word }, i) => {
    const lower = word?.toLowerCase() ?? null;
    if (lower === '.macro') { inMacro = true; return; }
    if (lower === '.end_macro') { inMacro = false; return; }
    if (inMacro || word === null || lower === null) return;
    if (lower.startsWith('.') ? DIRECTIVES.has(lower) : INSTRUCTIONS.has(lower) || own.has(lower)) return;
    found.push({ line: i + 1, source: lines[i].trim(), token: word, kind: lower.startsWith('.') ? 'directive' : 'instruction' });
  });
  return found;
}
