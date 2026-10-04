/* The tutorial's words (tutorial/engine.ts, tutorial/common.ts,
   tutorial/steps.ts, isa/riscv/renderer/tutorial-steps.ts).

     card       the card's own: its buttons, keys, "Chapter n", "Try it"
     chapters   the eight chapters' names, the same for both ISAs
     steps      the steps both ISAs have, by the step's id; where the two
                differ only by a register's name or a line of the example,
                that is a parameter
     mips, riscv  what is the ISA's own

   A step's title and body; `doing`, the short line of what a practice step
   asks for (words, {key}, {click}); `result`, the card once it is done.
   `code` in backticks.  Every parameter is a plain value (a line number, a
   register's name, whether the window is narrow).

   The names on screen stay as the screen says them, in both languages:
   the buttons (Assemble, Run, Step, Step back, Reset), the panels
   (Registers, Text, Data, Inspector, Console), the keys. */

import type { Doing } from '../tutorial/engine.ts';

type Do = Doing[];

export const CARD = {
  skip: { ko: '건너뛰기', en: 'Skip' },
  skipTitle: { ko: '대신 해 두고 넘어갑니다 (→)', en: 'Do it for me and go on (→)' },
  back: { ko: '이전', en: 'Back' },
  backTitle: { ko: '이전 (←)', en: 'Back (←)' },
  next: { ko: '다음', en: 'Next' },
  nextTitle: { ko: '다음 (→)', en: 'Next (→)' },
  finish: { ko: '끝내기', en: 'Finish' },
  quit: { ko: '그만두기', en: 'Quit' },
  quitTitle: { ko: '튜토리얼 그만두기', en: 'Quit the tutorial' },
  keysTitle: { ko: '← 이전 · → 다음', en: '← back · → next' },
  done: { ko: '완료', en: 'Done' },
  tryIt: { ko: '직접 해 보세요', en: 'Try it' },
  chapter: { ko: (n: number) => `${n}장`, en: (n: number) => `Chapter ${n}` },
  // The chapter's number in the last card's list of them.
  recap: { ko: (n: number) => `${n}장`, en: (n: number) => `${n}.` },
  count: { ko: (n: number, total: number) => `${n}단계 / ${total}단계`, en: (n: number, total: number) => `Step ${n} of ${total}` },
};

export const CHAPTERS = {
  screen: { ko: '화면 둘러보기', en: 'A look around' },
  assemble: { ko: '어셈블', en: 'Assembling' },
  step: { ko: '한 줄씩 앞으로, 뒤로', en: 'One line forward, one back' },
  registers: { ko: 'Registers 와 Inspector', en: 'Registers and the Inspector' },
  memory: { ko: '메모리', en: 'Memory' },
  run: { ko: '실행 제어', en: 'Controlling a run' },
  io: { ko: '입출력과 오류', en: 'Input, output and errors' },
  yours: { ko: '내 프로그램 쓰기', en: 'Writing your own' },
};

// Words that join the parts of a `doing` line.
const OR = { ko: '또는', en: 'or' };

