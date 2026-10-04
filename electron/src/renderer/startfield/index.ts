/* The first screen's circuit board.  The only surface a caller uses:

     const field = startfield({ seed: 20261002, theme: 'dark' });
     container.append(field.root, card);   // the card carries data-startfield-chip
     field.show(true);
     field.setTheme('light');              // the day board, at the same moment

   A seed and a look, and no import of anything outside this folder, so the
   folder can be copied whole into another simulator: there the call is the
   same with its own seed and nothing else changes.  The look is the
   caller's to tell (night: white light on black; day: ink on paper), not
   read from the page, for the same reason.  The chip is found by the
   attribute, not passed in, which keeps it at one.

   onFrame() hands the caller the same clock, so whatever it draws of its own
   -- the card's own lights, in this program -- moves with the board instead
   of beside it, and is photographed by the same capture.

   The card is the chip.  Its rectangle is measured on screen and the pins
   are placed on it, so there is never a second drawn square under a floating
   card for the two to disagree about.

   What this file owns: the two canvases, the clock, and which layer is drawn
   when.  The opening runs on delta time -- adding a constant per frame would
   make it 2.8 s at 60 Hz and 1.2 s at 144 Hz.  The board below is drawn
   while it grows and once more when it has, and then not again however long
   the window is left open; the layer above it is cleared and drawn every
   frame, with at most a handful of things on it.  That is the whole cost of
   a settled board.

   Nothing is animated in CSS that does not end.  The one thing on the card
   that keeps moving -- the die frame's slow breath -- is driven from here,
   as --sf-die on the chip, because a CSS animation that never ends is one
   the capture tool cannot photograph (it freezes them) and one the window
   keeps a compositor thread awake for. */

import { generate, type Geometry } from './generate.ts';
import glintsCss from './glints.css';
import { dieAlpha, drawBoard, drawPulse, LOOKS, type Theme } from './render.ts';

export type { Theme };

export interface Startfield {
  root: HTMLElement;
  show(on: boolean): void;
  /** Called with the moment of the opening, every frame the board draws.
      Returns the undo.  Nothing is called once show(false) has been. */
  onFrame(listener: (t: number) => void): () => void;
  /** When the board has finished growing, in ms of the opening (Infinity
      until it has been laid out). */
  grownAt(): number;
  /** Night or day.  The board is drawn again in the other look at the
      moment it is at -- the clock goes on, nothing grows a second time --
      and the old picture fades out over the new one. */
  setTheme(theme: Theme): void;
  destroy(): void;
}

export const CHIP_ATTR = 'data-startfield-chip';
const STYLE_ID = 'startfield-css';
const RESIZE_SETTLE = 180; // ms of quiet before the field is laid out again

/* Only on a window that is being driven (navigator.webdriver): the capture
   tool needs to put the opening at an exact time, and the tests need the
   frame deltas and the geometry.  A student's window has none of it. */
interface TestHook {
  stepTo(ms: number): void;
  geometry(): Geometry;
  /** When the board has finished growing, in ms. */
  grown(): number;
  frames(): number;
  /** How many times the board below has been drawn.  After it has grown
      this must stop going up. */
  boardDraws(): number;
  /** Time spent drawing, per frame, in ms. */
  work(): number[];
  /** Time between one animation frame and the next, in ms. */
  deltas(): number[];
  /** The moment of the opening each frame was drawn at, in ms. */
  times(): number[];
}
declare global {
  interface Window { __startfield?: TestHook }
}

/* options.from (ms): where the opening starts -- a page loaded again in the
   middle of the first screen (the ISA chosen: the window is reloaded for it)
   comes back with the board as it was, not growing a second time.
   options.theme: the look it starts in; options.fadeMs: how long a change of
   look takes (the page's own change of colours, so the two go together). */
