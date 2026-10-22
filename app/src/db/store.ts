// All reads and writes go through here: plain SQL against the SQLite file on the device.
//
// The whole list (every category and item) is also kept in memory, so the screens can search and
// filter as you type without waiting for the database. Every write refreshes it, and screens that
// call useData() redraw.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { normalize, tidyWords } from '@/lib/categories';
import { stamp, today } from '@/lib/dates';
import type { Category, CategoryPatch, Item, ItemPatch } from '@/lib/types';
import { migrate } from './migrations';
import { transaction } from './transaction';
import { claimWebDatabase, explainStorageError } from './webStorage';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (and on first use, creates + migrates) recommendations.db. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= claimWebDatabase() // web: only one tab may hold the database
    .then(() => SQLite.openDatabaseAsync('recommendations.db'))
    .then(async (db) => {
      await migrate(db);
      return db;
    })
    .catch((e) => {
      dbPromise = null; // let the next call retry
      throw explainStorageError(e);
    });
  return dbPromise;
}

export const newUid = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

// ---------- reading ----------

const SELECT_CATEGORY = `
  SELECT id, uid, name, noun, want_label AS wantLabel, done_label AS doneLabel, sort_order AS sortOrder,
         hidden, deleted, updated_at AS updatedAt
  FROM categories`;

const SELECT_ITEM = `
  SELECT id, uid, category_uid AS categoryUid, title, author, status, rating, recommended_by AS recommendedBy, note,
         recommended_on AS recommendedOn, done_on AS doneOn, deleted, created_at AS createdAt, updated_at AS updatedAt
  FROM items`;

type Bools<T, K extends keyof T> = Omit<T, K> & Record<K, number>;
const toCategory = (r: Bools<Category, 'hidden' | 'deleted'>): Category => ({ ...r, hidden: r.hidden === 1, deleted: r.deleted === 1 });
const toItem = (r: Bools<Item, 'deleted'>): Item => ({ ...r, deleted: r.deleted === 1 });

/** Every category, deleted ones included (for sync). */
export async function allCategories(): Promise<Category[]> {
  const db = await getDb();
  return (await db.getAllAsync<Bools<Category, 'hidden' | 'deleted'>>(`${SELECT_CATEGORY} ORDER BY sort_order, id`)).map(toCategory);
}

/** Every item, deleted ones included (for sync and export). */
export async function allItems(): Promise<Item[]> {
  const db = await getDb();
  return (await db.getAllAsync<Bools<Item, 'deleted'>>(`${SELECT_ITEM} ORDER BY created_at, id`)).map(toItem);
}

// ---------- the in-memory copy ----------

export interface Data {
  /** Not deleted, in order (hidden ones included; screens leave them out where it matters). */
  categories: Category[];
  /** Not deleted, newest first. */
  items: Item[];
  loaded: boolean;
  error: string | null;
}

// The list as it was last time, so it shows the moment the app opens. Opening the database can take
// seconds in some browsers (the SQLite engine starts up and the browser hands over the file); the
// fresh copy replaces this one as soon as it's read. Kept beside the database, on this device only.
const SNAPSHOT_KEY = 'recjournal.snapshot.v1';

function webStorage(): Storage | null {
  try {
    return Platform.OS === 'web' && typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // storage blocked: just wait for the database
  }
}

function fromSnapshot(raw: string | null): Data | null {
  try {
    const s = raw ? (JSON.parse(raw) as Pick<Data, 'categories' | 'items'>) : null;
    return s && Array.isArray(s.categories) && Array.isArray(s.items) ? { categories: s.categories, items: s.items, loaded: true, error: null } : null;
  } catch {
    return null;
  }
}

function saveSnapshot() {
  const raw = JSON.stringify({ categories: data.categories, items: data.items });
  const web = webStorage();
  if (web) {
    try {
      web.setItem(SNAPSHOT_KEY, raw);
    } catch {
      // full or blocked: the next start just waits for the database
    }
  } else {
    AsyncStorage.setItem(SNAPSHOT_KEY, raw).catch(() => {});
  }
}

let data: Data = fromSnapshot(webStorage()?.getItem(SNAPSHOT_KEY) ?? null) ?? { categories: [], items: [], loaded: false, error: null };
/** True once the database itself has been read (until then `data` may be the snapshot). */
let fresh = false;
const listeners = new Set<() => void>();

/** Reads everything again and redraws the screens. Called after every write. */
export async function reload(): Promise<void> {
  try {
    const [categories, items] = await Promise.all([allCategories(), allItems()]);
    data = {
      categories: categories.filter((c) => !c.deleted),
      items: items.filter((i) => !i.deleted).reverse(),
      loaded: true,
      error: null,
    };
    fresh = true;
    saveSnapshot();
  } catch (e) {
    data = { ...data, loaded: true, error: (e as Error).message };
  }
  listeners.forEach((fn) => fn());
}

