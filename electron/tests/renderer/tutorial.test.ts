/* The tutorial's outline, both ISAs (src/renderer/app/tutorial/steps.ts,
   src/isa/riscv/renderer/tutorial-steps.ts): the same chapters and steps in
   the same order, each kind of step with what it needs; the example
   programs the steps are about (every line a step looks for is there,
   once, and the Korean and English copies are the same code); the keys a
   step lets through. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { FIRST } from '../../src/renderer/app/tutorial/common.ts';
import { keyOf, type Chapter } from '../../src/renderer/app/tutorial/engine.ts';
import { CHAPTERS as MIPS, LINES as MIPS_LINES } from '../../src/renderer/app/tutorial/steps.ts';
import { CHAPTERS as RISCV, LINES as RISCV_LINES } from '../../src/isa/riscv/renderer/tutorial-steps.ts';

const src = path.join(import.meta.dirname, '..', '..', 'src');

// The outline: chapter by chapter, each step's id (practice steps marked *).
const OUTLINE = [
  'welcome editor',
  'assemble* text pseudo registers',
  'step* changed stepback*',
  'radix pin* alias* inspect* bits',
  'data* store* stack',
  'breakpoint* run* reset* slow*',
  'console* undo* error* fix',
  'tools editing settings separators switches end',
];
const outline = (chapters: Chapter[]) => chapters.map((c) => c.steps.map((s) => `${s.id}${s.kind === 'practice' ? '*' : ''}`).join(' '));

test('both ISAs: the same chapters and steps, in the same order', () => {
  assert.deepEqual(outline(MIPS), OUTLINE);
  assert.deepEqual(outline(RISCV), OUTLINE);
  assert.deepEqual(MIPS.map((c) => c.title), RISCV.map((c) => c.title));
});

test('every step is what its kind needs', () => {
  for (const [isa, chapters] of [['mips', MIPS], ['riscv', RISCV]] as const) {
    const steps = chapters.flatMap((c) => c.steps);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, `${isa}: ids are unique`);
    assert.equal(steps.filter((s) => s.kind === 'end').length, 1, `${isa}: one end`);
    assert.equal(steps.at(-1)?.kind, 'end', `${isa}: the end is last`);
    for (const s of steps) {
      const at = `${isa} ${s.id}`;
      if (s.kind === 'practice') {
        // Told what to do, seen doing it, and done for the student on Skip.
        assert.ok(s.done && s.doing && s.skip, `${at}: done, doing and skip`);
      } else {
        assert.ok(!s.done && !s.skip && !s.result && !s.phases, `${at}: an explanation waits for nothing`);
      }
      assert.ok(s.file, `${at}: its example`);
    }
  }
});

test('the keys a step lets through: Shift+F10 is not F10', () => {
  const press = (key: string, mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) =>
    keyOf({ key, shiftKey: false, ctrlKey: false, metaKey: false, ...mods });
  assert.equal(press('F10'), 'F10');
  assert.equal(press('F10', { shiftKey: true }), 'Shift+F10');
  assert.equal(press('F5'), 'F5');
  assert.equal(press('s', { ctrlKey: true }), 'Ctrl+S');
  assert.equal(press('S', { ctrlKey: true }), 'Ctrl+S');
  assert.equal(press('s'), null);
  assert.equal(press('Enter'), null);
  // Only the steps that teach Step back let it through.
  const lets = (id: string) => [...MIPS, ...RISCV].flatMap((c) => c.steps).filter((s) => s.id === id)
    .every((s) => Array.isArray(s.keys) && s.keys.includes('Shift+F10'));
  assert.ok(lets('stepback') && lets('undo'));
  for (const s of [...MIPS, ...RISCV].flatMap((c) => c.steps)) {
    if (s.id !== 'stepback' && s.id !== 'undo') assert.ok(!(Array.isArray(s.keys) && s.keys.includes('Shift+F10')), s.id);
  }
});

// The code without its comments (the two languages differ only there).
const code = (text: string) => text.split('\n').map((l) => l.replace(/#.*$/, '').trimEnd());

for (const [isa, dir, lines] of [['mips', 'examples', MIPS_LINES], ['riscv', 'isa/riscv/examples', RISCV_LINES]] as const) {
  test(`${isa}: the examples, Korean and English, are the same code`, () => {
    for (const name of ['tutorial.s', 'tutorial-error.s']) {
      const ko = readFileSync(path.join(src, dir, name), 'utf8');
      let en: string;
      try { en = readFileSync(path.join(src, dir, 'en', name), 'utf8'); } catch { continue; } // (no English copy: the Korean is shown)
      assert.deepEqual(code(en), code(ko), `${isa} ${name}`);
      assert.ok(!/[가-힣]/.test(en), `${isa} en/${name}: no Hangul`);
    }
  });

  test(`${isa}: every line the steps look for is in the example`, () => {
    const text = readFileSync(path.join(src, dir, 'tutorial.s'), 'utf8').split('\n');
    const once = (re: RegExp) => text.filter((l) => re.test(l)).length;
    for (const [name, re] of Object.entries({ ...lines, FIRST })) {
      // SYSCALL / ECALL: the first of several (the one that prints msg).
      if (name === 'SYSCALL' || name === 'ECALL') assert.ok(once(re) >= 3, `${isa} ${name}`);
      else assert.equal(once(re), 1, `${isa} ${name}: ${re}`);
    }
    // In the order the tutorial goes through them.
    const at = (re: RegExp) => text.findIndex((l) => re.test(l));
    const order = [FIRST, lines.ADD, lines.SUB, lines.BIG, lines.SW, lines.LW, lines.PRINT, lines.READ];
    order.slice(1).forEach((re, i) => assert.ok(at(re) > at(order[i]), `${isa}: ${re} after ${order[i]}`));
  });
}
