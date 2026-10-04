/* Korean and English (core/lang.ts).  The language is <html lang="ko|en">.
   By default the system's: Korean where navigator.language is Korean,
   English everywhere else.  Like the theme (theme.ts) it is kept for this
   run only -- the window's sessionStorage, which survives the page being
   loaded again for the other ISA or for the first screen -- and isa.js puts
   it on the page before anything is drawn.

   tr(): a message (the tables in messages/) in the language in use.
   langSwitch(): the KO/EN switch, the theme switch's twin (same pill, same
   knob, the two ends the words KO and EN; app.css styles the two together), on the first screen's card and in
   the status line.  A change is announced ('langchange' on window) and
   everything that says something on screen draws it again at once: the
   page is never loaded again for it. */

import { say, type Lang, type Msg } from '../../core/lang.ts';
import { h } from './dom.ts';

export type { Lang, Msg };
const KEY = 'studio-lang';

export const currentLang = (): Lang => (document.documentElement.lang === 'en' ? 'en' : 'ko');

export const tr = <A extends any[], R = string>(m: Msg<A, R>, ...a: A): R => say(currentLang(), m, ...a);

// Words said later, in the language in use then: a message's (a function
// that says it) or text that is the same in both (a file name, a system's
// error message).
export type Words = string | (() => string);
export const words = (w: Words): string => (typeof w === 'function' ? w() : w);

export function setLang(lang: Lang): void {
  if (lang === currentLang()) return;
  document.documentElement.lang = lang;
  try { sessionStorage.setItem(KEY, lang); } catch { /* no storage: this page only */ }
  window.dispatchEvent(new CustomEvent<Lang>('langchange', { detail: lang }));
}

export function onLang(listener: (lang: Lang) => void): void {
  window.addEventListener('langchange', (e) => listener((e as CustomEvent<Lang>).detail));
}

const NAMES: Record<Lang, string> = { ko: '한국어', en: 'English' };

export function langSwitch(): HTMLElement {
  const b = h('button', { class: 'lang-switch', type: 'button', role: 'switch', 'aria-label': 'English' },
    h('span', { class: 'ts-knob' }), h('span', { class: 'ts-word ts-ko', 'aria-hidden': 'true' }, 'KO'),
    h('span', { class: 'ts-word ts-en', 'aria-hidden': 'true' }, 'EN'));
  const show = (l: Lang) => {
    b.setAttribute('aria-checked', String(l === 'en'));
    b.title = `${NAMES[l]} → ${NAMES[l === 'en' ? 'ko' : 'en']}`;
  };
  show(currentLang());
  b.addEventListener('click', (e) => { e.stopPropagation(); setLang(currentLang() === 'en' ? 'ko' : 'en'); });
  onLang(show);
  return b;
}
