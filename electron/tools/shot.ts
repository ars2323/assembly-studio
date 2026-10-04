/* A few screenshots of the running app, for looking at a change by eye.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/shot.ts <out-dir> [width]

   start.png   the first screen (the board settled)
   work.png    tests/samples/lab04-ok.s assembled, 16 steps, the Inspector on sra $s1
   data.png    the same, the Data tab

   Width 1280 by default; the window is width x 800.
   --css <file>: a stylesheet laid over the page first (trying out colours). */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, sample, settled, textRow } from '../tests/e2e/harness.ts';

const args = process.argv.slice(2);
const cssAt = args.indexOf('--css');
const css = cssAt >= 0 ? path.resolve(args.splice(cssAt, 2)[1]) : null;
const out = path.resolve(args[0] ?? 'build/shots');
const width = Number(args[1] ?? 1280);
mkdirSync(out, { recursive: true });

const r = await launch({ width, height: 800 });
try {
  await r.page.clock.setFixedTime(new Date('2026-10-04T10:00:00+09:00'));
  if (css) await r.page.addStyleTag({ path: css });
  await r.page.waitForTimeout(12_000); // the board grows for about 8.5 s
  await r.page.screenshot({ path: path.join(out, `start-${width}.png`) });

  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
  for (let i = 0; i < 16; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
  await (await textRow(r.page, '0x00400054')).locator('.dis').click();
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
