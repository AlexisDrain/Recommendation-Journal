// All reads and writes go through here: plain SQL against the SQLite file on the device.
//
// The whole list (every category and item) is also kept in memory, so the screens can search and
// filter as you type without waiting for the database. Every write refreshes it, and screens that
// call useData() redraw.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { categoryKey, tidyWords } from '@/lib/categories';
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
         recommended_on AS recommendedOn, done_on AS doneOn, queue_pos AS queuePos, manual_pos AS manualPos, deleted, created_at AS createdAt, updated_at AS updatedAt
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

/** How long a deleted recommendation can be restored before it's erased for good. */
export const DELETED_DAYS = 15;

export interface Data {
  /** Not deleted, in order (hidden ones included; screens leave them out where it matters). */
  categories: Category[];
  /** Not deleted, newest first. */
  items: Item[];
  /** Deleted in the last DELETED_DAYS days, the most recently deleted first ("Recently deleted"). */
  deleted: Item[];
  /** Deleted categories, for naming the category of a deleted item. */
  deletedCategories: Category[];
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
    return s && Array.isArray(s.categories) && Array.isArray(s.items) ? { categories: s.categories, items: s.items, deleted: [], deletedCategories: [], loaded: true, error: null } : null;
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

let data: Data = fromSnapshot(webStorage()?.getItem(SNAPSHOT_KEY) ?? null) ?? { categories: [], items: [], deleted: [], deletedCategories: [], loaded: false, error: null };
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
      deleted: items.filter((i) => i.deleted).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
      deletedCategories: categories.filter((c) => c.deleted),
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
  queuePos: 'queue_pos',
} as const;

/** Tidies a patch: trims text, and stamps "done on" today when something is first marked done. */
function cleanPatch(patch: ItemPatch, before?: Item): ItemPatch {
  const p: ItemPatch = { ...patch };
  for (const k of ['title', 'author', 'recommendedBy', 'note'] as const) if (p[k] !== undefined) p[k] = p[k]!.trim();
  if (p.rating && p.status === undefined && before?.status === 'want') p.status = 'done'; // rating it = you've had it
  if (p.status === 'done' && before?.status !== 'done' && p.doneOn === undefined && !before?.doneOn) p.doneOn = today();
  if (p.status === 'want' && before?.status === 'done' && p.doneOn === undefined) p.doneOn = null;
  if (p.status === 'done' && p.queuePos === undefined && before?.queuePos != null) p.queuePos = null; // done: no longer a priority
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
      `INSERT INTO items (uid, updated_at, manual_pos${cols.map(([, c]) => `, ${c}`).join('')})
       VALUES (?, ?, (SELECT coalesce(max(manual_pos), 0) + 1 FROM items)${', ?'.repeat(cols.length)})`,
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
    if (before?.queuePos != null && p.queuePos === null) await closePriorityGap(); // done: the rest move up
  },

  /** Deletes an item. It's kept as "deleted" so the deletion reaches the sheet; undo brings it back. */
  remove: async (uid: string) => {
    const before = data.items.find((i) => i.uid === uid);
    await (await getDb()).runAsync(`UPDATE items SET deleted = 1, updated_at = ? WHERE uid = ?`, stamp(), uid);
    await changed();
    if (before?.queuePos != null) await closePriorityGap();
  },
  /**
   * Brings a deleted item back (Undo, or the Recently deleted page). A priority goes back on the end
   * of Priority, and a category deleted along with it comes back too.
   */
  undoRemove: async (uid: string) => {
    const db = await getDb();
    const it = await db.getFirstAsync<{ categoryUid: string; queuePos: number | null }>(
      `SELECT category_uid AS categoryUid, queue_pos AS queuePos FROM items WHERE uid = ?`, uid);
    if (!it) return;
    const now = stamp();
    const last = upNext.list().reduce((m, i) => Math.max(m, i.queuePos!), 0);
    await transaction(db, async (tx) => {
      await tx.runAsync(`UPDATE items SET deleted = 0, queue_pos = ?, updated_at = ? WHERE uid = ?`, it.queuePos != null ? last + 1 : null, now, uid);
      await tx.runAsync(`UPDATE categories SET deleted = 0, updated_at = ? WHERE uid = ? AND deleted = 1`, now, it.categoryUid);
    });
    await changed();
  },

  /**
   * Erases for good what was deleted before `before` (an "Updated" time): it's no longer in
   * Recently deleted. True if anything was erased.
   */
  eraseDeleted: async (before: string): Promise<boolean> => {
    const r = await (await getDb()).runAsync(`DELETE FROM items WHERE deleted = 1 AND updated_at < ?`, before);
    if (r.changes) await reload();
    return r.changes > 0;
  },
};

/** Numbers the priorities 1, 2, 3… again after one left (done or deleted), so #2 becomes #1. */
const closePriorityGap = () => upNext.reorder(upNext.list().map((i) => i.uid));

/**
 * "My order": puts these items in this order (after a drag), using the places they already had,
 * so items that weren't shown (other categories, filtered out) keep theirs. Only the items whose
 * place changed are stamped, so only they sync.
 */
