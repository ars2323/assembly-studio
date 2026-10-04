/* What is wrong on the line RARS could not read, for the error list's
   hint: a first word that is no instruction or directive RARS knows
   (srll, ecalll, .wrod), a register that does not exist (t7, s12, a8,
   x32), a register name misspelt (spp), and the habits a student brings
   from MIPS: a register written with its $ ($t0), syscall, move.  RARS
   says only that it does not know the word.

   As for MIPS (src/core/near-miss.ts, which says why): the hint says what
   is wrong, never what the student may have meant.

   Where it looks: the statement's first word (an instruction or a
   directive), against RARS's instructions or its directives (op-table.ts,
   generated from RARS; in any case, as RARS reads them); and among the
   operands, a word written as a register: one with a $, one of a register
   family out of its range, and -- only the word RARS named as "of
   incorrect type", since a bare word may be the student's own label, and
   only when it is a letter or two from a register's name -- a register
   name misspelt.  Labels in front of the statement, numbers, strings and
   the comment are left alone. */

import { say, type Lang } from '../../../core/lang.ts';
import { nearAny, nearMissHint } from '../../../core/near-miss.ts';
import { firstName, statements, withoutLabels } from '../../../core/precheck.ts';
import { OP_TABLE } from './op-table.ts';
import { ABI_NAMES, FP_ABI_NAMES, findRegister } from './registers.ts';

export type NearMiss =
  | { why: 'unknown'; kind: 'directive' | 'instruction'; token: string }
  | { why: 'unknown-register'; token: string }
  | { why: 'no-such-register'; token: string; family: string; range: string }
  | { why: 'mips-instruction'; token: string }
  | { why: 'mips-register'; token: string; bare: string }; // bare: the word without its $

// RISC-V's own hints; the rest are MIPS's (core/near-miss.ts HINTS).
export const RISCV_HINTS = {
  mipsInstruction: {
    ko: (t: string) => `RISC-V 명령어를 확인해 주세요. MIPS 명령어입니다: \`${t}\``,
    en: (t: string) => `Check the RISC-V instruction. This is a MIPS one: \`${t}\``,
  },
  dollar: { ko: 'RISC-V 레지스터 이름에는 `$` 가 붙지 않습니다.', en: 'RISC-V register names have no `$`.' },
  mipsRegister: {
    ko: (bare: string) => `레지스터 이름을 확인해 주세요. RISC-V 레지스터 이름에는 \`$\` 가 붙지 않습니다. MIPS 레지스터입니다: \`${bare}\``,
    en: (bare: string) => `Check the register name. RISC-V register names have no \`$\`. This is a MIPS register: \`${bare}\``,
  },
};

const INSTRUCTIONS = new Set(OP_TABLE.filter(([, t]) => t !== 'directive').map(([n]) => n));
const DIRECTIVES = new Set(OP_TABLE.filter(([, t]) => t === 'directive').map(([n]) => n));
const REGISTERS = [...Array.from({ length: 32 }, (_, i) => `x${i}`), ...ABI_NAMES, 'fp',
  ...Array.from({ length: 32 }, (_, i) => `f${i}`), ...FP_ABI_NAMES];
// A register family and its numbers: t7 is "not a t register", not "a label called t7".
const FAMILIES: [string, number, number][] = [['ft', 0, 11], ['fs', 0, 11], ['fa', 0, 7], ['x', 0, 31], ['f', 0, 31], ['t', 0, 6], ['s', 0, 11], ['a', 0, 7]];
// MIPS's instructions that RISC-V does not have.
const FROM_MIPS = new Set(['syscall', 'move', 'subi', 'addiu', 'addu', 'subu']);

// `flagged`: the word RARS's message names ('"spp": operand is of incorrect type'), if any.
export function nearMiss(sourceLine: string, flagged: string | null = null): NearMiss | null {
  const statement = withoutLabels(statements(sourceLine, null)[0]);
  if (statement === '') return null;
  // The instruction or directive.
  const first = firstName(statement);
  if (first !== null) {
    const lower = first.toLowerCase();
    if (lower.startsWith('.') ? !DIRECTIVES.has(lower) : !INSTRUCTIONS.has(lower)) {
      if (FROM_MIPS.has(lower)) return { why: 'mips-instruction', token: first };
      // A word RARS took for a macro of the program's is not looked at
      // here: RARS names that itself.
      return { why: 'unknown', kind: lower.startsWith('.') ? 'directive' : 'instruction', token: first };
    }
  }
  // The registers among the operands.
  const [, ...operands] = statement.replace(/"(?:[^"\\]|\\.)*"/g, '""').split(/[\s,()]+/).filter(Boolean);
  for (const w of operands) {
    if (w.startsWith('$')) return { why: 'mips-register', token: w, bare: w.slice(1) };
    if (findRegister(w)) continue;
    const family = /^([a-z]{1,2})(\d+)$/.exec(w);
    const range = family && FAMILIES.find(([f]) => f === family[1]);
    if (family && range && (Number(family[2]) < range[1] || Number(family[2]) > range[2])) {
      return { why: 'no-such-register', token: w, family: range[0], range: `${range[0]}${range[1]}–${range[0]}${range[2]}` };
    }
    if (w === flagged && nearAny(w.toLowerCase(), REGISTERS)) return { why: 'unknown-register', token: w };
  }
  return null;
}

/* The hint under RARS's message in the Assemble panel, in `lang`: what the
   line shows is wrong.  RARS names the word it could not take ('"spp":
   operand is of incorrect type'); only that word is taken for a misspelt
   register.  Nothing to say: ''. */
export function rarsHint(message: string, source: string, lang: Lang): string {
  // A macro of the program's used wrongly: its name is no instruction, and
  // RARS has said what is wrong with it.
  if (/macro/i.test(message)) return '';
  const flagged = /^"([^"]+)"/.exec(message)?.[1] ?? null;
  const near = nearMiss(source, flagged);
  switch (near?.why) {
    case 'mips-instruction': return say(lang, RISCV_HINTS.mipsInstruction, near.token);
    case 'mips-register': return findRegister(near.bare) ? say(lang, RISCV_HINTS.dollar) : say(lang, RISCV_HINTS.mipsRegister, near.bare);
    case 'unknown': case 'unknown-register': case 'no-such-register': return nearMissHint(near, lang) ?? '';
    default: return '';
  }
}
