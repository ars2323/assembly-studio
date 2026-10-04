/* What is wrong on the line the assembler could not read, for the error
   list's hint: a first word that is no instruction or directive SPIM knows
   (srll, .global, lii), a register that does not exist ($s10, $t10, $spp),
   or a register name without its $ (t0) -- the most common slips, which
   the core reports as "syntax error" and nothing more.

   The hint says what is wrong, never what the student may have meant: no
   "did you mean srl?".  A guess can be wrong, and the student is the one
   to find the right word.  Facts about the names are fine: "the $t
   registers are $t0-$t9".

   Where it looks: the statements' first words (core/precheck.ts: the line
   without its comment and strings, labels and equates), against the core's
   own keyword table, case and all; their operands' $-words (registers);
   and bare words that are a register's name.  A $-word that is no register
   is named only when it is a letter or two from one ($spp): SPIM also
   takes $-words as labels.  (nearest(): Damerau-Levenshtein distance 1
   for a name of up to five characters, 2 from six on; a word of two
   characters or less is never taken for a near one.)

   The words are said in either language (core/lang.ts); `code` in
   backticks (the window sets it in the code font). */

import { say, type Lang } from './lang.ts';
import { isMipsDirective, isMipsInstruction } from './mips-syntax.ts';
import { firstName, statements, withoutLabels } from './precheck.ts';
import { generalRegisterName } from './registers.ts';

export type NearMiss =
  | { why: 'unknown'; kind: 'directive' | 'instruction'; token: string }
  | { why: 'unknown-register'; token: string }
  | { why: 'no-such-register'; token: string; family: string; range: string }
  | { why: 'missing-dollar'; token: string };

/* The hints, in both languages.  Shared with RISC-V
   (isa/riscv/core/near-miss.ts) where they say the same thing. */
export const HINTS = {
  unknown: {
    instruction: { ko: (t: string) => `명령어를 확인해 주세요: \`${t}\``, en: (t: string) => `Check the instruction: \`${t}\`` },
    directive: { ko: (t: string) => `지시어를 확인해 주세요: \`${t}\``, en: (t: string) => `Check the directive: \`${t}\`` },
  },
  unknownRegister: { ko: (t: string) => `레지스터 이름을 확인해 주세요: \`${t}\``, en: (t: string) => `Check the register name: \`${t}\`` },
  noSuchRegister: {
    ko: (t: string, family: string, range: string) => `레지스터 이름을 확인해 주세요: \`${t}\`. \`${family}\` 레지스터는 \`${range}\` 입니다.`,
    en: (t: string, family: string, range: string) => `Check the register name: \`${t}\`. The \`${family}\` registers are \`${range}\`.`,
  },
  missingDollar: { ko: '레지스터 이름은 `$` 로 시작합니다.', en: 'Register names start with `$`.' },
  // What a message's kind usually needs, when the line shows nothing more.
  syntax: {
    ko: '명령어 이름, 레지스터 이름(`$t0` 처럼), 쉼표를 확인해 주세요.',
    en: 'Check the instruction name, the register names (like `$t0`) and the commas.',
  },
  twice: { ko: '같은 이름의 Label 이 둘 있습니다. 하나의 이름을 바꿔 주세요.', en: 'Two labels have this name. Rename one of them.' },
  shift: { ko: '시프트 양은 0 부터 31 까지입니다.', en: 'A shift amount is 0 to 31.' },
  tooLarge: {
    ko: '이 명령에 넣기에는 값이 너무 큽니다. 먼저 `li` 로 레지스터에 넣어 주세요.',
    en: 'The value is too big for this instruction. Put it in a register with `li` first.',
  },
  undefined: {
    ko: '쓰였지만 정의되지 않은 이름입니다. 철자와 `.globl` 을 확인해 주세요.',
    en: 'This name is used but never defined. Check its spelling and `.globl`.',
  },
};

const REGISTERS = Array.from({ length: 32 }, (_, i) => generalRegisterName(i));
const FAMILIES: Record<string, [number, number]> = { t: [0, 9], s: [0, 7], a: [0, 3], v: [0, 1], k: [0, 1] };

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

