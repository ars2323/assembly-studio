/* The tutorial's steps that are the same for both ISAs, or differ only by a
   register's name or a line of the example (the ISA's steps file passes
   them).  Each ISA's chapters (tutorial/steps.ts, isa/riscv/renderer/
   tutorial-steps.ts) are made of these and of its own. */

import type { Step, Tutorial } from './engine.ts';
import {
  $, $$, button, gutterAndLine, labelTags, lines, pcLine, pinnedReg, reg, regCells, regShown, scrollIn, statusLead, tab, textOf, trow,
} from './targets.ts';

// A register as the steps name it: its key in the Registers panel and its
// name in the example's code (MIPS: both $t3; RISC-V: x28 and t3).
export interface Reg { key: string; name: string }

// The first line of both examples' code (li $t1, 5 / li t1, 5).
const FIRST = /^\s+li\s+\$?t1, 5\b/;

// The alias the student is asked for.
const ALIAS = 'sum';

// ---- 1 the screen ------------------------------------------------------------------------

export const welcome = (isa: string): Step => ({
  id: 'welcome', kind: 'explain', file: 'tutorial.s', view: 'editor',
  title: () => '튜토리얼을 시작합니다',
  body: (t) => `${isa} 어셈블리 코드를 기계어로 바꾸고, 한 줄씩 실행하며 레지스터와 메모리가 바뀌는 모습을 보는 프로그램입니다. `
    + '툴바 왼쪽은 어셈블과 실행 버튼이고, 오른쪽 아이콘으로는 튜토리얼을 다시 보거나 파일을 만들고 열거나 설정을 바꿉니다. '
    + (t.host.narrow() ? '그 아래 화면은 툴바의 Editor · Run 으로 바꿔 가며 봅니다.' : '그 아래 왼쪽이 Editor, 오른쪽이 실행 결과를 보는 Run 쪽입니다.'),
  targets: () => [$('.toolbar .runctl'), $('.toolbar .tools')],
  prepare: async (t) => { if (t.host.running()) await t.host.stop(); },
});

export const editor = (): Step => ({
  id: 'editor', kind: 'explain', file: 'tutorial.s', view: 'editor',
  title: () => 'Editor: 코드를 쓰는 곳',
  body: () => '머리에는 파일 이름 · 인코딩 · 줄바꿈 방식이 나옵니다. 내 파일을 고치면 파일 이름 뒤에 작은 점이 생기고, 저장하면 사라집니다. '
    + '지금 열린 `tutorial.s` 는 예제라서 고칠 수 없습니다(읽기 전용).',
  targets: (t) => [$('.editor-panel .phead'), lines(t, 1, 6)],
  reveal: (t) => t.host.revealLine(1),
});

// ---- 2 assemble ------------------------------------------------------------------------

export const assemble = (): Step => ({
  id: 'assemble', kind: 'practice', file: 'tutorial.s', view: 'editor', keys: ['Ctrl+S'],
  title: () => 'Assemble: 코드를 기계어로',
  doing: () => [{ key: 'Ctrl+S' }, '또는', { click: 'Assemble' }],
  body: () => '어셈블은 쓴 코드를 기계어로 바꾸는 일입니다. 내 파일에서는 이 버튼이 Save & Assemble 이 되어 저장도 함께 합니다. '
    + '어셈블해 보세요. 끝나면 결과를 짚어 드립니다.',
  targets: () => [button('assemble')],
  prepare: async (t) => { if (t.host.running()) await t.host.stop(); },
  done: (_t, s) => (s.kind === 'assembled' && s.ok ? 'next' : null),
  result: { view: 'editor',
    title: () => '어셈블되었습니다',
    body: () => 'Editor 아래 Assemble 패널의 칸에 결과(Assembled), 만들어진 명령 수, 저장 여부, 어셈블한 때가 나옵니다. 예제는 저장하지 않습니다. '
      + '맨 아래 상태 표시줄은 지금 상태와 PC 를, 오른쪽 끝에는 지금 쓸 수 있는 키를 보여 줍니다.',
    targets: () => [$('.asm .cells'), statusLead(), $('.status .keys')] },
  skip: async (t) => { await t.host.assemble(); },
});

export const textColumns = (): Step => ({
  id: 'text', kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
  title: () => 'Text 탭: 메모리에 올라간 명령',
  body: () => '어셈블된 명령이 한 줄에 하나씩 나옵니다. Address 는 명령이 놓인 주소, Encoding 은 32비트 기계어, Format 은 명령 형식, '
    + 'Instruction 은 기계어를 다시 읽은 명령입니다. Line 과 Source 는 그 명령이 나온 소스 줄입니다.',
  // The column heads and the first line of the student's code; the card keeps off the rows.
  targets: (t) => [$('.textpanel .theader'), trow(t.addr(FIRST))],
  avoid: () => [$('.textpanel .text')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); t.column('text', 'word'); },
  reveal: (t) => t.host.revealAddr(t.addr(FIRST)),
});

