// Two-way sync with your own Google Sheet, through the Apps Script in google-sheets/.
//
// One request does it all: the app sends its categories and the recommendations changed since the
// last sync, and gets back the categories and the rows changed in the sheet since then. Each side
// keeps an "Updated" time per row and the newest version wins, so edits made in the sheet by hand
// (or on another device) come back here. Each category is its own tab in the sheet.
//
// The connection (script URL + secret key) is kept in the device's secure storage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { suggestWords } from '@/lib/categories';
import { stamp } from '@/lib/dates';
import { secureStorage } from '@/lib/secureStorage';
import type { Category } from '@/lib/types';
import { itemCells, mapHeader, rowFields } from './rowFormat';
import { allCategories, allItems, getDb, onLocalChange, reload, writeCategory, writeItem } from './store';
import { transaction } from './transaction';

const CONNECTION_KEY = 'recjournal.sheetConnection';
const STATE_KEY = 'recjournal.sheetSync.v1';
const PUSH_BATCH = 300;
/** The version of google-sheets/RecommendationJournalSync.gs this app was built for (its SCRIPT_VERSION). */
export const LATEST_SCRIPT_VERSION = 3;

export interface Connection { url: string; secret: string }

export interface SyncState {
  sheetName: string | null;
  /** The spreadsheet's address, for "Open sheet". */
  sheetUrl: string | null;
  lastPushed: string; // newest `updatedAt` already sent
  lastPulled: string; // the sheet's clock at the last pull: rows changed since then come next time
  lastSyncAt: string | null;
  lastError: string | null;
  scriptVersion: number;
}
const EMPTY_STATE: SyncState = { sheetName: null, sheetUrl: null, lastPushed: '', lastPulled: '', lastSyncAt: null, lastError: null, scriptVersion: LATEST_SCRIPT_VERSION };

/** "https://script.google.com/macros/s/…/exec#<secret>" → its parts, or null if it isn't one. */
export function parseConnectionCode(code: string): Connection | null {
  const m = code.trim().match(/^(https:\/\/script\.google\.com\/(?:a\/[^/\s]+\/)?macros\/s\/[\w-]+\/exec)#([A-Za-z0-9]{32,})$/);
  return m ? { url: m[1], secret: m[2] } : null;
}

export async function getConnection(): Promise<Connection | null> {
  const code = await secureStorage.get(CONNECTION_KEY);
  return code ? parseConnectionCode(code) : null;
}

export async function getSyncState(): Promise<SyncState> {
  try {
    return { ...EMPTY_STATE, ...JSON.parse((await AsyncStorage.getItem(STATE_KEY)) ?? '{}') };
  } catch {
    return EMPTY_STATE;
  }
}

async function saveState(s: SyncState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s));
}

async function call<T>(conn: Connection, action: string, body: object = {}): Promise<T> {
  let res: Response;
  try {
    // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script requires on the web.
    res = await fetch(conn.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: conn.secret, action, ...body }),
    });
  } catch {
    throw new Error("Can't reach Google. Check your internet connection.");
  }
  const text = await res.text();
  let data: { ok: boolean; error?: string } & T;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Google answered with a web page instead of data. Check the script is deployed as a web app with "Who has access: Anyone".',
    );
  }
  if (!data.ok) throw new Error(data.error ?? 'The sheet refused the request.');
  return data;
}

/**
 * Tidies what was typed or pasted into the two boxes and joins it into a connection code.
 * Forgives the usual slips: spaces and line breaks from copying, a missing "https://", "http://",
 * a "?…" tail on the address, a leading "#" on the key, or the whole "address#key" pasted into
 * the address box. Throws a message saying exactly what's wrong otherwise.
 */
