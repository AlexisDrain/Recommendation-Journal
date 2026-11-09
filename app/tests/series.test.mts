// The Series field ("Dune book series", under the author): saved, tracked for the field-by-field
// sync, sent to the Google Sheet in its own column and read back from it, and never wiped by a
// sheet or a file that has no Series column (an older script, a hand-made list).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { mapHeader, rowFields } from '@/db/rowFormat';
import { allItems, store, unsyncedFields } from '@/db/store';
import { connect, syncNow } from '@/db/sync';
import { seriesGroups, seriesSuggestions } from '@/lib/search';
import type { Item } from '@/lib/types';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
(globalThis as any).fetch = async (_u: string, init: any) => ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });

/** A sheet tab's rows as { header: value } objects. */
function tabRows(name: string): Record<string, unknown>[] {
  const sh = env.ss.getSheetByName(name);
  const [head, ...rows] = sh.getDataRange().getValues();
  return rows.map((r: unknown[]) => Object.fromEntries(head.map((h: unknown, i: number) => [String(h), r[i]])));
}

test('a series is saved, trimmed, and marked as not yet sent', async () => {
  const it = await store.items.create({ categoryUid: 'default-fiction', title: 'Dune', author: 'Frank Herbert', series: '  Dune book series ' });
  assert.equal(it.series, 'Dune book series');
  await store.items.update(it.uid, { series: 'Dune Chronicles' });
  assert.equal((await allItems()).find((i) => i.uid === it.uid)?.series, 'Dune Chronicles');
  assert.match((await unsyncedFields()).get(it.uid) ?? '', /\bseries\b/, 'a change to the series has to go out on the next sync');
});

test('the series goes to the sheet in its own column, and comes back from it', async () => {
  await connect('https://script.google.com/macros/s/T/exec', secret);
  await syncNow();
  const row = tabRows('Fiction books').find((r) => r.Title === 'Dune');
  assert.equal(row?.Series, 'Dune Chronicles', 'the sheet has a Series column with it');
  assert.equal((await unsyncedFields()).has((await allItems()).find((i) => i.title === 'Dune')!.uid), false, 'sent: nothing left to send');

  // Changed in the sheet by hand: the app takes it.
  const sh = env.ss.getSheetByName('Fiction books');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const at = tabRows('Fiction books').findIndex((r) => r.Title === 'Dune') + 2;
  sh.getRange(at, head.indexOf('Series') + 1).setValue('Dune saga');
  sh.getRange(at, head.indexOf('Changed') + 1).setValue(new Date(Date.now() + 5000).toISOString().slice(0, 19) + 'Z');
  sh.getRange(at, head.indexOf('Updated') + 1).setValue(new Date(Date.now() + 5000).toISOString().slice(0, 19) + 'Z');
  await syncNow();
  assert.equal((await allItems()).find((i) => i.title === 'Dune')?.series, 'Dune saga');
});

test('a row without a Series column leaves the series alone', async () => {
  const header = ['Title', 'Author', 'Status'];
  const fields = rowFields(mapHeader(header), ['Dune', 'Frank Herbert', 'Read'], undefined, false);
  assert.equal(fields && 'series' in fields, false, 'no series given, so a sync or import keeps the one it has');
  const withSeries = rowFields(mapHeader(['Title', 'Saga']), ['Dune', 'Dune'], undefined, false);
  assert.equal(withSeries?.series, 'Dune', 'a hand-made list\'s "Saga" column counts as the series');
});

test('a sheet made before Series gets the column right after Title, with nothing else moved out of place', async () => {
  // Take the Series column out, as in a sheet made by an older script.
  const sh = env.ss.getSheetByName('Fiction books');
  const col = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).indexOf('Series') + 1;
  const kept = new Map();
  for (const [k, v] of sh.cells) {
    const [r, c] = k.split(':').map(Number);
    if (c !== col) kept.set(`${r}:${c > col ? c - 1 : c}`, v);
  }
  sh.cells = kept;
  assert.equal(tabRows('Fiction books')[0].Series, undefined);

  await syncNow();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  assert.deepEqual(head.slice(0, 3), ['Title', 'Series', 'Author'], 'Series goes between Title and Author');
  const row = tabRows('Fiction books').find((r) => r.Title === 'Dune');
  assert.equal(row?.Author, 'Frank Herbert', 'the other columns moved along with their values');
  assert.equal((await allItems()).find((i) => i.title === 'Dune')?.series, 'Dune saga', 'the app kept its series');
});

test('the Series page groups by series, and the editor suggests series once you type', () => {
  const at = (n: number) => `2026-01-0${n}T00:00:00Z`;
  const make = (title: string, series: string, n: number) => ({ uid: title, title, series, createdAt: at(n), recommendedOn: null } as Item);
  const items = [make('Dune Messiah', 'Dune book series', 2), make('Dune', 'dune book series ', 1), make('Children of Dune', 'Dune book series', 3),
    make('Andor', 'Star Wars', 4), make('Alone', '', 5)];
  const groups = seriesGroups(items);
  assert.deepEqual(groups.map((g) => g.name), ['Dune book series', 'Star Wars'], 'A–Z, spellings merged, things without a series left out');
  assert.deepEqual(groups[0].items.map((i) => i.title), ['Dune', 'Dune Messiah', 'Children of Dune'], 'in the order they were recommended');
  assert.deepEqual(seriesSuggestions(items, ''), [], 'nothing until you type');
  assert.deepEqual(seriesSuggestions(items, 'dun'), ['Dune book series']);
  assert.deepEqual(seriesSuggestions(items, 'Dune book series'), [], 'not the one already typed');
});

test('a Series column the version 7 script put at the far end moves to right after Title', async () => {
  const sh = env.ss.getSheetByName('Fiction books');
  // Lay the tab out as version 7 left it: Series taken out, then put back after every other column.
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = head.indexOf('Series') + 1;
  const end = head.length;
  sh.getRange(tabRows('Fiction books').findIndex((r) => r.Title === 'Dune') + 2, col).setValue('Dune saga');
  const kept = new Map();
  for (const [k, v] of sh.cells) {
    const [r, c] = k.split(':').map(Number);
    kept.set(`${r}:${c === col ? end : c > col ? c - 1 : c}`, v);
  }
  sh.cells = kept;
  const before = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  assert.equal(before.at(-1), 'Series');

  await syncNow();
  const after = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  assert.deepEqual(after.slice(0, 4), ['Title', 'Series', 'Author', 'Status']);
  assert.equal(after.filter((h) => h === 'Series').length, 1, 'moved, not added again');
  const row = tabRows('Fiction books').find((r) => r.Title === 'Dune');
  assert.equal(row?.Author, 'Frank Herbert');
  assert.equal(row?.Series, 'Dune saga', 'its values moved with it');
});
