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
export type Way = 'tutorial' | 'new' | 'open';
export const ISA_NAME: Record<Isa, string> = { mips: 'MIPS', riscv: 'RISC-V' };

export interface WelcomeEvents {
  tutorial(): void;
  newFile(): void;
  openFile(): void;
  /** The window is for one ISA (the page's ?isa=).  The first screen only
      remembers the ISA chosen; a way in (tutorial, new, open) with the other
      one changes the engine and loads that ISA's page, which goes on to do
      it (?then, src/main/main.ts). */
  selectIsa(isa: Isa, then: Way): Promise<unknown>;
}

/* The page's ISA, and whether it was loaded to go on with a way in chosen
   on the other ISA's first screen (?then: the work screen comes up at once;
   if the user comes back, it is to that step, with the board grown). */
const query = new URLSearchParams(location.search);
const pageIsa: Isa = query.get('isa') === 'riscv' ? 'riscv' : 'mips';
const then = query.get('then');
const picked = then !== null;
// ?home: back from the work screen (the title bar's mark): the ISA step at once, the board grown, no opening.
const home = query.has('home');

function action(label: string, ic: string, onClick: () => void, main = false): HTMLElement {
  const b = h('button', { class: `action${main ? ' main' : ''}`, type: 'button' }, icon(ic), h('b', {}, label));
  b.addEventListener('click', onClick);
  return b;
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export function welcome(events: WelcomeEvents): { root: HTMLElement; show(on: boolean): void } {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const actions = h('div', { class: 'actions' });
  // The way back: an arrow in the die frame's top-left corner, on the steps after the first.
  // In the opposite corner, the ISA chosen, quietly.
  const isaTag = h('span', { class: 'wisa' });
  const back = h('button', { class: 'wback', type: 'button', title: '뒤로', 'aria-label': '뒤로' }, icon('arrow-left'));
  const corner = h('div', { class: 'wcorner' }, back);
  let chosen: Isa = pageIsa;
  let backTo = () => {};
  back.addEventListener('click', () => backTo());

  /* Three steps on one card: the ISA, then straight to work or the
     tutorial, then a new file or one to open.  On the ISA step the two are
     equals (the same border, ground and light); on the others the first is
     the one most of them want, and the hierarchy of the two -- border,
     words, ground, and the light each carries -- says which is which.
     Every change of step is marked by a burst of white light (sparkle()). */
  let equal = false;                 // the two buttons carry the same light
  const show = (step: 0 | 1 | 2, animate = true) => {
    if (step === 0) {
      actions.replaceChildren(
        action('MIPS', 'cpu', () => void choose('mips'), true),
        action('RISC-V', 'cpu', () => void choose('riscv'), true));
      backTo = () => {};
    } else if (step === 1) {
      actions.replaceChildren(
        action('바로 시작', 'play', () => show(2), true),
        action('튜토리얼 보기', 'circle-question-mark', () => void go('tutorial')));
      backTo = () => show(0);
    } else {
      actions.replaceChildren(
        action('새 파일', 'file-plus', () => void go('new'), true),
        action('파일 열기', 'folder-open', () => void go('open')));
      backTo = () => show(1);
    }
    equal = step === 0;
    corner.classList.toggle('on', step !== 0);
    isaTag.classList.toggle('on', step !== 0);
    isaTag.textContent = ISA_NAME[chosen];
    if (animate) { enter(); sparkle(); }
    if (step === 2) (actions.firstElementChild as HTMLElement).focus();
  };
  // The ISA is only remembered here: nothing is loaded or switched yet.
  const choose = (isa: Isa) => { chosen = isa; show(1); };
  /* A way in.  With the page's own ISA, at once.  With the other, the first
     screen fades to the dark the window already is, the engine is changed
     and that ISA's page comes up doing the same (?then, app.ts), fading in. */
  const go = async (way: Way) => {
    if (chosen === pageIsa) {
      if (way === 'tutorial') events.tutorial(); else if (way === 'new') events.newFile(); else events.openFile();
      return;
    }
    actions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    document.body.classList.add('leaving');
    if (!calm.matches) await wait(260);
    await events.selectIsa(chosen, way);
  };

  // The seed is a constant: the same board every start, on every machine.
  // After an ISA was chosen the board is already grown (20 s is past it).
  const start = startfield({ seed: SEED, from: picked || home ? 20_000 : 0 });

  /* The mark, the product's name, and the two ways in, down the middle of
     the die frame.  The mark is the top bar's own file (brand.mark, a
     vector, so it is sharp at any size) in its own colours.
     At the first start the card holds the mark alone, large, while the board
     grows around it (.wcard.intro); when the board has grown the mark rises
     and shrinks to its place and the name and the ISA step come up under it
     (reveal()).  A click on the card does it at once. */
  const title = h('span', { class: 'wtitle', 'data-text': WORDMARK }, WORDMARK);
  const fx = h('div', { class: 'wfx', 'aria-hidden': 'true' });
  const card = h('div', { class: 'wcard', [CHIP_ATTR]: '' },
    h('div', { class: 'wstack' },
      h('img', { class: 'wlogo', src: asset(brand.mark), alt: '' }),
      title,
      h('div', { class: 'wbody' }, actions)),
    corner, isaTag, fx);
  let revealed = picked || home || calm.matches;
  if (!revealed) card.classList.add('intro');
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    card.classList.remove('intro');
    void wait(380).then(() => { enter(); sparkle(); });
  };
  card.addEventListener('click', reveal);
  show(picked ? (then === 'tutorial' ? 1 : 2) : 0, home && !calm.matches);

  // The buttons come in (a short rise out of a white glow), the two one after the other.
  function enter(): void {
    if (calm.matches) return;
    actions.classList.remove('enter');
    void actions.offsetWidth;
    actions.classList.add('enter');
  }
  /* A burst of white light over the buttons, and a few sparks that flare
     and fade around them.  CSS animations that end (no infinite one: the
     capture tool freezes them); the sparks are removed with the next burst. */
  function sparkle(): void {
    if (calm.matches) return;
    fx.replaceChildren();
    fx.classList.remove('burst');
    void fx.offsetWidth;
    fx.classList.add('burst');
    const c = card.getBoundingClientRect();
    const a = actions.getBoundingClientRect();
    if (c.width === 0 || a.width === 0) return;
    for (let i = 0; i < 16; i += 1) {
      const x = a.left - c.left - 24 + Math.random() * (a.width + 48);
      const y = a.top - c.top - 22 + Math.random() * (a.height + 44);
      const size = 2 + Math.random() * 3;
      fx.append(h('span', { class: 'spark', style: `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--s:${size.toFixed(1)}px;--d:${Math.round(Math.random() * 260)}ms` }));
    }
  }

  /* The column centred by what can be SEEN, not by its boxes.  The flex
     column centres the boxes, and the mark is a picture whose own
     transparent margin is part of its box.  So: the ink's top and bottom --
     the mark's from its alpha, the name's and the two buttons' from their
     boxes -- measured inside the column, and the column moved by what puts
     their middle on the die frame's.  Measured by offsets, so neither the
     move already made nor the intro's transforms enter it.  A step does not
     centre again: every step holds the same ink (the mark, the name, two
     buttons of one height), so the move made for one is the others'.
     The same measure gives the intro its start: how far the mark is from
     the frame's middle (--intro-dy). */
  const stack = card.querySelector<HTMLElement>('.wstack')!;
  const logo = stack.querySelector<HTMLImageElement>('.wlogo')!;
  let logoInk: { top: number; bottom: number } | null = null;   // fractions of the mark's height
  const measureLogo = (): void => {
    if (!logo.complete || logo.naturalWidth === 0) return;
    const c = document.createElement('canvas');
    c.width = 256; c.height = Math.max(1, Math.round(256 * logo.naturalHeight / logo.naturalWidth));
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(logo, 0, 0, c.width, c.height);
    const a = g.getImageData(0, 0, c.width, c.height).data;
    let top = -1, bottom = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] > 8) { if (top < 0) top = y; bottom = y + 1; break; }
    }
    if (top >= 0) logoInk = { top: top / c.height, bottom: bottom / c.height };
  };
  const centre = (): void => {
    const height = stack.clientHeight;
    if (height === 0) return;                                  // not on the screen
    let top = Infinity, bottom = -Infinity;
    const ink = (t: number, b: number): void => { top = Math.min(top, t); bottom = Math.max(bottom, b); };
    // Offsets add up to the column's own (a transformed box in between is an offset parent too).
    const topIn = (el: HTMLElement): number => {
      let y = 0;
      for (let e: Element | null = el; e && e !== stack; e = (e as HTMLElement).offsetParent) y += (e as HTMLElement).offsetTop;
      return y;
    };
    const lt = topIn(logo), lh = logo.offsetHeight;
    ink(lt + lh * (logoInk?.top ?? 0), lt + lh * (logoInk?.bottom ?? 1));
    for (const el of [title, ...actions.children] as HTMLElement[]) {
      if (el.offsetHeight > 0) ink(topIn(el), topIn(el) + el.offsetHeight);
    }
    if (top === Infinity) return;
    const shift = Math.round(height / 2 - (top + bottom) / 2);
    stack.style.setProperty('--ink-shift', `${shift}px`);
    logo.style.setProperty('--intro-dy', `${Math.round(height / 2 - (lt + lh / 2 + shift))}px`);
  };
  logo.addEventListener('load', () => { measureLogo(); centre(); });
  void document.fonts?.ready.then(centre);
  new ResizeObserver(centre).observe(stack);

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
  start.onFrame((t) => {
    if (!revealed && t >= start.grownAt() + 250) reveal();
    const now = calm.matches || !revealed ? -1 : t;
    put(title, 'title', now);
    const buttons = actions.querySelectorAll<HTMLElement>('.action');
    put(buttons[0] ?? null, 'primary', now);
    put(buttons[1] ?? null, equal ? 'primary' : 'secondary', now);
  });

  return {
    root: h('div', { class: 'welcome' }, start.root, card),
    show(on: boolean) {
      start.show(on);
      if (!on) for (const el of lit()) clear(el);   // nothing of it left off the screen
    },
  };
}
