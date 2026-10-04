/* Settings.  All of it for this run only: every start is from the
   defaults (lab PCs are shared; src/main/main.ts keeps nothing on disk).

     Font size        the code font, the UI font follows (Ctrl +/- too)
     Data radix       the base the Data tab shows its words in

   (MIPS's dialog also has Advanced: SPIM's machine options, run arguments
   and exception handler.  RARS's own options -- pseudo instructions, start
   at main, self-modifying code, memory layout -- are not in the engine
   protocol yet (docs/engine-protocol.md 10, hole 3), so that part is not
   here until they are.) */

import { code, h } from '../../../../renderer/app/dom.ts';

export interface SettingsEvents {
  fontSize(): number;
  setFontSize(px: number): Promise<number>;
  dataBase(): 2 | 10 | 16;
  setDataBase(base: 2 | 10 | 16): Promise<void>;
  about(): void;
}

export function settingsDialog(events: SettingsEvents): { root: HTMLDialogElement; open(): void } {
  const dialog = h('dialog', { class: 'modal settings', 'aria-label': 'Settings' });

  const render = () => {
    const size = code(`${events.fontSize()}px`, 'value');
    const step = (d: number) => async () => {
      size.textContent = `${await events.setFontSize(events.fontSize() + d)}px`;
    };
    const minus = h('button', { class: 'btn small', type: 'button', 'aria-label': 'Smaller' }, '−');
    const plus = h('button', { class: 'btn small', type: 'button', 'aria-label': 'Larger' }, '+');
    minus.addEventListener('click', step(-1));
    plus.addEventListener('click', step(+1));

    const bases = h('span', { class: 'seg' }, ...([16, 10, 2] as const).map((b) => {
      const el = h('button', { type: 'button', class: events.dataBase() === b ? 'on' : '' }, ({ 16: 'Hex', 10: 'Dec', 2: 'Bin' } as const)[b]);
      el.addEventListener('click', async () => {
        await events.setDataBase(b);
        for (const x of bases.children) x.classList.toggle('on', x === el);
      });
      return el;
    }));

    const close = h('button', { class: 'btn primary', type: 'button' }, 'Close');
    close.addEventListener('click', () => dialog.close());
    const aboutButton = h('button', { class: 'linkbtn', type: 'button' }, 'About · Licenses');
    aboutButton.addEventListener('click', () => { dialog.close(); events.about(); });
    dialog.replaceChildren(
      h('h2', {}, 'Settings'),
      h('div', { class: 'prow' }, h('span', {}, 'Font size'), h('span', { class: 'grow' }), minus, size, plus),
      h('small', { class: 'hint' }, '이번 실행에만 적용됩니다. Ctrl + / Ctrl − / Ctrl 0 키로도 바꿀 수 있습니다.'),
      h('div', { class: 'prow' }, h('span', {}, 'Data radix'), h('span', { class: 'grow' }), bases),
      h('small', { class: 'hint' }, 'Data 탭의 값을 이 진법으로 보여 줍니다. 이번 실행에만 적용됩니다.'),
      h('div', { class: 'row' }, aboutButton, h('span', { class: 'grow' }), close));
  };
  return { root: dialog, open: () => { render(); dialog.showModal(); } };
}
