/* src/renderer/app/logic/newline.ts: Enter keeps the indentation of the
   line it was pressed on. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EditorSelection, EditorState } from '@codemirror/state';

import { leading, newlineChanges } from '../../src/renderer/app/logic/newline.ts';

const enter = (doc: string, at: number) => {
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(at) });
  const next = state.update(newlineChanges(state)).state;
  return { doc: next.doc.toString(), at: next.selection.main.head };
};

test('the new line starts where the line above starts', () => {
  assert.deepEqual(enter('    li $t0, 1', 13), { doc: '    li $t0, 1\n    ', at: 18 });
  assert.deepEqual(enter('\tli $t0, 1', 10), { doc: '\tli $t0, 1\n\t', at: 12 });
  assert.deepEqual(enter('main:', 5), { doc: 'main:\n', at: 6 }, 'no indentation, none added');
});

test('Enter in the middle of a line carries the rest down, indented', () => {
  assert.deepEqual(enter('    li $t0, 1 # one', 13), { doc: '    li $t0, 1\n     # one', at: 18 });
});

test('Enter inside the indentation keeps only what is before the cursor', () => {
  assert.equal(leading('        x', 4), '    ');
  assert.deepEqual(enter('        x', 4), { doc: '    \n        x', at: 9 });
});

test('a line of nothing but indentation is left empty, and the indentation goes on', () => {
  assert.deepEqual(enter('    li $t0, 1\n    ', 18), { doc: '    li $t0, 1\n\n    ', at: 19 });
});
