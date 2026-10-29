// Two devices changing different fields of the same recommendation: syncing must keep both
// changes, whichever device saved last. ("I rated it on the phone, edited the note on the
// computer, and the rating was gone.") Runs the real sheet script against an in-memory sheet.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { itemCells, ORDER_COLUMN } from '@/db/rowFormat';
import { allCategories, allItems, store, unsyncedFields } from '@/db/store';
import { connect, syncNow } from '@/db/sync';
import type { Item } from '@/lib/types';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
(globalThis as any).fetch = async (_url: string, init: any) => ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });

// The app syncs by itself 3 seconds after each change (requestSync). Off here, so each step below
// happens in the order written, and only the test's own syncNow() calls sync.
const realSetTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: () => void, ms?: number, ...rest: unknown[]) =>
  (ms === 3000 ? undefined : realSetTimeout(fn, ms, ...rest));

/** The other device: it sends its copy of a recommendation straight to the sheet. */
const otherDevice = async (it: Item) => {
  const category = (await allCategories()).find((c) => c.uid === it.categoryUid);
  const values = it.deleted ? {} : { ...itemCells(it, category), [ORDER_COLUMN]: String(it.manualPos) };
  const body = { secret, action: 'sync', categories: [], items: [{ id: it.uid, category: it.categoryUid, deleted: it.deleted, updated: it.updatedAt, values }], pull: false };
  const answer = JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  assert.equal(answer.ok, true, answer.error);
};
/** What the sheet's Movies tab shows for this title, in this column (undefined: no such row). */
const cell = (title: string, header: string) => {
  const rows = env.ss.getSheetByName('Movies').getDataRange().getValues() as string[][];
  const row = rows.find((r) => r[rows[0].indexOf('Title')] === title);
  return row ? String(row[rows[0].indexOf(header)]) : undefined;
};
const here = async (uid: string) => (await allItems()).find((i) => i.uid === uid)!;
const tick = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second
const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';

test('a field each, changed on two devices', async () => {
  const { uid } = await store.items.create({ categoryUid: 'default-movie', title: 'Heat' });
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  await syncNow();
  assert.equal(cell('Heat', 'Title'), 'Heat');

  // The other device rates it; this one syncs and gets the rating.
  await tick();
  const other1 = { ...(await here(uid)), rating: 3 as const, updatedAt: stamp() };
  await otherDevice(other1);
  await syncNow();
  assert.equal((await here(uid)).rating, 3);

  // The bug: the other device writes a note; this one, not knowing yet, changes who recommended it later.
  await tick();
  const other2 = { ...other1, note: 'from there', updatedAt: stamp() };
  await otherDevice(other2);
  await tick();
  await store.items.update(uid, { recommendedBy: 'Sam' });
  await syncNow();
  assert.equal(cell('Heat', 'Why'), 'from there', "the sheet keeps the other device's note");
  assert.equal(cell('Heat', 'Recommended by'), 'Sam');
  assert.equal(cell('Heat', 'Rating'), '👍 Great');
  const merged = await here(uid);
  assert.equal(merged.note, 'from there', 'and this device gets it');
  assert.equal(merged.rating, 3);
  assert.equal(merged.recommendedBy, 'Sam');
  assert.equal((await unsyncedFields()).size, 0, 'nothing left to send');

  // The other way round: an unsent edit here, then a newer edit of another field there.
  await tick();
  await store.items.update(uid, { author: 'Michael Mann' });
  await tick();
  await otherDevice({ ...other2, recommendedBy: 'Sam', recommendedOn: '2025-12-25', updatedAt: stamp() });
  await syncNow();
  const after = await here(uid);
  assert.equal(after.recommendedOn, '2025-12-25', 'the newer edit arrives');
  assert.equal(after.author, 'Michael Mann', 'the unsent edit here survives');
  assert.equal(cell('Heat', 'Author'), 'Michael Mann', 'and reaches the sheet');
  assert.equal(cell('Heat', 'Recommended on'), '2025-12-25');
  assert.equal(cell('Heat', 'Why'), 'from there');
});

test('deleting, against an edit of another field', async () => {
  const { uid } = await store.items.create({ categoryUid: 'default-movie', title: 'Ronin' });
  await syncNow();
  const base = await here(uid);
  assert.equal(cell('Ronin', 'Title'), 'Ronin');

  // Deleted here (not sent yet), then the note edited there: the deletion wins, the note is kept for Recently deleted.
  await tick();
  await store.items.remove(uid);
  await tick();
  await otherDevice({ ...base, note: 'edited there', updatedAt: stamp() });
  await syncNow();
  const deleted = await here(uid);
  assert.equal(deleted.deleted, true, 'still deleted here');
  assert.equal(deleted.note, 'edited there', "with the other device's note, should it be restored");
  assert.equal(cell('Ronin', 'Title'), undefined, 'and gone from the sheet');

  // Restored here: back in the sheet, note and all.
  await tick();
  await store.items.undoRemove(uid);
  await syncNow();
  assert.equal((await here(uid)).deleted, false);
  assert.equal(cell('Ronin', 'Why'), 'edited there');

  // Rated here (not sent yet), then deleted there: deleted here too.
  await tick();
  await store.items.update(uid, { rating: 2 });
  await tick();
  await otherDevice({ ...(await here(uid)), deleted: true, updatedAt: stamp() });
  await syncNow();
  assert.equal((await here(uid)).deleted, true);
  assert.equal(cell('Ronin', 'Title'), undefined);
});
