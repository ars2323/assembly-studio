/* What each field of a taken-apart word means, for the Inspector's table
   and the line under each field in its picture.  Pure. */

import { immediateParts, type DecodedInstruction, type ImmediateParts, type InstructionField } from './decoder.ts';
import { hex32 } from '../../../core/format.ts';
import { bothNames } from './registers.ts';

const OPCODES: Record<number, string> = {
  0x33: 'OP', 0x53: 'OP-FP', 0x13: 'OP-IMM', 0x03: 'LOAD', 0x07: 'LOAD-FP', 0x67: 'JALR', 0x73: 'SYSTEM', 0x0f: 'MISC-MEM',
  0x23: 'STORE', 0x27: 'STORE-FP', 0x63: 'BRANCH', 0x37: 'LUI', 0x17: 'AUIPC', 0x6f: 'JAL',
};
export const opcodeName = (opcode: number): string => OPCODES[opcode] ?? '?';

// Registers that belong to the floating-point file, by instruction.
const fpRegisters = (d: DecodedInstruction): boolean => d.opcode === 0x53;

// The immediate bits a piece holds: "imm[12]", "imm[10:5]".
export const pieceName = (p: { immHigh: number; immLow: number }): string =>
  `imm[${p.immHigh}${p.immHigh !== p.immLow ? `:${p.immLow}` : ''}]`;
// Its place in the word: "inst[31]", "inst[30:25]".
export const pieceSource = (p: { wordHigh: number; wordLow: number }): string =>
  `inst[${p.wordHigh}${p.wordHigh !== p.wordLow ? `:${p.wordLow}` : ''}]`;

export function meaningOf(f: InstructionField, d: DecodedInstruction): string {
  switch (f.name) {
    case 'opcode': return opcodeName(f.value);
    case 'rd':
      if (d.opcode === 0x07) return `f${f.value}`;            // flw/fld write an f register
      return fpRegisters(d) ? `f${f.value}` : bothNames(f.value);
    case 'rs1': return fpRegisters(d) ? `f${f.value}` : bothNames(f.value);
    case 'rs2': return fpRegisters(d) || d.opcode === 0x27 ? `f${f.value}` : bothNames(f.value);  // fsw/fsd store an f register
    case 'funct3': return d.name ? `${d.name}` : '';
    case 'funct7': return d.funct7 === 0x20 ? '0100000 (sub / sra)' : d.funct7 === 1 ? '0000001 (M extension)' : '';
    case 'imm[11:0]': return String(d.imm);                    // sign-extended
    case 'shamt': return `${f.value} bit${f.value === 1 ? '' : 's'}`;
    default: {
      // A field holding pieces of a scattered immediate: which bits of it.
      const parts = immediateParts(d.word);
      const mine = parts?.pieces.filter((p) => p.field === f.name) ?? [];
      return mine.length ? mine.map(pieceName).join(' ') : '';
    }
  }
}

const binary = (v: number, width: number): string => (v >>> 0).toString(2).padStart(width, '0').slice(-width);

/* The immediate's value as the instruction uses it, said once, with how it
   was put together where that is not plain.  The value is code (in
   backticks, for the view's codeText); the note after it is Korean:
     I  "`imm = 0xffb = -5` (12비트, Sign-extend)"
     B  "`imm = 0b1111100110000 = -208` (13비트: 맨 아래 비트는 늘 0이라 명령에 없음, Sign-extend)"
     U  "`imm = 0x12345000` (위 20비트, 아래 12비트는 0)" */
export function immediateLine(d: DecodedInstruction, p: ImmediateParts | null = immediateParts(d.word)): string | null {
  if (!p) return null;
  const raw = binary(p.value, p.width);
  switch (d.format) {
    case 'I': return `\`imm = 0x${(p.value & 0xfff).toString(16).padStart(3, '0')} = ${p.value}\` (12비트, Sign-extend)`;
    case 'S': return `\`imm = 0b${raw} = ${p.value}\` (12비트, 두 조각을 이어 붙여 Sign-extend)`;
    case 'B': return `\`imm = 0b${raw} = ${p.value}\` (13비트: 맨 아래 비트는 늘 0이라 명령에 없음, Sign-extend)`;
    case 'J': return `\`imm = 0b${raw} = ${p.value}\` (21비트: 맨 아래 비트는 늘 0이라 명령에 없음, Sign-extend)`;
    case 'U': return `\`imm = ${hex32(p.value)}\` (위 20비트, 아래 12비트는 0)`;
    default: return null;
  }
}
