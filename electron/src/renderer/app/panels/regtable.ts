/* The table both Registers panels are made of (panels/registers.ts for
   MIPS, isa/riscv/renderer/panels/registers.ts for RISC-V): the head with
   the Hex, Dec and Bin boxes, the column head and the pinned registers
   held at the top of the list, the rows, and how they fit the width.  The
   panels fill it: their groups, their rows, the values at each stop.

   What is shown and kept (which columns, the pinned registers in order,
   their aliases) is logic/regview.ts; it lives as long as the window does,
   never on disk.

   A row: a star in the left margin (where the row's own padding is: it
   takes no width from the columns), the name and, for a pinned register,
   its alias, then Hex, Dec, Bin and the "Changed" tag.  A pinned register
   has a second row, a copy, in the pinned block: the same values, the
   same highlight, data-pin instead of data-reg (data-reg is the register's
   one row in its group, which the tutorial and the tests look for). */

import { badgeStyle, fit, needed, styles, type Column, type Fit, type Style } from '../logic/columns.ts';
import {
  ALIAS_MAX, aliasRoom, allColumns, columnStates, fitPlan, gridTemplate, setColumn, spareWidth, togglePin, withAlias,
  type ColumnChoice, type ValueKey,
} from '../logic/regview.ts';
import { code, h, monoCh, userScrolls } from '../dom.ts';
import { panelHead, type Head } from '../ui.ts';

export interface Row {
  key: string;
  name: string;
  el: HTMLElement;
  hex: HTMLElement;
  dec: HTMLElement;
  bin: HTMLElement;
  star: HTMLButtonElement;
  alias: HTMLElement;
  last: string;
  flags: string;
  copy: Row | null;   // its row in the pinned block
  fill: ((row: Row) => void) | null;   // the last values written, for a copy made later
}

const TAG: Column = { key: 'tag', px: 56 }; // the badge: "Changed" at 10.5 px, 6 px either side (app.css .rrow .tag)
const DROPS = [['dec'], ['bin']];
// Padding and border (left and right together) and the gap between columns.
// The left padding holds the star: the gaps gave it the room (the totals for
// the four columns are what they were, and so is the panel's width).
const NORMAL = { pad: 28, gap: 8 };
const TIGHT = { pad: 20, gap: 4 };
const PIN_ROWS = 6;   // the pinned block shows this many rows, then scrolls itself

// Kept while the window lives (one ISA to a window).
const kept: { choice: ColumnChoice; pins: string[]; aliases: Map<string, string> } =
  { choice: allColumns(), pins: [], aliases: new Map() };

const SVG = 'http://www.w3.org/2000/svg';
function svg(cls: string, d: string): SVGSVGElement {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('viewBox', '0 0 16 16');
  el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  el.append(path);
  return el;
}
const STAR = 'M8 1.2l2.05 4.3 4.7.6-3.45 3.25.88 4.65L8 11.72 3.82 14l.88-4.65L1.25 6.1l4.7-.6z';
const PENCIL = 'M11.2 2.3l2.5 2.5-8.2 8.2-3.2.7.7-3.2zM9.8 3.7l2.5 2.5';

export class RegisterTable {
  readonly head: Head;
  readonly list: HTMLElement;
  readonly rows = new Map<string, Row>();
  readonly order: string[] = [];
  root!: HTMLElement;
  columns: Fit | null = null;
  private readonly rhead: HTMLElement;
  private readonly top: HTMLElement;
  private readonly pinBlock: HTMLElement;
  private readonly pinCount: HTMLElement;
  private readonly pinRows: HTMLElement;
  private readonly boxes: HTMLElement;
  private readonly cls = new Map<string, string>();
  private scrolledByStudent: () => boolean = () => false;
  private editing: (() => void) | null = null;
  private boxesShown = '';
  private readonly opts: { columns: Column[]; pc: string };

  // `columns`: the name column and Hex, Dec, Bin; `pc`: the register a step
  // always changes (never scrolled to).
  constructor(opts: { columns: Column[]; pc: string }) {
    this.opts = opts;
    this.rhead = h('div', { class: 'rhead' }, h('span', { class: 'rn' }, 'Name'), h('span', { class: 'hex strong' }, 'Hex'),
      h('span', { class: 'dec right' }, 'Dec'), h('span', { class: 'bin' }, 'Bin'));
    this.pinCount = h('span', { class: 'gspan' });
    this.pinRows = h('div', { class: 'pinrows' });
    this.pinBlock = h('div', { class: 'pinblock', role: 'group', 'aria-label': 'Pinned registers', hidden: true },
      h('div', { class: 'rgroup pinband' }, h('span', { class: 'gname' }, 'Pinned'), this.pinCount), this.pinRows);
    this.top = h('div', { class: 'rtop' }, this.rhead, this.pinBlock);
    this.list = h('div', { class: 'pbody regs-list' }, this.top);
    this.boxes = h('span', { class: 'colboxes', role: 'group', 'aria-label': 'Columns' });
    this.head = panelHead('Registers');
    this.head.aside.append(this.boxes);
  }

