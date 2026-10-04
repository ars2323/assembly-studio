/* Assembling and its errors, and the status bar, in both ISAs' windows: the
   Assemble panel (panels/assemble.ts), the Run side's card before there is
   a program (app.ts renderPlaceholder), the status line (renderStatus) and
   its notes.  `code` in backticks; { key } a key (set as <kbd>).

   The work screen's states are words of its own, in English in both
   languages, like the names on it -- panels (Editor, Run, Console), buttons
   (Save & Assemble, Run, Step, Reset), keys: the whole status line
   (STATUS), the Assemble panel's state cells and its "12s ago".  What is
   said in sentences -- an error, how to fix it, what to do next, the Run
   side's card -- is in Korean or English.  english() gives an entry the
   same words in both.

   A count is said as the words before the number and after it ([before,
   after]): the number itself is set in the code font (cells.ts count()). */

type Part = string | { key: string };

// The same words in both languages: { en } -> { ko: en, en }, through a table.
type English<T> = T extends { en: infer E } ? { ko: E; en: E } : { [K in keyof T]: English<T[K]> };
function english<T>(t: T): English<T> {
  const o = t as Record<string, unknown>;
  if ('en' in o) return { ko: o.en, en: o.en } as English<T>;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, english(v)])) as English<T>;
}

export const ASSEMBLE = {
  // The first cell: the state.
  notAssembled: english({ en: 'Not assembled' }),
  assembling: english({ en: 'Assembling…' }),
  assembled: english({ en: 'Assembled' }),
  errors: english({ en: (n: number) => `${n} ${n === 1 ? 'error' : 'errors'}` }),
  // The cells after it.
  instructions: english({ en: (n: number): [string, string] => ['', n === 1 ? ' instruction' : ' instructions'] }),
  kept: english({ en: 'Last program kept' }),
  saved: english({ en: 'Saved' }),
  notSaved: english({ en: 'Not saved' }),
  example: english({ en: 'Example · not saved' }),
  // What to do.
  fresh: {
    ko: (saves: boolean): Part[] => [{ key: 'Ctrl+S' }, ` 키를 누르면 ${saves ? '저장하고 ' : ''}어셈블합니다. 결과와 오류는 여기에 나옵니다.`],
    en: (saves: boolean): Part[] => ['Press ', { key: 'Ctrl+S' }, ` to ${saves ? 'save and ' : ''}assemble. The result and any errors show up here.`],
  },
  fix: {
    ko: (many: boolean): Part[] => [many ? '위에서부터 차례로 고친 뒤 ' : '아래 줄을 고친 뒤 ', { key: 'Ctrl+S' }, ' 키를 다시 누르세요.'],
    en: (many: boolean): Part[] => [many ? 'Fix them from the top, then press ' : 'Fix the line below, then press ', { key: 'Ctrl+S' }, ' again.'],
  },
  keptNote: {
    ko: (narrow: boolean) => ` ${narrow ? 'Run 탭' : 'Run 쪽'}에는 마지막으로 어셈블된 프로그램이 그대로 있습니다.`,
    en: (narrow: boolean) => ` The ${narrow ? 'Run tab' : 'Run side'} still shows the last program that assembled.`,
  },
  // The error list.
  line: { ko: (n: number) => `${n}행`, en: (n: number) => `Line ${n}` },
  lines: { ko: (ns: string) => `${ns}행`, en: (ns: string) => `Lines ${ns}` },
  goToLine: { ko: (n: number) => `${n}행으로 이동`, en: (n: number) => `Go to line ${n}` },
  toEditor: { ko: 'Editor 로 이동', en: 'Go to the Editor' },
  engineSaid: { ko: (what: string) => `어셈블러의 메시지: ${what}`, en: (what: string) => `The assembler's message: ${what}` },
  markTitle: { ko: '어셈블 오류', en: 'Assembly error' },
  // The Assemble button's tooltip for an example.
  exampleTitle: { ko: 'Assemble (Ctrl+S): 예제는 저장하지 않습니다', en: 'Assemble (Ctrl+S): examples are not saved' },
  // When: "just now", "12s ago" (logic/ago.ts).
  ago: english({
    now: { en: 'just now' },
    seconds: { en: (n: number) => `${n}s ago` },
    minutes: { en: (n: number) => `${n} min ago` },
    hours: { en: (n: number) => `${n} h ago` },
  }),
  // The Run side before there is a program to show.
  placeholder: {
    freshTitle: { ko: '아직 어셈블하지 않았습니다', en: 'Not assembled yet' },
    freshBody: {
      ko: '어셈블하면 레지스터, 명령, Console 출력이 여기에 나옵니다.',
      en: 'Assemble to see the registers, the instructions and the console output here.',
    },
    failedTitle: { ko: '어셈블된 프로그램이 아직 없습니다', en: 'No program assembled yet' },
    failedBody: {
      ko: (narrow: boolean) => `${narrow ? 'Editor 탭의 Assemble 패널' : 'Editor 아래 Assemble 패널'}에 나온 오류를 고친 뒤 Ctrl+S 키를 다시 누르세요.`,
      en: (narrow: boolean) => `Fix the errors in ${narrow ? 'the Assemble panel on the Editor tab' : 'the Assemble panel under the Editor'}, then press Ctrl+S again.`,
    },
    crashedTitle: { ko: '시뮬레이터가 멈췄습니다', en: 'The simulator stopped' },
    crashedBody: { ko: 'Reset 이나 Ctrl+S 키로 다시 시작하세요.', en: 'Press Reset or Ctrl+S to start again.' },
    // RISC-V: the engine (a JVM) stopped, or could not start.
    engineCrashedTitle: { ko: '시뮬레이터 엔진이 멈췄습니다', en: 'The simulator engine stopped' },
    engineCrashedBody: {
      ko: '엔진을 다시 시작했고 프로그램은 지워졌습니다. Ctrl+S 키로 다시 어셈블하세요.',
      en: 'It has been restarted and the program cleared: press Ctrl+S to assemble again.',
    },
    deadTitle: { ko: '시뮬레이터 엔진을 쓸 수 없습니다', en: 'The simulator engine is unavailable' },
    deadBody: {
      ko: (detail: string) => `${detail} 프로그램을 다시 시작하세요. 그래도 안 되면 이 문제를 알려 주세요.`,
      en: (detail: string) => `${detail} Restart the app; if that does not help, report the problem.`,
    },
  },
};