export function tidyConnection(urlInput: string, keyInput: string): string {
  let url = urlInput.replace(/\s+/g, '');
  let key = keyInput.replace(/\s+/g, '').replace(/^#/, '');
  const hash = url.indexOf('#');
  if (hash >= 0) {
    if (!key) key = url.slice(hash + 1);
    url = url.slice(0, hash);
  }
  url = url.replace(/^http:\/\//i, 'https://').replace(/\?.*$/, '').replace(/\/+$/, '');
  if (url && !/^https:\/\//i.test(url)) url = `https://${url}`;

  if (!url) throw new Error('Paste the Web app URL from Deploy → Manage deployments.');
  if (/\/dev$/.test(url)) {
    throw new Error("That address ends in /dev, which is Google's test address. Use the Web app URL from Deploy → Manage deployments: it ends in /exec.");
  }
  if (!/^https:\/\/script\.google\.com\/(?:a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/.test(url)) {
    throw new Error("That doesn't look like a Web app URL. It should look like https://script.google.com/macros/s/…/exec");
  }
  if (!key) throw new Error('Paste the secret key that showConnectionCode printed.');
  if (!/^[A-Za-z0-9]{32,}$/.test(key)) {
    throw new Error("That doesn't look like the secret key. It's the long run of letters and numbers that showConnectionCode printed.");
  }
  return `${url}#${key}`;
}

/** Only ever open a real Google Sheets address, whatever the script answered. */
const sheetAddress = (url: unknown): string | null =>
  typeof url === 'string' && /^https:\/\/docs\.google\.com\/spreadsheets\/[\w\-/?=#&.%]*$/.test(url) ? url : null;

/** Save a connection after checking it works. Returns the spreadsheet's name. */
export async function connect(urlInput: string, keyInput = ''): Promise<string> {
  const code = tidyConnection(urlInput, keyInput);
  const conn = parseConnectionCode(code)!;
  const { sheet, url, version } = await call<{ sheet: string; url?: string; version?: number }>(conn, 'ping');
  await secureStorage.set(CONNECTION_KEY, code);
  await saveState({ ...EMPTY_STATE, sheetName: sheet, sheetUrl: sheetAddress(url), scriptVersion: version ?? 1 }); // a new sheet starts from scratch: send everything
  return sheet;
}

/** Forget the sheet on this device. Nothing is deleted on either side. */
export async function disconnect() {
  await secureStorage.remove(CONNECTION_KEY);
  await AsyncStorage.removeItem(STATE_KEY);
  setStatus({ running: false, error: null });
}

// ---------- what goes over the wire ----------

/** A category as the sheet's "Categories" tab keeps it. */
interface SheetCategory { id: string; name: string; noun: string; want: string; done: string; order: number; hidden: boolean; deleted: boolean; updated: string }
interface SheetItem { id: string; category: string; updated: string; cells: Record<string, string> }
interface SyncAnswer {
  categories: SheetCategory[];
  aliases: Record<string, string>;
  items?: SheetItem[];
  deleted?: { id: string; updated: string }[];
  now?: string;
  sheet?: string;
  url?: string;
  version?: number;
}

const toSheetCategory = (c: Category): SheetCategory => ({
  id: c.uid, name: c.name, noun: c.noun, want: c.wantLabel, done: c.doneLabel, order: c.sortOrder,
  hidden: c.hidden, deleted: c.deleted, updated: c.updatedAt,
});

const pulledListeners = new Set<() => void>();
/** Get told when a sync brought in changes from the sheet. */
export function onPulled(fn: () => void): () => void {
  pulledListeners.add(fn);
  return () => pulledListeners.delete(fn);
}

// ---------- running it ----------

/** Whether a sync is going on right now, and why the last one failed (null once one succeeds). */
export interface SyncStatus { running: boolean; error: string | null }
let status: SyncStatus = { running: false, error: null };
const statusListeners = new Set<() => void>();
function setStatus(next: SyncStatus) {
  status = next;
  statusListeners.forEach((fn) => fn());
}

/** The sync status; the screen redraws when it changes. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (fn) => (statusListeners.add(fn), () => void statusListeners.delete(fn)),
    () => status,
    () => status,
  );
}

type Result = { pushed: number; pulled: number };
let running: Promise<Result> | null = null;
let again = false;
/** The first sync after the app opens asks the sheet to look at every tab (see pull_ in the script). */
let lookedAtEverything = false;

/**
 * Send then receive, in the background: everything is already saved on this device, the sheet
 * just catches up. A call while a sync is running doesn't start a second one at the same time:
 * the running one goes round once more when it's done, so changes made meanwhile go out too.
 */
export function syncNow(): Promise<Result> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setStatus({ running: true, error: status.error });
    try {
      let result = await runSync();
      while (again) {
        again = false;
        const next = await runSync();
        result = { pushed: result.pushed + next.pushed, pulled: result.pulled + next.pulled };
      }
      setStatus({ running: false, error: null });
      return result;
    } catch (e) {
      setStatus({ running: false, error: (e as Error).message });
      throw e;
    } finally {
      running = null;
      again = false;
    }
  })();
  return running;
}

async function runSync() {
  const conn = await getConnection();
  if (!conn) throw new Error('Not connected to a Google Sheet.');
  const state = await getSyncState();
  try {
    const categories = await allCategories();
    const byUid = new Map(categories.map((c) => [c.uid, c]));
    const changed = (await allItems()).filter((i) => i.updatedAt > state.lastPushed);
    const sent = changed.map((i) => ({
      id: i.uid, category: i.categoryUid, deleted: i.deleted, updated: i.updatedAt,
      values: i.deleted ? {} : itemCells(i, byUid.get(i.categoryUid)),
    }));

    // Big first syncs go in batches; the last request also brings back the sheet's changes.
    let answer: SyncAnswer | null = null;
    for (let i = 0; i === 0 || i < sent.length; i += PUSH_BATCH) {
      const last = i + PUSH_BATCH >= sent.length;
      answer = await call<SyncAnswer>(conn, 'sync', {
        categories: categories.map(toSheetCategory),
        items: sent.slice(i, i + PUSH_BATCH),
        since: state.lastPulled,
        pull: last,
        full: !lookedAtEverything,
      });
    }
    const pulled = await applyAnswer(answer!);
    if (changed.length) state.lastPushed = changed.reduce((max, i) => (i.updatedAt > max ? i.updatedAt : max), state.lastPushed);
    if (answer!.now) state.lastPulled = answer!.now;
    state.scriptVersion = answer!.version ?? 1;
    if (answer!.sheet) state.sheetName = answer!.sheet; // the sheet may have been renamed
    state.sheetUrl = sheetAddress(answer!.url) ?? state.sheetUrl;
    await saveState({ ...state, lastSyncAt: new Date().toISOString(), lastError: null });
    lookedAtEverything = true;
    if (pulled) {
      await reload();
      pulledListeners.forEach((fn) => fn());
    }
    return { pushed: changed.length, pulled };
  } catch (e) {
    await saveState({ ...state, lastError: (e as Error).message });
    throw e;
  }
}

/** Takes in what the sheet sent back. Returns how many things changed on this device. */
async function applyAnswer(answer: SyncAnswer): Promise<number> {
  const db = await getDb();
  // Read first: on phones the transaction is exclusive, so only `tx` may be used inside it.
  const local = new Map((await allCategories()).map((c) => [c.uid, c]));
  const items = new Map((await allItems()).map((i) => [i.uid, i]));
  let count = 0;
  await transaction(db, async (tx) => {
    // A category this device made has the same name as one already in the sheet: become that one.
    for (const [mine, theirs] of Object.entries(answer.aliases ?? {})) {
      await tx.runAsync(`UPDATE items SET category_uid = ? WHERE category_uid = ?`, theirs, mine);
      await tx.runAsync(`DELETE FROM categories WHERE uid = ?`, mine);
      local.delete(mine);
      for (const i of items.values()) if (i.categoryUid === mine) i.categoryUid = theirs;
      count++;
    }

    for (const r of answer.categories ?? []) {
      const mine = local.get(r.id);
      if (mine && mine.updatedAt >= r.updated) continue;
      // A tab added by hand in the sheet has no words yet: guess them from its name.
      const guess = suggestWords(r.name);
      const filled = !r.noun || !r.want || !r.done;
      const c = {
        uid: r.id, name: r.name, noun: r.noun || guess.noun, wantLabel: r.want || guess.wantLabel, doneLabel: r.done || guess.doneLabel,
        sortOrder: r.order, hidden: r.hidden, deleted: r.deleted,
        updatedAt: filled ? stamp() : r.updated, // filled in here: send the words back to the sheet
      };
      if (mine && JSON.stringify([mine.name, mine.noun, mine.wantLabel, mine.doneLabel, mine.sortOrder, mine.hidden, mine.deleted])
        === JSON.stringify([c.name, c.noun, c.wantLabel, c.doneLabel, c.sortOrder, c.hidden, c.deleted])) continue;
      await writeCategory(tx, c);
      local.set(c.uid, { id: 0, ...c });
      count++;
    }

    for (const r of answer.items ?? []) {
      const mine = items.get(r.id);
      if (mine && mine.updatedAt >= r.updated) continue; // this device's version is as new or newer
      const header = Object.keys(r.cells);
      const fields = rowFields(mapHeader(header), header.map((h) => r.cells[h]), local.get(r.category), false);
      if (!fields) continue;
      await writeItem(tx, { uid: r.id, categoryUid: r.category, deleted: false, updatedAt: r.updated, ...fields, author: fields.author ?? mine?.author ?? '' });
      count++;
    }
    for (const d of answer.deleted ?? []) {
      const mine = items.get(d.id);
      if (!mine || mine.deleted || mine.updatedAt > d.updated) continue;
      await tx.runAsync(`UPDATE items SET deleted = 1, updated_at = ? WHERE uid = ?`, d.updated, d.id);
      count++;
    }
  });
  return count;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Sync a few seconds from now if a sheet is connected (after changes, on launch). Errors are kept in the state. */
export function requestSync(delayMs = 3000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    if (await getConnection()) syncNow().catch(() => {});
  }, delayMs);
}

// Every change made in the app goes to the sheet a few seconds later.
onLocalChange(() => requestSync());
