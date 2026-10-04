/* The README's screenshots (docs/images/), at 1440x900:

     xvfb-run -a -s '-screen 0 2400x1400x24' node tests/e2e/doc-shots.ts ../docs/images start|mips|riscv|tutorial

   start: start.png; mips: work-mips.png and errors.png; riscv:
   work-riscv-light.png; tutorial: tutorial.png (after node tools/build-ui.ts). */

import { launch, openAndAssemble, sample, settled, textRow } from './harness.ts';
const out = process.argv[2]; const which = process.argv[3];
const size = { width: 1440, height: 900 };
const setTheme = async (p: any, t: string) => { await p.evaluate((t: string) => { document.documentElement.dataset.theme = t; window.dispatchEvent(new CustomEvent('themechange', { detail: t })); }, t); await p.waitForTimeout(700); };
if (which === 'start') {
  const r = await launch(size, { isa: 'mips' });
  try { await r.page.waitForTimeout(12_000); await r.page.screenshot({ path: `${out}/start.png` }); } finally { await r.close(); }
} else if (which === 'mips') {
  const r = await launch(size, { isa: 'mips' });
  try {
    const p = r.page;
    await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
    for (let i = 0; i < 16; i += 1) { await p.keyboard.press('F10'); await settled(p); }
    await (await textRow(p, '0x00400054')).locator('.dis').click();
    await p.mouse.move(0, 0); await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/work-mips.png` });
    await openAndAssemble(r, sample(r.dir, 'tests/samples/syntax-error-midfile.s', 'errors.s'));
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/errors.png` });
  } finally { await r.close(); }
} else if (which === 'riscv') {
  const r = await launch(size, { isa: 'riscv' });
  try {
    const p = r.page;
    await setTheme(p, 'light');
    await openAndAssemble(r, sample(r.dir, 'tests/riscv/samples/lab04-ok.s', 'lab04.s'));
    for (let i = 0; i < 10; i += 1) { await p.keyboard.press('F10'); await settled(p); }
    await (await textRow(p, '0x0040003c')).locator('.dis').click();
    await p.mouse.move(0, 0); await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/work-riscv-light.png` });
  } finally { await r.close(); }
} else if (which === 'tutorial') {
  const r = await launch(size, { isa: 'mips' });
  try {
    const p = r.page;
    await p.locator('.wcard').click(); await p.waitForTimeout(800);
    await p.locator('.action').first().click(); await p.waitForTimeout(500);
    await p.getByRole('button', { name: /튜토리얼/ }).click(); await p.waitForTimeout(3000);
    for (let i = 0; i < 2; i += 1) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1500); }
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/tutorial.png` });
  } finally { await r.close(); }
}
