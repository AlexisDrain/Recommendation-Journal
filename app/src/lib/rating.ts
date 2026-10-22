// Your rating of something you've watched / read / played: four steps, each with an emoji.
import type { Rating } from './types';

export const RATINGS: { value: Rating; emoji: string; label: string }[] = [
  { value: 1, emoji: '❌', label: 'Bad' },
  { value: 2, emoji: '✅', label: 'Average' },
  { value: 3, emoji: '👍', label: 'Great' },
  { value: 4, emoji: '❤️', label: 'Exceptional' },
];

export const ratingEmoji = (r: Rating | null) => (r ? RATINGS[r - 1].emoji : '');

/** As written in the sheet and exports: "❤️ Exceptional". */
export const ratingText = (r: Rating | null) => (r ? `${RATINGS[r - 1].emoji} ${RATINGS[r - 1].label}` : '');

/**
 * Reads a rating back from the sheet or an import, forgivingly: the emoji, the word, a number 1-4,
 * or the words old spreadsheets used ("Yes" in an "Exceptional" column, "Maybe", "good"…).
 */
export function parseRating(raw: string): Rating | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^[1-4]$/.test(s)) return Number(s) as Rating;
  if (/❤|♥|💖|exceptional|amazing|favou?rite|loved?|masterpiece|\byes\b|5\/5|\*{5}/.test(s)) return 4;
  if (/👍|great|good|liked?|\bmaybe\b/.test(s)) return 3;
  if (/✅|✔|average|okay|\bok\b|fine|meh|decent/.test(s)) return 2;
  if (/❌|✖|bad|awful|terrible|hated?|dislike|\bno\b/.test(s)) return 1;
  return null;
}
