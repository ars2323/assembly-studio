/* What crosses between the host (host.ts) and the engine: the Java wrapper
   around RARS (probe/src/RarsProbe.java), one JSON object per line on its
   stdin/stdout.  Types only.  The contract is docs/engine-protocol.md
   (protocol 2); this file follows it, it does not define it.

   The calls are the engine's commands, under the same names as MIPS's
   (src/sim/protocol.ts) where the meaning is the same. */

export const PROTOCOL = 2;

// docs/engine-protocol.md 5.2: one machine word of the assembled program.
export interface TextWord {
  addr: number;   // signed 32-bit, as the engine sends it (>>> 0 to show)
  code: number;   // the encoding, signed 32-bit
  basic: string;  // RARS's basic instruction ("addi x10,x0,5")
  line: number;   // source line, 1-based; several words of one pseudo instruction share it
  src: string;    // the source line's text; '' for the later words of a pseudo instruction
}

export interface Symbol {
  name: string;
  addr: number;
  segment: 'text' | 'data';
  global: boolean;
}

export interface ErrorItem {
  line: number;   // 0: no line
  col: number;
  warning: boolean;
  message: string; // RARS's own words
}

export interface Breakpoint { line: number; addr: number | null }

export interface Registers {
  pc: number;
  x: number[];       // x0..x31
  f: number[];       // f0..f31, RARS's single-precision view (NaN unless NaN-boxed)
  fbits: string[];   // f0..f31, the raw 64 bits as 16 hex digits
}

// Why a step or run ended (5.4).
export type Reason = 'MAX_STEPS' | 'BREAKPOINT' | 'STOP' | 'NORMAL_TERMINATION' | 'CLIFF_TERMINATION' | 'EXCEPTION';

export interface Failure { ok: false; code: string; error: string }

export type AssembleReply =
  | { ok: true; warnings: ErrorItem[]; text: TextWord[]; symbols: Symbol[]; breakpoints: Breakpoint[]; pc: number }
  | (Failure & { errors?: ErrorItem[] });

export type RunReply = (Registers & {
  ok: true; reason: Reason; steps: number; ns: number;
  undo?: number;   // how many instructions backstep can undo now (5.7)
  executed?: TextWord | null;
  exit?: number;
  cause?: number; message?: string; line?: number;
  input_cancelled?: boolean; undone?: boolean;
}) | Failure;

// The engine's commands: name -> [parameters, reply].
export interface Calls {
  assemble: [{ source: string }, AssembleReply];
  step: [{ backstep?: boolean }, RunReply];
  run: [{ max?: number; backstep?: boolean }, RunReply];
  stop: [{}, { ok: true; was_running: boolean } | Failure];
  bp: [{ lines: number[] }, { ok: true; breakpoints: Breakpoint[] } | Failure];
  backstep: [{}, (Registers & { ok: true; undo?: number }) | Failure];
  regs: [{}, (Registers & { ok: true }) | Failure];
  mem: [{ addr: number; len: number }, { ok: true; addr: number; hex: string } | (Failure & { partial?: string })];
  input: [{ text: string }, { ok: true; waiting: boolean } | Failure];
  status: [{}, { ok: true; busy: boolean; waiting: boolean; terminated: boolean } | Failure];
  ping: [{}, { ok: true } | Failure];
}
export type CallName = keyof Calls;

// Engine -> host, one per line.
export type EngineMessage =
  | { ev: 'ready'; protocol: number; rars: string }
  | { ev: 'out'; text: string }
  | { ev: 'err'; text: string }
  | { ev: 'input_wanted'; pc: number }
  | { ev: 'nonjson'; text: string }                       // not the engine's: something else wrote to its fd 1
  | ({ id: number | string | null } & Record<string, unknown>);
