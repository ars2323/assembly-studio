/* The tutorial's engine, the same for both ISAs: the card, the dimming, the
   rings, the keys, practice and its result.  What it teaches is the ISA's
   own -- chapters of steps over its example programs (tutorial/steps.ts for
   MIPS, isa/riscv/renderer/tutorial-steps.ts for RISC-V), opened read-only
   and put away at the end.  Nothing of it is kept on disk: a new start of
   the program always begins at step 1; within one run, coming back offers
   to go on where it stopped.

   Three kinds of step:
     explain   points at something; [다음] (or →) goes on;
     practice  the student does the thing (Assemble, F10, a star, a click in
               the gutter...), the tutorial sees it happen (a Signal from the
               window); [건너뛰기] turns up after a few seconds and does it
               for them, so that the steps after have what they need.  A
               practice step whose result is something to see then points at
               that result on the same card (its `result` beat) and waits for
               [다음]: told to, done, shown what it did, and only then on.
               A step in `phases` does one thing after another on one card;
     end       the last card.
   A card is a title and a body; a practice step's body says what to do and,
   in its last sentence, what happens once it is done.  No [다음] on the
   card is the other sign that it waits.  Over the title: the chapter, the
   step's number and a bar that fills chapter by chapter.

   Two layers.  The panel a target is in is lit whole (the rest of the
   Registers around a row is what the student is learning), the toolbar for
   a button, the status bar for its words, a separator for itself; the rest
   of the window is dimmed.  Inside, a ring on each target says where to
   look.  Lit is not clickable: only the targets take a click.  The card
   never covers a ring: it stands right below what the step is about, or
   above it, or beside it (logic/placement.ts).  Before drawing, a step makes its targets really
   visible: the right side of a narrow window, the right tab, the line
   scrolled in, a column the width took away turned back on.

   Keys: → next, ← back, Esc stop (asks first); while a program runs Esc
   stops the program instead, and in a box (an alias) it is the box's.
   Keys a step does not ask for (F5 while it teaches F10; Shift+F10, Step
   back, is a key of its own) do nothing, so the machine stays where the
   next steps expect it. */

import { codeText, h, icon } from '../dom.ts';
import { onLang, tr, type Msg } from '../i18n.ts';
import { DIALOGS } from '../messages/dialogs.ts';
import { CARD } from '../messages/tutorial.ts';
import { progress } from '../logic/chapters.ts';
import { merge, place, type Rect } from '../logic/placement.ts';
import { ask } from '../panels/ask.ts';

export type Signal =
  | { kind: 'assembled'; ok: boolean }
  | { kind: 'stopped'; reason: string }
  | { kind: 'slow-ended' }
  | { kind: 'tab'; tab: 'text' | 'data' }
  | { kind: 'breakpoint'; line: number; on: boolean }
  | { kind: 'reset' }
  | { kind: 'goto'; line: number }
  | { kind: 'pin'; key: string; on: boolean }        // a star in Registers (on: pinned now)
  | { kind: 'alias'; key: string; alias: string }    // an alias given to a pinned register ('' : none)
  | { kind: 'back'; io: boolean }                    // a step back (io: it undid a call that printed or read)
  | { kind: 'select'; addr: number };                // a row of Text clicked (the Inspector on it)

export type Example = 'tutorial.s' | 'tutorial-error.s';

// The Registers panel's stars and aliases (panels/regtable.ts).
export interface RegisterMarks { pins: string[]; aliases: [string, string][] }

