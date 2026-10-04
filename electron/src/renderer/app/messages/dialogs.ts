/* The questions (panels/ask.ts) the window asks, both ISAs: unsaved changes,
   a new file, the tutorial's own two; and About's words. */

export const DIALOGS = {
  cancel: { ko: '취소', en: 'Cancel' },

  // Unsaved changes, before something else takes the Editor's place.
  unsaved: {
    title: { ko: '저장하지 않은 변경이 있습니다', en: 'You have unsaved changes' },
    home: { ko: '처음 화면으로 가면 저장하지 않은 내용은 사라집니다.', en: 'Going back to the start screen discards them.' },
    newFile: { ko: '새 파일을 열면 저장하지 않은 내용은 사라집니다.', en: 'Starting a new file discards them.' },
    openFile: { ko: '다른 파일을 열면 저장하지 않은 내용은 사라집니다.', en: 'Opening another file discards them.' },
    tutorial: {
      ko: '튜토리얼을 하는 동안 이 파일은 잠시 내려갑니다. 끝나면 바뀐 내용 그대로 돌아옵니다. 먼저 저장하려면 돌아가서 Ctrl+S 키를 누르세요.',
      en: 'The file is put aside during the tutorial and comes back, changes and all, when it ends. To save it first, go back and press Ctrl+S.',
    },
    discard: { ko: '버리고 계속', en: 'Discard and continue' },
    startTutorial: { ko: '튜토리얼 시작', en: 'Start the tutorial' },
    back: { ko: '돌아가기', en: 'Go back' },
  },

  // A new file over a saved one: it empties the Editor.
  newFile: {
    title: { ko: '새 파일을 열까요?', en: 'Start a new file?' },
    body: { ko: '이 파일은 저장되어 있습니다. 편집기를 비우고 새 파일을 시작합니다.', en: 'This file is saved. The Editor is cleared for a new file.' },
    ok: { ko: '새 파일', en: 'New file' },
  },

  // The tutorial (tutorial/engine.ts): going on where it stopped; quitting.
  resume: {
    title: { ko: '이어서 할까요?', en: 'Pick up where you left off?' },
    body: {
      ko: (step: number) => `지난번에 ${step}단계에서 그만두었습니다. 프로그램을 끄면 이 기록은 없어지고 다시 1단계부터입니다.`,
      en: (step: number) => `Last time you stopped at step ${step}. This is forgotten when the program closes, and the tutorial starts again from step 1.`,
    },
    ok: { ko: (step: number) => `이어서 (${step}단계부터)`, en: (step: number) => `Continue (from step ${step})` },
    over: { ko: '처음부터', en: 'Start over' },
  },
  quit: {
    title: { ko: '튜토리얼을 그만둘까요?', en: 'Quit the tutorial?' },
    body: { ko: '예제는 내려가고 튜토리얼을 시작하기 전의 화면으로 돌아갑니다.', en: 'The example closes and the screen goes back to how it was before the tutorial.' },
    ok: { ko: '그만두기', en: 'Quit' },
    cancel: { ko: '계속하기', en: 'Keep going' },
  },

  // About (panels/about.ts): where the Chromium and Node.js notices are.
  about: {
    credits: {
      ko: 'Chromium · Node.js 고지(그 안의 라이브러리 포함)는 설치 폴더에 있습니다: `LICENSES.chromium.html` (약 20 MB)',
      en: 'The Chromium · Node.js notices (with the libraries they include) are in the install folder: `LICENSES.chromium.html` (about 20 MB)',
    },
  },
};
