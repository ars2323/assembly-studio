/* The two languages of the words the program says to the student: the first
   screen, the questions, Settings' notes, the tutorial and the Inspector's
   explanations.  (The names on the work screen -- panels, buttons, the
   status line -- are English in both.)

   A message is the same thing said in both: { ko, en }, each a string (or
   the parts of a line) or a function of the same few plain values (a number, a name, a flag; never an
   object of the page), so a table of them can be checked without a window
   (tests/renderer/messages.test.ts).  Pure: the language in use is the
   renderer's (renderer/app/i18n.ts); here it is always passed in. */

export type Lang = 'ko' | 'en';
export const LANGS: readonly Lang[] = ['ko', 'en'];

// `R`: what is said -- words, or (the tutorial's "what to do" line) a few parts of it.
type Text<A extends any[], R> = R | ((...a: A) => R);
export interface Msg<A extends any[] = [], R = string> { ko: Text<A, R>; en: Text<A, R> }

export function say<A extends any[], R>(lang: Lang, m: Msg<A, R>, ...a: A): R {
  const v = m[lang];
  return typeof v === 'function' ? (v as (...a: A) => R)(...a) : v;
}