// What the window does for the tutorial (each ISA's app.ts).
export interface TutorialHost {
  narrow(): boolean;
  view(): 'editor' | 'run';
  showView(v: 'editor' | 'run'): void;
  open(name: Example): Promise<void>;       // read-only, not assembled
  example(): Example | null;                // the example on screen
  source(): string;
  assembled(): boolean;                     // the machine holds the Editor's program
  assemble(): Promise<boolean>;
  step(): Promise<void>;
  stepBack(): Promise<void>;
  runUntil(addr: number): Promise<void>;    // steps (quietly) until PC is `addr`
  run(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  setSpeed(s: 'fast' | 'slow'): Promise<void>;
  pc(): number | null;
  running(): boolean;
  finished(): boolean;
  waiting(): boolean;                       // the program waits for a line in the Console
  input(line: string): Promise<void>;       // a line typed in the Console (and Enter), the run gone on with it
  addressOfLine(line: number): number | null;
  labelAddress(name: string): number | null;
  pin(addr: number | null): void;           // the Inspector on that instruction (Text's row chosen); null: Follow PC
  quietPc(on: boolean): void;               // Text without its PC band (the pinned row alone)
  setTab(t: 'text' | 'data'): void;
  tab(): 'text' | 'data';
  breakpointLines(): number[];
  setBreakpointLine(line: number, on: boolean): Promise<void>;
  goToLine(line: number): void;             // what "Go to line N" does
  errorLine(): number | null;
  expandConsole(): boolean;                 // true: it was folded
  revealLine(n: number): void;
  lineRect(n: number): DOMRect | null;
  gutterRect(n: number): DOMRect | null;
  revealRegister(key: string): void;
  revealAddr(addr: number): void;
  showColumn(panel: 'regs' | 'text', key: string): 'already' | 'hidden' | 'shown';
  releaseColumn(panel: 'regs' | 'text', key: string): void;
  marks(): RegisterMarks;                   // the stars and aliases now
  setMarks(m: RegisterMarks): void;
  on(listener: (s: Signal) => void): void;
  close(): Promise<void>;                   // the example down, back to what was there
}

// An element, or a box inside one (an Editor line, a gutter cell): the
// element is what the box is cut to and what a click there must reach.
export type Target = Element | { rect: DOMRect | null; within: Element | null } | null | undefined;
export type Key = 'F5' | 'F10' | 'Shift+F10' | 'Ctrl+S';

// What a card says and points at.
export interface Beat {
  view?: 'editor' | 'run';                  // the side a narrow window shows
  tab?: 'text' | 'data';
  title(t: Tutorial): string;
  body(t: Tutorial): string;                // `code` in backticks
  targets(t: Tutorial): Target[];
  avoid?(t: Tutorial): Target[];            // not pointed at, but the card keeps off it
  reveal?(t: Tutorial): void;               // the targets into view
}

// What a practice step asks for, shown under its words: a key, something to click, or words.
export type Doing = string | { key: string } | { click: string };

export interface Step extends Beat {
  id: string;                               // for the tests and the walk-through
  kind: 'explain' | 'practice' | 'end';
  file?: Example;
  keys?: Key[] | ((t: Tutorial) => Key[]);  // the keys the step lets through
  phases?: number;                          // a practice step done in so many goes ('phase')
  doing?(t: Tutorial): Doing[];             // what it asks for, in short
  quietPc?: boolean;                        // Text shows the Inspector's row alone, not PC's band
  inspect?(t: Tutorial): number | null;     // the instruction the Inspector is pinned to
  prepare?(t: Tutorial): Promise<void>;     // the machine where the step needs it
  done?(t: Tutorial, s: Signal): 'next' | 'phase' | null;
  result?: Beat;                            // shown after `done`, before the next step
  skip?(t: Tutorial): Promise<void>;
  leave?(t: Tutorial): Promise<void>;
}

export interface Chapter { title: Msg; steps: Step[] }

const $ = (sel: string) => document.querySelector(sel);

export class Tutorial {
  readonly host: TutorialHost;
  readonly chapters: Chapter[];
  readonly steps: Step[];
  active = false;
  index = 0;
  phase = 0;
  result = false;                       // a practice step done: its result on the card, [다음] awaited
  private lastStep = 0;                 // this run of the program only
  private busy = false;
  private readonly forced: ['regs' | 'text', string][] = [];
  private shownEls: Element[] = [];     // made visible for this step (a star shown only on hover)
  private marksBefore: RegisterMarks | null = null;
  private root: HTMLElement | null = null;
  private dim: SVGPathElement | null = null;   // dark, but over the lit panels
  private block: SVGPathElement | null = null; // clicks, but on the targets
  private rings: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private arrow: HTMLElement | null = null;
  private entering = false;
  private skipTimer = 0;
  private skipShown = false;
  private frame = 0;
  private lastLayout = '';
  private lastReveal = 0;
  private advanceTimer = 0;
  // The last layout, for the tests: what is pointed at and where the card is.
  shown: { step: number; id: string; phase: number; result: boolean; targets: Rect[]; lit: Rect[]; card: Rect | null; hits: boolean[]; did: string[] }
    = { step: 0, id: '', phase: 0, result: false, targets: [], lit: [], card: null, hits: [], did: [] };
  // What this step had to do to show its targets (for the report and tests).
  did: string[] = [];