export const STATUS = english({
  ready: { en: 'Ready' },
  running: { en: 'Running…' },
  slowRun: { en: 'Slow run · 1 line/s' },
  edited: { en: 'Edited · not assembled' },
  errorsInEdited: {
    en: (n: number) => `${n} ${n === 1 ? 'error' : 'errors'} in the edited code`,
  },
  steps: { en: (n: number): [string, string] => ['', n === 1 ? ' step' : ' steps'] },
  selected: { en: 'Selected ' },
  changed: { en: 'Changed: ' },
  more: { en: (n: number) => ` +${n} more` },
  // After Step back (logic/stepback.ts); after undoing a call that printed or read, the Console keeps it.
  stepBack: { en: (pc: string) => `Stepped back · PC \`${pc}\`` },
  backIo: { en: 'Console output and input already read stay' },
  settingsChanged: { en: 'Settings changed · Ctrl+S to apply' },
  // After a stop (logic/machine.ts stopMessage).
  stop: {
    exit: { en: 'Exited' },
    error: { en: 'Runtime error' },
    breakpoint: { en: (pc: string) => `Breakpoint at \`${pc}\`` },
    input: { en: 'Waiting for input' },
    stopped: { en: (pc: string) => `Stopped at \`${pc}\`` },
    limit: { en: (pc: string) => `Stepped · PC \`${pc}\`` },
  },
  // The keys' words at the far end (Step, Run, Stop: the buttons' names).
  keys: {
    again: { en: 'Reset to run again' },
    console: { en: 'See the Console · Reset to run again' },
    inConsole: { en: 'in the Console' },
    resume: { en: 'Continue' },
    instant: { en: 'Instant for full speed' },
  },
  // RISC-V: the engine, while it is not ready.
  engine: {
    starting: { en: 'Starting the engine…' },
    restarting: { en: 'Restarting the engine…' },
    dead: { en: 'Engine unavailable' },
    noAnswer: { en: 'The engine did not answer and was restarted' },
  },
  // The simulator's process ended (`what`: what it said, in its words).
  crashed: {
    en: (what: string) => `The simulator stopped (${what}) · assemble again (Ctrl+S)`,
  },
  engineCrashed: {
    en: (what: string, restarted: boolean) => `The simulator engine stopped (${what})${restarted ? ' · engine restarted, assemble again (Ctrl+S)' : ''}`,
  },
  // Notes: breakpoints, input, the export.  `lines`: ASSEMBLE.line(s), said already.
  bpRemoved: { en: (lines: string) => `${lines}: no instruction, breakpoint removed` },
  bpIdle: { en: (lines: string) => `${lines}: no instruction, breakpoint has no effect` },
  bpNoInstruction: {
    en: (line: number) => `Line ${line} has no instruction · breakpoints go on instruction lines`,
  },
  bpEdited: { en: 'Breakpoints in edited code apply at the next assemble (Ctrl+S)' },
  bpTextEdited: {
    en: 'Breakpoints in Text cannot change in edited code · assemble first (Ctrl+S)',
  },
  inputCancelled: {
    en: (undone: boolean) => (undone ? 'Stopped while waiting for input · Run asks for it again'
      : 'Stopped while waiting for input and could not undo it · assemble again (Ctrl+S)'),
  },
  exported: {
    en: (last: boolean, name: string) => `Saved ${last ? 'the last assembled code ' : ''}as an executable image · ${name}`,
  },
});
