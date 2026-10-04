/* The machine as the window shows it: register rows, text rows, and what a
   stop means for the controls.  Pure; the panels (../panels) put these on
   screen.  From the engine's replies, docs/engine-protocol.md. */

import { decode, formatName } from '../../core/decoder.ts';
import { bin32Grouped, hex32, signedDec32 } from '../../../../core/format.ts';
import { abiName, REGISTER_GROUPS } from '../../core/registers.ts';
import type { Reason, TextWord } from '../../sim/protocol.ts';

export interface RegisterValues {
  pc: number;
  x: number[];       // x0..x31
  fbits: string[];   // f0..f31, 64 bits as 16 hex digits (the engine's fbits: a double is only there)
}

export interface RegisterRow {
  key: string;     // "pc", "x10" -- stable, for keeping one DOM row per register
  name: string;    // what the row says: "pc", "x10 a0"
  group: string;   // the group's title (WINDOW_GROUPS)
  value: number;
}

/* The window's groups: pc, then the RISC-V calling convention's groups
   (../../core/registers.ts REGISTER_GROUPS), x0 to x31 each once. */
export const WINDOW_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Special', keys: ['pc'] },
  ...REGISTER_GROUPS.map((g) => ({ title: g.title, keys: g.numbers.map((n) => `x${n}`) })),
];

const nameOf = (key: string): string => (key === 'pc' ? 'pc' : `${key} ${key === 'x8' ? 's0/fp' : abiName(Number(key.slice(1)))}`);
const valueOf = (r: RegisterValues, key: string): number => (key === 'pc' ? r.pc : r.x[Number(key.slice(1))] ?? 0);

export function registerRows(r: RegisterValues): RegisterRow[] {
  return WINDOW_GROUPS.flatMap((g) => g.keys.map((key) => ({ key, name: nameOf(key), group: g.title, value: valueOf(r, key) >>> 0 })));
}

// Registers whose value differs from the last stop, integer and floating
// point.  pc is left out: it moves on every step and has its own marker.
export function changedKeys(before: RegisterValues | null, now: RegisterValues): Set<string> {
  const changed = new Set<string>();
  if (before === null) return changed;
  for (let n = 0; n < 32; n += 1) {
    if ((before.x[n] | 0) !== (now.x[n] | 0)) changed.add(`x${n}`);
    if (before.fbits[n] !== now.fbits[n]) changed.add(`f${n}`);
  }
  return changed;
}

export const cells = (value: number) => ({ hex: hex32(value), dec: signedDec32(value), bin: bin32Grouped(value) });

/* An f register's 64 bits as the course reads them: the hex, and the value
   -- a single (NaN-boxed: upper 32 bits all ones) or a double. */
export function fpCells(bits: string): { hex: string; value: string; kind: 'single' | 'double' } {
  const hi = parseInt(bits.slice(0, 8), 16) >>> 0;
  const lo = parseInt(bits.slice(8), 16) >>> 0;
  const buf = new DataView(new ArrayBuffer(8));
  if (hi === 0xffffffff) {
    buf.setUint32(0, lo);
    return { hex: `0x${bits.slice(8)}`, value: fmtFloat(buf.getFloat32(0)), kind: 'single' };
  }
  buf.setUint32(0, hi);
  buf.setUint32(4, lo);
  return { hex: `0x${bits}`, value: fmtFloat(buf.getFloat64(0)), kind: 'double' };
}
const fmtFloat = (v: number): string => (Number.isNaN(v) ? 'NaN' : Object.is(v, -0) ? '-0' : String(v));

export const ZERO_REGS: RegisterValues = { pc: 0, x: new Array(32).fill(0), fbits: new Array(32).fill('0'.repeat(16)) };
export const toValues = (r: { pc: number; x: number[]; fbits: string[] }): RegisterValues => ({ pc: r.pc, x: [...r.x], fbits: [...r.fbits] });

// ---- Text rows ------------------------------------------------------------

export interface TextRow {
  addr: number;            // unsigned
  word: number;            // unsigned
  format: string;          // "R", "I", ... ("?" for a word no format covers)
  disassembly: string;     // RARS's basic instruction: "addi x10,x0,5"
  line: number;            // source line, 0 if none
  source: string;          // that line's text ("li a0, 5"), '' for the later words of a pseudo instruction
  kernel: boolean;         // always false: RARS's text holds the student's program only
  breakpoint: boolean;
  band: boolean;           // one of several words of one source line (a pseudo instruction)
}

export function textRows(words: TextWord[], breakpointAddrs: ReadonlySet<number> = new Set()): TextRow[] {
  const rows: TextRow[] = words.map((w) => ({
    addr: w.addr >>> 0, word: w.code >>> 0, format: formatName(decode(w.code).format), disassembly: w.basic.trim(),
    line: w.line, source: w.src.trim(), kernel: false, breakpoint: breakpointAddrs.has(w.addr >>> 0), band: false,
  }));
  // A source line that became several words: its rows form a band.
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const next = rows[i + 1];
    if ((prev && prev.line === r.line && r.line > 0) || (next && next.line === r.line && r.line > 0)) r.band = true;
  });
  return rows;
}

// ---- what a stop means for the window ---------------------------------------

/* The window's own words for a stop, from the engine's reason (5.4):
     exit        NORMAL_TERMINATION, CLIFF_TERMINATION
     error       EXCEPTION
     breakpoint  BREAKPOINT
     stopped     STOP
     limit       MAX_STEPS (a step, or a run's max)
   ('input' is not a stop in this edition: the run waits, the input_wanted
   event says so, and the run goes on once the line is given.) */
export type StopReason = 'exit' | 'error' | 'breakpoint' | 'stopped' | 'limit';
export type RunState = 'ready' | 'running' | 'paused' | 'input' | 'finished';

export function stopReason(r: Reason): StopReason {
  switch (r) {
    case 'NORMAL_TERMINATION': case 'CLIFF_TERMINATION': return 'exit';
    case 'EXCEPTION': return 'error';
    case 'BREAKPOINT': return 'breakpoint';
    case 'STOP': return 'stopped';
    default: return 'limit';
  }
}

export function stateAfter(reason: StopReason): RunState {
  return reason === 'exit' || reason === 'error' ? 'finished' : 'paused';
}

// The status bar's words for a stop.  `hex` marks code (set in the mono font).
export function stopMessage(reason: StopReason | 'input', pc: string): string {
  switch (reason) {
    case 'exit': return '프로그램이 끝났습니다';
    case 'error': return '실행 오류로 멈췄습니다';
    case 'breakpoint': return `브레이크포인트에서 멈췄습니다 (PC \`${pc}\`) — 이어서 하려면 F5`;
    case 'input': return '입력을 기다립니다 — 콘솔에 입력하고 Enter';
    case 'stopped': return `멈췄습니다 (PC \`${pc}\`) — 이어서 하려면 F5`;
    case 'limit': return `한 줄 실행했습니다 (PC \`${pc}\`)`;
  }
}