  addGroup(el: HTMLElement): void { this.list.append(el); }

  // A register's row in its group.  `cls`: ' cp0', ' cp0 fp' (folded rows).
  addRow(key: string, name: string, cls: string): Row {
    const row = this.makeRow(key, name, cls, false);
    this.list.append(row.el);
    this.rows.set(key, row);
    this.cls.set(key, cls);
    this.order.push(key);
    return row;
  }

  // The panel round the table, once its rows are in.
  finish(fold: HTMLElement): HTMLElement {
    this.root = h('section', { class: 'panel regs', 'aria-label': 'Registers' }, this.head.root, this.list, fold);
    this.scrolledByStudent = userScrolls(this.list);
    new ResizeObserver(() => this.fit()).observe(this.list);
    for (const key of kept.pins) this.addCopy(key);
    this.renderPins();
    return this.root;
  }

  // ---- values -------------------------------------------------------------------------

  // Writes a row's cells (and its pinned copy's) when `text` is not what
  // they show already; true if it did.
  write(key: string, text: string, fill: (row: Row) => void): boolean {
    const row = this.rows.get(key)!;
    if (text === row.last) return false;
    fill(row);
    if (row.copy) fill(row.copy);
    row.last = text;
    row.fill = fill;
    return true;
  }

  // The highlight: just changed (and flashed again), or zero (dimmed).
  mark(key: string, changed: boolean, zero: boolean): void {
    const row = this.rows.get(key)!;
    for (const r of row.copy ? [row, row.copy] : [row]) {
      const flags = `${changed ? 'c' : ''}${zero ? 'z' : ''}`;
      if (flags !== r.flags) {
        r.el.classList.toggle('chg', changed);
        r.el.classList.toggle('zero', zero && !changed);
        r.flags = flags;
      }
      if (changed) { // flash again, even if it was changed at the last step too
        r.el.classList.remove('flash');
        void r.el.offsetWidth;
        r.el.classList.add('flash');
      }
    }
  }

  // After a stop: the first register that changed into view (a pinned one is
  // in view already), unless the student is scrolling the list.
  revealChanged(changed: ReadonlySet<string>): void {
    const first = this.order.find((k) => changed.has(k) && k !== this.opts.pc && !kept.pins.includes(k));
    if (first && !this.scrolledByStudent()) this.reveal(this.rows.get(first)!.el);
  }

  revealRegister(key: string): void {
    const row = this.rows.get(key);
    if (row) this.reveal(row.el);
  }

  // ---- width --------------------------------------------------------------------------

  // The width the panel wants: all of Hex, Dec and Bin with tight margins
  // (`least`), and with room to spare (`most`).  Scroll bar and border in.
  // The same whatever the boxes say: the panel keeps its place in the window.
  widths(fontPx: number): { least: number; most: number } {
    const ch = monoCh(fontPx);
    const [normal, tight] = styles(NORMAL, TIGHT, fontPx);
    const chrome = (this.list.offsetWidth - this.list.clientWidth || 12) + 2;
    const all = this.opts.columns;
    return { least: Math.ceil(needed(all, tight, ch) + chrome), most: Math.ceil(needed([...all, TAG], normal, ch) + chrome) };
  }

  // What a choice of columns shows at `width`.
  private layout(width: number, choice: ColumnChoice, ch: number, all: Style[]) {
    const plan = fitPlan(this.opts.columns, DROPS, choice);
    const f = fit(width, plan.columns, plan.drops, choice.forced, ch, all);
    const hidden = new Set([...f.hidden, ...this.opts.columns.filter((c) => !plan.columns.includes(c)).map((c) => c.key)]);
    return { plan, f, hidden };
  }