// Phones: the snapshot is read from storage (a few milliseconds), unless the database won the race.
if (Platform.OS !== 'web') {
  AsyncStorage.getItem(SNAPSHOT_KEY).then((raw) => {
    const s = fromSnapshot(raw);
    if (s && !fresh) {
      data = s;
      listeners.forEach((fn) => fn());
    }
  }, () => {});
}
// Start opening the database right away, not when the first screen asks for the list.
void reload();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Everything on the list; the screen redraws when it changes. */
export function useData(): Data {
  return useSyncExternalStore(subscribe, () => data, () => data);
}

export const getData = () => data;

const changeListeners = new Set<() => void>();
/** Get told after the user changed something (the sync uses this to send it to the sheet). */
export function onLocalChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
async function changed() {
  await reload();
  changeListeners.forEach((fn) => fn());
}

// ---------- items ----------

/** API name → column, for the editable fields of `items`. */
const ITEM_COLUMNS = {
  categoryUid: 'category_uid',
  title: 'title',
  author: 'author',
  status: 'status',
  rating: 'rating',
  recommendedBy: 'recommended_by',
  note: 'note',
  recommendedOn: 'recommended_on',
  doneOn: 'done_on',
} as const;

/** Tidies a patch: trims text, and stamps "done on" today when something is first marked done. */
function cleanPatch(patch: ItemPatch, before?: Item): ItemPatch {
  const p: ItemPatch = { ...patch };
  for (const k of ['title', 'author', 'recommendedBy', 'note'] as const) if (p[k] !== undefined) p[k] = p[k]!.trim();
  if (p.rating && p.status === undefined && before?.status === 'want') p.status = 'done'; // rating it = you've had it
  if (p.status === 'done' && before?.status !== 'done' && p.doneOn === undefined && !before?.doneOn) p.doneOn = today();
  if (p.status === 'want' && before?.status === 'done' && p.doneOn === undefined) p.doneOn = null;
  return p;
}

const items = {
  /** Adds a recommendation. Recommended on defaults to today. */
  create: async (patch: ItemPatch & Pick<Item, 'categoryUid' | 'title'>): Promise<Item> => {
    const p = cleanPatch({ status: patch.rating ? 'done' : 'want', recommendedOn: today(), ...patch });
    if (!p.title) throw new Error('Give it a title first.');
    const db = await getDb();
    const uid = newUid();
    const cols = Object.entries(ITEM_COLUMNS).filter(([k]) => p[k as keyof ItemPatch] !== undefined);
    await db.runAsync(
      `INSERT INTO items (uid, updated_at${cols.map(([, c]) => `, ${c}`).join('')}) VALUES (?, ?${', ?'.repeat(cols.length)})`,
      [uid, stamp(), ...cols.map(([k]) => p[k as keyof ItemPatch] ?? null)],
    );
    await changed();
    return data.items.find((i) => i.uid === uid)!;
  },

  update: async (uid: string, patch: ItemPatch): Promise<void> => {
    const before = data.items.find((i) => i.uid === uid);
    const p = cleanPatch(patch, before);
    if (p.title === '') throw new Error("The title can't be empty.");
    const cols = Object.entries(ITEM_COLUMNS).filter(([k]) => p[k as keyof ItemPatch] !== undefined);
    if (!cols.length) return;
    const db = await getDb();
    await db.runAsync(
      `UPDATE items SET ${cols.map(([, c]) => `${c} = ?`).join(', ')}, updated_at = ? WHERE uid = ?`,
      [...cols.map(([k]) => p[k as keyof ItemPatch] ?? null), stamp(), uid],
    );
    await changed();
  },

  /** Deletes an item. It's kept as "deleted" so the deletion reaches the sheet; undo brings it back. */
  remove: async (uid: string) => {
    await (await getDb()).runAsync(`UPDATE items SET deleted = 1, updated_at = ? WHERE uid = ?`, stamp(), uid);
    await changed();
  },
  undoRemove: async (uid: string) => {
    await (await getDb()).runAsync(`UPDATE items SET deleted = 0, updated_at = ? WHERE uid = ?`, stamp(), uid);
    await changed();
  },
};

/** Writes an item exactly as given (from the sheet or an import), keeping its `updatedAt`. */
export async function writeItem(tx: SQLite.SQLiteDatabase, it: Omit<Item, 'id' | 'createdAt'> & { createdAt?: string }) {
  await tx.runAsync(
    `INSERT INTO items (uid, category_uid, title, author, status, rating, recommended_by, note, recommended_on, done_on, deleted, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))
     ON CONFLICT (uid) DO UPDATE SET
       category_uid = excluded.category_uid, title = excluded.title, author = excluded.author, status = excluded.status, rating = excluded.rating,
       recommended_by = excluded.recommended_by, note = excluded.note, recommended_on = excluded.recommended_on,
       done_on = excluded.done_on, deleted = excluded.deleted, updated_at = excluded.updated_at`,
    [it.uid, it.categoryUid, it.title, it.author, it.status, it.rating, it.recommendedBy, it.note, it.recommendedOn, it.doneOn,
      Number(it.deleted), it.updatedAt, it.createdAt ?? null],
  );
}

