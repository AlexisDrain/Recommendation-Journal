// "My order" after two lists were merged (connecting to another sheet), where entries can share a
// place: dragging one past the other has to work, and has to leave them apart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allItems, getDb, reload, store } from '@/db/store';

// The app syncs by itself 3 seconds after each change; nothing is connected here.
const realSetTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: () => void, ms?: number, ...rest: unknown[]) =>
  (ms === 3000 ? undefined : realSetTimeout(fn, ms, ...rest));

const place = async (uid: string) => (await allItems()).find((i) => i.uid === uid)!.manualPos;

test('dragging entries that share a place', async () => {
  const a = await store.items.create({ categoryUid: 'default-movie', title: 'A' });
  const b = await store.items.create({ categoryUid: 'default-movie', title: 'B' });
  const other = await store.items.create({ categoryUid: 'default-movie', title: 'Not shown' });
  const c = await store.items.create({ categoryUid: 'default-movie', title: 'C' });
  const db = await getDb();
  await db.runAsync(`UPDATE items SET manual_pos = 100 WHERE uid IN (?, ?)`, a.uid, b.uid);
  await db.runAsync(`UPDATE items SET manual_pos = 200 WHERE uid = ?`, other.uid);
  await db.runAsync(`UPDATE items SET manual_pos = 300 WHERE uid = ?`, c.uid);
  await reload();

  await store.items.reorder([c.uid, b.uid, a.uid]);
  assert.ok(await place(c.uid) > await place(b.uid));
  assert.ok(await place(b.uid) > await place(a.uid));
  assert.equal(await place(other.uid), 200, 'an entry that was not shown keeps its place');

  await store.items.reorder([c.uid, a.uid, b.uid]);
  assert.ok(await place(a.uid) > await place(b.uid), 'once apart, they keep swapping');
});

test('without ties, two entries just swap places', async () => {
  const a = await store.items.create({ categoryUid: 'default-movie', title: 'D' });
  const b = await store.items.create({ categoryUid: 'default-movie', title: 'E' });
  const [pa, pb] = [await place(a.uid), await place(b.uid)];
  await store.items.reorder([a.uid, b.uid]);
  assert.equal(await place(a.uid), pb);
  assert.equal(await place(b.uid), pa);
});