export const STEPS = {
  // ---- 1 a look around
  welcome: {
    title: { ko: '튜토리얼을 시작합니다', en: 'Welcome to the tutorial' },
    body: {
      ko: (isa: string, narrow: boolean) => `${isa} 어셈블리 코드를 기계어로 바꾸고, 한 줄씩 실행하며 레지스터와 메모리가 바뀌는 모습을 보는 프로그램입니다. `
        + '툴바 왼쪽은 어셈블과 실행 버튼이고, 오른쪽 아이콘으로는 튜토리얼을 다시 보거나 파일을 만들고 열거나 설정을 바꿉니다. '
        + (narrow ? '그 아래 화면은 툴바의 Editor · Run 으로 바꿔 가며 봅니다.' : '그 아래 왼쪽이 Editor, 오른쪽이 실행 결과를 보는 Run 쪽입니다.'),
      en: (isa: string, narrow: boolean) => `This program turns ${isa} assembly code into machine code and runs it one line at a time, `
        + 'so you can watch the registers and memory change. '
        + 'On the left of the toolbar are the assemble and run buttons; the icons on the right open the tutorial again, create and open files, and change settings. '
        + (narrow ? 'Below it, Editor · Run in the toolbar switch between the two sides.'
          : 'Below it, the Editor is on the left and the Run side, where you see what the program does, on the right.'),
    },
  },
  editor: {
    title: { ko: 'Editor: 코드를 쓰는 곳', en: 'Editor: where you write code' },
    body: {
      ko: '머리에는 파일 이름 · 인코딩 · 줄바꿈 방식이 나오고, 코드는 명령 · 레지스터 · 숫자 · 주석이 저마다 다른 색으로 나옵니다. '
        + '지금 열린 `tutorial.s` 는 튜토리얼 예제라서 고칠 수 없습니다(읽기 전용).',
      en: 'Its head shows the file name · encoding · line endings, and the code is coloured by kind: instructions, registers, numbers, comments. '
        + 'The `tutorial.s` open now is the tutorial\'s example, so it cannot be changed (read-only).',
    },
  },

  // ---- 2 assembling
  assemble: {
    title: { ko: 'Assemble: 코드를 기계어로', en: 'Assemble: code into machine code' },
    doing: { ko: [{ key: 'Ctrl+S' }, OR.ko, { click: 'Assemble' }] as Do, en: [{ key: 'Ctrl+S' }, OR.en, { click: 'Assemble' }] as Do },
    body: {
      ko: '어셈블은 쓴 코드를 기계어로 바꾸는 일입니다. 내 파일에서는 이 버튼이 Save & Assemble 이 되어 저장도 함께 합니다. '
        + '어셈블해 보세요. 끝나면 결과를 짚어 드립니다.',
      en: 'Assembling turns the code you wrote into machine code. For a file of your own this button is Save & Assemble, and it saves the file too. '
        + 'Assemble now. When it is done, we will point out the result.',
    },
    result: {
      title: { ko: '어셈블되었습니다', en: 'Assembled' },
      body: {
        ko: 'Editor 아래 Assemble 패널에 결과(Assembled), 만들어진 명령 수, 저장 여부, 어셈블한 때가 나옵니다. 예제는 저장하지 않습니다. '
          + '맨 아래 상태 표시줄은 지금 상태와 PC 를, 오른쪽 끝에는 지금 쓸 수 있는 키를 보여 줍니다.',
        en: 'The Assemble panel under the Editor shows the result (Assembled), how many instructions it made, whether the file was saved, and when. Examples are never saved. '
          + 'The status bar at the bottom shows the state and PC, and at its right end the keys you can use now.',
      },
    },
  },
  text: {
    title: { ko: 'Text 탭: 메모리에 올라간 명령', en: 'The Text tab: the instructions in memory' },
    // `kernel`: there are kernel instructions, folded away (MIPS).
    body: {
      ko: (kernel: boolean) => '어셈블된 명령이 한 줄에 하나씩 나옵니다. Address 는 명령이 놓인 주소, Encoding 은 32비트 기계어, Format 은 명령 형식, '
        + 'Instruction 은 기계어를 다시 읽은 명령이고, Line 과 Source 는 그 명령이 나온 소스 줄입니다.'
        + (kernel ? ' 맨 위 몇 줄은 `main` 을 부르는 시작 코드이고, 예외 처리기(커널)의 명령은 숨겨 두었다가 아래의 Show 를 누르면 보여 줍니다.' : ''),
      en: (kernel: boolean) => 'The assembled instructions, one to a row. Address is where the instruction is, Encoding its 32-bit machine code, Format its instruction format, '
        + 'Instruction the machine code read back as an instruction, and Line and Source the source line it came from.'
        + (kernel ? ' The first few rows are the start-up code that calls `main`; the exception handler\'s (kernel) instructions are hidden until you click Show below.' : ''),
    },
  },
  pseudo: {
    title: { ko: '소스 한 줄이 명령 두 개가 되었습니다', en: 'One source line became two instructions' },
    // `line`: the source line; `second`: the instruction that holds the lower bits; `upper`, `lower`: how many bits each holds.
    body: {
      ko: (line: string, second: string, upper: number, lower: number) => `\`${line}\` 한 줄이 \`lui\`(위 ${upper}비트) + \`${second}\`(아래 ${lower}비트) 두 명령이 되었습니다. `
        + '32비트 상수는 명령 하나에 다 들어가지 않아서 어셈블러가 나누었습니다. Text 의 두 줄 모두 소스의 한 줄에서 나왔습니다.',
      en: (line: string, second: string, upper: number, lower: number) => `The one line \`${line}\` became two instructions: \`lui\` (the upper ${upper} bits) + \`${second}\` (the lower ${lower} bits). `
        + 'A 32-bit constant does not fit in one instruction, so the assembler split it. Both rows in Text came from that one source line.',
    },
  },

  // ---- 3 one line forward, one back
  step: {
    title: { ko: 'Step: 한 줄 실행', en: 'Step: run one line' },
    doing: { ko: [{ key: 'F10' }, OR.ko, { click: 'Step' }] as Do, en: [{ key: 'F10' }, OR.en, { click: 'Step' }] as Do },
    result: {
      title: { ko: '한 줄을 실행했습니다', en: 'One line has run' },
      // `row`: the register's row as Registers labels it ("$t3", "x28 t3").
      body: {
        ko: (row: string, narrow: boolean) => (narrow ? `Registers 에서 \`${row}\` 줄이 노랗게 바뀌었습니다. Editor 탭의 PC 줄은 다음 줄로 내려가 있습니다.`
          : `PC 줄이 다음 줄로 내려갔고, Registers 에서 \`${row}\` 줄이 노랗게 바뀌었습니다.`),
        en: (row: string, narrow: boolean) => (narrow ? `In Registers, the \`${row}\` row has turned yellow. On the Editor tab, the PC line has moved down to the next line.`
          : `The PC line has moved down to the next line, and in Registers the \`${row}\` row has turned yellow.`),
      },
    },
  },
  changed: {
    title: { ko: '노란 줄: 방금 바뀐 레지스터', en: 'The yellow row: the register that just changed' },
  },
  stepback: {
    title: { ko: 'Step back: 한 줄 되돌리기', en: 'Step back: undo one line' },
    doing: { ko: [{ key: 'Shift+F10' }, OR.ko, { click: 'Step back' }] as Do, en: [{ key: 'Shift+F10' }, OR.en, { click: 'Step back' }] as Do },
    body: {
      ko: 'Step back 은 마지막으로 실행한 명령 하나를 되돌립니다. 방금 실행한 `add` 를 되돌려 보세요. 무엇이 돌아왔는지 짚어 드립니다.',
      en: 'Step back undoes the last instruction that ran. Undo the `add` that just ran, and we will point out what came back.',
    },
    result: {
      title: { ko: '한 줄을 되돌렸습니다', en: 'One line undone' },
      // `reg`: the register as the code names it ($t3, t3).
      body: {
        ko: (reg: string) => `\`${reg}\` 가 \`add\` 를 실행하기 전 값 0 으로 돌아갔고, PC 줄도 \`add\` 줄로 다시 올라갔습니다. `
          + '레지스터와 메모리를 최근 1000개 명령까지 되돌릴 수 있고, Run 으로 실행한 뒤에도 됩니다.',
        en: (reg: string) => `\`${reg}\` is back to 0, its value before \`add\`, and the PC line has gone back up to the \`add\` line. `
          + 'Registers and memory can go back up to the last 1000 instructions, after Run too.',
      },
    },
  },

  // ---- 4 Registers and the Inspector
  radix: {
    title: { ko: 'Hex · Dec · Bin: 한 값, 세 가지 표기', en: 'Hex · Dec · Bin: one value, three ways' },
    body: {
      ko: (reg: string) => `Hex 는 16진수, Dec 는 10진수, Bin 은 2진수입니다. 셋 모두 \`${reg}\` 의 같은 값 12 이고, 2진수는 네 자리씩 띄어 두었습니다. `
        + '패널 머리의 Hex · Dec · Bin 체크 상자로 열을 보이거나 감출 수 있습니다.',
      en: (reg: string) => `Hex is hexadecimal, Dec decimal and Bin binary. All three are the same value of \`${reg}\`, 12; the binary is spaced in groups of four. `
        + 'The Hex · Dec · Bin checkboxes in the panel\'s head show or hide the columns.',
    },
  },
  pin: {
    title: { ko: '별: 자주 볼 레지스터를 맨 위에', en: 'The star: a register you watch, at the top' },
    doing: { ko: (reg: string): Do => [{ click: `${reg} 줄의 ☆` }], en: (reg: string): Do => ['Click', { click: `☆ on the ${reg} row` }] },
    body: {
      ko: (reg: string) => `레지스터 줄 맨 왼쪽에 마우스를 올리면 별이 나타납니다. 표시한 \`${reg}\` 줄의 별을 눌러 보세요. 누르면 이 레지스터가 어디로 가는지 보여 드립니다.`,
      en: (reg: string) => `Point at the far left of a register's row and a star appears. Click the star on the marked \`${reg}\` row; then we will show you where the register went.`,
    },
    result: {
      title: { ko: 'Pinned 에 고정되었습니다', en: 'Pinned' },
      body: {
        ko: (reg: string) => `\`${reg}\` 가 목록 맨 위 Pinned 묶음에 들어갔습니다. 목록을 아래로 내려도 이 줄은 늘 보입니다. 별을 다시 누르면 풀립니다.`,
        en: (reg: string) => `\`${reg}\` is now in the Pinned group at the top of the list. However far down you scroll, this row stays in view. Click the star again to unpin it.`,
      },
    },
  },
  alias: {
    title: { ko: '별칭: 레지스터에 내 이름 붙이기', en: 'Aliases: your own name for a register' },
    doing: {
      ko: (alias: string): Do => [{ click: '이름 두 번 클릭' }, '→', `${alias} 입력`, '→', { key: 'Enter' }],
      en: (alias: string): Do => [{ click: 'Double-click the name' }, '→', `type ${alias}`, '→', { key: 'Enter' }],
    },
    body: {
      ko: (reg: string, alias: string) => `Pinned 묶음의 \`${reg}\` 이름을 두 번 누르거나 옆의 연필 칩을 누르세요. \`${alias}\` 처럼 이름을 쓰고 Enter 키를 누르면 됩니다. `
        + '건너뛰어도 괜찮은 단계입니다.',
      en: (reg: string, alias: string) => `Double-click the name \`${reg}\` in the Pinned group, or click the pencil chip beside it. Type a name such as \`${alias}\` and press Enter. `
        + 'You may skip this step.',
    },
    result: {
      title: { ko: '이름이 붙었습니다', en: 'Named' },
      body: {
        ko: (reg: string, alias: string) => `이제 \`${reg}\` 옆에 별칭 \`${alias}\` 도 함께 나옵니다. C 코드의 변수 이름을 붙여 두면 값이 무엇인지 알아보기 쉽습니다. 자리가 좁으면 줄여서 보이고, 마우스를 올리면 다 보입니다.`,
        en: (reg: string, alias: string) => `Now the alias \`${alias}\` appears beside \`${reg}\`. Named after a variable in your C code, a value is easy to tell. Where there is little room it is shortened; point at it to see all of it.`,
      },
    },
  },
  inspect: {
    title: { ko: 'Inspector: 명령 하나를 32비트로', en: 'Inspector: one instruction as 32 bits' },
    doing: { ko: [{ click: 'Text 의 add 줄' }, '클릭'] as Do, en: ['Click', { click: 'the add row in Text' }] as Do },
    body: {
      ko: 'Inspector 는 명령 하나를 32비트로 풀어 보여 줍니다. 보통은 다음에 실행할 명령(PC)을 따라가지만, Text 에서 줄을 누르면 그 명령에 머뭅니다. '
        + '앞에서 실행한 `add` 줄을 눌러 보세요.',
      en: 'The Inspector takes one instruction apart into its 32 bits. It follows the next instruction to run (PC), but clicking a row in Text keeps it on that instruction. '
        + 'Click the `add` row you ran earlier.',
    },
    result: {
      title: { ko: 'Inspector 가 이 명령에 머뭅니다', en: 'The Inspector stays on this instruction' },
      body: {
        ko: '맨 앞 배지는 명령 형식으로, R‑type 은 레지스터끼리 계산하는 형식입니다. 그 아래 32칸이 명령의 비트로, 칸 묶음마다 필드 이름과 그 뜻이 붙어 있습니다. 더 아래에는 이 명령이 하는 일이 나옵니다. '
          + '머리에 Pinned 가 붙었고, Follow PC 를 누르면 다시 PC 를 따라갑니다.',
        en: 'The badge in front is the instruction format; R‑type is the format for computing with registers. The 32 cells under it are the instruction\'s bits, '
          + 'each group with its field\'s name and what it means; further down, what the instruction does. The head says Pinned; Follow PC makes it follow PC again.',
      },
    },
  },
  bits: {
    title: { ko: '비트 칸 = Encoding 값', en: 'The bit cells = the Encoding value' },
    // `fields`: the fields' names, left to right ("opcode · rs · rt"); `word`: Text's Encoding of the instruction.
    body: {
      ko: (fields: string, word: string) => `${fields} 칸의 0과 1을 왼쪽부터 이어 붙이면 32비트 워드 하나입니다. 이것을 16진수로 쓴 것이 Text 의 Encoding 열 \`${word}\` 입니다. 같은 명령, 같은 값입니다.`,
      en: (fields: string, word: string) => `The 0s and 1s of the ${fields} cells, joined from the left, are one 32-bit word. Written in hexadecimal, it is \`${word}\` in Text's Encoding column. The same instruction, the same value.`,
    },
  },

  // ---- 5 memory
  data: {
    title: { ko: 'Data 탭: 메모리 보기', en: 'The Data tab: looking at memory' },
    doing: { ko: [{ click: 'Data' }, '탭 클릭'] as Do, en: ['Click the', { click: 'Data' }, 'tab'] as Do },
    body: {
      ko: 'Text 탭 옆의 Data 탭은 메모리에 든 값을 보여 줍니다. Data 탭을 눌러 보세요. 프로그램의 `.data` 부분이 어디에 놓였는지 짚어 드립니다.',
      en: 'The Data tab beside Text shows the values in memory. Click the Data tab, and we will point out where the program\'s `.data` part went.',
    },
    result: {
      title: { ko: '라벨: 주소에 붙인 이름', en: 'Labels: names for addresses' },
      body: {
        ko: '`.data` 부분에 적은 문자열과 워드가 메모리에 놓인 모습입니다. `msg` · `total` 같은 라벨은 주소에 붙인 이름이고, '
          + '+0 · +C 는 아랫줄 주소에서 몇 바이트 떨어졌는지를 뜻합니다. 오른쪽 ASCII 열은 같은 바이트를 글자로 보여 줍니다.',
        en: 'Here are the string and the word written in the `.data` part, as they sit in memory. Labels such as `msg` · `total` are names for addresses, '
          + 'and +0 · +C say how many bytes they are from the address of the row below. The ASCII column on the right shows the same bytes as characters.',
      },
    },
  },
  store: {
    title: { ko: 'sw: 메모리에 쓰기', en: 'sw: writing to memory' },
    result: {
      title: { ko: '메모리에 썼습니다', en: 'Written to memory' },
      body: {
        ko: (reg: string) => `\`sw\` 가 \`${reg}\` 의 값 12 를 \`total\` 자리에 썼습니다. 표시한 칸이 0 에서 0000000c(16진수 12)로 바뀌었습니다. `
          + '탭 머리의 Hex · Dec · Bin 을 고르면 메모리 값을 다른 진법으로 볼 수 있습니다.',
        en: (reg: string) => `\`sw\` wrote the value of \`${reg}\`, 12, to \`total\`: the marked cell went from 0 to 0000000c (12 in hexadecimal). `
          + 'Hex · Dec · Bin in the tab\'s head show memory in another radix.',
      },
    },
  },
  stack: {
    title: { ko: (sp: string) => `스택과 ${sp}`, en: (sp: string) => `The stack and ${sp}` },
  },

  // ---- 6 controlling a run
  breakpoint: {
    title: { ko: (line: number) => `브레이크포인트: ${line}행에서 멈추게`, en: (line: number) => `Breakpoint: stop at line ${line}` },
    doing: { ko: (line: number): Do => [{ click: `${line}행 왼쪽 칸` }, '클릭'], en: (line: number): Do => ['Click', { click: `left of line ${line}` }] },
    body: {
      ko: (line: number) => `${line}행의 맨 왼쪽, 줄 번호 왼쪽 칸을 눌러 빨간 점을 찍어 보세요. 실행하다가 이 줄 앞에서 멈추라는 표시이고, `
        + '같은 칸을 한 번 더 누르면 지워집니다.',
      en: (line: number) => `Click at the far left of line ${line}, left of its number, to put a red dot there. It tells a run to stop before this line; `
        + 'clicking the same place again removes it.',
    },
    result: {
      title: { ko: '빨간 점이 찍혔습니다', en: 'The red dot is set' },
      body: {
        ko: 'Text 에서도 이 줄의 명령 왼쪽에 같은 점이 보입니다. Text 에서 줄 맨 왼쪽 칸을 눌러도 점을 찍거나 지울 수 있습니다.',
        en: 'Text shows the same dot left of this line\'s instruction. Clicking at the far left of a row in Text sets or clears one too.',
      },
    },
  },
  run: {
    title: { ko: 'Run: 끝까지, 또는 빨간 점까지', en: 'Run: to the end, or to a red dot' },
    doing: { ko: [{ key: 'F5' }, OR.ko, { click: 'Run' }] as Do, en: [{ key: 'F5' }, OR.en, { click: 'Run' }] as Do },
    body: {
      ko: 'Run 은 한 줄씩이 아니라 프로그램을 쭉 실행합니다. 프로그램이 끝나거나 빨간 점을 만나면 멈춥니다. '
        + '실행해 보세요. 어디서 멈췄는지 알려 드립니다.',
      en: 'Run runs the program straight on, not one line at a time. It stops when the program ends or comes to a red dot. '
        + 'Run it, and we will tell you where it stopped.',
    },
    result: {
      title: { ko: (finished: boolean) => (finished ? '끝까지 실행되었습니다' : '빨간 점에서 멈췄습니다'),
        en: (finished: boolean) => (finished ? 'It ran to the end' : 'Stopped at the red dot') },
      body: {
        ko: (finished: boolean) => (finished ? '빨간 점이 없어서 프로그램이 끝까지 실행되었습니다.'
          : '빨간 점을 찍은 줄 앞에서 멈췄습니다. 이 줄은 아직 실행되지 않았습니다. 상태 표시줄에도 멈춘 이유와 PC 가 나옵니다.'),
        en: (finished: boolean) => (finished ? 'There was no red dot, so the program ran to the end.'
          : 'It stopped before the line with the red dot: that line has not run yet. The status bar also says why it stopped, and PC.'),
      },
    },
  },
  reset: {
    title: { ko: 'Reset: 처음으로', en: 'Reset: back to the start' },
    doing: { ko: [{ click: 'Reset' }, '클릭'] as Do, en: ['Click', { click: 'Reset' }] as Do },
    body: {
      ko: 'Reset 은 마지막으로 어셈블한 프로그램을 처음 상태로 되돌립니다. 코드를 고쳤더라도 다시 어셈블하지는 않습니다(어셈블은 Ctrl+S). '
        + '눌러 보세요. 무엇이 처음으로 돌아가는지 보여 드립니다.',
      en: 'Reset puts the last assembled program back as it was at the start. It does not assemble again, even if you changed the code (that is Ctrl+S). '
        + 'Click it, and we will show you what went back.',
    },
    result: {
      title: { ko: '처음으로 돌아왔습니다', en: 'Back at the start' },
      body: {
        ko: (reg: string) => `\`${reg}\` 가 다시 0 이 되었고, 상태 표시줄에는 준비 라고 나옵니다. F10 키나 F5 키로 처음부터 다시 실행할 수 있습니다. 찍어 둔 빨간 점은 그대로 남아 있습니다.`,
        en: (reg: string) => `\`${reg}\` is 0 again, and the status bar says Ready. F10 or F5 runs it again from the start. The red dot you placed is still there.`,
      },
    },
  },
  slow: {
    title: { ko: 'Run speed: 천천히 실행', en: 'Run speed: running slowly' },
    doing: { ko: [{ click: '1 line/s' }, '→', { key: 'F5' }, '→', { key: 'Esc' }] as Do, en: [{ click: '1 line/s' }, '→', { key: 'F5' }, '→', { key: 'Esc' }] as Do },
    body: {
      ko: 'Run speed 에서 1 line/s 를 고르고 실행하면 1초에 한 줄씩 실행되면서 PC 줄과 노란 줄이 옮겨 갑니다. '
        + '몇 줄 지켜본 뒤 Esc 키(또는 Stop 버튼)로 멈추세요. 빨간 점에 닿아도 멈춥니다. Instant 는 최고 속도입니다.',
      en: 'Choose 1 line/s under Run speed and run: one line runs every second, and the PC line and the yellow row move along. '
        + 'Watch a few lines, then stop it with Esc (or the Stop button); it also stops at the red dot. Instant is full speed.',
    },
  },

  // ---- 7 input, output and errors
  console: {
    title: {
      ko: (phase: number) => (phase === 0 ? 'Console: 출력과 입력' : 'Console 에 입력하기'),
      en: (phase: number) => (phase === 0 ? 'The Console: output and input' : 'Typing in the Console'),
    },
    doing: {
      ko: (phase: number): Do => (phase === 0 ? [{ key: 'F5' }, OR.ko, { click: 'Run' }] : ['30 입력', '→', { key: 'Enter' }]),
      en: (phase: number): Do => (phase === 0 ? [{ key: 'F5' }, OR.en, { click: 'Run' }] : ['Type 30', '→', { key: 'Enter' }]),
    },
    // `says`: what prints and reads in the ISA (mips.console, riscv.console).
    body: {
      ko: (phase: number, says: string) => (phase === 0
        ? `${says} 실행해 보세요. 프로그램이 Console 에 \`number?\` 를 출력하고, 수를 입력받을 때까지 기다립니다.`
        : 'Console 의 Input 칸에 수를 쓰고 Enter 키를 누르세요. 30 이면 12 + 30 을 계산해 42 를 출력하고 프로그램이 끝납니다.'),
      en: (phase: number, says: string) => (phase === 0
        ? `${says} Run it: the program prints \`number?\` in the Console and waits for you to type a number.`
        : 'Type a number in the Console\'s Input box and press Enter. With 30, the program works out 12 + 30, prints 42 and ends.'),
    },
    result: {
      title: { ko: '출력과 입력은 Console 에', en: 'Output and input are in the Console' },
      body: {
        ko: '프로그램이 출력한 글과 입력한 수가 Console 에 남았고, 상태 표시줄은 프로그램이 끝났다고 알려 줍니다. '
          + '머리의 Collapse 를 누르면 Console 을 접을 수 있고, 프로그램이 출력하거나 입력을 기다리면 다시 열립니다.',
        en: 'What the program printed and the number you typed are in the Console, and the status bar says the program has ended. '
          + 'Collapse in its head folds the Console away; it opens again when the program prints or waits for input.',
      },
    },
  },
  undo: {
    title: { ko: 'Step back 이 되돌리지 않는 것', en: 'What Step back does not undo' },
    doing: { ko: [{ key: 'Shift+F10' }, '세 번'] as Do, en: [{ key: 'Shift+F10' }, 'three times'] as Do },
    // `exit`: the line that loads the code for the end; `call`: the instruction that calls (syscall, ecall).
    body: {
      ko: (exit: string, call: string) => `프로그램이 끝난 뒤에도 Step back 으로 되돌아갈 수 있습니다. Shift+F10 키를 세 번 눌러 `
        + `프로그램의 끝, \`${exit}\`, 42 를 출력한 \`${call}\` 까지 되돌려 보세요.`,
      en: (exit: string, call: string) => `Step back works even after the program has ended. Press Shift+F10 three times to undo `
        + `the end of the program, \`${exit}\`, and the \`${call}\` that printed 42.`,
    },
    result: {
      title: { ko: '출력과 입력은 그대로 남습니다', en: 'Output and input stay' },
      body: {
        ko: '레지스터와 메모리는 42 를 출력하기 전으로 돌아갔지만 Console 의 42 는 그대로입니다. '
          + '이미 출력한 글과 이미 읽은 입력은 되돌리지 않고, 상태 표시줄도 그렇게 알려 줍니다.',
        en: 'Registers and memory are back to before 42 was printed, but 42 is still in the Console. '
          + 'Output already printed and input already read are not undone, and the status bar says so.',
      },
    },
  },
  error: {
    title: { ko: (phase: number) => (phase === 0 ? '오류가 나면' : 'Assemble 패널의 오류 목록'),
      en: (phase: number) => (phase === 0 ? 'When there is an error' : 'The list of errors in the Assemble panel') },
    doing: {
      ko: (phase: number, line: string): Do => (phase === 0 ? [{ key: 'Ctrl+S' }, OR.ko, { click: 'Assemble' }] : [{ click: `${line}행으로 이동 →` }]),
      en: (phase: number, line: string): Do => (phase === 0 ? [{ key: 'Ctrl+S' }, OR.en, { click: 'Assemble' }] : [{ click: `Go to line ${line} →` }]),
    },
    body: {
      ko: (phase: number, line: string) => (phase === 0
        ? '이번에는 일부러 한 줄을 틀리게 쓴 예제를 열었습니다. 어셈블해 보세요. 오류가 어디에 어떻게 나오는지 이어서 보여 드립니다.'
        : '오류 수, 틀린 줄과 그 내용, 고치는 요령이 고른 언어로 나옵니다. 모르는 명령은 어셈블러에 넘기기 전에 미리 찾아 모두 알려 줍니다. '
          + `아래의 ${line}행으로 이동 버튼을 누르면 Editor 의 그 줄로 가고, 튜토리얼도 다음으로 넘어갑니다.`),
      en: (phase: number, line: string) => (phase === 0
        ? 'This time an example with one line written wrong on purpose is open. Assemble it, and we will show you where the error shows up and how.'
        : 'It gives the number of errors, the wrong line and what is wrong, and how to fix it, in the language you chose. Unknown instructions are found before the assembler is asked, all of them at once. '
          + `The Go to line ${line} button below takes you to that line in the Editor, and the tutorial goes on.`),
    },
  },
  fix: {
    title: { ko: '여기가 고칠 줄입니다', en: 'This is the line to fix' },
    body: {
      ko: (line: string) => `Editor 의 ${line}행으로 왔습니다. 커서가 이 줄에 있고, 틀린 줄은 붉게 표시됩니다. `
        + 'Assemble 패널의 설명대로 고친 뒤 Ctrl+S 키를 누르면 다시 어셈블합니다. 이 예제는 읽기 전용이라 여기서는 고치지 않습니다.',
      en: (line: string) => `This is line ${line} in the Editor. The cursor is on it, and the wrong line is marked in red. `
        + 'Fix it as the Assemble panel says, then press Ctrl+S to assemble again. This example is read-only, so here it stays as it is.',
    },
  },

  // ---- 8 writing your own
  tools: {
    title: { ko: '툴바 오른쪽의 아이콘', en: 'The icons on the right of the toolbar' },
    body: {
      ko: '왼쪽부터 Tutorial(?)은 이 튜토리얼을 다시 열고, New file 은 빈 파일을, Open file 은 저장해 둔 파일을 엽니다(Ctrl+O). '
        + 'Export executable image 는 마지막으로 어셈블한 프로그램을 메모리에 놓인 그대로 .asx 파일로 저장합니다. 톱니바퀴는 Settings 입니다.',
      en: 'From the left: Tutorial (?) opens this tutorial again, New file starts an empty file, and Open file opens one you saved (Ctrl+O). '
        + 'Export executable image saves the last assembled program as it sits in memory, as an .asx file. The gear is Settings.',
    },
  },
  editing: {
    title: { ko: '내 파일에서 코드 쓰기', en: 'Writing code in a file of your own' },
    body: {
      ko: 'Tab 키는 네 칸 들여 쓰고(Shift+Tab 은 내어 쓰기), Enter 키는 윗줄의 들여쓰기를 이어 갑니다. Ctrl+/ 키는 선택한 줄을 주석으로 바꾸거나 되돌립니다. '
        + '저장하지 않은 고친 내용이 있으면 파일 이름 뒤에 점이 붙고, Save & Assemble(Ctrl+S)이 저장과 어셈블을 한 번에 합니다.',
      en: 'Tab indents by four spaces (Shift+Tab outdents), and Enter keeps the indentation of the line above. Ctrl+/ turns the selected lines into comments, or back. '
        + 'A dot after the file name means changes not saved yet; Save & Assemble (Ctrl+S) saves and assembles in one go.',
    },
  },
  settings: {
    title: { ko: 'Settings: 글자 크기, 진법, 언어', en: 'Settings: font size, radix, language' },
    // `advanced`: the dialog has Advanced (MIPS).
    body: {
      ko: (advanced: boolean) => '글자 크기(Ctrl + · Ctrl − · Ctrl 0 키로도), Data 탭의 진법, 언어를 바꿉니다. '
        + (advanced ? 'Advanced 에는 SPIM 의 기계 옵션, 프로그램 인자, 예외 처리기가 있습니다. ' : '')
        + 'About · Licenses 에서는 버전과 라이선스를 봅니다. 설정은 이번 실행에만 적용됩니다.',
      en: (advanced: boolean) => 'Change the font size (Ctrl + · Ctrl − · Ctrl 0 too), the Data tab\'s radix and the language. '
        + (advanced ? 'Advanced has SPIM\'s machine options, the program\'s arguments and the exception handler. ' : '')
        + 'About · Licenses shows the version and the licenses. Settings last for this run only.',
    },
  },
  separators: {
    title: { ko: '패널 크기 바꾸기', en: 'Resizing the panels' },
    body: {
      ko: (narrow: boolean) => `패널 사이의 표시한 띠를 끌면 크기가 바뀝니다. ${narrow ? 'Registers 와 Text, Registers 와 Console, Text 와 Inspector 사이' : 'Editor 와 Run 쪽, Editor 와 Assemble 패널, Registers 와 Text, Registers 와 Console, Text 와 Inspector 사이'}에 있습니다. `
        + (narrow ? '' : 'Editor 와 Run 쪽 사이 띠의 ‹ 와 › 버튼은 한쪽을 접습니다. ')
        + '띠를 두 번 누르면 처음 크기로 돌아갑니다. 지금 끌어 봐도 됩니다.',
      en: (narrow: boolean) => `Drag the marked strips between the panels to resize them. They are between ${narrow ? 'Registers and Text, Registers and the Console, and Text and the Inspector' : 'the Editor and the Run side, the Editor and the Assemble panel, Registers and Text, Registers and the Console, and Text and the Inspector'}. `
        + (narrow ? '' : 'On the strip between the Editor and the Run side, the ‹ and › buttons fold one side away. ')
        + 'Double-click a strip to put it back. Go ahead and drag one now.',
    },
  },
  switches: {
    title: { ko: '언어, 밝은 화면과 어두운 화면', en: 'Language, light and dark' },
    body: {
      ko: '상태 표시줄 오른쪽 끝의 KO · EN 은 튜토리얼, 명령 설명, 메시지, 대화상자의 언어를 바꿉니다(버튼과 패널 이름은 영어 그대로). '
        + '해와 달 스위치는 밝은 화면과 어두운 화면을 바꿉니다. 지금 눌러 봐도 됩니다.',
      en: 'KO · EN at the right end of the status bar switches the language of the tutorial, the instruction explanations, the messages and the dialogs (buttons and panel names stay in English). '
        + 'The sun and moon switch turns the screen light or dark. Try them now.',
    },
  },
  end: {
    title: { ko: '튜토리얼을 마쳤습니다', en: 'You have finished the tutorial' },
    body: {
      ko: '이제 New file 아이콘으로 새 파일을 열어 직접 써 보세요. 끝내기를 누르면 예제는 내려가고 튜토리얼 전의 화면으로 돌아갑니다. '
        + '튜토리얼은 툴바의 Tutorial(?) 아이콘으로 언제든 다시 볼 수 있습니다.',
      en: 'Now start a new file with the New file icon and write your own. Finish closes the example and brings back the screen from before the tutorial. '
        + 'The Tutorial (?) icon in the toolbar shows the tutorial again any time.',
    },
  },
};

