// How one recommendation looks as a spreadsheet row: the Google Sheet, the .xlsx / CSV exports
// and imports all use these columns.
//
// Reading is forgiving, so hand-made lists import too: columns are matched by name with common
// alternatives ("Name", "Notes", "Year read"…), and columns the app doesn't know are kept by
// adding them to the note ("Author: Octavia E. Butler").
import { normalize } from '@/lib/categories';
import { parseDate } from '@/lib/dates';
import { parseRating, ratingText } from '@/lib/rating';
import type { Category, Item, Status } from '@/lib/types';

export const COLUMNS = ['Title', 'Author', 'Status', 'Up next', 'Rating', 'Recommended by', 'Why', 'Recommended on', 'Experienced on'] as const;
/** Kept in the Google Sheet (hidden) but not shown in the app's Sheet tab or the exports. */
export const ORDER_COLUMN = 'List order';
export type Column = (typeof COLUMNS)[number];
export const WIDTHS: Record<Column, number> = {
  Title: 36, Author: 22, Status: 16, 'Up next': 9, Rating: 16, 'Recommended by': 22, Why: 48, 'Recommended on': 15, 'Experienced on': 15,
};

/** One item as the cells of a row. */
export function itemCells(it: Item, cat: Pick<Category, 'wantLabel' | 'doneLabel'> | undefined): Record<Column, string> {
  return {
    Title: it.title,
    Author: it.author,
    Status: it.status === 'done' ? cat?.doneLabel || 'Done' : cat?.wantLabel || 'Want to',
    'Up next': it.queuePos != null ? String(it.queuePos) : '',
    Rating: ratingText(it.rating),
    'Recommended by': it.recommendedBy,
    Why: it.note,
    'Recommended on': it.recommendedOn ?? '',
    'Experienced on': it.doneOn ?? '',
  };
}

// Other names a column may go by in a list made by hand. Compared after normalize().
const ALIASES: Record<Column | 'Category', string[]> = {
  Title: ['title', 'name', 'media', 'media name', 'item', 'book', 'movie', 'film', 'game', 'show', 'album', 'recipe', 'what'],
  Author: ['author', 'creator', 'director', 'artist', 'writer', 'written by', 'directed by', 'made by', 'developer', 'studio',
    'band', 'musician', 'chef', 'host'],
  'Up next': ['up next', 'queue', 'priority', 'rank', 'ranking', 'watch soon', 'read soon', 'next'],
  Status: ['status', 'state', 'seen', 'done', 'watched', 'read', 'played', 'finished', 'have i'],
  Rating: ['rating', 'rated', 'score', 'stars', 'exceptional', 'my rating', 'verdict', 'opinion', 'liked it'],
  'Recommended by': ['recommended by', 'by', 'from', 'who', 'recommender', 'person', 'source', 'who told me', 'suggested by'],
  Why: ['why', 'note', 'notes', 'comment', 'comments', 'reason', 'description', 'remarks'],
  'Recommended on': ['recommended on', 'date recommended', 'recommended', 'added', 'date added', 'added on'],
  'Experienced on': ['experienced on', 'done on', 'watched on', 'read on', 'played on', 'finished on', 'year read',
    'year watched', 'year played', 'date read', 'date watched', 'year', 'date', 'when', 'completed'],
  Category: ['category', 'type', 'kind', 'media type'],
};

/** The app's columns ignore these when finding "other" columns to keep in the note. */
const BOOKKEEPING = new Set(['id', 'updated', 'changed', 'list order']);

export interface HeaderMap { col: Partial<Record<Column | 'Category', number>>; extra: { index: number; name: string }[]; order?: number }

