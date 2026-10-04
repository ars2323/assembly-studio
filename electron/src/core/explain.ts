/* One sentence that says what an instruction does -- the Inspector's line
   under the picture -- the same for every use of the instruction: the
   fields by name, with what this word puts in them (a register, a number):

     sll — Shift Left Logical. rt(`$a0`)에 저장된 값을 shamt(`2`)만큼 왼쪽으로
     옮겨 rd(`$v0`)에 넣습니다. 빈 자리는 0으로 채웁니다.

     Shifts the value in rt (`$a0`) left by shamt (`2`) and puts the result
     in rd (`$v0`). The vacated bits are filled with 0.

   What a register holds at run time is not in it (the Registers panel shows
   that); what the word itself says is -- a shift amount, an offset, an
   immediate, a branch's destination.  Only a syscall looks at a register:
   `$v0` says which call it is.

   In Korean (the terms of art stay in English: Overflow, Exception, Word,
   Sign-extend ...) or in English (core/lang.ts).  Everything that is code
   -- register names, numbers -- is wrapped in backticks, and the view sets
   those parts in the monospaced font (Pretendard draws 0x1 as 0×1).  A
   particle always follows a Korean noun or a closing parenthesis whose
   particle does not change -- 값을, 주소에서, rd(`$v0`)에, shamt(`2`)만큼 --
   never a register name or a number, whose reading ($a0: 에이제로?
   에이영?  5: 오) would decide between 을/를, 이/가, 로/으로
   (tests/renderer/particles.test.ts).
*/

import type { DecodedInstruction } from './decoder.ts';
import { mnemonicExpansion } from './decoder.ts';
import { hex32 } from './format.ts';
import type { Lang } from './lang.ts';
import { generalRegisterName } from './registers.ts';

export interface Explanation {
  title: string;    // "sra — Shift Right Arithmetic" ("nop" alone when no expansion)
  sentence: string; // with `code` parts; '' when there is nothing to add
}

const code = (s: string | number): string => '`' + s + '`';
const reg = (n: number): string => code(generalRegisterName(n));
// A field and what this word puts in it: rs(`$t1`), shamt(`2`).
const f = (field: string, n: number): string => `${field}(${reg(n)})`;
const num = (field: string, x: string | number): string => `${field}(${code(x)})`;
// "rs(`$t1`)에 저장된 값", "rd(`$t3`)에 넣습니다".
const v = (field: string, n: number): string => `${f(field, n)}에 저장된 값`;
const into = (field: string, n: number): string => `${f(field, n)}에 넣습니다`;

// SPIM's syscalls ($v0), by their usual names.
const SYSCALLS: Record<number, string> = {
  1: 'print_int — `$a0` 레지스터의 정수를 출력', 2: 'print_float — `$f12` 값을 출력', 3: 'print_double — `$f12` 값을 출력',
  4: 'print_string — `$a0` 값이 가리키는 문자열을 출력', 5: 'read_int — 정수 한 줄을 읽어 `$v0` 레지스터에',
  6: 'read_float — 실수 한 줄을 읽어 `$f0` 레지스터에', 7: 'read_double — 실수 한 줄을 읽어 `$f0` 레지스터에',
  8: 'read_string — 한 줄을 `$a0` 값이 가리키는 곳에(최대 `$a1` 값만큼)', 9: 'sbrk — `$a0` 값만큼 할당해 그 주소를 `$v0` 레지스터에',
  10: 'exit — 프로그램을 끝냄', 11: 'print_char — `$a0` 레지스터의 문자를 출력', 12: 'read_char — 문자 하나를 읽어 `$v0` 레지스터에',
  13: 'open', 14: 'read', 15: 'write', 16: 'close', 17: 'exit2 — `$a0` 값을 종료 코드로 끝냄',
};

