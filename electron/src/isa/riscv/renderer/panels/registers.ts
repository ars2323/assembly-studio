/* The register panel.  One DOM row per register, made once; an update
   touches only the cells whose text changed and the rows whose highlight
   changed.  (The Qt build redrew the whole table on every step and fought
   flicker over several versions.)  perf.registers records what an update
   cost.

   What to look at first:
     - the register that just changed: a yellow row with a bar, flashed
       once when it changes, and its own "Changed" tag wherever the panel's
       width has the room (logic/columns.ts badgeStyle; the panel is given
       no width for it, which would come out of Text or the Editor) -- the
       panel's head carries no legend; the status bar says "방금 바뀜: …"
       in the same yellow at every width.  It lifts at the next step.
       After a step the list scrolls to it, unless the student is
       scrolling it (dom.ts userScrolls);
     - its value in hexadecimal (the strongest column); decimal quieter,
       binary quietest;
     - groups as bands (Special, then the RISC-V calling convention's:
       logic/machine.ts WINDOW_GROUPS), each with the registers it holds;
       every row names its register both ways, "x10 a0";
     - zero registers dimmed;
     - the floating-point registers folded below (where the MIPS panel
       folded CP0): each its 64 bits in hex and its value -- a single when
       NaN-boxed, else a double -- from the engine's raw fbits, never the
       32-bit view (a double there reads as NaN).

   Hex, Dec and Bin together are what the course is about: at a narrow width
   the panel gives up its margins and a pixel of font before a column, then
   Dec, and Bin last (logic/columns.ts).  A column given up comes back from
   the head ("+ Bin"). */

import { cells, changedKeys, fpCells, registerRows, type RegisterValues } from '../logic/machine.ts';
import { FP_ABI_NAMES } from '../../core/registers.ts';
import { badgeStyle, fit, needed, styles, type Column, type Fit } from '../../../../renderer/app/logic/columns.ts';
import { code, h, monoCh, userScrolls } from '../../../../renderer/app/dom.ts';
import { perf } from '../../../../renderer/app/perf.ts';
import { columnButton, panelHead, type Head } from '../../../../renderer/app/ui.ts';

interface Row { el: HTMLElement; hex: HTMLElement; dec: HTMLElement; bin: HTMLElement; last: string; flags: string }

const COLUMNS: Column[] = [{ key: 'rn', ch: 8.5 }, { key: 'hex', ch: 10.5 }, { key: 'dec', ch: 10.5 }, { key: 'bin', ch: 28.5 }];
const TAG: Column = { key: 'tag', px: 56 }; // the badge: "Changed" at 10.5 px, 6 px either side (app.css .rrow .tag)
const DROPS = [['dec'], ['bin']];
const NAMES: Record<string, string> = { dec: 'Dec', bin: 'Bin' };
// Padding and border (left and right together) and the gap between columns.
const NORMAL = { pad: 22, gap: 10 };
const TIGHT = { pad: 14, gap: 6 };

export class RegisterPanel {
  readonly root: HTMLElement;
  private readonly head: Head;
  private readonly list: HTMLElement;
  private readonly rhead: HTMLElement;
  private readonly rows = new Map<string, Row>();
  private readonly order: string[] = [];
  private readonly forced = new Set<string>();
  private readonly scrolledByStudent: () => boolean;
  columns: Fit | null = null;