  constructor(host: TutorialHost, chapters: Chapter[]) {
    this.host = host;
    this.chapters = chapters;
    this.steps = chapters.flatMap((c) => c.steps);
    host.on((s) => this.signal(s));
    // The other language (i18n.ts): the card says the same again in it, where it stands.
    onLang(() => { if (this.active && this.card) this.renderCard(false); });
  }

  get step(): Step { return this.steps[this.index]; }

  // ---- lines and addresses of the example ------------------------------------

  line(re: RegExp): number {
    return this.host.source().split('\n').findIndex((l) => re.test(l)) + 1;
  }
  addr(re: RegExp): number {
    return this.host.addressOfLine(this.line(re)) ?? -1;
  }
  // PC has passed every instruction before `re`'s line (and the program has
  // not ended): if not, start over if need be and step there quietly.
  async atLeast(re: RegExp): Promise<void> {
    await this.notFinished();
    const pc = this.host.pc() ?? 0;
    if (pc < this.addr(re) || pc >= 0x80000000) await this.host.runUntil(this.addr(re));
  }
  // PC at `re`'s line's first instruction exactly, stepped to from the
  // start if need be: the instruction just before it is the last run (its
  // register the yellow row).
  async exactly(re: RegExp): Promise<void> {
    await this.notFinished();
    const pc = this.host.pc() ?? 0;
    if (pc === this.addr(re)) return;
    if (pc > this.addr(re) && pc < 0x80000000) await this.host.restart();
    await this.host.runUntil(this.addr(re));
  }
  // PC somewhere in [re, until): if not, from the start to `re`.
  async between(re: RegExp, until: RegExp): Promise<void> {
    await this.notFinished();
    const pc = this.host.pc() ?? 0;
    if (pc >= this.addr(until) && pc < 0x80000000) await this.host.restart();
    await this.atLeast(re);
  }
  // A program in the machine that can go on: not ended, not halfway through
  // reading a line (that run is the Console step's).
  async notFinished(): Promise<void> {
    if (!this.host.assembled()) await this.host.assemble();
    if (this.host.finished() || this.host.waiting()) await this.host.restart();
  }
  // Until `done` is true (or `ms` have gone by).
  async until(done: () => boolean, ms = 5000): Promise<void> {
    for (const end = Date.now() + ms; !done() && Date.now() < end;) await new Promise((r) => setTimeout(r, 30));
  }
  column(panel: 'regs' | 'text', key: string): void {
    const was = this.host.showColumn(panel, key);
    if (was !== 'already') this.forced.push([panel, key]);
    if (was === 'hidden') this.did.push(`column ${key} on`);
  }
  // An element drawn only on hover (a star, the alias chip), shown for this step.
  reveal(el: Element | null): void {
    if (!el || this.shownEls.includes(el)) return;
    el.classList.add('tut-show');
    this.shownEls.push(el);
  }
  private unreveal(): void {
    for (const el of this.shownEls.splice(0)) el.classList.remove('tut-show');
  }

  // ---- start and end ----------------------------------------------------------------

  async start(): Promise<void> {
    let from = 0;
    if (this.lastStep > 0) {
      const again = await ask({
        title: tr(DIALOGS.resume.title),
        body: tr(DIALOGS.resume.body, this.lastStep + 1),
        ok: tr(DIALOGS.resume.ok, this.lastStep + 1), cancel: tr(DIALOGS.resume.over),
      });
      from = again ? this.lastStep : 0;
    }
    this.active = true;
    document.body.classList.add('tutorial-on');
    this.marksBefore = this.host.marks();
    await this.host.open('tutorial.s');
    this.mount();
    await this.go(from);
  }

  async quit(): Promise<void> {
    if (this.busy) return;
    const sure = this.index === this.steps.length - 1 || await ask({
      title: tr(DIALOGS.quit.title),
      body: tr(DIALOGS.quit.body),
      ok: tr(DIALOGS.quit.ok), cancel: tr(DIALOGS.quit.cancel),
    });
    if (sure) await this.end();
  }

