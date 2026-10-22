// Search as you type. Each item's words are prepared once (the "index") and reused for every
// keystroke, so even a few thousand recommendations filter instantly, on the phone too.
//
// Ignores case, accents and punctuation. Every word you type has to appear somewhere (title,
// author, who recommended it, the note, or the category); the start of a word is enough ("godf" finds
// "The Godfather"). Title matches come first.
import { normalize } from './categories';
import type { Category, Item } from './types';

interface Entry { item: Item; title: string; titleWords: string[]; words: string[] }

let cache: { items: Item[]; categories: Category[]; index: Entry[] } | null = null;

function indexFor(items: Item[], categories: Category[]): Entry[] {
  if (cache?.items === items && cache.categories === categories) return cache.index;
  const names = new Map(categories.map((c) => [c.uid, c.name]));
  const index = items.map((item) => {
    const title = normalize(item.title);
    const rest = normalize(`${item.author} ${item.recommendedBy} ${item.note} ${names.get(item.categoryUid) ?? ''}`);
    return { item, title, titleWords: title.split(' '), words: [...title.split(' '), ...rest.split(' ')] };
  });
  cache = { items, categories, index };
  return index;
}

/** Items matching `query`, best first. An empty query returns them all, unchanged. */
export function search(items: Item[], categories: Category[], query: string): Item[] {
  const q = normalize(query);
  if (!q) return items;
  const terms = q.split(' ');
  const scored: [number, Entry][] = [];
  for (const e of indexFor(items, categories)) {
    if (!terms.every((t) => e.words.some((w) => w.startsWith(t)) || e.title.includes(t))) continue;
    const score =
      e.title === q ? 0
        : e.title.startsWith(q) ? 1
          : terms.every((t) => e.titleWords.some((w) => w.startsWith(t))) ? 2
            : e.title.includes(q) ? 3
              : 4;
    scored.push([score, e]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, e]) => e.item);
}

/** True if an item with this exact title (ignoring case and punctuation) is already on the list. */
export function hasTitle(items: Item[], title: string, categoryUid?: string): boolean {
  const t = normalize(title);
  return !!t && items.some((i) => normalize(i.title) === t && (!categoryUid || i.categoryUid === categoryUid));
}

/** Everyone who has recommended something, most frequent first: the quick-pick chips. */
export function people(items: Item[]): string[] {
  const counts = new Map<string, { name: string; n: number; last: string }>();
  for (const i of items) {
    const name = i.recommendedBy.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const c = counts.get(key) ?? { name, n: 0, last: '' };
    c.n++;
    if (i.createdAt > c.last) c.last = i.createdAt;
    counts.set(key, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).map((c) => c.name);
}
