/* The colour of the window's caption buttons (Windows draws them, over a
   patch the page cannot paint: titleBarOverlay) on the first screen and
   while the page is covered.
   The tutorial dims the window with the scrim colour at 55 %; a dialog's
   backdrop is the scrim at 60 %; both at once, one over the other.  The
   patch is given the colour the title bar takes under the same layers, so it
   does not stand out as a square at the top right.  The colours are the
   page's own tokens (app.css: --surface, --scrim-rgb, --caption-symbol). */

export type Rgb = [number, number, number];

export const TUTORIAL_ALPHA = 0.55; // app.css .tut-dim
export const DIALOG_ALPHA = 0.6;   // app.css .modal::backdrop

export function composite(base: Rgb, layers: { color: Rgb; alpha: number }[]): Rgb {
  let out = base;
  for (const l of layers) out = out.map((v, i) => v * (1 - l.alpha) + l.color[i] * l.alpha) as Rgb;
  return out;
}

export const hex = (c: Rgb): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// "#rrggbb" or "r, g, b" (a token's text) -> Rgb.
export function rgb(text: string): Rgb {
  const t = text.trim();
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(t);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  const parts = t.split(',').map(Number);
  if (parts.length === 3 && parts.every((v) => Number.isFinite(v))) return parts as Rgb;
  throw new Error(`not a colour: "${text}"`);
}

export interface Palette { surface: Rgb; scrim: Rgb; symbol: string }
export function palette(style: { getPropertyValue(name: string): string }): Palette {
  return { surface: rgb(style.getPropertyValue('--surface')), scrim: rgb(style.getPropertyValue('--scrim-rgb')),
           symbol: style.getPropertyValue('--caption-symbol').trim() };
}

// Part way (t from 0 to 1) from one theme's palette to the other's, for the
// patch to follow the page's fade (theme.ts); the symbols turn at the middle.
export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const k = Math.min(1, Math.max(0, t));
  return { surface: a.surface.map((v, i) => v + (b.surface[i] - v) * k) as Rgb,
           scrim: a.scrim.map((v, i) => v + (b.scrim[i] - v) * k) as Rgb,
           symbol: k < 0.5 ? a.symbol : b.symbol };
}

// The title bar's colour under what covers the page now.
export function overlayColor(p: Palette, tutorial: boolean, dialog: boolean): string {
  const layers = [];
  if (tutorial) layers.push({ color: p.scrim, alpha: TUTORIAL_ALPHA });
  if (dialog) layers.push({ color: p.scrim, alpha: DIALOG_ALPHA });
  return hex(composite(p.surface, layers));
}

// The patch and its symbols' colour.  On the first screen the title bar is
// glass over the board: the patch is transparent there (Windows takes the
// alpha), so the bar shows through it -- and so does whatever covers the
// page.  Its symbols are the board's: white over the night board, and over
// the day board the theme's own dark symbols (a theme whose symbols are
// light is a dark one).  Everywhere else the patch is the title bar's
// colour, or that colour under what covers the page.
export interface CaptionPatch { color: string; symbolColor: string }
export const FIRST_SCREEN_PATCH: CaptionPatch = { color: '#00000000', symbolColor: '#ffffff' };
const lightInk = (colour: string): boolean => {
  try { const [r, g, b] = rgb(colour); return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 128; } catch { return true; }
};
export function captionPatch(p: Palette, firstScreen: boolean, tutorial: boolean, dialog: boolean): CaptionPatch {
  if (firstScreen) return lightInk(p.symbol) ? FIRST_SCREEN_PATCH : { color: FIRST_SCREEN_PATCH.color, symbolColor: p.symbol };
  return { color: overlayColor(p, tutorial, dialog), symbolColor: p.symbol };
}
