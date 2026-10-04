/* 32-bit RISC-V instruction word -> format, fields, name.  Pure logic: no
   engine, no DOM, no Node.  The Inspector and the Text panel's Format
   column read it.

   The decoder looks at the word and nothing else.  tests/riscv/core/decoder.test.ts
   checks its names against what RARS itself prints for the same words
   (tests/riscv/core/rars-words.json, made by the engine).

   Format, from the opcode (bits 6..0) alone:

       0x33 OP, 0x53 OP-FP                          R
       0x43 0x47 0x4b 0x4f (fused multiply-add)     R4
       0x13 OP-IMM, 0x03 LOAD, 0x07 LOAD-FP,
       0x67 JALR, 0x73 SYSTEM, 0x0f MISC-MEM        I
       0x23 STORE, 0x27 STORE-FP                    S
       0x63 BRANCH                                  B
       0x37 LUI, 0x17 AUIPC                         U
       0x6f JAL                                     J

   Taking a word apart into its fields is per format, in FORMATS below: R,
   I, S, B, U and J (R4, the fused multiply-adds, is not taken apart: the
   Inspector says so instead of drawing a wrong picture).

   RISC-V cuts its immediates into pieces and scatters them over the word
   (so that rs1, rs2 and rd stay where they are in every format).  PIECES
   says, per format, which bits of the word are which bits of the immediate;
   immediateParts() puts them together, and that is what the Inspector
   draws: the pieces, where each one goes, the bits that are always 0 (B and
   J's lowest, U's lower twelve) and the sign extension.  immediateOf() is
   the same number from the spec's formulas, written separately: the tests
   check the two against each other and against RARS. */

export interface InstructionField {
  name: string;   // "opcode", "rd", "funct3", "rs1", "rs2", "funct7", "imm[11:0]", "shamt"
  high: number;   // most significant bit, 31..0
  low: number;    // least significant bit
  value: number;  // the bits, right-aligned
}

export const fieldWidth = (f: InstructionField): number => f.high - f.low + 1;

export type Format = 'R' | 'R4' | 'I' | 'S' | 'B' | 'U' | 'J';

export interface DecodedInstruction {
  word: number;
  format: Format | null;   // null: an opcode RV32 does not use
  name: string;            // mnemonic as RARS spells it ("addi", "fadd.s"); '' if unknown
  known: boolean;

  // Raw bit fields, always extracted, whatever the format.
  opcode: number;  // [6:0]
  rd: number;      // [11:7]
  funct3: number;  // [14:12]
  rs1: number;     // [19:15]
  rs2: number;     // [24:20]
  funct7: number;  // [31:25]

  // The immediate as the format assembles it, sign-extended; 0 for R.
  imm: number;

  // The fields that make up this format, most significant first.  They tile
  // the word exactly: reassemble() gives back `word`.  null: this format's
  // layout is not in FORMATS yet.
  fields: InstructionField[] | null;
}

const bits = (w: number, high: number, low: number): number => (w >>> low) & (2 ** (high - low + 1) - 1);
const signExtend = (v: number, width: number): number => (v << (32 - width)) >> (32 - width);

export function formatOf(word: number): Format | null {
  switch (word & 0x7f) {
    case 0x33: case 0x53: return 'R';
    case 0x43: case 0x47: case 0x4b: case 0x4f: return 'R4';
    case 0x13: case 0x03: case 0x07: case 0x67: case 0x73: case 0x0f: return 'I';
    case 0x23: case 0x27: return 'S';
    case 0x63: return 'B';
    case 0x37: case 0x17: return 'U';
    case 0x6f: return 'J';
    default: return null;
  }
}

export const formatName = (format: Format | null): string => format ?? '?';

/* The immediate each format encodes (RISC-V spec, "Immediate Encoding Variants"). */
export function immediateOf(word: number, format: Format | null): number {
  switch (format) {
    case 'I': return word >> 20;
    case 'S': return signExtend((bits(word, 31, 25) << 5) | bits(word, 11, 7), 12);
    case 'B': return signExtend((bits(word, 31, 31) << 12) | (bits(word, 7, 7) << 11) | (bits(word, 30, 25) << 5) | (bits(word, 11, 8) << 1), 13);
    case 'U': return word & 0xfffff000;
    case 'J': return signExtend((bits(word, 31, 31) << 20) | (bits(word, 19, 12) << 12) | (bits(word, 20, 20) << 11) | (bits(word, 30, 21) << 1), 21);
    default: return 0;
  }
}

