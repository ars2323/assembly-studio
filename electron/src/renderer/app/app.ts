/* The window.

     title bar   the logo and the program's name in the middle; the
                 window's minimise / maximise / close buttons on the right,
                 drawn by the page (panels/caption.ts)
     toolbar     Save & Assemble, Run, its speed, Step, Reset (and the
                 Editor / Run tabs of a narrow window) from the left; the
                 tools (Tutorial, New, Open, Settings) at the right end
     work        the first screen (welcome.ts), then Editor | Run side by
                 side: a splitter between them, either side can be folded;
                 under the Editor the Assemble panel (what the last assemble
                 did: its time and what it made, or its errors)
     status bar

   The Run side shows the last program that assembled, from the first
   assemble on (before it, a card that says so).  Changing the code does not
   take it away -- the student changes code because of what the registers
   and the memory show: a band over the Run side says that what it shows is
   the last assembled code, and Run, Step and Reset go on with that program
   until the next assemble.  A program with errors is assembled first in a
   second process (src/main/engine-mips.ts, sim:check), so its errors leave the machine on
   screen as it was.  While the Editor holds the program in the machine, it
   marks the line being executed (the Text panel's line column: the core's
   own PC -> source mapping); once the code has changed it marks none (its
   lines are no longer the program's), and Text alone shows where PC is.

   Narrow windows (under NARROW_PX CSS pixels) show one side at a time, with
   Editor / Run tabs in the toolbar.

   Widths: the Run side first gets what Registers (Hex, Dec, Bin) and Text
   (Address, Encoding, Format, Instruction) need; the Editor takes 40% of
   the rest of the window, or less, never under 300 px (a lab PC: 1093 px in
   all).  The toolbar gives way in steps (fitBars): key hints, the buttons'
   icons, the speed as one button, tighter spacing -- the buttons keep their
   names.

   Nothing is restored from an earlier run: the font size, the Data radix,
   Ctrl+/-, the splitter and the folds are this run's only (src/main/main.ts
   keeps nothing on disk). */

import { parseAssemblerMessage, resolveMessageLine, simplified, type AssemblerMessage } from '../../core/asm-errors.ts';
import { hex32 } from '../../core/format.ts';
import { LabelMap, parseSymbolListing } from '../../core/symbols.ts';
import { generalRegisterName } from '../../core/registers.ts';
import type { Settings } from '../../main/main.ts';
import type { TextFileFormat } from '../../node/text-file.ts';
import type { RunResult } from '../../sim/protocol.ts';
import { brand } from '../../brand.ts';
import './api.ts';
import { asset, code, codeText, h, icon, markImg, monoCh, withHex } from './dom.ts';
import { themeSwitch } from './theme.ts';
import { currentLang, langSwitch, onLang, tr, words, type Words } from './i18n.ts';
import { DIALOGS } from './messages/dialogs.ts';
import { ASSEMBLE, STATUS } from './messages/assemble.ts';
import { STEPBACK } from './messages/stepback.ts';
import { backKeys, isStepBackKey, STEP_BACK_KEY } from './logic/stepback.ts';
import { captionButtons } from './panels/caption.ts';
import { notice } from './notice.ts';
import { assemblerHint, HINTS } from '../../core/near-miss.ts';
import { ASM_MESSAGES, spimMessage } from '../../core/asm-messages.ts';
import { precheckMips, type UnknownWord } from '../../core/precheck.ts';
import { createEditor } from './editor.ts';
import { tokenizeMipsLine } from '../../core/mips-syntax.ts';
import { shortName } from './logic/names.ts';
import { changedKeys, stateAfter, stopKeys, stopMessage, textRows, type RegisterValues, type RunState, type TextRow } from './logic/machine.ts';
import { ago, cell, clock, count, keys, lead, lines as lineList } from './cells.ts';
import { assembledState, busyState, errorList, freshState, type AsmError } from './panels/assemble.ts';
import { aboutDialog } from './panels/about.ts';
import { ConsolePanel } from './panels/console.ts';
import { Inspector } from './panels/inspector.ts';
import { RegisterPanel } from './panels/registers.ts';
import { defaultAdvanced, sameAdvanced, settingsDialog, type Advanced } from './panels/settings.ts';
import { TextPanel } from './panels/text.ts';
import { welcome } from './panels/welcome.ts';
import { ask } from './panels/ask.ts';
import { Tutorial, type Example, type Signal } from './tutorial/engine.ts';
import { CHAPTERS } from './tutorial/steps.ts';
import type { DataSection } from './panels/data.ts';
import { panelHead } from './ui.ts';

const api = window.app;
const UNTITLED = 'untitled.s';
const APP_NAME = brand.name;
const WINDOW_TITLE = `${brand.name} · MIPS`; // the ISA this window is for (?isa=)
// Below this width (CSS px) the Editor and Run sides take turns.  A lab PC
// (1366x768 at 125%) gives 1093: still side by side.  1366 at 150% gives
// 910, and a half-screen window on a 1920 display 960: one at a time.
const NARROW_PX = 980;

// ---- state ------------------------------------------------------------------

let open = false;                      // a document is open (past the first screen)
// `example`: one of the tutorial's, read-only, never saved.
let file: { name: string; path: string | null; format: TextFileFormat | null; example?: Example } = { name: UNTITLED, path: null, format: null };
let dirty = false;  // changes not saved (the title bar's dot)
let edited = false; // the Editor's text is not the program in the machine (the band, no PC line)
let settings: Settings = { fontSize: 13, dataBase: 16 };
let zoom = 0;                          // Ctrl+/-: this session only
let assembledText: string | null = null; // the program the machine holds
// The last program that assembled and how (Reset loads it again, also after a crash).
// The program on the machine, as it was assembled: Reset reloads it, Export writes its image.
let lastGood: { source: string; options: ReturnType<typeof assembleOptions>; name: string; path: string | null; format: TextFileFormat | null } | null = null;
let lastAssembly: { at: Date; instructions: number } | null = null; // for the Assemble panel
let failedAt: Date | null = null;      // the last assemble that had errors (the Assemble panel)
let assembling = false;                // an assemble taking long enough to say so
let runState: RunState = 'ready';
let busy = false;                      // a call is on its way; keys wait
let steps = 0;
let lastRegs: RegisterValues | null = null;
let rows: TextRow[] = [];
let selected = -1;
const breakpoints = new Set<number>();
const labels = new LabelMap();          // the program's, for Data
let resumeWith: 'run' | 'step' = 'run';
// An assemble's errors: the assembler's messages; a word the pre-check
// found (core/precheck.ts: the engine was not asked); or the assembler's
// process ending on the program (crashed).
let errors: { message: AssemblerMessage; line: number; unknown?: UnknownWord; crashed?: boolean }[] = [];
let saveNote: Words = '';  // what Ctrl+S did with the file: shown until the first step
let saveWarn = false;  // ...and whether it is a warning (not saved)
let note: Words = '';                   // a one-off word in the status bar (breakpoints)
let exportNote: Words = '';             // the same, for an export that went well
let crashNote: Words = '';
let progress: { pc: number; instructions: number } | null = null;
let lastReason: RunResult['reason'] = 'limit';
let undo = 0;                          // how many instructions Step back can undo (the engine says)
let back: { io: boolean } | null = null; // the last thing done was a step back (the status bar)
let changedNow: string[] = []; // the registers the last step or run changed: the yellow rows
let narrow = false;
let view: 'editor' | 'run' = 'editor'; // narrow windows: the side on show
let editorWidth: number | null = null; // px, from the splitter; null: the default share
let consoleHeight: number | null = null; // px, from the grip over the Console; null: the default
let regsWidth: number | null = null;     // px, from the splitter right of Registers; null: the default
let textHeight: number | null = null;    // px, from the grip between Text/Data and the Inspector; null: half each
let asmHeight: number | null = null;     // px, from the grip over the Assemble panel; null: its words'
let speed: 'fast' | 'slow' = 'fast';   // this session only
let slow: { cancel(): void } | null = null; // a slow run going on
let switchTo: 'fast' | 'slow' | null = null; // a run being switched to the other speed

// ---- the title bar and the toolbar -----------------------------------------------

function button(label: string, ic: string, key: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'btn', type: 'button', title: key ? `${label} (${key})` : label }, icon(ic),
    h('span', { class: 'label' }, label), key ? h('kbd', {}, key) : null);
  b.addEventListener('click', onClick);
  return b;
}
function iconButton(title: string, ic: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'iconbtn', type: 'button', title, 'aria-label': title }, icon(ic));
  b.addEventListener('click', onClick);
  return b;
}

