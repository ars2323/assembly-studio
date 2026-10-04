/* What the main process's IPC handlers share: answers as values, and a
   handler set that can be taken down again (an engine's, when the ISA
   changes: src/main/main.ts isa:select). */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';

// Calls come back as results, never as thrown errors: a thrown error in a
// handler is also logged by Electron as a failure.  preload.cjs unwraps them.
export type Result<T> = { ok: true; value: T } | { ok: false; error: { name: string; message: string } };
export async function answer<T>(f: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await f() };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { ok: false, error: { name: err.name, message: err.message } };
  }
}

// ipcMain.handle, remembering the channels so that remove() takes them all down.
export function handlers(): {
  handle(channel: string, f: (e: IpcMainInvokeEvent, ...args: any[]) => unknown): void;
  remove(): void;
} {
  const channels: string[] = [];
  return {
    handle(channel, f) {
      ipcMain.handle(channel, f);
      channels.push(channel);
    },
    remove() {
      for (const c of channels.splice(0)) ipcMain.removeHandler(c);
    },
  };
}

// What an engine module (engine-mips.ts, engine-riscv.ts) gives main.ts.
export interface Engine {
  // What About says of the engine, besides the app's own fields (RISC-V: { rars }).
  about(): Promise<Record<string, string>>;
  // Its sim:* handlers down, its processes ended.  Idempotent.
  dispose(): Promise<void>;
}
