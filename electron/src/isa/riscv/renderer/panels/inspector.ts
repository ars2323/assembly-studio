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

   The head, the word, the sentence and the field table are the MIPS
   Inspector's pieces (renderer/app/panels/inspector.ts).

   It follows the program: after every step it shows the instruction at PC
   (the next to run).  Choosing a row in Text pins it to that instruction
   until "Follow PC" (or Esc). */

import { decode, formatName, immediateParts, type ImmediateParts, type InstructionField } from '../../core/decoder.ts';
import { explain } from '../../core/explain.ts';
import { hex32 } from '../../../../core/format.ts';
import { immediateLine, meaningOf, pieceName, pieceSource } from '../../core/instruction-text.ts';
import { code, codeText, h } from '../../../../renderer/app/dom.ts';
import { notice } from '../../../../renderer/app/notice.ts';
import { bitGrid, explanation, fieldTable, inspectorHead, prose, type FieldView } from '../../../../renderer/app/panels/inspector.ts';
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
      title: '명령 하나를 32비트로 나누어 보는 곳입니다',
      body: codeText('`F10` 키로 한 줄 실행하거나 Text 탭에서 명령을 누르면 그 명령이 여기에 나옵니다.'),
    })));
  }

  // `pinned`: chosen in Text (else the instruction at PC).  `x`: x0..x31 before it runs.
  show(row: TextRow, x: readonly number[], pinned: boolean): void {
    this.setMode(pinned ? row.addr : 'pc');
    this.body.classList.remove('is-empty');
    const d = decode(row.word);
    const format = formatName(d.format);
    const head = inspectorHead(row, format);
    if (!d.fields) {
      this.body.replaceChildren(head, explanation({
        title: `${format} format`,
        sentence: format === 'R4'
          ? '`fmadd.s` 같은 Fused multiply-add 명령의 R4 format은 Field로 나누어 보여 주지 않습니다.'
          : 'RV32 명령 형식 어디에도 맞지 않는 Word입니다.',
      }, false));
      return;
    }
    const parts = immediateParts(d.word);
    // Which piece of the immediate (1, 2 ...) a bit of the word is; 0: none.
    const pieceAt = (bit: number): number => 1 + (parts?.pieces.findIndex((p) => bit <= p.wordHigh && bit >= p.wordLow) ?? -1);
    const fields: FieldView[] = d.fields.map((f: InstructionField) => {
      const width = f.high - f.low + 1;
      return {
        name: f.name, high: f.high, low: f.low, width, cls: fieldClass(f.name),
        bits: f.value.toString(2).padStart(width, '0'),
        value: f.name === 'imm[11:0]' && parts ? String(parts.value) : String(f.value),
        meaning: meaningOf(f, d),
      };
    });
    const grid = bitGrid(fields, (f, i) => {
      const k = parts && f.cls === 'f-imm' ? pieceAt(f.high - i) : 0;
      return k ? `pk p${k}` : '';
    });
    const imm = immediateLine(d, parts);
    this.body.replaceChildren(head, grid, ...(parts ? [immediateRow(parts)] : []),
      explanation(explain(d, x, row.addr), d.name !== '', imm ? h('div', { class: 'note' }, prose(imm)) : null),
      fieldTable(fields));
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
    cells.push(box('iext', extend, '', String(sign).repeat(extend), `sign-extend: imm[${p.width - 1}]`,
      `imm[31:${p.width}]: copies of imm[${p.width - 1}], the sign bit`));
  }
  p.pieces.forEach((piece, i) => {
    const width = piece.immHigh - piece.immLow + 1;
    cells.push(box(`ipiece p${i + 1}`, width, range(piece.wordHigh, piece.wordLow), piece.value.toString(2).padStart(width, '0'),
      range(piece.immHigh, piece.immLow), `${pieceSource(piece)} → ${pieceName(piece)}`));
  });
  if (p.zeros > 0) cells.push(box('izero', p.zeros, '', '0'.repeat(p.zeros), range(p.zeros - 1, 0), `${pieceName({ immHigh: p.zeros - 1, immLow: 0 })}: always 0, not in the instruction`));
  return h('div', { class: 'immrow' },
    h('div', { class: 'imm-cap' }, h('span', { class: 'cap' }, 'Immediate'),
      h('span', { class: 'key' }, 'top: bit of the word · bottom: bit of imm', p.zeros ? ' · dashed: always 0' : '')),
    h('div', { class: 'bitgrid immgrid' }, ...cells));
}
