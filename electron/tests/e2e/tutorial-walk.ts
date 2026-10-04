/* A walk through the whole tutorial, the way a student goes (the keys,
   the clicks), capturing every card, for looking at by eye; it also checks
   each card: something is pointed at, a click reaches every target, the
   card covers none of them.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tests/e2e/tutorial-walk.ts <out-dir> [--isa mips|riscv] [--width 1280] [--theme dark|light]

   (node tools/build-ui.ts first.)  Writes <isa>-<theme>-<width>-<nn>-<id>[-done|-phase2|...].png
   and prints one line per card; the problems last (exit 1 if any). */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { launch, setSpeed } from './harness.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : def; };
const isa = opt('isa', 'mips') as 'mips' | 'riscv';
const width = Number(opt('width', '1280'));
const theme = opt('theme', 'dark');
const out = path.resolve(args[0] ?? 'build/tutorial');
mkdirSync(out, { recursive: true });

interface Rect { left: number; top: number; right: number; bottom: number }
interface State { index: number; total: number; id: string; kind: string; phase: number; result: boolean; active: boolean;
  shown: { targets: Rect[]; hits: boolean[]; card: Rect | null; did: string[] }; title: string }

const T3 = isa === 'mips' ? '$t3' : 'x28';
const r = await launch({ width, height: 800 }, { isa });
const page = r.page;
const problems: string[] = [];

const state = (): Promise<State> => page.evaluate(() => {
  const t = (window as unknown as { __tutorial: { index: number; steps: { id: string; kind: string }[]; phase: number; result: boolean; active: boolean;
    shown: State['shown'] } }).__tutorial;
  return { index: t.index, total: t.steps.length, id: t.steps[t.index].id, kind: t.steps[t.index].kind, phase: t.phase, result: t.result,
    active: t.active, shown: t.shown, title: document.querySelector('.tut-card h3')?.textContent ?? '' };
});
const settle = (ms = 450) => page.waitForTimeout(ms);
// Until the tutorial has moved on from `s` (another step, its result, its next phase).
async function moved(s: State, timeout = 10_000): Promise<State> {
  const end = Date.now() + timeout;
  for (;;) {
    const n = await state();
    if (n.index !== s.index || n.result !== s.result || n.phase !== s.phase || !n.active) return n;
    if (Date.now() > end) throw new Error(`step ${s.index + 1} (${s.id}) did not go on`);
    await page.waitForTimeout(100);
  }
}

const intersects = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
async function capture(suffix = ''): Promise<State> {
  await settle();
  const s = await state();
  const name = `${isa}-${theme}-${width}-${String(s.index + 1).padStart(2, '0')}-${s.id}${suffix}`;
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const where = `${name}`;
  if (s.kind !== 'end' && s.shown.targets.length === 0) problems.push(`${where}: nothing pointed at`);
  s.shown.hits.forEach((hit, i) => { if (!hit) problems.push(`${where}: target ${i + 1} not reachable by a click`); });
  const card = s.shown.card;
  if (card) {
    s.shown.targets.forEach((t, i) => {
      if (intersects(card, { left: t.left - 3, top: t.top - 3, right: t.right + 3, bottom: t.bottom + 3 })) problems.push(`${where}: the card covers target ${i + 1}`);
    });
    if (card.left < 0 || card.top < 0 || card.right > width || card.bottom > 800) problems.push(`${where}: the card is off the window`);
  }
  console.log(`${where}  [${s.shown.targets.length} targets${s.shown.did.length ? `; ${s.shown.did.join(', ')}` : ''}]  ${s.title}`);
  return s;
}

const key = (k: string) => page.keyboard.press(k);

try {
  if (theme === 'light') {
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.dispatchEvent(new CustomEvent('themechange', { detail: 'light' })); });
  }
  // The first screen: the card, the ISA, the tutorial.
  await page.locator('.wcard').click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: isa === 'mips' ? 'MIPS' : 'RISC-V', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '튜토리얼 보기' }).click();
  await page.waitForSelector('.tut-card');
  await page.mouse.move(2, 790);

  for (let guard = 0; guard < 60; guard += 1) {
    let s = await capture();
    if (s.kind === 'end') {
      await page.locator('.tut-finish').click();
      await page.waitForFunction(() => !(window as unknown as { __tutorial: { active: boolean } }).__tutorial.active);
      break;
    }
    if (s.kind === 'explain') {
      if (s.id === 'theme') {
        // The switch works under the tutorial: the other theme, captured, and back.
        await page.locator('.status .theme-switch').click();
        await settle(700);
        await capture('-switched');
        await page.locator('.status .theme-switch').click();
        await settle(700);
      }
      await key('ArrowRight');
      await moved(s);
      continue;
    }
    // Practice: do what the card asks.
    switch (s.id) {
      case 'assemble': await key('Control+s'); break;
      case 'step': await key('F10'); break;
      case 'pin':
        await page.locator(`.rrow[data-reg="${T3}"]`).hover();
        await page.locator(`.rrow[data-reg="${T3}"] .star`).click();
        break;
      case 'alias':
        await page.locator(`.pinblock .rrow[data-pin="${T3}"] .rname`).dblclick();
        await settle(250);
        await capture('-typing');
        await page.keyboard.type('sum');
        await key('Enter');
        break;
      case 'data': await page.locator('.textpanel .ptab', { hasText: 'Data' }).click(); break;
      case 'store':
        for (let i = 0; i < 3 && !(await state()).result; i += 1) { await key('F10'); await settle(300); }
        break;
      case 'breakpoint': {
        const t = s.shown.targets[0];
        await page.mouse.click(t.left + 9, (t.top + t.bottom) / 2);
        break;
      }
      case 'run': await key('F5'); break;
      case 'slow':
        await setSpeed(page, '1 line/s');
        await key('F5');
        await settle(2600);
        await capture('-running');
        await key('Escape');
        break;
      case 'reset': await page.locator('[data-tut="reset"]').click(); break;
      case 'console':
        await key('F5');
        await settle(600);
        if (!(await state()).result) await key('F5');
        break;
      case 'error':
        await key('Control+s');
        s = await moved(s);
        await capture('-phase2');
        await page.locator('.asm .row .btn').click();
        break;
      default: throw new Error(`no action for ${s.id}`);
    }
    const n = await moved(s);
    if (n.result) {
      await capture('-done');
      await key('ArrowRight');
      await moved(n);
    }
  }
  const after = await state();
  if (after.active) problems.push('the tutorial is still on after 끝내기');
} finally {
  await r.close().catch((e: Error) => problems.push(e.message));
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exitCode = 1;
} else console.log('\nno problems');
