/* One sentence that says what an instruction does -- the Inspector's line
   under the picture -- the same for every use of the instruction: the
   fields by name, with what this word puts in them (a register by its ABI
   name, a number), as MIPS's (core/explain.ts):

     slli — rs1(`a0`)에 저장된 값을 shamt(`2`)만큼 왼쪽으로 옮겨 rd(`a1`)에 넣습니다.
     Shifts the value in rs1 (`a0`) left by shamt (`2`) and puts the result in rd (`a1`).

   What a register holds at run time is not in it; what the word says is (a
   shift amount, an immediate, an offset).  Branches, jumps and auipc also
   take the instruction's own address (pc): their destination is relative to
   it.  Only ecall looks at a register: `a7` says which call it is.  The
   engine runs RV32IMFD (+ Zicsr); these are the I, M and F instructions, in
   all six formats.

   In Korean (the terms of art stay in English: Overflow, Exception, Word,
   Sign-extend ...) or in English (core/lang.ts).  Code -- register names,
   numbers -- is wrapped in backticks, which the view sets in the monospaced
   font.  A particle always follows a Korean noun or a closing parenthesis
   whose particle does not change (값을, 주소에서, rd(`a1`)에,
   offset(`4`)만큼), never a register name or a number. */

import type { DecodedInstruction } from './decoder.ts';
import { hex32 } from '../../../core/format.ts';
import type { Lang } from '../../../core/lang.ts';
import { abiName } from './registers.ts';

export interface Explanation {
  title: string;    // "addi — Add Immediate"
  sentence: string; // with `code` parts; '' when there is nothing to add
}

const code = (s: string | number): string => '`' + s + '`';
// A register by its ABI name (`t0`, `zero`); a field and what this word puts in it.
const reg = (n: number): string => code(n === 0 ? 'zero' : abiName(n));
const f = (field: string, n: number): string => `${field}(${reg(n)})`;
const num = (field: string, x: string | number): string => `${field}(${code(x)})`;
const v = (field: string, n: number): string => `${f(field, n)}에 저장된 값`;
const into = (field: string, n: number): string => `${f(field, n)}에 넣습니다`;

const TITLES: Record<string, string> = {
  add: 'Add', sub: 'Subtract', and: 'AND', or: 'OR', xor: 'XOR', sll: 'Shift Left Logical', srl: 'Shift Right Logical',
  sra: 'Shift Right Arithmetic', slt: 'Set if Less Than', sltu: 'Set if Less Than, Unsigned',
  mul: 'Multiply', div: 'Divide', divu: 'Divide, Unsigned', rem: 'Remainder', remu: 'Remainder, Unsigned',
  addi: 'Add Immediate', andi: 'AND Immediate', ori: 'OR Immediate', xori: 'XOR Immediate', slti: 'Set if Less Than Immediate',
  sltiu: 'Set if Less Than Immediate, Unsigned', slli: 'Shift Left Logical Immediate', srli: 'Shift Right Logical Immediate',
  srai: 'Shift Right Arithmetic Immediate', lw: 'Load Word', lh: 'Load Halfword', lb: 'Load Byte', lhu: 'Load Halfword, Unsigned',
  lbu: 'Load Byte, Unsigned', jalr: 'Jump And Link Register', ecall: 'Environment Call', ebreak: 'Environment Break',
  sb: 'Store Byte', sh: 'Store Halfword', sw: 'Store Word', beq: 'Branch if Equal', bne: 'Branch if Not Equal',
  blt: 'Branch if Less Than', bge: 'Branch if Greater or Equal', bltu: 'Branch if Less Than, Unsigned',
  bgeu: 'Branch if Greater or Equal, Unsigned', lui: 'Load Upper Immediate', auipc: 'Add Upper Immediate to PC',
  jal: 'Jump And Link', flw: 'Load Float Word', fld: 'Load Float Doubleword', fsw: 'Store Float Word', fsd: 'Store Float Doubleword',
};

