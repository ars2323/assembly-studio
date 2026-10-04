/* Which way Ctrl+/ goes and where it puts the mark
   (src/renderer/app/logic/comment.ts).

   The arithmetic, and commentChanges() on an editor state: what it changes,
   and that a read-only document gets nothing. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EditorSelection, EditorState } from '@codemirror/state';

import { commentChanges, isBlank, isCommented, MARK, plan, take } from '../../src/renderer/app/logic/comment.ts';

test('one line: on, then off again', () => {
  const on = plan(['    li $t0, 5']);
  assert.deepEqual(on, { comment: true, column: 4, nothing: false });
  const off = plan(['    # li $t0, 5']);
  assert.equal(off.comment, false);
});

test('some of them commented: all of them get the mark', () => {
  const some = plan(['  li $t0, 5', '  # li $t1, 6', '  li $t2, 7']);
  assert.equal(some.comment, true, 'a block that is only part commented should be commented');
});

test('all of them commented: all of them lose it', () => {
  const all = plan(['  # li $t0, 5', '  # li $t1, 6']);
  assert.equal(all.comment, false);
});

test('the mark goes in one column, the shallowest of them', () => {
  // Four, eight and two spaces: the marks line up at two, not each at its own.
  const p = plan(['    li $t0, 5', '        add $t1, $t0, $t0', '  sw $t1, x']);
  assert.equal(p.column, 2);
  assert.equal(p.comment, true);
  // A line with no indent at all puts them all at the margin.
  assert.equal(plan(['main:', '    li $t0, 5']).column, 0);
});

test('a blank line in the middle counts for nothing', () => {
  // Neither for which way the toggle goes...
  assert.equal(plan(['  # a', '', '  # b']).comment, false, 'the blank line made it comment again');
  // ...nor for where the mark sits: "" has no indent, and would drag it to 0.
  assert.equal(plan(['    # a', '', '    # b']).column, 4);
  assert.equal(plan(['  li $t0, 5', '   ', '  li $t1, 6']).column, 2);
});

test('nothing but blank lines: every one is blank', () => {
  assert.equal(plan(['', '   ', '\t']).nothing, true);
  assert.equal(plan([]).nothing, true);
  assert.equal(plan(['x']).nothing, false);
});

test('taking the mark off takes the space it put there, and only then', () => {
  assert.deepEqual(take('# li $t0, 5'), { at: 0, length: 2 });
  assert.deepEqual(take('    # li $t0, 5'), { at: 4, length: 2 });
  assert.deepEqual(take('    #li $t0, 5'), { at: 4, length: 1 }, 'a mark with nothing after it loses only itself');
  assert.deepEqual(take('    ## two'), { at: 4, length: 1 }, 'only the outer mark comes off');
  // Not a comment at all: a mark with code before it is part of the line.
  assert.equal(take('  li $t0, 5   # five'), null);
  assert.equal(take('  li $t0, 5'), null);
});

test('what counts as commented, and as blank', () => {
  assert.ok(isCommented('# x') && isCommented('    # x') && isCommented('#x'));
  assert.ok(!isCommented('li $t0, 5 # x') && !isCommented(''));
  assert.ok(isBlank('') && isBlank('   ') && isBlank('\t '));
  assert.ok(!isBlank('  x'));
  assert.equal(MARK, '#');
});

const apply = (state: EditorState) => {
  const spec = commentChanges(state);
  return spec ? state.update(spec).state.doc.toString() : null;
};

test('commentChanges: the lines a selection touches, marked in one column, then unmarked', () => {
  const text = 'main:\n    li $t0, 5\n\n        add $t1, $t0, $t0\n';
  const state = EditorState.create({ doc: text, selection: EditorSelection.range(6, text.length - 1) });
  const on = apply(state)!;
  assert.equal(on, 'main:\n    # li $t0, 5\n\n    #     add $t1, $t0, $t0\n');
  const back = EditorState.create({ doc: on, selection: EditorSelection.range(6, on.length - 1) });
  assert.equal(apply(back), text);
});

test('commentChanges: a read-only document is not written to', () => {
  const state = EditorState.create({ doc: '    li $t0, 5\n', extensions: EditorState.readOnly.of(true) });
  assert.equal(commentChanges(state), null);
  // The same document, writable: the guard is what stops it, not the text.
  assert.notEqual(commentChanges(EditorState.create({ doc: '    li $t0, 5\n' })), null);
});

test('commentChanges: on a blank line, the mark goes in, after its indentation, and the cursor after it', () => {
  for (const [doc, at, want] of [['', 0, '# '], ['li $t0, 1\n\nsyscall', 10, 'li $t0, 1\n# \nsyscall'], ['main:\n    ', 10, 'main:\n    # ']] as const) {
    const state = EditorState.create({ doc, selection: EditorSelection.cursor(at) });
    const next = state.update(commentChanges(state)!).state;
    assert.equal(next.doc.toString(), want);
    assert.equal(next.selection.main.head, want.indexOf('# ') + 2, `cursor after the mark in ${JSON.stringify(want)}`);
    // And Ctrl+/ again takes it off.
    assert.equal(next.update(commentChanges(next)!).state.doc.toString().trimEnd(), doc.trimEnd());
  }
});
