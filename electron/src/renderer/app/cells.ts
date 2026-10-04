/* The cells the status bar and the Assemble panel are made of: one fact a
   cell, side by side with a thin line between them, the first one (the
   state) in its colour with a mark before it.  Both windows (MIPS and
   RISC-V) build their status bar and Assemble panel from these; app.css
   ("cells") draws them.

     cell(tone, ...)     one fact: "14 instructions", "PC 0x00400024"
     lead(tone, ...)     the state, first: "Assembled", "Running…", "2 errors"
     keys([key, what])   key hints, at the far end of the status bar

   The words are English; sentences about an instruction (the Inspector,
   the tutorial) are not made here. */

import { code, h } from './dom.ts';
import { agoText } from './logic/ago.ts';

type Child = Node | string | null | undefined | false;

// ok: done, fine; err: an error; warn: not what was asked (not saved, the
// code changed since); run: going on, or stopped where it can go on;
// changed: the registers a step changed (the yellow rows' colours); idle:
// nothing yet; time: a clock time (the code font, quiet).
export type Tone = '' | 'ok' | 'err' | 'warn' | 'run' | 'changed' | 'idle' | 'time';

export const cell = (tone: Tone, ...children: Child[]): HTMLElement =>
  h('span', { class: `cell${tone ? ` ${tone}` : ''}` }, ...children);

export const lead = (tone: Tone, ...children: Child[]): HTMLElement =>
  h('span', { class: `cell lead${tone ? ` ${tone}` : ''}` }, h('span', { class: 'cmark', 'aria-hidden': 'true' }), ...children);

// A number set in the code font, then its noun: "14 instructions", "1 step".
export function count(n: number, one: string, many = `${one}s`): DocumentFragment {
  const f = document.createDocumentFragment();
  f.append(code(n.toLocaleString('en-US'), 'num'), ` ${n === 1 ? one : many}`);
  return f;
}
export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

// "F10 Step  F5 Run": the keys that do something now, at the far end of the
// status bar.  A key of '' is a hint without one ("Reset to run again").
export function keys(...pairs: [string, string][]): HTMLElement {
  return h('span', { class: 'cell keys' },
    ...pairs.map(([key, what]) => h('span', { class: 'key' }, key ? h('kbd', {}, key) : null, key ? ` ${what}` : what)));
}

// "Line 3", "Lines 3, 7": the Editor's lines a word is about.
export const lines = (ns: number[]): string => `${ns.length === 1 ? 'Line' : 'Lines'} ${ns.join(', ')}`;

// The time of an assemble, 24 hours with seconds: the tooltip of ago().
export const clock = (d: Date): string =>
  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/* An element saying how long ago `at` was, kept current: one timer for the
   page refreshes every such element still on it (data-ago), once a second.
   The exact time is its tooltip. */
export function ago(at: Date): HTMLElement {
  const el = h('span', { class: 'ago', 'data-ago': String(at.getTime()), title: clock(at) }, agoText(at));
  if (!agoTimer) agoTimer = window.setInterval(tickAgo, 1000);
  return el;
}
let agoTimer = 0;
function tickAgo(): void {
  const els = document.querySelectorAll<HTMLElement>('[data-ago]');
  for (const el of els) {
    const text = agoText(new Date(Number(el.dataset.ago)));
    if (el.textContent !== text) el.textContent = text;
  }
}
