/* Updates, from GitHub Releases: electron-updater's GitHub provider (the
   publish entry in tools/package.ts, which the package carries as
   resources/app-update.yml).  It reads the release marked Latest -- its
   latest.yml, then its installer (only the changed blocks when it can);
   pre-releases (the trials, the engines-…
   zips) are never looked at.

   The first screen asks, once per run, while its opening plays
   (src/renderer/app/panels/welcome.ts):

     update:check     -> { available, version? }; no answer in CHECK_TIMEOUT_MS: not available
     update:download  -> starts the download: update:progress { percent, transferred, total }
                         to the window as it goes, then update:ready -- or update:error (a message)
     update:install   -> the program quits, the installer runs silently and starts the new version

   Nothing is downloaded or installed unless the window asks.  Only the
   packaged program looks; from the source tree there is never an update,
   except with STUDIO_UPDATE_FAKE=<version> (for looking at the first screen,
   tools/shot.ts and the like): an update to that version is "available" and
   its download is made up, about 4 s long.  STUDIO_UPDATE_FAKE_HOLD=<percent>
   stops it there; STUDIO_UPDATE_FAKE_FAIL=<percent> fails it there; installing
   only says so on the console.

   Nothing here stops the program: a failure is logged and answered as "no
   update" (the check) or update:error (the rest), and the first screen goes on. */

import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { app, ipcMain, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

import { brand } from '../brand.ts';

export interface UpdateCheck { available: boolean; version?: string }
export interface UpdateProgress { percent: number; transferred: number; total: number }

// How long the check may take before the first screen goes on without it.
export const CHECK_TIMEOUT_MS = 6_000;

interface Source {
  check(): Promise<UpdateCheck>;
  download(on: { progress(p: UpdateProgress): void; ready(): void; error(message: string): void }): void;
  install(onError: (message: string) => void): void;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function updates(win: BrowserWindow): void {
  const send = (channel: string, ...args: unknown[]) => { if (!win.isDestroyed()) win.webContents.send(channel, ...args); };
  const fake = app.isPackaged ? undefined : process.env.STUDIO_UPDATE_FAKE;
  let source: Source | null = null;
  try {
    source = fake ? fakeSource(fake) : app.isPackaged ? realSource() : null;
  } catch (e) {
    console.error('update: not available:', e);
  }
  let downloading = false;

  ipcMain.handle('update:check', async (): Promise<UpdateCheck> => {
    if (!source) return { available: false };
    const late = new Promise<UpdateCheck>((done) => setTimeout(() => done({ available: false }), CHECK_TIMEOUT_MS).unref());
    try {
      return await Promise.race([source.check(), late]);
    } catch (e) {
      console.error('update check:', message(e));
      return { available: false };
    }
  });
  ipcMain.handle('update:download', () => {
    if (!source || downloading) return;
    downloading = true;
    const failed = (m: string) => { downloading = false; console.error('update download:', m); send('update:error', m); };
    try {
      source.download({ progress: (p) => send('update:progress', p), ready: () => send('update:ready'), error: failed });
    } catch (e) {
      failed(message(e));
    }
  });
  ipcMain.handle('update:install', () => {
    const failed = (m: string) => { console.error('update install:', m); send('update:error', m); };
    try {
      source?.install(failed);
    } catch (e) {
      failed(message(e));
    }
  });
}

/* What electron-updater says (what it checked, how much of the installer it
   downloaded -- "Full: …, To download: …"), kept in update.log as well as on
   the console: an installed program's console is nowhere to be seen.  The
   file is in the updater's own folder, %LOCALAPPDATA%\<name>-updater (the
   program's profile is this run's alone and goes when it exits; this folder
   holds the installer's copy for updates and goes with an uninstall,
   packaging/installer.nsh).  Started afresh once it passes LOG_LIMIT. */
const LOG_LIMIT = 256 * 1024;
export const updateLogFile = (): string =>
  path.join(process.env.LOCALAPPDATA ?? app.getPath('appData'), `${brand.exe.toLowerCase()}-updater`, 'update.log');
function fileLogger(): { info(m: unknown): void; warn(m: unknown): void; error(m: unknown): void } {
  const file = updateLogFile();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > LOG_LIMIT) writeFileSync(file, '');
  } catch { /* no log file: the console only */ }
  const write = (level: string, m: unknown) => {
    try { appendFileSync(file, `${new Date().toISOString()} ${level} v${app.getVersion()} ${String(m)}\n`); } catch { /* the console has it */ }
  };
  return {
    info: (m) => { console.log('update:', m); write('info', m); },
    warn: (m) => { console.warn('update:', m); write('warn', m); },
    error: (m) => { console.error('update:', m); write('error', m); },
  };
}

function realSource(): Source {
  const u = electronUpdater.autoUpdater;
  u.logger = fileLogger();
  u.autoDownload = false;            // only when the window asks
  u.autoInstallOnAppQuit = false;    // only through update:install
  u.allowPrerelease = false;         // the trials are pre-releases
  // Only the blocks that changed: the installer of the version installed,
  // kept by itself in %LOCALAPPDATA%\<name>-updater (packaging/installer.nsh),
  // against the two releases' .blockmap files.  Without that copy, or on any
  // failure, electron-updater downloads the whole installer instead.
  u.disableDifferentialDownload = false;
  // Every failure is also an 'error' event, and an EventEmitter with no
  // listener for it throws: this one only logs (the calls report their own).
  let onInstallError: ((m: string) => void) | null = null;
  u.on('error', (e) => {
    console.error('update:', message(e));
    onInstallError?.(message(e));
  });
  return {
    async check() {
      const r = await u.checkForUpdates();
      return r?.isUpdateAvailable ? { available: true, version: r.updateInfo.version } : { available: false };
    },
    download(on) {
      const progress = (p: UpdateProgress) => on.progress({ percent: p.percent, transferred: p.transferred, total: p.total });
      u.on('download-progress', progress);
      u.downloadUpdate().then(
        () => { u.off('download-progress', progress); on.ready(); },
        (e) => { u.off('download-progress', progress); on.error(message(e)); });
    },
    install(onError) {
      onInstallError = onError;
      // Silent (no installer pages), and the new version started when it is done.
      setImmediate(() => u.quitAndInstall(true, true));
    },
  };
}

function fakeSource(version: string): Source {
  const total = 148_160_000;   // about the installer's size
  const percent = (name: string) => {
    const n = Number(process.env[name]);
    return process.env[name] && Number.isFinite(n) ? n : null;
  };
  const hold = percent('STUDIO_UPDATE_FAKE_HOLD');
  const fail = percent('STUDIO_UPDATE_FAKE_FAIL');
  console.log(`STUDIO_UPDATE_FAKE: an update to ${version}, made up`);
  return {
    check: () => new Promise((done) => setTimeout(() => done({ available: true, version }), 600)),
    download(on) {
      let at = 0;
      const tick = setInterval(() => {
        at = Math.min(100, at + 2.5);
        const stop = hold !== null && at >= hold ? hold : fail !== null && at >= fail ? fail : null;
        const now = stop ?? at;
        on.progress({ percent: now, transferred: Math.round(total * now / 100), total });
        if (fail !== null && now === fail) { clearInterval(tick); on.error('STUDIO_UPDATE_FAKE_FAIL'); return; }
        if (stop !== null) { clearInterval(tick); return; }
        if (at === 100) { clearInterval(tick); on.ready(); }
      }, 100);
    },
    install() {
      console.log('STUDIO_UPDATE_FAKE: the program would quit, install and start again now');
    },
  };
}
