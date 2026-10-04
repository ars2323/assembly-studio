/* Settings.  All of it for this run only: every start is from the
   defaults (lab PCs are shared; src/main/main.ts keeps nothing on disk).

     Font size        the code font, the UI font follows (Ctrl +/- too)
     Data radix       the base the Data tab shows its words in
     Language         KO / EN (i18n.ts), the same as the switches on the
                      first screen and in the status line
     Advanced         QtSpim's Settings and Run Parameters: machine options,
     (folded)         the program's arguments, the exception handler --
                      taken up by the next assemble. */

import type { MachineOptions } from '../../../../native/index.ts';
import { code, codeText, h } from '../dom.ts';
import { currentLang, onLang, setLang, tr, type Lang } from '../i18n.ts';
import { SETTINGS } from '../messages/settings.ts';

export type HandlerChoice = { kind: 'default' } | { kind: 'none' } | { kind: 'file'; name: string; text: string };

export interface Advanced {
  machine: MachineOptions;
  args: string;             // after argv[0] ("program.s"), split on blanks
  handler: HandlerChoice;
}

// QtSpim's defaults (native/index.ts DEFAULT_MACHINE; not imported: that
// module is the simulator process's).
export const defaultAdvanced = (): Advanced => ({
  machine: { acceptPseudo: true, delayedBranches: false, delayedLoads: false, mappedIo: false, quiet: false },
  args: '',
  handler: { kind: 'default' },
});

export const sameAdvanced = (a: Advanced, b: Advanced): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface SettingsEvents {
  fontSize(): number;
  setFontSize(px: number): Promise<number>;
  dataBase(): 2 | 10 | 16;
  setDataBase(base: 2 | 10 | 16): Promise<void>;
  advanced(): Advanced;
  setAdvanced(a: Advanced): void;
  pickHandler(): Promise<{ name: string; text: string } | null>;
  about(): void;
}

const MACHINE: { key: keyof MachineOptions; label: string }[] = [
  { key: 'acceptPseudo', label: 'Pseudo instructions' },
  { key: 'delayedBranches', label: 'Delayed branches' },
  { key: 'delayedLoads', label: 'Delayed loads' },
  { key: 'mappedIo', label: 'Mapped I/O' },
  { key: 'quiet', label: 'Quiet' },
];

// The Language row's control, KO | EN, like Data radix's (both ISAs' Settings).
export function languageControl(): HTMLElement {
  const seg = h('span', { class: 'seg', role: 'radiogroup', 'aria-label': 'Language' }, ...(['ko', 'en'] as Lang[]).map((l) => {
    const el = h('button', { type: 'button', role: 'radio', title: l === 'ko' ? '한국어' : 'English', 'aria-checked': String(currentLang() === l),
      class: currentLang() === l ? 'on' : '' }, l.toUpperCase());
    el.addEventListener('click', () => setLang(l));
    return el;
  }));
  return seg;
}

export function settingsDialog(events: SettingsEvents): { root: HTMLDialogElement; open(): void } {
  const dialog = h('dialog', { class: 'modal settings', 'aria-label': 'Settings' });
  // Its words in the other language at once (the KO/EN row is in it); Advanced stays open or shut.
  onLang(() => { if (dialog.open) render(dialog.querySelector<HTMLDetailsElement>('details.advanced')?.open); });

  const render = (wasOpen?: boolean) => {
    const adv = events.advanced();
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

    const change = (f: (a: Advanced) => void) => { const a = structuredClone(events.advanced()); f(a); events.setAdvanced(a); render(); };
    const box = (checked: boolean, disabled: boolean, onChange: (v: boolean) => void) => {
      const input = h('input', { type: 'checkbox', checked, disabled });
      input.addEventListener('change', () => onChange(input.checked));
      return input;
    };
    const machine = h('div', { class: 'opts' },
      h('label', { class: 'opt off' }, box(false, true, () => {}),
        h('span', {}, h('b', {}, 'Bare machine'), h('small', {}, codeText(tr(SETTINGS.machine.bare))))),
      ...MACHINE.map((m) => h('label', { class: 'opt' },
        box(adv.machine[m.key], false, (v) => change((a) => { a.machine[m.key] = v; })),
        h('span', {}, h('b', {}, m.label), h('small', {}, codeText(tr(SETTINGS.machine[m.key])))))));
    const args = h('input', { class: 'mono text', type: 'text', value: adv.args, spellcheck: 'false', 'aria-label': 'Program arguments' });
    args.addEventListener('change', () => change((a) => { a.args = args.value.trim(); }));
    const handlerRow = h('div', { class: 'radios' }, ...([
      ['default', 'Default (SPIM exceptions.s)'], ['none', ''], ['file', 'File…'],
    ] as const).map(([kind, label]) => {
      const radio = h('input', { type: 'radio', name: 'handler', checked: adv.handler.kind === kind });
      radio.addEventListener('change', async () => {
        if (kind === 'file') {
          const f = await events.pickHandler();
          if (f) change((a) => { a.handler = { kind: 'file', ...f }; });
          else render();
        } else change((a) => { a.handler = { kind }; });
      });
      return h('label', { class: 'radio' }, radio, kind === 'none' ? h('span', {}, codeText(tr(SETTINGS.handlerNone)))
        : kind === 'file' && adv.handler.kind === 'file' ? h('span', {}, 'File ', code(adv.handler.name)) : label);
    }));
    const reset = h('button', { class: 'btn small', type: 'button' }, 'Reset advanced');
    reset.addEventListener('click', () => { events.setAdvanced(defaultAdvanced()); render(); });
    const details = h('details', { class: 'advanced' },
      h('summary', {}, 'Advanced ', h('small', {}, tr(SETTINGS.advanced))),
      h('h4', {}, 'Machine'), machine,
      h('h4', {}, 'Run Parameters'),
      h('div', { class: 'row' }, h('span', { class: 'mono' }, 'program.s'), args),
      h('small', { class: 'hint' }, codeText(tr(SETTINGS.argv))),
      h('h4', {}, 'Exception handler'), handlerRow,
      h('div', { class: 'row end' }, reset));
    if (wasOpen ?? !sameAdvanced(adv, defaultAdvanced())) details.open = true;

    const close = h('button', { class: 'btn primary', type: 'button' }, 'Close');
    close.addEventListener('click', () => dialog.close());
    const aboutButton = h('button', { class: 'linkbtn', type: 'button' }, 'About · Licenses');
    aboutButton.addEventListener('click', () => { dialog.close(); events.about(); });
    dialog.replaceChildren(
      h('h2', {}, 'Settings'),
      h('div', { class: 'prow' }, h('span', {}, 'Font size'), h('span', { class: 'grow' }), minus, size, plus),
      h('small', { class: 'hint' }, tr(SETTINGS.fontSize)),
      h('div', { class: 'prow' }, h('span', {}, 'Data radix'), h('span', { class: 'grow' }), bases),
      h('small', { class: 'hint' }, tr(SETTINGS.dataRadix)),
      h('div', { class: 'prow' }, h('span', {}, 'Language'), h('span', { class: 'grow' }), languageControl()),
      h('small', { class: 'hint' }, tr(SETTINGS.language)),
      details,
      h('div', { class: 'row' }, aboutButton, h('span', { class: 'grow' }), close));
  };
  return { root: dialog, open: () => { render(); dialog.showModal(); } };
}
