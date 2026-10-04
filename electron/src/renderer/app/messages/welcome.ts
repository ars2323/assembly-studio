/* The first screen's words (panels/welcome.ts).  The ISA step's buttons are
   the ISAs' names, the same in both languages. */

export const WELCOME = {
  back: { ko: '뒤로', en: 'Back' },
  // Step 1: straight to work, or the tutorial.
  start: { ko: '바로 시작', en: 'Start now' },
  tutorial: { ko: '튜토리얼 보기', en: 'Take the tutorial' },
  // Step 2: a new file, or one from disk.
  newFile: { ko: '새 파일', en: 'New file' },
  openFile: { ko: '파일 열기', en: 'Open file' },
  // An update found at launch (src/main/updater.ts): the card shows it instead of the ISA step.
  update: {
    downloading: { ko: (v: string) => `v${v} 업데이트 중`, en: (v: string) => `Updating to v${v}` },
    installing: { ko: '업데이트를 설치하는 중…', en: 'Installing update…' },
    failed: { ko: '업데이트를 받지 못했습니다', en: 'Could not download the update' },
  },
};