// Branches: the condition in words.
const BRANCH: Record<string, { says: string; unsigned: boolean }> = {
  beq: { says: '같으면', unsigned: false },
  bne: { says: '다르면', unsigned: false },
  blt: { says: '보다 작으면', unsigned: false },
  bge: { says: '보다 크거나 같으면', unsigned: false },
  bltu: { says: '보다 작으면', unsigned: true },
  bgeu: { says: '보다 크거나 같으면', unsigned: true },
};

// RARS's syscalls (a7), by their names.
const SYSCALLS: Record<number, string> = {
  1: 'PrintInt — `a0` 레지스터의 정수를 출력', 4: 'PrintString — `a0` 값이 가리키는 문자열을 출력',
  5: 'ReadInt — 정수 한 줄을 읽어 `a0` 레지스터에', 8: 'ReadString — 한 줄을 `a0` 값이 가리키는 곳에(최대 `a1` 값만큼)',
  9: 'Sbrk — `a0` 값만큼 할당해 그 주소를 `a0` 레지스터에', 10: 'Exit — 프로그램을 끝냄', 11: 'PrintChar — `a0` 레지스터의 문자를 출력',
  12: 'ReadChar — 문자 하나를 읽어 `a0` 레지스터에', 93: 'Exit2 — `a0` 값을 종료 코드로 끝냄',
};

// A branch's or jal's destination: PC + offset.
const target = (pc: number | null, imm: number): string => (pc === null
  ? `PC에서 ${num('offset', imm)}만큼 떨어진 곳`
  : `PC에서 ${num('offset', imm)}만큼 떨어진 ${code(hex32((pc + imm) >>> 0))} 주소`);

