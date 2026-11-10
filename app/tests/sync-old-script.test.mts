// A series set while the sheet still ran an older script (version 6, no Series column) must reach
// the sheet once the script is updated: the app keeps it waiting instead of counting it as sent.
// It also sends every series once more when it first meets a newer script, for series an earlier
// app counted as sent although the old script had dropped them.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { getDb, store, unsyncedFields } from '@/db/store';
import { connect, syncNow } from '@/db/sync';

const { makeEnv, version6 } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
let env = makeEnv({ source: version6() });
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
(globalThis as any).fetch = async (_u: string, init: any) => ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });

function row(tab: string, title: string): Record<string, unknown> | undefined {
  const [head, ...rows] = env.ss.getSheetByName(tab).getDataRange().getValues();
  return rows.map((r: unknown[]) => Object.fromEntries(head.map((h: unknown, i: number) => [String(h), r[i]]))).find((r: any) => r.Title === title);
}

test('a series waits while the sheet runs version 6, and arrives after the script update', async () => {
  await connect('https://script.google.com/macros/s/T/exec', secret);
  const it = await store.items.create({ categoryUid: 'default-fiction', title: 'Cully Hill AI', series: 'Cully Hill' });
  await syncNow();
  assert.equal(row('Fiction books', 'Cully Hill AI')?.Series, undefined, 'version 6 has no Series column');
  assert.match((await unsyncedFields()).get(it.uid) ?? '', /\bseries\b/, 'not counted as sent: the sheet had nowhere to put it');

  env = makeEnv({ on: env }); // the new script pasted into the same sheet
  await syncNow();
  assert.equal(row('Fiction books', 'Cully Hill AI')?.Series, 'Cully Hill');
  assert.equal((await unsyncedFields()).has(it.uid), false, 'sent now');
});

test('a series an earlier app counted as sent is sent again, once, after the update', async () => {
  // Start over on an old sheet, with what an earlier app did: the series marked as sent.
  env = makeEnv({ source: version6() });
  env.ctx.setup();
  env.ctx.showConnectionCode();
  await connect('https://script.google.com/macros/s/T/exec', String(env.ctx.lastLog).split('\n')[1]);
  const it = await store.items.create({ categoryUid: 'default-fiction', title: 'Lost Series Book', series: 'Lost' });
  await syncNow();
  await (await getDb()).runAsync(`UPDATE items SET unsynced = '' WHERE uid = ?`, it.uid);

  env = makeEnv({ on: env });
  await syncNow();
  assert.equal(row('Fiction books', 'Lost Series Book')?.Series, 'Lost');
  const changed = String(row('Fiction books', 'Lost Series Book')?.Changed);
  await syncNow();
  assert.equal(String(row('Fiction books', 'Lost Series Book')?.Changed), changed, 'only once: the next sync leaves it alone');
});
