// A big import saves its rows 25 at a time, each batch in its own transaction, and reports how far
// it is after each. Importing the same file again saves nothing new: a cut-off import can be re-run.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IMPORT_BATCH, importTables } from '@/db/exchange';
import { allItems } from '@/db/store';

const rows = [['Title', 'Author', 'Status'], ...Array.from({ length: 60 }, (_, i) => [`Batch Book ${i + 1}`, `Author ${i + 1}`, 'Want to read'])];
const batchBooks = async () => (await allItems()).filter((i) => i.title.startsWith('Batch Book ') && !i.deleted);

test('60 rows are saved in batches of 25, with progress after each', async () => {
  assert.equal(IMPORT_BATCH, 25);
  const progress: [number, number][] = [];
  const r = await importTables([{ name: 'Fiction books', rows }], 'Imported', (done, total) => progress.push([done, total]));
  assert.deepEqual(progress, [[0, 60], [25, 60], [50, 60], [60, 60]]);
  assert.equal(r.added, 60);
  assert.equal((await batchBooks()).length, 60);
});

test('the same file again saves nothing and skips all 60', async () => {
  const progress: [number, number][] = [];
  const r = await importTables([{ name: 'Fiction books', rows }], 'Imported', (done, total) => progress.push([done, total]));
  assert.deepEqual([r.added, r.updated, r.skipped], [0, 0, 60]);
  assert.deepEqual(progress, [[0, 0]], 'nothing to save');
  assert.equal((await batchBooks()).length, 60, 'nothing doubled');
});

test('blank rows are counted, and a file without a list changes nothing', async () => {
  const before = (await allItems()).length;
  const r = await importTables([{ name: 'Fiction books', rows: [['Title', 'Author'], ['', ''], ['Blank Row Test', 'Someone'], ['', '  ']] }]);
  assert.deepEqual([r.added, r.blank], [1, 2]);
  const none = await importTables([{ name: 'Notes', rows: [['Just', 'some'], ['words', 'here']] }]);
  assert.deepEqual([none.added, none.updated, none.skipped], [0, 0, 0]);
  assert.equal((await allItems()).length, before + 1);
});
