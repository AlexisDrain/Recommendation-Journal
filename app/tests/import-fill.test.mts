// Importing a file with things already on your list: it fills in what those entries leave empty
// (like a series added in a spreadsheet) and never overwrites what's there, nor changes the title.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importTables } from '@/db/exchange';
import { allItems, getDb, store, unsyncedFields } from '@/db/store';

const HEAD = ['Title', 'Series', 'Author', 'Status', 'Rating', 'Recommended by', 'Why', 'Id'];

test('a row with the Id of an entry you have fills in its empty fields only', async () => {
  const book = await store.items.create({ categoryUid: 'default-fiction', title: 'Animorphs - #1 The Invasion', author: '', status: 'done', recommendedBy: 'my cousin' });
  const other = await store.items.create({ categoryUid: 'default-fiction', title: 'Storm Front', author: 'Jim Butcher', series: 'Dresden', status: 'done' });
  const r = await importTables([{ name: 'Fiction books', rows: [
    HEAD,
    // A different spelling of the title, but the same Id: it's the same entry. The title stays.
    ['Animorphs #1: The Invasion', 'Animorphs', 'K. A. Applegate', 'Read', '', 'someone else', '', book.uid],
    // Everything here is already filled in: nothing changes.
    ['Storm Front', 'The Dresden Files', 'Someone', 'Read', '', '', '', other.uid],
  ] }]);
  assert.deepEqual([r.added, r.updated, r.skipped], [0, 1, 1]);
  const items = await allItems();
  const b = items.find((i) => i.uid === book.uid)!;
  assert.equal(b.title, 'Animorphs - #1 The Invasion', 'the title is never changed');
  assert.equal(b.series, 'Animorphs');
  assert.equal(b.author, 'K. A. Applegate');
  assert.equal(b.recommendedBy, 'my cousin', 'what was filled in stays');
  const o = items.find((i) => i.uid === other.uid)!;
  assert.equal(o.series, 'Dresden', 'a series you set is not overwritten');
  assert.equal(o.author, 'Jim Butcher');
  assert.match((await unsyncedFields()).get(book.uid) ?? '', /\bseries\b/, 'the filled-in series goes to the Google Sheet on the next sync');
});

test('without an Id, the same title in the same category counts as the same entry', async () => {
  const it = await store.items.create({ categoryUid: 'default-fiction', title: 'Fool Moon', status: 'done' });
  const r = await importTables([{ name: 'Fiction books', rows: [['Title', 'Series'], ['fool moon', 'The Dresden Files'], ['A New Book', 'Something']] }]);
  assert.deepEqual([r.added, r.updated, r.skipped], [1, 1, 0]);
  const items = await allItems();
  assert.equal(items.find((i) => i.uid === it.uid)?.series, 'The Dresden Files');
  assert.equal(items.filter((i) => /fool moon/i.test(i.title)).length, 1, 'not added twice');
});

test('adding finds the top of "My order" through an index, not by reading every entry', async () => {
  const db = await getDb();
  const plan = await db.getAllAsync<{ detail: string }>('EXPLAIN QUERY PLAN SELECT coalesce(max(manual_pos), 0) + 1 FROM items');
  assert.match(plan.map((p) => p.detail).join(' '), /items_manual_pos_idx/, 'a big import would slow down with every row');
});
