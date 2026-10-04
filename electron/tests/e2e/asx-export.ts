/* Export executable image (.asx) in both ISAs' windows, checked against
   what the window itself shows (docs/asx-format.md):

     xvfb-run -a -s '-screen 0 2400x1400x24' node tests/e2e/asx-export.ts <out-dir>

   For each ISA: lab04-ok.s, then a program with data, opened and
   assembled; the toolbar captured (toolbar-<isa>.png, 1280 wide, with
   lab04); the button pressed with the save dialog answered from here (its
   title, file name and filter checked), and the file read back:
     - every Text row's Encoding is the image's word at its address;
     - every word the Data tab shows of .data is the image's bytes there,
       and the image's data is all on screen (to the end of a trailing
       .space);
     - source-sha256 is the file's own;
     - the symbols include the program's labels (`result`, `main`), `main`
       is a Text row, and the entry is where the program starts;
     - the machine on screen then steps from its first instruction.
   The .asx files are left in <out-dir> (<name>-<isa>.asx). */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

import { launch, openAndAssemble, program as writeProgram, sample, side } from './harness.ts';

const out = path.resolve(process.argv[2] ?? 'build/asx');
mkdirSync(out, { recursive: true });

interface Parsed {
  header: Map<string, string>;
  symbols: Map<string, number>;
  text: { addr: number; words: number[] };
  data: { addr: number; bytes: number[] } | null;
}

// The reader docs/asx-format.md describes, as short as it can be.
function parseAsx(file: string): Parsed {
  const lines = readFileSync(file, 'utf8').split('\n');
  assert.equal(lines[0], 'ASX 1');
  const header = new Map<string, string>();
  const symbols = new Map<string, number>();
  let text: Parsed['text'] | null = null;
  let data: Parsed['data'] = null;
  let into: 'text' | 'data' | null = null;
  for (const line of lines.slice(1)) {
    if (line === '') continue;
    let m: RegExpExecArray | null;
    if ((m = /^\.text (0x[0-9a-f]{8}) words (\d+)$/.exec(line))) { text = { addr: Number(m[1]), words: [] }; into = 'text'; continue; }
    if ((m = /^\.data (0x[0-9a-f]{8}) bytes (\d+)$/.exec(line))) { data = { addr: Number(m[1]), bytes: [] }; into = 'data'; continue; }
    if (into === 'text') {
      if ((m = /^zero (\d+)$/.exec(line))) text!.words.push(...Array(Number(m[1])).fill(0));
      else { assert.match(line, /^[0-9a-f]{8}$/); text!.words.push(parseInt(line, 16)); }
      continue;
    }
    if (into === 'data') {
      if ((m = /^zero (\d+)$/.exec(line))) data!.bytes.push(...Array(Number(m[1])).fill(0));
      else data!.bytes.push(...line.split(' ').map((b) => parseInt(b, 16)));
      continue;
    }
    if ((m = /^symbol (\S+) +(0x[0-9a-f]{8})$/.exec(line))) { symbols.set(m[1], Number(m[2])); continue; }
    m = /^((?:reg )?\S+) +(.*)$/.exec(line);
    assert.ok(m, `header line: ${line}`);
    header.set(m[1], m[2]);
  }
  assert.ok(text);
  const counted = /words (\d+)/.exec(lines.find((l) => l.startsWith('.text'))!)![1];
  assert.equal(text.words.length, Number(counted));
  if (data) assert.equal(data.bytes.length, Number(/bytes (\d+)/.exec(lines.find((l) => l.startsWith('.data'))!)![1]));
  return { header, symbols, text, data };
}

