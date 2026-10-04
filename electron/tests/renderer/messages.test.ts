/* The message tables (src/renderer/app/messages/, core/lang.ts): every
   message is said in both languages, the same way (a string, the parts of
   a line, or a function of as many values), the English with no Hangul,
   and both name the same code (the `backticked` parts). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DIALOGS } from '../../src/renderer/app/messages/dialogs.ts';
import { INSPECTOR } from '../../src/renderer/app/messages/inspector.ts';
import { SETTINGS } from '../../src/renderer/app/messages/settings.ts';
import { CARD, CHAPTERS, MIPS, RISCV, STEPS } from '../../src/renderer/app/messages/tutorial.ts';
import { WELCOME } from '../../src/renderer/app/messages/welcome.ts';
import { brand } from '../../brands/generic/brand.ts';

const TABLES = { WELCOME, DIALOGS, SETTINGS, INSPECTOR, CARD, CHAPTERS, STEPS, MIPS, RISCV, brandAbout: { about: brand.about } };

type Said = string | (string | { key: string } | { click: string })[];
// Every message in a table, by its path ("STEPS.pin.doing").
function messages(node: unknown, at: string, out: [string, Record<string, unknown>][] = []): [string, Record<string, unknown>][] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) throw new Error(`${at}: not a table or a message`);
  const o = node as Record<string, unknown>;
  if ('ko' in o || 'en' in o) out.push([at, o]);
  else for (const [k, v] of Object.entries(o)) messages(v, `${at}.${k}`, out);
  return out;
}
const all = Object.entries(TABLES).flatMap(([name, t]) => messages(t, name));

// What a message says, with a few made-up values for a function's parameters.
function sayings(v: unknown): Said[] {
  if (typeof v !== 'function') return [v as Said];
  const n = (v as (...a: unknown[]) => Said).length;
  return [0, 1, 7].map((x) => (v as (...a: unknown[]) => Said)(...Array.from({ length: n }, () => x)));
}
const text = (s: Said): string => (typeof s === 'string' ? s : s.map((p) => (typeof p === 'string' ? p : 'key' in p ? p.key : p.click)).join(' '));
const code = (s: string): string[] => s.split('`').filter((_, i) => i % 2 === 1).sort();

test('every message has a Korean and an English one, of the same kind', () => {
  assert.ok(all.length > 100, `${all.length} messages`);
  for (const [at, m] of all) {
    assert.deepEqual(Object.keys(m).sort(), ['en', 'ko'], at);
    assert.equal(typeof m.ko, typeof m.en, at);
    assert.equal(Array.isArray(m.ko), Array.isArray(m.en), at);
    if (typeof m.ko === 'function') assert.equal((m.ko as () => void).length, (m.en as () => void).length, `${at}: parameters`);
  }
});

test('said in both: nothing empty, no Hangul in English, the same code', () => {
  for (const [at, m] of all) {
    const ko = sayings(m.ko).map(text);
    const en = sayings(m.en).map(text);
    ko.forEach((k, i) => {
      const e = en[i];
      assert.ok(k.trim() !== '' && e.trim() !== '', `${at}: empty`);
      assert.ok(!/[가-힣]/.test(e), `${at}: Hangul in English: ${e}`);
      assert.equal((e.match(/`/g) ?? []).length % 2, 0, `${at}: a backtick left open: ${e}`);
      assert.deepEqual(code(e), code(k), `${at}: not the same code\n${k}\n${e}`);
    });
  }
});