/* Whether `word` is plainly a slip of one name of `names` (and not one of
   them): one name at the nearest distance allowed, or, among those tied,
   the one sharing the longest prefix with the word, then the longest
   suffix -- still tied, it is not ($L1: $t1, $s1, $a1 ... alike, likely a
   label).  The name itself is never shown: only that the word is no name. */
export function nearAny(word: string, names: readonly string[]): boolean {
  const allowed = nearMissRule(word.length);
  if (allowed === 0 || names.includes(word)) return false;
  let best: { distance: number; prefix: number; suffix: number }[] = [];
  for (const name of names) {
    const distance = editDistance(word, name);
    if (distance === 0 || distance > allowed) continue;
    const entry = { distance, prefix: commonPrefix(word, name), suffix: commonSuffix(word, name) };
    if (best.length === 0 || distance < best[0].distance) best = [entry];
    else if (distance === best[0].distance) best.push(entry);
  }
  for (const key of ['prefix', 'suffix'] as const) {
    const longest = Math.max(...best.map((b) => b[key]));
    best = best.filter((b) => b[key] === longest);
  }
  return best.length === 1;
}

export function nearMiss(sourceLine: string): NearMiss | null {
  for (const s of statements(sourceLine)) {
    const statement = withoutLabels(s);
    if (statement === '') continue;
    // The instruction or directive.
    const first = firstName(statement);
    if (first !== null && !(first.startsWith('.') ? isMipsDirective(first) : isMipsInstruction(first))) {
      return { why: 'unknown', kind: first.startsWith('.') ? 'directive' : 'instruction', token: first };
    }
    // The registers among the operands.
    const [, ...operands] = statement.replace(/"(?:[^"\\]|\\.)*"/g, '""').split(/[\s,()]+/).filter(Boolean);
    for (const w of operands) {
      if (w.startsWith('$')) {
        if (REGISTERS.includes(w) || /^\$(?:[0-9]|[12][0-9]|3[01])$/.test(w) || /^\$f(?:[0-9]|[12][0-9]|3[01])$/.test(w)) continue;
        const family = /^\$([a-z])(\d+)$/.exec(w);
        if (family && family[1] in FAMILIES) {
          const [lo, hi] = FAMILIES[family[1]];
          const n = Number(family[2]);
          if (n < lo || n > hi) return { why: 'no-such-register', token: w, family: `$${family[1]}`, range: `$${family[1]}${lo}–$${family[1]}${hi}` };
        }
        if (/^\$(\d+)$/.test(w)) return { why: 'no-such-register', token: w, family: '$0', range: '$0–$31' };
        if (nearAny(w.toLowerCase(), REGISTERS)) return { why: 'unknown-register', token: w };
      } else if (/^[a-z][a-z0-9]*$/.test(w) && REGISTERS.includes(`$${w}`)) {
        return { why: 'missing-dollar', token: w };
      }
    }
  }
  return null;
}

// What is wrong on a line, said in `lang`; null when the line shows nothing.
export function nearMissHint(near: NearMiss | null, lang: Lang): string | null {
  switch (near?.why) {
    case 'unknown': return say(lang, HINTS.unknown[near.kind], near.token);
    case 'unknown-register': return say(lang, HINTS.unknownRegister, near.token);
    case 'no-such-register': return say(lang, HINTS.noSuchRegister, near.token, near.family, near.range);
    case 'missing-dollar': return say(lang, HINTS.missingDollar);
    default: return null;
  }
}

/* What to do about an assembler message, shown under it in the Assemble
   panel.  For a syntax error, first what the line shows is wrong (nearMiss
   above); then what the message's kind usually needs.  Nothing useful to
   add: ''. */
export function assemblerHint(message: string, source: string, lang: Lang): string {
  if (/syntax error/i.test(message)) return nearMissHint(nearMiss(source), lang) ?? say(lang, HINTS.syntax);
  if (/defined for the second time|already defined/i.test(message)) return say(lang, HINTS.twice);
  if (/shift distance/i.test(message)) return say(lang, HINTS.shift);
  if (/register number/i.test(message)) return '';
  if (/too large|out of range|immediate/i.test(message)) return say(lang, HINTS.tooLarge);
  if (/undefined/i.test(message)) return say(lang, HINTS.undefined);
  return '';
}
