/* How long ago a moment was, in the words the Assemble panel uses (cells.ts ago()). */

import { say, type Lang } from '../../../core/lang.ts';
import { ASSEMBLE } from '../messages/assemble.ts';

/** How long ago, as a person says it: "just now", "12s ago", "3 min ago", "2 h ago" (방금, 12초 전 ...). */
export function agoText(at: Date, now = Date.now(), lang: Lang = 'en'): string {
  const s = Math.max(0, Math.floor((now - at.getTime()) / 1000));
  if (s < 5) return say(lang, ASSEMBLE.ago.now);
  if (s < 60) return say(lang, ASSEMBLE.ago.seconds, s);
  const m = Math.floor(s / 60);
  if (m < 60) return say(lang, ASSEMBLE.ago.minutes, m);
  return say(lang, ASSEMBLE.ago.hours, Math.floor(m / 60));
}