// I-type shifts keep funct7 in imm[11:5] and the shift amount in imm[4:0].
const isShiftImmediate = (word: number) => (word & 0x7f) === 0x13 && (bits(word, 14, 12) === 1 || bits(word, 14, 12) === 5);

const field = (name: string, high: number, low: number, word: number): InstructionField =>
  ({ name, high, low, value: bits(word, high, low) });

/* How each format is taken apart: its fields, most significant first.
   An immediate's field is named by the bits of the immediate it holds, in
   the order they sit in the word ("imm[12|10:5]": bit 12, then bits 10..5). */
export const FORMATS: Partial<Record<Format, (word: number) => InstructionField[]>> = {
  R: (w) => [field('funct7', 31, 25, w), field('rs2', 24, 20, w), field('rs1', 19, 15, w), field('funct3', 14, 12, w),
    field('rd', 11, 7, w), field('opcode', 6, 0, w)],
  I: (w) => [
    ...(isShiftImmediate(w) ? [field('funct7', 31, 25, w), field('shamt', 24, 20, w)] : [field('imm[11:0]', 31, 20, w)]),
    field('rs1', 19, 15, w), field('funct3', 14, 12, w), field('rd', 11, 7, w), field('opcode', 6, 0, w)],
  S: (w) => [field('imm[11:5]', 31, 25, w), field('rs2', 24, 20, w), field('rs1', 19, 15, w), field('funct3', 14, 12, w),
    field('imm[4:0]', 11, 7, w), field('opcode', 6, 0, w)],
  B: (w) => [field('imm[12|10:5]', 31, 25, w), field('rs2', 24, 20, w), field('rs1', 19, 15, w), field('funct3', 14, 12, w),
    field('imm[4:1|11]', 11, 7, w), field('opcode', 6, 0, w)],
  U: (w) => [field('imm[31:12]', 31, 12, w), field('rd', 11, 7, w), field('opcode', 6, 0, w)],
  J: (w) => [field('imm[20|10:1|11|19:12]', 31, 12, w), field('rd', 11, 7, w), field('opcode', 6, 0, w)],
};

/* One piece of an immediate: word bits wordHigh..wordLow (in the field
   `field`) are immediate bits immHigh..immLow. */
export interface ImmediatePiece {
  field: string;
  wordHigh: number;
  wordLow: number;
  immHigh: number;
  immLow: number;
  value: number;   // the piece's bits, right-aligned
}

export interface ImmediateParts {
  width: number;          // the bits the format encodes, implicit zeros included: I and S 12, B 13, J 21, U 32
  pieces: ImmediatePiece[];   // by their place in the immediate, highest first
  zeros: number;          // the lowest bits that are 0 without being in the word: B and J 1, U 12
  signExtended: boolean;  // bit width-1 is copied up to bit 31 (all but U)
  value: number;          // the immediate as the instruction uses it (32 bits, signed)
}

// [field, word high, word low, immediate high, immediate low], highest immediate bits first.
const PIECES: Partial<Record<Format, [string, number, number, number, number][]>> = {
  I: [['imm[11:0]', 31, 20, 11, 0]],
  S: [['imm[11:5]', 31, 25, 11, 5], ['imm[4:0]', 11, 7, 4, 0]],
  B: [['imm[12|10:5]', 31, 31, 12, 12], ['imm[4:1|11]', 7, 7, 11, 11], ['imm[12|10:5]', 30, 25, 10, 5], ['imm[4:1|11]', 11, 8, 4, 1]],
  U: [['imm[31:12]', 31, 12, 31, 12]],
  J: [['imm[20|10:1|11|19:12]', 31, 31, 20, 20], ['imm[20|10:1|11|19:12]', 19, 12, 19, 12],
    ['imm[20|10:1|11|19:12]', 20, 20, 11, 11], ['imm[20|10:1|11|19:12]', 30, 21, 10, 1]],
};
const WIDTH: Partial<Record<Format, number>> = { I: 12, S: 12, B: 13, U: 32, J: 21 };

/* The immediate of `word` as its pieces.  null where there is no immediate
   to put together: R, R4, an I-type shift (shamt is a plain field), and the
   SYSTEM and MISC-MEM words (ecall/ebreak, the CSR number, fence's bits). */
