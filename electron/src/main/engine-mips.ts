/* The MIPS engine in the main process: SPIM's core in a utility process
   (src/sim/host.ts), and a second one for checking a program and for the
   .hmx export.  Registers the sim:* handlers the MIPS window
   (src/renderer/app/app.ts) calls, and the two that only it has
   (file:exportImage, file:openHandler). */

import { app, dialog, type BrowserWindow } from 'electron';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { brand } from '../brand.ts';
import { formatHmx, hmxTime } from '../core/hmx.ts';
import { decodeTextFile, encodeTextFile, NEW_FILE_FORMAT, type TextFileFormat } from '../node/text-file.ts';
import { Simulator, SimulatorCrashed } from '../sim/host.ts';
import { ImageError, readImage } from '../sim/image.ts';
import type { CallName, Calls } from '../sim/protocol.ts';
import { utilityTransport } from '../sim/transport.ts';
import { answer, handlers, type Engine } from './ipc.ts';
import { version } from './paths.ts';

type AssembleOptions = Calls['assemble'][0][1];

// What the window asks an export for: the program it last assembled, as it was then.
export interface ImageJob {
  source: string;
  options: AssembleOptions;
  name: string;                       // the file's name then ("untitled.s" if never saved)
  path: string | null;                // where it was; the .hmx is offered next to it
  format: TextFileFormat | null;      // how that file is written (null: a new file's)
  assembled: number;                  // when, in ms since the epoch
}

export function start(win: BrowserWindow): Engine {
  const ipc = handlers();
  let disposed = false;
  const sim = Simulator.start({ transport: () => utilityTransport() });
  // The core cannot start: nothing works without it.
  sim.catch((e) => { if (!disposed) { console.error(e); app.exit(1); } });
  // A second simulator process, for assembling a program first to see whether
  // it assembles, without touching the machine on screen: the core's own
  // assemble starts from an empty machine, so a program with errors would
  // otherwise take the last good one -- and where it had run to -- with it.
  // Its crashes are its own (a .err directive ends the core): it starts
  // again, and the call that crashed it answers SimulatorCrashed.
  const checker = Simulator.start({ transport: () => utilityTransport() });
  checker.catch(() => {}); // not started: the window assembles as before (app.ts assemble)
  // One job at a time there: an export assembles twice and reads in between.
  let checkerTurn: Promise<unknown> = Promise.resolve();
  const onChecker = <T>(job: (c: Simulator) => Promise<T>): Promise<T> => {
    const turn = checkerTurn.then(async () => job(await checker));
    checkerTurn = turn.catch(() => {});
    return turn;
  };

  const toWindow = (channel: string, ...args: unknown[]) => { if (!win.isDestroyed()) win.webContents.send(channel, ...args); };
  void sim.then((s) => {
    if (disposed) return;
    s.on('console', (text) => toWindow('sim:console', text));
    s.on('progress', (p) => toWindow('sim:progress', p));
    s.on('crashed', (report) => toWindow('sim:crashed', report.message, report.error.message));
  }, () => {});

  // run goes through sim.run(), which stop() needs to know about.
  ipc.handle('sim:call', (_e, method: CallName, args: unknown[]) => answer(async () => {
    const s = await sim;
    return method === 'run' ? s.run() : (s.call as (m: CallName, ...a: unknown[]) => Promise<unknown>)(method, ...args);
  }));
  ipc.handle('sim:stop', () => answer(async () => (await sim).stop()));
  // A crash is an answer here, not an error (an error's name does not
  // cross into the page): { ok: false, crashed: what the core said }.
  ipc.handle('sim:check', (_e, source: string, options: AssembleOptions) => answer(async () => {
    try {
      return await onChecker((c) => c.assemble(source, options));
    } catch (e) {
      if (e instanceof SimulatorCrashed) return { ok: false, errors: [], symbols: '', format: null, data: { start: 0, end: 0 }, crashed: e.message };
      throw e;
    }
  }));
  // The executable image (.hmx, ../docs/hmx-format.md) of the program last
  // assembled -- not of the Editor's text if it changed since: the source,
  // its options and its file as they were then.  Read in the second
  // process; the machine on screen is not touched.  The hash is of the
  // source as its file holds it (its encoding, BOM and line ends): for a
  // file saved when it was assembled, the file's own SHA-256.
  ipc.handle('file:exportImage', (_e, job: ImageJob) => answer(async () => {
    let machine;
    try {
      machine = await onChecker((c) => readImage((m, ...a) => c.call(m, ...a), job.source, job.options));
    } catch (e) {
      if (e instanceof ImageError) return { error: e.message };
      if (e instanceof SimulatorCrashed) return { error: 'The simulator stopped while making the executable image' };
      throw e;
    }
    const encoded = encodeTextFile(job.source, job.format ?? NEW_FILE_FORMAT);
    const bytes = encoded.ok ? encoded.bytes : new TextEncoder().encode(job.source);
    const text = formatHmx({
      ...machine, source: job.name, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      producedBy: `${brand.name} ${version}`, assembled: hmxTime(new Date(job.assembled)),
    });
    const name = `${job.name.replace(/\.(s|asm)$/i, '')}.hmx`;
    const r = await dialog.showSaveDialog(win, {
      title: 'Export executable image (.hmx)', defaultPath: job.path ? path.join(path.dirname(job.path), name) : name,
      filters: [{ name: 'Executable image', extensions: ['hmx'] }],
    });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, text);
    return { path: r.filePath, name: path.basename(r.filePath) };
  }));
  // An exception handler for Settings > 고급: its name and text (decoded like a program).
  ipc.handle('file:openHandler', () => answer(async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Exception handler', filters: [{ name: 'MIPS assembly', extensions: ['s', 'asm', 'a'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || r.filePaths.length === 0) return null;
    return { name: path.basename(r.filePaths[0]), text: decodeTextFile(readFileSync(r.filePaths[0])).text };
  }));

  return {
    about: async () => ({}),
    async dispose() {
      if (disposed) return;
      disposed = true;
      ipc.remove();
      for (const s of [sim, checker]) {
        await s.then((x) => { x.removeAllListeners(); x.close(); }, () => {});
      }
    },
  };
}
