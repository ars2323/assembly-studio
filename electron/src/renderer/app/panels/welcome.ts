/* The first screen: the mark, the product's name and two ways in -- the
   tutorial program, or straight to work (a new file, or one from disk).  No
   recent files: nothing of a session is kept (lab PCs are shared).

   Both steps have the same shape: the card has a fixed width, each choice a
   fixed size with its line break written in, and the "← 처음으로" row is
   there in both (hidden in the first), so going from one step to the other
   moves nothing but the words.  Behind the card, the same for both steps:
   the circuit board (../../startfield/), which a step never restarts.

   The card is the chip.  It carries CHIP_ATTR, which is how the board finds
   the rectangle to put its pins on -- there is no second drawn square under
   it, so the two can never disagree.

   The light that runs round the buttons and across the name is driven from
   here, off the board's own clock (start.onFrame) and its own seed
   (spark.ts), and drawn by the card's own CSS.  Not by a canvas over the
   card: the card is opaque, so that canvas would have to cover the buttons,
   and its pixels and the buttons' boxes would part company at every font
   load and every resize.  An element's own box cannot come adrift from
   itself. */

import { brand } from '../../../brand.ts';
import { asset, h, icon } from '../dom.ts';
import { CHIP_ATTR, startfield } from '../../startfield/index.ts';
import { offsets, SEED, type SparkName, sparkAt } from './spark.ts';

/** The product name on the package.  The seed the board is grown from is in
    spark.ts, with what else is derived from it. */
export const WORDMARK = brand.wordmark;
export { SEED };

export type Isa = 'mips' | 'riscv';
export const ISA_NAME: Record<Isa, string> = { mips: 'MIPS', riscv: 'RISC-V' };

export interface WelcomeEvents {
  tutorial(): void;
  newFile(): void;
  openFile(): void;
  /** The window is for one ISA (the page's ?isa=); choosing the other
      changes the engine and loads the page again (src/main/main.ts). */
  selectIsa(isa: Isa): Promise<unknown>;
}

/* The page's ISA, and whether it was just chosen (?picked: the page was
   loaded again for it, so the first screen goes on from the ISA's step and
   the board does not grow a second time). */
const query = new URLSearchParams(location.search);
const pageIsa: Isa = query.get('isa') === 'riscv' ? 'riscv' : 'mips';
const picked = query.has('picked');

function action(label: string, ic: string, onClick: () => void, main = false): HTMLElement {
  const b = h('button', { class: `action${main ? ' main' : ''}`, type: 'button' }, icon(ic), h('b', {}, label));
  b.addEventListener('click', onClick);
  return b;
}

export function welcome(events: WelcomeEvents): { root: HTMLElement; show(on: boolean): void } {
  const actions = h('div', { class: 'actions' });
  const back = h('button', { class: 'linkbtn back', type: 'button' });
  let backTo = () => {};
  back.addEventListener('click', () => backTo());
  /* Three steps on one card: the ISA, then straight to work or the
     tutorial, then a new file or one to open.  The first choice of each is
     the one most of them want, at the top; the hierarchy of the two --
     border, words, ground, and the light each carries -- says which is which. */
  const choose = async (isa: Isa) => {
    if (isa === pageIsa) { first(); return; }
    actions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    await events.selectIsa(isa); // the page is replaced
  };
  const zero = () => {
    actions.replaceChildren(
      action('MIPS', 'cpu', () => void choose('mips'), true),
      action('RISC-V', 'cpu', () => void choose('riscv')));
    back.style.visibility = 'hidden';
  };
  const first = () => {
    actions.replaceChildren(
      action('바로 시작', 'play', second, true),
      action('튜토리얼 보기', 'circle-question-mark', events.tutorial));
    back.textContent = `← ${ISA_NAME[pageIsa]} · ISA 다시 고르기`;
    back.style.visibility = 'visible';
    backTo = zero;
  };
  const second = () => {
    actions.replaceChildren(
      action('새 파일', 'file-plus', events.newFile, true),
      action('파일 열기', 'folder-open', events.openFile));
    back.textContent = '← 처음으로';
    back.style.visibility = 'visible';
    backTo = first;
    (actions.firstElementChild as HTMLElement).focus();
  };
  if (picked) first(); else zero();
  // The seed is a constant: the same board every start, on every machine.
  // After an ISA was chosen the board is already grown (20 s is past it).
  const start = startfield({ seed: SEED, from: picked ? 20_000 : 0 });

  /* Four things, down the middle of the die frame: the mark, the product's
     name, and the two ways in.  The mark is the top bar's own file
     (brand.mark, a vector, so it is sharp at any size) in its own colours. */
  const title = h('span', { class: 'wtitle', 'data-text': WORDMARK }, WORDMARK);
  const card = h('div', { class: 'wcard', [CHIP_ATTR]: '' },
    h('div', { class: 'wstack' },
      h('img', { class: 'wlogo', src: asset(brand.mark), alt: '' }),
      title,
      h('div', { class: 'wbody' }, actions, back)));

  /* The light, put on the elements as custom properties every frame of the
     board's clock.  Which element is which is by its place, not by its
     words: the first choice is always the one being pushed. */
  const phase = offsets(SEED);
  const put = (el: HTMLElement | null, name: SparkName, t: number): void => {
    if (!el) return;
    const { amp, at } = sparkAt(name, t, phase[name]);
    el.style.setProperty('--sp-amp', amp.toFixed(3));
    el.style.setProperty('--sp-at', at.toFixed(4));
  };
  const clear = (el: HTMLElement | null): void => {
    if (!el) return;
    el.style.removeProperty('--sp-amp');
    el.style.removeProperty('--sp-at');
  };
  const lit = (): (HTMLElement | null)[] => [title, ...actions.querySelectorAll<HTMLElement>('.action')];
  /* Turned down, nothing of it runs: the board draws its finished state once
     and the card is left at rest, not frozen half way through a pass.  A
     time before the opening is a time nothing is lit at. */
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  start.onFrame((t) => {
    const now = calm.matches ? -1 : t;
    put(title, 'title', now);
    const buttons = actions.querySelectorAll<HTMLElement>('.action');
    put(buttons[0] ?? null, 'primary', now);
    put(buttons[1] ?? null, 'secondary', now);
  });

  return {
    root: h('div', { class: 'welcome' }, start.root, card),
    show(on: boolean) {
      start.show(on);
      if (!on) for (const el of lit()) clear(el);   // nothing of it left off the screen
    },
  };
}
