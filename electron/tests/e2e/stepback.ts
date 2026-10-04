/* Step back in the real app, both ISAs: every step undone gives back the
   machine as it was -- the registers on screen and in the engine, the
   data and the stack in memory, the PC row in Text and the status bar --
   after single steps and after a fast run to a breakpoint.  With --shots,
   captures of the toolbar and of the window after a step back.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tests/e2e/stepback.ts [--isa mips|riscv] [--shots <out-dir>]

   For each sample (lab04-ok.s, stores-loop.s): N steps (F10), recording the
   state before each; N steps back (Shift+F10), each compared with its
   record.  Then, stores-loop.s: Reset, steps to the breakpoint recording;
   Reset, Run (F5) to the breakpoint; BACK steps back, compared.

   --shots: stepback-<isa>-<theme>-<lang>-toolbar.png (the toolbar, the
   Step back button's tooltip drawn under it: Electron draws native
   tooltips outside the page, so the capture shows the title as the page
   would) and stepback-<isa>-<theme>-after.png (the window after a step
   back), dark and light, at 1920x1080. */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { launch, openAndAssemble, sample, setLang, settled, statusText, type Running } from './harness.ts';

const args = process.argv.slice(2);
const isaAt = args.indexOf('--isa');
const isa = isaAt >= 0 ? args.splice(isaAt, 2)[1] : 'mips';
if (isa !== 'mips' && isa !== 'riscv') throw new Error(`--isa ${isa}: mips or riscv`);
const shotsAt = args.indexOf('--shots');
const shots = shotsAt >= 0 ? path.resolve(args.splice(shotsAt, 2)[1]) : null;
if (shots) mkdirSync(shots, { recursive: true });

const dir = isa === 'mips' ? 'tests/samples' : 'tests/riscv/samples';
// The breakpoint: stores-loop.s's line after the loop ("lw $a0, sum" / "lw a0, 0(s2)").
const BREAK_LINE = isa === 'mips' ? 31 : 32;
const STEPS = { 'lab04-ok.s': 22, 'stores-loop.s': 60 } as const;
const BACK = 25;

interface State { pc: number; regs: string; panel: string; data: string; stack: string }

// The machine from the engine, and the Registers panel as drawn.
async function state(page: Page): Promise<State> {
  return page.evaluate(async (isa) => {
    const app = (window as unknown as { app: { call(m: string, ...a: unknown[]): Promise<any> } }).app;
    const panel = [...document.querySelectorAll('.regs .rrow[data-reg]')]
      .map((r) => `${(r as HTMLElement).dataset.reg}=${r.querySelector('.hex')?.textContent ?? ''}`).join(' ');
    if (isa === 'mips') {
      const r = await app.call('registers');
      const sp = r.general[29] >>> 0;
      const from = Math.max((sp - 32) & ~3, 0x7fffff00);
      return {
        pc: r.pc >>> 0, regs: JSON.stringify(r), panel,
        data: JSON.stringify(await app.call('readWords', 0x10010000, 32)),
        stack: JSON.stringify(await app.call('readWords', from, (0x80000000 - from) / 4)),
      };
    }
    const r = await app.call('regs', {});
    const sp = r.x[2] >>> 0;
    const from = (sp - 32) & ~3;
    return {
      pc: r.pc >>> 0, regs: JSON.stringify({ pc: r.pc, x: r.x, fbits: r.fbits }), panel,
      data: (await app.call('mem', { addr: 0x10010000, len: 128 })).hex,
      stack: (await app.call('mem', { addr: from, len: 64 })).hex,
    };
  }, isa);
}

const hex = (n: number) => `0x${n.toString(16).padStart(8, '0')}`;
let checks = 0;
function same(a: State, b: State, what: string): void {
  for (const k of ['pc', 'regs', 'panel', 'data', 'stack'] as const) {
    if (a[k] !== b[k]) throw new Error(`${what}: ${k} differs\n  now      ${String(a[k]).slice(0, 400)}\n  expected ${String(b[k]).slice(0, 400)}`);
  }
  checks += 1;
}

