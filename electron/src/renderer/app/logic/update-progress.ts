/* The first screen's update download (panels/welcome.ts), as it is shown:
   the bar's fill, the percentage and the megabytes. */

export interface Progress { percent: number; transferred: number; total: number }

const MB = 1024 * 1024;   // as Windows counts a megabyte

/** The bar's fill, 0..100.  Rounded down, so 100 is only shown when all of it is there. */
export function progressFill(p: Progress): number {
  const v = Number.isFinite(p.percent) ? p.percent : 0;
  return Math.max(0, Math.min(100, Math.floor(v)));
}

/** "40%" and "56.5 / 141.3 MB"; the size is empty while the total is not known. */
export function progressText(p: Progress): { percent: string; size: string } {
  const ok = (n: number) => Number.isFinite(n) && n > 0;
  const total = ok(p.total) ? p.total : 0;
  const done = Math.min(ok(p.transferred) ? p.transferred : 0, total);
  return {
    percent: `${progressFill(p)}%`,
    size: total ? `${(done / MB).toFixed(1)} / ${(total / MB).toFixed(1)} MB` : '',
  };
}
