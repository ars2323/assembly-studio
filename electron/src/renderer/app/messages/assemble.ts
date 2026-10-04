/* Assembling and its errors, and the status bar, in both ISAs' windows: the
   Assemble panel (panels/assemble.ts), the Run side's card before there is
   a program (app.ts renderPlaceholder), the status line (renderStatus) and
   its notes.  The names on screen -- panels (Editor, Run, Console), the
   buttons (Save & Assemble, Run, Step, Reset), the keys -- stay as they are
   in both languages.  `code` in backticks; { key } a key (set as <kbd>).

   A count is said as the words before the number and after it ([before,
   after]): the number itself is set in the code font (cells.ts count()). */

type Part = string | { key: string };

export const ASSEMBLE = {
  // The first cell: the state.
  notAssembled: { ko: '어셈블 안 됨', en: 'Not assembled' },
  assembling: { ko: '어셈블 중…', en: 'Assembling…' },
  assembled: { ko: '어셈블 완료', en: 'Assembled' },
  errors: { ko: (n: number) => `오류 ${n}개`, en: (n: number) => `${n} ${n === 1 ? 'error' : 'errors'}` },
  // The cells after it.
  instructions: { ko: (_n: number): [string, string] => ['명령 ', '개'], en: (n: number): [string, string] => ['', n === 1 ? ' instruction' : ' instructions'] },
  kept: { ko: '이전 프로그램 유지', en: 'Last program kept' },
  saved: { ko: '저장됨', en: 'Saved' },
  notSaved: { ko: '저장 안 됨', en: 'Not saved' },
  example: { ko: '예제 · 저장하지 않음', en: 'Example · not saved' },
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
  ago: {
    now: { ko: '방금', en: 'just now' },
    seconds: { ko: (n: number) => `${n}초 전`, en: (n: number) => `${n}s ago` },
    minutes: { ko: (n: number) => `${n}분 전`, en: (n: number) => `${n} min ago` },
    hours: { ko: (n: number) => `${n}시간 전`, en: (n: number) => `${n} h ago` },
  },
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

export const STATUS = {
  ready: { ko: '준비', en: 'Ready' },
  running: { ko: '실행 중…', en: 'Running…' },
  slowRun: { ko: '천천히 실행 · 1 line/s', en: 'Slow run · 1 line/s' },
  edited: { ko: '고친 뒤 어셈블 안 됨', en: 'Edited · not assembled' },
  errorsInEdited: {
    ko: (n: number) => `고친 코드에 오류 ${n}개`,
    en: (n: number) => `${n} ${n === 1 ? 'error' : 'errors'} in the edited code`,
  },
  steps: { ko: (_n: number): [string, string] => ['', '단계 실행'], en: (n: number): [string, string] => ['', n === 1 ? ' step' : ' steps'] },
  selected: { ko: '선택 ', en: 'Selected ' },
  changed: { ko: '바뀜: ', en: 'Changed: ' },
  more: { ko: (n: number) => ` 외 ${n}개`, en: (n: number) => ` +${n} more` },
  settingsChanged: { ko: '설정 바뀜 · Ctrl+S 로 적용', en: 'Settings changed · Ctrl+S to apply' },
  // After a stop (logic/machine.ts stopMessage).
  stop: {
    exit: { ko: '종료됨', en: 'Exited' },
    error: { ko: '실행 오류', en: 'Runtime error' },
    breakpoint: { ko: (pc: string) => `Breakpoint · \`${pc}\``, en: (pc: string) => `Breakpoint at \`${pc}\`` },
    input: { ko: '입력 기다리는 중', en: 'Waiting for input' },
    stopped: { ko: (pc: string) => `멈춤 · \`${pc}\``, en: (pc: string) => `Stopped at \`${pc}\`` },
    limit: { ko: (pc: string) => `한 단계 실행 · PC \`${pc}\``, en: (pc: string) => `Stepped · PC \`${pc}\`` },
  },
  // The keys' words at the far end (Step, Run, Stop: the buttons' names).
  keys: {
    again: { ko: 'Reset 으로 다시 실행', en: 'Reset to run again' },
    console: { ko: 'Console 확인 · Reset 으로 다시 실행', en: 'See the Console · Reset to run again' },
    inConsole: { ko: 'Console 에 입력', en: 'in the Console' },
    resume: { ko: '계속', en: 'Continue' },
    instant: { ko: 'Instant 로 바꾸면 최고 속도', en: 'Instant for full speed' },
  },
  // RISC-V: the engine, while it is not ready.
  engine: {
    starting: { ko: '엔진 시작 중…', en: 'Starting the engine…' },
    restarting: { ko: '엔진 다시 시작 중…', en: 'Restarting the engine…' },
    dead: { ko: '엔진을 쓸 수 없음', en: 'Engine unavailable' },
    noAnswer: { ko: '엔진이 응답하지 않아 다시 시작했습니다', en: 'The engine did not answer and was restarted' },
  },
  // The simulator's process ended (`what`: what it said, in its words).
  crashed: {
    ko: (what: string) => `시뮬레이터가 멈췄습니다 (${what}) · 다시 어셈블하세요 (Ctrl+S)`,
    en: (what: string) => `The simulator stopped (${what}) · assemble again (Ctrl+S)`,
  },
  engineCrashed: {
    ko: (what: string, restarted: boolean) => `시뮬레이터 엔진이 멈췄습니다 (${what})${restarted ? ' · 엔진을 다시 시작했습니다. 다시 어셈블하세요 (Ctrl+S)' : ''}`,
    en: (what: string, restarted: boolean) => `The simulator engine stopped (${what})${restarted ? ' · engine restarted, assemble again (Ctrl+S)' : ''}`,
  },
  // Notes: breakpoints, input, the export.  `lines`: ASSEMBLE.line(s), said already.
  bpRemoved: { ko: (lines: string) => `${lines}: 명령이 없어 Breakpoint 를 지웠습니다`, en: (lines: string) => `${lines}: no instruction, breakpoint removed` },
  bpIdle: { ko: (lines: string) => `${lines}: 명령이 없어 Breakpoint 가 효과가 없습니다`, en: (lines: string) => `${lines}: no instruction, breakpoint has no effect` },
  bpNoInstruction: {
    ko: (line: number) => `${line}행에는 명령이 없습니다 · Breakpoint 는 명령이 있는 줄에 둡니다`,
    en: (line: number) => `Line ${line} has no instruction · breakpoints go on instruction lines`,
  },
  bpEdited: { ko: '고친 코드의 Breakpoint 는 다음 어셈블 때 적용됩니다 (Ctrl+S)', en: 'Breakpoints in edited code apply at the next assemble (Ctrl+S)' },
  bpTextEdited: {
    ko: '고친 코드에서는 Text 의 Breakpoint 를 바꿀 수 없습니다 · 먼저 어셈블하세요 (Ctrl+S)',
    en: 'Breakpoints in Text cannot change in edited code · assemble first (Ctrl+S)',
  },
  inputCancelled: {
    ko: (undone: boolean) => (undone ? '입력을 기다리다 멈춤 · Run 하면 다시 입력을 받습니다'
      : '입력을 기다리다 멈췄고 되돌리지 못했습니다 · 다시 어셈블하세요 (Ctrl+S)'),
    en: (undone: boolean) => (undone ? 'Stopped while waiting for input · Run asks for it again'
      : 'Stopped while waiting for input and could not undo it · assemble again (Ctrl+S)'),
  },
  exported: {
    ko: (last: boolean, name: string) => `${last ? '마지막으로 어셈블된 코드를 ' : ''}실행 이미지로 저장했습니다 · ${name}`,
    en: (last: boolean, name: string) => `Saved ${last ? 'the last assembled code ' : ''}as an executable image · ${name}`,
  },
};
