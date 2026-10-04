/* Electron's main process: the host.  It owns the engine of the ISA in use
   and everything that touches the disk: source files (decoded and encoded
   here, src/node/text-file.ts) and the example programs.  The window sees
   only window.app (preload.cjs).

   The ISA: MIPS (SPIM's core in utility processes, engine-mips.ts) or
   RISC-V (RARS in JVMs, engine-riscv.ts).  `--isa=mips|riscv` picks the
   one to start with (default mips); isa:select changes it while the app
   runs: the engine in use is ended, the other started, and the window
   loads that ISA's page (index.html?isa=<isa>).  Only the engine in use
   runs.  The engine modules register their own sim:* handlers; everything
   else is here and serves both.

   Nothing is kept from one run to the next -- lab PCs are shared, and every
   student starts from the same screen: the window's size, the panels, the
   files opened, the font size and the Data radix all start from their
   defaults every time.  Settings live in memory for this run only.

   Chromium needs a profile folder while it runs (caches, its own state).
   Each run gets a new one, <temp>\<brand.exe>\run-<pid>-<time>, removed when
   the program quits; one a run could not remove (Windows keeps some files
   open until the process is gone) is removed at the next start, once its
   process is no longer running.  Nothing goes to %APPDATA%.
   STUDIO_USER_DATA (a directory) is where the run folders go instead of
   <temp>\<brand.exe>: the tests look into it. */

import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { decodeTextFile, encodeTextFile, NEW_FILE_FORMAT, type TextFileFormat } from '../node/text-file.ts';
import { brand } from '../brand.ts';
import * as mips from './engine-mips.ts';
import * as riscv from './engine-riscv.ts';
import { answer, type Engine } from './ipc.ts';
import { LICENSES, paths, version, type Isa } from './paths.ts';
import { LIGHT_BACKGROUND, WINDOW_COLOURS } from './theme.ts';

export type { ImageJob, ImageReply } from './export-image.ts';

app.setName(brand.name);
// The top bar's height in the window (src/renderer/app/app.css --titlebar).
const TITLE_BAR_HEIGHT = 36;
// The caption buttons' patch stops one pixel short of it: the bar's bottom
// border (app.css .titlebar) runs under the buttons instead of breaking there.
const CAPTION_HEIGHT = TITLE_BAR_HEIGHT - 1;
// The Start menu shortcut carries this id (tools/package.ts appId): the window groups with it.
if (process.platform === 'win32') app.setAppUserModelId(brand.appId);
// ---- this run's profile folder, and nothing else on disk --------------------

const runsDir = process.env.STUDIO_USER_DATA ?? path.join(os.tmpdir(), brand.exe);
const runDir = path.join(runsDir, `run-${process.pid}-${Date.now()}`);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
// Folders of earlier runs whose process is gone (a running copy's is left alone).
for (const name of (() => { try { return readdirSync(runsDir); } catch { return []; } })()) {
  const pid = Number(/^run-(\d+)-/.exec(name)?.[1]);
  if (pid && pid !== process.pid && !alive(pid)) rmSync(path.join(runsDir, name), { recursive: true, force: true });
}
mkdirSync(runDir, { recursive: true });
app.setPath('userData', runDir);
app.setPath('sessionData', runDir);
app.setPath('crashDumps', path.join(runDir, 'Crashpad'));
// Chromium writes into the folder until its very end, so the folder is removed
// after the program has exited: by this same executable run as plain Node,
// detached, waiting for this process to be gone (at most 15 s).
app.on('quit', () => {
  const script = `const {rmSync}=require('fs');const pid=${process.pid};const dir=${JSON.stringify(runDir)};
const gone=()=>{try{process.kill(pid,0);return false}catch(e){return e.code!=='EPERM'}};
const t0=Date.now();(function wait(){if(gone()||Date.now()-t0>15000){try{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}}else setTimeout(wait,100)})();`;
  try {
    spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).unref();
  } catch { /* the next start removes it */ }
});

// ---- settings: for this run only ------------------------------------------------

