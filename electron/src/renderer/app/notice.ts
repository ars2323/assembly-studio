/* A panel's word to the student when it has nothing else to show: the
   Console before any output, the Inspector before the first step, the
   card on the Run side before the first assemble (and after an edit), and
   the error list.  One shape for all of them: a title, a sentence, and
   whatever else the case needs (a button, the errors), in the middle of the
   panel, no wider than a paragraph reads well. */

import { h } from './dom.ts';

export interface Notice {
  title: string;
  body?: Node | string;
  more?: (Node | null)[];             // after the sentence: a button, the errors
}

export function notice(n: Notice): HTMLElement {
  return h('div', { class: 'notice' },
    h('div', { class: 'say' }, h('h3', {}, n.title), n.body ? h('p', {}, n.body) : null, ...(n.more ?? [])));
}