  async end(): Promise<void> {
    this.busy = true;
    try {
      await this.step.leave?.(this);
      if (this.host.running()) await this.host.stop();
      await this.host.setSpeed('fast');
      this.host.pin(null);
      this.host.quietPc(false);
      this.unreveal();
      for (const [panel, key] of this.forced.splice(0)) this.host.releaseColumn(panel, key);
      // The stars and aliases the tutorial set are its own: back to the student's.
      if (this.marksBefore) this.host.setMarks(this.marksBefore);
      this.marksBefore = null;
      this.lastStep = this.index === this.steps.length - 1 ? 0 : this.index;
      this.unmount();
      this.active = false;
      document.body.classList.remove('tutorial-on');
      await this.host.close();
    } finally {
      this.busy = false;
    }
  }

  // ---- steps ----------------------------------------------------------------------

  async go(i: number): Promise<void> {
    if (this.busy || i < 0 || i >= this.steps.length) return;
    this.busy = true;
    clearTimeout(this.skipTimer);
    clearTimeout(this.advanceTimer);
    try {
      if (this.active && i !== this.index) await this.step.leave?.(this);
      this.unreveal();
      this.index = i;
      this.phase = 0;
      this.result = false;
      this.did = [];
      const step = this.steps[i];
      if (step.file && this.host.example() !== step.file) await this.host.open(step.file);
      await step.prepare?.(this);
      // A step about one instruction pins the Inspector (and Text) to it:
      // its row is the one highlight there, not the PC's band as well.
      this.host.pin(step.inspect?.(this) ?? null);
      this.host.quietPc(!!step.quietPc);
      if (step.tab && this.host.tab() !== step.tab) { this.host.setTab(step.tab); this.did.push(`tab ${step.tab}`); }
      if (step.view && this.host.narrow() && this.host.view() !== step.view) { this.host.showView(step.view); this.did.push(`side ${step.view}`); }
      this.renderCard();
      this.lastLayout = '';
      this.lastReveal = 0;
      if (step.kind === 'practice') this.armSkip();
    } finally {
      this.busy = false;
    }
  }

  private armSkip(): void {
    this.skipShown = false;
    clearTimeout(this.skipTimer);
    this.skipTimer = window.setTimeout(() => { this.skipShown = true; this.renderCard(); }, 6000);
  }

  next(): void { void this.go(this.index + 1); }
  back(): void { void this.go(this.index - 1); }

  async skip(): Promise<void> {
    if (this.busy) return;
    const step = this.step;
    this.busy = true;
    try {
      await step.skip?.(this);
    } finally {
      this.busy = false;
    }
    // A step with phases goes on to its next phase, one with a result to
    // that, the others to the next step.
    if (step.phases && this.phase < step.phases - 1) { this.nextPhase(); return; }
    if (step.result) { this.showResult(); return; }
    this.next();
  }

  private nextPhase(): void {
    this.phase += 1;
    const side = this.step.view; // (the error step: the Assemble panel is under the Editor)
    if (side && this.host.narrow()) this.host.showView(side);
    this.renderCard();
    this.armSkip();
  }

  // The result beat: the card points at what the step just did and waits.
  private showResult(): void {
    const res = this.step.result!;
    this.result = true;
    clearTimeout(this.skipTimer);
    if (res.tab && this.host.tab() !== res.tab) { this.host.setTab(res.tab); this.did.push(`tab ${res.tab}`); }
    if (res.view && this.host.narrow() && this.host.view() !== res.view) { this.host.showView(res.view); this.did.push(`side ${res.view}`); }
    this.renderCard();
    this.lastLayout = '';
    this.lastReveal = 0;
  }

  private signal(s: Signal): void {
    if (!this.active || this.busy || this.result) return;
    const verdict = this.step.done?.(this, s) ?? null;
    if (verdict === 'phase') this.nextPhase();
    else if (verdict === 'next') {
      if (this.step.result) { this.showResult(); return; }
      const at = this.index;
      clearTimeout(this.advanceTimer);
      this.advanceTimer = window.setTimeout(() => { if (this.index === at && this.active) this.next(); }, 500);
    }
  }

  private keysNow(): Set<Key> {
    const k = this.step.keys;
    return new Set(typeof k === 'function' ? k(this) : k ?? []);
  }