// ---- 3 one line at a time ------------------------------------------------------------------

export const hexDecBin = (r: Reg, after: RegExp): Step => ({
  id: 'radix', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => 'Hex · Dec · Bin: 한 값, 세 가지 표기',
  body: () => `Hex 는 16진수, Dec 는 10진수, Bin 은 2진수입니다. 셋 모두 \`${r.name}\` 의 같은 값 12 이고, 2진수는 네 자리씩 띄어 두었습니다. `
    + '패널 머리의 Hex · Dec · Bin 체크 상자로 열을 보이거나 감출 수 있습니다.',
  targets: () => [...regCells(r.key), $('.regs .colboxes')],
  prepare: async (t) => { await t.atLeast(after); t.column('regs', 'dec'); t.column('regs', 'bin'); },
  reveal: (t) => t.host.revealRegister(r.key),
});

const withoutPin = (t: Tutorial, key: string) => {
  const m = t.host.marks();
  if (m.pins.includes(key)) t.host.setMarks({ ...m, pins: m.pins.filter((k) => k !== key) });
};
const withPin = (t: Tutorial, key: string, alias?: string) => {
  const m = t.host.marks();
  const aliases = m.aliases.filter(([k]) => k !== key);
  if (alias) aliases.push([key, alias]);
  t.host.setMarks({ pins: m.pins.includes(key) ? m.pins : [...m.pins, key], aliases: alias === undefined ? m.aliases : aliases });
};

export const pin = (r: Reg, after: RegExp): Step => ({
  id: 'pin', kind: 'practice', file: 'tutorial.s', view: 'run',
  title: () => '별: 자주 볼 레지스터를 맨 위에',
  doing: () => [{ click: `${r.name} 줄의 ☆` }],
  body: () => `레지스터 줄 맨 왼쪽에 마우스를 올리면 별이 나타납니다. 표시한 \`${r.name}\` 줄의 별을 눌러 보세요. 누르면 이 레지스터가 어디로 가는지 보여 드립니다.`,
  targets: () => [reg(r.key)],
  prepare: async (t) => { await t.atLeast(after); withoutPin(t, r.key); t.reveal($(`.rrow[data-reg="${r.key}"] .star`)); },
  reveal: (t) => t.host.revealRegister(r.key),
  done: (_t, s) => (s.kind === 'pin' && s.key === r.key && s.on ? 'next' : null),
  result: { view: 'run',
    title: () => 'Pinned 에 고정되었습니다',
    body: () => `\`${r.name}\` 가 목록 맨 위 Pinned 묶음에 들어갔습니다. 목록을 아래로 내려도 이 줄은 늘 보입니다. 별을 다시 누르면 풀립니다.`,
    targets: () => [$('.regs .pinblock')] },
  skip: async (t) => { withPin(t, r.key); },
});

export const alias = (r: Reg, after: RegExp): Step => ({
  id: 'alias', kind: 'practice', file: 'tutorial.s', view: 'run',
  title: () => '별칭: 레지스터에 내 이름 붙이기',
  doing: () => [{ click: '이름 두 번 클릭' }, '→', `${ALIAS} 입력`, '→', { key: 'Enter' }],
  body: () => `Pinned 묶음의 \`${r.name}\` 이름을 두 번 누르거나 옆의 연필 칩을 누르세요. \`${ALIAS}\` 처럼 이름을 쓰고 Enter 키를 누르면 됩니다. `
    + '건너뛰어도 괜찮은 단계입니다.',
  targets: () => [pinnedReg(r.key)],
  prepare: async (t) => {
    await t.atLeast(after);
    withPin(t, r.key, '');
    t.reveal($(`.pinblock .rrow[data-pin="${r.key}"] .alias`));
  },
  done: (_t, s) => (s.kind === 'alias' && s.key === r.key && s.alias !== '' ? 'next' : null),
  result: { view: 'run',
    title: () => '이름이 붙었습니다',
    body: (t) => {
      const a = t.host.marks().aliases.find(([k]) => k === r.key)?.[1] ?? ALIAS;
      return `이제 \`${r.name}\` 옆에 별칭 \`${a}\` 도 함께 나옵니다. C 코드의 변수 이름을 붙여 두면 값이 무엇인지 알아보기 쉽습니다. 자리가 좁으면 줄여서 보이고, 마우스를 올리면 다 보입니다.`;
    },
    targets: () => [pinnedReg(r.key)] },
  skip: async (t) => { withPin(t, r.key, ALIAS); },
});

