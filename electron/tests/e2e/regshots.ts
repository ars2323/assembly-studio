/* Screen captures of the Registers panel's boxes, stars and aliases, for
   looking at them by eye (panels/regtable.ts).

     xvfb-run -a -s '-screen 0 2400x1400x24' node tests/e2e/regshots.ts <out-dir> [width] [--isa mips|riscv]

   regs-<isa>-<w>-<n>-<what>.png, the window and the panel alone (-panel):
     1 default     a sample assembled, a few steps
     2 nobin       Bin unticked
     3 hexonly     Dec unticked too: Hex alone
     4 pinned      all three again; two registers starred, one with the alias
                   "a", the list scrolled down under them
     5 editing     an alias being typed
     6 many        eight more starred: the pinned block scrolls by itself
     7 noroom      the panel made narrow: the width takes Dec and Bin away,
                   their boxes dashed
     8 forced      Bin ticked anyway: the list scrolls sideways
     9 folded      the panel's width again, the folded rows (CP0, the f
                   registers) shown and one of them pinned, Dec unticked */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, sample, settled, side } from './harness.ts';

const args = process.argv.slice(2);
const isaAt = args.indexOf('--isa');
const isa = isaAt >= 0 ? args.splice(isaAt, 2)[1] : 'mips';
if (isa !== 'mips' && isa !== 'riscv') throw new Error(`--isa ${isa}: mips or riscv`);
const out = path.resolve(args[0] ?? 'build/shots');
const width = Number(args[1] ?? 1280);
mkdirSync(out, { recursive: true });

const program = isa === 'mips'
  ? { file: 'tests/samples/lab04-ok.s', steps: 16, a: '$t0', b: '$s1' }
  : { file: 'tests/riscv/samples/lab04-ok.s', steps: 10, a: 'x5', b: 'x9' };

const r = await launch({ width, height: 800 }, { isa });
const page = r.page;
let n = 0;
async function shot(what: string): Promise<void> {
  n += 1;
  await page.waitForTimeout(250);
  const name = `regs-${isa}-${width}-${n}-${what}`;
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.locator('.regs').screenshot({ path: path.join(out, `${name}-panel.png`) });
}
const box = (label: string) => page.locator(`.regs .colbox[data-col=${label}] input`);
try {
  await openAndAssemble(r, sample(r.dir, program.file, 'lab04.s'));
  await side(page, 'Run');
  for (let i = 0; i < program.steps; i += 1) { await page.keyboard.press('F10'); await settled(page); }
  await page.mouse.move(0, 0);
  await shot('default');

  await box('bin').click();
  await page.mouse.move(0, 0);
  await shot('nobin');

  await box('dec').click();
  await page.mouse.move(0, 0);
  await shot('hexonly');

  await box('dec').click();
  await box('bin').click();
  await page.locator(`.rrow[data-reg="${program.a}"] .star`).click();
  await page.locator(`.rrow[data-reg="${program.b}"] .star`).click();
  await page.locator(`.rrow[data-pin="${program.a}"] .alias`).click();
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.locator('.regs-list').evaluate((el) => { el.scrollTop = 260; });
  await page.locator(`.rrow[data-reg="${program.b}"]`).hover();
  await shot('pinned');

  await page.locator(`.rrow[data-pin="${program.b}"] .alias`).click();
  await page.keyboard.type('sum');
  await shot('editing');
  await page.keyboard.press('Escape');

  const more = isa === 'mips' ? ['$t1', '$t2', '$t3', '$t4', '$t5', '$t6', '$a0', '$v0'] : ['x6', 'x7', 'x28', 'x29', 'x30', 'x31', 'x10', 'x11'];
  for (const key of more) await page.locator(`.rrow[data-reg="${key}"] .star`).click();
  await page.locator('.regs-list').evaluate((el) => { el.scrollTop = 400; });
  await page.mouse.move(0, 0);
  await shot('many');

  // The panel narrower than its least, as dragging the splitter can make it.
  const narrow = (px: number | null) => page.evaluate((w) => {
    const grid = document.querySelector('.run-grid') as HTMLElement;
    for (const v of ['--regs-least', '--regs-most']) if (w === null) grid.style.removeProperty(v); else grid.style.setProperty(v, `${w}px`);
    window.dispatchEvent(new Event('resize'));
  }, px);
  for (const key of more) await page.locator(`.rrow[data-pin="${key}"] .star`).click();
  await narrow(300);
  await page.waitForTimeout(200);
  await page.mouse.move(0, 0);
  await shot('noroom');
  await box('bin').click();
  await page.mouse.move(0, 0);
  await shot('forced');
  await box('bin').click();
  await box('bin').click(); // off, then on: room again once the panel is wide
  await narrow(null);
  await page.locator('.regs .fold .linkbtn').click();
  const folded = isa === 'mips' ? 'Status' : 'f1';
  await page.locator(`.rrow[data-reg="${folded}"] .star`).click();
  await box('dec').click();
  await page.locator(`.rrow[data-reg="${folded}"]`).scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await shot('folded');
} finally {
  await r.close();
}
console.log(`screenshots in ${out}`);
