/* Step back, as both windows (MIPS and RISC-V) say it: the key, and the
   keys the status bar offers after a step back (the buttons' names).  Its
   sentences are in messages/assemble.ts (STATUS.stepBack, STATUS.backIo);
   the tooltip, which explains, is in messages/stepback.ts.  Pure. */

export const STEP_BACK_KEY = 'Shift+F10';

// Shift+F10, and no other modifier.
export const isStepBackKey = (e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean =>
  e.key === 'F10' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;

// The keys that go on from there.
export const backKeys = (more: boolean): [string, string][] =>
  more ? [[STEP_BACK_KEY, 'Step back'], ['F10', 'Step'], ['F5', 'Run']] : [['F10', 'Step'], ['F5', 'Run']];
