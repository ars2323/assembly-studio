/* The Inspector: one instruction taken apart, as the Qt build draws it
   (QtSpim/edu/edu_instruction_inspector.cpp): a head (the instruction, its
   format, its source line, word and address); the word as thirty-two bits,
   MSB on the left, grouped into its fields, each with its name and what it
   means under it; then what the instruction does (core/explain.ts), and for
   a branch or a jump the sum that gives its destination.

   The pieces (inspectorHead, bitGrid, explanation) are shared
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
import { currentLang, onLang, tr } from '../i18n.ts';
import { INSPECTOR } from '../messages/inspector.ts';
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
    this.follow = headButton('Follow PC', tr(INSPECTOR.follow), () => this.onFollow());
    onLang(() => { this.follow.title = tr(INSPECTOR.follow); });
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
    // The note comes in both languages (Korean, then English).
    const note = instructionNoteLines(d, convention)[currentLang() === 'en' ? 1 : 0];
    // "Dest = PC + (offset×4) = 0x..." for a branch or a jump.
    const dest = instructionDetailLines(d, row.addr, row.disassembly, '', convention).slice(7);
    this.body.replaceChildren(
      inspectorHead(row, formatName(d.format)),
      bitGrid(fields),
      explanation(explain(d, general, row.addr, currentLang()), d.known,
        note ? h('div', { class: 'note' }, note) : null,
        dest.length ? h('pre', { class: 'dest mono' }, dest.join('\n')) : null));
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
