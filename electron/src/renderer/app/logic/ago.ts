/* How long ago a moment was, in the words the Assemble panel uses (cells.ts ago()). */

/** How long ago, as a person says it: "just now", "12s ago", "3 min ago", "2 h ago". */
export function agoText(at: Date, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}
