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
    // Under the bar: the program closes to install, then starts again by itself.
    willRestart: {
      ko: '다 받으면 설치한 뒤 자동으로 다시 실행됩니다',
      en: 'When it is done, it installs and restarts by itself',
    },
    restarting: {
      ko: '잠시 창이 닫혔다가 새 버전이 저절로 다시 열립니다',
      en: 'Closes for a moment, then reopens by itself',
    },
    failed: { ko: '업데이트를 받지 못했습니다', en: 'Could not download the update' },
  },
};
