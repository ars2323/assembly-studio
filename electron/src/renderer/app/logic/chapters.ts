/* Where a step stands in the tutorial's chapters (logic only; the card is
   tutorial/engine.ts): its chapter, its number in all, and how full each
   chapter's piece of the progress bar is. */

export interface Progress {
  chapter: number;   // 0-based
  within: number;    // 0-based, in its chapter
  number: number;    // 1-based, in all
  total: number;
  fills: number[];   // per chapter, 0..1: the steps reached (this one included)
}

// `sizes`: the number of steps in each chapter; `index`: 0-based in all.
export function progress(sizes: readonly number[], index: number): Progress {
  const total = sizes.reduce((a, b) => a + b, 0);
  const at = Math.max(0, Math.min(total - 1, index));
  let chapter = 0;
  let first = 0;
  while (chapter < sizes.length - 1 && at >= first + sizes[chapter]) { first += sizes[chapter]; chapter += 1; }
  const within = at - first;
  const fills = sizes.map((n, c) => (c < chapter ? 1 : c > chapter ? 0 : n ? (within + 1) / n : 0));
  return { chapter, within, number: at + 1, total, fills };
}
