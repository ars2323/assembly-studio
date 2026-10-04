import type { EditorState, TransactionSpec } from '@codemirror/state';

/* Which way Ctrl+/ goes, and where the mark sits.

   The arithmetic of the toggle, with no editor in it, so it can be checked
   without a window (tests/renderer/comment.test.ts).  commentChanges() turns
   it into one set of changes for an editor state, which editor.ts dispatches
   at once -- what makes the whole toggle one step of the undo history.

   Two decisions worth stating.  The mark goes at the *shallowest* indent of
   the lines being toggled, not at each line's own, so a block of mixed
   indentation comes back with its marks in one column -- which is how a
   commented-out block reads as a block.  And a blank line inside a selection
   is left alone: a line with nothing on it has nothing to comment, and
   marking it would leave a column of lone marks behind when the block is
   uncommented. */

/** What a comment starts with, in MIPS and RISC-V assembly alike. */
export const MARK = '#';

/** Whether a line is already commented: the mark is the first thing on it. */
export const isCommented = (line: string): boolean => line.trimStart().startsWith(MARK);

/** Whether a line has anything on it at all. */
export const isBlank = (line: string): boolean => line.trim() === '';

export interface Plan {
  /** true to put the mark on, false to take it off. */
  comment: boolean;
  /** The column the mark goes in, for every line being commented. */
  column: number;
  /** Nothing to do: every line is blank. */
  nothing: boolean;
}

/** How to toggle these lines, taken together: off only if every line that
    has anything on it already carries the mark. */
export function plan(lines: string[]): Plan {
  const live = lines.filter((l) => !isBlank(l));
  if (live.length === 0) return { comment: false, column: 0, nothing: true };
  const column = Math.min(...live.map((l) => l.length - l.trimStart().length));
  return { comment: !live.every(isCommented), column, nothing: false };
}

/** Where the mark is on a commented line, and how much to take off with it:
    the space after it as well, when the mark put it there. */
export function take(line: string): { at: number; length: number } | null {
  const at = line.indexOf(MARK);
  if (at < 0 || line.slice(0, at).trim() !== '') return null;
  return { at, length: line.startsWith(`${MARK} `, at) ? MARK.length + 1 : MARK.length };
}

/* Ctrl+/ on an editor state: the one transaction that toggles the mark over
   the line the cursor is on, or every line a selection touches -- or null,
   for nothing to do.  A read-only document gets null: the tutorial opens its
   example read-only and that file must not be written to (CodeMirror's
   readOnly is advisory -- dispatch would not refuse the change -- so this is
   the guard, and tests/renderer/comment.test.ts holds it). */
export function commentChanges(state: EditorState): TransactionSpec | null {
  if (state.readOnly) return null;
  const doc = state.doc;
  const numbers = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) numbers.add(n);
  }
  const lines = [...numbers].sort((a, b) => a - b).map((n) => doc.line(n));
  const { comment, column, nothing } = plan(lines.map((l) => l.text));
  if (nothing) return null;
  const changes: { from: number; to?: number; insert?: string }[] = [];
  for (const line of lines) {
    if (isBlank(line.text)) continue;              // nothing on it to mark
    if (comment) {
      changes.push({ from: line.from + column, insert: `${MARK} ` });
    } else {
      const off = take(line.text);
      if (off) changes.push({ from: line.from + off.at, to: line.from + off.at + off.length });
    }
  }
  if (changes.length === 0) return null;
  return { changes, scrollIntoView: true, userEvent: 'input.toggleComment' };
}
