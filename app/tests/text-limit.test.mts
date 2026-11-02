// No text longer than MAX_TEXT gets saved, however it arrives: Google Sheets refuses a cell over
// 50,000 characters, and one refused cell would stop every sync.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapHeader, MAX_TEXT, rowFields } from '@/db/rowFormat';
import { allItems, store } from '@/db/store';

// The app syncs by itself 3 seconds after each change; nothing is connected here.
const realSetTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: () => void, ms?: number, ...rest: unknown[]) =>
  (ms === 3000 ? undefined : realSetTimeout(fn, ms, ...rest));

const long = 'x'.repeat(MAX_TEXT + 500); // a paste longer than the box allows
const saved = async (uid: string) => (await allItems()).find((i) => i.uid === uid)!;

test('adding and editing keep each field within the limit', async () => {
  const { uid } = await store.items.create({ categoryUid: 'default-movie', title: long, author: long, recommendedBy: long, note: long });
  let it = await saved(uid);
  for (const v of [it.title, it.author, it.recommendedBy, it.note]) assert.equal(v.length, MAX_TEXT);

  await store.items.update(uid, { title: `${long}!`, note: `${long}!` });
  it = await saved(uid);
  assert.equal(it.title.length, MAX_TEXT);
  assert.equal(it.note.length, MAX_TEXT);
});

test('text at the limit is kept whole', async () => {
  const exact = 'y'.repeat(MAX_TEXT);
  const { uid } = await store.items.create({ categoryUid: 'default-movie', title: 'Exactly', note: exact });
  assert.equal((await saved(uid)).note, exact);
});

test('an import whose extra columns make Why too long is cut to the limit', () => {
  // Each cell fits on its own; joined into Why ("Notes: …", "Links: …") they don't.
  const map = mapHeader(['Title', 'Why', 'Notes', 'Links']);
  const fields = rowFields(map, ['Heat', 'w'.repeat(15_000), 'n'.repeat(10_000), 'l'.repeat(10_000)], undefined)!;
  assert.equal(fields.note.length, MAX_TEXT);
  assert.ok(fields.note.startsWith('w'.repeat(15_000)), 'what was in Why comes first and stays whole');
  assert.ok(fields.note.includes('Notes: n'));
});

test('every field of an imported row is within the limit', () => {
  const map = mapHeader(['Title', 'Author', 'Recommended by', 'Why']);
  const fields = rowFields(map, [long, long, long, long], undefined)!;
  for (const v of [fields.title, fields.author!, fields.recommendedBy, fields.note]) assert.equal(v.length, MAX_TEXT);
});
