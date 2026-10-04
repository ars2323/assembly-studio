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
     - groups as bands (Special, Constant, Return values, Arguments,
       Temporaries, Saved, Pointers, Return address, Reserved: logic/
       machine.ts WINDOW_GROUPS), each with the registers it holds;
     - zero registers dimmed.

   Hex, Dec and Bin together are what the course is about: at a narrow width
   the panel gives up its margins and a pixel of font before a column, then
   Dec, and Bin last (logic/columns.ts).  The boxes in the head show and
   hide each of them (a box the width had no room for brings its column
   back anyway); a star pins a register to the top of the list, where it
   may get an alias.  The table, the boxes, the pins and the aliases are
   panels/regtable.ts, shared with RISC-V. */

import { cells, changedKeys, registerRows, type RegisterValues } from '../logic/machine.ts';
import type { Column, Fit } from '../logic/columns.ts';
import { code, h } from '../dom.ts';
import { perf } from '../perf.ts';
import { RegisterTable, type Mark, type Marks } from './regtable.ts';

const COLUMNS: Column[] = [{ key: 'rn', ch: 7 }, { key: 'hex', ch: 10.5 }, { key: 'dec', ch: 10.5 }, { key: 'bin', ch: 28.5 }];

export class RegisterPanel {
  readonly root: HTMLElement;
  private readonly table = new RegisterTable({ columns: COLUMNS, pc: 'PC' });

  get columns(): Fit | null { return this.table.columns; }

  constructor(initial: RegisterValues) {
    const table = this.table;
    const all = registerRows(initial, true); // CP0 folded below
    const groups = new Map<string, string[]>();
    for (const r of all) groups.set(r.group, [...(groups.get(r.group) ?? []), r.key]);
    let group = '';
    for (const r of all) {
      if (r.group !== group) {
        group = r.group;
        const keys = groups.get(group)!;
        const span = keys.length > 1 ? `${keys[0]}–${keys[keys.length - 1]}` : keys[0];
        table.addGroup(h('div', { class: `rgroup${group === 'CP0' ? ' cp0' : ''}` },
          group === 'CP0' ? code('CP0') : h('span', { class: 'gname' }, group), code(span, 'gspan')));
      }
      table.addRow(r.key, r.key, r.group === 'CP0' ? ' cp0' : '');
    }
    const fold = h('div', { class: 'fold' });
    const setFold = (show: boolean) => {
      table.list.classList.toggle('show-cp0', show);
      const b = h('button', { class: 'linkbtn', type: 'button' }, show ? 'Hide' : 'Show');
      b.addEventListener('click', () => setFold(!show));
      const n = all.filter((r) => r.group === 'CP0').length;
      fold.replaceChildren(h('span', { class: 'foldtext' }, `${n} `, code('CP0'), ` register${n === 1 ? '' : 's'} ${show ? 'shown' : 'hidden'}`), b);
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
    for (const r of registerRows(now, true)) {
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
    perf.registers.push({ ms: performance.now() - t0, rows: touched }); // rows whose text changed
    this.table.revealChanged(changed);
  }

  // For the tutorial: a register's row into view; a column shown whatever
  // the width and the boxes, and let go again.
  revealRegister(key: string): void { this.table.revealRegister(key); }
  showColumn(key: 'dec' | 'bin'): 'already' | 'hidden' | 'shown' { return this.table.showColumn(key); }
  // The stars and aliases (regtable.ts): heard, read and set.
  set onMark(listener: (m: Mark) => void) { this.table.onMark = listener; }
  marks(): Marks { return this.table.marks(); }
  setMarks(m: Marks): void { this.table.setMarks(m); }
  releaseColumn(key: 'dec' | 'bin'): void { this.table.releaseColumn(key); }
}
