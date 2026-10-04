/* What the Registers panel shows besides the values
   (src/renderer/app/logic/regview.ts): the Hex, Dec and Bin boxes with the
   width's own rule, the grid's named lines, the room for aliases, the
   order of the pinned registers, and what an alias may be. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fit, styles, type Column } from '../../src/renderer/app/logic/columns.ts';
import {
  ALIAS_MAX, aliasRoom, allColumns, cleanAlias, columnStates, fitPlan, gridTemplate, setColumn, togglePin, withAlias,
  type ColumnChoice,
} from '../../src/renderer/app/logic/regview.ts';

// The MIPS panel's columns and the order the width takes them away in.
const COLUMNS: Column[] = [{ key: 'rn', ch: 7 }, { key: 'hex', ch: 10.5 }, { key: 'dec', ch: 10.5 }, { key: 'bin', ch: 28.5 }];
const DROPS = [['dec'], ['bin']];
const CH = 6.5;
const ALL = styles({ pad: 28, gap: 8 }, { pad: 20, gap: 4 }, 13);
const choice = (off: string[] = [], forced: string[] = []): ColumnChoice => ({ off: new Set(off), forced: new Set(forced) });

// Which value columns a choice puts on screen at `width`, as the panel works it out.
function shownAt(width: number) {
  return (c: ColumnChoice): Set<string> => {
    const plan = fitPlan(COLUMNS, DROPS, c);
    const f = fit(width, plan.columns, plan.drops, c.forced, CH, ALL);
    return new Set(plan.columns.map((col) => col.key).filter((k) => k !== 'rn' && !f.hidden.has(k)));
  };
}
const WIDE = 1000;
const NARROW = 260; // Name, Hex and Dec do not all fit: Dec goes; Bin went long before

test('all three boxes ticked to begin with', () => {
  const c = allColumns();
  assert.deepEqual(columnStates(c, new Set()).map((s) => [s.label, s.checked, s.noRoom, s.locked]),
    [['Hex', true, false, false], ['Dec', true, false, false], ['Bin', true, false, false]]);
});

test('an unticked column is left out of the fit, and the others get its room', () => {
  const plan = fitPlan(COLUMNS, DROPS, choice(['bin']));
  assert.deepEqual(plan.columns.map((c) => c.key), ['rn', 'hex', 'dec']);
  assert.deepEqual(plan.drops, [['dec']]);
  // A width that drops Dec with Bin there keeps it once Bin is off.
  const width = 300;
  assert.deepEqual([...shownAt(width)(allColumns())], ['hex']);
  assert.deepEqual([...shownAt(width)(choice(['bin']))], ['hex', 'dec']);
});

test('the width never takes away the last value column left', () => {
  // Hex off: Dec and Bin left; the width may drop Dec but not Bin as well.
  assert.deepEqual(fitPlan(COLUMNS, DROPS, choice(['hex'])).drops, [['dec']]);
  // Only Dec on: nothing may be dropped.
  assert.deepEqual(fitPlan(COLUMNS, DROPS, choice(['hex', 'bin'])).drops, []);
  assert.deepEqual([...shownAt(10)(choice(['hex', 'bin']))], ['dec']);
});

test('a column shows only where it is ticked and fits; the box says which', () => {
  const states = columnStates(allColumns(), new Set(['dec', 'bin']));
  assert.deepEqual(states.map((s) => [s.key, s.checked, s.noRoom]), [['hex', true, false], ['dec', false, true], ['bin', false, true]]);
  // Unticked by the student is not "no room".
  const off = columnStates(choice(['bin']), new Set(['bin']));
  assert.equal(off[2].noRoom, false);
  assert.equal(off[2].checked, false);
});

test('the last column shown cannot be unticked', () => {
  const only = choice(['dec', 'bin']);
  const states = columnStates(only, new Set(['dec', 'bin']));
  assert.deepEqual(states.map((s) => s.locked), [true, false, false]);
  assert.equal(setColumn(only, 'hex', false, shownAt(WIDE)), only, 'unticking the last one changes nothing');
  // Two shown: either can go.
  const two = setColumn(choice(['bin']), 'dec', false, shownAt(WIDE));
  assert.deepEqual([...two.off].sort(), ['bin', 'dec']);
});

test('ticking a column the width has no room for shows it anyway', () => {
  const c = setColumn(allColumns(), 'bin', true, shownAt(NARROW));
  assert.deepEqual([...c.forced], ['bin']);
  assert.ok(shownAt(NARROW)(c).has('bin'));
  // Unticking it lets it go again (and keeps it off).
  const back = setColumn(c, 'bin', false, shownAt(NARROW));
  assert.deepEqual([...back.forced], []);
  assert.deepEqual([...back.off], ['bin']);
});

test('ticking a column there is room for does not force it', () => {
  const c = setColumn(choice(['dec']), 'dec', true, shownAt(WIDE));
  assert.deepEqual([...c.off], []);
  assert.deepEqual([...c.forced], []);
});

test('the grid names every column\'s line, shown or not', () => {
  const cols: Column[] = [...COLUMNS, { key: 'tag', px: 56 }];
  assert.equal(gridTemplate(cols, new Set(['rn', 'hex', 'dec', 'bin', 'tag'])),
    '[rn] 7ch [hex] 10.5ch [dec] 10.5ch [bin] 28.5ch [tag] 56px [rest] minmax(0, 1fr)');
  // Dec and the tag hidden: their lines fall on the next column's.
  assert.equal(gridTemplate(cols, new Set(['rn', 'hex', 'bin'])),
    '[rn] 7ch [hex] 10.5ch [dec bin] 28.5ch [tag rest] minmax(0, 1fr)');
  // Room for an alias widens the name column.
  assert.equal(gridTemplate(cols, new Set(['rn', 'hex']), 20),
    '[rn] calc(7ch + 20px) [hex] 10.5ch [dec bin tag rest] minmax(0, 1fr)');
});

test('an alias gets the room it needs past the name column, never more than is spare', () => {
  // $t0 (3 characters) and "sum" in a 7ch column: 3ch + chip + 3 x 0.85ch = 7.55ch + 14 px.
  const need = Math.ceil(3 * CH + 14 + 3 * CH * 0.85 - 7 * CH);
  assert.equal(aliasRoom(1000, [{ name: 3, alias: 3 }], 7, CH), need);
  assert.equal(aliasRoom(5, [{ name: 3, alias: 3 }], 7, CH), 5);
  assert.equal(aliasRoom(1000, [], 7, CH), 0);
  // A short one that fits in the column's own slack needs nothing.
  assert.equal(aliasRoom(1000, [{ name: 2, alias: 1 }], 7, CH), 0);
  // The longest of them decides.
  assert.equal(aliasRoom(1000, [{ name: 3, alias: 1 }, { name: 5, alias: 16 }], 7, CH),
    Math.ceil(5 * CH + 14 + 16 * CH * 0.85 - 7 * CH));
});

test('pinned registers keep the order they were starred in', () => {
  let pins: string[] = [];
  pins = togglePin(pins, '$t3');
  pins = togglePin(pins, '$a0');
  pins = togglePin(pins, '$sp');
  assert.deepEqual(pins, ['$t3', '$a0', '$sp']);
  pins = togglePin(pins, '$a0');
  assert.deepEqual(pins, ['$t3', '$sp']);
  pins = togglePin(pins, '$a0');
  assert.deepEqual(pins, ['$t3', '$sp', '$a0'], 'starred again: last');
});

test('an alias is trimmed, one line, at most 16 characters; empty is none', () => {
  assert.equal(cleanAlias('  a  '), 'a');
  assert.equal(cleanAlias('total\tsum\n'), 'total sum');
  assert.equal(cleanAlias('   '), '');
  assert.equal(cleanAlias('abcdefghijklmnopqrstuvwxyz'), 'abcdefghijklmnop');
  assert.equal([...cleanAlias('abcdefghijklmnopqrstuvwxyz')].length, ALIAS_MAX);
  // Cut at 16 whole characters: no space left at the end, no half of a pair.
  assert.equal(cleanAlias('abcdefghijklmno pq'), 'abcdefghijklmno');
  assert.equal(cleanAlias('😀'.repeat(20)), '😀'.repeat(16));
  assert.equal(cleanAlias('합계 sum'), '합계 sum');
});

test('setting an alias: a new map, empty removes it', () => {
  const a = withAlias(new Map(), '$t0', ' a ');
  assert.deepEqual([...a], [['$t0', 'a']]);
  const b = withAlias(a, '$t0', '');
  assert.deepEqual([...b], []);
  assert.deepEqual([...a], [['$t0', 'a']], 'the old map is left as it was');
  assert.deepEqual([...withAlias(a, 'x10', 'n')], [['$t0', 'a'], ['x10', 'n']]);
});