export function immediateParts(word: number): ImmediateParts | null {
  const format = formatOf(word);
  const layout = format ? PIECES[format] : undefined;
  const op = word & 0x7f;
  if (!format || !layout || isShiftImmediate(word) || op === 0x73 || op === 0x0f) return null;
  const width = WIDTH[format]!;
  const pieces = layout.map(([f, wh, wl, ih, il]) => ({ field: f, wordHigh: wh, wordLow: wl, immHigh: ih, immLow: il, value: bits(word, wh, wl) }));
  const zeros = Math.min(...pieces.map((p) => p.immLow));
  const raw = pieces.reduce((v, p) => (v | (p.value << p.immLow)) >>> 0, 0);
  const signExtended = format !== 'U';
  return { width, pieces, zeros, signExtended, value: signExtended ? signExtend(raw, width) : raw | 0 };
}

const R_NAMES: Record<string, string> = {
  '0,0': 'add', '32,0': 'sub', '0,1': 'sll', '0,2': 'slt', '0,3': 'sltu', '0,4': 'xor', '0,5': 'srl', '32,5': 'sra', '0,6': 'or', '0,7': 'and',
  '1,0': 'mul', '1,1': 'mulh', '1,2': 'mulhsu', '1,3': 'mulhu', '1,4': 'div', '1,5': 'divu', '1,6': 'rem', '1,7': 'remu',
};
const OP_IMM = ['addi', 'slli', 'slti', 'sltiu', 'xori', 'srli', 'ori', 'andi'];
const LOADS: Record<number, string> = { 0: 'lb', 1: 'lh', 2: 'lw', 4: 'lbu', 5: 'lhu' };
const STORES: Record<number, string> = { 0: 'sb', 1: 'sh', 2: 'sw' };
const BRANCHES: Record<number, string> = { 0: 'beq', 1: 'bne', 4: 'blt', 5: 'bge', 6: 'bltu', 7: 'bgeu' };
const CSR: Record<number, string> = { 1: 'csrrw', 2: 'csrrs', 3: 'csrrc', 5: 'csrrwi', 6: 'csrrsi', 7: 'csrrci' };
// OP-FP by funct7 (and funct3 / rs2 where they choose): the common ones.
const FP: Record<number, string> = {
  0x00: 'fadd.s', 0x04: 'fsub.s', 0x08: 'fmul.s', 0x0c: 'fdiv.s', 0x2c: 'fsqrt.s',
  0x01: 'fadd.d', 0x05: 'fsub.d', 0x09: 'fmul.d', 0x0d: 'fdiv.d', 0x2d: 'fsqrt.d',
};

function nameOf(w: number): string {
  const op = w & 0x7f;
  const f3 = bits(w, 14, 12);
  const f7 = bits(w, 31, 25);
  switch (op) {
    case 0x33: return R_NAMES[`${f7},${f3}`] ?? '';
    case 0x13:
      if (f3 === 5) return f7 === 0x20 ? 'srai' : f7 === 0 ? 'srli' : '';
      if (f3 === 1) return f7 === 0 ? 'slli' : '';
      return OP_IMM[f3];
    case 0x03: return LOADS[f3] ?? '';
    case 0x07: return f3 === 2 ? 'flw' : f3 === 3 ? 'fld' : '';
    case 0x23: return STORES[f3] ?? '';
    case 0x27: return f3 === 2 ? 'fsw' : f3 === 3 ? 'fsd' : '';
    case 0x63: return BRANCHES[f3] ?? '';
    case 0x37: return 'lui';
    case 0x17: return 'auipc';
    case 0x6f: return 'jal';
    case 0x67: return f3 === 0 ? 'jalr' : '';
    case 0x0f: return f3 === 0 ? 'fence' : f3 === 1 ? 'fence.i' : '';
    case 0x73:
      if (f3 === 0) return ({ 0: 'ecall', 1: 'ebreak', 2: 'uret', 0x105: 'wfi' } as Record<number, string>)[bits(w, 31, 20)] ?? '';
      return CSR[f3] ?? '';
    case 0x53: return FP[f7] ?? '';
    default: return '';
  }
}

export function decode(word: number): DecodedInstruction {
  const w = word | 0;
  const format = formatOf(w);
  const name = nameOf(w);
  const layout = format ? FORMATS[format] : undefined;
  return {
    word: w >>> 0, format, name, known: name !== '',
    opcode: bits(w, 6, 0), rd: bits(w, 11, 7), funct3: bits(w, 14, 12), rs1: bits(w, 19, 15), rs2: bits(w, 24, 20), funct7: bits(w, 31, 25),
    imm: immediateOf(w, format),
    fields: layout ? layout(w) : null,
  };
}

/* The word back from its fields: what the Inspector's picture says. */
export function reassemble(d: DecodedInstruction): number {
  if (!d.fields) return d.word;
  return d.fields.reduce((w, f) => (w | (f.value << f.low)) >>> 0, 0);
}
