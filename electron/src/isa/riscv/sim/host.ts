/* The host's handle on the engine process (the JVM running RarsProbe).

   Calls are requests with an id; the reply with the same id settles the
   promise.  Console output and "the program waits for input" arrive as
   events.  If the process dies, the host notices, fails what was pending
   with EngineCrashed, reports the crash, and starts a fresh process: the
   machine is empty again, the host goes on.

   The engine has a state, which MIPS's addon does not -- an addon is
   loaded or the app does not start.  A JVM takes a moment to start (about
   0.2 s) and can fail to start at all (no java, a broken install), so the
   window is told:

     starting    the first process is on its way; calls wait for it
     ready       it answered `ready` with the protocol this host speaks
     restarting  it died; a fresh one is on its way (the program is gone)
     dead        it cannot be started, or died again and again: calls fail
                 at once, with the reason, until the app is restarted

   docs/engine-protocol.md is the contract this file speaks. */

import { EventEmitter } from 'node:events';

import { PROTOCOL, type CallName, type Calls, type EngineMessage, type RunReply } from './protocol.ts';
import type { ExitInfo, Transport, TransportFactory } from './transport.ts';

export const CRASH_MESSAGE = '시뮬레이터 엔진이 멈췄습니다';

export type EngineState = 'starting' | 'ready' | 'restarting' | 'dead';

export class EngineCrashed extends Error {
  readonly exit: ExitInfo;
  constructor(exit: ExitInfo, cause: string) {
    super(`${CRASH_MESSAGE} (${cause})`);
    this.name = 'EngineCrashed';
    this.exit = exit;
  }
}

export class EngineDead extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'EngineDead';
  }
}

export interface CrashReport {
  message: string;       // CRASH_MESSAGE, for the student
  cause: string;         // what happened, in a few words
  restarted: boolean;    // a fresh engine is on its way
}

export interface SimulatorEvents {
  console: [text: string];               // the program's output (out and err)
  input: [pc: number];                   // the program waits for console input
  crashed: [report: CrashReport];
  state: [state: EngineState, detail: string];
}

