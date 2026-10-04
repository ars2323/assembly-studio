import type { EditorState, TransactionSpec } from '@codemirror/state';
import { EditorSelection } from '@codemirror/state';

/* Enter: the new line starts with the indentation of the line it was
   pressed on (the spaces and tabs it starts with, up to the cursor), so an
   indented block goes on indented.  A line that is nothing but that
   indentation, with the cursor at its end, keeps none of it: the blank line
   left behind has no trailing spaces, and the indentation moves down with
   the cursor.  Pure, with no view, so tests/renderer/newline.test.ts checks
   it; editor.ts dispatches it. */

/** The indentation a line starts with, cut at COLUMN. */
export function leading(text: string, column: number): string {
  return (/^[ \t]*/.exec(text)?.[0] ?? '').slice(0, column);
}

export function newlineChanges(state: EditorState): TransactionSpec {
  return {
    ...state.changeByRange((r) => {
      const line = state.doc.lineAt(r.from);
      const indent = leading(line.text, r.from - line.from);
      // Nothing but indentation, cursor at its end: the line is left empty.
      const from = line.text.trim() === '' && r.to === line.to ? line.from : r.from;
      const insert = state.lineBreak + indent;
      return { changes: { from, to: r.to, insert }, range: EditorSelection.cursor(from + insert.length) };
    }),
    scrollIntoView: true,
    userEvent: 'input',
  };
}
