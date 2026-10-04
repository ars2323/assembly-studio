/* What the tutorial's steps point at, found on the page (both ISAs): the
   window's classes, the Editor's lines through the host. */

import type { Target, Tutorial } from './engine.ts';

export const $ = (sel: string): Element | null => document.querySelector(sel);
export const $$ = (sel: string): Element[] => [...document.querySelectorAll(sel)];

// A toolbar button by its data-tut (app.ts): assemble, run, step, reset.
export const button = (name: string) => $(`[data-tut="${name}"]`);
export const scrollIn = (el: Element | null | undefined) => el?.scrollIntoView({ block: 'center', inline: 'nearest' });

// Text's row of an address; a register's row in its group and its pinned copy.
export const hex8 = (addr: number) => `0x${(addr >>> 0).toString(16).padStart(8, '0')}`;
export const trow = (addr: number) => $(`.trow[data-addr="${hex8(addr)}"]`);
export const reg = (key: string) => $(`.rrow[data-reg="${key}"]`);
export const pinnedReg = (key: string) => $(`.pinblock .rrow[data-pin="${key}"]`);
export const regCells = (key: string) => ['.hex', '.dec', '.bin'].map((c) => $(`.rrow[data-reg="${key}"] ${c}`));
export const tab = (name: 'Text' | 'Data') => $$('.textpanel .ptab').find((b) => b.textContent === name) ?? null;
// The status bar: its first cell (the state), the "Changed" cell, all of it.
export const statusLead = () => $('.status .cell.lead') ?? $('.status');
export const statusChanged = () => $('.status .cell.changed');
// The word at a label in Data.
export const dataCell = (t: Tutorial, label: string) => {
  const a = t.host.labelAddress(label);
  return a === null ? null : $(`.drow .dval[title="${hex8(a)}"]`);
};
export const labelTags = (label: string) => $$('.dtags').find((e) => new RegExp(`\\b${label}\\b`).test(e.textContent ?? '')) ?? null;

// The box of the text an element draws (not of the block it fills).
export function textOf(el: Element | null): Target {
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  return { rect: r.width > 0 ? r : null, within: el };
}

// Editor lines m..n as one box; a gutter cell with its line.
const scroller = () => $('.editor-panel .cm-scroller');
export function lines(t: Tutorial, m: number, n = m): Target {
  const rects = [];
  for (let i = m; i <= n; i += 1) rects.push(t.host.lineRect(i));
  if (rects.some((r) => !r)) return { rect: null, within: scroller() };
  const rs = rects as DOMRect[];
  const left = Math.min(...rs.map((r) => r.left));
  const top = Math.min(...rs.map((r) => r.top));
  return { rect: new DOMRect(left, top, Math.max(...rs.map((r) => r.right)) - left, Math.max(...rs.map((r) => r.bottom)) - top), within: scroller() };
}
export function gutterAndLine(t: Tutorial, n: number): Target {
  const g = t.host.gutterRect(n);
  const l = t.host.lineRect(n);
  if (!g || !l) return { rect: null, within: scroller() };
  return { rect: new DOMRect(g.left, Math.min(g.top, l.top), l.right - g.left, Math.max(g.bottom, l.bottom) - Math.min(g.top, l.top)), within: scroller() };
}
// The Editor's line of PC (none in a narrow window: the Run side is on show).
export const pcLine = (t: Tutorial): Target[] => (t.host.narrow() ? [] : [$('.editor-panel .cm-pc-line')]);
// An Editor line, only when the Editor is on screen with the Run side.
export const sideLine = (t: Tutorial, re: RegExp): Target[] => (t.host.narrow() ? [] : [lines(t, t.line(re))]);

// A group of Registers as one box: its band and the rows under it (to the next band).
export function groupBox(name: string): Target {
  const band = $$('.regs .rgroup').find((g) => g.textContent?.includes(name));
  if (!band) return null;
  const head = band.getBoundingClientRect();
  let bottom = head.bottom;
  for (let n = band.nextElementSibling; n && n.classList.contains('rrow'); n = n.nextElementSibling) {
    if ((n as HTMLElement).offsetParent) bottom = Math.max(bottom, n.getBoundingClientRect().bottom);
  }
  return { rect: new DOMRect(head.left, head.top, head.width, bottom - head.top), within: band.parentElement };
}
// The list scrolled so that a group's band stands right under the column head (and the pinned block).
export function scrollGroup(name: string): void {
  const band = $$('.regs .rgroup').find((g) => g.textContent?.includes(name));
  const list = band?.closest('.regs-list');
  if (!band || !list) return;
  const sticky = list.querySelector('.rtop')?.getBoundingClientRect().height ?? 0;
  list.scrollTop += band.getBoundingClientRect().top - list.getBoundingClientRect().top - sticky;
}
// A register's row where it shows best: its pinned copy if it has one.
export const regShown = (key: string) => pinnedReg(key) ?? reg(key);