// Every Text row (a virtual list: scrolled through), address -> Encoding.
async function textRows(page: Page): Promise<Map<number, number>> {
  const rows = await page.evaluate(async () => {
    const list = document.querySelector('.text') as HTMLElement;
    const seen: [string, string][] = [];
    const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    list.scrollTop = 0;
    await frames();
    for (let i = 0; i < 400; i++) {
      for (const r of list.querySelectorAll<HTMLElement>('.trow[data-addr]')) seen.push([r.dataset.addr!, r.querySelector('.word')!.textContent!]);
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 1) break;
      list.scrollTop += list.clientHeight / 2;
      await frames();
    }
    return seen;
  });
  return new Map(rows.map(([a, w]) => [parseInt(a, 16), parseInt(w, 16)]));
}

// The Data tab's .data words (hex), address -> word.
// `label`: one of the program's data labels, there once the tab shows this program.
async function dataWords(page: Page, label: string): Promise<Map<number, number>> {
  await page.locator('.textpanel .ptab', { hasText: 'Data' }).click();
  await page.locator('.dtags.dsec-data .dlabel', { hasText: label }).first().waitFor();
  const cells = await page.$$eval('.drow.dsec-data .dval[title]', (els) => els.map((e) => [e.getAttribute('title')!, e.textContent!.trim()]));
  // A run of zero words is one row: "0x10010000  ~ 0x1001000f · all zero".
  const runs = await page.$$eval('.drow.dzero.dsec-data', (els) => els.map((e) => [e.querySelector('.daddr')!.textContent!, e.querySelector('.dzerotext .mono')!.textContent!]));
  await page.locator('.textpanel .ptab', { hasText: 'Text' }).click();
  const words = new Map(cells.map(([a, v]) => [parseInt(a, 16), parseInt(v, 16)]));
  for (const [from, last] of runs) for (let a = parseInt(from, 16); a <= parseInt(last, 16); a += 4) words.set(a, 0);
  return words;
}

// lab04 (the samples), and a program whose data is not all zero, ending in a .space.
const DATA = (isa: 'mips' | 'riscv') => `        .data
msg:    ${isa === 'mips' ? '.asciiz' : '.string'} "Hello, asx!"
        .align 2
nums:   .word   1, -2, 0x12345678
bytes:  .byte   1, 2, 3
buf:    .space  8
        .text
        .globl  main
main:   la      ${isa === 'mips' ? '$a0' : 'a0'}, msg
        li      ${isa === 'mips' ? '$v0' : 'a7'}, 4
        ${isa === 'mips' ? 'syscall' : 'ecall'}
        li      ${isa === 'mips' ? '$v0' : 'a7'}, 10
        ${isa === 'mips' ? 'syscall' : 'ecall'}
`;
const programs = [
  { name: 'lab04-ok.s', from: { mips: 'tests/samples/lab04-ok.s', riscv: 'tests/riscv/samples/lab04-ok.s' }, symbols: ['main', 'result'] },
  { name: 'data-mix.s', text: DATA, symbols: ['main', 'msg', 'nums', 'bytes', 'buf'] },
] as const;

