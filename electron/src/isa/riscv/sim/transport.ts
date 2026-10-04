/* The one thing that knows how the engine process is started and talked to.
   The host (host.ts) sees only this interface.

   The simulator is a JVM running the engine (RarsProbe, around RARS): a
   child process whose stdin and stdout carry one JSON object per line
   (docs/engine-protocol.md 1).  (MIPS's is a Node worker loading an N-API
   addon, src/sim/transport.ts.)

   Where the engine is: ENGINE_JAVA (the java executable; default `java` on
   PATH, or the bundled jlink runtime) and the class path of the engine's
   classes and the RARS jar (src/main/paths.ts engine()). */

import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process';
import { createWriteStream } from 'node:fs';

import type { EngineMessage } from './protocol.ts';

export interface ExitInfo {
  code: number | null;
  signal: string | null;
  stderr: string;           // the process's last words
  spawnError?: string;      // it never started (no java, a bad path)
}

export interface Transport {
  send(line: object): void;
  onMessage(listener: (message: EngineMessage) => void): void;
  onExit(listener: (info: ExitInfo) => void): void;
  kill(): void; // forcibly; the host uses it only as a last resort
  pid?: number;  // the engine's process, for the checks that it is gone
}

export type TransportFactory = () => Transport;

export interface EngineCommand {
  java: string;
  classpath: string;
  prefsDir?: string;   // where RARS's java.util.prefs settings go (never the user's home)
  extraArgs?: string[];
  // Windows: java.exe is a console program, and started from a window (no
  // console of its own) it gets a new console window -- a black box flashing
  // up at every start and restart.  Hidden unless false (ENGINE_WINDOWS_HIDE=0,
  // a negative control).
  windowsHide?: boolean;
  // Outside this process's Windows job object (libuv puts every child in one
  // that kills it when this process dies).  Only the negative control of the
  // orphan checks sets it (ENGINE_DETACHED=1): an engine left to itself.
  detached?: boolean;
  // The engine's stderr -- the JVM's and its libraries' words, never the
  // student's program's (RarsProbe.ErrRouter) -- appended here.  It is a
  // log, not the Console: "Picked up JAVA_TOOL_OPTIONS" on a lab PC with a
  // company Java, a java.util.logging line, must not open the Console.
  logFile?: string;
}

const STDERR_KEPT = 8192;

// JVM unified logging writes to stdout by default, which is the protocol
// channel (docs/engine-protocol.md 1): warnings go to stderr instead.
// Text is UTF-8 on every stream, whatever the PC's code page: RARS reads and
// writes the console through the default charset (SystemIO), which JDK 21
// makes UTF-8 but a Korean Windows' MS949 would replace (file.encoding=COMPAT,
// the negative control of tools/engine-windows.ts); stderr follows the code
// page unless told.
export function engineArgs(cmd: EngineCommand): string[] {
  return ['-Xlog:disable', '-Xlog:all=warning:stderr', '-Djava.awt.headless=true',
    '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8',
    // This process: the engine leaves when it is gone (RarsProbe, "parent.pid").
    `-Dparent.pid=${process.pid}`,
    // RARS's settings in the engine's own folder and nowhere else: not in the
    // registry on Windows, not in the user's home (probe/src/StudioPrefs.java).
    '-Djava.util.prefs.PreferencesFactory=StudioPrefs',
    ...(cmd.prefsDir ? [`-Djava.util.prefs.userRoot=${cmd.prefsDir}`] : []),
    ...(cmd.extraArgs ?? []), '-cp', cmd.classpath, 'RarsProbe'];
}

// java.exe itself, never through a shell or a .bat (a JVM a grandchild would
// escape what ends the children); no console window (windowsHide); in the
// parent's job object on Windows (not detached: libuv's job, which kills it
// with the parent).
export function spawnOptions(cmd: EngineCommand, env: NodeJS.ProcessEnv): SpawnOptions {
  return { stdio: ['pipe', 'pipe', 'pipe'], env, shell: false, windowsHide: cmd.windowsHide ?? true, detached: cmd.detached ?? false };
}

export function engineTransport(cmd: EngineCommand, env: NodeJS.ProcessEnv = process.env): Transport {
  const child = spawn(cmd.java, engineArgs(cmd), spawnOptions(cmd, env)) as ChildProcessWithoutNullStreams;
  const listeners: ((m: EngineMessage) => void)[] = [];
  const exitListeners: ((info: ExitInfo) => void)[] = [];
  let stderr = '';
  let spawnError: string | undefined;
  let alive = true;

  child.stderr.setEncoding('utf8');
  const log = cmd.logFile ? createWriteStream(cmd.logFile, { flags: 'a' }) : null;
  log?.on('error', () => { /* a log that cannot be written is no reason to stop the engine */ });
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_KEPT); // the last words, for a crash report
    log?.write(chunk);
    process.stderr.write(chunk);
  });
  child.on('close', () => log?.end());
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line === '') continue;
      let m: EngineMessage;
      try {
        m = JSON.parse(line) as EngineMessage;
      } catch {
        // Something other than the engine wrote to its fd 1. Loudly (8.6).
        process.stderr.write(`engine: non-JSON on stdout: ${JSON.stringify(line)}\n`);
        m = { ev: 'nonjson', text: line };
      }
      for (const l of listeners) l(m);
    }
  });
  child.on('error', (e) => { spawnError = e.message; });
  // 'close' comes after stdout and stderr have been read to their end.
  child.on('close', (code, signal) => {
    alive = false;
    for (const l of exitListeners) l({ code, signal, stderr, spawnError });
  });
  child.stdin.on('error', () => { /* the engine died: 'close' says so */ });
  return {
    send: (line) => { if (alive && child.stdin.writable) child.stdin.write(JSON.stringify(line) + '\n'); },
    onMessage: (l) => { listeners.push(l); },
    onExit: (l) => { exitListeners.push(l); },
    // SIGKILL: on Windows, which has no signals, libuv's TerminateProcess.
    kill: () => { child.kill('SIGKILL'); },
    pid: child.pid,
  };
}