// add, addi, sub trap on a signed overflow (and leave the destination as it
// was); their -u twins never trap -- "unsigned" is only in the name.
const overflow = (name: string): string => (name.endsWith('u')
  ? ' Overflow는 무시합니다.'
  : ' 부호 있는 Overflow가 일어나면 Exception이 발생합니다.');

// Names the decoder's table leaves out.
const TITLES: Record<string, string> = {
  add: 'Add', sub: 'Subtract', and: 'And', or: 'Or', xor: 'Exclusive Or', nor: 'Nor',
  syscall: 'System Call', break: 'Breakpoint',
};

function sentence(d: DecodedInstruction, regs: readonly number[], pc: number, lang: Lang): string {
  if (lang === 'en') return sentenceEn(d, regs, pc);
  const { rs, rt, rd, shamt, simm, imm, name } = d;
  const ops: Record<string, string> = { and: 'AND', or: 'OR', xor: 'XOR', nor: 'NOR', andi: 'AND', ori: 'OR', xori: 'XOR' };
  const hex16 = code('0x' + imm.toString(16).padStart(4, '0'));
  switch (name) {
    case 'nop':
      return '아무것도 하지 않습니다.';
    case 'add': case 'addu':
      return `${v('rs', rs)}과 ${v('rt', rt)}을 더해 ${into('rd', rd)}.` + overflow(name);
    case 'sub': case 'subu':
      return `${v('rs', rs)}에서 ${v('rt', rt)}을 빼 ${into('rd', rd)}.` + overflow(name);
    case 'and': case 'or': case 'xor':
      return `${v('rs', rs)}과 ${v('rt', rt)}을 비트마다 ${ops[name]} 해 ${into('rd', rd)}.`;
    case 'nor':
      return `${v('rs', rs)}과 ${v('rt', rt)}을 비트마다 OR 한 뒤 뒤집어 ${into('rd', rd)}.`;
    case 'slt': case 'sltu':
      return `${v('rs', rs)}이 ${v('rt', rt)}보다 작으면 1, 아니면 0을 ${into('rd', rd)}(${name === 'slt' ? 'Signed' : 'Unsigned'} 비교).`;
    case 'sll': case 'srl': case 'sra':
      return `${v('rt', rt)}을 ${num('shamt', shamt)}만큼 ${name === 'sll' ? '왼쪽' : '오른쪽'}으로 옮겨 ${into('rd', rd)}. `
        + `빈 자리는 ${name === 'sra' ? 'Sign bit로' : '0으로'} 채웁니다.`;
    case 'sllv': case 'srlv': case 'srav':
      return `${v('rt', rt)}을 ${v('rs', rs)}의 아래 5비트만큼 ${name === 'sllv' ? '왼쪽' : '오른쪽'}으로 옮겨 ${into('rd', rd)}.`;
    case 'mult': case 'multu':
      return `${v('rs', rs)}과 ${v('rt', rt)}을 곱해 64비트 결과의 위 절반을 HI 레지스터에, 아래 절반을 LO 레지스터에 넣습니다.`;
    case 'div': case 'divu':
      return `${v('rs', rs)}을 ${v('rt', rt)}으로 나눠 몫은 LO 레지스터에, 나머지는 HI 레지스터에 넣습니다.`;
    case 'mul':
      return `${v('rs', rs)}과 ${v('rt', rt)}을 곱한 결과의 아래 32비트를 ${into('rd', rd)}.`;
    case 'mfhi': return `HI 레지스터의 값을 ${into('rd', rd)}.`;
    case 'mflo': return `LO 레지스터의 값을 ${into('rd', rd)}.`;
    case 'mthi': return `${v('rs', rs)}을 HI 레지스터에 넣습니다.`;
    case 'mtlo': return `${v('rs', rs)}을 LO 레지스터에 넣습니다.`;
    case 'jr':
      return rs === 31
        ? `${f('rs', rs)}에 저장된 주소, 곧 이 함수를 부른 곳 다음으로 돌아갑니다.`
        : `${f('rs', rs)}에 저장된 주소로 Jump합니다.`;
    case 'jalr':
      return `다음 명령의 주소(${code(hex32(pc + 4))})를 ${f('rd', rd)}에 남기고 ${f('rs', rs)}에 저장된 주소로 Jump합니다.`;
    case 'syscall': {
      const what = SYSCALLS[regs[2]];
      return `${reg(2)} 레지스터에 저장된 번호에 따라 System call을 합니다${what ? `: ${what}` : ''}.`;
    }
    case 'break':
      return 'Breakpoint Exception을 일으킵니다.';
    case 'addi': case 'addiu':
      return `${v('rs', rs)}에 Sign-extend한 ${num('immediate', simm)} 값을 더해 ${into('rt', rt)}.` + overflow(name);
    case 'andi': case 'ori': case 'xori':
      return `${v('rs', rs)}과 Zero-extend한 immediate(${hex16}) 값을 비트마다 ${ops[name]} 해 ${into('rt', rt)}.`;
    case 'slti': case 'sltiu':
      return `${v('rs', rs)}이 ${num('immediate', simm)} 값보다 작으면 1, 아니면 0을 ${into('rt', rt)}(${name === 'slti' ? 'Signed' : 'Unsigned'} 비교).`;
    case 'lui':
      return `immediate(${hex16}) 값을 위 16비트에, 0을 아래 16비트에 두어 ${into('rt', rt)}(${code(hex32(imm << 16))}).`;
    case 'lw': case 'lh': case 'lhu': case 'lb': case 'lbu': case 'sw': case 'sh': case 'sb': {
      const unit = { w: 'Word', h: 'Halfword', b: 'Byte' }[name[1]]!;
      const where = `${f('rs', rs)}에 저장된 주소에서 ${num('offset', simm)}만큼 떨어진 곳`;
      return name[0] === 'l'
        ? `${where}의 ${unit}를 읽어 ${into('rt', rt)}${name.endsWith('u') ? '(Zero-extend)' : name === 'lw' ? '' : '(Sign-extend)'}.`
        : `${v('rt', rt)}${name === 'sw' ? '을' : `의 아래 ${unit}를`} ${where}에 씁니다.`;
    }
    case 'beq': case 'bne':
      return `${v('rs', rs)}과 ${v('rt', rt)}이 ${name === 'beq' ? '같으면' : '다르면'} ${code(hex32(d.destination))} 주소로 Branch합니다.`;
    case 'blez': case 'bgtz': case 'bltz': case 'bgez': {
      const cond = { blez: '0 이하이면', bgtz: '0보다 크면', bltz: '0보다 작으면', bgez: '0 이상이면' }[name]!;
      return `${v('rs', rs)}이 ${cond} ${code(hex32(d.destination))} 주소로 Branch합니다.`;
    }
    case 'j':
      return `${code(hex32(d.destination))} 주소로 Jump합니다.`;
    case 'jal':
      return `다음 명령의 주소(${code(hex32(pc + 4))})를 ${reg(31)} 레지스터에 남기고 ${code(hex32(d.destination))} 주소로 Jump합니다(함수 호출).`;
    default:
      return '';
  }
}

