/* What the Registers panel shows besides the values: which of Hex, Dec and
   Bin, the pinned registers, and their aliases.  Pure; panels/regtable.ts
   puts it on screen (MIPS and RISC-V alike).

   Columns.  Each of Hex, Dec and Bin has a checkbox in the panel's head, and
   a box is ticked exactly when its column is on screen.  The width still
   has its say (logic/columns.ts: Dec gives way first, Bin last): a column
   the student leaves on shows only where it fits, and its box then reads
   "no room".  Ticking it anyway shows it whatever the width (the list
   scrolls sideways), as the head's "+ Bin" did before.  Unticking takes it
   away whatever the width, and the others share the room.  One column
   always stays: the last box shown cannot be unticked.

   Pinned.  A star on a row copies it to the top of the list, in the order
   they were starred; the row stays in its group too.

   Aliases.  A pinned register may carry a name of the student's own (int a
   in C is $t0 in the assembly): trimmed, at most ALIAS_MAX characters,
   empty for none.  Kept while the app runs, never written to disk; an
   alias stays with its register when it is unpinned, and is shown again
   when it is pinned again. */

import { needed, type Column, type Style } from './columns.ts';

export const VALUE_KEYS = ['hex', 'dec', 'bin'] as const;
export type ValueKey = typeof VALUE_KEYS[number];
export const COLUMN_LABELS: Record<ValueKey, string> = { hex: 'Hex', dec: 'Dec', bin: 'Bin' };

export interface ColumnChoice {
  off: ReadonlySet<string>;      // unticked: never shown
  forced: ReadonlySet<string>;   // ticked although the width had no room: shown whatever the width
}

export const allColumns = (): ColumnChoice => ({ off: new Set(), forced: new Set() });

// What to give columns.ts fit(): the columns the student has not turned off,
// and the order the width takes them away in -- never all of the value
// columns left (the last of them stays, and overflows if it must).
export function fitPlan(columns: readonly Column[], drops: readonly (readonly string[])[],
                        choice: ColumnChoice): { columns: Column[]; drops: string[][] } {
  const isValue = (key: string) => (VALUE_KEYS as readonly string[]).includes(key);
  const wanted = (key: string) => !isValue(key) || choice.forced.has(key) || !choice.off.has(key);
  const kept = columns.filter((c) => wanted(c.key));
  const left = kept.filter((c) => isValue(c.key)).map((c) => c.key);
  const plan = drops.map((d) => d.filter((key) => left.includes(key))).filter((d) => d.length > 0);
  while (plan.length && left.every((key) => plan.some((d) => d.includes(key)))) plan.pop();
  return { columns: kept, drops: plan };
}

export interface ColumnState {
  key: ValueKey;
  label: string;
  checked: boolean;   // on screen
  noRoom: boolean;    // left on, but the width took it away
  locked: boolean;    // the only one on screen: cannot be unticked
}

// The three boxes, from the choice and what fit() hid.
export function columnStates(choice: ColumnChoice, hidden: ReadonlySet<string>): ColumnState[] {
  const wanted = (key: string) => choice.forced.has(key) || !choice.off.has(key);
  const shown = VALUE_KEYS.filter((key) => wanted(key) && !hidden.has(key));
  return VALUE_KEYS.map((key) => ({
    key, label: COLUMN_LABELS[key],
    checked: shown.includes(key),
    noRoom: wanted(key) && hidden.has(key),
    locked: shown.length === 1 && shown[0] === key,
  }));
}

// A box ticked or unticked.  `shown` says which value columns a choice
// would put on screen at the panel's width (fitPlan + fit).  Ticking a
// column the width has no room for forces it; unticking the last one
// shown does nothing.
export function setColumn(choice: ColumnChoice, key: ValueKey, on: boolean,
                          shown: (c: ColumnChoice) => ReadonlySet<string>): ColumnChoice {
  const off = new Set(choice.off);
  const forced = new Set(choice.forced);
  if (!on) {
    const now = shown(choice);
    if (!now.has(key) || VALUE_KEYS.filter((k) => now.has(k)).length <= 1) return choice;
    off.add(key);
    forced.delete(key);
    return { off, forced };
  }
  off.delete(key);
  if (!shown({ off, forced }).has(key)) forced.add(key);
  return { off, forced };
}

// The grid's columns (--rcols): the shown ones in order, each line named
// after every column that starts there, hidden ones included -- so that a
// cell can span "hex / bin" (a RISC-V f register's 64 bits) whichever of
// them are shown.  `extra` widens the name column (an alias beside it).
export function gridTemplate(columns: readonly Column[], shown: ReadonlySet<string>, extra = 0): string {
  const parts: string[] = [];
  let pending: string[] = [];
  columns.forEach((c, i) => {
    pending.push(c.key);
    if (!shown.has(c.key)) return;
    const add = (c.px ?? 0) + (i === 0 ? extra : 0);
    const width = c.ch !== undefined ? (add ? `calc(${c.ch}ch + ${add}px)` : `${c.ch}ch`) : `${add}px`;
    parts.push(`[${pending.join(' ')}] ${width}`);
    pending = [];
  });
  pending.push('rest');
  parts.push(`[${pending.join(' ')}] minmax(0, 1fr)`);
  return parts.join(' ');
}

// The room an alias takes beside its register's name: the chip (padding,
// border, the gap before it) and its characters in the smaller code font.
export const ALIAS_CHROME = 14;
export const ALIAS_SCALE = 0.85;

// How much wider the name column should be for the aliases beside the
// names, out of the room the width leaves over (`spare`, px): the most any
// one row needs past the column, never more than there is.  `names` are the
// aliased rows' name and alias lengths in characters, `colCh` the name
// column's width, `ch` the code font's ch as drawn.
export function aliasRoom(spare: number, names: readonly { name: number; alias: number }[], colCh: number, ch: number): number {
  const need = names.reduce((most, n) => Math.max(most, n.name * ch + ALIAS_CHROME + n.alias * ch * ALIAS_SCALE - colCh * ch), 0);
  return Math.max(0, Math.floor(Math.min(spare, Math.ceil(need))));
}

// The room the shown columns leave over at `width`.
export function spareWidth(width: number, shown: readonly Column[], style: Style, ch: number): number {
  return Math.max(0, width - needed(shown, style, ch));
}

// ---- pinned ----------------------------------------------------------------------------

// Starred or unstarred: a new star goes last.
export function togglePin(pins: readonly string[], key: string): string[] {
  return pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key];
}

// ---- aliases ---------------------------------------------------------------------------

export const ALIAS_MAX = 16;

// What the student typed, as an alias: no control characters, one space
// for a run of them, no space at either end, at most ALIAS_MAX characters
// (whole characters, never half a surrogate pair).  '' for none.
export function cleanAlias(raw: string): string {
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...text].slice(0, ALIAS_MAX).join('').trim();
}

// The aliases with `key`'s set (or removed, for an empty one).
export function withAlias(aliases: ReadonlyMap<string, string>, key: string, raw: string): Map<string, string> {
  const next = new Map(aliases);
  const alias = cleanAlias(raw);
  if (alias) next.set(key, alias); else next.delete(key);
  return next;
}
