/* One sentence that says what an instruction does, with the values it will
   use -- the Inspector's line under the picture.  Pure: it takes the
   decoded word and the register values *before* the instruction runs.
   The engine runs RV32IMFD (+ Zicsr); these are the I, M and F
   instructions the course meets, in all six formats.  Branches, jumps and auipc also
   need the instruction's own address (pc): their target is relative to it.

   Korean sentences; the terms of art stay in English (Overflow, Exception,
   Immediate, Offset, Word, Sign-extend ...), as the course says them.

   Code -- register names, numbers taken from the machine -- is wrapped in
   backticks, which the view sets in the monospaced font.  A particle always
   follows a Korean noun or a term whose reading is settled (값(`…`)을,
   Offset(`4`)을, `x5` 레지스터에, Overflow가), never a register name or a
   number, whose reading would decide between 을/를, 이/가. */

import type { DecodedInstruction } from './decoder.ts';
import { hex32 } from '../../../core/format.ts';
import { abiName } from './registers.ts';

export interface Explanation {
  title: string;    // "addi — Add Immediate"
  sentence: string; // with `code` parts; '' when there is nothing to add
}

const code = (s: string | number): string => '`' + s + '`';
const reg = (n: number): string => code(`x${n}`) + (n === 0 ? '' : `(${code(abiName(n))})`);
const val = (regs: readonly number[], n: number): string => `${reg(n)} 값(${code(hex32(regs[n] ?? 0))})`;

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

// Branches: the condition in words, and whether it holds for the values.
const BRANCH: Record<string, { says: string; holds: (a: number, b: number) => boolean; unsigned: boolean }> = {
  beq: { says: '같으면', holds: (a, b) => a === b, unsigned: false },
  bne: { says: '다르면', holds: (a, b) => a !== b, unsigned: false },
  blt: { says: '보다 작으면', holds: (a, b) => (a | 0) < (b | 0), unsigned: false },
  bge: { says: '보다 크거나 같으면', holds: (a, b) => (a | 0) >= (b | 0), unsigned: false },
  bltu: { says: '보다 작으면', holds: (a, b) => a >>> 0 < b >>> 0, unsigned: true },
  bgeu: { says: '보다 크거나 같으면', holds: (a, b) => a >>> 0 >= b >>> 0, unsigned: true },
};

// RARS's syscalls (a7), by the names the course uses.
const SYSCALLS: Record<number, string> = {
  1: 'PrintInt — `a0` 레지스터의 정수를 출력', 4: 'PrintString — `a0` 값이 가리키는 문자열을 출력',
  5: 'ReadInt — 정수 한 줄을 읽어 `a0` 레지스터에', 8: 'ReadString — 한 줄을 `a0` 값이 가리키는 곳에(최대 `a1` 값만큼)',
  9: 'Sbrk — `a0` 값만큼 할당해 그 주소를 `a0` 레지스터에', 10: 'Exit — 프로그램을 끝냄', 11: 'PrintChar — `a0` 레지스터의 문자를 출력',
  12: 'ReadChar — 문자 하나를 읽어 `a0` 레지스터에', 93: 'Exit2 — `a0` 값을 종료 코드로 끝냄',
};

// A branch's or jal's destination: PC + Offset.
const target = (pc: number | null, imm: number): string => (pc === null
  ? `PC에서 Offset(${code(imm)})만큼 떨어진 곳`
  : `${code(hex32((pc + imm) >>> 0))} 주소(PC + Offset ${code(imm)})`);

