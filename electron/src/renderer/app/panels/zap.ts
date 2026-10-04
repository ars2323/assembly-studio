/* The first screen's change of step, drawn as electricity: arcs that jump
   from the buttons to the die frame and between the two, flicker a few
   times and are gone (welcome.ts zap()).  Here the shape of one arc, pure:
   a jagged line from one point to another by midpoint displacement, and a
   fork off it. */

export type Point = [number, number];
export type Random = () => number;

/** A jagged line from a to b: each half bent off the straight by up to
    `rough` of its length, `depth` times over (2^depth segments). */
export function bolt(a: Point, b: Point, rough: number, depth: number, random: Random): Point[] {
  if (depth === 0) return [a, b];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  if (len < 2) return [a, b];
  const off = (random() - 0.5) * rough * len;
  const mid: Point = [(a[0] + b[0]) / 2 - (dy / len) * off, (a[1] + b[1]) / 2 + (dx / len) * off];
  return [...bolt(a, mid, rough, depth - 1, random), ...bolt(mid, b, rough, depth - 1, random).slice(1)];
}

/** A short fork off a bolt: from a point part way along it, off at an angle
    to the way the bolt goes, a third or so of what is left of it long. */
export function fork(main: Point[], random: Random): Point[] {
  const i = Math.floor(main.length * (0.3 + random() * 0.4));
  const from = main[i], end = main[main.length - 1];
  const angle = Math.atan2(end[1] - from[1], end[0] - from[0]) + (random() < 0.5 ? -1 : 1) * (0.4 + random() * 0.5);
  const len = Math.hypot(end[0] - from[0], end[1] - from[1]) * (0.25 + random() * 0.2);
  return bolt(from, [from[0] + Math.cos(angle) * len, from[1] + Math.sin(angle) * len], 0.45, 3, random);
}

export const pathOf = (points: Point[]): string =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