// ---- in English -------------------------------------------------------------

// "rs (`$t1`)", "the value in rs (`$t1`)".
const fEn = (field: string, n: number): string => `${field} (${reg(n)})`;
const numEn = (field: string, x: string | number): string => `${field} (${code(x)})`;

const SYSCALLS_EN: Record<number, string> = {
  1: 'print_int — prints the integer in `$a0`', 2: 'print_float — prints `$f12`', 3: 'print_double — prints `$f12`',
  4: 'print_string — prints the string `$a0` points to', 5: 'read_int — reads a line with an integer into `$v0`',
  6: 'read_float — reads a line with a real number into `$f0`', 7: 'read_double — reads a line with a real number into `$f0`',
  8: 'read_string — reads a line to where `$a0` points (at most `$a1` bytes)', 9: 'sbrk — allocates `$a0` bytes and puts their address in `$v0`',
  10: 'exit — ends the program', 11: 'print_char — prints the character in `$a0`', 12: 'read_char — reads one character into `$v0`',
  13: 'open', 14: 'read', 15: 'write', 16: 'close', 17: 'exit2 — ends the program with `$a0` as the exit code',
};

const overflowEn = (name: string): string => (name.endsWith('u')
  ? ' Overflow is ignored.'
  : ' A signed overflow raises an exception.');

