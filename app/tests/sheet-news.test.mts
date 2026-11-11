// After each sync, the notice at the top says what happened (SheetToast, from Sleep Journal):
// "Saved to your Google Sheet ✔️" when only this device's changes went out, "From your Google
// Sheet: …" when changes came in.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { sheetNewsText } from '@/components/SheetToast';
import { store } from '@/db/store';
import { connect, onSheetNews, syncNow, type SheetNews } from '@/db/sync';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
(globalThis as any).fetch = async (_u: string, init: any) => ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });

test('the notice\'s words', () => {
  assert.equal(sheetNewsText({ added: 1, updated: 0 }), 'From your Google Sheet: 1 new recommendation');
  assert.equal(sheetNewsText({ added: 2, updated: 0 }), 'From your Google Sheet: 2 new recommendations');
  assert.equal(sheetNewsText({ added: 2, updated: 1 }), 'From your Google Sheet: 2 new, 1 updated');
  assert.equal(sheetNewsText({ added: 0, updated: 3 }), 'From your Google Sheet: 3 recommendations updated');
});

test('a sync that only sends tells "saved"; one that receives says what came in', async () => {
  const news: SheetNews[] = [];
  const stop = onSheetNews((n) => news.push(n));
  await connect('https://script.google.com/macros/s/T/exec', String(env.ctx.lastLog).split('\n')[1]);
  await syncNow(); // the first sync: this device's examples go out
  news.length = 0;

  await store.items.create({ categoryUid: 'default-movie', title: 'Saved Film' });
  await syncNow();
  assert.ok(news.length >= 1);
  assert.deepEqual(news[0], { added: 0, updated: 0, saved: 1 }, 'only sent: the small "Saved" pill');

  // A row typed into the sheet by hand comes in as new.
  news.length = 0;
  const sh = env.ss.getSheetByName('Movies');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = head.map((h: string) => (h === 'Title' ? 'Typed In Sheet' : h === 'Status' ? 'Want to watch' : ''));
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  await syncNow();
  assert.ok(news.some((n) => n.added === 1), `came in as new: ${JSON.stringify(news)}`);
  stop();
});
