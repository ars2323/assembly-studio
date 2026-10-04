/* The window's minimise / maximise / close buttons, at the title bar's right
   end, drawn by the page (the window has no system title bar and no system
   caption buttons, src/main/main.ts).  Being the page's own, they change
   theme with it, in the same cross-fade, and sit under the tutorial's dim
   and a dialog's backdrop like everything else.  Both ISAs; the first
   screen too, where the title bar is clear over the board.

   The symbols are Windows 11's: a line, a square, two squares (restore), a
   cross -- 10 px, drawn in 1 px strokes of the text colour.  Close turns
   red under the pointer, as Windows' own does. */

import { h } from '../dom.ts';
import { onLang, tr } from '../i18n.ts';
import { CAPTION } from '../messages/caption.ts';

export interface WindowControls {
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximized(listener: (maximized: boolean) => void): void;
}

const SVG = 'http://www.w3.org/2000/svg';
function symbol(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
// Half-pixel coordinates: 1 px strokes on whole pixels.
const MINIMIZE = ['M0 5.5H10'];
const MAXIMIZE = ['M0.5 0.5H9.5V9.5H0.5Z'];
const RESTORE = ['M0.5 2.5H7.5V9.5H0.5Z', 'M2.5 2.5V0.5H9.5V7.5H7.5'];
const CLOSE = ['M0.5 0.5L9.5 9.5', 'M9.5 0.5L0.5 9.5'];

export function captionButtons(api: WindowControls): HTMLElement {
  const button = (cls: string, paths: string[], run: () => void) => {
    const b = h('button', { class: `capbtn ${cls}`, type: 'button', tabindex: '-1' });
    b.append(symbol(paths));
    b.addEventListener('click', run);
    return b;
  };
  const min = button('cap-min', MINIMIZE, () => void api.minimizeWindow());
  const max = button('cap-max', MAXIMIZE, () => void api.toggleMaximizeWindow());
  const close = button('cap-close', CLOSE, () => void api.closeWindow());
  let maximized = false;
  const name = () => {
    for (const [b, label] of [[min, tr(CAPTION.minimize)], [max, tr(maximized ? CAPTION.restore : CAPTION.maximize)], [close, tr(CAPTION.close)]] as const) {
      b.title = label;
      b.setAttribute('aria-label', label);
    }
  };
  const show = (m: boolean) => {
    maximized = m;
    max.replaceChildren(symbol(m ? RESTORE : MAXIMIZE));
    name();
  };
  api.onMaximized(show);
  void api.isMaximized().then(show, () => name());
  onLang(name);
  name();
  return h('div', { class: 'caption' }, min, max, close);
}
