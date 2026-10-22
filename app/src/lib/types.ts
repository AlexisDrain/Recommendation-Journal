// The shapes the app works with. The database stores the same things (src/db/migrations.ts).

/** want = on your list ("Want to watch"); done = you've had it ("Watched"). */
export type Status = 'want' | 'done';

/** 1 ❌ bad · 2 ✅ average · 3 👍 great · 4 ❤️ exceptional (see rating.ts) */
export type Rating = 1 | 2 | 3 | 4;

/**
 * A kind of thing people recommend: "Movie", "Fiction book", "Flash game"…
 * Each one is its own tab in the Google Sheet and in the .xlsx export.
 */
export interface Category {
  id: number;
  /** The same on every synced device (ids differ per device). */
  uid: string;
  name: string;
  /** What one item is called: "movie", "book", "game". Used in hints like "Add a movie". */
  noun: string;
  /** The status words: "Want to watch" / "Watched". */
  wantLabel: string;
  doneLabel: string;
  sortOrder: number;
  /** Off the lists and the add screen; its items are kept. */
  hidden: boolean;
  /** Deleted, kept only so the deletion reaches the Google Sheet and other devices. */
  deleted: boolean;
  updatedAt: string;
}

export interface Item {
  id: number;
  uid: string;
  categoryUid: string;
  title: string;
  /** Who made it: the author, director, artist… "Stephen King". */
  author: string;
  status: Status;
  rating: Rating | null;
  /** Who told you about it: "my brother", "stranger in the park". */
  recommendedBy: string;
  /** Why it was recommended, or anything else to remember. */
  note: string;
  /** "2026-10-21", or just "2026-10" / "2026" when that's all you know. */
  recommendedOn: string | null;
  /** When you watched / read / played it. */
  doneOn: string | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ItemPatch = Partial<Pick<Item, 'categoryUid' | 'title' | 'author' | 'status' | 'rating' | 'recommendedBy' | 'note' | 'recommendedOn' | 'doneOn'>>;
export type CategoryPatch = Partial<Pick<Category, 'name' | 'noun' | 'wantLabel' | 'doneLabel' | 'hidden'>>;