export interface HostOptions {
  transport: TransportFactory;
  restartOnCrash?: boolean;     // default true
  stopTimeoutMs?: number;       // how long stop() waits before killing; default 2000
  readyTimeoutMs?: number;      // how long a start may take; default 20000
  maxCrashes?: number;          // crashes within crashWindowMs before giving up; default 3
  crashWindowMs?: number;       // default 60000
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class Simulator extends EventEmitter<SimulatorEvents> {
  private readonly factory: TransportFactory;
  private readonly restartOnCrash: boolean;
  private readonly stopTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly maxCrashes: number;
  private readonly crashWindowMs: number;
  private transport!: Transport;
  private ready!: Promise<void>;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private killing: string | null = null; // why the host itself is killing the process
  private closed = false;
  private runInFlight: Promise<unknown> | null = null;
  private crashes: number[] = [];
  state: EngineState = 'starting';
  deadReason = '';
  rars = '';

  constructor(options: HostOptions) {
    super();
    this.factory = options.transport;
    this.restartOnCrash = options.restartOnCrash ?? true;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 2000;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 20000;
    this.maxCrashes = options.maxCrashes ?? 3;
    this.crashWindowMs = options.crashWindowMs ?? 60000;
  }

  /** Starts the engine process; resolves when it is ready (or dead: see state). */
  static async start(options: HostOptions): Promise<Simulator> {
    const sim = new Simulator(options);
    sim.launch();
    await sim.ready.catch(() => {});
    return sim;
  }

  private setState(state: EngineState, detail = ''): void {
    this.state = state;
    this.emit('state', state, detail);
  }

  /** Starts a process (the first, or after a crash). */
  launch(): void {
    const transport = this.factory();
    this.transport = transport;
    this.killing = null;
    let markReady!: () => void;
    let failReady!: (e: Error) => void;
    this.ready = new Promise((resolve, reject) => { markReady = resolve; failReady = reject; });
    this.ready.catch(() => {});
    const timer = setTimeout(() => {
      if (transport !== this.transport || this.state === 'ready') return;
      this.killing = `no ready within ${this.readyTimeoutMs} ms`;
      transport.kill();
    }, this.readyTimeoutMs);
    transport.onMessage((m: EngineMessage) => {
      if (transport !== this.transport) return; // a process already replaced
      if ('ev' in m) {
        const ev = m as Extract<EngineMessage, { ev: string }>;
        switch (ev.ev) {
          case 'ready':
            clearTimeout(timer);
            if (ev.protocol !== PROTOCOL) {
              // An engine from another build: never talk to it (8.5).
              this.die(`엔진의 프로토콜 버전(${ev.protocol})이 앱(${PROTOCOL})과 다릅니다 — 설치가 깨졌습니다`);
              transport.kill();
              failReady(new EngineDead(this.deadReason));
              return;
            }
            this.rars = ev.rars;
            this.setState('ready');
            markReady();
            return;
          case 'out': case 'err': this.emit('console', ev.text); return;
          case 'input_wanted': this.emit('input', ev.pc); return;
          default: return; // 8.2: unknown events are ignored (nonjson is logged by the transport)
        }
      }
      const id = (m as { id: unknown }).id;
      if (typeof id !== 'number') return;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      p.resolve(m);
    });
    transport.onExit((exit) => {
      clearTimeout(timer);
      if (transport !== this.transport) return;
      failReady(new EngineCrashed(exit, 'exited before ready'));
      this.onExit(exit);
    });
  }

  private die(reason: string): void {
    this.deadReason = reason;
    this.setState('dead', reason);
  }

  private onExit(exit: ExitInfo): void {
    if (this.closed) return;
    const cause = exit.spawnError ? `could not start java: ${exit.spawnError}`
      : this.killing ?? (exit.signal ? `signal ${exit.signal}` : `exit code ${exit.code}`);
    const error = new EngineCrashed(exit, cause);
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
    this.runInFlight = null;
    if (this.state === 'dead') return; // already given up (a protocol mismatch)
    const now = Date.now();
    this.crashes = [...this.crashes.filter((t) => now - t < this.crashWindowMs), now];
    const giveUp = exit.spawnError !== undefined || !this.restartOnCrash || this.crashes.length > this.maxCrashes;
    if (giveUp) {
      const reason = exit.spawnError
        ? `시뮬레이터 엔진(Java)을 시작할 수 없습니다: ${exit.spawnError}`
        : `시뮬레이터 엔진이 ${this.crashes.length}번 멈춰 다시 시작하지 않습니다 (${cause})`;
      this.die(reason);
      this.emit('crashed', { message: CRASH_MESSAGE, cause, restarted: false });
      return;
    }
    this.setState('restarting', cause);
    this.launch();
    this.emit('crashed', { message: CRASH_MESSAGE, cause, restarted: true });
  }

  /** Resolves once a (re)started process is ready; rejects if it is dead. */
  async whenReady(): Promise<void> {
    if (this.state === 'dead') throw new EngineDead(this.deadReason);
    await this.ready;
  }

  /** One command.  Resolves with the engine's reply (ok or not); rejects with
      EngineCrashed if the process dies first, EngineDead if there is none. */
  async call<M extends CallName>(cmd: M, params?: Calls[M][0]): Promise<Calls[M][1]> {
    if (this.closed) throw new Error('engine closed');
    await this.whenReady();
    const id = this.nextId++;
    const reply = new Promise<Calls[M][1]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    });
    this.transport.send({ id, cmd, ...(params ?? {}) });
    if (cmd === 'run' || cmd === 'step') {
      this.runInFlight = reply;
      void reply.finally(() => { if (this.runInFlight === reply) this.runInFlight = null; }).catch(() => {});
    }
    return reply;
  }

  get running(): boolean { return this.runInFlight !== null; }

  /** Stops a run or step; the machine stays as it is, for looking at.  Only
      if the process does not answer within stopTimeoutMs is it killed (and
      restarted) -- the last resort, which loses the program. */
  async stop(): Promise<'stopped' | 'idle' | 'killed'> {
    const running = this.runInFlight as Promise<RunReply> | null;
    if (this.state !== 'ready') return 'idle';
    const kill = () => {
      this.killing = 'killed by stop(): no answer';
      this.transport.kill();
    };
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), this.stopTimeoutMs); });
    try {
      const stopCall = this.call('stop');
      stopCall.catch(() => {});
      const answered = await Promise.race([stopCall, timeout]);
      if (answered === 'timeout') { kill(); return 'killed'; }
      if (!answered.ok || !answered.was_running || !running) return 'idle';
      const ended = await Promise.race([running.then(() => 'ended' as const, () => 'ended' as const), timeout]);
      if (ended === 'timeout') { kill(); return 'killed'; }
      return 'stopped';
    } catch (e) {
      if (e instanceof EngineCrashed) return 'killed';
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** For tests: kill the process as if it had crashed. */
  crashForTest(): void {
    this.transport.kill();
  }

  /** Ends the engine process for good. */
  close(): void {
    this.closed = true;
    for (const p of this.pending.values()) p.reject(new Error('engine closed'));
    this.pending.clear();
    this.transport.kill();
  }
}