export interface Settings {
  fontSize: number;          // px of the code font; the UI font follows
  dataBase: 2 | 10 | 16;     // Data panel values
}
const DEFAULT_SETTINGS: Settings = { fontSize: 13, dataBase: 16 };
let settings: Settings = { ...DEFAULT_SETTINGS };

function setSettings(s: Partial<Settings>): Settings {
  settings = {
    fontSize: Number.isInteger(s.fontSize) && s.fontSize! >= 10 && s.fontSize! <= 24 ? s.fontSize! : settings.fontSize,
    dataBase: s.dataBase === 2 || s.dataBase === 10 || s.dataBase === 16 ? s.dataBase : settings.dataBase,
  };
  return { ...settings };
}

// ---- files ------------------------------------------------------------------

export interface OpenedFile {
  name: string;
  path: string | null;
  text: string;
  format: TextFileFormat;
}

function openBytes(bytes: Uint8Array, name: string, filePath: string | null): OpenedFile {
  const decoded = decodeTextFile(bytes);
  return { name, path: filePath, text: decoded.text, format: decoded.format };
}

async function main(): Promise<void> {
  Menu.setApplicationMenu(null); // no default zoom/reload accelerators; the window has its own keys
  await app.whenReady();
  // The window starts at a fixed size -- or fills the screen when the screen
  // is smaller (a lab PC: 1366x768 at 125% leaves about 1093x582) -- and
  // nothing of its size or place is kept for the next start.
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1280, area.width),
    height: Math.min(800, area.height),
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: brand.name,
    backgroundColor: WINDOW_COLOURS.background,
    // No system title bar: the window's own top bar carries the logo and the
    // name (the toolbar is a row under it).  The caption buttons stay the system's own
    // (titleBarOverlay), so Windows 11's snap layouts -- the flyout on the
    // maximise button -- keep working, as do double-click to maximise and
    // dragging to the top edge on the bar's drag region.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: WINDOW_COLOURS.titlebar, symbolColor: WINDOW_COLOURS.symbol, height: CAPTION_HEIGHT },
    webPreferences: {
      preload: paths.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // The engine of the ISA in use; isa:select ends it and starts the other.
  // One change at a time: a second select waits for the first.
  let isa: Isa = initialIsa();
  const startEngine = (which: Isa): Engine => (which === 'mips' ? mips.start(win) : riscv.start(win, runDir));
  let engine = startEngine(isa);
  let switching: Promise<unknown> = Promise.resolve();
  // ?then: the page of the other ISA, loaded because the first screen chose
  // it and then a way in (tutorial, new, open), which that page goes on to
  // do at once (panels/welcome.ts, app.ts).
  const loadPage = (then?: string) => win.loadFile(paths.page, { query: then ? { isa, then } : { isa } });
  ipcMain.handle('isa:select', (_e, which: unknown, then: unknown) => answer(() => {
    if (which !== 'mips' && which !== 'riscv') throw new Error(`no ISA ${String(which)}`);
    const next = then === 'tutorial' || then === 'new' || then === 'open' ? then : undefined;
    const turn = switching.then(async () => {
      if (which === isa) return isa; // already in use: nothing ends, nothing reloads
      await engine.dispose();
      isa = which;
      engine = startEngine(isa);
      // After this answer has gone back: the page that asked is replaced.
      setImmediate(() => { if (!win.isDestroyed()) void loadPage(next); });
      return isa;
    });
    switching = turn.catch(() => {});
    return turn;
  }));
  app.on('will-quit', () => { void engine.dispose(); });
  const assemblyFilter = () => ({ name: isa === 'mips' ? 'MIPS assembly' : 'RISC-V assembly', extensions: ['s', 'asm'] });

  ipcMain.handle('file:open', () => answer(async () => {
    const r = await dialog.showOpenDialog(win, { filters: [assemblyFilter(), { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || r.filePaths.length === 0) return null;
    const p = r.filePaths[0];
    return openBytes(readFileSync(p), path.basename(p), p);
  }));
  ipcMain.handle('file:save', (_e, file: { path: string | null; name: string; text: string; format: TextFileFormat | null }) =>
    answer(async () => {
      let target = file.path;
      if (target === null) {
        const r = await dialog.showSaveDialog(win, { defaultPath: file.name, filters: [{ ...assemblyFilter(), extensions: ['s'] }] });
        if (r.canceled || !r.filePath) return null;
        target = r.filePath;
      }
      const encoded = encodeTextFile(file.text, file.format ?? NEW_FILE_FORMAT);
      if (!encoded.ok) throw new Error(`Not saved: line ${encoded.firstBadLine} has characters the file's encoding (${file.format?.encoding}) cannot hold`);
      writeFileSync(target, encoded.bytes);
      return { path: target, name: path.basename(target) };
    }));
  // The tutorial's examples; `lang` 'en': the same programs with English comments (examples/en/).
  ipcMain.handle('example:open', (_e, name: string, lang?: unknown) => answer(() => {
    if (!/^[a-z0-9-]+\.s$/.test(name)) throw new Error(`no example ${name}`);
    return openBytes(readFileSync(path.join(paths.examples(isa), lang === 'en' ? 'en' : '', name)), name, null);
  }));
  ipcMain.handle('about:info', async () => ({
    version, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
    licenses: LICENSES.map((l) => l.title), ...(await engine.about()),
  }));
  ipcMain.handle('about:license', (_e, i: number) => answer(() => {
    if (i === LICENSES.length) return readFileSync(paths.electronLicense(), 'utf8');
    return readFileSync(paths.license(LICENSES[i].name), 'utf8');
  }));
  ipcMain.handle('about:openCredits', () => answer(async () => {
    const error = await shell.openPath(paths.chromiumCredits());
    if (error) throw new Error(error);
  }));
  ipcMain.handle('settings:get', () => ({ ...settings }));
  ipcMain.handle('settings:set', (_e, s: Settings) => {
    return setSettings(s);
  });
  // The caption buttons' patch (titleBarOverlay, drawn by Windows) and
  // their symbols take the colours the page asks for: transparent and white
  // on the first screen, white or white under what covers the page (the
  // tutorial's dim, a dialog's backdrop) elsewhere
  // (src/renderer/app/logic/overlay.ts).  The buttons themselves keep
  // working.  Kept on the window for the tests to read (Electron has no
  // getter for it).
  // The page's theme (renderer theme.ts): the window's own background follows,
  // so a page loaded again does not flash the other theme's colour first.
  ipcMain.handle('win:theme', (_e, theme: unknown) => {
    try { win.setBackgroundColor(theme === 'light' ? LIGHT_BACKGROUND : WINDOW_COLOURS.background); } catch { /* closing */ }
  });
  ipcMain.handle('win:overlay', (_e, patch: { color: string; symbolColor: string }) => {
    Object.assign(win, { overlayColor: patch.color, overlaySymbol: patch.symbolColor });
    try { win.setTitleBarOverlay({ color: patch.color, symbolColor: patch.symbolColor, height: CAPTION_HEIGHT }); } catch { /* no title bar overlay on this platform */ }
  });

  // Maximised before it is shown -- every start, whatever the screen, since
  // nothing is kept: the whole screen is what the panels are laid out for
  // (the window's own size, 1280x800, is what un-maximising gives).
  // (maximize() shows a hidden window; show() then gives it focus.)
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  await loadPage();
}

// --isa=mips|riscv (default mips): the ISA the app starts with.
function initialIsa(): Isa {
  const arg = process.argv.find((a) => a.startsWith('--isa='))?.slice('--isa='.length);
  if (arg === undefined || arg === 'mips') return 'mips';
  if (arg === 'riscv') return 'riscv';
  console.error(`--isa=${arg}: not mips or riscv; starting with mips`);
  return 'mips';
}

app.on('window-all-closed', () => app.quit());
main().catch((e) => {
  console.error(e);
  app.exit(1);
});