for (const isa of ['mips', 'riscv'] as const) {
  const r = await launch({ width: 1280, height: 800 }, { isa });
  const { page, app } = r;
  try {
    for (const prog of programs) {
      const file = 'from' in prog ? sample(r.dir, prog.from[isa]) : writeProgram(r.dir, prog.name, prog.text(isa));
      await openAndAssemble(r, file);
      const button = page.getByRole('button', { name: 'Export executable image (.asx)' });
      await button.waitFor({ state: 'visible' });
      assert.ok(await button.isEnabled(), `${isa}: the button is enabled once assembled`);
      if (prog.name === 'lab04-ok.s') await page.locator('.toolbar').screenshot({ path: path.join(out, `toolbar-${isa}.png`) });

      const stem = prog.name.replace(/\.s$/, '');
      const target = path.join(out, `${stem}-${isa}.asx`);
      await app.evaluate(({ dialog }, f) => {
        const g = globalThis as unknown as { saveAsked: unknown };
        dialog.showSaveDialog = (async (_win: unknown, options: unknown) => {
          g.saveAsked = options;
          return { canceled: false, filePath: f };
        }) as unknown as typeof dialog.showSaveDialog;
      }, target);
      await button.click();
      await page.locator('.status', { hasText: `as an executable image · ${path.basename(target)}` }).waitFor();
      const asked = await app.evaluate(() => (globalThis as unknown as { saveAsked: { title: string; defaultPath: string; filters: unknown } }).saveAsked);
      assert.equal(asked.title, 'Export executable image (.asx)');
      assert.equal(asked.defaultPath, path.join(r.dir, `${stem}.asx`));
      assert.deepEqual(asked.filters, [{ name: 'Executable image (*.asx)', extensions: ['asx'] }]);

      const img = parseAsx(target);
      assert.equal(img.header.get('isa'), isa);
      assert.equal(img.header.get('source'), prog.name);
      assert.equal(img.header.get('endian'), 'little');
      assert.equal(img.header.get('source-sha256'), createHash('sha256').update(readFileSync(file)).digest('hex'));

      await side(page, 'Run');
      const rows = await textRows(page);
      assert.ok(rows.size >= 5, `${isa}: ${rows.size} Text rows`);
      let compared = 0;
      for (const [addr, w] of rows) {
        const i = (addr - img.text.addr) / 4;
        assert.ok(i >= 0 && i < img.text.words.length, `${isa}: ${addr.toString(16)} is in the image`);
        assert.equal(img.text.words[i] >>> 0, w >>> 0, `${isa}: word at ${addr.toString(16)}`);
        compared++;
      }

      const shown = await dataWords(page, prog.symbols[1]);
      assert.ok(img.data, `${isa}: a .data section`);
      const d = img.data;
      let dataCompared = 0;
      for (const [addr, v] of shown) {
        const at = addr - d.addr;
        const b = (k: number) => (at + k >= 0 && at + k < d.bytes.length ? d.bytes[at + k] : 0); // beyond the image: zero
        assert.equal(((b(0) | (b(1) << 8) | (b(2) << 16) | (b(3) << 24)) >>> 0), v >>> 0, `${isa}: data word at ${addr.toString(16)}`);
        if (at >= 0 && at < d.bytes.length) dataCompared++;
      }
      assert.ok(dataCompared * 4 >= d.bytes.length, `${isa}: every image data byte is on screen (${dataCompared} words)`);

      for (const name of prog.symbols) assert.ok(img.symbols.has(name), `${isa} ${prog.name}: symbol ${name}`);
      const main = img.symbols.get('main')!;
      assert.ok(rows.has(main), `${isa}: main is a Text row`);
      const entry = Number(img.header.get('entry'));
      assert.equal(entry, isa === 'mips' ? main : 0x00400000);
      if (prog.name === 'lab04-ok.s') assert.equal(img.symbols.get('result'), 0x10010000);
      else {
        // To the end of buf (.space 8): allocated though zero.
        const end = img.symbols.get('buf')! + 8 - d.addr;
        assert.ok(d.bytes.length >= end, `${isa}: data reaches the end of buf (${d.bytes.length} bytes, ${end} wanted)`);
        assert.deepEqual(d.bytes.slice(0, 12), [...Buffer.from('Hello, asx!\0')]);
      }
      // The machine on screen was not touched: it steps from the start.
      await page.keyboard.press('F10');
      await page.locator('.status', { hasText: '1 step' }).waitFor();
      assert.match(await page.locator('.status').innerText(), new RegExp(`PC 0x${(img.text.addr + 4).toString(16).padStart(8, '0')}`));
      console.log(`${isa} ${prog.name}: ${compared} Text words and ${dataCompared} Data words match; ` +
        `data ${d.bytes.length} bytes; symbols ${[...img.symbols.keys()].join(' ')}; entry ${img.header.get('entry')}`);
    }
  } finally {
    await r.close();
  }
}
console.log(`ok: ${out}`);
