/* Light and dark.  The theme is <html data-theme="light|dark">; app.css
   holds both sets of tokens, the first screen's board draws itself for it
   (startfield setTheme).  Dark by default.  Kept for this run only (the
   window's sessionStorage: it survives the page being loaded again for the
   other ISA or for the first screen, and nothing of it outlives the run);
   isa.js puts it on the page before anything is drawn.

   themeSwitch(): the sun-and-moon switch, on the first screen's card and at
   the right end of the status line.  Every switch on the page follows the
   one that was pressed ('themechange' on window).

   The change is not a cut, and takes THEME_FADE_MS.  On the first screen
   (a card and the board) <html> carries .theme-fade for that long, under
   which the colours ease from the old theme's to the new one's (app.css),
   and the board cross-fades itself (startfield).  On the work screen --
   thousands of rows and cells, which would each be animated -- the page is
   changed at once under a view transition instead: a picture of it before
   cross-fades to the page after, on the compositor, whatever the page
   holds (app.css ::view-transition-*).  What the page draws outside itself
   follows the same clock (the caption buttons' patch, app.ts). */

import { h, icon } from './dom.ts';

export type Theme = 'dark' | 'light';
const KEY = 'studio-theme';

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export const THEME_FADE_MS = 500; // app.css html.theme-fade
let fading = 0;

export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  const apply = (): void => {
    root.dataset.theme = theme;
    try { sessionStorage.setItem(KEY, theme); } catch { /* no storage: this page only */ }
    void (window as unknown as { app?: { setTheme?(t: Theme): Promise<void> } }).app?.setTheme?.(theme);
    window.dispatchEvent(new CustomEvent<Theme>('themechange', { detail: theme }));
  };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const transition = (document as Document & { startViewTransition?(update: () => void): unknown }).startViewTransition;
  if (calm) apply();
  else if (!document.body.classList.contains('first-screen') && transition) transition.call(document, apply);
  else {
    root.classList.add('theme-fade');
    void root.offsetWidth; // the transitions in place before the colours change
    clearTimeout(fading);
    fading = window.setTimeout(() => root.classList.remove('theme-fade'), THEME_FADE_MS + 50);
    apply();
  }
}

export function onTheme(listener: (theme: Theme) => void): void {
  window.addEventListener('themechange', (e) => listener((e as CustomEvent<Theme>).detail));
}

export function themeSwitch(): HTMLElement {
  const b = h('button', { class: 'theme-switch', type: 'button', role: 'switch' },
    h('span', { class: 'ts-knob' }), h('span', { class: 'ts-sun' }, icon('sun')), h('span', { class: 'ts-moon' }, icon('moon')));
  const show = (t: Theme) => {
    b.setAttribute('aria-checked', String(t === 'dark'));
    b.title = t === 'dark' ? 'Light mode' : 'Dark mode';
    b.setAttribute('aria-label', 'Dark mode');
  };
  show(currentTheme());
  b.addEventListener('click', (e) => { e.stopPropagation(); setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); });
  onTheme(show);
  return b;
}
