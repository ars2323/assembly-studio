/* The RISC-V engine in the main process: RARS in a JVM (RarsProbe,
   docs/engine-protocol.md), two of them -- `main`, the machine on screen,
   and `checker`, for assembling a program first and for the .asx export.
   Registers the sim:* handlers the RISC-V window (src/isa/riscv/renderer/
   app.ts) calls and file:exportImage (export-image.ts), and tells it the
   engine's state (starting / ready / restarting / dead).

   Each engine gets its own RARS settings folder (java.util.prefs) and its
   own stderr log in this run's folder, never in the Console.

   Environment, for tests and negative controls:
     ENGINE_JAVA_ARGS     extra JVM arguments (e.g. -Dprobe.v1Breakpoints=true)
     SIM_RESTART=0        a crashed engine is not restarted
     ENGINE_WINDOWS_HIDE=0, ENGINE_DETACHED=1   how the JVM is started on Windows */

import type { BrowserWindow } from 'electron';
import path from 'node:path';

import { EngineCrashed, Simulator } from '../isa/riscv/sim/host.ts';
import { readImage } from '../isa/riscv/sim/image.ts';
import type { CallName } from '../isa/riscv/sim/protocol.ts';
import { engineTransport } from '../isa/riscv/sim/transport.ts';
import { exportImage, type ImageJob } from './export-image.ts';
import { answer, handlers, type Engine } from './ipc.ts';
import { engine } from './paths.ts';

export function start(win: BrowserWindow, runDir: string): Engine {
  const ipc = handlers();
  // The engine starts at once: a JVM needs a moment (about 0.2 s), which
  // passes while the student looks at the screen.
  const where = engine();
  const extraArgs = (process.env.ENGINE_JAVA_ARGS ?? '').split(/\s+/).filter(Boolean);
  const transport = (role: 'main' | 'checker') => () => engineTransport({
    logFile: path.join(runDir, `engine-${role}.log`),
    ...where, prefsDir: path.join(runDir, `rars-prefs-${role}`), extraArgs: [`-Dstudio.engine=${role}`, ...extraArgs],
    windowsHide: process.env.ENGINE_WINDOWS_HIDE !== '0',
    detached: process.env.ENGINE_DETACHED === '1',
  });
  const sim = new Simulator({ transport: transport('main'), restartOnCrash: process.env.SIM_RESTART !== '0' });
  sim.launch();
  // A second engine, for assembling a program first to see whether it
  // assembles, without touching the machine on screen: an engine's failed
  // assemble discards the program it held (docs/engine-protocol.md 4), so
  // a program with errors would otherwise take the last good one -- and
  // where it had run to -- with it.
  const checker = new Simulator({ transport: transport('checker') });
  checker.launch();
  let checkerTurn: Promise<unknown> = Promise.resolve();
  const onChecker = <T>(job: (c: Simulator) => Promise<T>): Promise<T> => {
    const turn = checkerTurn.then(() => job(checker));
    checkerTurn = turn.catch(() => {});
    return turn;
  };

  // The engine's own failures are replies with ok: false (its `code`): a
  // value, passed on.  A crash or a dead engine is an answer with ok: false
  // and an error, named so (preload.cjs makes it a rejection).
  const engineAnswer = async (f: () => Promise<unknown>) => {
    try {
      return { ok: true, value: await f() };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return { ok: false, error: { name: err.name, message: err.message } };
    }
  };
  // preload.cjs sends a call's arguments as a list; an engine command has one, its params.
  ipc.handle('sim:call', (_e, cmd: CallName, args: unknown[]) =>
    engineAnswer(() => (sim.call as (c: CallName, p?: object) => Promise<unknown>)(cmd, (args?.[0] ?? {}) as object)));
  ipc.handle('sim:stop', () => engineAnswer(() => sim.stop()));
  ipc.handle('sim:state', () => ({ state: sim.state, detail: sim.deadReason, rars: sim.rars }));
  ipc.handle('sim:check', (_e, source: string) => engineAnswer(async () => {
    try {
      return await onChecker((c) => c.call('assemble', { source }));
    } catch (e) {
      if (e instanceof EngineCrashed) return null; // the window then assembles on the machine itself
      throw e;
    }
  }));
  // The executable image (.asx) of the program last assembled -- not of the
  // Editor's text if it changed since: the source and its file as they were
  // then.  Read in the checker, one job at a time there.
  ipc.handle('file:exportImage', (_e, job: ImageJob) => answer(() => exportImage(win,
    job, () => onChecker((c) => readImage((cmd, params) => c.call(cmd, params), job.source)), EngineCrashed)));
  const toWindow = (channel: string, ...args: unknown[]) => { if (!win.isDestroyed()) win.webContents.send(channel, ...args); };
  sim.on('console', (text) => toWindow('sim:console', text));
  sim.on('input', (pc) => toWindow('sim:input', pc));
  sim.on('crashed', (report) => toWindow('sim:crashed', report.message, report.cause, report.restarted));
  sim.on('state', (state, detail) => toWindow('sim:state', state, detail));

  let disposed = false;
  return {
    // The engine's RARS version is known once it is ready (a cold start on
    // Windows takes a quarter of a second): About waits for it, at most 5 s,
    // rather than say "?".
    async about() {
      await Promise.race([sim.whenReady().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
      return { rars: sim.rars };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      ipc.remove();
      for (const s of [sim, checker]) { s.removeAllListeners(); s.close(); }
    },
  };
}