// ---------- categories ----------

/** The category with this name (ignoring case, spaces and punctuation), if there is one. */
export const categoryNamed = (name: string, list = data.categories) =>
  list.find((c) => !c.deleted && normalize(c.name) === normalize(name));

const CATEGORY_COLUMNS = { name: 'name', noun: 'noun', wantLabel: 'want_label', doneLabel: 'done_label', hidden: 'hidden' } as const;

const categories = {
  /** Adds a category at the end. Words left out are guessed from the name ("Flash game" → play). */
  create: async (body: { name: string } & Partial<CategoryPatch>): Promise<Category> => {
    const name = body.name.trim();
    if (!name) throw new Error('Give the category a name.');
    const existing = categoryNamed(name);
    if (existing) {
      if (existing.hidden) await categories.update(existing.uid, { hidden: false });
      return existing;
    }
    const words = tidyWords(name, body);
    const db = await getDb();
    const uid = newUid();
    await db.runAsync(
      `INSERT INTO categories (uid, name, noun, want_label, done_label, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, (SELECT coalesce(max(sort_order), 0) + 1 FROM categories), ?)`,
      uid, name, words.noun, words.wantLabel, words.doneLabel, stamp(),
    );
    await changed();
    return data.categories.find((c) => c.uid === uid)!;
  },

  update: async (uid: string, patch: CategoryPatch) => {
    if (patch.name !== undefined) {
      patch = { ...patch, name: patch.name.trim() };
      if (!patch.name) throw new Error("The name can't be empty.");
      const other = categoryNamed(patch.name);
      if (other && other.uid !== uid) throw new Error(`You already have a category called “${other.name}”.`);
    }
    if (patch.noun !== undefined || patch.wantLabel !== undefined || patch.doneLabel !== undefined) {
      const now = data.categories.find((c) => c.uid === uid);
      const tidy = tidyWords(patch.name ?? now?.name ?? '', { ...now, ...patch });
      patch = { ...patch, ...(patch.noun !== undefined && { noun: tidy.noun }),
        ...(patch.wantLabel !== undefined && { wantLabel: tidy.wantLabel }), ...(patch.doneLabel !== undefined && { doneLabel: tidy.doneLabel }) };
    }
    const cols = Object.entries(CATEGORY_COLUMNS).filter(([k]) => patch[k as keyof CategoryPatch] !== undefined);
    if (!cols.length) return;
    await (await getDb()).runAsync(
      `UPDATE categories SET ${cols.map(([, c]) => `${c} = ?`).join(', ')}, updated_at = ? WHERE uid = ?`,
      [...cols.map(([k]) => {
        const v = patch[k as keyof CategoryPatch]!;
        return typeof v === 'boolean' ? Number(v) : v.trim();
      }), stamp(), uid],
    );
    await changed();
  },

  /** Move one place up (-1) or down (1). Every category is renumbered and stamped, so the order syncs. */
  move: async (uid: string, direction: -1 | 1) => {
    const list = [...data.categories];
    const from = list.findIndex((c) => c.uid === uid);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    const db = await getDb();
    const now = stamp();
    await transaction(db, async (tx) => {
      for (const [i, c] of list.entries()) {
        if (c.sortOrder !== i + 1) await tx.runAsync(`UPDATE categories SET sort_order = ?, updated_at = ? WHERE uid = ?`, i + 1, now, c.uid);
      }
    });
    await changed();
  },

  /** Deletes a category and everything in it. */
  remove: async (uid: string) => {
    const db = await getDb();
    const now = stamp();
    await transaction(db, async (tx) => {
      await tx.runAsync(`UPDATE items SET deleted = 1, updated_at = ? WHERE category_uid = ? AND deleted = 0`, now, uid);
      await tx.runAsync(`UPDATE categories SET deleted = 1, hidden = 1, updated_at = ? WHERE uid = ?`, now, uid);
    });
    await changed();
  },
};

/** Writes a category exactly as given (from the sheet or an import), keeping its `updatedAt`. */
export async function writeCategory(tx: SQLite.SQLiteDatabase, c: Omit<Category, 'id'>) {
  await tx.runAsync(
    `INSERT INTO categories (uid, name, noun, want_label, done_label, sort_order, hidden, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (uid) DO UPDATE SET
       name = excluded.name, noun = excluded.noun, want_label = excluded.want_label, done_label = excluded.done_label,
       sort_order = excluded.sort_order, hidden = excluded.hidden, deleted = excluded.deleted, updated_at = excluded.updated_at`,
    [c.uid, c.name, c.noun, c.wantLabel, c.doneLabel, c.sortOrder, Number(c.hidden), Number(c.deleted), c.updatedAt],
  );
}

export const store = { items, categories };