// A key, then the window's answer: its status bar changes (each step and
// step back changes PC or the count of steps), then nothing in flight.
async function key(page: Page, k: string): Promise<void> {
  const before = await page.locator('.status').textContent();
  await page.keyboard.press(k);
  await page.waitForFunction((b) => document.querySelector('.status')?.textContent !== b, before, { timeout: 5000 }).catch(() => {});
  await settled(page);
}

// After a step back: the status bar says so, Text marks the row at PC.
async function afterBack(page: Page, want: State, what: string): Promise<void> {
  const now = await state(page);
  same(now, want, what);
  const status = await statusText(page);
  if (!status.includes(`Stepped back · PC ${hex(want.pc)}`)) throw new Error(`${what}: status ${JSON.stringify(status)}`);
  const pcRow = await page.locator('.trow.pc').getAttribute('data-addr');
  if (pcRow !== hex(want.pc)) throw new Error(`${what}: Text's PC row ${pcRow}, PC ${hex(want.pc)}`);
}

async function backEnabled(page: Page): Promise<boolean> {
  return page.locator('.toolbar button', { hasText: 'Step back' }).isEnabled();
}

async function stepsThenBack(r: Running, name: keyof typeof STEPS): Promise<void> {
  const { page } = r;
  await openAndAssemble(r, sample(r.dir, `${dir}/${name}`));
  if (await backEnabled(page)) throw new Error(`${name}: Step back enabled before any step`);
  const states: State[] = [];
  for (let i = 0; i < STEPS[name]; i += 1) {
    states.push(await state(page));
    await key(page, 'F10');
    if ((await statusText(page)).includes('Exited')) break; // the end: Step back from there too
  }
  for (let i = states.length - 1; i >= 0; i -= 1) {
    if (!(await backEnabled(page))) throw new Error(`${name}: Step back disabled with ${i + 1} to go`);
    await key(page, 'Shift+F10');
    // MIPS: the first step also starts the program (PC from 0 to its start,
    // the stack built): back before it is the program started, PC on its
    // first instruction.
    if (isa === 'mips' && i === 0) {
      const now = await state(page);
      if (now.pc !== 0x00400000) throw new Error(`${name}: back to the start: PC ${hex(now.pc)}`);
      same({ ...now, pc: 0, regs: '', panel: '' }, { ...states[0], regs: '', panel: '' }, `${name}: back to the start`);
      continue;
    }
    await afterBack(page, states[i], `${name}: back to before step ${i + 1}`);
  }
  if (await backEnabled(page)) throw new Error(`${name}: Step back still enabled at the start`);
  console.log(`${isa} ${name}: ${states.length} steps, ${states.length} steps back, each the same`);
}

async function setBreakpointLine(page: Page, line: number): Promise<void> {
  const num = page.locator('.cm-lineNumbers .cm-gutterElement', { hasText: new RegExp(`^${line}$`) });
  const at = (await num.boundingBox())!;
  const gutter = (await page.locator('.cm-bp-gutter').boundingBox())!;
  await page.mouse.click(gutter.x + gutter.width / 2, at.y + at.height / 2);
  await page.waitForSelector('.cm-bp-dot');
}

async function reset(page: Page): Promise<void> {
  await page.locator('.toolbar button', { hasText: 'Reset' }).click();
  await page.waitForFunction(() => /Ready/.test(document.querySelector('.status')?.textContent ?? ''));
}