  // Columns and style for the width the panel has now.
  fit(): void {
    const width = this.list.clientWidth;
    if (!width) return;
    const fontPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 13;
    const ch = monoCh(fontPx);
    const all = styles(NORMAL, TIGHT, fontPx);
    const { plan, f, hidden } = this.layout(width, kept.choice, ch, all);
    // The "Changed" tag wherever it fits beside the columns the width keeps
    // (tighter margins for it, but never a column or the font's pixel).
    const withTag = badgeStyle(width, plan.columns, f, TAG, ch, all);
    const tag = withTag !== null;
    const style = withTag ?? f.style;
    const shownCols = [...plan.columns.filter((c) => !f.hidden.has(c.key)), ...(tag ? [TAG] : [])];
    // What is left over goes to the aliases beside the names.
    const named = kept.pins.filter((k) => kept.aliases.has(k) && this.rows.has(k))
      .map((k) => ({ name: [...this.rows.get(k)!.name].length, alias: [...kept.aliases.get(k)!].length }));
    const extra = aliasRoom(spareWidth(width, shownCols, style, ch), named, this.opts.columns[0].ch ?? 0, ch * style.scale);
    const shown = new Set(shownCols.map((c) => c.key));
    this.root.style.setProperty('--rcols', gridTemplate([...this.opts.columns, TAG], shown, extra));
    this.root.dataset.style = style.name;
    for (const key of ['hex', 'dec', 'bin']) this.root.classList.toggle(`hide-${key}`, hidden.has(key));
    this.root.classList.toggle('hide-tag', !tag);
    this.root.classList.toggle('overflow', f.overflow);
    this.columns = { ...f, hidden };
    // The pinned block: PIN_ROWS rows, never more than a third of the list.
    const rowPx = this.rows.values().next().value?.el.offsetHeight || 21;
    this.root.style.setProperty('--pinmax', `${Math.max(rowPx * 2, Math.min(rowPx * PIN_ROWS, Math.floor(this.list.clientHeight / 3))) + 2}px`);
    this.countPins();
    this.renderBoxes(width, ch, all, hidden);
    this.head.fitMeta();
  }

  // The three boxes in the head.
  private renderBoxes(width: number, ch: number, all: Style[], hidden: ReadonlySet<string>): void {
    const shownBy = (c: ColumnChoice) => {
      const { hidden: h2 } = this.layout(width, c, ch, all);
      return new Set(['hex', 'dec', 'bin'].filter((k) => !h2.has(k)));
    };
    const states = columnStates(kept.choice, hidden);
    const sig = JSON.stringify(states);
    if (sig === this.boxesShown) return; // as they are: a box keeps its focus
    this.boxesShown = sig;
    this.boxes.replaceChildren(...states.map((s) => {
      const input = h('input', { type: 'checkbox', 'aria-label': `Show ${s.label}` });
      input.checked = s.checked;
      input.disabled = s.locked;
      input.addEventListener('change', () => {
        kept.choice = setColumn(kept.choice, s.key, input.checked, shownBy);
        this.fit();
        (this.boxes.querySelector(`[data-col=${s.key}] input`) as HTMLInputElement | null)?.focus();
      });
      const title = s.locked ? `${s.label}: the one column shown (at least one stays)`
        : s.noRoom ? `${s.label}: no room at this width. Tick to show it anyway (the list scrolls sideways)`
        : s.checked ? `Hide ${s.label}` : `Show ${s.label}`;
      return h('label', { class: `colbox${s.checked ? ' on' : ''}${s.noRoom ? ' noroom' : ''}${s.locked ? ' locked' : ''}`, 'data-col': s.key, title },
        input, h('span', {}, s.label));
    }));
  }

  // For the tutorial: a column shown whatever the width and the boxes.
  // 'already': turned on before (leave it on); 'hidden': it was not on
  // screen; 'shown': it was there anyway.
  showColumn(key: 'dec' | 'bin'): 'already' | 'hidden' | 'shown' {
    if (kept.choice.forced.has(key)) return 'already';
    const hidden = this.columns?.hidden.has(key) ?? false;
    kept.choice = { off: kept.choice.off, forced: new Set([...kept.choice.forced, key]) };
    this.fit();
    return hidden ? 'hidden' : 'shown';
  }
  releaseColumn(key: ValueKey): void {
    const forced = new Set(kept.choice.forced);
    forced.delete(key);
    kept.choice = { off: kept.choice.off, forced };
    this.fit();
  }

  // ---- rows, pins, aliases ------------------------------------------------------------

  private makeRow(key: string, name: string, cls: string, pinned: boolean): Row {
    const hex = code('', 'hex');
    const dec = code('', 'dec');
    const bin = code('', 'bin');
    const star = h('button', { class: 'star', type: 'button' });
    star.append(svg('staricon', STAR));
    star.addEventListener('click', () => this.togglePin(key, pinned));
    const alias: HTMLElement = pinned
      ? h('button', { class: 'alias', type: 'button' })
      : h('span', { class: 'alias', hidden: true });
    if (pinned) alias.addEventListener('click', () => this.editAlias(key));
    // A name longer than its column (BadVAddr) a little smaller, to keep clear of Hex.
    const long = [...name].length > (this.opts.columns[0].ch ?? Infinity);
    const rn = h('span', { class: 'rn mono' }, h('span', { class: `rname${long ? ' long' : ''}` }, name), alias);
    if (pinned) rn.addEventListener('dblclick', () => this.editAlias(key));
    const el = h('div', { class: `rrow${pinned ? ' pinned' : ''}${cls}`, [pinned ? 'data-pin' : 'data-reg']: key },
      star, rn, hex, dec, bin, h('span', { class: 'tag' }, 'Changed'));
    return { key, name, el, hex, dec, bin, star, alias, last: '', flags: '', copy: null, fill: null };
  }

