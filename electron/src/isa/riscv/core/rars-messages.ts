/* RARS's messages in the window's words (the table and why: MIPS's
   src/core/asm-messages.ts).  The messages are RARS's assembler's
   (rars/assembler/*.java at the pinned commit); one not here is shown as
   RARS wrote it. */

import type { Lang, Msg } from '../../../core/lang.ts';
import { ASM_MESSAGES, shortMessage } from '../../../core/asm-messages.ts';

export const RARS_MESSAGES = {
  operandType: { ko: '피연산자의 종류가 맞지 않음', en: 'Wrong kind of operand' },
  operandRange: { ko: '피연산자 값이 범위를 벗어남', en: 'Operand out of range' },
  tooMany: { ko: '피연산자가 너무 많거나 형식이 틀림', en: 'Too many operands, or in the wrong form' },
  tooFew: { ko: '피연산자가 모자라거나 형식이 틀림', en: 'Too few operands, or in the wrong form' },
  element: { ko: '읽을 수 없는 부분이 있음', en: 'Something here cannot be read' },
  notTerminated: { ko: '문자열이 닫히지 않음', en: 'String not closed' },
  notInteger: { ko: '정수도 Label 도 아님', en: 'Not an integer or a label' },
  pseudo: { ko: '의사 명령을 쓸 수 없는 설정', en: 'Pseudo instructions are turned off' },
  macro: { ko: 'Macro 를 쓰는 방법이 맞지 않음', en: 'The macro is used the wrong way' },
};

const RARS: [RegExp, Msg][] = [
  [/is not a recognized operator/i, ASM_MESSAGES.unknownInstruction],
  [/directive is invalid or not implemented/i, ASM_MESSAGES.unknownDirective],
  [/operand is of incorrect type/i, RARS_MESSAGES.operandType],
  [/operand is out of range|is an out-of-range value/i, RARS_MESSAGES.operandRange],
  [/too many or incorrectly formatted operands/i, RARS_MESSAGES.tooMany],
  [/too few( or incorrectly formatted)? operands/i, RARS_MESSAGES.tooFew],
  [/invalid language element/i, RARS_MESSAGES.element],
  [/not found in symbol table/i, ASM_MESSAGES.undefined],
  [/already defined/i, ASM_MESSAGES.twice],
  [/string is not terminated/i, RARS_MESSAGES.notTerminated],
  [/is not a valid integer constant or label/i, RARS_MESSAGES.notInteger],
  [/extended \(pseudo\) instruction or format not permitted/i, RARS_MESSAGES.pseudo],
  [/invalid parameters for macro/i, RARS_MESSAGES.macro],
];

export const rarsMessage = (message: string, lang: Lang): string | null => shortMessage(RARS, message, lang);
