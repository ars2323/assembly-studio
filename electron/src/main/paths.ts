/* Where the app's own files are.  Run from the source tree (npm run
   electron, the e2e tests) they are where the repository keeps them; in the
   packaged app, tools/package.ts bundles the main process into one file
   (defining STUDIO_BUNDLE) and puts everything else next to it:

     main.js  worker.js  preload.cjs  spim.node  exceptions.s
     renderer/app/{index.html, isa.js, app.css, riscv.css, app-mips.js, app-riscv.js}
     renderer/assets/   examples/   riscv-examples/   licenses/      (resources/app.asar)
     engine/{runtime/, classes/, rars.jar}            (resources/, outside the asar)
     LICENSE  NOTICE  LICENSE.electron.txt  LICENSES.chromium.html   (next to the executable)

   The RISC-V engine (docs/engine-protocol.md) is a JVM: `java`, the
   engine's classes (RarsProbe) and the RARS jar.  Packaged: resources/engine/
   -- the jlink runtime, classes/, rars.jar.  From the source tree, each
   from electron/engine/ when it is there (the layout engines/fetch.mjs
   unpacks), else: the java on PATH; probe/build/classes (probe/run.sh
   build); the jar probe/setup.sh builds from RARS's pinned commit
   ($RARS_HOME/rars-src.jar).  ENGINE_JAVA, ENGINE_CLASSES and RARS_JAR
   override either. */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { brand } from '../brand.ts';

const bundled = process.env.STUDIO_BUNDLE === '1';
const here = import.meta.dirname;
const root = path.join(here, '..', '..');
const electronDist = () => path.dirname(process.execPath); // the Electron binary's folder, in both cases

export type Isa = 'mips' | 'riscv';

export const paths = {
  page: bundled ? path.join(here, 'renderer/app/index.html') : path.join(root, 'src/renderer/app/index.html'),
  preload: path.join(here, 'preload.cjs'),
  examples: (isa: Isa) => (isa === 'mips'
    ? (bundled ? path.join(here, 'examples') : path.join(root, 'src/examples'))
    : (bundled ? path.join(here, 'riscv-examples') : path.join(root, 'src/isa/riscv/examples'))),
  // A license file by its name in licenses/ (the packaged name; see LICENSES).
  license: (name: string) => (bundled ? path.join(here, 'licenses', name) : path.join(root, LICENSE_SOURCES[name])),
  electronLicense: () => path.join(electronDist(), bundled ? 'LICENSE.electron.txt' : 'LICENSE'),
  chromiumCredits: () => path.join(electronDist(), 'LICENSES.chromium.html'),
};

const java = (dir: string) => path.join(dir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
export function engine(): { java: string; classpath: string } {
  if (bundled) {
    const dir = path.join(process.resourcesPath, 'engine');
    return { java: process.env.ENGINE_JAVA ?? java(path.join(dir, 'runtime')),
      classpath: [process.env.ENGINE_CLASSES ?? path.join(dir, 'classes'), process.env.RARS_JAR ?? path.join(dir, 'rars.jar')].join(path.delimiter) };
  }
  const local = path.join(root, 'engine');
  const there = (p: string) => (existsSync(p) ? p : undefined);
  const rarsHome = process.env.RARS_HOME ?? path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'assembly-studio', 'rars');
  const jar = process.env.RARS_JAR ?? there(path.join(local, 'rars.jar')) ?? path.join(rarsHome, 'rars-src.jar');
  const classes = process.env.ENGINE_CLASSES ?? there(path.join(local, 'classes')) ?? path.join(root, '..', 'probe', 'build', 'classes');
  return { java: process.env.ENGINE_JAVA ?? there(java(path.join(local, 'runtime'))) ?? 'java', classpath: [classes, jar].join(path.delimiter) };
}

export const version: string = bundled
  ? (process.env.STUDIO_VERSION as string)
  : JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/* The notices About shows, in order: title, and the file in the source tree.
   tools/package.ts copies each into licenses/ under the same key, and puts
   LICENSE and NOTICE next to the executable as well (BSD: the notice goes
   with the binary). */
export const LICENSES: { name: string; title: string }[] = [
  { name: 'LICENSE', title: 'Assembly Studio — BSD 3-Clause License' },
  { name: 'NOTICE', title: 'NOTICE — SPIM, RARS, Java runtime, Electron, fonts, icons, brand assets' },
  ...(brand.id === 'hallym' ? [{ name: 'hallym-assets.md', title: 'Hallym University assets (marks, characters, app icon)' }] : []),
  { name: 'OFL-Pretendard.txt', title: 'Pretendard — SIL Open Font License 1.1' },
  { name: 'OFL-D2Coding.txt', title: 'D2Coding — SIL Open Font License 1.1' },
  { name: 'lucide-LICENSE.txt', title: 'Lucide icons — ISC License' },
  { name: 'flex-LICENSE.txt', title: 'flex — made the core\'s scanner (an acknowledgement; no notice required)' },
  { name: 'third-party.txt', title: 'Bundled libraries (CodeMirror, iconv-lite, node-addon-api …)' },
];

// (LICENSE and NOTICE are the repository's, at its root.)
export const LICENSE_SOURCES: Record<string, string> = {
  'LICENSE': '../LICENSE',
  'NOTICE': '../NOTICE',
  ...(brand.id === 'hallym' ? { 'hallym-assets.md': 'brands/hallym/assets/README.md' } : {}),
  'OFL-Pretendard.txt': 'src/renderer/assets/fonts/OFL-Pretendard.txt',
  'OFL-D2Coding.txt': 'src/renderer/assets/fonts/OFL-D2Coding.txt',
  'lucide-LICENSE.txt': 'src/renderer/assets/icons/lucide/LICENSE.txt',
  'flex-LICENSE.txt': 'native/LICENSE.flex.txt',
  'third-party.txt': 'build/licenses/third-party.txt', // tools/build-ui.ts writes it
};