// ---- MIPS's own (tutorial/steps.ts) -------------------------------------------------------

export const MIPS = {
  registers: {
    title: { ko: 'Registers 패널', en: 'The Registers panel' },
    body: {
      ko: 'MIPS 레지스터 32개가 쓰임새대로 묶여 있습니다. 표시한 Temporaries 묶음은 계산하는 동안 값을 잠시 두는 레지스터들입니다. '
        + '목록 맨 위의 PC 는 다음에 실행할 명령의 주소입니다. 예외 정보를 담는 CP0 레지스터는 숨겨 두었고, 맨 아래 Show 를 누르면 보입니다.',
      en: 'The 32 MIPS registers, grouped by what they are for. The marked Temporaries group holds values for a while during a calculation. '
        + 'PC, at the top of the list, is the address of the next instruction to run. The CP0 registers, which hold exception information, are hidden until you click Show at the bottom.',
    },
  },
  step: {
    body: {
      ko: '왼쪽에 막대가 있는 줄이 PC 줄, 곧 다음에 실행할 줄입니다. 시작 코드와 앞의 `li` 두 줄은 미리 실행해 두었습니다. '
        + '이 줄을 실행해 보세요. 무엇이 바뀌었는지 짚어 드립니다.',
      en: 'The line with a bar on its left is the PC line: the next line to run. The start-up code and the two `li` lines before it have already run. '
        + 'Run this line, and we will point out what changed.',
    },
  },
  changed: {
    body: {
      ko: '노란 줄은 방금 실행한 명령이 바꾼 레지스터입니다. `add $t3, $t1, $t2` 가 5 + 7 = 12 를 `$t3` 에 넣었습니다. '
        + '아래 상태 표시줄의 Changed: 칸에도 나옵니다. 다음 줄을 실행하면 노란 표시는 그 줄이 바꾼 레지스터로 옮겨 갑니다.',
      en: 'The yellow row is the register the instruction that just ran changed: `add $t3, $t1, $t2` put 5 + 7 = 12 in `$t3`. '
        + 'The status bar below says Changed: `$t3` too. Run the next line and the yellow moves to the register that line changes.',
    },
  },
  store: {
    doing: { ko: [{ key: 'F10' }, '두 번'] as Do, en: [{ key: 'F10' }, 'twice'] as Do },
    body: {
      ko: (narrow: boolean) => `${narrow ? '' : '왼쪽에 표시한 '}\`sw $t3, total\` 줄은 \`$t3\` 의 값을 메모리의 \`total\` 자리에 씁니다. `
        + '이 줄은 명령 두 개가 되었으니 F10 키를 두 번 눌러 보세요. 실행하고 나면 `total` 자리가 어떻게 바뀌었는지 보여 드립니다.',
      en: (narrow: boolean) => `The ${narrow ? '' : 'marked '}line \`sw $t3, total\` writes the value of \`$t3\` to \`total\` in memory. `
        + 'This line became two instructions, so press F10 twice. Then we will show you how `total` changed.',
    },
  },
  stack: {
    body: {
      ko: '`$sp` 는 스택의 맨 위(가장 낮은 주소)를 가리킵니다. `addi $sp, $sp, -4` 가 한 칸(4바이트)을 만들어 `$sp` 가 4 줄었고, '
        + '`sw $s0, 0($sp)` 가 그 칸에 12 를 넣었습니다. Data 탭은 그 칸 위에 `$sp` 표시를 붙이고, 메모리를 User data · Stack · Kernel data 로 나누어 보여 줍니다. '
        + '접힌 Kernel data 는 머리를 누르면 펼쳐집니다.',
      en: '`$sp` points to the top of the stack (its lowest address). `addi $sp, $sp, -4` made room for one word (4 bytes), so `$sp` went down by 4, '
        + 'and `sw $s0, 0($sp)` put 12 there. The Data tab marks that word with `$sp`, and splits memory into User data · Stack · Kernel data. '
        + 'Click the folded Kernel data\'s head to open it.',
    },
  },
  console: {
    says: {
      ko: '`syscall` 은 `$v0` 의 번호에 따라 출력하거나 입력받습니다(4 는 문자열 출력, 5 는 정수 입력).',
      en: '`syscall` prints or reads by the number in `$v0` (4 prints a string, 5 reads an integer).',
    },
  },
};

