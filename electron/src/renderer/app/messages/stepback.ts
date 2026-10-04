/* Step back (the toolbar's button next to Step), both ISAs: its tooltip,
   which says what it undoes and what it cannot. */

export const STEPBACK = {
  tooltip: {
    ko: '한 단계 되돌리기 (Shift+F10): 마지막으로 실행한 명령어 하나를 되돌립니다. 레지스터와 메모리가 그 명령어를 실행하기 전으로 돌아갑니다(최근 1000개까지). 콘솔에 이미 출력된 내용과 이미 읽은 입력은 되돌리지 않습니다.',
    en: 'Step back (Shift+F10): undo the last instruction executed. Registers and memory return to what they were before it (up to the last 1000). Console output already printed and input already read stay as they are.',
  },
};
