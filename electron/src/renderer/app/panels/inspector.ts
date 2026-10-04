/* The Inspector: one instruction taken apart, as the Qt build draws it
   (QtSpim/edu/edu_instruction_inspector.cpp): a head (the instruction, its
   format, its source line, word and address); the word as thirty-two bits,
   MSB on the left, grouped into its fields; then what the instruction does,
   with the values it will use, and for a branch or a jump the sum that
   gives its destination; last, the fields as a table, one row each, its
   chip in the field's colour from the word above.

   The pieces (inspectorHead, bitGrid, explanation, fieldTable) are shared
   with the RISC-V Inspector (isa/riscv/renderer/panels/inspector.ts).

   It follows the program: after every step it shows the instruction at PC
   (the next to run).  Choosing a row in Text pins it to that instruction
   until "Follow PC" (or Esc).  Before the first step, with nothing
   chosen, it says how to fill it. */

import { decode, formatName, type BranchConvention } from '../../../core/decoder.ts';
import { explain, type Explanation } from '../../../core/explain.ts';
import { hex32 } from '../../../core/format.ts';
import { instructionDetailLines, instructionNoteLines, meaningOf } from '../../../core/instruction-text.ts';
import { code, codeText, h } from '../dom.ts';
import { notice } from '../notice.ts';
import type { TextRow } from '../logic/machine.ts';
import { headButton, panelHead, type Head } from '../ui.ts';

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
      title: 'No instruction yet',
      body: codeText('Step with `F10`, or click an instruction in the Text tab, to see its 32 bits here.'),
    })));
  }

  // `pinned`: chosen in Text (else the instruction at PC).
  // `convention`: how the machine was assembled (Settings > delayed branches).
  show(row: TextRow, general: readonly number[], pinned: boolean, convention: BranchConvention = 'SpimNoDelaySlot'): void {
    this.setMode(pinned ? row.addr : 'pc');
    this.body.classList.remove('is-empty');
    const d = decode(row.word, row.addr, convention);
    const fields: FieldView[] = d.fields.map((f) => {
      const width = f.high - f.low + 1;
      return {
        name: f.name, high: f.high, low: f.low, width, cls: `f-${f.name}`,
        bits: f.value.toString(2).padStart(width, '0'),
        value: f.name === 'immediate' ? String(d.simm) : String(f.value),
        meaning: meaningOf(f, d),
      };
    });
    const note = instructionNoteLines(d, convention)[0];
    // "Dest = PC + (offset×4) = 0x..." for a branch or a jump.
    const dest = instructionDetailLines(d, row.addr, row.disassembly, '', convention).slice(7);
    this.body.replaceChildren(
      inspectorHead(row, formatName(d.format)),
      bitGrid(fields),
      explanation(explain(d, general, row.addr), d.known,
        note ? h('div', { class: 'note' }, note) : null,
        dest.length ? h('pre', { class: 'dest mono' }, dest.join('\n')) : null),
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

/* ---- the pieces, shared with the RISC-V Inspector ---------------------- */

// One field of the word, as the views set it.
export interface FieldView {
  name: string; high: number; low: number; width: number;
  cls: string;      // its colour: "f-opcode" (app.css)
  bits: string;     // "100011"
  value: string;    // "35"; an immediate's signed value
  meaning: string;  // "lw", "$sp", "x4=8" ...; '' when the value says it all
}

// The format, then the instruction (the order of the Text tab's columns); under them its source line, word and address.
export function inspectorHead(row: { disassembly: string; source: string; word: number; addr: number }, format: string): HTMLElement {
  const item = (label: string, value: Node) => h('span', { class: 'iitem' }, h('span', { class: 'ilabel' }, label), value);
  return h('div', { class: 'ihead' },
    h('div', { class: 'ititle' }, h('span', { class: `badge b-${format}` }, `${format}-type`), code(row.disassembly, 'dis')),
    h('div', { class: 'imeta' },
      row.source ? item('Source', code(row.source, 'isrc')) : null,
      item('Word', code(hex32(row.word))),
      item('Address', code(hex32(row.addr)))));
}

// The word as 32 cells, one per bit, each field a coloured group.
// `bitClass`: an extra class for one bit (the RISC-V immediate's pieces).
export function bitGrid(fields: FieldView[], bitClass: (f: FieldView, i: number) => string = () => ''): HTMLElement {
  return h('div', { class: 'bitgrid' }, ...fields.map((f) =>
    h('div', { class: `fbox ${f.cls}`, style: `grid-column: span ${f.width}` },
      h('div', { class: 'franges mono' }, h('span', {}, String(f.high)), h('span', {}, f.high !== f.low ? String(f.low) : '')),
      h('div', { class: 'fbits mono', style: `grid-template-columns: repeat(${f.width}, 1fr)` },
        ...[...f.bits].map((b, i) => h('span', { class: `bit ${bitClass(f, i)}`.trim() }, b))),
      h('div', { class: 'fname' }, f.name),
      h('div', { class: 'fmean mono' }, f.meaning || f.value))));
}

// What the instruction does: its name and what the name stands for, the
// sentence, then what goes with it (a note, the destination's sum).
// `mnemonic`: the title is "name — expansion" (else a plain message).
export function explanation(e: Explanation, mnemonic: boolean, ...extra: (Node | null)[]): HTMLElement {
  const [name, expansion] = e.title.split(' — ');
  const title = mnemonic
    ? h('div', { class: 'etitle' }, code(name, 'mn'), expansion ? h('span', { class: 'ex' }, expansion) : null)
    : h('div', { class: 'etitle' }, h('span', { class: 'ex' }, e.title));
  return h('div', { class: 'explain' }, title,
    e.sentence ? h('div', { class: 'esent' }, prose(e.sentence)) : null, ...extra);
}

// Prose with `code` parts (codeText), where a hyphenated term stays on one
// line: "Sign-extend", never "Sign-" and "extend".
export function prose(text: string): DocumentFragment {
  const f = codeText(text);
  for (const node of [...f.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const parts = (node.textContent ?? '').split(/([A-Za-z]+-[A-Za-z]+)/);
    if (parts.length === 1) continue;
    node.replaceWith(...parts.map((p, i) => (i % 2 === 1 ? h('span', { class: 'nowrap' }, p) : p)));
  }
  return f;
}

// A field's bits, in groups of four from the right when there are more
// than eight ("0000 0000 0000 0011"): easier to read, and a long field
// (a jump's target) wraps between groups.
function binaryGroups(bits: string): HTMLElement {
  const groups: string[] = [];
  if (bits.length <= 8) groups.push(bits);
  else for (let end = bits.length; end > 0; end -= 4) groups.unshift(bits.slice(Math.max(0, end - 4), end));
  return h('div', { class: 'bin' }, ...groups.map((g) => h('span', {}, g)));
}

// A field's name or meaning, free to break after a "|" or "="
// ("imm[20|10:1|11|19:12]", "x4=0x0040003c") in a narrow Inspector, and
// nowhere else (and at its spaces).
function breakable(text: string): (string | HTMLElement)[] {
  return text.split(/(?<=[|=])/).flatMap((p, i) => (i ? [h('wbr'), p] : [p]));
}

// The fields, one row each: a chip in the colour of the field's group in
// the word; its bit range; its bits; its value; what the value means.  (A
// narrow Inspector sets the bit range under the chip instead: app.css.)
export function fieldTable(fields: FieldView[]): HTMLElement {
  const range = (f: FieldView) => (f.high !== f.low ? `${f.high}–${f.low}` : String(f.high));
  return h('table', { class: 'ftable' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Field', h('span', { class: 'sub' }, ' · Bits')), h('th', { class: 'fbits-col' }, 'Bits'),
      h('th', {}, 'Binary'), h('th', { class: 'num' }, 'Value'), h('th', {}, 'Meaning'))),
    h('tbody', {}, ...fields.map((f) => h('tr', {},
      h('td', { class: 'ffield' }, h('span', { class: `chip mono ${f.cls}` }, ...breakable(f.name)), h('span', { class: 'frange mono' }, range(f))),
      h('td', { class: 'fbits-col mono' }, range(f)),
      h('td', { class: 'fbin mono' }, binaryGroups(f.bits)),
      h('td', { class: 'fval mono num' }, f.value),
      h('td', { class: 'fmeaning mono' }, ...breakable(f.meaning))))));
}