function sentence(d: DecodedInstruction, regs: readonly number[], pc: number | null, lang: Lang): string {
  if (lang === 'en') return sentenceEn(d, regs, pc);
  const { rd, rs1, rs2, imm, name } = d;
  const to = `${into('rd', rd)}.`;
  const ops: Record<string, string> = { and: 'AND', or: 'OR', xor: 'XOR', andi: 'AND', ori: 'OR', xori: 'XOR' };
  // RISC-V's add, addi and sub never trap.
  const wraps = ' Overflow가 나도 Exception 없이 아래 32비트만 남깁니다.';
  const at = `${f('rs1', rs1)}에 저장된 주소에서 ${num('offset', imm)}만큼 떨어진 곳`;
  switch (name) {
    case 'add': return `${v('rs1', rs1)}과 ${v('rs2', rs2)}을 더해 ${to}${wraps}`;
    case 'sub': return `${v('rs1', rs1)}에서 ${v('rs2', rs2)}을 빼 ${to}${wraps}`;
    case 'and': case 'or': case 'xor': return `${v('rs1', rs1)}과 ${v('rs2', rs2)}을 비트마다 ${ops[name]} 해 ${to}`;
    case 'sll': case 'srl': case 'sra':
      return `${v('rs1', rs1)}을 ${v('rs2', rs2)}의 아래 5비트만큼 ${name === 'sll' ? '왼쪽' : '오른쪽'}으로 옮겨 ${to}`
        + (name === 'sra' ? ' 빈 자리는 Sign bit로 채웁니다.' : '');
    case 'slt': case 'sltu':
      return `${v('rs1', rs1)}이 ${v('rs2', rs2)}보다 작으면 1, 아니면 0을 ${to} (${name === 'slt' ? 'Signed' : 'Unsigned'} 비교)`;
    case 'mul': return `${v('rs1', rs1)}과 ${v('rs2', rs2)}을 곱한 결과의 아래 32비트를 ${to}`;
    case 'div': case 'divu': case 'rem': case 'remu':
      return `${v('rs1', rs1)}을 ${v('rs2', rs2)}으로 나눈 ${name.startsWith('div') ? '몫' : '나머지'}을 ${to}`;
    case 'addi':
      if (rd === 0 && rs1 === 0 && imm === 0) return '아무것도 하지 않습니다(`nop`).';
      if (rs1 === 0) return `${num('imm', imm)} 값을 ${to} (\`li\` 명령이 이렇게 바뀝니다.)`;
      return `${v('rs1', rs1)}에 ${num('imm', imm)} 값을 더해 ${to}${wraps}`;
    case 'andi': case 'ori': case 'xori': return `${v('rs1', rs1)}과 ${num('imm', imm)} 값을 비트마다 ${ops[name]} 해 ${to}`;
    case 'slti': case 'sltiu':
      return `${v('rs1', rs1)}이 ${num('imm', imm)} 값보다 작으면 1, 아니면 0을 ${to} (${name === 'slti' ? 'Signed' : 'Unsigned'} 비교)`;
    case 'slli': case 'srli': case 'srai':
      return `${v('rs1', rs1)}을 ${num('shamt', d.rs2)}만큼 ${name === 'slli' ? '왼쪽' : '오른쪽'}으로 옮겨 ${to}`
        + (name === 'srai' ? ' 빈 자리는 Sign bit로 채웁니다.' : '');
    case 'lw': case 'lh': case 'lb': case 'lhu': case 'lbu': {
      const unit = { lw: 'Word', lh: 'Halfword', lb: 'Byte', lhu: 'Halfword', lbu: 'Byte' }[name];
      return `${at}의 ${unit}를 읽어 ${to}`
        + (name.endsWith('u') ? ' 위쪽 비트는 0으로 채웁니다(Zero-extend).' : name === 'lw' ? '' : ' 위쪽 비트는 Sign bit로 채웁니다(Sign-extend).');
    }
    case 'jalr':
      return `${at}으로 Jump합니다. `
        + (rd === 0 ? '돌아올 주소는 남기지 않습니다(`ret`, `jr`).' : `다음 명령의 주소를 ${f('rd', rd)}에 남깁니다.`);
    case 'ecall': {
      const call = SYSCALLS[regs[17] ?? -1];
      return `${code('a7')} 레지스터에 저장된 번호에 따라 System call을 합니다${call ? `: ${call}` : ''}.`;
    }
    case 'ebreak': return 'Breakpoint Exception을 일으켜 여기서 멈춥니다(디버거로 제어를 넘깁니다).';
    case 'sw': case 'sh': case 'sb': {
      return `${v('rs2', rs2)}${name === 'sw' ? '을' : `의 아래 ${name === 'sh' ? 'Halfword' : 'Byte'}를`} ${at}에 씁니다.`;
    }
    case 'flw': case 'fld': case 'fsw': case 'fsd': {
      const unit = name.endsWith('w') ? 'Word' : 'Doubleword';
      return name.startsWith('fl')
        ? `${at}의 ${unit}를 읽어 rd(${code(`f${rd}`)})에 넣습니다.`
        : `rs2(${code(`f${rs2}`)})에 저장된 ${unit}를 ${at}에 씁니다.`;
    }
    case 'beq': case 'bne': case 'blt': case 'bge': case 'bltu': case 'bgeu': {
      const b = BRANCH[name];
      const cmp = name === 'beq' || name === 'bne' ? `${v('rs1', rs1)}과 ${v('rs2', rs2)}이 ${b.says}` : `${v('rs1', rs1)}이 ${v('rs2', rs2)}${b.says}`;
      return `${cmp} ${target(pc, imm)}로 Branch합니다${b.unsigned ? '(Unsigned 비교)' : ''}.`;
    }
    case 'lui': return `${num('imm', hex32(imm))} 값을 ${to} 위 20비트에 값을 두고 아래 12비트는 0으로 채웁니다.`;
    case 'auipc':
      return pc === null ? `PC(명령 자신의 주소)에 ${num('imm', hex32(imm))} 값을 더해 ${to}`
        : `PC(${code(hex32(pc))})에 ${num('imm', hex32(imm))} 값을 더한 ${code(hex32((pc + imm) >>> 0))} 값을 ${to}`
          + ' (`la` 명령은 `auipc` 명령과 `addi` 명령 둘로 바뀌는데, 그 앞의 것입니다.)';
    case 'jal': {
      return `${target(pc, imm)}로 Jump합니다. ` + (rd === 0 ? '돌아올 주소는 남기지 않습니다(`j` 명령).'
        : `다음 명령의 주소${pc === null ? '' : `(${code(hex32((pc + 4) >>> 0))})`}를 ${f('rd', rd)}에 남깁니다.`);
    }
    default: return '';
  }
}

// ---- in English -------------------------------------------------------------

