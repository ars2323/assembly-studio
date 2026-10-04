/* The Inspector: one instruction taken apart -- the word as thirty-two
   bits, MSB on the left, grouped into its fields; under it one line per
   field; then what the instruction does, with the values it will use.

   RISC-V has six formats (R, I, S, B, U, J) and cuts its immediates into
   pieces scattered over the word.  Under the word, a second row puts the
   immediate together: each piece where it belongs (the same colour in the
   word above and in the row), the bits that are always 0 and not in the
   word (B and J's lowest, U's lower twelve), and the sign extension up to
   32 bits.  A word the decoder does not take apart (R4, the fused
   multiply-adds) shows its head and says so -- never a wrong picture.

   It follows the program: after every step it shows the instruction at PC
   (the next to run).  Choosing a row in Text pins it to that instruction
   until "Follow PC" (or Esc). */

import { decode, formatName, immediateParts, type ImmediateParts, type InstructionField } from '../../core/decoder.ts';
import { explain } from '../../core/explain.ts';
import { hex32 } from '../../../../core/format.ts';
import { immediateLine, meaningOf, pieceName, pieceSource } from '../../core/instruction-text.ts';
import { code, codeText, h } from '../../../../renderer/app/dom.ts';
import { notice } from '../../../../renderer/app/notice.ts';
import type { TextRow } from '../logic/machine.ts';
import { headButton, panelHead, type Head } from '../../../../renderer/app/ui.ts';

// "imm[11:0]" -> "imm": the field's colour (app.css .f-*).
export const fieldClass = (name: string): string => `f-${name.replace(/\[.*$/, '')}`;

export class Inspector {
  readonly root: HTMLElement;
  readonly head: Head;
  private readonly body: HTMLElement;
  private readonly follow: HTMLButtonElement;
  onFollow: () => void = () => {};

  constructor() {
    this.head = panelHead('Inspector');
    this.follow = headButton('Follow PC', '다시 PC 위치의 명령을 따라갑니다 (Esc)', () => this.onFollow());
    this.head.aside.append(this.follow);
    this.body = h('div', { class: 'pbody ibody' });
    this.root = h('section', { class: 'panel insp', 'aria-label': 'Inspector' }, this.head.root, this.body);
    this.guide();
  }

  // Nothing to show yet: what this panel is for, and how to get something into it.
  guide(): void {
    this.setMode(null);
    this.body.classList.add('is-empty');
    this.body.replaceChildren(h('div', { class: 'notice-host' }, notice({
      pose: 'sign', title: '명령 하나를 32비트로 나누어 보는 곳입니다',
      body: codeText('`F10` 키로 한 줄 실행하거나 Text 탭에서 명령을 누르면 그 명령이 여기에 나옵니다.'),
    })));
  }

  // `pinned`: chosen in Text (else the instruction at PC).  `x`: x0..x31 before it runs.
  show(row: TextRow, x: readonly number[], pinned: boolean): void {
    this.setMode(pinned ? row.addr : 'pc');
    this.body.classList.remove('is-empty');
    const d = decode(row.word);
    const format = formatName(d.format);
    const head = h('div', { class: 'ihead' },
      code(row.disassembly, 'dis'), h('span', { class: `badge b-${format}` }, format),
      row.source ? h('span', { class: 'isrc' }, 'Source ', code(row.source)) : null,
      h('span', { class: 'grow' }),
      h('span', { class: 'where' }, code(hex32(row.word)), ' · ', code(hex32(row.addr))));
    if (!d.fields) {
      this.body.replaceChildren(head, h('div', { class: 'explain later' },
        h('b', {}, `${format} 형식`), ' — ', codeText(format === 'R4'
          ? '부동소수점 곱셈-덧셈(`fmadd.s` 등)의 R4 형식은 비트로 나누어 보여 주지 않습니다.'
          : 'RV32 명령 형식 어디에도 맞지 않는 워드입니다.')));
      return;
    }
    const parts = immediateParts(d.word);
    // Which piece of the immediate (1, 2 ...) a bit of the word is; 0: none.
    const pieceAt = (bit: number): number => 1 + (parts?.pieces.findIndex((p) => bit <= p.wordHigh && bit >= p.wordLow) ?? -1);
    const fields = d.fields.map((f: InstructionField) => {
      const width = f.high - f.low + 1;
      return {
        name: f.name, high: f.high, low: f.low, width, cls: fieldClass(f.name),
        bits: f.value.toString(2).padStart(width, '0'),
        value: f.name === 'imm[11:0]' && parts ? String(parts.value) : String(f.value),
        meaning: meaningOf(f, d),
      };
    });
    // The word as 32 cells, one per bit, each field a coloured group.
    const grid = h('div', { class: 'bitgrid' }, ...fields.map((f) =>
      h('div', { class: `fbox ${f.cls}`, style: `grid-column: span ${f.width}` },
        h('div', { class: 'franges mono' }, h('span', {}, String(f.high)), h('span', {}, f.high !== f.low ? String(f.low) : '')),
        h('div', { class: 'fbits mono', style: `grid-template-columns: repeat(${f.width}, 1fr)` },
          ...[...f.bits].map((b, i) => {
            const k = parts && f.cls === 'f-imm' ? pieceAt(f.high - i) : 0;
            return h('span', { class: k ? `bit pk p${k}` : 'bit' }, b);
          })),
        h('div', { class: 'fname' }, f.name),
        h('div', { class: 'fmean mono' }, f.meaning || f.value))));
    const table = h('table', { class: 'ftable' },
      h('tr', {}, ...['Field', 'Bits', 'Binary', 'Value', 'Meaning'].map((t) => h('th', {}, t))),
      ...fields.map((f) => h('tr', {},
        h('td', {}, h('span', { class: `sw ${f.cls}` }), f.name),
        h('td', { class: 'mono', 'data-label': 'Bits' }, `${f.high}–${f.low}`), h('td', { class: 'mono', 'data-label': 'Binary' }, f.bits),
        h('td', { class: 'mono' }, f.value), h('td', { class: 'mono' }, f.meaning))));
    const e = explain(d, x, row.addr);
    const imm = immediateLine(d, parts);
    this.body.replaceChildren(head, grid, ...(parts ? [immediateRow(parts)] : []),
      h('div', { class: 'explain' }, h('b', {}, e.title), e.sentence ? ' — ' : '', codeText(e.sentence),
        imm ? h('div', { class: 'note' }, code(imm)) : null),
      table);
  }

