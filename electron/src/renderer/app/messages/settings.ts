/* Settings' notes (panels/settings.ts for MIPS, isa/riscv/renderer/panels/
   settings.ts for RISC-V: the rows both have use the same keys).  The rows'
   names are English in both languages, like the rest of the work screen.
   `code` in backticks. */

export const SETTINGS = {
  fontSize: {
    ko: '이번 실행에만 적용됩니다. Ctrl + / Ctrl − / Ctrl 0 키로도 바꿀 수 있습니다.',
    en: 'For this run only. Ctrl + / Ctrl − / Ctrl 0 change it too.',
  },
  dataRadix: {
    ko: 'Data 탭의 값을 이 진법으로 보여 줍니다. 이번 실행에만 적용됩니다.',
    en: 'The base the Data tab shows its values in. For this run only.',
  },
  language: {
    ko: '첫 화면, 튜토리얼, 명령 설명, 대화상자의 언어입니다. 이번 실행에만 적용됩니다.',
    en: 'For the start screen, the tutorial, the explanations and the dialogs. For this run only.',
  },

  // MIPS: Advanced (SPIM's machine options, the run's arguments, the exception handler).
  advanced: { ko: '— 이번 실행에만 적용되고, 다음 어셈블부터 쓰입니다', en: '— for this run only, taken up by the next assemble' },
  machine: {
    bare: {
      ko: '늘 꺼져 있습니다. 켜면 `li` · `la` · `move` 명령이 오류가 됩니다(QtSpim 과 같음)',
      en: 'Always off: with it on, the `li` · `la` · `move` instructions are errors (as in QtSpim)',
    },
    acceptPseudo: { ko: '`li` · `la` · `move` 같은 명령. 끄면 이들이 문법 오류가 됩니다', en: 'Instructions such as `li` · `la` · `move`. Off, they are syntax errors' },
    delayedBranches: {
      ko: '분기·점프가 한 명령 늦게 적용됩니다. 분기 오프셋이 PC+4 기준이 됩니다',
      en: 'Branches and jumps take effect one instruction later. Branch offsets count from PC+4',
    },
    delayedLoads: { ko: '적재한 값이 한 명령 늦게 레지스터에 들어갑니다', en: 'A loaded value reaches its register one instruction later' },
    mappedIo: {
      ko: '콘솔을 메모리의 장치 레지스터(`0xffff0000`~)로 씁니다. 실행 중에도 입력 칸이 열립니다',
      en: 'The console is used through device registers in memory (`0xffff0000` on). The input box is open while it runs, too',
    },
    quiet: { ko: '예외가 나도 "Exception occurred" 메시지를 내지 않습니다', en: 'No "Exception occurred" message on an exception' },
  },
  handlerNone: { ko: 'None — `__start` 라벨을 프로그램이 직접 둡니다', en: 'None — the program defines the `__start` label itself' },
  argv: {
    ko: '`argv[0]` 값은 늘 `program.s` 입니다(모두 같은 스택을 보도록). 시작 주소는 `__start` 입니다.',
    en: '`argv[0]` is always `program.s` (so that everyone sees the same stack). The program starts at `__start`.',
  },
};
