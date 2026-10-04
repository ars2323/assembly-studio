/* The Inspector's words beside its explanation (the explanation itself is
   core/explain.ts and isa/riscv/core/explain.ts, which take the language).
   `code` in backticks. */

export const INSPECTOR = {
  follow: { ko: '다시 PC 위치의 명령을 따라갑니다 (Esc)', en: 'Follow the instruction at PC again (Esc)' },
  // RISC-V: a word the decoder does not take apart.
  r4: {
    ko: '`fmadd.s` 같은 Fused multiply-add 명령의 R4 format은 Field로 나누어 보여 주지 않습니다.',
    en: 'The R4 format of the fused multiply-add instructions, such as `fmadd.s`, is not taken apart into fields here.',
  },
  noFormat: { ko: 'RV32 명령 형식 어디에도 맞지 않는 Word입니다.', en: 'This word fits none of the RV32 instruction formats.' },
};