// ---- 4 memory ------------------------------------------------------------------------------

export const dataTab = (): Step => ({
  id: 'data', kind: 'practice', file: 'tutorial.s', view: 'run',
  title: () => 'Data 탭: 메모리 보기',
  doing: () => [{ click: 'Data' }, '탭 클릭'],
  body: () => 'Text 탭 옆의 Data 탭은 메모리에 든 값을 보여 줍니다. Data 탭을 눌러 보세요. 프로그램의 `.data` 부분이 어디에 놓였는지 짚어 드립니다.',
  targets: () => [tab('Data')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); if (t.host.tab() === 'data') t.host.setTab('text'); },
  done: (_t, s) => (s.kind === 'tab' && s.tab === 'data' ? 'next' : null),
  result: { view: 'run', tab: 'data',
    title: () => '라벨: 주소에 붙인 이름',
    body: () => '`.data` 부분에 적은 문자열과 워드가 메모리에 놓인 모습입니다. `msg` · `total` 같은 라벨은 주소에 붙인 이름이고, '
      + '+0 · +8 은 아랫줄 주소에서 몇 바이트 떨어졌는지를 뜻합니다.',
    targets: () => [labelTags('msg'), labelTags('msg')?.nextElementSibling],
    reveal: () => scrollIn(labelTags('msg')) },
  skip: async (t) => { t.host.setTab('data'); },
});

// ---- 5 running ----------------------------------------------------------------------------

export const breakpoint = (print: RegExp): Step => ({
  id: 'breakpoint', kind: 'practice', file: 'tutorial.s', view: 'editor',
  title: (t) => `브레이크포인트: ${t.line(print)}행에서 멈추게`,
  doing: (t) => [{ click: `${t.line(print)}행 왼쪽 칸` }, '클릭'],
  body: (t) => `${t.line(print)}행의 맨 왼쪽, 줄 번호 왼쪽 칸을 눌러 빨간 점을 찍어 보세요. 실행하다가 이 줄 앞에서 멈추라는 표시이고, `
    + '같은 칸을 한 번 더 누르면 지워집니다. 점을 찍으면 다음으로 넘어갑니다.',
  targets: (t) => [gutterAndLine(t, t.line(print))],
  prepare: async (t) => {
    await t.notFinished();
    if (t.host.breakpointLines().includes(t.line(print))) await t.host.setBreakpointLine(t.line(print), false);
  },
  reveal: (t) => t.host.revealLine(t.line(print)),
  done: (t, s) => (s.kind === 'breakpoint' && s.on && s.line === t.line(print) ? 'next' : null),
  skip: async (t) => { await t.host.setBreakpointLine(t.line(print), true); },
});

export const run = (print: RegExp): Step => ({
  id: 'run', kind: 'practice', file: 'tutorial.s', keys: ['F5'],
  title: () => 'Run: 끝까지, 또는 빨간 점까지',
  doing: () => [{ key: 'F5' }, '또는', { click: 'Run' }],
  body: () => 'Run 은 한 줄씩이 아니라 프로그램을 쭉 실행합니다. 프로그램이 끝나거나 빨간 점을 만나면 멈춥니다. '
    + '실행해 보세요. 어디서 멈췄는지 알려 드립니다.',
  targets: () => [button('run')],
  prepare: async (t) => {
    await t.notFinished();
    if (!t.host.breakpointLines().includes(t.line(print))) await t.host.setBreakpointLine(t.line(print), true);
    if ((t.host.pc() ?? 0) >= t.addr(print) && (t.host.pc() ?? 0) < 0x80000000) await t.host.restart();
  },
  done: (_t, s) => (s.kind === 'stopped' && (s.reason === 'breakpoint' || s.reason === 'exit') ? 'next' : null),
  result: {
    title: (t) => (t.host.finished() ? '끝까지 실행되었습니다' : '빨간 점에서 멈췄습니다'),
    body: (t) => (t.host.finished() ? '빨간 점이 없어서 프로그램이 끝까지 실행되었습니다.'
      : '빨간 점을 찍은 줄 앞에서 멈췄습니다. 이 줄은 아직 실행되지 않았습니다. 상태 표시줄에도 멈춘 이유와 PC 가 나옵니다.'),
    targets: (t) => [statusLead(), ...(t.host.finished() ? [] : pcLine(t))],
    reveal: (t) => { if (!t.host.narrow() && !t.host.finished()) t.host.revealLine(t.line(print)); } },
  skip: async (t) => { await t.host.run(); },
});