// "rs1 (`t0`)", "the value in rs1 (`t0`)".
const fEn = (field: string, n: number): string => `${field} (${reg(n)})`;
const numEn = (field: string, x: string | number): string => `${field} (${code(x)})`;

const BRANCH_EN: Record<string, string> = {
  beq: 'are equal', bne: 'are not equal', blt: 'is less than', bge: 'is greater than or equal to', bltu: 'is less than', bgeu: 'is greater than or equal to',
};

const SYSCALLS_EN: Record<number, string> = {
  1: 'PrintInt — prints the integer in `a0`', 4: 'PrintString — prints the string `a0` points to',
  5: 'ReadInt — reads a line with an integer into `a0`', 8: 'ReadString — reads a line to where `a0` points (at most `a1` bytes)',
  9: 'Sbrk — allocates `a0` bytes and puts their address in `a0`', 10: 'Exit — ends the program', 11: 'PrintChar — prints the character in `a0`',
  12: 'ReadChar — reads one character into `a0`', 93: 'Exit2 — ends the program with `a0` as the exit code',
};

const targetEn = (pc: number | null, imm: number): string => (pc === null
  ? `PC plus ${numEn('offset', imm)}`
  : `address ${code(hex32((pc + imm) >>> 0))}, PC plus ${numEn('offset', imm)}`);