async function reorderManually(uids: string[]) {
  const pos = new Map(data.items.map((i) => [i.uid, i.manualPos]));
  const places = uids.map((u) => pos.get(u) ?? 0).sort((a, b) => b - a); // highest first
  const db = await getDb();
  const now = stamp();
  await transaction(db, async (tx) => {
    for (const [i, uid] of uids.entries()) {
      if (pos.get(uid) !== places[i]) await tx.runAsync(`UPDATE items SET manual_pos = ?, updated_at = ? WHERE uid = ?`, places[i], now, uid);
    }
  });
  await changed();
}

/** "Priority" (called upNext in the code): the things you mean to get to first, in your own order. */
const upNext = {
  /**
   * The priorities, in order. Two can share a number after a sync mixes two devices' numbering:
   * then the one placed there most recently comes first (the same on every device).
   */
  list: (all = data.items) => all.filter((i) => i.queuePos != null).sort((a, b) =>
    a.queuePos! - b.queuePos! || (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.uid < b.uid ? -1 : 1)),

  /** Numbers the priorities 1, 2, 3… if they aren't already (after a sync). True if anything changed. */
  tidy: async (): Promise<boolean> => {
    const list = upNext.list();
    if (list.every((it, i) => it.queuePos === i + 1)) return false;
    await upNext.reorder(list.map((i) => i.uid));
    return true;
  },

  /** Makes an item the last priority. */
  add: async (uid: string) => {
    const last = upNext.list().reduce((m, i) => Math.max(m, i.queuePos!), 0);
    await items.update(uid, { queuePos: last + 1 });
  },

  /** Takes an item off Priority, and closes the gap it leaves. */
  remove: async (uid: string) => {
    await upNext.reorder(upNext.list().map((i) => i.uid).filter((u) => u !== uid), uid);
  },

  /**
   * Numbers the priorities 1, 2, 3… in the given order. Only items whose place changed are stamped, so
   * only they are sent to the sheet. `drop`: also take this item off.
   */
  reorder: async (uids: string[], drop?: string) => {
    const db = await getDb();
    const now = stamp();
    const pos = new Map(data.items.map((i) => [i.uid, i.queuePos]));
    await transaction(db, async (tx) => {
      for (const [i, uid] of uids.entries()) {
        if (pos.get(uid) !== i + 1) await tx.runAsync(`UPDATE items SET queue_pos = ?, updated_at = ? WHERE uid = ?`, i + 1, now, uid);
      }
      if (drop) await tx.runAsync(`UPDATE items SET queue_pos = NULL, updated_at = ? WHERE uid = ?`, now, drop);
    });
    await changed();
  },
};

/** Writes an item exactly as given (from the sheet or an import), keeping its `updatedAt`. */
export async function writeItem(tx: SQLite.SQLiteDatabase, it: Omit<Item, 'id' | 'createdAt' | 'manualPos'> & { createdAt?: string; manualPos?: number | null }) {
  await tx.runAsync(
    `INSERT INTO items (uid, category_uid, title, author, status, rating, recommended_by, note, recommended_on, done_on, queue_pos, deleted, updated_at, created_at, manual_pos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), coalesce(?, (SELECT coalesce(max(manual_pos), 0) + 1 FROM items)))
     ON CONFLICT (uid) DO UPDATE SET
       category_uid = excluded.category_uid, title = excluded.title, author = excluded.author, status = excluded.status, rating = excluded.rating,
       recommended_by = excluded.recommended_by, note = excluded.note, recommended_on = excluded.recommended_on,
       done_on = excluded.done_on, queue_pos = excluded.queue_pos, deleted = excluded.deleted, updated_at = excluded.updated_at,
       manual_pos = coalesce(?, items.manual_pos)`,
    [it.uid, it.categoryUid, it.title, it.author, it.status, it.rating, it.recommendedBy, it.note, it.recommendedOn, it.doneOn, it.queuePos,
      Number(it.deleted), it.updatedAt, it.createdAt ?? null, it.manualPos ?? null, it.manualPos ?? null],
  );
}

// ---------- categories ----------

/** The category with this name (ignoring case, spaces and punctuation), if there is one. */
export const categoryNamed = (name: string, list = data.categories) =>
  list.find((c) => !c.deleted && categoryKey(c.name) === categoryKey(name));

const CATEGORY_COLUMNS = { name: 'name', noun: 'noun', wantLabel: 'want_label', doneLabel: 'done_label', hidden: 'hidden' } as const;

const categories = {
  /** Adds a category at the end. Words left out are guessed from the name ("Flash games" → play). */
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

  /** Puts the categories in this order (after a drag). Only the ones that moved are stamped, so only they sync. */
  reorder: async (uids: string[]) => {
    const db = await getDb();
    const now = stamp();
    const order = new Map(data.categories.map((c) => [c.uid, c.sortOrder]));
    await transaction(db, async (tx) => {
      for (const [i, uid] of uids.entries()) {
        if (order.get(uid) !== i + 1) await tx.runAsync(`UPDATE categories SET sort_order = ?, updated_at = ? WHERE uid = ?`, i + 1, now, uid);
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

export const store = { items: { ...items, reorder: reorderManually }, categories, upNext };
