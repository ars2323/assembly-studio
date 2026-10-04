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
   itself.

   An update (src/main/updater.ts): at the real first start of a run the
   check is asked for at once, and the reveal waits for its answer (at most
   about 6 s).  With a newer release, the card shows that instead of the ISA
   step -- the update's version, a progress bar, the percentage and the
   megabytes -- then "Installing update…" for a moment, and the program
   quits, installs it and starts the new version.  No update, no answer, or
   a failed download: the ISA step, as ever. */

import { brand } from '../../../brand.ts';
import { h, icon, markImg } from '../dom.ts';
import { currentTheme, onTheme, THEME_FADE_MS, themeSwitch } from '../theme.ts';
import { langSwitch, onLang, tr } from '../i18n.ts';
import { WELCOME } from '../messages/welcome.ts';
import { CHIP_ATTR, startfield } from '../../startfield/index.ts';
import { offsets, SEED, type SparkName, sparkAt } from './spark.ts';
import { progressFill, progressText, type Progress } from '../logic/update-progress.ts';
import type { UpdateCheck } from '../../../main/updater.ts';

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

// `ic` null: the words alone (the ISA step: a name is all an ISA button needs).
function action(label: string, ic: string | null, onClick: () => void, main = false): HTMLElement {
  const b = h('button', { class: `action${main ? ' main' : ''}`, type: 'button' }, ic ? icon(ic) : null, h('b', {}, label));
  b.addEventListener('click', onClick);
  return b;
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// The name and the ISA step come up when the board is this far grown.
const REVEAL_AT = 0.5;
// A change of step: the buttons stay, their words go out over this long and the new ones come in.
const LABEL_OUT = 130;
// The update: the check is asked for once per run (sessionStorage, which a
// page loaded again keeps), and not waited for longer than this -- past the
// main process's own limit (updater.ts CHECK_TIMEOUT_MS).
const UPDATE_KEY = 'studio-update-checked';
const UPDATE_WAIT = 6_500;
// "Installing update…" is on the card this long before the program quits to install it.
const INSTALL_AFTER = 1_000;
// A failed download: its message is on the card this long, then the ISA step comes up.
const FAILED_FOR = 2_200;

/* Whether this page should ask: the real first start only -- not a page
   loaded for the other ISA (?then) or back from the work screen (?home) --
   and once per run. */
function firstLoad(): boolean {
  if (picked || home) return false;
  try {
    if (sessionStorage.getItem(UPDATE_KEY)) return false;
    sessionStorage.setItem(UPDATE_KEY, '1');
  } catch { /* no storage: this page asks */ }
  return true;
}

/* What the card shows instead of the ISA step while an update comes in: the
   version, a slim bar, the percentage and the megabytes; then that it is
   being installed; or that it failed.  As high as the step's two buttons,
   in their place, so the mark and the name above it do not move. */
function updatePanel(): { root: HTMLElement; start(version: string): void; progress(p: Progress): void; installing(): void; failed(): void } {
  const line = h('div', { class: 'wupd-line' });
  const fill = h('i', {});
  const bar = h('div', { class: 'wupd-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
  const percent = h('span', {});
  const size = h('span', {});
  const root = h('div', { class: 'wupd', role: 'status', 'aria-live': 'polite' }, line, bar, h('div', { class: 'wupd-meta' }, percent, size));
  let version = '';
  let state: 'downloading' | 'installing' | 'failed' = 'downloading';
  let last: Progress = { percent: 0, transferred: 0, total: 0 };
  const draw = () => {
    line.textContent = state === 'downloading' ? tr(WELCOME.update.downloading, version)
      : state === 'installing' ? tr(WELCOME.update.installing) : tr(WELCOME.update.failed);
    const at = state === 'installing' ? 100 : progressFill(last);
    fill.style.width = `${at}%`;
    bar.setAttribute('aria-valuenow', String(at));
    const text = progressText(state === 'installing' ? { ...last, percent: 100, transferred: last.total } : last);
    percent.textContent = text.percent;
    size.textContent = text.size;
    root.dataset.state = state;
  };
  onLang(draw);
  return {
    root,
    start(v) { version = v; draw(); },
    progress(p) { if (state === 'downloading') { last = p; draw(); } },
    installing() { state = 'installing'; draw(); },
    failed() { state = 'failed'; draw(); },
  };
}

export function welcome(events: WelcomeEvents): { root: HTMLElement; show(on: boolean): void } {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const actions = h('div', { class: 'actions' });
  // The way back: an arrow in the die frame's top-left corner, on the steps after the first.
  // In the opposite corner, the ISA chosen, quietly.
  const isaTag = h('span', { class: 'wisa' });
  // The version, quietly, in the middle of the bottom edge: there from the first frame, no About needed.
  const version = h('span', { class: 'wver' });
  void window.app?.about().then((info) => { version.textContent = `v${info.version}`; }, () => {});
  const back = h('button', { class: 'wback', type: 'button' }, icon('arrow-left'));
  const nameBack = () => { back.title = tr(WELCOME.back); back.setAttribute('aria-label', back.title); };
  nameBack();
  const corner = h('div', { class: 'wcorner' }, back);
  let chosen: Isa = pageIsa;
  let backTo = () => {};
  back.addEventListener('click', () => backTo());

  /* Three steps on one card: the ISA, then straight to work or the
     tutorial, then a new file or one to open.  On the ISA step the two are
     equals (the same border, ground and light); on the others the first is
     the one most of them want, and the hierarchy of the two -- border,
     words, ground, and the light each carries -- says which is which.
     A change of step leaves the two buttons where they are -- every step has
     two, in the same places -- and changes only what is on them: the words
     fade out and the new ones in (show()). */
  let equal = false;                 // the two buttons carry the same light
  let swapping = 0;
  let now: 0 | 1 | 2 = 0;            // the step on the card
  const show = (step: 0 | 1 | 2, animate = true) => {
    if (animate && !calm.matches && actions.childElementCount > 0) {
      clearTimeout(swapping);
      actions.classList.remove('enter');
      actions.classList.add('out');
      swapping = window.setTimeout(() => { actions.classList.remove('out'); build(step); enter(); }, LABEL_OUT);
      return;
    }
    build(step);
    if (animate) enter();
  };
  const build = (step: 0 | 1 | 2, focus = true) => {
    now = step;
    if (step === 0) {
      actions.replaceChildren(
        action('MIPS', null, () => void choose('mips'), true),
        action('RISC-V', null, () => void choose('riscv'), true));
      backTo = () => {};
    } else if (step === 1) {
      actions.replaceChildren(
        action(tr(WELCOME.start), 'play', () => show(2), true),
        action(tr(WELCOME.tutorial), 'circle-question-mark', () => void go('tutorial')));
      backTo = () => show(0);
    } else {
      actions.replaceChildren(
        action(tr(WELCOME.newFile), 'file-plus', () => void go('new'), true),
        action(tr(WELCOME.openFile), 'folder-open', () => void go('open')));
      backTo = () => show(1);
    }
    equal = step === 0;
    corner.classList.toggle('on', step !== 0);
    isaTag.classList.toggle('on', step !== 0);
    isaTag.textContent = ISA_NAME[chosen];
    if (step === 2 && focus) (actions.firstElementChild as HTMLElement).focus();
  };
  // The other language (KO/EN): the same step's words again, at once, the focus where it was.
  onLang(() => {
    nameBack();
    const focused = [...actions.children].indexOf(document.activeElement as Element);
    build(now, false);
    if (focused >= 0) (actions.children[focused] as HTMLElement).focus();
  });
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
  // Night or day (theme.ts), and the other one at once when it is switched.
  const start = startfield({ seed: SEED, from: picked || home ? 20_000 : 0, theme: currentTheme(), fadeMs: THEME_FADE_MS });

  /* The mark, the product's name, and the two ways in, down the middle of
     the die frame.  The mark is the top bar's own file (brand.mark, a
     vector, so it is sharp at any size) in its own colours.
     At the first start the card holds the mark alone, large, while the board
     grows around it (.wcard.intro); when the board is half grown the mark
     rises and shrinks to its place and the name and the ISA step come up under it
     (reveal()).  A click on the card does it at once. */
  const title = h('span', { class: 'wtitle', 'data-text': WORDMARK }, WORDMARK);
  const update = updatePanel();
  const card = h('div', { class: 'wcard', [CHIP_ATTR]: '' },
    h('div', { class: 'wstack' },
      markImg('wlogo'),
      title,
      h('div', { class: 'wbody' }, actions, update.root)),
    corner, isaTag, h('div', { class: 'wlang' }, langSwitch()), version, h('div', { class: 'wtheme' }, themeSwitch()));
  // A switch of theme: the board cross-fades to the other look (start.setTheme),
  // over the same time the page's colours take (theme.ts).
  onTheme((t) => start.setTheme(t));
  let revealed = picked || home || calm.matches;
  if (!revealed) card.classList.add('intro');
  /* The update check, asked for at once; the reveal waits for its answer.
     Turned down (no opening), the ISA step is there at once and an update
     found takes its place if the user is still on it. */
  let answer: UpdateCheck | null = null;
  const asking = firstLoad() && window.app?.checkUpdate;
  if (asking) {
    void Promise.race([
      window.app.checkUpdate().catch((): UpdateCheck => ({ available: false })),
      wait(UPDATE_WAIT).then((): UpdateCheck => ({ available: false })),
    ]).then((a) => {
      answer = a;
      if (wanted) reveal();
      else if (revealed && a.available && now === 0) updating(a.version ?? '');
    });
  } else {
    answer = { available: false };
  }
  let wanted = false;
  const reveal = () => {
    if (revealed) return;
    wanted = true;
    if (!answer) return;              // the check's answer first
    revealed = true;
    card.classList.remove('intro');
    if (answer.available) updating(answer.version ?? '');
    else void wait(380).then(enter);
  };
  /* An update instead of the ISA step: downloaded with its progress on the
     card, then installed (the program quits and the new version starts).
     A failure: its message for a moment, then the ISA step. */
  function updating(version: string): void {
    card.classList.add('updating');
    update.start(version);
    centre();
    window.app.onUpdateProgress((p) => update.progress(p));
    window.app.onUpdateReady(() => {
      update.installing();
      void wait(INSTALL_AFTER).then(() => window.app.installUpdate());
    });
    let failed = false;
    window.app.onUpdateError((message) => {
      if (failed) return;
      failed = true;
      console.error('update:', message);
      update.failed();
      void wait(FAILED_FOR).then(() => {
        card.classList.remove('updating');
        centre();
        enter();
      });
    });
    void window.app.downloadUpdate();
  }
  card.addEventListener('click', reveal);
  show(picked ? (then === 'tutorial' ? 1 : 2) : 0, home && !calm.matches);

  // The words on the buttons come in (a fade), the two one after the other; the buttons themselves do not move.
  function enter(): void {
    if (calm.matches) return;
    actions.classList.remove('enter');
    void actions.offsetWidth;
    actions.classList.add('enter');
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
    for (const el of [title, ...actions.children, update.root] as HTMLElement[]) {
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
    if (!revealed && t >= start.grownAt() * REVEAL_AT) reveal();
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
