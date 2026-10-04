/* The executable image (src/core/asx.ts) of a RISC-V program, put together
   from what the engine answered (src/isa/riscv/sim/image.ts asks): pure.

   - text     the assembled words (the assemble reply's text[]: RARS keeps no
              data in .text), from the start address or the first word,
              whichever is lower, to the last word; a gap is 0.
   - data     the user data segment: from its base (0x10010000) to where the
              assembler's next datum would go (a trailing .space included),
              widened to any byte that is not zero and to any data label
              (.extern puts them at 0x10000000).  None when that is empty.
   - entry    the PC the engine starts at: RARS's text base, 0x00400000.  The
              engine assembles with "start at main" off, so a `main` (global
              or not) is a label like any other.
   - regs     sp (x2) and gp (x3) as assembling left them.
   - endian   the order the engine wrote a known word to memory in.
   - symbols  every label in RARS's symbol table, local and global (RARS has
              no start-up code: they are all the program's).

   Where the next datum would go is nothing the engine tells: the reader
   assembles the source with DATA_END_LABEL appended after a `.data`, which
   resumes the user data segment where it left off, and reads that label. */

import { ImageError, type MachineImage } from '../../../core/asx.ts';
import type { Symbol, TextWord } from '../sim/protocol.ts';

// RARS's default memory configuration, the only one the engine uses.
export const RARS = {
  textBase: 0x00400000,
  dataSegmentBase: 0x10000000,   // .extern from here, gp at 0x10008000
  dataBase: 0x10010000,          // .data
  heapBase: 0x10040000,
} as const;

export const DATA_END_LABEL = '__asx_data_end';
// After the program, on lines of their own: its line numbers do not change.
export const withDataEnd = (source: string): string => `${source}\n.data\n${DATA_END_LABEL}:\n`;

// A word the reader assembles alone, and how it finds the byte order in memory.
export const ENDIAN_PROBE = { source: '.data\n.word 0x01020304\n', addr: RARS.dataBase, word: 0x01020304 } as const;
export function endianOf(bytes: ArrayLike<number>): 'little' | 'big' {
  const b = Array.from(bytes);
  if (b.join() === '4,3,2,1') return 'little';
  if (b.join() === '1,2,3,4') return 'big';
  throw new Error(`the byte order cannot be told from ${b.join(' ')}`);
}

export function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

const dataLabels = (symbols: Symbol[]) => symbols.filter((s) => s.segment === 'data').map((s) => s.addr >>> 0);

// The assemble reply's symbols without the appended label, and where that
// label is (null: not appended).
export function splitDataEnd(symbols: Symbol[], appended: boolean): { symbols: Symbol[]; dataEnd: number | null } {
  const end = appended ? symbols.find((s) => s.name === DATA_END_LABEL) : undefined;
  return { symbols: end ? symbols.filter((s) => s !== end) : symbols, dataEnd: end ? end.addr >>> 0 : null };
}

// The memory the reader reads to find the data: the data segment up to the
// heap, widened to the data labels and to the next datum's address.
export function dataScanRange(symbols: Symbol[], dataEnd: number | null): { from: number; to: number } {
  const labels = dataLabels(symbols);
  return {
    from: Math.min(RARS.dataSegmentBase, ...labels),
    to: Math.max(RARS.heapBase, dataEnd ?? 0, ...labels.map((a) => a + 1)),
  };
}

export interface RiscvReads {
  pc: number;                      // the assemble reply's
  text: TextWord[];
  symbols: Symbol[];               // the program's (splitDataEnd())
  dataEnd: number | null;          // where the next datum would go (splitDataEnd())
  x: number[];                     // x0..x31 after assembling
  endian: 'little' | 'big';
  memory: { from: number; bytes: Uint8Array };   // dataScanRange()
}

export function riscvImage(r: RiscvReads): MachineImage {
  if (r.text.length === 0) throw new ImageError('No executable image: the program has no instructions');
  const entry = r.pc >>> 0;
  const addrs = r.text.map((t) => t.addr >>> 0);
  const textAddr = Math.min(entry, ...addrs);
  const words = new Array<number>((Math.max(...addrs) - textAddr) / 4 + 1).fill(0);
  r.text.forEach((t, i) => { words[(addrs[i] - textAddr) / 4] = t.code >>> 0; });

  let lo: number = RARS.dataBase, hi = Math.max(RARS.dataBase, r.dataEnd ?? 0);
  for (const a of dataLabels(r.symbols)) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
  const { from, bytes } = r.memory;
  const first = bytes.findIndex((b) => b !== 0);
  if (first >= 0) {
    let last = bytes.length - 1;
    while (bytes[last] === 0) last--;
    lo = Math.min(lo, from + first);
    hi = Math.max(hi, from + last + 1);
  }
  let data: MachineImage['data'] = null;
  if (hi > lo) {
    const out = new Uint8Array(hi - lo);
    for (let a = Math.max(lo, from); a < Math.min(hi, from + bytes.length); a++) out[a - lo] = bytes[a - from];
    data = { addr: lo, bytes: out };
  }

  const symbols = r.symbols.map((s) => ({ name: s.name, addr: s.addr >>> 0 }))
    .sort((a, b) => a.addr - b.addr || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    isa: 'riscv',
    endian: r.endian,
    entry,
    regs: [{ name: 'sp', value: r.x[2] >>> 0 }, { name: 'gp', value: r.x[3] >>> 0 }],
    symbols,
    text: { addr: textAddr, words },
    data,
  };
}
