/* A look at the program before the engine gets it: every statement starts
   with a name the assembler knows -- an instruction (pseudo instructions
   included) or a directive.  A word that is neither is reported here, on
   its line, and the engine is not asked: SPIM would say only "syntax
   error" for it, and an unknown word was the slip that once took the
   engine down with it (a misspelt last line with no newline after it;
   native/index.ts).

   The names are the core's own keyword table (op-table.ts, generated from
   CPU/op.h), case and all: SPIM looks a word up as it is written, so ADD
   is no instruction to it either.  A wrong report would stop a program the
   assembler takes, so only what is certainly wrong is reported:

     - a statement is what is left of a line without its comment (# to the
       end, outside a string or a 'c' character), split at ';' (SPIM ends a
       statement there too), without the labels in front of it;
     - `name = value` (SPIM's equate) is no instruction and is left alone;
     - only a first word that is a name is looked at (SPIM's identifier,
       [A-Za-z_.][A-Za-z0-9_.]*); anything else at the start of a statement
       -- a number, a register, a stray comma -- is the engine's to report.

   Pure: no engine, no window.  The RISC-V counterpart is
   isa/riscv/core/precheck.ts. */

import { isMipsDirective, isMipsInstruction } from './mips-syntax.ts';

export interface UnknownWord {
  line: number;                       // 1-based
  source: string;                     // the whole line, trimmed
  token: string;                      // the word, as written
  kind: 'instruction' | 'directive';  // what it stands where one of these goes
}

// The statements of one line: the text between ';'s, without the comment;
// strings and characters are kept whole (a '#' or ';' in them is theirs).
export function statements(line: string, separator: string | null = ';'): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      i = j + 1;
      continue;
    }
    if (c === '#') break;
    if (c === separator) { out.push(line.slice(start, i)); start = i + 1; }
    i += 1;
  }
  out.push(line.slice(start, Math.min(i, line.length)));
  return out;
}

// A statement without the labels in front of it ("main: loop: add ...").
export const withoutLabels = (s: string): string => s.replace(/^\s*(?:[A-Za-z_.$][\w.$]*\s*:\s*)+/, '').trim();

// The statement's first word, when it is a name; null otherwise.
export function firstName(statement: string): string | null {
  const m = /^[A-Za-z_.][A-Za-z0-9_.]*/.exec(statement);
  if (!m) return null;
  // `name = value`: an equate, not an instruction.
  if (/^\s*=/.test(statement.slice(m[0].length))) return null;
  return m[0];
}

export function precheckMips(source: string): UnknownWord[] {
  const found: UnknownWord[] = [];
  source.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    for (const s of statements(line)) {
      const word = firstName(withoutLabels(s));
      if (word === null) continue;
      if (word.startsWith('.') ? isMipsDirective(word) : isMipsInstruction(word)) continue;
      found.push({ line: i + 1, source: line.trim(), token: word, kind: word.startsWith('.') ? 'directive' : 'instruction' });
    }
  });
  return found;
}
