/* The installed program on Windows, looked at as a user sees it: the whole
   desktop captured (the window's own caption buttons and the taskbar icon
   are drawn by Windows, so a page screenshot cannot show them).

     STUDIO_E2E_EXE=<installed AssemblyStudio.exe> node tests/e2e/windows-check.ts <out-dir>

   Run by .github/workflows/windows-check.yml after a silent install of a
   release's installer.  Each step prints what it checked; the captures are
   for a person to look at:

     01-start          the first screen (maximised, as it opens)
     02-mips           MIPS: a sample assembled and stepped
     03-mips-light     the same in the light theme
     04-dialog         a question dialog over it (the caption patch under the backdrop)
     05-riscv          RISC-V: a sample assembled and stepped (the bundled Java runtime)
     06-riscv-dark     the same back in the dark theme */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, sample, settled } from './harness.ts';

const out = path.resolve(process.argv[2] ?? 'build/windows-check');
mkdirSync(out, { recursive: true });
if (!process.env.STUDIO_E2E_EXE) throw new Error('STUDIO_E2E_EXE: the installed AssemblyStudio.exe');

// The whole primary screen, as Windows draws it.
function desktop(name: string): void {
  const file = path.join(out, `${name}.png`).replaceAll("'", "''");
  execFileSync('powershell', ['-NoProfile', '-Command', [
    'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
    `$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`,
  ].join('; ')]);
  console.log(`captured ${name}.png`);
}
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function theme(r: Awaited<ReturnType<typeof launch>>, t: 'light' | 'dark'): Promise<void> {
  const now = await r.page.evaluate(() => document.documentElement.dataset.theme ?? 'dark');
  if (now !== t) await r.page.locator('.status .theme-switch').click();
  await wait(900);
}

for (const isa of ['mips', 'riscv'] as const) {
  // keepSize: the window as the program opens it (maximised on a small screen).
  const r = await launch(undefined, { isa, keepSize: true });
  try {
    await r.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); w.moveTop(); });
    if (isa === 'mips') {
      await wait(10_000); // the board grows
      desktop('01-start');
    }
    const file = isa === 'mips' ? 'tests/samples/lab04-ok.s' : 'tests/riscv/samples/lab04-ok.s';
    await openAndAssemble(r, sample(r.dir, file, 'lab04.s'));
    for (let i = 0; i < 12; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
    const status = await r.page.locator('.status').innerText();
    console.log(`${isa}: status "${status.replace(/\s+/g, ' ').trim()}"`);
    if (!/Stepped/.test(status)) throw new Error(`${isa}: not stepped`);
    await r.page.mouse.move(5, 300);
    await wait(500);
    if (isa === 'mips') {
      desktop('02-mips');
      // The work screen's theme switch: the frames in the 0.7 s after the click (60 Hz: about 42).
      for (let k = 0; k < 2; k += 1) {
        const f = await r.page.evaluate(async () => {
          const gaps: number[] = []; let last = performance.now(); let on = true;
          const tick = (t: number) => { gaps.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          const t0 = performance.now();
          (document.querySelector('.status .theme-switch') as HTMLElement).click();
          const click = performance.now() - t0;
          await new Promise((done) => setTimeout(done, 700)); on = false; gaps.shift();
          return { clickMs: Math.round(click), frames: gaps.length, longestFrameMs: Math.round(Math.max(...gaps)) };
        });
        console.log(`theme switch ${k + 1}: ${JSON.stringify(f)}`);
        await wait(600);
      }
      await theme(r, 'light');
      desktop('03-mips-light');
      // A question over the window: the tutorial's "quit?" (Esc asks).
      await r.page.locator('.toolbar .tools button').first().click();
      await wait(2500);
      await r.page.keyboard.press('Escape');
      await r.page.locator('dialog.ask').waitFor();
      await wait(500);
      desktop('04-dialog');
      await r.page.locator('dialog.ask .row .btn').last().click();
      await wait(800);
      await theme(r, 'dark');
    } else {
      await theme(r, 'light');
      desktop('05-riscv');
      await theme(r, 'dark');
      desktop('06-riscv-dark');
    }
  } finally {
    await r.close();
  }
}
console.log(`ok: ${out}`);