export function startfield(options: { seed: number; from?: number; theme?: Theme; fadeMs?: number }): Startfield {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = glintsCss;
    document.head.append(style);
  }
  const board = document.createElement('canvas');
  const pulse = document.createElement('canvas');
  board.className = 'sf-board';
  pulse.className = 'sf-pulse';
  const root = document.createElement('div');
  root.className = 'startfield';
  root.setAttribute('aria-hidden', 'true');
  let theme: Theme = options.theme ?? 'dark';
  root.classList.toggle('sf-light', theme === 'light');
  // The canvases go in when the screen is shown and come out when it is not.

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new Set<(t: number) => void>();
  let geo: Geometry | undefined;
  let raf = 0, started = 0, shown = false, frames = 0, boardDraws = 0;
  let drawnAt = -1;                      // the moment the board below holds
  let lastT = 0;                         // the moment last painted
  let offset = options.from ?? 0;        // where the clock starts on the next run()
  let resizeTimer = 0, lastFrame = 0;
  const deltas: number[] = [];
  const work: number[] = [];
  const times: number[] = [];

  const chip = (): HTMLElement | null =>
    (root.parentElement?.querySelector(`[${CHIP_ATTR}]`) as HTMLElement | null) ?? null;

  /* One frame of the whole screen at `t`.  The board below is redrawn only
     while it is still growing -- or if the clock has gone backwards, which
     is what the capture tool does between takes. */
  const paint = (t: number): void => {
    if (!geo) return;
    const lower = board.getContext('2d');
    const upper = pulse.getContext('2d');
    if (!lower || !upper) return;
    frames++;
    lastT = t;
    times.push(t);
    const began = performance.now();
    if (drawnAt < geo.grownMs || t < drawnAt) {
      drawBoard(lower, geo, Math.min(t, geo.grownMs), LOOKS[theme]);
      drawnAt = Math.min(t, geo.grownMs);
      boardDraws++;
    }
    drawPulse(upper, geo, t, LOOKS[theme]);
    work.push(performance.now() - began);
    chip()?.style.setProperty('--sf-die', dieAlpha(t).toFixed(3));
    for (const listener of listeners) listener(t);
  };

  /* Measures the card and lays the field out again.  Done after the fonts
     are ready: measured before they load, the card is a different size and
     the pins miss its edges. */
  const build = (): void => {
    const el = chip();
    if (!el) return;
    /* The card's settled rectangle.  getBoundingClientRect() alone would be
       measured through its entrance transform (0.96 -> 1, glints.css) and
       the pins would end up on a card three pixels narrower than the one
       that is finally there.  The scale is about the centre, which the
       transform leaves where it is, so the centre comes from the rect and
       the size from the layout box. */
    const r = el.getBoundingClientRect();
    const box = { width: el.offsetWidth, height: el.offsetHeight,
                  x: r.x + r.width / 2 - el.offsetWidth / 2, y: r.y + r.height / 2 - el.offsetHeight / 2 };
    const host = root.getBoundingClientRect();
    const width = Math.max(320, Math.round(host.width));
    const height = Math.max(240, Math.round(host.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    for (const c of [board, pulse]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    /* Laid out again (the window was resized).  Still growing -- the window
       is maximised just after it is shown (main.ts), which can land after
       the first layout -- it goes on growing from the moment it was at, on
       the new layout.  Grown, it comes back grown, its clock going on from
       where it was -- not growing a second time -- and fades in over the
       dark it faded out to (resizing, below). */
    const growing = geo !== undefined && lastT < geo.grownMs;
    const again = geo !== undefined;
    geo = generate({
      seed: options.seed, width, height, dpr,
      card: { x: Math.round(box.x - host.x), y: Math.round(box.y - host.y), width: Math.round(box.width), height: Math.round(box.height) },
    });
    drawnAt = -1;
    if (again) offset = growing ? lastT : Math.max(lastT, geo.grownMs);
    if (reduce.matches) paint(geo.grownMs); else run();
    root.classList.remove('sf-resizing');
  };

  const stop = (): void => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const frame = (now: number): void => {
    if (!started) { started = now; deltas.push(0); } else deltas.push(now - lastFrame);
    lastFrame = now;
    paint(now - started + offset);      // delta time, never a per-frame constant
    raf = requestAnimationFrame(frame); // the board below stops; this layer does not
  };

  const run = (): void => {
    stop();
    if (!geo) return;
    if (reduce.matches) { paint(geo.grownMs); return; }
    started = 0;
    raf = requestAnimationFrame(frame);
  };

  /* While the window is being resized the board drawn for the old size
     would be stretched over the new one, its hole for the card and the
     card's halo no longer where the card is: it fades out at once to the
     window's dark, and back in once it has been laid out for the new size. */
  const observer = new ResizeObserver(() => {
    // The first call (on observing) and any that changes nothing are not a resize.
    const host = root.getBoundingClientRect();
    const el = chip();
    const same = geo && Math.round(host.width) === geo.width && Math.round(host.height) === geo.height
      && (!el || el.offsetWidth === Math.round(geo.card.width));
    if (same) return;
    // Growing, the board is drawn again every frame anyway: no fade to the dark.
    if (shown && geo && lastT >= geo.grownMs) root.classList.add('sf-resizing');
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (shown) build(); }, RESIZE_SETTLE);
  });

  const onReduce = (): void => { if (shown) build(); };
  reduce.addEventListener('change', onReduce);

  let ready = false;
  const start = (): void => {
    if (ready) { build(); return; }
    // The fonts first, then one frame, so the card is at its final size.
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
      ready = true;
      if (!shown) return;
      const el = chip();
      if (el) observer.observe(el);
      observer.observe(root);
      build();
    }));
  };

  if (typeof window !== 'undefined' && navigator.webdriver) {
    window.__startfield = {
      stepTo(ms: number) {
        stop();
        paint(Math.max(0, ms));
        /* The CSS parts that do end are put at the same moment: a negative
           delay moves an animation to that point and pausing it keeps it
           there, so a captured frame is the whole screen at t, not the
           canvases at t over CSS wherever it happened to be.  What never
           ends is on the canvases, where the same clock drives it. */
        const sec = `${-ms / 1000}s`;
        const card = chip();
        if (card) {
          for (const el of [card, ...card.querySelectorAll<HTMLElement>('.actions, .back')]) {
            el.style.animationDelay = sec;
            el.style.animationPlayState = 'paused';
          }
        }
      },
      geometry: () => geo!,
      grown: () => geo?.grownMs ?? 0,
      frames: () => frames,
      boardDraws: () => boardDraws,
      work: () => work.slice(),
      deltas: () => deltas.slice(),
      times: () => times.slice(),
    };
  }

  /* The other look.  What is on screen now is copied to a third canvas
     laid over the two, the board is drawn again under it in the new look
     at the moment it is at, and the copy fades out: a cross-fade, with the
     pulses running on underneath and the clock not touched.  Without a
     board on screen (not shown, not laid out yet) only the look changes,
     and the next drawing is in it. */
  let fading: HTMLCanvasElement | null = null, fadeTimer = 0;
  const endFade = (): void => { clearTimeout(fadeTimer); fading?.remove(); fading = null; };
  const setTheme = (next: Theme): void => {
    if (next === theme) return;
    theme = next;
    root.classList.toggle('sf-light', theme === 'light');
    if (!geo || !shown || !board.isConnected) {
      endFade();
      return;
    }
    // Switched again before the last fade ended: the copy is of what is on
    // screen, the half-faded picture included, so nothing jumps.
    const before = fading;
    const beforeAlpha = before ? Number(getComputedStyle(before).opacity) : 0;
    if (!reduce.matches && !root.classList.contains('sf-resizing')) {
      const copy = document.createElement('canvas');
      copy.className = 'sf-fade';
      copy.width = board.width;
      copy.height = board.height;
      const g = copy.getContext('2d');
      if (g) {
        g.drawImage(board, 0, 0);
        g.drawImage(pulse, 0, 0);
        if (before && beforeAlpha > 0) { g.globalAlpha = beforeAlpha; g.drawImage(before, 0, 0); }
        endFade();
        root.append(copy);
        fading = copy;
        void copy.offsetWidth;                 // laid out opaque, then faded
        const ms = options.fadeMs ?? 500;
        copy.style.transition = `opacity ${ms}ms ease`;
        copy.style.opacity = '0';
        fadeTimer = window.setTimeout(endFade, ms + 60);
      }
    }
    if (fading !== null && fading === before) endFade();   // no copy made: no fade left over
    drawnAt = -1;                              // the board below, again, in the new look
    paint(lastT);
  };

  /* Off the first screen there is nothing of this left: no frame asked for,
     no canvas in the document, no geometry held, nothing watched, and the
     properties it was setting on the card gone.  A board that went on
     running behind the Editor would cost a lab PC a lesson's worth of
     nothing. */
  const teardown = (): void => {
    stop();
    endFade();
    clearTimeout(resizeTimer);
    observer.disconnect();
    board.remove();
    pulse.remove();
    geo = undefined;
    drawnAt = -1;
    chip()?.style.removeProperty('--sf-die');
  };

  return {
    root,
    grownAt: () => geo?.grownMs ?? Infinity,
    setTheme,
    show(on: boolean) {
      if (on === shown) return;
      shown = on;
      root.parentElement?.classList.toggle('startfield-on', on);
      if (on) { root.append(board, pulse); start(); } else teardown();
    },
    onFrame(listener: (t: number) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      teardown();
      listeners.clear();
      reduce.removeEventListener('change', onReduce);
      if (window.__startfield) delete window.__startfield;
    },
  };
}
