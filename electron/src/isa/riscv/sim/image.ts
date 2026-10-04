/* The executable image (src/core/asx.ts) of a RISC-V program, read from an
   engine: assembled there, then read (what each value is:
   src/isa/riscv/core/image.ts).  Every value is the engine's.

   It assembles more than once (a word, to learn the byte order; then the
   program, with a label appended and, if that fails, without): the engine
   it is given must be one nothing else uses meanwhile -- the
   app's second engine, the checker (src/main/engine-riscv.ts), never the
   machine on screen. */

import { ImageError, type MachineImage } from '../../../core/asx.ts';
import { dataScanRange, ENDIAN_PROBE, endianOf, hexBytes, riscvImage, splitDataEnd, withDataEnd } from '../core/image.ts';
import type { CallName, Calls } from './protocol.ts';

export type Call = <M extends CallName>(cmd: M, params?: Calls[M][0]) => Promise<Calls[M][1]>;

const fail = (what: string, r: { ok: false; code: string; error: string }): Error => new Error(`${what}: ${r.code} ${r.error}`);

export async function readImage(call: Call, source: string): Promise<MachineImage> {
  const word = await call('assemble', { source: ENDIAN_PROBE.source });
  if (!word.ok) throw fail('assemble a word', word);
  const w = await call('mem', { addr: ENDIAN_PROBE.addr, len: 4 });
  if (!w.ok) throw fail('read a word', w);
  const endian = endianOf(hexBytes(w.hex));

  // The program with a label after its data; without it if that does not
  // assemble (the program has a label of that name).
  let appended = true;
  let r = await call('assemble', { source: withDataEnd(source) });
  if (!r.ok) { appended = false; r = await call('assemble', { source }); }
  if (!r.ok) throw new ImageError('No executable image: the code has assemble errors');
  const regs = await call('regs');
  if (!regs.ok) throw fail('regs', regs);
  const { symbols, dataEnd } = splitDataEnd(r.symbols, appended);
  const range = dataScanRange(symbols, dataEnd);
  const m = await call('mem', { addr: range.from | 0, len: range.to - range.from });
  if (!m.ok) throw fail('read the data segment', m);
  return riscvImage({ pc: r.pc, text: r.text, symbols, dataEnd, x: regs.x, endian, memory: { from: range.from, bytes: hexBytes(m.hex) } });
}