function sentenceEn(d: DecodedInstruction, regs: readonly number[], pc: number): string {
  const { rs, rt, rd, shamt, simm, imm, name } = d;
  const ops: Record<string, string> = { and: 'AND', or: 'OR', xor: 'XOR', nor: 'NOR', andi: 'AND', ori: 'OR', xori: 'XOR' };
  const ve = (field: string, n: number) => `the value in ${fEn(field, n)}`;
  const hex16 = code('0x' + imm.toString(16).padStart(4, '0'));
  switch (name) {
    case 'nop':
      return 'Does nothing.';
    case 'add': case 'addu':
      return `Adds ${ve('rs', rs)} and ${ve('rt', rt)} and puts the sum in ${fEn('rd', rd)}.` + overflowEn(name);
    case 'sub': case 'subu':
      return `Subtracts ${ve('rt', rt)} from ${ve('rs', rs)} and puts the result in ${fEn('rd', rd)}.` + overflowEn(name);
    case 'and': case 'or': case 'xor':
      return `Takes the bitwise ${ops[name]} of ${ve('rs', rs)} and ${ve('rt', rt)} and puts it in ${fEn('rd', rd)}.`;
    case 'nor':
      return `Takes the bitwise OR of ${ve('rs', rs)} and ${ve('rt', rt)}, inverts it and puts it in ${fEn('rd', rd)}.`;
    case 'slt': case 'sltu':
      return `Puts 1 in ${fEn('rd', rd)} if ${ve('rs', rs)} is less than ${ve('rt', rt)}, else 0 (${name === 'slt' ? 'signed' : 'unsigned'} comparison).`;
    case 'sll': case 'srl': case 'sra':
      return `Shifts ${ve('rt', rt)} ${name === 'sll' ? 'left' : 'right'} by ${numEn('shamt', shamt)} and puts the result in ${fEn('rd', rd)}. `
        + `The vacated bits are filled with ${name === 'sra' ? 'the sign bit' : '0'}.`;
    case 'sllv': case 'srlv': case 'srav':
      return `Shifts ${ve('rt', rt)} ${name === 'sllv' ? 'left' : 'right'} by the low 5 bits of ${ve('rs', rs)} and puts the result in ${fEn('rd', rd)}.`;
    case 'mult': case 'multu':
      return `Multiplies ${ve('rs', rs)} by ${ve('rt', rt)} and puts the upper half of the 64-bit result in HI and the lower half in LO.`;
    case 'div': case 'divu':
      return `Divides ${ve('rs', rs)} by ${ve('rt', rt)} and puts the quotient in LO and the remainder in HI.`;
    case 'mul':
      return `Multiplies ${ve('rs', rs)} by ${ve('rt', rt)} and puts the lower 32 bits of the product in ${fEn('rd', rd)}.`;
    case 'mfhi': return `Copies the value in HI into ${fEn('rd', rd)}.`;
    case 'mflo': return `Copies the value in LO into ${fEn('rd', rd)}.`;
    case 'mthi': return `Copies ${ve('rs', rs)} into HI.`;
    case 'mtlo': return `Copies ${ve('rs', rs)} into LO.`;
    case 'jr':
      return rs === 31
        ? `Returns to the address in ${fEn('rs', rs)}: the instruction after the call to this function.`
        : `Jumps to the address in ${fEn('rs', rs)}.`;
    case 'jalr':
      return `Leaves the address of the next instruction (${code(hex32(pc + 4))}) in ${fEn('rd', rd)} and jumps to the address in ${fEn('rs', rs)}.`;
    case 'syscall': {
      const what = SYSCALLS_EN[regs[2]];
      return `Makes the system call that the number in ${reg(2)} selects${what ? `: ${what}` : ''}.`;
    }
    case 'break':
      return 'Raises a breakpoint exception.';
    case 'addi': case 'addiu':
      return `Adds the sign-extended ${numEn('immediate', simm)} to ${ve('rs', rs)} and puts the sum in ${fEn('rt', rt)}.` + overflowEn(name);
    case 'andi': case 'ori': case 'xori':
      return `Takes the bitwise ${ops[name]} of ${ve('rs', rs)} and the zero-extended immediate (${hex16}) and puts it in ${fEn('rt', rt)}.`;
    case 'slti': case 'sltiu':
      return `Puts 1 in ${fEn('rt', rt)} if ${ve('rs', rs)} is less than ${numEn('immediate', simm)}, else 0 (${name === 'slti' ? 'signed' : 'unsigned'} comparison).`;
    case 'lui':
      return `Puts immediate (${hex16}) in the upper 16 bits of ${fEn('rt', rt)} and 0 in the lower 16 (${code(hex32(imm << 16))}).`;
    case 'lw': case 'lh': case 'lhu': case 'lb': case 'lbu': case 'sw': case 'sh': case 'sb': {
      const unit = { w: 'word', h: 'halfword', b: 'byte' }[name[1]]!;
      const where = `the address in ${fEn('rs', rs)} plus ${numEn('offset', simm)}`;
      return name[0] === 'l'
        ? `Reads the ${unit} at ${where} and puts it in ${fEn('rt', rt)}${name.endsWith('u') ? ', zero-extended' : name === 'lw' ? '' : ', sign-extended'}.`
        : `Writes ${name === 'sw' ? '' : `the lower ${unit} of `}${ve('rt', rt)} to ${where}.`;
    }
    case 'beq': case 'bne':
      return `Branches to address ${code(hex32(d.destination))} if ${ve('rs', rs)} and ${ve('rt', rt)} are ${name === 'beq' ? 'equal' : 'not equal'}.`;
    case 'blez': case 'bgtz': case 'bltz': case 'bgez': {
      const cond = { blez: 'less than or equal to 0', bgtz: 'greater than 0', bltz: 'less than 0', bgez: 'greater than or equal to 0' }[name]!;
      return `Branches to address ${code(hex32(d.destination))} if ${ve('rs', rs)} is ${cond}.`;
    }
    case 'j':
      return `Jumps to address ${code(hex32(d.destination))}.`;
    case 'jal':
      return `Leaves the address of the next instruction (${code(hex32(pc + 4))}) in ${reg(31)} and jumps to address ${code(hex32(d.destination))} (a function call).`;
    default:
      return '';
  }
}

// `d` should come from decode(word, pc, convention), so that branches carry
// their destination; `regs` are the 32 general registers as they are now
// (only a syscall reads one: `$v0`).
export function explain(d: DecodedInstruction, regs: readonly number[], pc: number, lang: Lang = 'ko'): Explanation {
  if (!d.known) return { title: 'Not an instruction this simulator implements', sentence: '' };
  const expansion = mnemonicExpansion(d.name) || TITLES[d.name];
  return { title: expansion ? `${d.name} — ${expansion}` : d.name, sentence: sentence(d, regs, pc, lang) };
}

// Splits a sentence into plain and `code` parts, for a view to set.
export function codeParts(text: string): { text: string; code: boolean }[] {
  return text.split('`').map((t, i) => ({ text: t, code: i % 2 === 1 })).filter((p) => p.text !== '');
}
