/* Bundles the window's scripts, one per ISA, each with what it imports
   (CodeMirror, the core modules):

     build/renderer/app-mips.js    src/renderer/app/app.ts
     build/renderer/app-riscv.js   src/isa/riscv/renderer/app.ts

   src/renderer/app/index.html loads the one for its ?isa= (isa.js).  Also writes
   build/licenses/third-party.txt: the licenses of every npm package the
   app bundles -- the windows', and the main process's and the simulator
   process's (analysed here, bundled only by tools/package.ts).

     node tools/build-ui.ts [--watch]
*/

import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { brandId, useBrand } from './brand.ts';
import { thirdPartyText } from './licenses.ts';

const root = path.join(import.meta.dirname, '..');
export const rendererOptions: esbuild.BuildOptions = {
  entryPoints: {
    'app-mips': path.join(root, 'src/renderer/app/app.ts'),
    'app-riscv': path.join(root, 'src/isa/riscv/renderer/app.ts'),
  },
  outdir: path.join(root, 'build/renderer'),
  bundle: true,
  format: 'iife',
  target: 'chrome140',
  sourcemap: true,
  metafile: true,
  logLevel: 'info',
  // src/renderer/startfield carries its own stylesheet and puts it in a
  // <style> itself, so the folder can be copied whole into another
  // simulator with nothing to add to the page.
  loader: { '.css': 'text' },
};
export const nodeOptions = (entry: string, outfile: string): esbuild.BuildOptions => ({
  entryPoints: [path.join(root, entry)],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['electron'],
  metafile: true,
  // CommonJS packages (iconv-lite) call require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

export async function writeThirdParty(metafiles: esbuild.Metafile[]): Promise<void> {
  const out = path.join(root, 'build/licenses/third-party.txt');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, thirdPartyText(metafiles));
}

if (import.meta.main) {
  useBrand(brandId());
  if (process.argv.includes('--watch')) {
    await (await esbuild.context(rendererOptions)).watch();
  } else {
    const ui = await esbuild.build(rendererOptions);
    const main = await esbuild.build({ ...nodeOptions('src/main/main.ts', 'main.js'), write: false, logLevel: 'silent' });
    const worker = await esbuild.build({ ...nodeOptions('src/sim/worker.ts', 'worker.js'), write: false, logLevel: 'silent' });
    await writeThirdParty([ui.metafile!, main.metafile!, worker.metafile!]);
  }
}