  // The window's keys go through here first; true: taken (or refused).
  handleKey(e: KeyboardEvent): boolean {
    if (!this.active || document.querySelector('dialog[open]')) return false;
    const step = this.step;
    const inBox = !!(e.target as HTMLElement).closest?.('input, textarea');
    const key = keyOf(e);
    const take = () => { e.preventDefault(); e.stopPropagation(); return true; };
    if (e.key === 'Escape') {
      if (this.host.running() || inBox) return false; // Esc stops the program; a box's Esc is its own
      take();
      void this.quit();
      return true;
    }
    if (e.key === 'ArrowRight' && !inBox) {
      take();
      if (step.kind === 'explain' || this.result) this.next();
      else if (step.kind === 'practice' && this.skipShown) void this.skip();
      return true;
    }
    if (e.key === 'ArrowLeft' && !inBox) { take(); this.back(); return true; }
    if (key) {
      if (this.result) return take();                       // done: the result is what to look at
      return this.keysNow().has(key) ? false : take();
    }
    if (e.ctrlKey || e.metaKey) return take(); // Ctrl+O and the like: not now
    return false;
  }

  // ---- drawing -----------------------------------------------------------------

  private mount(): void {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'tut-dim');
    // The scrim's edges a little soft (the cut-outs read as light, not as holes).
    const defs = document.createElementNS(SVG, 'defs');
    defs.innerHTML = '<filter id="tut-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.5"/></filter>';
    this.dim = document.createElementNS(SVG, 'path');
    this.dim.setAttribute('fill-rule', 'evenodd');
    this.dim.setAttribute('class', 'dim');
    this.dim.setAttribute('filter', 'url(#tut-soft)');
    this.block = document.createElementNS(SVG, 'path');
    this.block.setAttribute('fill-rule', 'evenodd');
    this.block.setAttribute('class', 'block');
    svg.append(defs, this.dim, this.block);
    this.rings = h('div', { class: 'tut-rings' });
    this.card = h('div', { class: 'tut-card', role: 'dialog', 'aria-label': 'Tutorial' });
    this.arrow = h('div', { class: 'tut-arrow', 'aria-hidden': 'true' });
    this.root = h('div', { class: 'tut' }, svg as unknown as HTMLElement, this.rings, this.arrow, this.card);
    document.body.append(this.root);
    const tick = () => { this.layout(); this.frame = requestAnimationFrame(tick); };
    this.frame = requestAnimationFrame(tick);
  }