  private addCopy(key: string): void {
    const row = this.rows.get(key);
    if (!row || row.copy) return;
    // Its copy is never folded away with CP0 or the f registers.
    const copy = this.makeRow(key, row.name, (this.cls.get(key) ?? '').replace(' cp0', ''), true);
    if (row.fill) row.fill(copy);
    copy.last = row.last;
    for (const c of ['chg', 'zero']) copy.el.classList.toggle(c, row.el.classList.contains(c));
    copy.flags = row.flags;
    row.copy = copy;
  }

  private togglePin(key: string, fromCopy: boolean): void {
    this.editing?.();
    kept.pins = togglePin(kept.pins, key);
    const row = this.rows.get(key)!;
    if (kept.pins.includes(key)) this.addCopy(key);
    else row.copy = null;
    this.renderPins();
    this.fit();
    if (fromCopy) row.star.focus(); // the copy is gone: its star's focus to the row's own
  }

  // The pinned block in the order of the stars, every star and alias as the state says.
  private renderPins(): void {
    const pinned = kept.pins.map((k) => this.rows.get(k)).filter((r): r is Row => !!r && !!r.copy);
    this.pinRows.replaceChildren(...pinned.map((r) => r.copy!.el));
    this.pinBlock.hidden = pinned.length === 0;
    for (const row of this.rows.values()) {
      const on = kept.pins.includes(row.key);
      for (const r of row.copy ? [row, row.copy] : [row]) {
        r.star.classList.toggle('on', on);
        r.star.setAttribute('aria-pressed', String(on));
        r.star.setAttribute('aria-label', `${on ? 'Unpin' : 'Pin'} ${row.name}`);
        r.star.title = on ? 'Unpin' : 'Pin to the top';
      }
      this.showAlias(row);
    }
  }

  // The band's count, and a word when the block has more than it shows.
  private countPins(): void {
    const n = this.pinRows.childElementCount;
    const more = this.pinRows.scrollHeight > this.pinRows.clientHeight + 1;
    this.pinCount.textContent = more ? `${n} · scroll for more` : String(n);
  }

  private showAlias(row: Row): void {
    const alias = kept.pins.includes(row.key) ? kept.aliases.get(row.key) ?? '' : '';
    row.alias.textContent = alias;
    row.alias.hidden = !alias;
    row.alias.title = alias ? `Alias: ${alias}` : '';
    const copy = row.copy;
    if (!copy) return;
    copy.alias.replaceChildren(alias || svg('pencil', PENCIL));
    copy.alias.classList.toggle('empty', !alias);
    copy.alias.title = alias ? `Alias: ${alias} (click to rename)` : 'Add an alias (a name of your own, e.g. a C variable)';
    copy.alias.setAttribute('aria-label', alias ? `Alias ${alias} of ${row.name}: rename` : `Add an alias for ${row.name}`);
  }

  // An alias typed in place over the pinned row: Enter or leaving keeps it,
  // Esc keeps the old one, an empty one removes it.
  private editAlias(key: string): void {
    const row = this.rows.get(key);
    const copy = row?.copy;
    if (!row || !copy) return;
    this.editing?.();
    const input = h('input', { type: 'text', class: 'mono', maxlength: String(ALIAS_MAX), placeholder: 'alias', spellcheck: 'false',
      'aria-label': `Alias for ${row.name}` });
    input.value = kept.aliases.get(key) ?? '';
    const box = h('span', { class: 'aedit' }, h('span', { class: 'aname mono' }, row.name), input,
      h('span', { class: 'ahint' }, 'Enter ↵ · Esc'));
    copy.el.append(box);
    copy.el.classList.add('editing');
    let done = false;
    const end = (keep: boolean) => {
      if (done) return;
      done = true;
      this.editing = null;
      if (keep) kept.aliases = withAlias(kept.aliases, key, input.value);
      box.remove();
      copy.el.classList.remove('editing');
      this.showAlias(row);
      this.fit();
    };
    this.editing = () => end(true);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); end(true); copy.alias.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); copy.alias.focus(); }
    });
    input.addEventListener('blur', () => end(true));
    input.focus();
    input.select();
  }

  // Scrolls as little as possible to have `row` in view, below the sticky
  // column head and pinned block, with a row to spare on either side.
  private reveal(row: HTMLElement): void {
    if (!row.offsetParent) return; // a folded row
    const list = this.list;
    const margin = row.offsetHeight;
    const top = row.offsetTop - this.top.offsetHeight - margin;
    const bottom = row.offsetTop + row.offsetHeight + margin;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }
}