export const slow = (): Step => ({
  id: 'slow', kind: 'practice', file: 'tutorial.s', keys: ['F5'],
  title: () => 'Run speed: 천천히 실행',
  doing: () => [{ click: '1 line/s' }, '→', { key: 'F5' }, '→', { key: 'Esc' }],
  body: () => 'Run speed 에서 1 line/s 를 고르고 실행하면 1초에 한 줄씩 실행되면서 PC 줄과 노란 줄이 옮겨 갑니다. '
    + '몇 줄 지켜본 뒤 Esc 키(또는 Stop 버튼)로 멈추면 다음으로 넘어갑니다.',
  targets: () => [$('.speedbox'), button('run')],
  // The Editor's lines are what to watch: the card keeps off them.
  avoid: (t) => (t.host.narrow() ? [] : [$('.editor-panel .cm-scroller')]),
  prepare: async (t) => { await t.notFinished(); },
  done: (_t, s) => (s.kind === 'slow-ended' ? 'next' : null),
  skip: async (t) => { if (t.host.running()) await t.host.stop(); },
  leave: async (t) => { if (t.host.running()) await t.host.stop(); await t.host.setSpeed('fast'); },
});

export const reset = (r: Reg): Step => ({
  id: 'reset', kind: 'practice', file: 'tutorial.s',
  title: () => 'Reset: 처음으로',
  doing: () => [{ click: 'Reset' }, '클릭'],
  body: () => 'Reset 은 마지막으로 어셈블한 프로그램을 처음 상태로 되돌립니다. 코드를 고쳤더라도 다시 어셈블하지는 않습니다(어셈블은 Ctrl+S). '
    + '눌러 보세요. 무엇이 처음으로 돌아가는지 보여 드립니다.',
  targets: () => [button('reset')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  done: (_t, s) => (s.kind === 'reset' ? 'next' : null),
  result: { view: 'run',
    title: () => '처음으로 돌아왔습니다',
    body: () => `\`${r.name}\` 가 다시 0 이 되었고, 상태 표시줄은 Ready 입니다. F10 키나 F5 키로 처음부터 다시 실행할 수 있습니다. 찍어 둔 빨간 점은 그대로 남아 있습니다.`,
    targets: () => [regShown(r.key), statusLead()],
    reveal: (t) => t.host.revealRegister(r.key) },
  skip: async (t) => { await t.host.restart(); },
});

// ---- 6 output and errors ---------------------------------------------------------------------

// `call`: the line that prints msg (its regular expression), and how the step says it.
export const console = (call: RegExp, say: string, printed: string): Step => ({
  id: 'console', kind: 'practice', file: 'tutorial.s', view: 'run', keys: ['F5'],
  title: () => '출력은 Console 패널에',
  doing: () => [{ key: 'F5' }, '끝날 때까지'],
  body: (t) => `${t.host.narrow() ? '' : `${t.line(call)}행의 ${say} `}끝까지 실행해 보세요. 빨간 점에서 멈추면 F5 키를 한 번 더 누르면 됩니다. `
    + '프로그램이 끝나면 출력이 어디에 나왔는지 보여 드립니다.',
  targets: (t) => [...(t.host.narrow() ? [] : [lines(t, t.line(call))]), $('.console')],
  prepare: async (t) => { await t.notFinished(); if (t.host.expandConsole()) t.did.push('console opened'); },
  reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(call)); },
  done: (_t, s) => (s.kind === 'stopped' && (s.reason === 'exit' || s.reason === 'error') ? 'next' : null),
  result: { view: 'run',
    title: () => '출력이 나왔습니다',
    body: () => `${printed} Console 패널에 나왔습니다. 프로그램은 여기서 끝났고, 상태 표시줄도 그렇게 알려 줍니다.`,
    targets: () => [$('.console .clog'), statusLead()] },
  skip: async (t) => { for (let i = 0; i < 3 && !t.host.finished(); i += 1) await t.host.run(); },
});