/** Works out which column holds what. The first column with a matching name wins. */
export function mapHeader(header: string[]): HeaderMap {
  const col: HeaderMap['col'] = {};
  const names = header.map((h) => normalize(h));
  for (const [key, aliases] of Object.entries(ALIASES) as [Column | 'Category', string[]][]) {
    for (const a of aliases) {
      const i = names.findIndex((n, j) => n === a && !Object.values(col).includes(j));
      if (i >= 0) {
        col[key] = i;
        break;
      }
    }
  }
  const used = new Set(Object.values(col));
  const extra = header
    .map((name, index) => ({ index, name: name.trim() }))
    .filter((h) => h.name && !used.has(h.index) && !BOOKKEEPING.has(normalize(h.name)));
  const order = names.indexOf(normalize(ORDER_COLUMN));
  return { col, extra, ...(order >= 0 && { order }) };
}

const DONE_WORDS = /^(done|yes|y|true|x|✓|✔|seen|watched|read|played|listened|cooked|tried|visited|experienced|finished|completed|had)$/;

/** "Watched", "yes", "✓" → done; "Want to watch", "", "no" → want (unless it has a rating or a done date). */
export function parseStatus(raw: string, cat: Pick<Category, 'wantLabel' | 'doneLabel'> | undefined, hints: { rating: boolean; doneOn: boolean }): Status {
  if (/^[✓✔☑✅]/.test(raw.trim())) return 'done'; // ticks have no letters, so check before normalize()
  const s = normalize(raw);
  if (s) {
    if (cat && s === normalize(cat.doneLabel)) return 'done';
    if (cat && s === normalize(cat.wantLabel)) return 'want';
    if (DONE_WORDS.test(s) || /^(already )?(seen|watched|read|played|done)\b/.test(s)) return 'done';
    return 'want';
  }
  return hints.rating || hints.doneOn ? 'done' : 'want';
}

/** `author` / `queuePos` are left out when the row has no such column (an older sheet), so they aren't wiped. */
export type RowFields = { author?: string; queuePos?: number | null; manualPos?: number | null } & Pick<Item, 'title' | 'status' | 'rating' | 'recommendedBy' | 'note' | 'recommendedOn' | 'doneOn'>;

/**
 * A row's cells → an item's fields, or null for a row without a title.
 * `keep`: add what doesn't fit to the note (imports). The sync leaves it out, or the note would
 * grow every time the row comes back from the sheet.
 */
export function rowFields(map: HeaderMap, row: string[], cat: Pick<Category, 'wantLabel' | 'doneLabel'> | undefined, keep = true): RowFields | null {
  const get = (k: Column | 'Category') => (map.col[k] !== undefined ? String(row[map.col[k]!] ?? '').trim() : '');
  const title = get('Title');
  if (!title) return null;
  const rating = parseRating(get('Rating'));
  const doneOn = parseDate(get('Experienced on'));
  const recommendedOn = parseDate(get('Recommended on'));
  // Keep what doesn't fit: unknown columns, and dates the app couldn't read.
  const kept = !keep ? [] : map.extra
    .map((h) => [h.name, String(row[h.index] ?? '').trim()])
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  if (keep && !doneOn && get('Experienced on')) kept.push(`Experienced: ${get('Experienced on')}`);
  if (keep && !recommendedOn && get('Recommended on')) kept.push(`Recommended: ${get('Recommended on')}`);
  if (keep && !rating && get('Rating')) kept.push(`Rating: ${get('Rating')}`);
  return {
    title,
    ...(map.col.Author !== undefined && { author: get('Author') }),
    ...(map.order !== undefined && { manualPos: Number.isFinite(Number(row[map.order])) && String(row[map.order]).trim() !== '' ? Number(row[map.order]) : null }),
    ...(map.col['Up next'] !== undefined && { queuePos: /^\d+$/.test(get('Up next')) && Number(get('Up next')) > 0 ? Number(get('Up next')) : null }),
    status: parseStatus(get('Status'), cat, { rating: !!rating, doneOn: !!doneOn }),
    rating,
    recommendedBy: get('Recommended by'),
    note: [get('Why'), ...kept].filter(Boolean).join('\n'),
    recommendedOn,
    doneOn,
  };
}

/** The category name in a row (CSV exports have a Category column), or ''. */
export const rowCategory = (map: HeaderMap, row: string[]) =>
  map.col.Category !== undefined ? String(row[map.col.Category] ?? '').trim() : '';