  private setMode(mode: 'pc' | number | null): void {
    this.follow.hidden = typeof mode !== 'number';
    this.root.classList.toggle('pinned', typeof mode === 'number');
    this.head.setMeta(mode === null ? '' : mode === 'pc'
      ? h('span', { class: 'mode' }, 'Following PC')
      : h('span', { class: 'mode pin' }, 'Pinned ', code(hex32(mode))));
  }
}

/* The immediate put together, in the same 32 columns as the word: the sign
   extension (all but U), then each piece at its place in the immediate --
   above it the bit numbers of the word it came from, under it the bit
   numbers it has in the immediate -- then the bits that are always 0. */
export function immediateRow(p: ImmediateParts): HTMLElement {
  const range = (high: number, low: number) => (high === low ? String(high) : `${high}:${low}`);
  const box = (cls: string, width: number, top: string, bits: string, name: string, title: string) =>
    h('div', { class: `ibox ${cls}`, style: `grid-column: span ${width}`, title },
      h('div', { class: 'ifrom mono' }, top),
      h('div', { class: 'fbits mono', style: `grid-template-columns: repeat(${width}, 1fr)` }, ...[...bits].map((b) => h('span', { class: 'bit' }, b))),
      h('div', { class: 'iname mono' }, name));
  const cells: HTMLElement[] = [];
  const sign = (p.value >>> (p.width - 1)) & 1;
  const extend = p.signExtended ? 32 - p.width : 0;
  if (extend > 0) {
    cells.push(box('iext', extend, '', String(sign).repeat(extend), `부호 확장: imm[${p.width - 1}] 복사`,
      `imm[31:${p.width}]: imm[${p.width - 1}] (부호 비트)을 그대로 복사`));
  }
  p.pieces.forEach((piece, i) => {
    const width = piece.immHigh - piece.immLow + 1;
    cells.push(box(`ipiece p${i + 1}`, width, range(piece.wordHigh, piece.wordLow), piece.value.toString(2).padStart(width, '0'),
      range(piece.immHigh, piece.immLow), `${pieceSource(piece)} → ${pieceName(piece)}`));
  });
  if (p.zeros > 0) cells.push(box('izero', p.zeros, '', '0'.repeat(p.zeros), range(p.zeros - 1, 0), `${pieceName({ immHigh: p.zeros - 1, immLow: 0 })}: 늘 0이라 명령에 없음`));
  return h('div', { class: 'immrow' },
    h('div', { class: 'imm-cap' }, '즉시값 — 흩어진 조각을 제자리에 모으면 (위: 명령의 비트, 아래: 즉시값의 비트',
      p.zeros ? ', 점선: 늘 0이라 명령에 없는 비트)' : ')'),
    h('div', { class: 'bitgrid immgrid' }, ...cells));
}
