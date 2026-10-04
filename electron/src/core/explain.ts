/* One sentence that says what an instruction does, with the values it will
   use -- the Inspector's last line:

     sra — Shift Right Arithmetic. `$t6` 값(`0x80000001`)을 shamt 값(`1`)만큼
     오른쪽으로 옮겨 `$s1` 레지스터에 넣습니다. 빈 자리는 Sign bit로 채웁니다.

   New in this front end; the Qt build has no such line.  Pure: it takes the
   decoded word and the register values *before* the instruction runs.

   In Korean (the terms of art stay in English: Overflow, Exception,
   Immediate, Offset, Word, Sign-extend ...) or in English (core/lang.ts):

     sra — Shift Right Arithmetic. Shifts `$t6` (`0x80000001`) right by
     shamt (`1`) and puts the result in `$s1`. The vacated bits are filled
     with the sign bit.

   Everything that is code -- register names, hexadecimal and other numbers
   taken from the machine -- is wrapped in backticks, and the view sets those
   parts in the monospaced font.  That is how "every hexadecimal literal is
   monospaced" holds here: Pretendard draws 0x1 as 0×1 (docs/PORTING.md).
   A particle always follows a Korean noun or a term whose reading is
   settled -- 값(`…`)을, Immediate 값(`5`)을, Offset(`4`)을, `0x…` 주소로,
   `$t7` 레지스터에, Overflow가 -- never a register name or a number,
   whose reading ($a0: 에이제로? 에이영?  5: 오) would decide between 을/를,
   이/가, 로/으로 (tests/renderer/particles.test.ts).
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
const val = (regs: readonly number[], n: number): string => `${reg(n)} 값(${code(hex32(regs[n]))})`;

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
  switch (name) {
    case 'nop':
      return '아무것도 하지 않습니다.';
    case 'add': case 'addu':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 더해 ${reg(rd)} 레지스터에 넣습니다.` + overflow(name);
    case 'sub': case 'subu':
      return `${val(regs, rs)}에서 ${val(regs, rt)}을 빼 ${reg(rd)} 레지스터에 넣습니다.` + overflow(name);
    case 'and': case 'or': case 'xor':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 비트마다 ${ops[name]} 해 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'nor':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 비트마다 OR 한 뒤 뒤집어 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'slt': case 'sltu':
      return `${val(regs, rs)}이 ${val(regs, rt)}보다 작으면 1, 아니면 0을 ${reg(rd)} 레지스터에 넣습니다(${name === 'slt' ? 'Signed' : 'Unsigned'} 비교).`;
    case 'sll': case 'srl': case 'sra':
      return `${val(regs, rt)}을 shamt 값(${code(shamt)})만큼 ${name === 'sll' ? '왼쪽' : '오른쪽'}으로 옮겨 ${reg(rd)} 레지스터에 넣습니다. `
        + `빈 자리는 ${name === 'sra' ? 'Sign bit로' : '0으로'} 채웁니다.`;
    case 'sllv': case 'srlv': case 'srav':
      return `${val(regs, rt)}을 ${reg(rs)} 레지스터의 아래 5비트(${code(regs[rs] & 31)})만큼 ${name === 'sllv' ? '왼쪽' : '오른쪽'}으로 옮겨 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'mult': case 'multu':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 곱해 64비트 결과의 위 절반을 HI 레지스터에, 아래 절반을 LO 레지스터에 넣습니다.`;
    case 'div': case 'divu':
      return `${val(regs, rs)}을 ${val(regs, rt)}으로 나눠 몫은 LO 레지스터에, 나머지는 HI 레지스터에 넣습니다.`;
    case 'mul':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 곱한 아래 32비트를 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'mfhi': return `HI 레지스터 값을 ${reg(rd)} 레지스터에 옮깁니다.`;
    case 'mflo': return `LO 레지스터 값을 ${reg(rd)} 레지스터에 옮깁니다.`;
    case 'mthi': return `${val(regs, rs)}을 HI 레지스터에 옮깁니다.`;
    case 'mtlo': return `${val(regs, rs)}을 LO 레지스터에 옮깁니다.`;
    case 'jr':
      return rs === 31
        ? `${val(regs, rs)}이 가리키는 곳, 곧 이 함수를 부른 곳 다음으로 돌아갑니다.`
        : `${val(regs, rs)}이 가리키는 주소로 Jump합니다.`;
    case 'jalr':
      return `돌아올 주소(${code(hex32(pc + 4))})를 ${reg(rd)} 레지스터에 넣고 ${val(regs, rs)}이 가리키는 주소로 Jump합니다.`;
    case 'syscall': {
      const what = SYSCALLS[regs[2]];
      return `${val(regs, 2)}에 따라 System call을 합니다${what ? `: ${what}` : ''}.`;
    }
    case 'break':
      return 'Breakpoint Exception을 일으킵니다.';
    case 'addi': case 'addiu':
      return `${val(regs, rs)}에 Sign-extend한 Immediate 값(${code(simm)})을 더해 ${reg(rt)} 레지스터에 넣습니다.` + overflow(name);
    case 'andi': case 'ori': case 'xori':
      return `${val(regs, rs)}과 Zero-extend한 Immediate 값(${code('0x' + imm.toString(16).padStart(4, '0'))})을 비트마다 ${ops[name]} 해 ${reg(rt)} 레지스터에 넣습니다.`;
    case 'slti': case 'sltiu':
      return `${val(regs, rs)}이 Immediate 값(${code(simm)})보다 작으면 1, 아니면 0을 ${reg(rt)} 레지스터에 넣습니다(${name === 'slti' ? 'Signed' : 'Unsigned'} 비교).`;
    case 'lui':
      return `Immediate 값(${code('0x' + imm.toString(16).padStart(4, '0'))})을 위 16비트에, 0을 아래 16비트에 두어 ${reg(rt)} 레지스터에 넣습니다(${code(hex32(imm << 16))}).`;
    case 'lw': case 'lh': case 'lhu': case 'lb': case 'lbu': case 'sw': case 'sh': case 'sb': {
      const addr = (regs[rs] + simm) >>> 0;
      const unit = { w: 'Word', h: 'Halfword', b: 'Byte' }[name[1]]!;
      const where = `${val(regs, rs)}${simm < 0 ? '에서' : '에'} Offset(${code(Math.abs(simm))})을 ${simm < 0 ? '뺀' : '더한'} 주소(${code(hex32(addr))})`;
      return name[0] === 'l'
        ? `${where}의 ${unit}를 읽어 ${reg(rt)} 레지스터에 넣습니다${name.endsWith('u') ? '(Zero-extend)' : name === 'lw' ? '' : '(Sign-extend)'}.`
        : `${val(regs, rt)}의 ${name === 'sw' ? '' : '아래 '}${unit}를 ${where}에 씁니다.`;
    }
    case 'beq': case 'bne':
      return `${val(regs, rs)}과 ${val(regs, rt)}이 ${name === 'beq' ? '같으면' : '다르면'} ${code(hex32(d.destination))} 주소로 Branch합니다.`;
    case 'blez': case 'bgtz': case 'bltz': case 'bgez': {
      const cond = { blez: '0 이하이면', bgtz: '0보다 크면', bltz: '0보다 작으면', bgez: '0 이상이면' }[name]!;
      return `${val(regs, rs)}이 ${cond} ${code(hex32(d.destination))} 주소로 Branch합니다.`;
    }
    case 'j':
      return `${code(hex32(d.destination))} 주소로 Jump합니다.`;
    case 'jal':
      return `돌아올 주소(${code(hex32(pc + 4))})를 ${reg(31)} 레지스터에 넣고 ${code(hex32(d.destination))} 주소로 Jump합니다(함수 호출).`;
    default:
      return '';
  }
}

// ---- in English -------------------------------------------------------------

const valEn = (regs: readonly number[], n: number): string => `${reg(n)} (${code(hex32(regs[n]))})`;

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
  const v = (n: number) => valEn(regs, n);
  const hex16 = code('0x' + imm.toString(16).padStart(4, '0'));
  switch (name) {
    case 'nop':
      return 'Does nothing.';
    case 'add': case 'addu':
      return `Adds ${v(rs)} and ${v(rt)} and puts the sum in ${reg(rd)}.` + overflowEn(name);
    case 'sub': case 'subu':
      return `Subtracts ${v(rt)} from ${v(rs)} and puts the result in ${reg(rd)}.` + overflowEn(name);
    case 'and': case 'or': case 'xor':
      return `Takes the bitwise ${ops[name]} of ${v(rs)} and ${v(rt)} and puts it in ${reg(rd)}.`;
    case 'nor':
      return `Takes the bitwise OR of ${v(rs)} and ${v(rt)}, inverts it and puts it in ${reg(rd)}.`;
    case 'slt': case 'sltu':
      return `Puts 1 in ${reg(rd)} if ${v(rs)} is less than ${v(rt)}, else 0 (${name === 'slt' ? 'signed' : 'unsigned'} comparison).`;
    case 'sll': case 'srl': case 'sra':
      return `Shifts ${v(rt)} ${name === 'sll' ? 'left' : 'right'} by shamt (${code(shamt)}) and puts the result in ${reg(rd)}. `
        + `The vacated bits are filled with ${name === 'sra' ? 'the sign bit' : '0'}.`;
    case 'sllv': case 'srlv': case 'srav':
      return `Shifts ${v(rt)} ${name === 'sllv' ? 'left' : 'right'} by the low 5 bits of ${reg(rs)} (${code(regs[rs] & 31)}) and puts the result in ${reg(rd)}.`;
    case 'mult': case 'multu':
      return `Multiplies ${v(rs)} by ${v(rt)} and puts the upper half of the 64-bit result in HI and the lower half in LO.`;
    case 'div': case 'divu':
      return `Divides ${v(rs)} by ${v(rt)} and puts the quotient in LO and the remainder in HI.`;
    case 'mul':
      return `Multiplies ${v(rs)} by ${v(rt)} and puts the lower 32 bits of the product in ${reg(rd)}.`;
    case 'mfhi': return `Copies HI into ${reg(rd)}.`;
    case 'mflo': return `Copies LO into ${reg(rd)}.`;
    case 'mthi': return `Copies ${v(rs)} into HI.`;
    case 'mtlo': return `Copies ${v(rs)} into LO.`;
    case 'jr':
      return rs === 31
        ? `Returns to the address in ${v(rs)}: the instruction after the call to this function.`
        : `Jumps to the address in ${v(rs)}.`;
    case 'jalr':
      return `Puts the return address (${code(hex32(pc + 4))}) in ${reg(rd)} and jumps to the address in ${v(rs)}.`;
    case 'syscall': {
      const what = SYSCALLS_EN[regs[2]];
      return `Makes the system call that ${v(2)} selects${what ? `: ${what}` : ''}.`;
    }
    case 'break':
      return 'Raises a breakpoint exception.';
    case 'addi': case 'addiu':
      return `Adds the sign-extended immediate (${code(simm)}) to ${v(rs)} and puts the sum in ${reg(rt)}.` + overflowEn(name);
    case 'andi': case 'ori': case 'xori':
      return `Takes the bitwise ${ops[name]} of ${v(rs)} and the zero-extended immediate (${hex16}) and puts it in ${reg(rt)}.`;
    case 'slti': case 'sltiu':
      return `Puts 1 in ${reg(rt)} if ${v(rs)} is less than the immediate (${code(simm)}), else 0 (${name === 'slti' ? 'signed' : 'unsigned'} comparison).`;
    case 'lui':
      return `Puts the immediate (${hex16}) in the upper 16 bits of ${reg(rt)} and 0 in the lower 16 (${code(hex32(imm << 16))}).`;
    case 'lw': case 'lh': case 'lhu': case 'lb': case 'lbu': case 'sw': case 'sh': case 'sb': {
      const addr = (regs[rs] + simm) >>> 0;
      const unit = { w: 'word', h: 'halfword', b: 'byte' }[name[1]]!;
      const where = `${v(rs)} ${simm < 0 ? '-' : '+'} offset ${code(Math.abs(simm))} = ${code(hex32(addr))}`;
      return name[0] === 'l'
        ? `Reads the ${unit} at ${where} and puts it in ${reg(rt)}${name.endsWith('u') ? ', zero-extended' : name === 'lw' ? '' : ', sign-extended'}.`
        : `Writes the ${name === 'sw' ? '' : 'lower '}${unit} of ${v(rt)} to ${where}.`;
    }
    case 'beq': case 'bne':
      return `Branches to address ${code(hex32(d.destination))} if ${v(rs)} and ${v(rt)} are ${name === 'beq' ? 'equal' : 'not equal'}.`;
    case 'blez': case 'bgtz': case 'bltz': case 'bgez': {
      const cond = { blez: 'less than or equal to 0', bgtz: 'greater than 0', bltz: 'less than 0', bgez: 'greater than or equal to 0' }[name]!;
      return `Branches to address ${code(hex32(d.destination))} if ${v(rs)} is ${cond}.`;
    }
    case 'j':
      return `Jumps to address ${code(hex32(d.destination))}.`;
    case 'jal':
      return `Puts the return address (${code(hex32(pc + 4))}) in ${reg(31)} and jumps to address ${code(hex32(d.destination))} (a function call).`;
    default:
      return '';
  }
}

// `d` should come from decode(word, pc, convention), so that branches carry
// their destination; `regs` are the 32 general registers as they are now.
export function explain(d: DecodedInstruction, regs: readonly number[], pc: number, lang: Lang = 'ko'): Explanation {
  if (!d.known) return { title: 'Not an instruction this simulator implements', sentence: '' };
  const expansion = mnemonicExpansion(d.name) || TITLES[d.name];
  return { title: expansion ? `${d.name} — ${expansion}` : d.name, sentence: sentence(d, regs, pc, lang) };
}

// Splits a sentence into plain and `code` parts, for a view to set.
export function codeParts(text: string): { text: string; code: boolean }[] {
  return text.split('`').map((t, i) => ({ text: t, code: i % 2 === 1 })).filter((p) => p.text !== '');
}
