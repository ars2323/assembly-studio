/* Tokens of one line of RARS assembly, for the editor's syntax
   highlighting: '#' comments as in RARS, registers without '$' -- x0..x31,
   f0..f31 and their ABI names.

   Which words are instructions and which are directives is not decided
   here: the list is RARS's own (op-table.ts, generated from its source).
   So what the editor colours as an instruction is exactly what the
   assembler accepts as one, pseudo instructions included. */

import { OP_TABLE } from './op-table.ts';
import { findRegister } from './registers.ts';

export type SyntaxTokenKind =
  | 'Comment'         // # to the end of the line
  | 'String'          // "..." with \ escapes; 'c' character literals
  | 'Directive'       // .data .word ...
  | 'Instruction'     // add li ecall ...
  | 'Register'        // x5 t0 fa0 f12
  | 'LabelDefinition' // name:  at the start of the line
  | 'Identifier'      // any other name: a label being referred to
  | 'Number';         // 10 -4 0x10010000 1.5e3

export interface SyntaxToken {
  start: number;
  length: number;
  kind: SyntaxTokenKind;
}

const KEYWORD_TYPES: ReadonlyMap<string, string> = new Map(OP_TABLE.map(([name, type]) => [name, type]));

export const isDirective = (word: string): boolean => KEYWORD_TYPES.get(word.toLowerCase()) === 'directive';
export function isInstruction(word: string): boolean {
  const type = KEYWORD_TYPES.get(word.toLowerCase());
  return type === 'basic' || type === 'pseudo';
}
export const instructionNames = (): string[] => [...KEYWORD_TYPES].filter(([, t]) => t !== 'directive').map(([n]) => n);

const isNameStart = (c: string): boolean => /^[A-Za-z_.$]$/.test(c);
const isNameChar = (c: string): boolean => /^[A-Za-z0-9_.$]$/.test(c);
const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

// Whitespace, commas, parentheses and the like produce no token.
export function tokenizeLine(line: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  const add = (start: number, end: number, kind: SyntaxTokenKind) => tokens.push({ start, length: end - start, kind });
  const n = line.length;
  let onlyLabelsSoFar = true; // a "name:" is a definition only up front
  let i = 0;
  while (i < n) {
    const c = line[i];
    if (c === '#') { add(i, n, 'Comment'); break; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && line[j] !== c) j += line[j] === '\\' && j + 1 < n ? 2 : 1;
      j = Math.min(n, j + 1);
      add(i, j, 'String');
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }
    const sign = (c === '-' || c === '+') && isDigit(line[i + 1]);
    if (isDigit(c) || sign) {
      let j = i + 1;
      while (j < n && (isNameChar(line[j]) || ((line[j] === '-' || line[j] === '+') && /[eE]/.test(line[j - 1]) && !/x/i.test(line.slice(i, j))))) j += 1;
      add(i, j, 'Number');
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }
    if (isNameStart(c)) {
      let j = i + 1;
      while (j < n && isNameChar(line[j])) j += 1;
      const word = line.slice(i, j);
      let k = j;
      while (k < n && (line[k] === ' ' || line[k] === '\t')) k += 1;
      if (onlyLabelsSoFar && k < n && line[k] === ':') {
        add(i, k + 1, 'LabelDefinition');
        i = k + 1;
        continue;
      }
      onlyLabelsSoFar = false;
      add(i, j, isDirective(word) ? 'Directive' : isInstruction(word) ? 'Instruction' : findRegister(word) ? 'Register' : 'Identifier');
      i = j;
      continue;
    }
    if (!/\s/.test(c)) onlyLabelsSoFar = false;
    i += 1;
  }
  return tokens;
}