export const error = (): Step => ({
  id: 'error', kind: 'practice', file: 'tutorial-error.s', view: 'editor', phases: 2,
  keys: (t) => (t.phase === 0 ? ['Ctrl+S'] : []),
  title: (t) => (t.phase === 0 ? '오류가 나면' : 'Assemble 패널의 오류 목록'),
  doing: (t) => (t.phase === 0 ? [{ key: 'Ctrl+S' }, '또는', { click: 'Assemble' }] : [{ click: `Go to line ${t.host.errorLine() ?? ''} →` }]),
  body: (t) => (t.phase === 0
    ? '이번에는 일부러 한 줄을 틀리게 쓴 예제를 열었습니다. 어셈블해 보세요. 오류가 어디에 어떻게 나오는지 이어서 보여 드립니다.'
    : `오류 수, 틀린 줄과 그 내용, 고치는 요령이 나옵니다. 아래의 Go to line ${t.host.errorLine() ?? ''} 버튼을 누르면 Editor 의 그 줄로 가고, 튜토리얼도 다음으로 넘어갑니다.`),
  targets: (t) => (t.phase === 0 ? [button('assemble')]
    : [textOf($('.asm .notice h3')), $('.asm .item'), $('.asm .row .btn')]),
  reveal: () => scrollIn($('.asm .row .btn')),
  // The Editor's line with the error is part of what to look at: the card keeps off it.
  avoid: (t) => { const n = t.host.errorLine(); return t.phase === 1 && n && !t.host.narrow() ? [lines(t, n)] : []; },
  prepare: async (t) => { t.host.showView('editor'); },
  done: (_t, s) => (s.kind === 'assembled' && !s.ok ? 'phase' : s.kind === 'goto' ? 'next' : null),
  skip: async (t) => {
    if (t.phase === 0) { await t.host.assemble(); return; }
    const n = t.host.errorLine();
    if (n) t.host.goToLine(n);
  },
});

// "Go to line N" took the student to the line: show them where they are.
export const fixLine = (): Step => ({
  id: 'fix', kind: 'explain', file: 'tutorial-error.s', view: 'editor',
  prepare: async (t) => {
    if (!t.host.errorLine()) await t.host.assemble();
    const n = t.host.errorLine();
    if (n) t.host.goToLine(n);
  },
  title: () => '여기가 고칠 줄입니다',
  body: (t) => `Editor 의 ${t.host.errorLine() ?? ''}행으로 왔습니다. 커서가 이 줄에 있고, 틀린 줄은 붉게 표시됩니다. `
    + 'Assemble 패널의 설명대로 고친 뒤 Ctrl+S 키를 누르면 다시 어셈블합니다. 이 예제는 읽기 전용이라 여기서는 고치지 않습니다.',
  targets: (t) => { const n = t.host.errorLine(); return n ? [lines(t, n)] : []; },
  reveal: (t) => { const n = t.host.errorLine(); if (n) t.host.revealLine(n); },
});

// ---- 7 your own screen ------------------------------------------------------------------------

export const separators = (): Step => ({
  id: 'separators', kind: 'explain', file: 'tutorial.s', view: 'run',
  title: () => '패널 크기 바꾸기',
  body: (t) => `패널 사이의 표시한 띠를 끌면 크기가 바뀝니다. ${t.host.narrow() ? 'Registers 와 Text, Registers 와 Console, Text 와 Inspector 사이' : 'Editor 와 Run 쪽, Editor 와 Assemble 패널, Registers 와 Text, Registers 와 Console, Text 와 Inspector 사이'}에 있습니다. `
    + '띠를 두 번 누르면 처음 크기로 돌아갑니다. 지금 끌어 봐도 됩니다.',
  // The Registers | Text splitter first: the card stands beside it, over Text.
  targets: () => [$('.run-grid > .rsplit'), $('.leftcol > .vgrip'), $('.centre > .vgrip'), $('.split > .splitter'), $('.pane-editor > .vgrip')],
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
});

export const theme = (): Step => ({
  id: 'theme', kind: 'explain', file: 'tutorial.s',
  title: () => '밝은 화면, 어두운 화면',
  body: () => '상태 표시줄 오른쪽 끝의 해와 달 스위치로 밝은 화면과 어두운 화면을 언제든 바꿀 수 있습니다. 지금 눌러 봐도 됩니다. 한 번 더 누르면 돌아옵니다.',
  targets: () => [$('.status .stheme .theme-switch')],
});

export const end = (): Step => ({
  id: 'end', kind: 'end', file: 'tutorial.s',
  // Ends on the example, assembled and whole (not on the error example).
  prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
  title: () => '튜토리얼을 마쳤습니다',
  body: () => '이제 New file 아이콘으로 새 파일을 열어 직접 써 보세요. 끝내기를 누르면 예제는 내려가고 튜토리얼 전의 화면으로 돌아갑니다. '
    + '튜토리얼은 툴바의 Tutorial(?) 아이콘으로 언제든 다시 볼 수 있습니다.',
  targets: () => $$('.toolbar .tools .iconbtn').slice(0, 2),
});