const fileLabel = h('span', { class: 'file' });
const bAssemble = button('Save & Assemble', 'hammer', 'Ctrl+S', () => void saveAndAssemble());
const bRun = button('Run', 'play', 'F5', () => void runOrStop());
const bStep = button('Step', 'step-forward', 'F10', () => void step());
// Step back: undoes the last instruction executed.  Its tooltip says what
// it cannot undo, in the language in use.
const bBack = button('Step back', 'step-back', STEP_BACK_KEY, () => void stepBack());
const backTitle = () => { bBack.title = tr(STEPBACK.tooltip); };
backTitle();
onLang(backTitle);
const bRestart = button('Reset', 'rotate-ccw', '', () => void restart());
bAssemble.dataset.tut = 'assemble';
bRun.dataset.tut = 'run';
bStep.dataset.tut = 'step';
bRestart.dataset.tut = 'reset';
bBack.dataset.tut = 'stepback';
// The speed of Run: Instant (the core runs on its own) or one line a second.
const speedFast = h('button', { type: 'button', role: 'radio', title: 'Run at full speed' }, 'Instant');
const speedSlow = h('button', { type: 'button', role: 'radio', title: 'Run one line a second' }, '1 line/s');
speedFast.addEventListener('click', () => void setSpeed('fast'));
speedSlow.addEventListener('click', () => void setSpeed('slow'));
const speedSwitch = h('span', { class: 'seg speed', role: 'radiogroup', 'aria-label': 'Run speed' }, speedFast, speedSlow);
// A narrow toolbar: the same choice as one button that says what it is.
const speedOne = h('button', { class: 'btn speedone', type: 'button', title: 'Run speed (Instant / 1 line/s): click to switch' });
speedOne.addEventListener('click', () => void setSpeed(speed === 'fast' ? 'slow' : 'fast'));
const speedBox = h('span', { class: 'speedbox' }, h('span', { class: 'speedlabel' }, 'Run speed'), speedSwitch, speedOne);
// A thin line between two groups of the toolbar.
const divider = (cls = ''): HTMLElement => h('span', { class: `tsep${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true' });
const runctl = h('span', { class: 'runctl' }, bAssemble, divider(), bRun, speedBox, bStep, bBack, divider(), bRestart);
const bSettings = iconButton('Settings', 'settings', () => settingsBox.open());
// The assembled program as an executable image (.asx, docs/asx-format.md).
const bExport = iconButton('Export executable image (.asx)', 'file-output', () => void exportImage());
const viewEditor = h('button', { type: 'button', role: 'tab' }, 'Editor');
const viewRun = h('button', { type: 'button', role: 'tab' }, 'Run');
viewEditor.addEventListener('click', () => showView('editor'));
viewRun.addEventListener('click', () => showView('run'));
const viewSwitch = h('span', { class: 'seg viewswitch', role: 'tablist', hidden: true }, viewEditor, viewRun);
// The title bar: the mark and the program's name, nothing else (it moves the window).
const titlebar = h('header', { class: 'titlebar' },
  h('span', { class: 'brand' },
    markImg('logo'),
    h('span', { class: 'appname' }, APP_NAME)),
  captionButtons(api));
// The toolbar under it: everything that is pressed.
const tools = h('span', { class: 'tools' },
  iconButton('Tutorial', 'circle-question-mark', () => void startTutorial()),
  divider(),
  iconButton('New file', 'file-plus', () => void newFile()),
  iconButton('Open file (Ctrl+O)', 'folder-open', () => void openFile()),
  bExport,
  divider(),
  bSettings);
const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Toolbar' },
  runctl,
  divider('forview'),
  viewSwitch,
  h('span', { class: 'drag' }),
  tools);
const brandMark = titlebar.querySelector<HTMLElement>('.brand')!;
const status = h('footer', { class: 'status' });
// The KO/EN and light/dark switches at the status line's right end (i18n.ts,
// theme.ts); kept across its re-renders.
const statusTheme = h('span', { class: 'stheme' }, langSwitch(), themeSwitch());

// ---- the first screen ------------------------------------------------------------

const firstScreen = welcome({
  tutorial: () => void startTutorial(), newFile: () => void newFile(), openFile: () => void openFile(),
  selectIsa: (isa, then) => api.selectIsa(isa, then),
});
const stageWelcome = h('div', { class: 'stage-welcome' }, firstScreen.root);

// ---- the Editor side -------------------------------------------------------------------

const editorHost = h('div', { class: 'pbody edhost' });
// Under the Editor: what the last assemble did (renderAssemble).  Named after
// the button that fills it (Save & Assemble): not only errors.
const asmHead = panelHead('Assemble');
const asmBody = h('div', { class: 'pbody abody' });
const asmPanel = h('section', { class: 'panel asm', 'aria-label': 'Assemble' }, asmHead.root, asmBody);
const editor = createEditor(editorHost, tokenizeMipsLine, () => void saveAndAssemble(), () => {
  if (!dirty || !edited) { dirty = true; edited = true; renderChrome(); }
}, (line, on) => void editorBreakpoint(line, on));
const editorHead = panelHead('Editor');
const editorPanel = h('section', { class: 'panel editor-panel', 'aria-label': 'Editor' }, editorHead.root, editorHost);

// ---- the Run side ----------------------------------------------------------------------

const text = new TextPanel({
  select: (addr) => { select(addr); emit({ kind: 'select', addr }); },
  toggleBreakpoint: (addr) => void toggleBreakpoint(addr),
});
text.onTab = (tab) => { if (tab === 'data') void refreshData(); emit({ kind: 'tab', tab }); };
const inspector = new Inspector();
const consolePanel = new ConsolePanel();
consolePanel.onInput = (line) => void giveInput(line);
consolePanel.onToggle = () => layout();
const regsHost = h('div', { class: 'regshost' });
let registers: RegisterPanel | null = null;
// Between Text/Data and the Inspector, a grip like the Console's.
const centreGrip = h('div', { class: 'vgrip', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize · double-click to reset' },
  h('span', { class: 'grip' }));
const centre = h('div', { class: 'centre' }, text.root, centreGrip, inspector.root);
// Registers over the Console on the left, Text/Data over the Inspector on
// the right: both of those get the whole height (a lab PC has ~480 px).
// Between Registers and the Console, a grip: drag to share the height,
// double-click for the default (the Console as tall as its words while it
// is empty, its share once there is output: app.css).
const consoleGrip = h('div', { class: 'vgrip', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize · double-click to reset' },
  h('span', { class: 'grip' }));
const leftCol = h('div', { class: 'leftcol' }, regsHost, consoleGrip, consolePanel.root);
// Between Registers (with the Console) and Text/Inspector, a splitter like the Editor's.
const regsSplitter = h('div', { class: 'splitter rsplit', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize · double-click to reset' },
  h('span', { class: 'grip' }));
const runGrid = h('div', { class: 'run-grid' }, leftCol, regsSplitter, centre);
const placeholder = h('div', { class: 'run-placeholder notice-host' });
// Once the code in the Editor is not the program in the machine: one line
// over the Run side, covering nothing.
const runPanel = h('div', { class: 'run-side' }, placeholder, runGrid);

// ---- the split -------------------------------------------------------------------------

const railEditor = h('button', { class: 'rail', type: 'button', title: 'Expand Editor', 'aria-label': 'Expand Editor' }, h('span', {}, 'Editor ›'));
const railRun = h('button', { class: 'rail', type: 'button', title: 'Expand Run', 'aria-label': 'Expand Run' }, h('span', {}, '‹ Run'));
railEditor.addEventListener('click', () => unfold());
railRun.addEventListener('click', () => unfold());
// The splitter: drag to share the width, double-click for the default
// share; its two small buttons fold one side away (a rail brings it back).
const foldEditor = h('button', { class: 'foldbtn', type: 'button', title: 'Collapse Editor', 'aria-label': 'Collapse Editor' }, '‹');
const foldRun = h('button', { class: 'foldbtn', type: 'button', title: 'Collapse Run', 'aria-label': 'Collapse Run' }, '›');
foldEditor.addEventListener('click', () => fold('editor'));
foldRun.addEventListener('click', () => fold('run'));
const splitter = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize · double-click to reset' },
  foldEditor, h('span', { class: 'grip' }), foldRun);
// Between the Editor and the Assemble panel, a grip like the Console's.
const asmGrip = h('div', { class: 'vgrip', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize · double-click to reset' },
  h('span', { class: 'grip' }));
const paneEditor = h('div', { class: 'pane pane-editor' }, editorPanel, asmGrip, asmPanel, railEditor);
const paneRun = h('div', { class: 'pane pane-run' }, runPanel, railRun);
const split = h('div', { class: 'split' }, paneEditor, splitter, paneRun);
const work = h('main', { class: 'work' }, stageWelcome, split);

document.body.append(h('div', { class: 'app' }, titlebar, toolbar, work, status));

let folded: 'none' | 'editor' | 'run' = 'none';
function fold(side: 'editor' | 'run'): void { folded = side; layout(); }
function unfold(): void { folded = 'none'; layout(); }

splitter.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('.foldbtn')) return;
  splitter.setPointerCapture(e.pointerId);
  const left = split.getBoundingClientRect().left;
  const move = (m: PointerEvent) => {
    const total = split.clientWidth;
    editorWidth = Math.max(280, Math.min(total - 360, m.clientX - left));
    layout();
  };
  const up = () => { splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', up); };
  splitter.addEventListener('pointermove', move);
  splitter.addEventListener('pointerup', up);
});
splitter.addEventListener('dblclick', () => { editorWidth = null; layout(); });

consoleGrip.addEventListener('pointerdown', (e) => {
  if (!consolePanel.expanded) consolePanel.setExpanded(true); // folded: a drag opens it
  consoleGrip.setPointerCapture(e.pointerId);
  const bottom = leftCol.getBoundingClientRect().bottom;
  const move = (m: PointerEvent) => {
    // At least the Console's head and a line; Registers keeps its head and a few rows.
    consoleHeight = Math.round(Math.max(72, Math.min(leftCol.clientHeight - 8 - 120, bottom - m.clientY)));
    layout();
  };
  const up = () => { consoleGrip.removeEventListener('pointermove', move); consoleGrip.removeEventListener('pointerup', up); };
  consoleGrip.addEventListener('pointermove', move);
  consoleGrip.addEventListener('pointerup', up);
});
consoleGrip.addEventListener('dblclick', () => { consoleHeight = null; layout(); });

// A drag on a separator: pointer capture, a value from the pointer, layout() on every move.
function dragSeparator(el: HTMLElement, onMove: (m: PointerEvent) => void): void {
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => { onMove(m); layout(); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}
// Registers' width: at least what its narrowest columns need, and Text keeps its least.
dragSeparator(regsSplitter, (m) => {
  const box = runGrid.getBoundingClientRect();
  const least = parseFloat(runGrid.style.getPropertyValue('--regs-least')) || 300;
  const textLeast = Math.max(text.leastWidth(fontPx()), 240);
  regsWidth = Math.round(Math.max(least * 0.7, Math.min(box.width - 8 - textLeast, m.clientX - box.left)));
});
regsSplitter.addEventListener('dblclick', () => { regsWidth = null; layout(); });
// Text/Data's height over the Inspector: each keeps a head and a few rows.
dragSeparator(centreGrip, (m) => {
  const box = centre.getBoundingClientRect();
  textHeight = Math.round(Math.max(110, Math.min(box.height - 8 - 110, m.clientY - box.top)));
});
centreGrip.addEventListener('dblclick', () => { textHeight = null; layout(); });

asmGrip.addEventListener('pointerdown', (e) => {
  asmGrip.setPointerCapture(e.pointerId);
  const bottom = paneEditor.getBoundingClientRect().bottom;
  const move = (m: PointerEvent) => {
    // At least the panel's head and a line; the Editor keeps its least (layout()).
    asmHeight = Math.round(Math.max(ASM_LEAST, Math.min(asmRoom(), bottom - m.clientY)));
    layout();
  };
  const up = () => { asmGrip.removeEventListener('pointermove', move); asmGrip.removeEventListener('pointerup', up); };
  asmGrip.addEventListener('pointermove', move);
  asmGrip.addEventListener('pointerup', up);
});
asmGrip.addEventListener('dblclick', () => { asmHeight = null; layout(); });

function showView(v: 'editor' | 'run'): void {
  view = v;
  layout();
  if (v === 'editor') requestAnimationFrame(() => editor.view.focus());
}

// ---- layout ------------------------------------------------------------------------------

function measure(): void {
  const wasNarrow = narrow;
  narrow = window.innerWidth < NARROW_PX;
  document.documentElement.dataset.narrow = String(narrow);
  if (!registers) buildRegisters();
  void wasNarrow;
  layout();
  fitBars();
}

function buildRegisters(): void {
  registers = new RegisterPanel(lastRegs ?? ZERO_REGS);
  regsHost.replaceChildren(registers.root);
  registers.onMark = (m) => emit(m); // a star, an alias: the tutorial waits for them
}

// The Run side shows the machine from the first assemble on; the Editor's
// code is the machine's program only until it changes.
const machineShown = () => assembledText !== null;
const current = () => assembledText !== null && !edited;

// Heights on the Editor side: the Editor keeps EDITOR_LEAST_LINES whole
// lines of code (and its head) whatever the Assemble panel says.  The panel
// is as tall as its words -- up to ASM_SHARE of the column (never less than
// ASM_AUTO: one error and its button), the list scrolling past that -- and
// the grip may make it as tall as leaves the Editor its least.
const EDITOR_LEAST_LINES = 6;
const ASM_LEAST = 64;
const ASM_AUTO = 240;
const ASM_SHARE = 0.4;
const editorLeast = (): number => {
  const head = (editorPanel.querySelector('.phead') as HTMLElement).offsetHeight || 36;
  const line = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) || 22;
  return Math.ceil(head + EDITOR_LEAST_LINES * line + 22); // 22: borders, the text's top padding, a sideways scroll bar
};
const asmRoom = (): number => Math.max(ASM_LEAST, paneEditor.clientHeight - editorLeast() - 8);

function layout(): void {
  stageWelcome.hidden = open;
  document.body.classList.toggle('first-screen', !open); // its bars over the board (app.css)
  split.hidden = !open;
  /* After the two stages have been shown and hidden, never before: showing
     the first screen measures the card to put the board's pins on it, and
     with the Editor side still laid out the card stands somewhere else
     (coming back from the tutorial, the board kept a hole above the card). */
  firstScreen.show(!open);
  viewSwitch.hidden = !open || !narrow;
  split.classList.toggle('narrow', narrow);
  split.dataset.view = view;
  split.dataset.folded = narrow ? 'none' : folded;
  viewEditor.classList.toggle('on', view === 'editor');
  viewRun.classList.toggle('on', view === 'run');
  sizeRunSide();
  const inner = split.clientWidth - 16 - 8; // the split's padding, the splitter
  if (editorWidth !== null) split.style.setProperty('--editor-w', `${editorWidth}px`);
  else if (inner > 0) split.style.setProperty('--editor-w', `${Math.round(Math.max(300, Math.min(editorMost(), inner - runLeast)))}px`);

  const shown = machineShown();
  runGrid.hidden = !shown;
  placeholder.hidden = shown;
  if (!shown) renderPlaceholder();
  renderAssemble();
  runGrid.classList.toggle('console-open', consolePanel.expanded);
  if (regsWidth === null) runGrid.style.removeProperty('--regs-w');
  else runGrid.style.setProperty('--regs-w', `${regsWidth}px`);
  if (textHeight === null) centre.style.removeProperty('--text-h');
  else centre.style.setProperty('--text-h', `${textHeight}px`);
  if (consoleHeight === null) leftCol.style.removeProperty('--console-h');
  else leftCol.style.setProperty('--console-h', `${consoleHeight}px`);
  const room = asmRoom();
  const cap = asmHeight === null ? Math.min(room, Math.max(ASM_AUTO, Math.round(ASM_SHARE * paneEditor.clientHeight))) : room;
  paneEditor.style.setProperty('--asm-max', `${cap}px`);
  if (asmHeight === null) paneEditor.style.removeProperty('--asm-h');
  else paneEditor.style.setProperty('--asm-h', `${Math.min(asmHeight, room)}px`);
  // The line being executed, in the Editor only while its code is the
  // program's: once it has changed its lines are not the program's lines.
  editor.showPcLine(current() && runState !== 'ready' ? pcSourceLine() : null);
}

// The Editor's width by default: what a line of EDITOR_COLUMNS characters
// needs (gutters and all), and no more -- a student's longest line is far
// shorter, and every pixel past that is a pixel the Run side reads with:
// Text's Source column and the Inspector are what grow with the window.
// Never a share of the window: a share is right at one width only.
// The character's width is measured with the code font itself, at the
// Editor's size (dom.ts monoCh; not CodeMirror's own figure, which can be
// taken before the font has loaded), and the layout is done again once the
// fonts are in (below, "fonts").
const EDITOR_COLUMNS = 72;
const editorMost = (): number => (editorPanel.offsetWidth - editorHost.clientWidth) + editor.widthFor(EDITOR_COLUMNS, monoCh(fontPx() + 0.5));

// The Run side's width: what Registers and Text need (their panels say).
let runLeast = 0;
const fontPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 13;
function sizeRunSide(): void {
  if (!registers) return;
  const fs = fontPx();
  const r = registers.widths(fs);
  runGrid.style.setProperty('--regs-least', `${r.least}px`);
  runGrid.style.setProperty('--regs-most', `${r.most}px`);
  // Text needs its four columns; Data its four words and the ASCII column --
  // where the window has the room (the Editor stays at 300 px or more).
  runLeast = r.least + 8 + Math.max(text.leastWidth(fs), text.data.leastWidth(fs));
}

// The Run side before there is a program to show: not assembled yet, the
// first assemble had errors, or the simulator stopped (a crash).
function renderPlaceholder(): void {
  const kind = crashNote ? 'crashed' : errors.length ? 'failed' : 'fresh';
  const p = ASSEMBLE.placeholder;
  const [title, body] = kind === 'crashed' ? [tr(p.crashedTitle), tr(p.crashedBody)]
    : kind === 'failed' ? [tr(p.failedTitle), tr(p.failedBody, narrow)]
    : [tr(p.freshTitle), tr(p.freshBody)];
  const key = JSON.stringify([kind, title, body, assembleName(false)]);
  if (placeholder.dataset.key === key) return;
  placeholder.dataset.key = key;
  const go = h('button', { class: 'btn primary', type: 'button' }, icon('hammer'), h('span', {}, assembleName(false)), h('kbd', {}, 'Ctrl+S'));
  go.addEventListener('click', () => void saveAndAssemble());
  // The words first, then Haram at the far end from the Editor they are about.
  placeholder.replaceChildren(notice({ title, body, more: [h('div', { class: 'row' }, go)] }));
  placeholder.dataset.kind = kind;
}

// The Assemble panel: a row of cells -- the state, what the assemble made,
// what Ctrl+S did with the file, when -- and under it what to do next; with
// errors, the list.  Before any assemble, what Ctrl+S will do.  Drawn again
// only when what it says changes (a list the student has scrolled stays
// where it is).
let asmKey = '';
function renderAssemble(): void {
  const key = JSON.stringify([errors.map((e) => [e.line, e.message.message, e.message.source]), lastAssembly?.at.getTime() ?? null,
    lastAssembly?.instructions ?? null, failedAt?.getTime() ?? null, assembling, edited, machineShown(), words(saveNote), saveWarn, saves(), narrow,
    currentLang()]);
  if (key === asmKey) return;
  asmKey = key;
  asmPanel.dataset.state = assembling ? 'busy' : errors.length ? 'errors' : lastAssembly ? (edited ? 'changed' : 'ok') : 'fresh';
  asmHead.setMeta('');
  asmBody.replaceChildren(assembling ? busyState()
    : errors.length ? errorList({
      errors: errors.map(asmError),
      at: failedAt, kept: machineShown(), narrow, goTo: (n) => goToErrorLine(n), toEditor: () => showView('editor'),
    })
    : lastAssembly ? assembledState({ instructions: lastAssembly.instructions, at: lastAssembly.at, saveNote: words(saveNote), saveWarn })
    : freshState(saves(), words(saveNote), saveWarn));
}

// An error as the list shows it, in the language in use: the window's short
// words for the assembler's message (core/asm-messages.ts) with its own
// beside them, the line's text, and what is wrong on it.
function asmError(e: (typeof errors)[number]): AsmError {
  const lang = currentLang();
  if (e.unknown) {
    const w = e.unknown;
    return { line: e.line, message: tr(w.kind === 'directive' ? ASM_MESSAGES.unknownDirective : ASM_MESSAGES.unknownInstruction),
      raw: '', source: w.source, hint: tr(HINTS.unknown[w.kind], w.token) };
  }
  if (e.crashed) {
    const source = e.line > 0 && e.line <= editor.view.state.doc.lines ? editor.view.state.doc.line(e.line).text.trim() : '';
    return { line: e.line, message: tr(ASM_MESSAGES.stopped), raw: e.message.message, source, hint: tr(ASM_MESSAGES.stoppedHint, e.line) };
  }
  const m = e.message;
  const short = spimMessage(m.message, lang);
  return { line: e.line, message: short ?? m.message, raw: short ? m.message : '', source: m.source, hint: assemblerHint(m.message, m.source, lang) };
}

// The Editor line of PC: the Text row's line, or that of the source line a
// pseudo instruction's later words belong to.  Only the student's own lines:
// the start-up code comes from the exception handler, whose line numbers
// are not the Editor's (the row's source text must be on that line).
function pcSourceLine(): number | null {
  return lastRegs ? lineOf(lastRegs.pc) : null;
}

function lineOf(addr: number): number | null {
  let i = rows.findIndex((r) => r.addr === addr);
  if (i < 0 || rows[i].kernel) return null;
  while (i > 0 && rows[i].line === 0) i -= 1;
  return userLine(rows[i]) ? rows[i].line : null;
}

// The row's source line is one of the Editor's (not the start-up code's).
function userLine(row: TextRow): boolean {
  if (row.kernel || row.line === 0 || row.line > editor.view.state.doc.lines || !row.source) return false;
  return simplified(editor.view.state.doc.line(row.line).text).includes(simplified(row.source));
}

// The first word of an Editor line, if the line made any.
const addressOfLine = (line: number): number | null => rows.find((r) => r.line === line && userLine(r))?.addr ?? null;

const ZERO_REGS: RegisterValues = {
  pc: 0, hi: 0, lo: 0, epc: 0, cause: 0, badVAddr: 0, status: 0, general: new Array(32).fill(0), fp: new Array(32).fill(0),
};

// ---- font size ---------------------------------------------------------------------

function applyFont(): void {
  const fs = Math.max(10, Math.min(24, settings.fontSize + zoom));
  const root = document.documentElement.style;
  root.setProperty('--fs', `${fs}px`);
  root.setProperty('--row', `${Math.round(fs * 1.7)}px`);
  root.setProperty('--rrow', `${Math.round(fs * 1.62)}px`);
  text.relayout();
  text.fit();
  registers?.fit();
  editor.view.requestMeasure();
  fitBars(); // the bars' words grow with the font: fit again (before 2.7.0 it kept the default font's steps)
}

// ---- settings and about -----------------------------------------------------------

// 고급: this session only, from QtSpim's defaults at every start.  `applied`
// is what the machine on screen was assembled with.
let advanced: Advanced = defaultAdvanced();
let applied: Advanced = defaultAdvanced();

const about = aboutDialog();
// The Data tab's radix: from Settings or from the tab's own Hex · Dec · Bin (panels/data.ts).
async function setDataBase(base: 2 | 10 | 16): Promise<void> {
  settings = await api.setSettings({ ...settings, dataBase: base });
  if (text.tab === 'data') void refreshData();
}
text.data.onBase = (base) => void setDataBase(base);
const settingsBox = settingsDialog({
  fontSize: () => settings.fontSize,
  setFontSize: async (px) => {
    settings = await api.setSettings({ ...settings, fontSize: Math.max(10, Math.min(24, px)) });
    applyFont();
    return settings.fontSize;
  },
  dataBase: () => settings.dataBase,
  setDataBase: (base) => setDataBase(base),
  advanced: () => advanced,
  setAdvanced: (a) => { advanced = a; renderStatus(); },
  pickHandler: () => api.openHandler(),
  about: () => void about.open(),
});
document.body.append(settingsBox.root, about.root);

const assembleOptions = (a: Advanced) => ({
  fileName: file.name,
  machine: a.machine,
  run: { argv: ['program.s', ...a.args.split(/\s+/).filter(Boolean)], env: [] },
  handler: a.handler.kind === 'default' ? undefined : a.handler.kind === 'none' ? null : a.handler.text,
});

// ---- chrome: the bars --------------------------------------------------------------------

function renderChrome(): void {
  document.title = open ? `${file.name}${dirty ? ' •' : ''} — ${WINDOW_TITLE}` : APP_NAME; // the first screen is no ISA's yet
  showFileName(FILE_MOST);
  const running = runState === 'running';
  const setBtn = (b: HTMLButtonElement, on: boolean, primary: boolean) => {
    b.disabled = !on;
    b.classList.toggle('primary', primary && on);
  };
  setBtn(bAssemble, open && !running, !current());
  bRun.replaceChildren(icon(running ? 'square' : 'play'), h('span', { class: 'label' }, running ? 'Stop' : 'Run'),
    h('kbd', {}, running ? 'Esc' : 'F5'));
  bRun.title = running ? 'Stop (Esc)' : 'Run (F5)';
  setBtn(bRun, open && (running || (runState !== 'finished' && runState !== 'input')), running);
  setBtn(bStep, open && !running && runState !== 'finished', current() && !running);
  setBtn(bBack, open && !running && assembledText !== null && undo > 0, false);
  setBtn(bRestart, lastGood !== null && !busy, false);
  bExport.hidden = !open;
  bExport.disabled = lastGood === null || busy;
  speedFast.classList.toggle('on', speed === 'fast');
  speedSlow.classList.toggle('on', speed === 'slow');
  speedFast.setAttribute('aria-checked', String(speed === 'fast'));
  speedSlow.setAttribute('aria-checked', String(speed === 'slow'));
  speedOne.replaceChildren(h('span', { class: 'label' }, h('span', { class: 'pre' }, 'Speed: '), speed === 'fast' ? 'Instant' : '1 line/s'));
  // No file, nothing to run: the first screen has no toolbar (and no row for it: app.css).
  toolbar.hidden = !open;
  // The file's name, and beside it a dot while it has changes not saved (as an editor's tab shows it).
  editorHead.setMeta(open ? h('span', {}, code(file.name),
    dirty ? h('span', { class: 'unsaved', title: 'Unsaved changes', 'aria-label': 'Unsaved changes' }) : '',
    ` · ${file.format?.encoding ?? 'UTF-8'} · ${file.format?.lineEnd ?? 'LF'}`) : '');
  layout();
  renderStatus();
  fitBars();
}

// The file's name in the title bar, at most `cols` columns (logic/names.ts);
// the whole name in its tooltip.
const FILE_MOST = 32;
const FILE_LEAST = 10;
function showFileName(cols: number): void {
  fileLabel.title = open ? file.name : '';
  fileLabel.replaceChildren(open ? h('b', { class: 'mono' }, shortName(file.name, cols)) : '',
    open && dirty ? h('span', { class: 'dirty', title: 'Unsaved changes' }, ' •') : '');
}

// The Assemble button's name says what it does: Save & Assemble -- Ctrl+S
// saves the file (a new one asks where to) and assembles it -- but only
// Assemble for the tutorial's examples, which are never saved (the status
// bar says so), and in a toolbar too narrow for the long name (the
// "short" step below; the tooltip still says Save & Assemble).
const saves = (): boolean => !file.example;
const assembleName = (short: boolean): string => (saves() && !short ? 'Save & Assemble' : 'Assemble');
function nameAssemble(): void {
  (bAssemble.querySelector('.label') as HTMLElement).textContent = assembleName(toolbar.classList.contains('short'));
  bAssemble.title = saves() ? 'Save & Assemble (Ctrl+S)' : tr(ASSEMBLE.exampleTitle);
}

// The toolbar gives way one step at a time, as far as it has to: the key
// hints, the buttons' icons (their names stay), Save & Assemble's "Save &",
// the speed as one button, tighter spacing, and, a big font in a narrow
// window, the buttons' names (their icons back; TOOL_LAST), then their
// icons' size.  Every button keeps its border.  All measured: the font
// takes room at any width, so the font's changes fit it again too.  It
// fits when the tools end inside its padding (scrollWidth does not count
// what spills into padding).
// The title bar holds the mark and the name alone: only a window too
// narrow for them beside the caption buttons loses the name, then the mark.
const TOOL_STEPS = ['nokeys', 'noicons', 'short', 'onespeed', 'tighter'] as const;
const TOOL_LAST = ['iconsonly', 'smallicons'] as const;
function fitBars(): void {
  fitBrand();
  const end = () => toolbar.getBoundingClientRect().right - parseFloat(getComputedStyle(toolbar).paddingRight);
  const fits = () => tools.getBoundingClientRect().right <= end() + 0.5;
  toolbar.classList.remove(...TOOL_LAST);
  for (let level = 0; level <= TOOL_STEPS.length; level += 1) {
    TOOL_STEPS.forEach((step, k) => toolbar.classList.toggle(step, k < level));
    nameAssemble();
    if (toolbar.hidden || fits()) return;
  }
  for (let level = 1; level <= TOOL_LAST.length; level += 1) {
    TOOL_LAST.forEach((step, k) => toolbar.classList.toggle(step, k < level));
    if (fits()) return;
  }
}
function fitBrand(): void {
  // The centred mark and name end before the caption buttons.
  const caption = titlebar.querySelector('.caption') as HTMLElement;
  const end = () => caption.getBoundingClientRect().left - 8;
  const fits = () => brandMark.getBoundingClientRect().right <= end() + 0.5;
  titlebar.classList.remove('noapp', 'nobrand');
  if (fits()) return;
  titlebar.classList.add('noapp');
  if (fits()) return;
  titlebar.classList.add('nobrand');
}
window.addEventListener('resize', () => fitBars());

// The status bar: cells (cells.ts), the state first -- what the machine
// did last and where PC is -- then the steps, the registers it changed,
// the instruction chosen in Text, a word about the file or the settings;
// at the far end the keys that go on from here.
function renderStatus(): void {
  const parts: HTMLElement[] = [];
  let hints: [string, string][] = [];
  if (crashNote) parts.push(lead('err', words(crashNote)));
  if (!open) parts.push(lead('idle', tr(STATUS.ready)));
  else if (assembledText === null) {
    if (errors.length) {
      parts.push(lead('err', tr(ASSEMBLE.errors, errors.length)));
      const e = asmError(errors[0]);
      parts.push(cell('', e.line ? `${tr(ASSEMBLE.line, e.line)} · ` : '', withHex(e.message)));
    } else parts.push(lead('idle', tr(edited ? STATUS.edited : ASSEMBLE.notAssembled)));
    if (saveNote) parts.push(cell(saveWarn ? 'warn' : '', words(saveNote)));
    hints = [['Ctrl+S', assembleName(false)]];
  } else {
    const pc = lastRegs ? hex32(lastRegs.pc) : '';
    if (runState === 'running' && slow) {
      parts.push(lead('run', tr(STATUS.slowRun)));
      if (steps > 0) parts.push(cell('', count(steps, STATUS.steps)));
      if (pc) parts.push(cell('', 'PC ', code(pc)));
      if (changedNow.length) parts.push(changedPart());
      hints = [['Esc', 'Stop'], ['', tr(STATUS.keys.instant)]];
    } else if (runState === 'running') {
      parts.push(lead('run', tr(STATUS.running)));
      if (progress) parts.push(cell('', 'PC ', code(hex32(progress.pc))), cell('', count(progress.instructions, ASSEMBLE.instructions)));
      hints = [['Esc', 'Stop']];
    } else {
      const reason = lastReason;
      if (back && runState === 'paused') {
        parts.push(lead('run', codeText(tr(STATUS.stepBack, pc))));
        if (back.io) parts.push(cell('', tr(STATUS.backIo)));
        hints = backKeys(undo > 0);
      } else if (runState === 'ready') {
        parts.push(lead('run', tr(STATUS.ready), pc ? ' · PC ' : '', pc ? code(pc) : null));
        if (steps === 0 && saveNote) parts.push(cell(saveWarn ? 'warn' : '', words(saveNote)));
        hints = [['F10', 'Step'], ['F5', 'Run']];
      } else {
        const tone = runState !== 'finished' ? 'run' : reason === 'error' ? 'err' : 'ok';
        parts.push(lead(tone, codeText(stopMessage(reason, pc, currentLang()))));
        hints = stopKeys(reason, currentLang());
      }
      if (steps > 0 && runState !== 'finished') parts.push(cell('', count(steps, STATUS.steps)));
      if (changedNow.length) parts.push(changedPart());
      if (selected >= 0) parts.push(cell('', tr(STATUS.selected), code(hex32(selected))));
    }
    // A later assemble that failed (the machine keeps the last program).
    if (errors.length) parts.push(cell('err', tr(STATUS.errorsInEdited, errors.length)));
    else if (!sameAdvanced(advanced, applied)) parts.push(cell('warn', tr(STATUS.settingsChanged)));
  }
  if (note) parts.push(cell('warn', words(note)));
  else if (exportNote) parts.push(cell('ok', words(exportNote)));
  if (open && hints.length) parts.push(keys(...hints));
  status.replaceChildren(...parts, statusTheme);
}

// ---- files -------------------------------------------------------------------------

// The program on the machine -- the last assembled, which Run and Step go
// on with -- as an executable image, even when the Editor has changed since
// (then the note says so).  Its source-sha256 is of that program's source.
async function exportImage(): Promise<void> {
  if (lastGood === null || busy) return;
  const good = lastGood;
  const changed = editor.text() !== good.source;
  const r = await api.exportImage({ source: good.source, options: good.options, name: good.name, path: good.path, format: good.format,
                                    assembled: (lastAssembly?.at ?? new Date()).getTime() }).catch((e: Error) => ({ error: e.message }));
  if (r === null) return;
  if ('error' in r) note = r.error;
  else { note = ''; exportNote = () => tr(STATUS.exported, changed, r.name); }
  renderStatus();
}

// Before another file takes the Editor's place.  Unsaved changes are always
// asked about; a new file is asked about even when everything is saved --
// it empties the Editor, which a student does not expect from one click.
async function mayReplace(what: 'new' | 'open'): Promise<boolean> {
  if (!open) return true;
  if (dirty) {
    return ask({
      title: tr(DIALOGS.unsaved.title),
      file: file.name,
      body: tr(what === 'new' ? DIALOGS.unsaved.newFile : DIALOGS.unsaved.openFile),
      ok: tr(DIALOGS.unsaved.discard), cancel: tr(DIALOGS.unsaved.back), danger: true,
    });
  }
  if (what === 'new') {
    return ask({
      title: tr(DIALOGS.newFile.title),
      file: file.name,
      body: tr(DIALOGS.newFile.body),
      ok: tr(DIALOGS.newFile.ok), cancel: tr(DIALOGS.unsaved.back),
    });
  }
  return true;
}

async function load(opened: { name: string; path: string | null; text: string; format: TextFileFormat } | null, example?: Example): Promise<void> {
  if (!opened) return;
  await forgetMachine();
  file = { name: opened.name, path: opened.path, format: opened.format, example };
  editor.setReadOnly(false);
  editor.setText(opened.text);
  editor.setReadOnly(example !== undefined);
  dirty = false;
  edited = false;
  errors = [];
  [saveNote, saveWarn] = ['', false];
  crashNote = '';
  renderErrors();
  open = true;
  view = 'editor';
  renderChrome();
  requestAnimationFrame(() => editor.view.focus());
}

async function newFile(): Promise<void> {
  if (!(await mayReplace('new'))) return;
  await load({ name: UNTITLED, path: null, text: '', format: { encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' } });
  file.format = null;
  renderChrome();
}
async function openFile(): Promise<void> {
  if (!(await mayReplace('open'))) return;
  await load(await api.openFile().catch((e: Error) => { [saveNote, saveWarn] = [e.message, true]; renderChrome(); return null; }));
}
// ---- the tutorial ----------------------------------------------------------------------

// What was on screen before the tutorial, put back when it ends (unsaved
// changes too: nothing of the student's is lost or written).
let beforeTutorial: { file: typeof file; text: string; dirty: boolean; breakpoints: number[] } | null = null;

async function startTutorial(): Promise<void> {
  if (tutorial.active || busy) return;
  if (open && dirty && !file.example) {
    const go = await ask({
      title: tr(DIALOGS.unsaved.title), file: file.name,
      body: tr(DIALOGS.unsaved.tutorial),
      ok: tr(DIALOGS.unsaved.startTutorial), cancel: tr(DIALOGS.unsaved.back),
    });
    if (!go) return;
  }
  beforeTutorial = open && !file.example
    ? { file: { ...file }, text: editor.text(), dirty, breakpoints: editor.breakpointLines() } : null;
  await tutorial.start();
}

const listeners: ((s: Signal) => void)[] = [];
function emit(s: Signal): void { for (const l of listeners) l(s); }

async function waitWhileRunning(): Promise<void> {
  for (let i = 0; i < 200 && runState === 'running'; i += 1) await new Promise((r) => setTimeout(r, 20));
}

const tutorial = new Tutorial({
  narrow: () => narrow,
  view: () => view,
  showView: (v) => showView(v),
  // The example's comments in the language in use when it opens (src/examples/en/).
  open: async (name) => { await load(await api.openExample(name, currentLang()), name); },
  example: () => file.example ?? null,
  source: () => editor.text(),
  assembled: () => current(),
  assemble: () => saveAndAssemble(),
  step: () => step(),
  stepBack: () => stepBack(),
  runUntil: async (addr) => {
    if (!current() && !(await saveAndAssemble())) return;
    for (let i = 0; i < 500 && lastRegs && lastRegs.pc !== addr && runState !== 'finished' && runState !== 'input'; i += 1) {
      resumeWith = 'step';
      await go(() => api.call('step', 1));
    }
  },
  run: async () => { await run(); await waitWhileRunning(); },
  stop: async () => { await stop(); await waitWhileRunning(); },
  restart: () => restart(),
  setSpeed: (sp) => setSpeed(sp),
  pc: () => lastRegs?.pc ?? null,
  running: () => runState === 'running',
  finished: () => runState === 'finished',
  waiting: () => consolePanel.waiting,
  // As typed in the Console: then until the run that went on with it has stopped.
  input: async (line) => {
    if (!consolePanel.waiting) return;
    consolePanel.type(line);
    for (let i = 0; i < 100 && (runState === 'input' || busy); i += 1) await new Promise((r) => setTimeout(r, 20));
    await waitWhileRunning();
  },
  addressOfLine: (line) => addressOfLine(line),
  labelAddress: (name) => labels.find(name) ?? null,
  quietPc: (on) => text.root.classList.toggle('quiet-pc', on),
  pin: (addr) => { if (addr === null) { if (selected >= 0) { clearSelection(); renderStatus(); } } else select(addr); },
  setTab: (t) => text.setTab(t),
  tab: () => text.tab,
  breakpointLines: () => editor.breakpointLines(),
  setBreakpointLine: async (line, on) => {
    const lines = new Set(editor.breakpointLines());
    if (on) lines.add(line); else lines.delete(line);
    editor.setBreakpointLines([...lines]);
    await editorBreakpoint(line, on);
  },
  goToLine: (n) => goToErrorLine(n),
  errorLine: () => errors.find((e) => e.line > 0)?.line ?? null,
  expandConsole: () => {
    const was = consolePanel.expanded;
    consolePanel.setExpanded(true);
    layout();
    return !was;
  },
  revealLine: (n) => editor.revealLine(n),
  lineRect: (n) => editor.lineRect(n),
  gutterRect: (n) => editor.gutterRect(n),
  revealRegister: (key) => registers?.revealRegister(key),
  revealAddr: (addr) => text.revealAddr(addr),
  showColumn: (panel, key) => (panel === 'regs' ? registers?.showColumn(key as 'dec' | 'bin') ?? 'already' : text.showColumn(key as 'word')),
  releaseColumn: (panel, key) => { if (panel === 'regs') registers?.releaseColumn(key as 'dec' | 'bin'); else text.releaseColumn(key as 'word'); },
  marks: () => registers?.marks() ?? { pins: [], aliases: [] },
  setMarks: (m) => registers?.setMarks(m),
  on: (l) => { listeners.push(l); },
  close: async () => {
    await forgetMachine();
    const back = beforeTutorial;
    beforeTutorial = null;
    if (back) {
      await load({ name: back.file.name, path: back.file.path, text: back.text, format: back.file.format ?? { encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' } });
      file.format = back.file.format;
      editor.setBreakpointLines(back.breakpoints);
      dirty = back.dirty;
      edited = back.dirty;
    } else {
      open = false;
      file = { name: UNTITLED, path: null, format: null };
      editor.setReadOnly(false);
      editor.setText('');
      dirty = false;
      edited = false;
      errors = [];
      renderErrors();
    }
    renderChrome();
  },
}, CHAPTERS);
(window as unknown as { __tutorial: Tutorial }).__tutorial = tutorial; // for the tests

// The machine no longer matches what is on screen: a new file.
async function forgetMachine(): Promise<void> {
  if (runState === 'running') await api.stop();
  assembledText = null;
  lastGood = null;
  lastAssembly = null;
  edited = false;
  runState = 'ready';
  breakpoints.clear();
  rows = [];
  text.setRows([]);
  lastRegs = null;
  undo = 0;
  back = null;
  clearSelection();
  consolePanel.clear();
}

// ---- assemble -------------------------------------------------------------------------

async function saveAndAssemble(): Promise<boolean> {
  if (busy || !open) return false;
  const source = editor.text();
  saveNote = '';
  saveWarn = false;
  if (file.example) {
    saveNote = () => tr(ASSEMBLE.example);
    return assemble(source);
  }
  try {
    const saved = await api.saveFile({ path: file.path, name: file.name, text: source, format: file.format });
    if (saved) {
      file.path = saved.path;
      file.name = saved.name;
      dirty = editor.text() !== source; // typed on while the dialog was up
      saveNote = () => tr(ASSEMBLE.saved);
    } else [saveNote, saveWarn] = [() => tr(ASSEMBLE.notSaved), true];
  } catch (e) {
    [saveNote, saveWarn] = [(e as Error).message, true];
  }
  return assemble(source);
}

// Assembles `source` into a fresh machine -- after assembling it in a second
// process first (src/main/engine-mips.ts, sim:check): a program with errors leaves the
// machine on screen as it was, the program in it and where it had run to.
async function assemble(source: string): Promise<boolean> {
  busy = true;
  let after: Signal | null = null;
  note = '';
  exportNote = '';
  // An assemble that takes a while says so in the Assemble panel.
  const slowAssemble = setTimeout(() => { assembling = true; renderAssemble(); }, 150);
  const options = assembleOptions(advanced);
  const lines = source.split('\n');
  const parsed = (raw: string[]) => raw.map((line) => {
    const message = parseAssemblerMessage(line);
    return { message, line: resolveMessageLine(message, lines) };
  });
  // Errors: in the Assemble panel and the Editor's margin; the machine as it was.
  // (The panel says what happened once it is over: renderChrome() below,
  // when keys work again.)
  const failed = (list: typeof errors): false => {
    errors = list;
    failedAt = new Date();
    edited = editor.text() !== assembledText;
    editor.showErrors(errors.map((e) => e.line).filter((n) => n > 0));
    if (narrow) view = 'editor'; // the errors are under the Editor
    after = { kind: 'assembled', ok: false };
    return false;
  };
  try {
    if (runState === 'running') { slow?.cancel(); await api.stop(); await waitWhileRunning(); }
    // A statement that starts with no instruction or directive the core
    // knows: every one of them, on its line, and the engine is not asked
    // (core/precheck.ts).
    const unknown = precheckMips(source);
    if (unknown.length) {
      return failed(unknown.map((w) => ({ message: parseAssemblerMessage(w.token), line: w.line, unknown: w })));
    }
    // The core ended while assembling it (a .err directive): the second
    // process did, the machine on screen is untouched.  No second process at
    // all (it did not start): assemble on the machine itself, as before.
    const check = await api.check(source, options).catch(() => null);
    if (check?.crashed) return failed([{ message: parseAssemblerMessage(check.crashed), line: check.crashLine ?? 0, crashed: true }]);
    if (check && !check.ok) return failed(parsed(check.errors));
    const same = source === assembledText;
    let r: Awaited<ReturnType<typeof api.call<'assemble'>>>;
    try {
      r = await api.call('assemble', source, options);
    } catch {
      return false; // the process died: onCrashed says so
    }
    crashNote = '';
    if (!r.ok) { // (checked above; only without a second process)
      assembledText = null;
      runState = 'ready';
      return failed(parsed(r.errors));
    }
    consolePanel.clear();
    steps = 0;
    progress = null;
    changedNow = [];
    undo = 0;
    back = null;
    lastReason = 'limit';
    errors = [];
    rows = textRows(await api.call('textSegment'));
    // Breakpoints: the Editor's lines, mapped to this program's words, and
    // (for the same program) those set in Text on words with no line of the
    // Editor's, such as the start-up code.
    const kept = same ? [...breakpoints].filter((a) => lineOf(a) === null && rows.some((x) => x.addr === a)) : [];
    const mapped = editor.breakpointLines().map((n) => [n, addressOfLine(n)] as const);
    const dropped = mapped.filter(([, a]) => a === null).map(([n]) => n);
    if (dropped.length) {
      editor.setBreakpointLines(mapped.filter(([, a]) => a !== null).map(([n]) => n));
      note = () => tr(STATUS.bpRemoved, lineList(dropped));
    }
    breakpoints.clear();
    for (const a of [...kept, ...mapped.map(([, a]) => a).filter((a): a is number => a !== null)]) breakpoints.add(a);
    for (const a of breakpoints) await api.call('setBreakpoint', a);
    for (const x of rows) x.breakpoint = breakpoints.has(x.addr);
    assembledText = source;
    edited = editor.text() !== source; // typed on while it assembled
    lastGood = { source, options, name: file.name, path: file.path, format: file.format };
    lastAssembly = { at: new Date(), instructions: rows.filter((x) => !x.kernel).length };
    editor.showErrors([]);
    labels.clear();
    for (const sym of parseSymbolListing(r.symbols)) labels.add(sym.name, sym.address);
    applied = structuredClone(advanced);
    runState = 'ready';
    text.setRows(rows);
    const regs = await api.call('registers');
    registers?.update(regs, null);
    lastRegs = regs;
    text.setPc(regs.pc);
    if (selected >= 0 && !rows.some((x) => x.addr === selected)) clearSelection();
    else showInspector();
    text.setTab('text');
    if (narrow) view = 'run';
    after = { kind: 'assembled', ok: true };
    return true;
  } finally {
    clearTimeout(slowAssemble);
    assembling = false;
    busy = false;
    renderChrome();
    if (after) emit(after);
  }
}

// "Go to line N": the Editor (a narrow window: its tab), the line.
function goToErrorLine(n: number): void {
  if (narrow) showView('editor');
  editor.goToLine(n);
  emit({ kind: 'goto', line: n });
}

// The errors of the last assemble: marked in the Editor's margin, listed in
// the Assemble panel (renderAssemble).
function renderErrors(): void {
  editor.showErrors(errors.map((e) => e.line).filter((n) => n > 0));
  asmKey = '';
  renderAssemble();
}

// ---- running ----------------------------------------------------------------------------

// Before F5 or F10: a program in the machine -- the last that assembled,
// changed code or not (the band says which); before the first, assemble.
async function ready(): Promise<boolean> {
  if (busy) return false;
  if (assembledText === null) {
    if (!open) return false;
    return saveAndAssemble();
  }
  return true;
}

async function runOrStop(): Promise<void> {
  if (runState === 'running') return stop();
  return run();
}

async function run(): Promise<void> {
  if (!(await ready())) return;
  if (runState === 'finished') { renderStatus(); return; }
  if (runState === 'input') { consolePanel.waitForInput(true); return; }
  if (speed === 'slow') return runSlow();
  resumeWith = 'run';
  runState = 'running';
  steps = 0;
  progress = null;
  renderChrome();
  if (applied.machine.mappedIo) consolePanel.waitForInput(true); // the program polls the receiver as it runs
  await go(() => api.call('run'));
  if (switchTo === 'slow' && (runState as RunState) === 'paused') { switchTo = null; await runSlow(); }
}

async function step(): Promise<void> {
  if (!(await ready())) return;
  if (runState === 'finished' || runState === 'running') return;
  resumeWith = 'step';
  await go(() => api.call('step', 1));
}

// Step back: the last instruction executed undone -- registers and memory
// as they were before it (the core's front end keeps the last 1000:
// native/src/addon.cc, "step back").  Everything that follows a step
// follows it too: the changed registers, the PC line, the Inspector, Data.
// What the program printed stays in the Console.
async function stepBack(): Promise<void> {
  if (busy || assembledText === null || runState === 'running' || undo <= 0) return;
  busy = true;
  note = '';
  exportNote = '';
  const before = lastRegs;
  let after: Signal | null = null;
  try {
    const r = await api.call('backstep');
    undo = r.undo;
    if (!r.undone) return;
    const now = await api.call('registers');
    steps = Math.max(0, steps - 1);
    back = { io: r.io };
    after = { kind: 'back', io: r.io };
    runState = 'paused';
    lastReason = 'limit';
    registers?.update(now, before);
    changedNow = [...changedKeys(before, now)];
    lastRegs = now;
    text.setPc(now.pc);
    showInspector();
    consolePanel.waitForInput(false);
    if (text.tab === 'data') void refreshData();
  } catch {
    // the process died: onCrashed says so
  } finally {
    busy = false;
    renderChrome();
    if (after) emit(after);
  }
}

async function go(call: () => Promise<RunResult>): Promise<RunResult | null> {
  busy = true;
  note = '';
  exportNote = '';
  const before = lastRegs;
  let result: RunResult;
  try {
    result = await call();
  } catch {
    busy = false; // the crash report (onCrashed) says what happened
    return null;
  }
  try {
    const now = await api.call('registers');
    if (result.reason !== 'input' && resumeWith === 'step') steps += 1;
    undo = result.undo;
    back = null;
    lastReason = result.reason;
    // A slow run between two of its steps is still running.
    runState = slow && result.reason === 'limit' ? 'running' : stateAfter(result.reason);
    registers?.update(now, before);
    changedNow = [...changedKeys(before, now)];
    lastRegs = now;
    text.setPc(now.pc);
    showInspector();
    for (const e of result.errors) consolePanel.append(e.endsWith('\n') ? e : e + '\n');
    consolePanel.waitForInput(result.reason === 'input');
    if (text.tab === 'data') void refreshData();
    return result;
  } finally {
    busy = false;
    renderChrome();
    emit({ kind: 'stopped', reason: result.reason });
  }
}

/* Run at one line a second.  The window steps the core itself, one
   instruction per call, and waits a second in between; stopping (Esc, Stop)
   cancels the wait at once, so a slow run of a billion-step loop is never
   more than a click away from ending.  Every step updates what a step
   updates: registers, the Inspector, the Editor's line.  A breakpoint stops
   it before its instruction; switching to Instant hands the rest to the core. */
async function runSlow(): Promise<void> {
  resumeWith = 'run';
  runState = 'running';
  steps = 0;
  let cancelled = false;
  let wake: (() => void) | null = null;
  slow = { cancel: () => { cancelled = true; wake?.(); } };
  renderChrome();
  try {
    for (let first = true; !cancelled; first = false) {
      if (!first && lastRegs && breakpoints.has(lastRegs.pc)) { // stop before it, as the core does
        runState = 'paused';
        lastReason = 'breakpoint';
        return;
      }
      resumeWith = 'step';
      const result = await go(() => api.call('step', 1));
      resumeWith = 'run';
      if (!result || result.reason !== 'limit') return; // the end, an error, input, a crash
      if (cancelled) break;   // stopped while that step was on its way
      runState = 'running';
      renderChrome();
      await new Promise<void>((done) => { wake = done; setTimeout(done, 1000); });
    }
    runState = 'paused';        // stopped, or switched to Instant
    lastReason = 'stopped';
  } finally {
    slow = null;
    renderChrome();
    emit({ kind: 'slow-ended' });
  }
  if (switchTo === 'fast') { switchTo = null; await run(); }
}

async function setSpeed(next: 'fast' | 'slow'): Promise<void> {
  if (next === speed) return;
  speed = next;
  renderChrome();
  if (runState !== 'running') return;
  switchTo = next;
  if (next === 'fast') slow?.cancel();   // runSlow() then goes on with run()
  else await api.stop();                // run() then goes on with runSlow()
}

// The status bar's name for the yellow rows, in their yellow: where the
// Registers panel has no room for its "Changed" tag, this is what says what
// a yellow row is.  Three names at most, then how many more.
function changedPart(): HTMLElement {
  const names = changedNow.slice(0, 3).flatMap((key, i) => (i ? [', ', code(key)] : [code(key)]));
  const more = changedNow.length > 3 ? tr(STATUS.more, changedNow.length - 3) : '';
  return cell('changed', tr(STATUS.changed), ...names, more);
}

async function stop(): Promise<void> {
  if (runState !== 'running') return;
  switchTo = null;
  if (slow) { slow.cancel(); return; } // the wait ends now; runSlow() says 'stopped'
  await api.stop(); // the run's own answer ('stopped') updates the window
}

// Reset: the program in the machine back to its start -- the last one that
// assembled, as it was assembled (its options, its breakpoints), whatever the
// Editor holds now: assembling is Save & Assemble's.  Also after a crash.
async function restart(): Promise<void> {
  if (busy || lastGood === null) return;
  const good = lastGood;
  busy = true;
  note = '';
  exportNote = '';
  [saveNote, saveWarn] = ['', false]; // Reset saves nothing
  try {
    if (runState === 'running') { slow?.cancel(); await api.stop(); await waitWhileRunning(); }
    let r: Awaited<ReturnType<typeof api.call<'assemble'>>>;
    try {
      r = await api.call('assemble', good.source, good.options);
    } catch {
      return; // the process died: onCrashed says so
    }
    if (!r.ok) return; // it assembled before, with the same options
    crashNote = '';
    assembledText = good.source;
    edited = editor.text() !== good.source;
    consolePanel.clear();
    steps = 0;
    progress = null;
    changedNow = [];
    undo = 0;
    back = null;
    lastReason = 'limit';
    rows = textRows(await api.call('textSegment'));
    for (const a of breakpoints) await api.call('setBreakpoint', a);
    for (const x of rows) x.breakpoint = breakpoints.has(x.addr);
    runState = 'ready';
    text.setRows(rows);
    const regs = await api.call('registers');
    registers?.update(regs, null);
    lastRegs = regs;
    text.setPc(regs.pc);
    if (selected >= 0 && !rows.some((x) => x.addr === selected)) clearSelection();
    else showInspector();
    if (text.tab === 'data') void refreshData();
  } finally {
    busy = false;
    renderChrome();
    emit({ kind: 'reset' });
  }
}

async function giveInput(line: string): Promise<void> {
  await api.call('provideInput', line + '\n');
  if (runState === 'running') return; // mapped I/O: the program reads it as it runs
  consolePanel.waitForInput(false);
  runState = 'paused';
  if (resumeWith === 'run') await run();
  else await step();
}

// A breakpoint set or cleared in Text: the machine (Text shows its program),
// and the Editor's gutter while the Editor's code is that program.
async function toggleBreakpoint(addr: number): Promise<void> {
  const on = !breakpoints.has(addr);
  await setBreakpoint(addr, on);
  const line = current() ? lineOf(addr) : null;
  if (line !== null) {
    const lines = new Set(editor.breakpointLines());
    if (on) lines.add(line); else if (![...breakpoints].some((a) => lineOf(a) === line)) lines.delete(line);
    editor.setBreakpointLines([...lines]);
  }
}

async function setBreakpoint(addr: number, on: boolean): Promise<void> {
  if (on) breakpoints.add(addr); else breakpoints.delete(addr);
  await api.call(on ? 'setBreakpoint' : 'clearBreakpoint', addr);
  text.setBreakpoint(addr, on);
}

// A breakpoint set or cleared in the Editor's gutter.  Before an assemble,
// or with changed code, it is only kept by line (the dot moves with the
// text): it takes effect at the next assemble.
async function editorBreakpoint(line: number, on: boolean): Promise<void> {
  emit({ kind: 'breakpoint', line, on });
  if (!current()) {
    if (machineShown()) { note = () => tr(STATUS.bpEdited); renderStatus(); }
    return;
  }
  const addr = addressOfLine(line);
  if (addr === null) {
    editor.setBreakpointLines(editor.breakpointLines().filter((n) => n !== line));
    note = () => tr(STATUS.bpNoInstruction, line);
    renderStatus();
    return;
  }
  if (on) await setBreakpoint(addr, true);
  else for (const a of [...breakpoints].filter((a) => lineOf(a) === line)) await setBreakpoint(a, false);
}

// ---- the Inspector ----------------------------------------------------------------------

// A row chosen in Text pins the Inspector to it; otherwise it follows PC.
function select(addr: number): void {
  selected = addr;
  text.setSelected(addr);
  showInspector();
  renderStatus();
}

function clearSelection(): void {
  selected = -1;
  text.setSelected(-1);
  showInspector();
}

function showInspector(): void {
  const convention = applied.machine.delayedBranches ? 'MipsDelaySlot' : 'SpimNoDelaySlot';
  const regs = (lastRegs ?? ZERO_REGS).general;
  const pinned = selected >= 0 ? text.rowFor(selected) : undefined;
  if (pinned) { inspector.show(pinned, regs, true, convention); return; }
  const started = runState !== 'ready' || steps > 0;
  const atPc = lastRegs && started ? text.rowFor(lastRegs.pc) : undefined;
  if (atPc) inspector.show(atPc, regs, false, convention);
  else inspector.guide();
}
inspector.onFollow = () => { clearSelection(); renderStatus(); };
// The other language (i18n.ts): the Inspector's explanation, the Assemble
// panel, the Run side's card and the status bar say it again in it.
onLang(() => {
  if (open) showInspector();
  renderChrome();
});

// ---- Data ------------------------------------------------------------------------------

async function refreshData(): Promise<void> {
  if (assembledText === null) { text.data.clear(); return; }
  const s = await api.call('segments');
  const regs = lastRegs ?? await api.call('registers');
  const sp = regs.general[29] >>> 0;
  const part = async (kind: DataSection['kind'], from: number, to: number): Promise<DataSection> => ({
    kind, from, to, words: await api.call('readWords', from, (to - from) / 4),
    bytes: await api.call('readBytes', from, to - from),
  });
  const stackTop = 0x80000000;
  const sections = [await part('data', s.dataBot, s.dataTop)];
  if (sp < stackTop && stackTop - sp <= 0x10000) sections.push(await part('stack', sp & ~15, stackTop));
  sections.push(await part('kernel', s.kDataBot, s.kDataTop));
  const pointers = [29, 30, 28].map((n) => ({ name: generalRegisterName(n), value: regs.general[n] >>> 0 }));
  text.data.show(sections, settings.dataBase, labels, pointers);
}

// ---- keys -----------------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (tutorial.handleKey(e)) return;
  if (document.querySelector('dialog[open]')) return; // the dialog has the keys (Esc closes it)
  const mod = e.ctrlKey || e.metaKey;
  const inEditor = editorHost.contains(e.target as Node);
  if (e.key === 'F5') { e.preventDefault(); void runOrStop(); return; }
  if (isStepBackKey(e)) { e.preventDefault(); void stepBack(); return; } // (the tutorial lets it through only where it teaches it)
  if (e.key === 'F10') { e.preventDefault(); void step(); return; }
  if (e.key === 'Escape') {
    if ((e.target as HTMLElement).closest?.('input, textarea')) return; // a box's own Esc (the Registers alias)
    if (runState === 'running') { e.preventDefault(); void stop(); }
    else if (selected >= 0) { clearSelection(); renderStatus(); }
    return;
  }
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); if (inEditor) editor.requestSave(e.isComposing); else void saveAndAssemble(); }
  else if (k === 'o') { e.preventDefault(); void openFile(); }
  else if (k === '=' || k === '+') { e.preventDefault(); zoom += 1; applyFont(); }
  else if (k === '-') { e.preventDefault(); zoom -= 1; applyFont(); }
  else if (k === '0') { e.preventDefault(); zoom = 0; applyFont(); }
}, true);

// ---- events from the simulator ------------------------------------------------------------------

api.onConsole((t) => consolePanel.append(t));
api.onProgress((p) => { progress = p; if (runState === 'running') renderStatus(); });
api.onCrashed((message, detail) => {
  // detail: "The simulator stopped (fatal error in the simulator core: File contains an .err directive)"
  const cause = /\((.*)\)$/s.exec(detail)?.[1] ?? (detail || message);
  crashNote = () => tr(STATUS.crashed, cause);
  undo = 0;
  back = null;
  assembledText = null;
  runState = 'ready';
  busy = false;
  consolePanel.waitForInput(false);
  renderChrome();
});

// ---- start ----------------------------------------------------------------------------

async function start(): Promise<void> {
  settings = await api.getSettings();
  applyFont();
  measure();
  new ResizeObserver(() => measure()).observe(document.body);
  // fonts: a width measured in the code font before it had loaded is
  // measured again (the Editor's 72 columns, the tables' columns).
  document.fonts.addEventListener('loadingdone', () => measure());
  void document.fonts.ready.then(() => measure());
  renderChrome();
  // The columns are measured in the mono font: again once it is in.
  void document.fonts.ready.then(() => { text.fit(); registers?.fit(); renderChrome(); });
}
void start();

// ---- arriving from the other ISA's first screen ------------------------------------------
// ?then: the first screen of the other ISA chose this one and a way in; do it
// now, the work screen fading in out of the dark the first screen faded to.
{
  const then = new URLSearchParams(location.search).get('then');
  if (then) {
    document.body.classList.add('arriving');
    setTimeout(() => document.body.classList.remove('arriving'), 600);
    if (then === 'tutorial') void startTutorial();
    else if (then === 'new') void newFile();
    else if (then === 'open') void openFile();
  }
}
