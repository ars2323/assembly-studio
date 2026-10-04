/* About: the version, what it is built on, and every notice that goes with
   the program -- read from the same files the package carries
   (src/main/paths.ts LICENSES), so the two cannot drift apart. */

import type { AboutInfo } from '../api.ts';
import { brand } from '../../../brand.ts';
import { code, codeText, h, markImg } from '../dom.ts';
import { tr } from '../i18n.ts';
import { DIALOGS } from '../messages/dialogs.ts';

// `engine`: what the simulator is built on, in About's first tab (the ISA's engine).
export function aboutDialog(engine: (info: AboutInfo) => (string | Node)[] = () => ['Simulator engine: SPIM ', code('9.1.24'), ' by James R. Larus (BSD)']):
    { root: HTMLDialogElement; open(): Promise<void> } {
  const dialog = h('dialog', { class: 'modal about', 'aria-label': 'About' });

  const open = async () => {
    const info: AboutInfo = await window.app.about();
    const body = h('div', { class: 'tabbody' });
    const tabs = h('div', { class: 'tabs' });
    const pick = (i: number) => {
      [...tabs.children].forEach((t, k) => t.classList.toggle('on', k === i));
      if (i === 0) {
        body.replaceChildren(
          h('div', { class: 'about-id' }, markImg('about-mark'),
            h('div', {}, h('div', { class: 'about-name' }, brand.name), h('div', { class: 'about-ver' }, 'Version ', code(info.version)), h('div', { class: 'about-by' }, 'Made by ', brand.author))),
          h('p', {}, ...engine(info)),
          h('p', { class: 'hint' }, tr(brand.about)),
          h('p', { class: 'hint' }, 'Electron ', code(info.electron), ' · Chromium ', code(info.chrome), ' · Node.js ', code(info.node)));
      } else {
        const list = h('div', { class: 'licenses' });
        const titles = [...info.licenses, 'Electron — MIT License'];
        titles.forEach((title, k) => {
          const pre = h('pre', { class: 'mono' });
          const d = h('details', {}, h('summary', {}, title), pre);
          d.addEventListener('toggle', async () => {
            if (d.open && pre.textContent === '') pre.textContent = await window.app.license(k);
          }, { once: false });
          list.append(d);
        });
        const credits = h('button', { class: 'btn small', type: 'button' }, 'Open the Chromium · Node.js notices (LICENSES.chromium.html)');
        credits.addEventListener('click', () => void window.app.openCredits());
        list.append(h('p', { class: 'hint' }, codeText(tr(DIALOGS.about.credits))), credits);
        body.replaceChildren(list);
      }
    };
    ['About', 'Licenses'].forEach((t, i) => {
      const b = h('button', { class: 'tab', type: 'button' }, t);
      b.addEventListener('click', () => pick(i));
      tabs.append(b);
    });
    const close = h('button', { class: 'btn primary', type: 'button' }, 'Close');
    close.addEventListener('click', () => dialog.close());
    dialog.replaceChildren(h('h2', {}, 'About'), tabs, body, h('div', { class: 'row end' }, close));
    pick(0);
    dialog.showModal();
  };
  return { root: dialog, open };
}
