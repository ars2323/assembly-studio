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
       panel's head carries no legend; the status bar says "Changed: …"
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
   Dec, and Bin last (logic/columns.ts).  The boxes in the head show and
   hide each of them (a box the width had no room for brings its column
   back anyway); a star pins a register, an f register too, to the top of
   the list, where it may get an alias.  The table, the boxes, the pins and
   the aliases are renderer/app/panels/regtable.ts, shared with MIPS. */

import { cells, changedKeys, fpCells, registerRows, type RegisterValues } from '../logic/machine.ts';
import { FP_ABI_NAMES } from '../../core/registers.ts';
import type { Column, Fit } from '../../../../renderer/app/logic/columns.ts';
import { code, h } from '../../../../renderer/app/dom.ts';
import { perf } from '../../../../renderer/app/perf.ts';
import { RegisterTable } from '../../../../renderer/app/panels/regtable.ts';

const COLUMNS: Column[] = [{ key: 'rn', ch: 8.5 }, { key: 'hex', ch: 10.5 }, { key: 'dec', ch: 10.5 }, { key: 'bin', ch: 28.5 }];

export class RegisterPanel {
  readonly root: HTMLElement;
  private readonly table = new RegisterTable({ columns: COLUMNS, pc: 'pc' });

  get columns(): Fit | null { return this.table.columns; }

  constructor(initial: RegisterValues) {
    const table = this.table;
    const all = registerRows(initial);
    const groups = new Map<string, string[]>();
    for (const r of all) groups.set(r.group, [...(groups.get(r.group) ?? []), r.name.split(' ')[1] ?? r.key]);
    let group = '';
    for (const r of all) {
      if (r.group !== group) {
        group = r.group;
        const keys = groups.get(group)!;
        const span = keys.length > 1 ? `${keys[0]}–${keys[keys.length - 1]}` : keys[0];
        table.addGroup(h('div', { class: 'rgroup' }, h('span', { class: 'gname' }, group), code(span, 'gspan')));
      }
      table.addRow(r.key, r.name, '');
    }
    // Floating point, folded: f0..f31 (ft0..ft11, fs0..fs11, fa0..fa7).
    table.addGroup(h('div', { class: 'rgroup cp0' }, h('span', { class: 'gname' }, 'Floating point'), code('f0–f31', 'gspan')));
    for (let n = 0; n < 32; n += 1) table.addRow(`f${n}`, `f${n} ${FP_ABI_NAMES[n]}`, ' cp0 fp');
    const fold = h('div', { class: 'fold' });
    const setFold = (show: boolean) => {
      table.list.classList.toggle('show-cp0', show);
      const b = h('button', { class: 'linkbtn', type: 'button' }, show ? 'Hide' : 'Show');
      b.addEventListener('click', () => setFold(!show));
      fold.replaceChildren(h('span', { class: 'foldtext' }, `32 floating-point registers ${show ? 'shown' : 'hidden'}`), b);
    };
    setFold(false);
    this.root = table.finish(fold);
    this.update(initial, null);
  }

  // The width the panel wants (regtable.ts).
  widths(fontPx: number): { least: number; most: number } { return this.table.widths(fontPx); }

  // Columns and style for the width the panel has now.
  fit(): void { this.table.fit(); }

  update(now: RegisterValues, before: RegisterValues | null): void {
    const t0 = performance.now();
    const changed = changedKeys(before, now);
    let touched = 0;
    for (const r of registerRows(now)) {
      const c = cells(r.value);
      const wrote = this.table.write(r.key, c.hex, (row) => {
        row.hex.textContent = c.hex;
        row.dec.textContent = c.dec;
        // Four bits to a group, the groups a few pixels apart (not a space:
        // the eight groups have to fit next to Hex and Dec).
        row.bin.replaceChildren(...c.bin.split(' ').map((n) => h('span', {}, n)));
      });
      if (wrote) touched += 1;
      this.table.mark(r.key, changed.has(r.key), r.value === 0);
    }
    // f registers: the hex across Hex and Dec (64 bits do not fit one column), the value under Bin.
    for (let n = 0; n < 32; n += 1) {
      const bits = now.fbits[n] ?? '0'.repeat(16);
      const wrote = this.table.write(`f${n}`, bits, (row) => {
        const c = fpCells(bits);
        row.hex.textContent = c.hex;
        row.hex.title = c.hex;
        row.dec.textContent = '';
        row.bin.textContent = `${c.value} (${c.kind === 'single' ? 'float' : 'double'})`;
      });
      if (wrote) touched += 1;
      this.table.mark(`f${n}`, changed.has(`f${n}`), /^0+$/.test(bits));
    }
    perf.registers.push({ ms: performance.now() - t0, rows: touched }); // rows whose text changed
    this.table.revealChanged(changed);
  }

  // For the tutorial: a register's row into view; a column shown whatever
  // the width and the boxes, and let go again.
  revealRegister(key: string): void { this.table.revealRegister(key); }
  showColumn(key: 'dec' | 'bin'): 'already' | 'hidden' | 'shown' { return this.table.showColumn(key); }
  releaseColumn(key: 'dec' | 'bin'): void { this.table.releaseColumn(key); }
}