  constructor(initial: RegisterValues) {
    this.rhead = h('div', { class: 'rhead' }, h('span', { class: 'rn' }, 'Name'), h('span', { class: 'hex strong' }, 'Hex'),
      h('span', { class: 'dec right' }, 'Dec'), h('span', { class: 'bin' }, 'Bin'));
    this.list = h('div', { class: 'pbody regs-list' }, this.rhead);
    const all = registerRows(initial);
    const groups = new Map<string, string[]>();
    for (const r of all) groups.set(r.group, [...(groups.get(r.group) ?? []), r.name.split(' ')[1] ?? r.key]);
    let group = '';
    const addRow = (key: string, name: string, cls: string) => {
      const hex = code('', 'hex');
      const dec = code('', 'dec');
      const bin = code('', 'bin');
      const el = h('div', { class: `rrow${cls}`, 'data-reg': key },
        h('span', { class: 'rn mono' }, name), hex, dec, bin, h('span', { class: 'tag' }, 'Changed'));
      this.list.append(el);
      this.rows.set(key, { el, hex, dec, bin, last: '', flags: '' });
      this.order.push(key);
    };
    for (const r of all) {
      if (r.group !== group) {
        group = r.group;
        const keys = groups.get(group)!;
        const span = keys.length > 1 ? `${keys[0]}–${keys[keys.length - 1]}` : keys[0];
        this.list.append(h('div', { class: 'rgroup' }, h('span', { class: 'gname' }, group), code(span, 'gspan')));
      }
      addRow(r.key, r.name, '');
    }
    // Floating point, folded: f0..f31 (ft0..ft11, fs0..fs11, fa0..fa7).
    this.list.append(h('div', { class: 'rgroup cp0' }, h('span', { class: 'gname' }, 'Floating point'), code('f0–f31', 'gspan')));
    for (let n = 0; n < 32; n += 1) addRow(`f${n}`, `f${n} ${FP_ABI_NAMES[n]}`, ' cp0 fp');
    const fold = h('div', { class: 'fold' });
    const setFold = (show: boolean) => {
      this.list.classList.toggle('show-cp0', show);
      const b = h('button', { class: 'linkbtn', type: 'button' }, show ? 'Hide' : 'Show');
      b.addEventListener('click', () => setFold(!show));
      const n = this.order.filter((k) => this.rows.get(k)!.el.classList.contains('cp0')).length;
      fold.replaceChildren(h('span', { class: 'foldtext' }, '부동소수점', show ? ` 레지스터 ${n}개 보이는 중` : ` 레지스터 ${n}개 숨김`), b);
    };
    setFold(false);
    this.head = panelHead('Registers');
    this.root = h('section', { class: 'panel regs', 'aria-label': 'Registers' }, this.head.root, this.list, fold);
    this.scrolledByStudent = userScrolls(this.list);
    new ResizeObserver(() => this.fit()).observe(this.list);
    this.update(initial, null);
  }

  // The width the panel wants: all of Hex, Dec and Bin with tight margins
  // (`least`), and with room to spare (`most`).  Scroll bar and border in.
  widths(fontPx: number): { least: number; most: number } {
    const ch = monoCh(fontPx);
    const [normal, tight] = styles(NORMAL, TIGHT, fontPx);
    const chrome = (this.list.offsetWidth - this.list.clientWidth || 12) + 2;
    return { least: Math.ceil(needed(COLUMNS, tight, ch) + chrome), most: Math.ceil(needed([...COLUMNS, TAG], normal, ch) + chrome) };
  }

  // Columns and style for the width the panel has now.
  fit(): void {
    const width = this.list.clientWidth;
    if (!width) return;
    const fontPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 13;
    const ch = monoCh(fontPx);
    const all = styles(NORMAL, TIGHT, fontPx);
    const f = fit(width, COLUMNS, DROPS, this.forced, ch, all);
    // The "Changed" tag wherever it fits beside the columns the width keeps
    // (tighter margins for it, but never a column or the font's pixel).
    const withTag = badgeStyle(width, COLUMNS, f, TAG, ch, all);
    const tag = withTag !== null;
    const cols = COLUMNS.filter((c) => !f.hidden.has(c.key));
    const template = cols.map((c) => `${c.ch}ch`).join(' ') + (tag ? ` ${TAG.px}px` : '') + ' minmax(0, 1fr)';
    this.root.style.setProperty('--rcols', template);
    this.root.dataset.style = (withTag ?? f.style).name;
    for (const key of ['dec', 'bin']) this.root.classList.toggle(`hide-${key}`, f.hidden.has(key));
    this.root.classList.toggle('hide-tag', !tag);
    this.root.classList.toggle('overflow', f.overflow);
    this.columns = f;
    // The columns the width takes away, to turn back on.
    const auto = fit(width, COLUMNS, DROPS, new Set(), ch, all).hidden;
    this.head.aside.replaceChildren(...[...auto].map((key) => {
      const on = this.forced.has(key);
      return columnButton(NAMES[key], on, () => {
        if (on) this.forced.delete(key); else this.forced.add(key);
        this.fit();
      });
    }));
    this.head.fitMeta();
  }

