/* src/core/asx.ts: the .asx text, line by line, as docs/asx-format.md
   specifies it. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ASX_MAGIC, ASX_VERSION, asxTime, formatAsx, hex32, ZERO_RUN, type ExecImage } from '../../src/core/asx.ts';

const base: ExecImage = {
  isa: 'mips',
  endian: 'little',
  entry: 0x00400024,
  regs: [{ name: '$sp', value: 0x7ffff10c }, { name: '$gp', value: 0x10008000 }],
  symbols: [{ name: 'main', addr: 0x00400024 }, { name: 'result', addr: 0x10010000 }],
  text: { addr: 0x00400000, words: [0x8fa40000, 0x27a50004, 0x0c100009] },
  data: { addr: 0x10010000, bytes: new Uint8Array([0x2a, 0, 0, 0]) },
  source: 'lab04-ok.s',
  sourceSha256: 'ab'.repeat(32),
  producedBy: 'Assembly Studio 1.0.0',
  assembled: '2026-10-04T16:20+09:00',
};

test('the whole file', () => {
  assert.equal(formatAsx(base), [
    'ASX 1',
    'isa           mips',
    'source        lab04-ok.s',
    'source-sha256 ' + 'ab'.repeat(32),
    'produced-by   Assembly Studio 1.0.0',
    'assembled     2026-10-04T16:20+09:00',
    'endian        little',
    '',
    'entry         0x00400024',
    'reg $sp       0x7ffff10c',
    'reg $gp       0x10008000',
    '',
    'symbol main   0x00400024',
    'symbol result 0x10010000',
    '',
    '.text 0x00400000 words 3',
    '8fa40000',
    '27a50004',
    '0c100009',
    '',
    '.data 0x10010000 bytes 4',
    '2a 00 00 00',
    '',
  ].join('\n'));
});

test('magic and version, then the ISA', () => {
  assert.equal(`${ASX_MAGIC} ${ASX_VERSION}`, 'ASX 1');
  const lines = formatAsx({ ...base, isa: 'riscv', regs: [{ name: 'sp', value: 0x7fffeffc }, { name: 'gp', value: 0x10008000 }] }).split('\n');
  assert.deepEqual(lines.slice(0, 2), ['ASX 1', 'isa           riscv']);
  assert.ok(lines.includes('reg sp        0x7fffeffc'));
  assert.ok(lines.includes('reg gp        0x10008000'));
});

test('no symbols: no empty line for them; no data: no .data', () => {
  const out = formatAsx({ ...base, symbols: [], data: null });
  assert.match(out, /reg \$gp {7}0x10008000\n\n\.text 0x00400000 words 3\n8fa40000\n27a50004\n0c100009\n$/);
  assert.doesNotMatch(out, /\.data|symbol/);
});

test('words: a long zero run is counted in words, a short one is written', () => {
  const least = ZERO_RUN / 4;
  const words = [1, ...Array(least - 1).fill(0), 2, ...Array(least).fill(0), 3, ...Array(least + 5).fill(0)];
  const body = formatAsx({ ...base, text: { addr: 0x00400000, words }, data: null }).split('\n.text ')[1].trimEnd().split('\n');
  assert.deepEqual(body, [
    `0x00400000 words ${words.length}`,
    '00000001', ...Array(least - 1).fill('00000000'), '00000002',
    `zero ${least}`,
    '00000003',
    `zero ${least + 5}`,
  ]);
});

test('bytes: sixteen to a line, a long zero run counted in bytes', () => {
  const bytes = new Uint8Array(20 + ZERO_RUN + 1 + (ZERO_RUN - 1) + 1);
  for (let i = 0; i < 20; i++) bytes[i] = i + 1;
  bytes[20 + ZERO_RUN] = 0xff;           // after a long zero run
  bytes[bytes.length - 1] = 0x80;        // after a short one (written)
  const out = formatAsx({ ...base, data: { addr: 0x10010000, bytes } });
  const body = out.split('\n.data ')[1].trimEnd().split('\n');
  assert.deepEqual(body, [
    `0x10010000 bytes ${bytes.length}`,
    '01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10',
    '11 12 13 14',
    `zero ${ZERO_RUN}`,
    ['ff', ...Array(ZERO_RUN - 1).fill('00')].join(' '),
    '80',
  ]);
});

test('a trailing zero run, and addresses above 0x7fffffff', () => {
  const out = formatAsx({ ...base, entry: -0x7ffffe00, data: { addr: 0x10010000, bytes: new Uint8Array(ZERO_RUN) } });
  assert.ok(out.includes('entry         0x80000200\n'));
  assert.ok(out.endsWith(`.data 0x10010000 bytes ${ZERO_RUN}\nzero ${ZERO_RUN}\n`));
  assert.equal(hex32(-1), '0xffffffff');
});

test('asxTime: local time to the minute, with its offset', () => {
  const at = new Date(2026, 9, 4, 7, 5, 59);
  const s = asxTime(at);
  assert.match(s, /^2026-10-04T07:05[+-]\d\d:\d\d$/);
  // The same instant, to the minute.
  assert.equal(new Date(s).getTime(), new Date(2026, 9, 4, 7, 5).getTime());
});