async function runToBreakpoint(r: Running): Promise<void> {
  const { page } = r;
  await setBreakpointLine(page, BREAK_LINE);
  await key(page, 'Control+s'); // the breakpoint on the machine
  // The reference: stepped to the breakpoint.
  await reset(page);
  const states: State[] = [];
  for (let i = 0; i < 2000; i += 1) {
    states.push(await state(page));
    await key(page, 'F10');
    if ((await statusText(page)).includes('Breakpoint')) break;
    if (i === 1999) throw new Error('the breakpoint was never reached');
  }
  const end = await state(page);
  // MIPS's Step stops on the breakpoint without running it (one more F10
  // than instructions): that last state is the end's.
  while (states.length && states[states.length - 1].pc === end.pc) states.pop();
  // The run.
  await reset(page);
  await key(page, 'F5');
  await page.waitForFunction(() => /Breakpoint at/.test(document.querySelector('.status')?.textContent ?? ''));
  same(await state(page), end, 'the run stops where the steps did');
  for (let i = 0; i < BACK; i += 1) {
    await key(page, 'Shift+F10');
    await afterBack(page, states[states.length - 1 - i], `after the run: back ${i + 1}`);
  }
  console.log(`${isa} stores-loop.s: run to the breakpoint (${states.length} instructions), ${BACK} steps back, each the same as stepping`);
  // On again: to the same breakpoint.
  await key(page, 'F5');
  await page.waitForFunction(() => /Breakpoint at/.test(document.querySelector('.status')?.textContent ?? ''));
  same(await state(page), end, 'run again after stepping back');
  // And to the end, then back from the end.
  await key(page, 'F5');
  await page.waitForFunction(() => /Exited/.test(document.querySelector('.status')?.textContent ?? ''));
  if (!(await backEnabled(page))) throw new Error('Step back disabled at the end of the program');
  const exited = await state(page);
  await key(page, 'Shift+F10');
  if ((await state(page)).pc !== exited.pc - 4 && isa === 'riscv') throw new Error('back from the end: PC not on the exit ecall');
  console.log(`${isa}: Step back from the end works (PC ${hex((await state(page)).pc)})`);
}

// ---- captures ----------------------------------------------------------------------------

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  }, theme);
  await page.waitForTimeout(700);
}

// The tooltip as the page's own box under the button (native tooltips are
// drawn by the system, outside the page's pixels).
async function showTooltip(page: Page, on: boolean): Promise<void> {
  await page.evaluate((on) => {
    document.querySelector('#tip-shot')?.remove();
    if (!on) return;
    const b = [...document.querySelectorAll('.toolbar button')].find((x) => x.textContent?.includes('Step back')) as HTMLElement;
    const r = b.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.id = 'tip-shot';
    tip.textContent = b.title;
    Object.assign(tip.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.bottom + 6}px`, maxWidth: '420px', padding: '6px 8px',
      font: '12px var(--ui)', lineHeight: '1.45', background: 'var(--surface)', color: 'var(--text)',
      border: '1px solid var(--border)', borderRadius: '4px', boxShadow: '0 2px 8px rgba(var(--shadow-rgb), .35)', zIndex: '9999',
    });
    document.body.append(tip);
  }, on);
}

async function captures(r: Running): Promise<void> {
  const { page } = r;
  await openAndAssemble(r, sample(r.dir, `${dir}/stores-loop.s`));
  // To the loop's third pass, just after its multiply ($t2 = 2*2): a step
  // back then shows $t2 changed back, and Data the array so far.
  const after = await page.evaluate(() => (([...document.querySelectorAll('.trow')] as HTMLElement[])
    .find((row) => /^slli?\s+\$?t3\b/.test(row.querySelector('.src')?.textContent ?? ''))?.dataset.addr) ?? '');
  if (!after) throw new Error('no sll row in Text');
  for (let seen = 0, i = 0; seen < 3 && i < 200; i += 1) {
    await key(page, 'F10');
    if ((await statusText(page)).includes(`PC ${after}`)) seen += 1;
  }
  await page.locator('.ptab', { hasText: 'Data' }).click();
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    for (const lang of ['ko', 'en'] as const) {
      await setLang(page, lang);
      await showTooltip(page, true);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      const bar = (await page.locator('.toolbar').boundingBox())!;
      await page.screenshot({ path: path.join(shots!, `stepback-${isa}-${theme}-${lang}-toolbar.png`),
        clip: { x: 0, y: 0, width: 1920, height: bar.y + bar.height + 110 } });
      await showTooltip(page, false);
    }
    await key(page, 'Shift+F10');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots!, `stepback-${isa}-${theme}-after.png`) });
    await key(page, 'F10');
  }
}

const r = await launch({ width: 1920, height: 1080 }, { isa });
try {
  if (shots) await captures(r);
  else {
    for (const name of Object.keys(STEPS) as (keyof typeof STEPS)[]) await stepsThenBack(r, name);
    await runToBreakpoint(r);
    console.log(`${isa}: ${checks} states checked`);
  }
} finally {
  await r.close();
}