  update(now: RegisterValues, before: RegisterValues | null): void {
    const t0 = performance.now();
    const changed = changedKeys(before, now);
    let touched = 0;
    const mark = (row: Row, isChanged: boolean, zero: boolean) => {
      const flags = `${isChanged ? 'c' : ''}${zero ? 'z' : ''}`;
      if (flags !== row.flags) {
        row.el.classList.toggle('chg', isChanged);
        row.el.classList.toggle('zero', zero && !isChanged);
        row.flags = flags;
      }
      if (isChanged) { // flash again, even if it was changed at the last step too
        row.el.classList.remove('flash');
        void row.el.offsetWidth;
        row.el.classList.add('flash');
      }
    };
    for (const r of registerRows(now)) {
      const row = this.rows.get(r.key)!;
      const c = cells(r.value);
      if (c.hex !== row.last) {
        row.hex.textContent = c.hex;
        row.dec.textContent = c.dec;
        // Four bits to a group, the groups a few pixels apart (not a space:
        // the eight groups have to fit next to Hex and Dec).
        row.bin.replaceChildren(...c.bin.split(' ').map((n) => h('span', {}, n)));
        row.last = c.hex;
        touched += 1;
      }
      mark(row, changed.has(r.key), r.value === 0);
    }
    // f registers: the hex across Hex and Dec (64 bits do not fit one column), the value under Bin.
    for (let n = 0; n < 32; n += 1) {
      const row = this.rows.get(`f${n}`)!;
      const bits = now.fbits[n] ?? '0'.repeat(16);
      if (bits !== row.last) {
        const c = fpCells(bits);
        row.hex.textContent = c.hex;
        row.dec.textContent = '';
        row.bin.textContent = `${c.value} (${c.kind === 'single' ? 'float' : 'double'})`;
        row.last = bits;
        touched += 1;
      }
      mark(row, changed.has(`f${n}`), /^0+$/.test(bits));
    }
    perf.registers.push({ ms: performance.now() - t0, rows: touched }); // rows whose text changed
    const first = this.order.find((k) => changed.has(k) && k !== 'pc');
    if (first && !this.scrolledByStudent()) this.reveal(this.rows.get(first)!.el);
  }

  // For the tutorial: a register's row into view; a column shown whatever
  // the width (true if it was not already), and let go again.
  revealRegister(key: string): void {
    const row = this.rows.get(key);
    if (row) this.reveal(row.el);
  }
  // 'already': turned on before (leave it on); 'hidden': the width had
  // taken it away; 'shown': it was there anyway.
  showColumn(key: 'dec' | 'bin'): 'already' | 'hidden' | 'shown' {
    if (this.forced.has(key)) return 'already';
    const hidden = this.columns?.hidden.has(key) ?? false;
    this.forced.add(key);
    this.fit();
    return hidden ? 'hidden' : 'shown';
  }
  releaseColumn(key: 'dec' | 'bin'): void {
    this.forced.delete(key);
    this.fit();
  }

  // Scrolls as little as possible to have `row` in view, below the sticky
  // column head, with a row to spare on either side.
  private reveal(row: HTMLElement): void {
    if (!row.offsetParent) return; // a folded CP0 row
    const list = this.list;
    const margin = row.offsetHeight;
    const top = row.offsetTop - this.rhead.offsetHeight - margin;
    const bottom = row.offsetTop + row.offsetHeight + margin;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }
}