function sentence(d: DecodedInstruction, regs: readonly number[], pc: number | null): string {
  const { rd, rs1, rs2, imm, name } = d;
  const to = `${reg(rd)} 레지스터에 넣습니다.`;
  const ops: Record<string, string> = { and: 'AND', or: 'OR', xor: 'XOR', andi: 'AND', ori: 'OR', xori: 'XOR' };
  // RISC-V's add, addi and sub never trap.
  const wraps = ' Overflow가 나도 Exception 없이 아래 32비트만 남깁니다.';
  switch (name) {
    case 'add': return `${val(regs, rs1)}과 ${val(regs, rs2)}을 더해 ${to}${wraps}`;
    case 'sub': return `${val(regs, rs1)}에서 ${val(regs, rs2)}을 빼 ${to}${wraps}`;
    case 'and': case 'or': case 'xor': return `${val(regs, rs1)}과 ${val(regs, rs2)}을 비트마다 ${ops[name]} 해 ${to}`;
    case 'sll': case 'srl': case 'sra':
      return `${val(regs, rs1)}을 ${val(regs, rs2)}의 아래 5비트만큼 ${name === 'sll' ? '왼쪽' : '오른쪽'}으로 옮겨 ${to}`
        + (name === 'sra' ? ' 빈 자리는 Sign bit로 채웁니다.' : '');
    case 'slt': case 'sltu':
      return `${val(regs, rs1)}이 ${val(regs, rs2)}보다 작으면 1, 아니면 0을 ${to} (${name === 'slt' ? 'Signed' : 'Unsigned'} 비교)`;
    case 'mul': return `${val(regs, rs1)}과 ${val(regs, rs2)}을 곱한 값의 아래 32비트를 ${to}`;
    case 'div': case 'divu': case 'rem': case 'remu':
      return `${val(regs, rs1)}을 ${val(regs, rs2)}로 나눈 ${name.startsWith('div') ? '몫' : '나머지'}을 ${to}`;
    case 'addi':
      if (rd === 0 && rs1 === 0 && imm === 0) return '아무것도 하지 않습니다(`nop`).';
      if (rs1 === 0) return `Immediate 값(${code(imm)})을 ${to} (\`li\` 명령이 이렇게 바뀝니다.)`;
      return `${val(regs, rs1)}에 Immediate 값(${code(imm)})을 더해 ${to}${wraps}`;
    case 'andi': case 'ori': case 'xori': return `${val(regs, rs1)}과 Immediate 값(${code(imm)})을 비트마다 ${ops[name]} 해 ${to}`;
    case 'slti': case 'sltiu':
      return `${val(regs, rs1)}이 Immediate 값(${code(imm)})보다 작으면 1, 아니면 0을 ${to} (${name === 'slti' ? 'Signed' : 'Unsigned'} 비교)`;
    case 'slli': case 'srli': case 'srai':
      return `${val(regs, rs1)}을 shamt 값(${code(d.rs2)})만큼 ${name === 'slli' ? '왼쪽' : '오른쪽'}으로 옮겨 ${to}`
        + (name === 'srai' ? ' 빈 자리는 Sign bit로 채웁니다.' : '');
    case 'lw': case 'lh': case 'lb': case 'lhu': case 'lbu': {
      const addr = ((regs[rs1] ?? 0) + imm) >>> 0;
      const unit = { lw: 'Word', lh: 'Halfword', lb: 'Byte', lhu: 'Halfword', lbu: 'Byte' }[name];
      return `${val(regs, rs1)}에 Offset(${code(imm)})을 더한 ${code(hex32(addr))} 주소의 ${unit}를 읽어 ${to}`
        + (name.endsWith('u') ? ' 위쪽 비트는 0으로 채웁니다(Zero-extend).' : name === 'lw' ? '' : ' 위쪽 비트는 Sign bit로 채웁니다(Sign-extend).');
    }
    case 'jalr': {
      const dest = (((regs[rs1] ?? 0) + imm) & ~1) >>> 0;
      return `${code(hex32(dest))} 주소로 Jump합니다(${val(regs, rs1)} + Offset ${code(imm)}). `
        + (rd === 0 ? '돌아올 주소는 남기지 않습니다(`ret`, `jr`).' : `다음 명령의 주소를 ${reg(rd)} 레지스터에 남깁니다.`);
    }
    case 'ecall': {
      const call = SYSCALLS[regs[17] ?? -1];
      return call ? `${code('a7')} 값(${code(regs[17])}): ${call}.` : `${code('a7')} 값(${code(regs[17] ?? 0)})에 따라 System call을 합니다.`;
    }
    case 'ebreak': return 'Breakpoint Exception을 일으켜 여기서 멈춥니다(디버거로 제어를 넘깁니다).';
    case 'sw': case 'sh': case 'sb': {
      const addr = ((regs[rs1] ?? 0) + imm) >>> 0;
      const unit = { sw: 'Word', sh: '아래 Halfword', sb: '아래 Byte' }[name];
      return `${val(regs, rs2)}의 ${unit}를 ${val(regs, rs1)}에 Offset(${code(imm)})을 더한 ${code(hex32(addr))} 주소에 씁니다.`;
    }
    case 'flw': case 'fld': case 'fsw': case 'fsd': {
      const addr = ((regs[rs1] ?? 0) + imm) >>> 0;
      const unit = name.endsWith('w') ? 'Word' : 'Doubleword';
      return name.startsWith('fl')
        ? `${val(regs, rs1)}에 Offset(${code(imm)})을 더한 ${code(hex32(addr))} 주소의 ${unit}를 읽어 ${code(`f${rd}`)} 레지스터에 넣습니다.`
        : `${code(`f${rs2}`)} 레지스터의 ${unit}를 ${val(regs, rs1)}에 Offset(${code(imm)})을 더한 ${code(hex32(addr))} 주소에 씁니다.`;
    }
    case 'beq': case 'bne': case 'blt': case 'bge': case 'bltu': case 'bgeu': {
      const b = BRANCH[name];
      const now = b.holds(regs[rs1] ?? 0, regs[rs2] ?? 0) ? '지금 값으로는 Branch합니다.' : '지금 값으로는 Branch하지 않고 다음 명령으로 갑니다.';
      const cmp = name === 'beq' || name === 'bne' ? `${val(regs, rs1)}과 ${val(regs, rs2)}이 ${b.says}` : `${val(regs, rs1)}이 ${val(regs, rs2)}${b.says}`;
      return `${cmp} ${target(pc, imm)}로 Branch합니다${b.unsigned ? '(Unsigned 비교)' : ''}. ${now}`;
    }
    case 'lui': return `Immediate 값(${code(hex32(imm))})을 ${to} 위 20비트에 값을 두고 아래 12비트는 0으로 채웁니다.`;
    case 'auipc':
      return pc === null ? `PC(명령 자신의 주소)에 Immediate 값(${code(hex32(imm))})을 더해 ${to}`
        : `PC(${code(hex32(pc))})에 Immediate 값(${code(hex32(imm))})을 더한 ${code(hex32((pc + imm) >>> 0))} 값을 ${to}`
          + ' (`la` 명령은 `auipc` 명령과 `addi` 명령 둘로 바뀌는데, 그 앞의 것입니다.)';
    case 'jal': {
      return `${target(pc, imm)}로 Jump합니다. ` + (rd === 0 ? '돌아올 주소는 남기지 않습니다(`j` 명령).'
        : `다음 명령의 주소${pc === null ? '' : `(${code(hex32((pc + 4) >>> 0))})`}를 ${reg(rd)} 레지스터에 남깁니다.`);
    }
    default: return '';
  }
}

export function explain(d: DecodedInstruction, regs: readonly number[], pc: number | null = null): Explanation {
  const t = TITLES[d.name];
  return { title: d.name ? (t ? `${d.name} — ${t}` : d.name) : 'Unknown instruction', sentence: sentence(d, regs, pc) };
}

/* "`x5` 값(...)" -> parts, the backticked ones as code. */
export function codeParts(text: string): { text: string; code: boolean }[] {
  return text.split('`').map((t, i) => ({ text: t, code: i % 2 === 1 })).filter((p) => p.text !== '');
}
