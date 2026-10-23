// Schema migrations for the on-device SQLite database.
//
// Each string runs once, in order. SQLite's built-in `PRAGMA user_version` remembers how
// many have been applied (0 on a fresh install). Once the app is released, never edit a
// migration that has shipped: add a new one to the end instead.
//
// Dates are TEXT: "2026-10-21", or "2026-10" / "2026" when only the month or year is known.
// "Updated" times are UTC to the second, "2026-10-21T18:30:00Z", so they compare as plain text;
// the newest edit wins when devices sync through the Google Sheet.
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_CATEGORIES } from '@/lib/categories';
import { transaction } from './transaction';

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

export const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  -- A kind of thing: Movie, Fiction book, Flash game… One tab each in the Google Sheet.
  CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    uid        TEXT NOT NULL UNIQUE,                 -- the same on every synced device
    name       TEXT NOT NULL CHECK (name <> ''),
    noun       TEXT NOT NULL DEFAULT 'media',        -- "movie": what one item is called
    want_label TEXT NOT NULL DEFAULT 'Want to experience',
    done_label TEXT NOT NULL DEFAULT 'Experienced',
    sort_order INTEGER NOT NULL DEFAULT 0,
    hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),   -- off the lists, items kept
    deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),  -- kept so the deletion syncs
    updated_at TEXT NOT NULL DEFAULT ''
  ) STRICT;

  -- One recommendation.
  CREATE TABLE items (
    id             INTEGER PRIMARY KEY,
    uid            TEXT NOT NULL UNIQUE,
    category_uid   TEXT NOT NULL,                    -- categories.uid (by uid, so it syncs as is)
    title          TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'done')),
    rating         INTEGER CHECK (rating BETWEEN 1 AND 4), -- 1 bad, 2 average, 3 great, 4 exceptional
    recommended_by TEXT NOT NULL DEFAULT '',
    note           TEXT NOT NULL DEFAULT '',
    recommended_on TEXT,
    done_on        TEXT,
    deleted        INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)), -- kept so the deletion syncs
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  ) STRICT;
  CREATE INDEX items_category_idx ON items (category_uid);
  CREATE INDEX items_updated_idx ON items (updated_at);

  -- Starter categories. Each can be renamed, hidden or deleted in the app. updated_at stays ''
  -- (older than anything), so a Google Sheet that already has them keeps its version.
  INSERT INTO categories (uid, name, noun, want_label, done_label, sort_order) VALUES
    ${DEFAULT_CATEGORIES.map((c, i) => `(${[c.uid, c.name, c.noun, c.wantLabel, c.doneLabel].map(quote).join(', ')}, ${i + 1})`).join(',\n    ')};
  `,

  // 2 — two examples for a new user, so the list isn't empty: one on the list, one done and rated
  `
  -- Only on a new install (nothing saved yet). The uids are fixed, like the starter categories', so
  -- every device has the same two: deleting them on one device deletes them on the others through
  -- the Google Sheet. updated_at '' keeps them out of the sheet unless you edit them.
  INSERT INTO items (uid, category_uid, title, status, rating, recommended_by, note, recommended_on, done_on, updated_at)
  SELECT * FROM (VALUES
    ('example-monte-cristo', 'default-fiction', 'The Count of Monte Cristo', 'want', NULL, 'a friend',
     'A revenge story worth all of its 1,200 pages. (This is an example: delete it once you''ve added your own.)',
     date('now', 'localtime'), NULL, ''),
    ('example-godfather', 'default-movie', 'The Godfather', 'done', 4, 'Dad',
     'Said it''s the best movie ever made. (This is an example: delete it once you''ve added your own.)',
     date('now', 'localtime'), date('now', 'localtime'), '')
  )
  WHERE NOT EXISTS (SELECT 1 FROM items);
  `,

  // 3 — a third example: a movie still on the list
  `
  -- Only while the list holds nothing but the examples (a new install, or someone still looking
  -- around), and only if the examples weren't deleted. Same rules as migration 2.
  INSERT INTO items (uid, category_uid, title, status, rating, recommended_by, note, recommended_on, done_on, updated_at)
  SELECT 'example-citizen-kane', 'default-movie', 'Citizen Kane', 'want', NULL, 'my film teacher',
         'Often called the greatest film ever made. (This is an example: delete it once you''ve added your own.)',
         date('now', 'localtime'), NULL, ''
  WHERE NOT EXISTS (SELECT 1 FROM items WHERE uid NOT LIKE 'example-%')
    AND EXISTS (SELECT 1 FROM items WHERE uid = 'example-godfather' AND deleted = 0);
  `,

  // 4 — who made it: the author (or director, artist…), and the examples' authors
  `
  ALTER TABLE items ADD COLUMN author TEXT NOT NULL DEFAULT '';
  -- updated_at stays as it was, so the examples still stay out of the Google Sheet unless edited.
  UPDATE items SET author = 'Alexandre Dumas'      WHERE uid = 'example-monte-cristo' AND author = '';
  UPDATE items SET author = 'Francis Ford Coppola' WHERE uid = 'example-godfather'    AND author = '';
  UPDATE items SET author = 'Orson Welles'         WHERE uid = 'example-citizen-kane' AND author = '';
  `,

  // 5 — "Up next": things you mean to get to soon, in your own order (1 = first). NULL = not on it.
  `
  ALTER TABLE items ADD COLUMN queue_pos INTEGER CHECK (queue_pos IS NULL OR queue_pos >= 1);
  -- The example still on the list starts out on Up next, so new users see what it is.
  UPDATE items SET queue_pos = 1 WHERE uid = 'example-citizen-kane' AND status = 'want' AND deleted = 0
    AND NOT EXISTS (SELECT 1 FROM items WHERE queue_pos IS NOT NULL);
  `,

  // 6 — "My order": your own order for the list, set by dragging. Higher comes first, so new
  // things (max + 1) go on top. It starts as newest first, the order the list already had.
  `
  ALTER TABLE items ADD COLUMN manual_pos REAL;
  UPDATE items SET manual_pos = (SELECT count(*) FROM items AS o WHERE o.created_at < items.created_at OR (o.created_at = items.created_at AND o.id <= items.id));
  `,
];

export async function migrate(db: SQLiteDatabase) {
  // Per-connection settings (not stored in the file), so they run every launch.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;

  for (let v = applied; v < MIGRATIONS.length; v++) {
    await transaction(db, async (tx) => {
      await tx.execAsync(MIGRATIONS[v]);
      await tx.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
