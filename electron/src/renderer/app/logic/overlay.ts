/* The colour of the window's caption buttons (Windows draws them, over a
   patch the page cannot paint: titleBarOverlay) on the first screen and
   while the page is covered.
   The tutorial dims the window with the scrim colour at 26 %; a dialog's
   backdrop is the scrim at 35 %; both at once, one over the other.  The
   patch is given the colour the title bar takes under the same layers, so it
   does not stand out as a square at the top right.  The colours are the
   page's own tokens (app.css: --surface, --scrim-rgb, --caption-symbol). */

export type Rgb = [number, number, number];

export const TUTORIAL_ALPHA = 0.26;
export const DIALOG_ALPHA = 0.35;

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

// The title bar's colour under what covers the page now.
export function overlayColor(p: Palette, tutorial: boolean, dialog: boolean): string {
  const layers = [];
  if (tutorial) layers.push({ color: p.scrim, alpha: TUTORIAL_ALPHA });
  if (dialog) layers.push({ color: p.scrim, alpha: DIALOG_ALPHA });
  return hex(composite(p.surface, layers));
}

// The patch and its symbols' colour.  On the first screen the title bar is
// dark glass over the board: the patch is transparent there (Windows takes
// the alpha), so the bar shows through it -- and so does whatever covers
// the page -- and the symbols are white.  Everywhere else the patch is the
// title bar's colour, or that colour under what covers the page.
export interface CaptionPatch { color: string; symbolColor: string }
export const FIRST_SCREEN_PATCH: CaptionPatch = { color: '#00000000', symbolColor: '#ffffff' };
export function captionPatch(p: Palette, firstScreen: boolean, tutorial: boolean, dialog: boolean): CaptionPatch {
  if (firstScreen) return FIRST_SCREEN_PATCH;
  return { color: overlayColor(p, tutorial, dialog), symbolColor: p.symbol };
}