function sentenceEn(d: DecodedInstruction, regs: readonly number[], pc: number | null): string {
  const { rd, rs1, rs2, imm, name } = d;
  const ve = (field: string, n: number) => `the value in ${fEn(field, n)}`;
  const to = `in ${fEn('rd', rd)}.`;
  const ops: Record<string, string> = { and: 'AND', or: 'OR', xor: 'XOR', andi: 'AND', ori: 'OR', xori: 'XOR' };
  const at = `the address in ${fEn('rs1', rs1)} plus ${numEn('offset', imm)}`;
  const wraps = ' On overflow it keeps the lower 32 bits; there is no exception.';
  switch (name) {
    case 'add': return `Adds ${ve('rs1', rs1)} and ${ve('rs2', rs2)} and puts the sum ${to}${wraps}`;
    case 'sub': return `Subtracts ${ve('rs2', rs2)} from ${ve('rs1', rs1)} and puts the result ${to}${wraps}`;
    case 'and': case 'or': case 'xor': return `Takes the bitwise ${ops[name]} of ${ve('rs1', rs1)} and ${ve('rs2', rs2)} and puts it ${to}`;
    case 'sll': case 'srl': case 'sra':
      return `Shifts ${ve('rs1', rs1)} ${name === 'sll' ? 'left' : 'right'} by the low 5 bits of ${ve('rs2', rs2)} and puts the result ${to}`
        + (name === 'sra' ? ' The vacated bits are filled with the sign bit.' : '');
    case 'slt': case 'sltu':
      return `Puts 1 ${to.slice(0, -1)} if ${ve('rs1', rs1)} is less than ${ve('rs2', rs2)}, else 0 (${name === 'slt' ? 'signed' : 'unsigned'} comparison).`;
    case 'mul': return `Multiplies ${ve('rs1', rs1)} by ${ve('rs2', rs2)} and puts the lower 32 bits of the product ${to}`;
    case 'div': case 'divu': case 'rem': case 'remu':
      return `Divides ${ve('rs1', rs1)} by ${ve('rs2', rs2)} and puts the ${name.startsWith('div') ? 'quotient' : 'remainder'} ${to}`;
    case 'addi':
      if (rd === 0 && rs1 === 0 && imm === 0) return 'Does nothing (`nop`).';
      if (rs1 === 0) return `Puts ${numEn('imm', imm)} ${to} (This is what the \`li\` instruction becomes.)`;
      return `Adds ${numEn('imm', imm)} to ${ve('rs1', rs1)} and puts the sum ${to}${wraps}`;
    case 'andi': case 'ori': case 'xori': return `Takes the bitwise ${ops[name]} of ${ve('rs1', rs1)} and ${numEn('imm', imm)} and puts it ${to}`;
    case 'slti': case 'sltiu':
      return `Puts 1 ${to.slice(0, -1)} if ${ve('rs1', rs1)} is less than ${numEn('imm', imm)}, else 0 (${name === 'slti' ? 'signed' : 'unsigned'} comparison).`;
    case 'slli': case 'srli': case 'srai':
      return `Shifts ${ve('rs1', rs1)} ${name === 'slli' ? 'left' : 'right'} by ${numEn('shamt', d.rs2)} and puts the result ${to}`
        + (name === 'srai' ? ' The vacated bits are filled with the sign bit.' : '');
    case 'lw': case 'lh': case 'lb': case 'lhu': case 'lbu': {
      const unit = { lw: 'word', lh: 'halfword', lb: 'byte', lhu: 'halfword', lbu: 'byte' }[name];
      return `Reads the ${unit} at ${at} and puts it ${to}`
        + (name.endsWith('u') ? ' The upper bits are filled with 0 (zero-extended).' : name === 'lw' ? '' : ' The upper bits are filled with the sign bit (sign-extended).');
    }
    case 'jalr':
      return `Jumps to ${at}. `
        + (rd === 0 ? 'No return address is kept (`ret`, `jr`).' : `The address of the next instruction is left in ${fEn('rd', rd)}.`);
    case 'ecall': {
      const call = SYSCALLS_EN[regs[17] ?? -1];
      return `Makes the system call that the number in ${code('a7')} selects${call ? `: ${call}` : ''}.`;
    }
    case 'ebreak': return 'Raises a breakpoint exception and stops here (control passes to the debugger).';
    case 'sw': case 'sh': case 'sb': {
      return `Writes ${name === 'sw' ? '' : `the lower ${name === 'sh' ? 'halfword' : 'byte'} of `}${ve('rs2', rs2)} to ${at}.`;
    }
    case 'flw': case 'fld': case 'fsw': case 'fsd': {
      const unit = name.endsWith('w') ? 'word' : 'doubleword';
      return name.startsWith('fl')
        ? `Reads the ${unit} at ${at} and puts it in rd (${code(`f${rd}`)}).`
        : `Writes the ${unit} in rs2 (${code(`f${rs2}`)}) to ${at}.`;
    }
    case 'beq': case 'bne': case 'blt': case 'bge': case 'bltu': case 'bgeu': {
      const b = BRANCH[name];
      const cmp = name === 'beq' || name === 'bne' ? `${ve('rs1', rs1)} and ${ve('rs2', rs2)} ${BRANCH_EN[name]}` : `${ve('rs1', rs1)} ${BRANCH_EN[name]} ${ve('rs2', rs2)}`;
      return `Branches to ${targetEn(pc, imm)}, if ${cmp}${b.unsigned ? ' (unsigned comparison)' : ''}.`;
    }
    case 'lui': return `Puts ${numEn('imm', hex32(imm))} ${to} The value goes in the upper 20 bits; the lower 12 bits are 0.`;
    case 'auipc':
      return pc === null ? `Adds ${numEn('imm', hex32(imm))} to PC (the instruction's own address) and puts the result ${to}`
        : `Adds ${numEn('imm', hex32(imm))} to PC (${code(hex32(pc))}) and puts the result, ${code(hex32((pc + imm) >>> 0))}, ${to}`
          + ' (The `la` instruction becomes two, `auipc` and `addi`; this is the first.)';
    case 'jal':
      return `Jumps to ${targetEn(pc, imm)}. ` + (rd === 0 ? 'No return address is kept (the `j` instruction).'
        : `The address of the next instruction${pc === null ? '' : ` (${code(hex32((pc + 4) >>> 0))})`} is left in ${fEn('rd', rd)}.`);
    default: return '';
  }
}

export function explain(d: DecodedInstruction, regs: readonly number[], pc: number | null = null, lang: Lang = 'ko'): Explanation {
  const t = TITLES[d.name];
  return { title: d.name ? (t ? `${d.name} — ${t}` : d.name) : 'Unknown instruction', sentence: sentence(d, regs, pc, lang) };
}

/* "rs1(`t0`)에 ..." -> parts, the backticked ones as code. */
export function codeParts(text: string): { text: string; code: boolean }[] {
  return text.split('`').map((t, i) => ({ text: t, code: i % 2 === 1 })).filter((p) => p.text !== '');
}
