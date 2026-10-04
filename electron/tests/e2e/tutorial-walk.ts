/* A walk through the whole tutorial, the way a student goes (the keys,
   the clicks), capturing every card, for looking at by eye; it also checks
   each card: something is pointed at, a click reaches every target, the
   card covers none of them, nothing Korean on screen in English mode.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tests/e2e/tutorial-walk.ts <out-dir> [--isa mips|riscv] [--width 1920] [--height 1080] [--theme dark|light] [--lang ko|en]

   (node tools/build-ui.ts first.)  --lang: chosen with the first screen's KO/EN
   switch (Korean by default).  Writes <isa>-<theme>-<width>-<lang>-<nn>-<id>[-done|-phase2|...].png
   and prints one line per card; the problems last (exit 1 if any). */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { launch, setLang, setSpeed } from './harness.ts';
import { WELCOME } from '../../src/renderer/app/messages/welcome.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : def; };
const isa = opt('isa', 'mips') as 'mips' | 'riscv';
const width = Number(opt('width', '1920'));
const height = Number(opt('height', '1080'));
const theme = opt('theme', 'dark');
const lang = opt('lang', 'ko') as 'ko' | 'en';
const out = path.resolve(args[0] ?? 'build/tutorial');
mkdirSync(out, { recursive: true });

interface Rect { left: number; top: number; right: number; bottom: number }
interface State { index: number; total: number; id: string; kind: string; phase: number; result: boolean; active: boolean;
  shown: { targets: Rect[]; hits: boolean[]; card: Rect | null; did: string[] }; title: string }

const T3 = isa === 'mips' ? '$t3' : 'x28';
const r = await launch({ width, height }, { isa });
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
  let s = await state();
  // A target not reachable yet may only be settling (the engine tests it again after 600 ms).
  if (s.shown.hits.some((hit) => !hit)) { await page.waitForTimeout(900); s = await state(); }
  const name = `${isa}-${theme}-${width}-${lang}-${String(s.index + 1).padStart(2, '0')}-${s.id}${suffix}`;
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const where = `${name}`;
  if (s.kind !== 'end' && s.shown.targets.length === 0) problems.push(`${where}: nothing pointed at`);
  s.shown.hits.forEach((hit, i) => { if (!hit) problems.push(`${where}: target ${i + 1} not reachable by a click`); });
  const card = s.shown.card;
  if (card) {
    s.shown.targets.forEach((t, i) => {
      if (intersects(card, { left: t.left - 3, top: t.top - 3, right: t.right + 3, bottom: t.bottom + 3 })) problems.push(`${where}: the card covers target ${i + 1}`);
    });
    if (card.left < 0 || card.top < 0 || card.right > width || card.bottom > height) problems.push(`${where}: the card is off the window`);
  }
  // In English, nothing on the screen in Korean (the card, the Inspector, the example's comments...).
  if (lang === 'en') {
    const hangul = await page.evaluate(() => (document.body.innerText.match(/[^\n]*[가-힣][^\n]*/g) ?? []).slice(0, 3));
    if (hangul.length) problems.push(`${where}: Korean on the screen: ${hangul.join(' | ')}`);
  }
  console.log(`${where}  [${s.shown.targets.length} targets${s.shown.did.length ? `; ${s.shown.did.join(', ')}` : ''}]  ${s.title}`);
  return s;
}

const key = (k: string) => page.keyboard.press(k);
// The screen as it is, in the other language (not checked: a look only).
async function captureOther(): Promise<void> {
  await settle();
  const s = await state();
  await page.screenshot({ path: path.join(out, `${isa}-${theme}-${width}-${lang}-${String(s.index + 1).padStart(2, '0')}-${s.id}-other-language.png`) });
}

try {
  if (theme === 'light') {
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.dispatchEvent(new CustomEvent('themechange', { detail: 'light' })); });
  }
  // The first screen: the card, the ISA, the tutorial.
  await page.locator('.wcard').click();
  await page.waitForTimeout(900);
  // The language, by the switch in the card's bottom-left corner.
  const langNow = () => page.evaluate(() => document.documentElement.lang);
  if (await langNow() !== lang) await page.locator('.wlang .lang-switch').click();
  if (await langNow() !== lang) throw new Error(`the KO/EN switch did not set ${lang}`);
  await page.getByRole('button', { name: isa === 'mips' ? 'MIPS' : 'RISC-V', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: WELCOME.tutorial[lang] }).click();
  await page.waitForSelector('.tut-card');
  await page.mouse.move(2, height - 10);

  for (let guard = 0; guard < 60; guard += 1) {
    let s = await capture();
    if (s.kind === 'end') {
      await page.locator('.tut-finish').click();
      await page.waitForFunction(() => !(window as unknown as { __tutorial: { active: boolean } }).__tutorial.active);
      break;
    }
    if (s.kind === 'explain') {
      if (s.id === 'bits') {
        // The other language, live: the card and the Inspector's explanation say it again in it, and back.
        await setLang(page, lang === 'en' ? 'ko' : 'en');
        await captureOther();
        await setLang(page, lang);
      }
      if (s.id === 'switches') {
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
      case 'stepback': await key('Shift+F10'); break;
      case 'inspect': {
        const t = s.shown.targets[0];
        await page.mouse.click((t.left + t.right) / 2, (t.top + t.bottom) / 2);
        break;
      }
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
        if ((await state()).phase === 0) await key('F5'); // stopped at the red dot: on again
        s = await moved(s);
        await capture('-phase2');
        await page.locator('.console .cinput').fill('30');
        await key('Enter');
        break;
      case 'undo':
        for (let i = 0; i < 4 && !(await state()).result; i += 1) { await key('Shift+F10'); await settle(300); }
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
  if (after.active) problems.push('the tutorial is still on after Finish');
} finally {
  await r.close().catch((e: Error) => problems.push(e.message));
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exitCode = 1;
} else console.log('\nno problems');
