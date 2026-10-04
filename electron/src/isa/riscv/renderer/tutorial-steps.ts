/* The RISC-V tutorial: seven chapters over src/isa/riscv/examples/
   tutorial.s (and tutorial-error.s in chapter 6).  The engine is
   renderer/app/tutorial/engine.ts; the steps both ISAs share,
   renderer/app/tutorial/common.ts.  The Registers panel knows a register
   by its number (x28), the code by its name (t3): the steps name both. */

import * as common from '../../../renderer/app/tutorial/common.ts';
import type { Chapter, Step } from '../../../renderer/app/tutorial/engine.ts';
import {
  $, $$, button, dataCell, lines, pcLine, reg, scrollIn, sideLine, statusChanged, trow,
} from '../../../renderer/app/tutorial/targets.ts';

// The example's lines the steps are about.
const ADD = /^\s+add\s+t3, t1, t2/;
const SUB = /^\s+sub\s+t4/;
const BIG = /li\s+t0, 0x12345678/;
const SW = /^\s+sw\s+t3, 0\(a1\)/;
const LW = /^\s+lw\s+s0, 0\(a1\)/;
const PRINT = /^\s+li\s+a7, 4\b/;
const ECALL = /^\s+ecall/;              // the first: it prints msg
const T3 = { key: 'x28', name: 't3' };
const SP = 'x2';
const stackTag = () => $$('.dtags.dsec-stack').find((e) => /\bsp\b/.test(e.textContent ?? '')) ?? null;

const twoWords: Step = {
  id: 'pseudo', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
  title: () => '소스 한 줄이 명령 두 개가 되었습니다',
  body: () => '`li t0, 0x12345678` 한 줄이 `lui`(위 20비트) + `addi`(아래 12비트) 두 명령이 되었습니다. '
    + '32비트 상수는 명령 하나에 다 들어가지 않아서 어셈블러가 나누었습니다. Text 의 두 줄 모두 소스의 한 줄에서 나왔습니다.',
  targets: (t) => [...sideLine(t, BIG), trow(t.addr(BIG)), trow(t.addr(BIG) + 4)],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  reveal: (t) => { t.host.revealAddr(t.addr(BIG) + 4); if (!t.host.narrow()) t.host.revealLine(t.line(BIG)); },
};