// ---- RISC-V's own (isa/riscv/renderer/tutorial-steps.ts) ------------------------------------

export const RISCV = {
  registers: {
    title: { ko: 'Registers 패널: 이름이 둘씩', en: 'The Registers panel: two names each' },
    body: {
      ko: '레지스터 32개가 쓰임새대로 묶여 있고, 하나에 이름이 둘입니다. 표시한 `x5 t0` 줄처럼 번호 이름(`x5`)과 쓰임새 이름(`t0`)은 같은 레지스터이고, '
        + '코드에는 어느 쪽을 써도 됩니다. 목록 맨 위의 `pc` 는 다음에 실행할 명령의 주소입니다. 부동소수점 레지스터는 숨겨 두었고, 맨 아래 Show 를 누르면 보입니다.',
      en: 'The 32 registers are grouped by what they are for, and each has two names. As on the marked `x5 t0` row, the number name (`x5`) and the ABI name (`t0`) are the same register, '
        + 'and code may use either. `pc`, at the top of the list, is the address of the next instruction to run. The floating-point registers are hidden until you click Show at the bottom.',
    },
  },
  step: {
    body: {
      ko: '왼쪽에 막대가 있는 줄이 PC 줄, 곧 다음에 실행할 줄입니다. 프로그램은 `main` 첫 줄에서 시작하고, 앞의 `li` 두 줄은 미리 실행해 두었습니다. '
        + '이 줄을 실행해 보세요. 무엇이 바뀌었는지 짚어 드립니다.',
      en: 'The line with a bar on its left is the PC line: the next line to run. The program starts at the first line of `main`, and the two `li` lines before this one have already run. '
        + 'Run this line, and we will point out what changed.',
    },
  },
  changed: {
    body: {
      ko: '노란 줄은 방금 실행한 명령이 바꾼 레지스터입니다. `add t3, t1, t2` 가 5 + 7 = 12 를 `t3`(번호로는 `x28`)에 넣었습니다. '
        + '아래 상태 표시줄의 Changed: 칸에도 나옵니다. 다음 줄을 실행하면 노란 표시는 그 줄이 바꾼 레지스터로 옮겨 갑니다.',
      en: 'The yellow row is the register the instruction that just ran changed: `add t3, t1, t2` put 5 + 7 = 12 in `t3` (by number, `x28`). '
        + 'The status bar below shows it under Changed: too. Run the next line and the yellow moves to the register that line changes.',
    },
  },
  store: {
    doing: { ko: [{ key: 'F10' }] as Do, en: [{ key: 'F10' }] as Do },
    body: {
      ko: (narrow: boolean) => `${narrow ? '' : '왼쪽에 표시한 '}\`sw t3, 0(a1)\` 줄은 \`t3\` 의 값을 \`a1\` 이 가리키는 곳, 곧 메모리의 \`total\` 자리에 씁니다. `
        + 'F10 키를 눌러 이 줄을 실행해 보세요. 실행하고 나면 `total` 자리가 어떻게 바뀌었는지 보여 드립니다.',
      en: (narrow: boolean) => `The ${narrow ? '' : 'marked '}line \`sw t3, 0(a1)\` writes the value of \`t3\` to where \`a1\` points: \`total\` in memory. `
        + 'Press F10 to run this line. Then we will show you how `total` changed.',
    },
  },
  stack: {
    body: {
      ko: '`sp`(번호로는 `x2`)는 스택의 맨 위(가장 낮은 주소)를 가리킵니다. `addi sp, sp, -4` 가 한 칸(4바이트)을 만들어 `sp` 가 4 줄었고, '
        + '`sw s0, 0(sp)` 가 그 칸에 12 를 넣었습니다. Data 탭은 그 칸 위에 `sp` 표시를 붙이고, 메모리를 User data 와 Stack 으로 나누어 보여 줍니다.',
      en: '`sp` (by number, `x2`) points to the top of the stack (its lowest address). `addi sp, sp, -4` made room for one word (4 bytes), so `sp` went down by 4, '
        + 'and `sw s0, 0(sp)` put 12 there. The Data tab marks that word with `sp`, and splits memory into User data and Stack.',
    },
  },
  console: {
    says: {
      ko: '`ecall` 은 `a7` 의 번호에 따라 출력하거나 입력받습니다(4 는 문자열 출력, 5 는 정수 입력).',
      en: '`ecall` prints or reads by the number in `a7` (4 prints a string, 5 reads an integer).',
    },
  },
};