  private unmount(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.skipTimer);
    clearTimeout(this.advanceTimer);
    this.root?.remove();
    this.root = this.dim = this.block = this.rings = this.card = this.arrow = null;
  }

  /* The card, top to bottom: the progress bar along its top edge (one piece
     a chapter, as long as its steps); the chapter and the step's number;
     the title; the body; for a practice step, what to do (its keys as key
     chips), or once it is done, "완료"; the keys and the buttons.
     `fresh`: a new card, which comes in (not the same card in the other language). */
  private renderCard(fresh = true): void {
    const card = this.card;
    if (!card) return;
    const step = this.step;
    const p = progress(this.chapters.map((c) => c.steps.length), this.index);
    const button = (label: string, cls: string, onClick: () => void, o: { disabled?: boolean; title?: string } = {}) => {
      const b = h('button', { class: `btn ${cls}`, type: 'button', disabled: o.disabled, title: o.title }, label);
      b.addEventListener('click', onClick);
      return b;
    };
    const res = this.result ? step.result : undefined;
    const end = step.kind === 'end';
    const buttons: HTMLElement[] = [];
    if (step.kind === 'practice' && !res && this.skipShown) {
      buttons.push(button(tr(CARD.skip), 'tut-skip', () => void this.skip(), { title: tr(CARD.skipTitle) }));
    }
    if (p.number > 1) buttons.push(button(tr(CARD.back), 'tut-back', () => this.back(), { title: tr(CARD.backTitle) }));
    if (step.kind === 'explain' || res) {
      const next = button(tr(CARD.next), 'primary tut-next', () => this.next(), { title: tr(CARD.nextTitle) });
      next.append(icon('arrow-right'));
      buttons.push(next);
    }
    if (end) buttons.push(button(tr(CARD.finish), 'primary tut-finish', () => void this.end()));
    const quit = h('button', { class: 'tut-quit', type: 'button', title: tr(CARD.quitTitle) }, h('kbd', {}, 'Esc'), h('span', {}, tr(CARD.quit)));
    quit.addEventListener('click', () => void this.quit());
    const hints = h('div', { class: 'tut-hints' },
      end ? null : h('span', { class: 'tut-keys', title: tr(CARD.keysTitle) }, h('kbd', {}, '←'), h('kbd', {}, '→')),
      end ? null : quit);
    // What a practice step waits for; once done, that it is.
    const asks = step.doing?.(this) ?? [];
    const doing = step.kind !== 'practice' ? null
      : res ? h('div', { class: 'tut-do done' }, glyph('check'), h('span', { class: 'tut-do-label' }, tr(CARD.done)))
      : h('div', { class: 'tut-do' }, glyph(asks.some((d) => typeof d === 'object' && 'key' in d) ? 'keyboard' : 'pointer'),
        h('span', { class: 'tut-do-label' }, tr(CARD.tryIt)),
        h('span', { class: 'tut-do-what' }, ...asks.map(part)));
    const chapter = this.chapters[p.chapter];
    const bar = h('div', { class: 'tut-progress', 'aria-hidden': 'true' },
      ...this.chapters.map((c, i) => h('span', { class: 'tut-seg', style: `flex-grow:${c.steps.length}` },
        h('span', { class: 'tut-fill', style: `width:${(p.fills[i] * 100).toFixed(2)}%` }))));
    const recap = end ? h('ul', { class: 'tut-recap' },
      ...this.chapters.map((c, i) => h('li', {}, glyph('check'), h('span', {}, h('b', {}, tr(CARD.recap, i + 1)), ` ${tr(c.title)}`)))) : null;
    card.className = `tut-card kind-${step.kind}${res ? ' done' : ''}`;
    card.replaceChildren(
      h('div', { class: 'tut-top' },
        h('span', { class: 'tut-chapter' }, `${tr(CARD.chapter, p.chapter + 1)} · ${tr(chapter.title)}`),
        h('span', { class: 'tut-count', 'aria-label': tr(CARD.count, p.number, p.total) }, `${p.number} / ${p.total}`)),
      bar,
      h('h3', {}, (res ?? step).title(this)),
      h('p', {}, codeText((res ?? step).body(this))),
      ...([recap, doing] as (HTMLElement | null)[]).filter((e): e is HTMLElement => e !== null),
      h('div', { class: 'tut-foot' }, hints, h('div', { class: 'tut-buttons' }, ...buttons)));
    this.lastLayout = '';
    if (fresh) this.entering = true; // the next layout places it, then it comes in
  }

  // Every frame: where the targets are now; the dimmed layer, the rings and
  // the card follow them (the Data tab redraws itself, lists scroll...).
  private layout(): void {
    if (!this.card || !this.dim || !this.block || !this.rings || !this.arrow || this.busy) return;
    const step = this.step;
    const now: Beat = this.result ? step.result! : step;
    const rects = targetRects(now.targets(this));
    // A target not (wholly) in view: bring it in, at most five times a second.
    if (now.reveal && (rects.missing || rects.clipped) && performance.now() - this.lastReveal > 200) {
      this.lastReveal = performance.now();
      now.reveal(this);
      if (!this.did.includes('scrolled')) this.did.push('scrolled');
    }
    const w = window.innerWidth;
    const hh = window.innerHeight;
    // The areas lit whole: each target's panel (the toolbar, the status
    // bar; a separator itself), cut to the window.
    const lit = merge(litAreas(rects.owners).map((r) => ({ left: Math.max(0, r.left), top: Math.max(0, r.top),
      right: Math.min(w, r.right), bottom: Math.min(hh, r.bottom) })), 0);
    const key = JSON.stringify([rects.list, lit, w, hh, this.card.offsetWidth, this.card.offsetHeight, this.index, this.phase, this.result]);
    if (key === this.lastLayout) return;
    this.lastLayout = key;
    // The scrim reaches past the window (its soft edge outside), the lit areas cut out with round corners.
    const holes = (rs: Rect[], r: number) => rs.map((q) => roundRect(q, r)).join(' ');
    this.dim.setAttribute('d', `M-40 -40H${w + 40}V${hh + 40}H-40Z ${holes(lit, 8)}`);
    this.block.setAttribute('d', `M0 0H${w}V${hh}H0Z ${holes(merge(rects.list.map((r) => grow(r, 4))), 0)}`);
    // A ring 4 px around its target, or closer when another target is near:
    // neighbours (the bit fields) keep a ring each, never one fused outline.
    // The same elements from frame to frame: they fade in once a step.
    const fresh = this.entering;
    while (this.rings.childElementCount > rects.list.length) this.rings.lastElementChild!.remove();
    while (this.rings.childElementCount < rects.list.length) this.rings.append(h('div', { class: 'tut-ring' }));
    rects.list.forEach((r, i) => {
      const near = Math.min(Infinity, ...rects.list.filter((_, j) => j !== i).map((q) => distance(r, q)));
      const out = Math.max(0, Math.min(4, Math.floor((near - 4) / 2)));
      const ring = this.rings!.children[i] as HTMLElement;
      ring.className = `tut-ring${out < 2 ? ' tight' : ''}`;
      ring.style.cssText = `left:${r.left - out}px;top:${r.top - out}px;width:${r.right - r.left + 2 * out}px;height:${r.bottom - r.top + 2 * out}px`;
    });
    const size = { width: this.card.offsetWidth, height: this.card.offsetHeight };
    // Below the toolbar (the title bar when there is none): the card never hides a button.
    const bars = $('.toolbar:not([hidden])') ?? $('.titlebar');
    const view = { left: 0, top: (bars?.getBoundingClientRect().bottom ?? 0), right: w, bottom: hh };
    // Right below the first target, else above, else beside it
    // (logic/placement.ts): off every target and what the step keeps off;
    // failing that, off the targets alone; never over a target's ring.
    // The gap leaves room for the arrow.
    const keepOff = targetRects(now.avoid?.(this) ?? []).list;
    const grown = rects.list.map((r) => grow(r, 4));
    const at = rects.list.length === 0
      ? { left: (w - size.width) / 2, top: (hh - size.height) / 2, side: null }
      : place(grown, size, view, keepOff, 16) ?? place(grown, size, view, [], 16)
        ?? { left: w - size.width - 8, top: hh - size.height - 8, side: null };
    this.card.style.left = `${Math.round(at.left)}px`;
    this.card.style.top = `${Math.round(at.top)}px`;
    this.pointArrow(at, size, grown[0]);
    if (fresh) {
      this.entering = false;
      for (const el of [this.card, this.rings, this.arrow]) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    }
    // A click in the middle of each target reaches it (not the card, not
    // something else drawn over it).  While a theme switch's view transition
    // runs, it takes every point: tested again once it is over.
    const hits = (): boolean[] => rects.list.map((r, i) => {
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return !!hit && !!rects.owners[i]?.contains(hit);
    });
    const shown = this.shown = {
      step: this.index + 1, id: step.id, phase: this.phase, result: this.result, targets: rects.list, lit, hits: hits(), did: [...this.did],
      card: { left: at.left, top: at.top, right: at.left + size.width, bottom: at.top + size.height },
    };
    const running = (document as Document & { activeViewTransition?: { finished: Promise<void> } | null }).activeViewTransition;
    void running?.finished.then(() => { if (this.shown === shown) shown.hits = hits(); });
  }

  // The small arrow on the card's edge toward the first target, where the
  // card stands right beside it (none when it had to go somewhere else).
  private pointArrow(at: { left: number; top: number; side: string | null }, size: { width: number; height: number }, target: Rect | undefined): void {
    const arrow = this.arrow!;
    const card = { left: at.left, top: at.top, right: at.left + size.width, bottom: at.top + size.height };
    const side = target ? at.side : null;
    arrow.hidden = !side;
    if (!side || !target) return;
    const S = 7; // half the arrow's box
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    // The middle of the stretch the card and the target share, else the target's middle.
    // Only where the card's edge and the target face each other over a stretch:
    // an arrow from a corner toward something off to the side points nowhere.
    const shared = (a0: number, a1: number, b0: number, b1: number) => [Math.max(a0 + 22, b0), Math.min(a1 - 22, b1)];
    const across = side === 'below' || side === 'above';
    const [lo, hi] = across ? shared(card.left, card.right, target.left, target.right) : shared(card.top, card.bottom, target.top, target.bottom);
    if (hi - lo < 8) { arrow.hidden = true; return; }
    const along = clamp((lo + hi) / 2, lo, hi);
    const x = across ? along : side === 'right' ? card.left : card.right;
    const y = across ? (side === 'below' ? card.top : card.bottom) : along;
    arrow.dataset.side = side;
    arrow.style.left = `${Math.round(x - S)}px`;
    arrow.style.top = `${Math.round(y - S)}px`;
  }
}

