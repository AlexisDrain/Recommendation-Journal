// The starter categories, and the guesses that fill in a new category's words for you.
import type { Category } from './types';

type Words = Pick<Category, 'noun' | 'wantLabel' | 'doneLabel'>;

/**
 * The starter categories. Their uids are fixed, so a new phone and a new browser pair up with the
 * same categories in the Google Sheet instead of making a second "Movies" tab. Names are plural
 * ("Movies"), except where there's no plural ("Other").
 */
export const DEFAULT_CATEGORIES: (Words & { uid: string; name: string })[] = [
  { uid: 'default-nonfiction', name: 'Non-fiction books', noun: 'book', wantLabel: 'Want to read', doneLabel: 'Read' },
  { uid: 'default-fiction', name: 'Fiction books', noun: 'book', wantLabel: 'Want to read', doneLabel: 'Read' },
  { uid: 'default-videogame', name: 'Video games', noun: 'game', wantLabel: 'Want to play', doneLabel: 'Played' },
  { uid: 'default-tvshow', name: 'TV shows', noun: 'show', wantLabel: 'Want to watch', doneLabel: 'Watched' },
  { uid: 'default-movie', name: 'Movies', noun: 'movie', wantLabel: 'Want to watch', doneLabel: 'Watched' },
  { uid: 'default-album', name: 'Music albums', noun: 'album', wantLabel: 'Want to listen', doneLabel: 'Listened' },
  { uid: 'default-recipe', name: 'Cooking recipes', noun: 'recipe', wantLabel: 'Want to cook', doneLabel: 'Cooked' },
  { uid: 'default-other', name: 'Other', noun: 'media', wantLabel: 'Want to experience', doneLabel: 'Experienced' },
];

// [words in the name, the verb, its past tense]. The first match wins.
const VERBS: [RegExp, string, string][] = [
  [/game|play|quest|puzzle|board|rpg|d&d/i, 'play', 'Played'],
  [/movie|film|show|tv|series|anime|musical|theat|opera|ballet|cartoon|video|youtube|documentary|youtuber|stream|episode|critical role/i, 'watch', 'Watched'],
  [/album|music|song|band|artist|podcast|audio|playlist|singer|radio/i, 'listen', 'Listened'],
  [/book|novel|poem|poetry|story|stories|paper|article|essay|comic|manga|blog|fic|magazine|read/i, 'read', 'Read'],
  [/recipe|dish|cook|bake|meal/i, 'cook', 'Cooked'],
  [/restaurant|food|drink|wine|beer|coffee|snack|cafe|café|bar\b/i, 'try', 'Tried'],
  [/place|city|country|trip|travel|museum|park|hike|visit/i, 'visit', 'Visited'],
  [/app|tool|software|website|site|product|gadget/i, 'try', 'Tried'],
  [/course|class|lecture|talk|skill/i, 'take', 'Took'],
];

/**
 * Suggests the words for a category from its name:
 *   "Flash games" → game / Want to play / Played
 *   "Poems"       → poem / Want to read / Read
 *   "Things"      → thing / Want to experience / Experienced
 */
export function suggestWords(name: string): Words {
  const clean = name.trim();
  const last = singular(clean.split(/\s+/).pop()?.toLowerCase() ?? '');
  const noun = !last || last === 'other' || last === 'misc' ? 'media' : last;
  const verb = VERBS.find(([re]) => re.test(clean));
  return verb
    ? { noun, wantLabel: `Want to ${verb[1]}`, doneLabel: verb[2] }
    : { noun, wantLabel: 'Want to experience', doneLabel: 'Experienced' };
}

const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ').toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
};

/**
 * The words as saved, whatever capitals were typed: the noun in lowercase ("GAME" → "game"), the
 * status words in sentence case ("want TO WATCH" → "Want to watch"). Empty ones are guessed from `name`.
 */
export function tidyWords(name: string, w: Partial<Words>): Words {
  const guess = suggestWords(name);
  return {
    noun: w.noun?.trim().replace(/\s+/g, ' ').toLowerCase() || guess.noun,
    wantLabel: sentence(w.wantLabel ?? '') || guess.wantLabel,
    doneLabel: sentence(w.doneLabel ?? '') || guess.doneLabel,
  };
}

/** "Movies" → "movie", "Stories" → "story"; leaves "series", "glass", "anime" alone. */
function singular(w: string): string {
  if (/(series|news|ss|us)$/.test(w) || w.length < 4) return w;
  if (/[^aeiou][^aeiou]ies$|[dlrt]ories$|[bp]ies$/.test(w) && !/(movies|cookies|zombies|selfies|pies)$/.test(w)) return w.slice(0, -3) + 'y';
  return w.endsWith('s') ? w.slice(0, -1) : w;
}

/** Example names shown when making a new category, to give the idea. */
export const CATEGORY_IDEAS = ['Podcasts', 'Anime', 'Board games', 'Poems', 'Papers', 'Musicals', 'Restaurants', 'YouTube channels', 'Flash games'];

/**
 * A category name for comparing: "Movie", "movies" and "MOVIES" are the same category, so an older
 * file or sheet with a "Movie" tab joins "Movies" instead of making a second one.
 */
export function categoryKey(name: string): string {
  const words = normalize(name).split(' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}

/** "a movie" / "an album" */
export const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

/** Only letters and numbers, lowercase, accents removed: for comparing names and searching. */
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
