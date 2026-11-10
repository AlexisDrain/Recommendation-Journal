// Ratings are 1 to 5 stars, each with a word and an emoji ("★★★★☆ Great 👍"). The old four steps (❌ ✅ 👍 ❤️) become 1, 3, 4 and 5 stars: in the
// database (migration 13), and when read back from an older sheet or export.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { mapHeader, rowFields } from '@/db/rowFormat';
import { allItems, getDb, store } from '@/db/store';
import { connect, syncNow } from '@/db/sync';
import { parseRating, ratingText } from '@/lib/rating';

test('stars are written as ★★★★☆ and read back from stars, numbers and the old words', () => {
  assert.equal(ratingText(4), '★★★★☆ Great 👍');
  assert.equal(ratingText(1), '★☆☆☆☆ Bad 👎');
  assert.equal(ratingText(5), '★★★★★ Amazing 💖');
  assert.equal(ratingText(null), '');
  for (const r of [1, 2, 3, 4, 5] as const) assert.equal(parseRating(ratingText(r)), r);
  assert.equal(parseRating('★★★★☆'), 4, "version 9's bare stars");
  assert.equal(parseRating('****'), 4);
  assert.equal(parseRating('Meh 😕'), 2);
  assert.equal(parseRating('Average 🙂'), 3);
  assert.equal(parseRating('★★★☆☆ Okay 🙂'), 3, "version 10's word");
  assert.equal(parseRating('4/5'), 4);
  assert.equal(parseRating('5 stars'), 5);
  assert.equal(parseRating('2'), 2);
  assert.equal(parseRating('❌ Bad'), 1);
  assert.equal(parseRating('✅ Average'), 3);
  assert.equal(parseRating('👍 Great'), 4);
  assert.equal(parseRating('❤️ Exceptional'), 5);
  assert.equal(parseRating('0'), null, 'no zero stars');
  assert.equal(parseRating('★★★★★★'), null, 'no sixth star');
});

test('the seeded examples were converted to stars by migration 13', async () => {
  // Migration 13 ran when the test database opened: the examples were rated on the old scale.
  const godfather = (await allItems()).find((i) => i.uid === 'example-godfather');
  assert.equal(godfather?.rating, 5, 'it was ❤️ Exceptional');
  const db = await getDb();
  const left = await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM items WHERE rating IS NOT NULL AND stars IS NULL`);
  assert.equal(left?.n, 0, 'every old rating has its stars');
});

test('a 5-star rating saves, and an older sheet\'s "👍 Great" reads as 4 stars', async () => {
  const it = await store.items.create({ categoryUid: 'default-movie', title: 'Five Star Film', rating: 5 });
  assert.equal((await allItems()).find((i) => i.uid === it.uid)?.rating, 5);
  const fields = rowFields(mapHeader(['Title', 'Rating']), ['Old', '👍 Great'], undefined, false);
  assert.equal(fields?.rating, 4);
});

test('the sheet script turns old rating words into stars, and gets new ratings as stars', async () => {
  const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
  const env = makeEnv();
  env.ctx.setup();
  env.ctx.showConnectionCode();
  (globalThis as any).fetch = async (_u: string, init: any) => ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });
  await connect('https://script.google.com/macros/s/T/exec', String(env.ctx.lastLog).split('\n')[1]);
  await syncNow();
  const sh = env.ss.getSheetByName('Movies');
  const [head, ...rows] = sh.getDataRange().getValues();
  const col = head.indexOf('Rating');
  const five = rows.find((r: unknown[]) => r[head.indexOf('Title')] === 'Five Star Film');
  assert.equal(five?.[col], '★★★★★ Amazing 💖');

  // A tab still holding an old word (from before version 9): set up again, it becomes stars.
  const at = rows.indexOf(five) + 2;
  sh.getRange(at, col + 1).setValue('👍 Great');
  env.props.forEach((_v: string, k: string) => { if (k.startsWith('LAYOUT_')) env.props.delete(k); });
  await store.items.create({ categoryUid: 'default-movie', title: 'Nudge' }); // something to sync
  await syncNow();
  assert.equal(sh.getRange(at, col + 1).getValues()[0][0], '★★★★☆ Great 👍');

  // Version 9 wrote bare stars: those get their words too.
  sh.getRange(at, col + 1).setValue('★★☆☆☆');
  env.props.forEach((_v: string, k: string) => { if (k.startsWith('LAYOUT_')) env.props.delete(k); });
  await store.items.create({ categoryUid: 'default-movie', title: 'Nudge again' });
  await syncNow();
  assert.equal(sh.getRange(at, col + 1).getValues()[0][0], '★★☆☆☆ Meh 😕');

  // Version 10 called 3 stars "Okay": now "Average".
  sh.getRange(at, col + 1).setValue('★★★☆☆ Okay 🙂');
  env.props.forEach((_v: string, k: string) => { if (k.startsWith('LAYOUT_')) env.props.delete(k); });
  await store.items.create({ categoryUid: 'default-movie', title: 'Nudge once more' });
  await syncNow();
  assert.equal(sh.getRange(at, col + 1).getValues()[0][0], '★★★☆☆ Average 🙂');
});
