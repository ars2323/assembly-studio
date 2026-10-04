/* window.app, as src/main/preload.cjs exposes it. */

import type { ImageJob, ImageReply, OpenedFile, Settings, UpdateCheck, UpdateProgress } from '../../main/main.ts';
import type { TextFileFormat } from '../../node/text-file.ts';
import type { CallName, Calls } from '../../sim/protocol.ts';

export interface AppApi {
  // The ISA this window is for (the page's ?isa=), and changing it: the main
  // process ends this engine, starts the other and loads that ISA's page.
  isa(): 'mips' | 'riscv';
  selectIsa(isa: 'mips' | 'riscv', then?: 'tutorial' | 'new' | 'open'): Promise<'mips' | 'riscv'>;
  call<M extends CallName>(method: M, ...args: Calls[M][0]): Promise<Calls[M][1]>;
  stop(): Promise<'stopped' | 'idle' | 'killed'>;
  // Assembles in a second process, the machine on screen untouched: does it assemble?
  // `crashed`: the core ended while assembling it (a .err directive), in that process only;
  // `crashLine`: the line it was reading then, if known.
  check(source: string, options?: Calls['assemble'][0][1]): Promise<Calls['assemble'][1] & { crashed?: string; crashLine?: number | null }>;
  onConsole(listener: (text: string) => void): void;
  onProgress(listener: (p: { pc: number; instructions: number }) => void): void;
  onCrashed(listener: (message: string, detail: string) => void): void;
  openFile(): Promise<OpenedFile | null>;
  saveFile(file: { path: string | null; name: string; text: string; format: TextFileFormat | null }):
    Promise<{ path: string; name: string } | null>;
  // The last assembled program as an executable image (.asx): the save
  // dialog, then the file.  null: cancelled; { error }: no image (why, for the student).
  exportImage(job: ImageJob): Promise<ImageReply>;
  openExample(name: string, lang?: 'ko' | 'en'): Promise<OpenedFile>; // lang: its comments' (src/examples/en/)
  openHandler(): Promise<{ name: string; text: string } | null>;
  about(): Promise<AboutInfo>;
  license(index: number): Promise<string>;  // LICENSES[index]; one past the end: Electron's
  openCredits(): Promise<void>;             // LICENSES.chromium.html, in the browser
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<Settings>;
  setOverlay(patch: { color: string; symbolColor: string }): Promise<void>;  // the caption buttons' patch and symbols (logic/overlay.ts)
  setTheme(theme: 'dark' | 'light'): Promise<void>;  // the window's own background for the theme (theme.ts)
  // Updates (src/main/updater.ts; the first screen, panels/welcome.ts): is there
  // a newer release (no answer after about 6 s: no); its download, with
  // progress, then ready or an error; installing it (the program quits, the
  // installer runs silently and starts the new version).
  checkUpdate(): Promise<UpdateCheck>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateProgress(listener: (p: UpdateProgress) => void): void;
  onUpdateReady(listener: () => void): void;
  onUpdateError(listener: (message: string) => void): void;
}

export interface AboutInfo {
  version: string; electron: string; chrome: string; node: string;
  licenses: string[]; // titles, in order
}

declare global { interface Window { app: AppApi } }
