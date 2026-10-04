/* Step back, as both windows (MIPS and RISC-V) say it: the key, and the
   status bar's words after a step back.  The status bar is English
   (cells.ts); the tooltip, which explains, is in messages/stepback.ts.
   Pure. */

export const STEP_BACK_KEY = 'Shift+F10';

// Shift+F10, and no other modifier.
export const isStepBackKey = (e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean =>
  e.key === 'F10' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;

// The status bar's first cell after a step back (`code` in backticks).
export const backMessage = (pc: string): string => `Stepped back · PC \`${pc}\``;

// After undoing a syscall that printed or read: the Console keeps it.
export const BACK_IO_NOTE = 'Console output and input already read stay';

// The keys that go on from there.
export const backKeys = (more: boolean): [string, string][] =>
  more ? [[STEP_BACK_KEY, 'Step back'], ['F10', 'Step'], ['F5', 'Run']] : [['F10', 'Step'], ['F5', 'Run']];
