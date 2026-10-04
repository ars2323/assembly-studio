/* A few screenshots of the running app, for looking at a change by eye.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/shot.ts <out-dir> [width] [--isa mips|riscv]

   start-<w>.png   the first screen (the board settled)
   work-<w>.png    a sample assembled, a few steps, the Inspector on one instruction:
                     mips   tests/samples/lab04-ok.s, 16 steps, sra $s1
                     riscv  tests/riscv/samples/lab04-ok.s (RARS engine), 10 steps, sw (S format)
   data-<w>.png    the same, the Data tab

   Width 1280 by default; the window is width x 800.  --isa riscv starts the
   app with --isa=riscv (the engine: probe/setup.sh and probe/run.sh build,
   or electron/engine/). */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, sample, settled, textRow } from '../tests/e2e/harness.ts';

const args = process.argv.slice(2);
const isaAt = args.indexOf('--isa');
const isa = isaAt >= 0 ? args.splice(isaAt, 2)[1] : 'mips';
if (isa !== 'mips' && isa !== 'riscv') throw new Error(`--isa ${isa}: mips or riscv`);
const out = path.resolve(args[0] ?? 'build/shots');
const width = Number(args[1] ?? 1280);
mkdirSync(out, { recursive: true });

const program = isa === 'mips'
  ? { file: 'tests/samples/lab04-ok.s', steps: 16, inspect: '0x00400054' }
  : { file: 'tests/riscv/samples/lab04-ok.s', steps: 10, inspect: '0x0040003c' };

const r = await launch({ width, height: 800 }, { isa });
try {
  await r.page.clock.setFixedTime(new Date('2026-10-04T10:00:00+09:00'));
  await r.page.waitForTimeout(12_000); // the board grows for about 8.5 s
  await r.page.screenshot({ path: path.join(out, `start-${width}.png`) });

  await openAndAssemble(r, sample(r.dir, program.file, 'lab04.s'));
  for (let i = 0; i < program.steps; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
  await (await textRow(r.page, program.inspect)).locator('.dis').click();
  await r.page.mouse.move(0, 0);
  await r.page.waitForTimeout(300);
  await r.page.screenshot({ path: path.join(out, `work-${width}.png`) });

  const data = r.page.getByRole('tab', { name: 'Data', exact: true });
  if (await data.isVisible()) {
    await data.click();
    await r.page.waitForTimeout(300);
    await r.page.screenshot({ path: path.join(out, `data-${width}.png`) });
  }
} finally {
  await r.close();
}
console.log(`screenshots in ${out}`);
