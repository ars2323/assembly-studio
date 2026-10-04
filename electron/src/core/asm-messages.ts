/* The assembler's messages in the window's words: the error list shows a
   short message in the language in use, and the engine's own text beside
   it (what the student finds in its documentation and in a search).  A
   message not in the table is shown as the engine wrote it.

   Here: the words both ISAs share (the pre-check's, core/precheck.ts; an
   assembler that stopped) and SPIM's messages (CPU/parser.y, scanner.l,
   sym-tbl.cpp).  RARS's are isa/riscv/core/rars-messages.ts. */

import { say, type Lang, type Msg } from './lang.ts';

export const ASM_MESSAGES = {
  unknownInstruction: { ko: '알 수 없는 명령', en: 'Unknown instruction' },
  unknownDirective: { ko: '알 수 없는 지시어', en: 'Unknown directive' },
  // The engine's process ended while it assembled the program.
  stopped: { ko: '어셈블러가 이 프로그램에서 멈췄습니다', en: 'The assembler stopped on this program' },
  stoppedHint: {
    ko: (line: number) => (line > 0
      ? `${line}행을 읽다가 멈췄습니다. 이 줄과 그 위의 줄을 확인하세요.`
      : '어느 줄에서 멈췄는지는 알 수 없습니다. 최근에 고친 줄을 확인하세요.'),
    en: (line: number) => (line > 0
      ? `It stopped while reading line ${line}. Check that line and the ones above it.`
      : 'Where it stopped is not known. Check the lines you changed last.'),
  },
  syntax: { ko: '문법 오류', en: 'Syntax error' },
  twice: { ko: 'Label 이 두 번 정의됨', en: 'Label defined twice' },
  range: { ko: '값이 범위를 벗어남', en: 'Value out of range' },
  tooLarge: { ko: '값이 너무 큼', en: 'Value too large' },
  shift: { ko: '시프트 양이 범위를 벗어남', en: 'Shift amount out of range' },
  character: { ko: '알 수 없는 문자', en: 'Unknown character' },
  register: { ko: '레지스터 번호가 범위를 벗어남', en: 'Register number out of range' },
  dataInText: { ko: '.text 에는 데이터를 둘 수 없음', en: 'No data in the text segment' },
  opcodeLabel: { ko: '명령 이름은 Label 로 쓸 수 없음', en: 'An instruction name cannot be a label' },
  undefined: { ko: '정의되지 않은 Label', en: 'Undefined label' },
  escape: { ko: '문자열 안의 잘못된 escape', en: 'Bad escape in a string' },
  divideByZero: { ko: '0 으로 나눔', en: 'Division by zero' },
};

// SPIM's message (the part before "on line N", asm-errors.ts) -> its words.
const SPIM: [RegExp, Msg][] = [
  [/^syntax error$/i, ASM_MESSAGES.syntax],
  [/defined for the second time/i, ASM_MESSAGES.twice],
  [/^immediate value \(.*\) out of range/i, ASM_MESSAGES.range],
  [/immediate value is too large/i, ASM_MESSAGES.tooLarge],
  [/^shift distance/i, ASM_MESSAGES.shift],
  [/^unknown character$/i, ASM_MESSAGES.character],
  [/register number out of range/i, ASM_MESSAGES.register],
  [/can't put data in text segment/i, ASM_MESSAGES.dataInText],
  [/cannot use opcodes as labels/i, ASM_MESSAGES.opcodeLabel],
  [/undefined symbol/i, ASM_MESSAGES.undefined],
  [/bad character in .* construct in string/i, ASM_MESSAGES.escape],
  [/^divide by zero$/i, ASM_MESSAGES.divideByZero],
];

// The words for `message` by `table`, in `lang`; null when it has none.
export function shortMessage(table: readonly [RegExp, Msg][], message: string, lang: Lang): string | null {
  const hit = table.find(([re]) => re.test(message.trim()));
  return hit ? say(lang, hit[1]) : null;
}

export const spimMessage = (message: string, lang: Lang): string | null => shortMessage(SPIM, message, lang);