const SVG = 'http://www.w3.org/2000/svg';

// The key of a key press, as steps let keys through (Shift+F10 is not F10).
export function keyOf(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): Key | null {
  if (e.key === 'F5') return 'F5';
  if (e.key === 'F10') return e.shiftKey ? 'Shift+F10' : 'F10';
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' ? 'Ctrl+S' : null;
}

// A small line icon (lucide's drawings), in the text's colour.
const GLYPHS: Record<string, string> = {
  check: 'M20 6 9 17l-5-5',
  keyboard: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 16h10',
  pointer: 'M14 4.1 12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2 8 5.1M9.04 9.69a.5.5 0 0 1 .65-.65l11 4.5a.5.5 0 0 1-.07.95l-4.35 1.04a1 1 0 0 0-.74.74l-1.04 4.35a.5.5 0 0 1-.95.07z',
};
function glyph(name: string): SVGSVGElement {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', `tut-glyph g-${name}`);
  el.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', GLYPHS[name]);
  el.append(path);
  return el;
}

// One part of what a practice step asks for: a key (a key chip), something
// to click (a chip), or words.
function part(d: Doing): Node {
  if (typeof d === 'string') return h('span', { class: 'tut-do-text' }, d);
  if ('key' in d) return h('kbd', {}, d.key);
  return h('span', { class: 'tut-do-click' }, d.click);
}

