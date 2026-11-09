// "+ New category" on the Categories tab: the card closed and nothing was saved. The form's save
// was `onSaved?.(await create())`, and with no onSaved (the Categories tab passes none) `?.` skipped
// the save itself. The tests go through the form's own save, the way each screen calls it.
// Also: the drag-and-drop list starts afresh when it gets a new row, but not when rows only move.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveCategory } from '@/components/saveCategory';
import { rowSet } from '@/components/sortableRows';
import { allCategories, store } from '@/db/store';

const uids = async () => (await allCategories()).filter((c) => !c.deleted && !c.hidden);
const keyOf = (c: { uid: string }) => c.uid;

test('a category added on the Categories tab (no onSaved) is saved and listed', async () => {
  const before = await uids();
  const made = await saveCategory({ name: 'Board games', noun: '', wantLabel: '', doneLabel: '' }, null);
  const after = await uids();
  assert.equal(after.length, before.length + 1, 'one more category');
  assert.ok(after.some((c) => c.uid === made.uid && c.name === 'Board games'));
  assert.deepEqual([made.noun, made.wantLabel, made.doneLabel], ['game', 'Want to play', 'Played'], 'empty words are guessed from the name');
});

test('a category added from the List (with onSaved) is saved, then reported', async () => {
  let reported: string | null = null;
  const made = await saveCategory({ name: 'Anime', noun: '', wantLabel: '', doneLabel: '' }, null, (c) => { reported = c.uid; });
  assert.equal(reported, made.uid);
  assert.ok((await uids()).some((c) => c.uid === made.uid));
});

test('editing a category saves the change', async () => {
  const cat = (await uids())[0];
  await saveCategory({ name: 'Renamed', noun: cat.noun, wantLabel: cat.wantLabel, doneLabel: cat.doneLabel }, cat);
  assert.equal((await uids()).find((c) => c.uid === cat.uid)?.name, 'Renamed');
});

test('the list starts afresh when a row is added or removed', async () => {
  const before = await uids();
  const made = await store.categories.create({ name: 'Podcasts' });
  const added = await uids();
  assert.notEqual(rowSet(added, keyOf), rowSet(before, keyOf), 'a new row: the list is built again, so it shows');
  await store.categories.remove(made.uid);
  assert.equal(rowSet(await uids(), keyOf), rowSet(before, keyOf), 'removed again: back to the same rows');
});

test("the list doesn't start afresh when rows are only moved", async () => {
  const rows = await uids();
  await store.categories.reorder(rows.map(keyOf).reverse());
  const moved = await uids();
  assert.notDeepEqual(moved.map(keyOf), rows.map(keyOf), 'the order did change');
  assert.equal(rowSet(moved, keyOf), rowSet(rows, keyOf), 'same rows: a drag carries on undisturbed');
});
