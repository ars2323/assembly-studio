/* A guess at the name a student meant, for the error list's hint: on the
   line RARS could not read, a name a letter or two away from one it knows
   -- srll for srl, ecal for ecall, .wrod for .word, spp for sp --, a
   register that does not exist (t7, s12, a8, x32), and the habits a
   student brings from MIPS, the course's first half: a register written
   with its $ ($t0), syscall for ecall, move for mv.  RARS says only that
   it does not know the word.  (The same rule and the same ties as MIPS's
   src/core/near-miss.ts, with RARS's names.)

   Where it looks: the statement's first word (an instruction or a
   directive), compared with RARS's instructions only or its directives
   only (op-table.ts, generated from RARS); and among the operands, a word
   written as a register: one with a $, one of a register family out of its
   range, and -- only the word RARS named as "of incorrect type", since a
   bare word may be the student's own label -- a register name misspelt.
   Labels in front of the statement, numbers, strings and the comment are
   left alone.  A wrong guess is worse than none.

   What counts as near (nearMissRule): Damerau-Levenshtein distance 1 for
   a name of up to five characters, 2 from six on; one candidate at that
   distance, or, among those tied, the one sharing the longest prefix with
   the word, then the longest suffix (srll: srl over sll) -- still tied, no
   guess.  A word of two characters or less is never guessed at (too many
   names are one letter from it). */

import { OP_TABLE } from './op-table.ts';
import { ABI_NAMES, FP_ABI_NAMES, findRegister } from './registers.ts';

export type NearMiss =
  | { why: 'spelling'; kind: 'directive' | 'instruction' | 'register'; token: string; meant: string }
  | { why: 'no-such-register'; token: string; family: string; range: string }
  | { why: 'mips'; token: string; meant: string };

const INSTRUCTIONS = OP_TABLE.filter(([, t]) => t !== 'directive').map(([n]) => n);
const DIRECTIVES = OP_TABLE.filter(([, t]) => t === 'directive').map(([n]) => n);
const REGISTERS = [...Array.from({ length: 32 }, (_, i) => `x${i}`), ...ABI_NAMES, 'fp',
  ...Array.from({ length: 32 }, (_, i) => `f${i}`), ...FP_ABI_NAMES];
// A register family and its numbers: t7 is "not a t register", not "a label called t7".
const FAMILIES: [string, number, number][] = [['ft', 0, 11], ['fs', 0, 11], ['fa', 0, 7], ['x', 0, 31], ['f', 0, 31], ['t', 0, 6], ['s', 0, 11], ['a', 0, 7]];
// MIPS's names that RISC-V spells otherwise (and that are not RISC-V names).
const FROM_MIPS: Record<string, string> = { syscall: 'ecall', move: 'mv', subi: 'addi', addiu: 'addi', addu: 'add', subu: 'sub' };

// The distance allowed for a word of `length` characters.
export const nearMissRule = (length: number): number => (length <= 2 ? 0 : length <= 5 ? 1 : 2);

// Damerau-Levenshtein (optimal string alignment): insert, delete,
// substitute, swap two neighbours.
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const commonPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
};
const reverse = (s: string): string => [...s].reverse().join('');
const commonSuffix = (a: string, b: string): number => commonPrefix(reverse(a), reverse(b));

// The one name of `names` near `word`, or null.
export function nearest(word: string, names: readonly string[]): string | null {
  const allowed = nearMissRule(word.length);
  if (allowed === 0 || names.includes(word)) return null;
  let best: { name: string; distance: number; prefix: number; suffix: number }[] = [];
  for (const name of names) {
    const distance = editDistance(word, name);
    if (distance === 0 || distance > allowed) continue;
    const entry = { name, distance, prefix: commonPrefix(word, name), suffix: commonSuffix(word, name) };
    if (best.length === 0 || distance < best[0].distance) best = [entry];
    else if (distance === best[0].distance) best.push(entry);
  }
  if (best.length === 0) return null;
  for (const key of ['prefix', 'suffix'] as const) {
    const longest = Math.max(...best.map((b) => b[key]));
    best = best.filter((b) => b[key] === longest);
  }
  return best.length === 1 ? best[0].name : null;
}

// The line without its comment and its strings, and without the labels in
// front of the statement.
function statementOf(line: string): string {
  let s = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash);
  return s.replace(/^\s*(?:[A-Za-z_.$][\w.$]*\s*:\s*)+/, '').trim();
}

// `flagged`: the word RARS's message names ('"spp": operand is of incorrect type'), if any.
export function nearMiss(sourceLine: string, flagged: string | null = null): NearMiss | null {
  const statement = statementOf(sourceLine);
  if (statement === '') return null;
  const words = statement.split(/[\s,()]+/).filter(Boolean);
  const [first, ...operands] = words;
  // The instruction or directive.
  if (first.startsWith('.')) {
    const meant = nearest(first, DIRECTIVES);
    if (meant) return { why: 'spelling', kind: 'directive', token: first, meant };
  } else if (/^[A-Za-z][\w.]*$/.test(first) && !INSTRUCTIONS.includes(first.toLowerCase())) {
    const lower = first.toLowerCase();
    if (lower in FROM_MIPS) return { why: 'mips', token: first, meant: FROM_MIPS[lower] };
    const meant = nearest(lower, INSTRUCTIONS);
    if (meant) return { why: 'spelling', kind: 'instruction', token: first, meant };
  }
  // The registers among the operands.
  for (const w of operands) {
    if (w.startsWith('$')) {
      const bare = w.slice(1);
      return { why: 'mips', token: w, meant: findRegister(bare) ? bare : /^\d+$/.test(bare) && Number(bare) < 32 ? `x${bare}` : bare };
    }
    if (findRegister(w)) continue;
    const family = /^([a-z]{1,2})(\d+)$/.exec(w);
    const range = family && FAMILIES.find(([f]) => f === family[1]);
    if (family && range && (Number(family[2]) < range[1] || Number(family[2]) > range[2])) {
      return { why: 'no-such-register', token: w, family: range[0], range: `${range[0]}${range[1]}–${range[0]}${range[2]}` };
    }
    if (w === flagged) {
      const meant = nearest(w.toLowerCase(), REGISTERS);
      if (meant) return { why: 'spelling', kind: 'register', token: w, meant };
    }
  }
  return null;
}

/* The slip a line shows, as a hint under RARS's message in the Assemble
   panel: a name a letter or two from one RARS knows, a register that does
   not exist, a MIPS habit.  RARS names the word it could not take ('"spp":
   operand is of incorrect type'); only that word is guessed at as a
   misspelt register.  `code` in backticks (the window sets it in the code
   font).  Nothing to name: ''. */
export function rarsHint(message: string, source: string): string {
  const flagged = /^"([^"]+)"/.exec(message)?.[1] ?? null;
  const near = nearMiss(source, flagged);
  if (near?.why === 'spelling') return `No ${near.kind} \`${near.token}\`. Did you mean \`${near.meant}\`?`;
  if (near?.why === 'no-such-register') return `No register \`${near.token}\`. The \`${near.family}\` registers are \`${near.range}\`.`;
  if (near?.why === 'mips' && near.token.startsWith('$')) {
    return findRegister(near.meant)
      ? `RISC-V register names have no \`$\`: \`${near.token}\` → \`${near.meant}\`.`
      : `RISC-V register names have no \`$\`, and \`${near.meant}\` is a MIPS register. The system call number goes in \`a7\`.`;
  }
  if (near?.why === 'mips') return `\`${near.token}\` is a MIPS instruction. RISC-V uses \`${near.meant}\`.`;
  return '';
}