// A rectangle as a path with corners of radius r.
function roundRect(q: Rect, r: number): string {
  const k = Math.max(0, Math.min(r, (q.right - q.left) / 2, (q.bottom - q.top) / 2));
  if (k === 0) return `M${q.left} ${q.top}H${q.right}V${q.bottom}H${q.left}Z`;
  return `M${q.left + k} ${q.top}H${q.right - k}A${k} ${k} 0 0 1 ${q.right} ${q.top + k}V${q.bottom - k}A${k} ${k} 0 0 1 ${q.right - k} ${q.bottom}`
    + `H${q.left + k}A${k} ${k} 0 0 1 ${q.left} ${q.bottom - k}V${q.top + k}A${k} ${k} 0 0 1 ${q.left + k} ${q.top}Z`;
}

// What is lit whole around the targets: the panel each is in -- or, for a
// toolbar button, the toolbar; for the status bar's words, the status bar;
// a separator between panels, itself.
function litAreas(owners: Element[]): Rect[] {
  const areas = new Set<Element>();
  for (const o of owners) areas.add(o.closest('.panel, .toolbar, .titlebar, .status') ?? o);
  return [...areas].map((a) => { const r = a.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
}

// The gap between two boxes (0 when they touch or overlap).
function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  return Math.hypot(dx, dy);
}

function grow(r: Rect, by: number): Rect {
  return { left: r.left - by, top: r.top - by, right: r.right + by, bottom: r.bottom + by };
}

// The targets' boxes, cut to what their scrolling boxes show; whether one
// is missing or cut short (then the step brings it into view).
function targetRects(targets: Target[]): { list: Rect[]; owners: Element[]; missing: boolean; clipped: boolean } {
  const list: Rect[] = [];
  const owners: Element[] = [];
  let missing = false;
  let clipped = false;
  for (const t of targets) {
    const owner = t instanceof Element ? t : t?.within ?? null;
    const box = t instanceof Element ? t.getBoundingClientRect() : t?.rect ?? null;
    if (!owner || !box || !owner.isConnected || !(owner as HTMLElement).checkVisibility?.()) { missing = true; continue; }
    let r: Rect = box;
    if (r.right - r.left <= 0 || r.bottom - r.top <= 0) { missing = true; continue; }
    const full = { left: box.left, top: box.top, right: box.right, bottom: box.bottom }; // (a DOMRect spreads to nothing)
    for (let p: Element | null = t instanceof Element ? owner.parentElement : owner; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const c = p.getBoundingClientRect();
      r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
    }
    r = { left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, window.innerWidth), bottom: Math.min(r.bottom, window.innerHeight) };
    if (r.right - r.left < 4 || r.bottom - r.top < 4) { missing = true; continue; }
    if (r.bottom - r.top < full.bottom - full.top - 1 || r.right - r.left < full.right - full.left - 1) clipped = true;
    list.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    owners.push(owner);
  }
  return { list, owners, missing, clipped };
}
