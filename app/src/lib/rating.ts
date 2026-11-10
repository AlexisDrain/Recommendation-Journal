// Your rating of something you've watched / read / played: 1 to 5 stars (no half stars, no zero),
// each with a word and an emoji shown beside the stars ("Great 👍"). Marking something done
// starts it at 3.
//
// Before build 81 it was four steps with emojis (❌ ✅ 👍 ❤️). Those still read back, as 1, 3, 4
// and 5 stars, from an older sheet or an old export.
import type { Rating } from './types';

export const STARS: Rating[] = [1, 2, 3, 4, 5];
/** What marking something done starts at. */
export const DEFAULT_RATING: Rating = 3;

/** What each number of stars means, shown beside the stars. */
export const RATING_WORDS: Record<Rating, { word: string; emoji: string }> = {
  1: { word: 'Bad', emoji: '👎' },
  2: { word: 'Meh', emoji: '😕' },
  3: { word: 'Average', emoji: '🙂' },
  4: { word: 'Great', emoji: '👍' },
  5: { word: 'Amazing', emoji: '💖' },
};

/** "Great 👍" */
export const ratingWord = (r: Rating) => `${RATING_WORDS[r].word} ${RATING_WORDS[r].emoji}`;

/** "★★★★☆ Great 👍": as written in the sheet and exports. */
export const ratingText = (r: Rating | null) => (r ? `${'★'.repeat(r)}${'☆'.repeat(5 - r)} ${ratingWord(r)}` : '');

/** "4 stars, Great", for screen readers. */
export const ratingLabel = (r: Rating) => `${r === 1 ? '1 star' : `${r} stars`}, ${RATING_WORDS[r].word}`;

/**
 * Reads a rating back from the sheet or an import, forgivingly: stars ("★★★★☆ Great 👍",
 * "★★★★☆", "****"), "4/5", a number 1-5, the words and emojis above, the emojis and words of the
 * old four steps, or the words old spreadsheets used ("Yes" in an "Exceptional" column, "Maybe"…).
 */
export function parseRating(raw: string): Rating | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  // Stars first: the filled ones count, whatever follows them.
  const lead = s.match(/^[★☆⭐*]+/)?.[0] ?? '';
  const stars = (lead.match(/[★⭐*]/g) ?? []).length;
  if (stars >= 1 && stars <= 5) return stars as Rating;
  if (lead) return null; // six stars, or only empty ones
  const outOf = s.match(/^([1-5])(?:[.,]\d+)?\s*(?:\/\s*5|stars?|★)?$/);
  if (outOf) return Number(outOf[1]) as Rating;
  if (/❤|♥|💖|exceptional|amazing|favou?rite|loved?|masterpiece|\byes\b/.test(s)) return 5;
  if (/👍|great|good|liked?|\bmaybe\b/.test(s)) return 4;
  if (/😕|\bmeh\b/.test(s)) return 2;
  if (/✅|✔|🙂|average|okay|\bok\b|fine|decent/.test(s)) return 3;
  if (/❌|✖|👎|bad|awful|terrible|hated?|dislike|\bno\b/.test(s)) return 1;
  return null;
}