const registers: Step = {
  id: 'registers', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => 'Registers 패널: 이름이 둘씩',
  body: () => '레지스터 32개가 쓰임새대로 묶여 있고, 하나에 이름이 둘입니다. 표시한 `x5 t0` 줄처럼 번호 이름(`x5`)과 쓰임새 이름(`t0`)은 같은 레지스터이고, '
    + '코드에는 어느 쪽을 써도 됩니다. 목록 맨 위의 `pc` 는 다음에 실행할 명령의 주소입니다.',
  targets: () => [reg('x5')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  reveal: () => scrollIn(reg('x5')),
};

const step: Step = {
  id: 'step', kind: 'practice', file: 'tutorial.s', view: 'editor', keys: ['F10'],
  title: () => 'Step: 한 줄 실행',
  doing: () => [{ key: 'F10' }, '또는', { click: 'Step' }],
  body: () => '왼쪽에 막대가 있는 줄이 PC 줄, 곧 다음에 실행할 줄입니다. 프로그램은 `main` 첫 줄에서 시작하고, 앞의 `li` 두 줄은 미리 실행해 두었습니다. '
    + '이 줄을 실행해 보세요. 무엇이 바뀌었는지 짚어 드립니다.',
  targets: (t) => [button('step'), lines(t, t.line(ADD))],
  prepare: async (t) => { if (t.host.pc() !== t.addr(ADD) || !t.host.assembled()) await t.exactly(ADD); },
  reveal: (t) => t.host.revealLine(t.line(ADD)),
  done: (_t, s) => (s.kind === 'stopped' ? 'next' : null),
  result: { view: 'run',
    title: () => '한 줄을 실행했습니다',
    body: (t) => (t.host.narrow() ? 'Registers 에서 `x28 t3` 줄이 노랗게 바뀌었습니다. Editor 탭의 PC 줄은 다음 줄로 내려가 있습니다.'
      : 'PC 줄이 다음 줄로 내려갔고, Registers 에서 `x28 t3` 줄이 노랗게 바뀌었습니다.'),
    targets: (t) => [reg(T3.key), ...pcLine(t)],
    reveal: (t) => t.host.revealRegister(T3.key) },
  skip: async (t) => { await t.host.step(); },
};

const changed: Step = {
  id: 'changed', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => '노란 줄: 방금 바뀐 레지스터',
  body: () => '노란 줄은 방금 실행한 명령이 바꾼 레지스터입니다. `add t3, t1, t2` 가 5 + 7 = 12 를 `t3`(번호로는 `x28`)에 넣었습니다. '
    + '아래 상태 표시줄에도 Changed 로 나옵니다. 다음 줄을 실행하면 노란 표시는 그 줄이 바꾼 레지스터로 옮겨 갑니다.',
  targets: () => [reg(T3.key), statusChanged()],
  prepare: async (t) => { if (t.host.pc() !== t.addr(SUB)) await t.exactly(SUB); },
  reveal: (t) => t.host.revealRegister(T3.key),
};

const inspector: Step = {
  id: 'inspector', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text', quietPc: true,
  title: () => 'Inspector: 명령 하나를 32비트로',
  body: () => '방금 실행한 `add` 명령입니다. 맨 앞 배지는 명령 형식으로, R‑type 은 레지스터끼리 계산하는 형식입니다. 그 아래 32칸이 명령의 비트입니다. '
    + 'Text 에서 줄을 누르면 그 명령이 여기에 고정되고(머리에 Pinned), Follow PC 를 누르면 다시 PC 를 따라갑니다.',
  targets: () => [$('.insp .ititle'), $('.insp .bitgrid'), $('.insp .phead')],
  prepare: async (t) => { await t.atLeast(SUB); },
  inspect: (t) => t.addr(ADD),
};

const bits: Step = {
  id: 'bits', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text', quietPc: true,
  title: () => '비트 칸 = Encoding 값',
  body: () => {
    const word = document.querySelector('.trow.sel .word')?.textContent ?? '';
    return `funct7 · rs2 · rs1 · funct3 · rd · opcode 칸의 0과 1을 왼쪽부터 이어 붙이면 32비트 워드 하나입니다. 이것을 16진수로 쓴 것이 Text 의 Encoding 열 \`${word}\` 입니다. 같은 명령, 같은 값입니다.`;
  },
  targets: () => [...['funct7', 'rs2', 'rs1', 'funct3', 'rd', 'opcode'].map((f) => $(`.insp .fbox.f-${f}`)), $('.trow.sel .word')],
  avoid: () => [$('.insp .ihead'), $('.trow.sel')],
  prepare: async (t) => { await t.atLeast(SUB); t.column('text', 'word'); },
  inspect: (t) => t.addr(ADD),
  reveal: (t) => t.host.revealAddr(t.addr(ADD)),
};

const store: Step = {
  id: 'store', kind: 'practice', file: 'tutorial.s', view: 'run', tab: 'data', keys: ['F10'],
  title: () => 'sw: 메모리에 쓰기',
  doing: () => [{ key: 'F10' }],
  body: (t) => `${t.host.narrow() ? '' : '왼쪽에 표시한 '}\`sw t3, 0(a1)\` 줄은 \`t3\` 의 값을 \`a1\` 이 가리키는 곳, 곧 메모리의 \`total\` 자리에 씁니다. `
    + 'F10 키를 눌러 이 줄을 실행해 보세요. 실행하고 나면 `total` 자리가 어떻게 바뀌었는지 보여 드립니다.',
  targets: (t) => [...sideLine(t, SW), dataCell(t, 'total')],
  prepare: async (t) => { await t.between(SW, LW); },
  reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(SW)); scrollIn(dataCell(t, 'total')); },
  done: (t, s) => (s.kind === 'stopped' && ((t.host.pc() ?? 0) >= t.addr(LW) || t.host.finished()) ? 'next' : null),
  result: { view: 'run', tab: 'data',
    title: () => '메모리에 썼습니다',
    body: () => '`sw` 가 `t3` 의 값 12 를 `total` 자리에 썼습니다. 표시한 칸이 0 에서 12 로 바뀌었습니다(16진수 0000000c).',
    targets: (t) => [dataCell(t, 'total')],
    reveal: (t) => scrollIn(dataCell(t, 'total')) },
  skip: async (t) => { await t.host.runUntil(t.addr(LW)); },
};

const stack: Step = {
  id: 'stack', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'data',
  title: () => '스택과 sp',
  body: () => '`sp`(번호로는 `x2`)는 스택의 맨 위(가장 낮은 주소)를 가리킵니다. `addi sp, sp, -4` 가 한 칸(4바이트)을 만들어 `sp` 가 4 줄었고, '
    + '`sw s0, 0(sp)` 가 그 칸에 12 를 넣었습니다. 스택은 낮은 주소 쪽으로 자랍니다.',
  targets: () => [stackTag(), $('.drow.dsec-stack .dval.pointed'), reg(SP)],
  prepare: async (t) => { await t.between(PRINT, ECALL); },
  reveal: (t) => { scrollIn(stackTag()); t.host.revealRegister(SP); },
};

export const CHAPTERS: Chapter[] = [
  { title: '화면 둘러보기', steps: [common.welcome('RISC-V'), common.editor()] },
  { title: '어셈블', steps: [common.assemble(), common.textColumns(), twoWords, registers] },
  { title: '한 줄씩 실행', steps: [step, changed, common.hexDecBin(T3, SUB), common.pin(T3, SUB), common.alias(T3, SUB), inspector, bits] },
  { title: '메모리', steps: [common.dataTab(), store, stack] },
  { title: '실행 제어', steps: [common.breakpoint(PRINT), common.run(PRINT), common.slow(), common.reset(T3)] },
  { title: '출력과 오류', steps: [
    common.console(ECALL, '`ecall` 줄이 문자열을 출력합니다(`a7` 이 4 이면 문자열 출력).', '`ecall` 이 출력한 문자열과 정수가'),
    common.error(), common.fixLine()] },
  { title: '내 화면 맞추기', steps: [common.separators(), common.theme(), common.end()] },
];
