/**
 * @OnlyCurrentDoc
 *
 * The line above limits this script to the one spreadsheet it lives in. Google then asks only for
 * "View and manage spreadsheets that this application has been installed in": no access to your
 * other files or to Google Drive.
 */

/**
 * Recommendation Journal ↔ Google Sheets sync.
 *
 * Paste this into Extensions → Apps Script of your own (private) spreadsheet, then follow
 * google-sheets/README.md. The app talks to it over HTTPS POST with a secret key, so the app
 * never needs your Google login and the sheet never has to be shared.
 *
 * What it does with your sheet:
 *   - one tab per category ("Movies", "Fiction books", "Flash games"…), in the app's order; renaming,
 *     hiding or deleting a category in the app does the same to its tab
 *   - a "Categories" tab with the list of categories and their words ("Want to watch" / "Watched")
 *   - adds new recommendations and updates changed ones; the newest version wins (the "Updated" column)
 *   - when you edit a cell by hand, stamps that row's "Updated" so the app picks up your edit;
 *     a row you type in yourself (just a Title is enough) is picked up too
 *   - a tab you add yourself with a "Title" header becomes a new category in the app
 *   - leaves any extra columns you add alone
 *   - removes a row when you delete that recommendation in the app, and notes it in a hidden
 *     "Deleted" tab so your other devices delete it too
 *   - makes no backup copies of its own: Google Sheets already keeps every earlier version
 *     (File → Version history), and that needs no extra permissions
 */

/**
 * Bump this whenever the script changes in a way the app should know about. The app compares it
 * with the version it was built for and tells the user when their sheet's script is out of date.
 */
const SCRIPT_VERSION = 6;

const CATEGORIES_TAB = 'Categories';
const DELETED_TAB = 'Deleted';
const UPDATED = 'Updated';
// "Changed": when this script or a hand edit last wrote the row (hidden). The app asks for rows
// changed since its last sync by this, so it never misses an edit another device sent late.
const CHANGED = 'Changed';
// "List order": your own order in the app ("My order"; higher comes first). Hidden, like Changed.
const ORDER = 'List order';
const CAT_COLS = ['Id', 'Name', 'One is called', 'On your list', 'Done', 'Order', 'Hidden', 'Deleted', UPDATED];
const ITEM_COLS = ['Title', 'Author', 'Status', 'Priority', 'Rating', 'Recommended by', 'Why', 'Recommended on', 'Experienced on', 'Id', UPDATED, CHANGED, ORDER];
const ITEM_WIDTHS = [260, 180, 130, 70, 130, 160, 320, 120, 120, 130, 160, 160, 90];
const RATINGS = ['❌ Bad', '✅ Average', '👍 Great', '❤️ Exceptional'];
const HEADER_COLOR = '#c9cdf5';
const SYSTEM_COLOR = '#e4e6f2'; // Id / Updated: the app's bookkeeping

// ---------- one-time setup (run these from the editor) ----------

/**
 * Step 1: creates the secret key the app will use. Safe to run again (keeps the existing key).
 * A key only counts for the spreadsheet it was made in, so a copy of this sheet (for example one
 * made from a shared template) always gets a brand-new key here and never inherits someone else's.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!keyBelongsHere_(props)) {
    props.setProperty('SECRET', newKey_());
    props.setProperty('SECRET_FOR', SpreadsheetApp.getActiveSpreadsheet().getId());
  }
  Logger.log('Secret key is ready. Next: Deploy → New deployment → Web app, then run showConnectionCode.');
}

/**
 * After deploying: prints your secret key. Keep it private.
 * The app asks for two things: this key, and your Web app URL. Only the Deploy dialog can show
 * the URL (run from the editor, a script only sees its "/dev" test address, which the app can't use).
 */
function showConnectionCode() {
  Logger.log(
    'SECRET KEY (paste into "Secret key" in the app):\n' + secret_() + '\n\n' +
    'WEB APP URL (paste into "Web app URL" in the app):\n' +
    'Deploy → Manage deployments → copy the Web app URL. It ends in /exec.'
  );
}

/** If the code ever leaks: makes a new key. The old code stops working; paste the new one into the app. */
function rotateSecret() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SECRET', newKey_());
  props.setProperty('SECRET_FOR', SpreadsheetApp.getActiveSpreadsheet().getId());
  showConnectionCode();
}

// ---------- web app ----------

function doGet() {
  return ContentService.createTextOutput('Recommendation Journal sync is running.');
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request' });
  }
  if (!secretMatches_(req.secret)) return json_({ ok: false, error: 'Wrong connection code' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // one sync at a time
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // url: this spreadsheet's own address, for the app's "Open sheet" button. Opening it still needs your Google login.
    if (req.action === 'ping') return json_({ ok: true, sheet: ss.getName(), url: ss.getUrl(), version: SCRIPT_VERSION });
    if (req.action === 'sync') return json_(sync_(ss, req));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- sync ----------

/**
 * One round trip: the app sends its categories and the recommendations it changed, and (on the
 * last request of a sync, `pull`) gets back the categories and every row changed since `since`.
 *
 * req.categories: [{ id, name, noun, want, done, order, hidden, deleted, updated }]
 * req.items:      [{ id, category, deleted, updated, values: { 'Title': …, 'Status': …, … } }]
 *
 * The answer's `aliases` maps a category id from the app to the sheet's own id for the same name
 * (a "Podcast" category made on two devices before they first synced becomes one).
 *
 * Every call into Google Sheets takes time, so a sync reads what it needs once (see context_),
 * remembers what it already set up (columns, drop-downs, tab order) and only redoes it when
 * something changed, and only reads the tabs that changed since the app's last sync.
 */
function sync_(ss, req) {
  const ctx = context_(ss);
  const read = readCategories_(ctx);
  const cats = read.cats;
  const aliases = mergeCategories_(cats, req.categories || []);
  adoptNewTabs_(ctx, cats);
  const tabs = ensureTabs_(ctx, cats);
  const written = applyItems_(ctx, tabs, deadTabs_(ctx, cats), req.items || [], aliases);
  removeDeletedTabs_(ctx, cats);
  if (JSON.stringify(categoryRows_(cats)) !== read.sig) writeCategories_(ctx, cats);
  orderTabs_(ctx, cats, tabs);
  removeEmptyDefaultSheet_(ctx);

  const out = { ok: true, written: written, aliases: aliases, categories: cats, sheet: ss.getName(), url: ss.getUrl(), version: SCRIPT_VERSION };
  if (req.pull) {
    const pulled = pull_(ctx, tabs, String(req.since || ''), !!req.full);
    out.items = pulled.items;
    out.deleted = pulled.deleted;
    out.now = pulled.now;
  }
  saveProps_(ctx);
  return out;
}

/**
 * What a sync knows about the spreadsheet, read once: its tabs (with their ids and names) and the
 * script's saved notes (which tab belongs to which category, what was already set up). Notes
 * changed during the sync are saved together at the end.
 */
function context_(ss) {
  const store = PropertiesService.getScriptProperties();
  return {
    ss: ss,
    store: store,
    props: store.getProperties(),
    changed: {},
    sheets: ss.getSheets().map(function (sh) { return { sh: sh, id: String(sh.getSheetId()), name: sh.getName() }; }),
  };
}

function prop_(ctx, key) {
  return ctx.props[key] === undefined ? null : ctx.props[key];
}

function setProp_(ctx, key, value) {
  value = String(value);
  if (ctx.props[key] === value) return;
  ctx.props[key] = value;
  ctx.changed[key] = value;
}

function deleteProp_(ctx, key) {
  if (ctx.props[key] === undefined) return;
  delete ctx.props[key];
  delete ctx.changed[key];
  ctx.store.deleteProperty(key);
}

function saveProps_(ctx) {
  if (Object.keys(ctx.changed).length) ctx.store.setProperties(ctx.changed);
}

function tabById_(ctx, id) {
  return id ? ctx.sheets.filter(function (t) { return t.id === String(id); })[0] || null : null;
}

function tabByName_(ctx, name) {
  return ctx.sheets.filter(function (t) { return t.name === name; })[0] || null;
}

function insertTab_(ctx, name) {
  const sh = ctx.ss.insertSheet(name, ctx.sheets.length);
  const t = { sh: sh, id: String(sh.getSheetId()), name: name };
  ctx.sheets.push(t);
  return t;
}

// ---------- categories ----------

/** One cleaned-up category, or null if it has no name. */
function category_(id, name, noun, want, done, order, hidden, deleted, updated) {
  name = String(name || '').trim();
  if (!name) return null;
  return {
    id: String(id || '').trim(),
    name: name,
    noun: String(noun || '').trim(),
    want: String(want || '').trim(),
    done: String(done || '').trim(),
    order: Number(order) || 0,
    hidden: yes_(hidden),
    deleted: yes_(deleted),
    updated: toIsoTime_(updated),
  };
}

/** The Categories tab's rows, and how they looked (so it's only rewritten when something changed). */
function readCategories_(ctx) {
  const t = tabByName_(ctx, CATEGORIES_TAB);
  if (!t) return { cats: [], sig: '' };
  const values = t.sh.getDataRange().getDisplayValues().slice(1)
    .filter(function (r) { return r.some(function (v) { return v !== ''; }); })
    .map(function (r) { return r.slice(0, CAT_COLS.length); });
  const cats = [];
  values.forEach(function (r) {
    const c = category_(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]);
    if (!c) return;
    if (!c.id) { // a row typed in by hand: give it an id so it can sync
      c.id = newId_();
      c.updated = nowIso_();
    }
    cats.push(c);
  });
  return { cats: cats, sig: JSON.stringify(values) };
}

/** The app's categories → this list. Per category, the newest edit wins. Returns the aliases. */
function mergeCategories_(cats, incoming) {
  const byId = {};
  const aliases = {};
  cats.forEach(function (c) { byId[c.id] = c; });
  incoming.forEach(function (raw) {
    const c = category_(raw.id, raw.name, raw.noun, raw.want, raw.done, raw.order, raw.hidden, raw.deleted, raw.updated);
    if (!c || !c.id) return;
    if (byId[c.id]) {
      if (c.updated > byId[c.id].updated) Object.assign(byId[c.id], c);
      return;
    }
    if (!c.deleted) {
      const twin = cats.filter(function (o) { return !o.deleted && norm_(o.name) === norm_(c.name); })[0];
      if (twin) {
        aliases[c.id] = twin.id;
        return;
      }
    }
    cats.push(c);
    byId[c.id] = c;
  });
  return aliases;
}

/**
 * A tab you added by hand with a "Title" header becomes a category (the app fills in its words).
 * A tab that isn't one is remembered by its width, so it's only looked at again when that changes.
 */
function adoptNewTabs_(ctx, cats) {
  const claimed = {};
  cats.forEach(function (c) {
    claimed['name:' + c.name] = true;
    const id = prop_(ctx, 'TAB_' + c.id);
    if (id) claimed['id:' + id] = true;
  });
  let order = cats.reduce(function (m, c) { return Math.max(m, c.order); }, 0);
  ctx.sheets.forEach(function (t) {
    if (t.name === CATEGORIES_TAB || t.name === DELETED_TAB || claimed['id:' + t.id] || claimed['name:' + t.name]) return;
    const width = t.sh.getLastColumn();
    if (prop_(ctx, 'NOTCAT_' + t.id) === String(width)) return;
    if (!width || headers_(t.sh).indexOf('Title') < 0) {
      setProp_(ctx, 'NOTCAT_' + t.id, width);
      return;
    }
    cats.push({ id: newId_(), name: t.name, noun: '', want: '', done: '', order: ++order, hidden: false, deleted: false, updated: nowIso_() });
  });
}

/**
 * Finds (or creates) the tab of every category that isn't deleted, keeping tab and category
 * names in step: a name changed in the app renames the tab, and a tab renamed by hand renames
 * the category. Returns { categoryId: tab }.
 */
function ensureTabs_(ctx, cats) {
  const tabs = {};
  cats.forEach(function (c) {
    if (c.deleted) return;
    let t = tabById_(ctx, prop_(ctx, 'TAB_' + c.id)) || tabByName_(ctx, c.name);
    if (!t) t = newItemTab_(ctx, uniqueName_(ctx, c.name));
    const known = prop_(ctx, 'TABNAME_' + c.id);
    if (known && t.name !== known && t.name !== c.name) {
      c.name = t.name; // renamed by hand in the sheet
      c.updated = nowIso_();
    } else if (t.name !== c.name && !tabByName_(ctx, c.name)) {
      t.sh.setName(c.name);
      t.name = c.name;
    }
    setProp_(ctx, 'TAB_' + c.id, t.id);
    setProp_(ctx, 'TABNAME_' + c.id, t.name);
    // Columns, drop-downs and hiding: only when the category's words or "hidden" changed.
    const layout = JSON.stringify([6, c.want, c.done, c.hidden]);
    if (prop_(ctx, 'LAYOUT_' + t.id) !== layout) {
      ensureItemColumns_(t.sh);
      applyChoices_(t.sh, c);
      if (c.hidden && !t.sh.isSheetHidden()) t.sh.hideSheet();
      if (!c.hidden && t.sh.isSheetHidden()) t.sh.showSheet();
      setProp_(ctx, 'LAYOUT_' + t.id, layout);
    }
    tabs[c.id] = t;
  });
  return tabs;
}

/** A deleted category's tab goes away once it's empty (its rows are removed as their deletions arrive). */
function removeDeletedTabs_(ctx, cats) {
  cats.forEach(function (c) {
    if (!c.deleted) return;
    const t = tabById_(ctx, prop_(ctx, 'TAB_' + c.id));
    if (!t) return;
    if (t.sh.getLastRow() < 2 && ctx.sheets.length > 1) {
      ctx.ss.deleteSheet(t.sh);
      ctx.sheets = ctx.sheets.filter(function (x) { return x !== t; });
      deleteProp_(ctx, 'TAB_' + c.id);
      deleteProp_(ctx, 'TABNAME_' + c.id);
    } else if (!t.sh.isSheetHidden()) {
      t.sh.hideSheet();
    }
  });
}

function categoryRows_(cats) {
  return cats.slice().sort(function (a, b) {
    return a.deleted !== b.deleted ? (a.deleted ? 1 : -1) : a.order - b.order;
  }).map(function (c) {
    return [c.id, c.name, c.noun, c.want, c.done, String(c.order), c.hidden ? 'yes' : '', c.deleted ? 'yes' : '', c.updated];
  });
}

function writeCategories_(ctx, cats) {
  let t = tabByName_(ctx, CATEGORIES_TAB);
  const n = CAT_COLS.length;
  if (!t) {
    t = insertTab_(ctx, CATEGORIES_TAB);
    const sh = t.sh;
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, n).setValues([CAT_COLS]).setFontWeight('bold').setBackground(HEADER_COLOR);
    sh.getRange(1, 1).setNote(
      'Your categories, kept in step with the Recommendation Journal app on every device. ' +
      'It is easiest to change them in the app (Settings → Categories). Do not change the Id column.'
    );
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), n).setNumberFormat('@'); // plain text
    sh.setColumnWidth(2, 180);
    sh.setColumnWidths(3, 3, 140);
    sh.setColumnWidth(9, 160);
  }
  const rows = categoryRows_(cats);
  const old = t.sh.getLastRow() - 1;
  if (old > 0) t.sh.getRange(2, 1, old, n).clearContent();
  if (!rows.length) return;
  ensureRows_(t.sh, rows.length + 1);
  t.sh.getRange(2, 1, rows.length, n).setValues(rows);
}

/** Visible category tabs first, in the app's order, then Categories. Only when that order changed. */
function orderTabs_(ctx, cats, tabs) {
  const wanted = cats
    .filter(function (c) { return !c.deleted && !c.hidden && tabs[c.id]; })
    .sort(function (a, b) { return a.order - b.order; })
    .map(function (c) { return tabs[c.id]; });
  const list = tabByName_(ctx, CATEGORIES_TAB);
  if (list) wanted.push(list);
  const sig = wanted.map(function (t) { return t.id; }).join(',');
  if (prop_(ctx, 'TAB_ORDER') === sig) return;
  const active = ctx.ss.getActiveSheet();
  let moved = false;
  wanted.forEach(function (t, i) {
    if (t.sh.getIndex() !== i + 1) {
      ctx.ss.setActiveSheet(t.sh);
      ctx.ss.moveActiveSheet(i + 1);
      moved = true;
    }
  });
  if (moved && active && !active.isSheetHidden()) ctx.ss.setActiveSheet(active);
  setProp_(ctx, 'TAB_ORDER', sig);
}

/** Status and Rating get drop-down lists (typing something else is still allowed). */
function applyChoices_(sh, c) {
  const want = c.want || 'Want to experience';
  const done = c.done || 'Experienced';
  const headers = headers_(sh);
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  const status = headers.indexOf('Status') + 1;
  const rating = headers.indexOf('Rating') + 1;
  if (status) {
    sh.getRange(2, status, rows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList([want, done], true).setAllowInvalid(true).build());
  }
  if (rating) {
    sh.getRange(2, rating, rows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(RATINGS, true).setAllowInvalid(true).build());
  }
}

// ---------- recommendations ----------

/** The tabs of deleted categories that are still there (their rows can still be removed). */
function deadTabs_(ctx, cats) {
  const dead = [];
  cats.forEach(function (c) {
    const t = c.deleted && tabById_(ctx, prop_(ctx, 'TAB_' + c.id));
    if (t) dead.push(t);
  });
  return dead;
}

/**
 * A tab in one read: { headers, col: { header: index }, data: [rows below the header] }.
 * `shown`: the text as you see it, instead of the stored values. Puts back any missing columns.
 */
function readTab_(t, shown) {
  const get = function () { return shown ? t.sh.getDataRange().getDisplayValues() : t.sh.getDataRange().getValues(); };
  let all = get();
  let headers = (all[0] || []).map(function (h) { return String(h).trim(); });
  if (ITEM_COLS.some(function (h) { return headers.indexOf(h) < 0; })) {
    ensureItemColumns_(t.sh);
    all = get();
    headers = all[0].map(function (h) { return String(h).trim(); });
  }
  const col = {};
  headers.forEach(function (h, i) { if (col[h] === undefined) col[h] = i; });
  return { headers: headers, col: col, data: all.slice(1) };
}

const isBlank_ = function (row) { return row.every(function (v) { return v === ''; }); };

/** App → sheet. Returns how many rows were written or removed. */
function applyItems_(ctx, tabs, dead, items, aliases) {
  if (!items.length) return 0;
  const tables = {};
  const load = function (t) {
    if (!tables[t.id]) {
      const r = readTab_(t, false);
      tables[t.id] = { t: t, headers: r.headers, col: r.col, data: r.data, oldRows: r.data.length, remove: {}, dirty: false };
    }
    return tables[t.id];
  };
  const where = {};
  Object.keys(tabs).map(function (catId) { return tabs[catId]; }).concat(dead).forEach(function (t) {
    const tb = load(t);
    tb.data.forEach(function (row, i) {
      const id = String(row[tb.col.Id] || '').trim();
      if (id) where[id] = { t: tb, i: i };
    });
  });

  const now = nowIso_();
  const log = [];
  let written = 0;
  items.forEach(function (it) {
    const at = where[it.id];
    if (at && !at.t.remove[at.i] && toIsoTime_(at.t.data[at.i][at.t.col[UPDATED]]) >= it.updated) return; // the sheet's is as new or newer
    if (it.deleted) {
      if (at) {
        at.t.remove[at.i] = true;
        at.t.dirty = true;
      }
      log.push([it.id, it.updated, now]);
      written++;
      return;
    }
    const target = tabs[aliases[it.category] || it.category];
    if (!target) return; // its category was deleted
    const tb = load(target);
    let row;
    if (at && at.t === tb && !at.t.remove[at.i]) {
      row = tb.data[at.i];
    } else {
      if (at) { // moved to another category: the row moves to that tab
        at.t.remove[at.i] = true;
        at.t.dirty = true;
      }
      row = tb.headers.map(function () { return ''; });
      tb.data.push(row);
      where[it.id] = { t: tb, i: tb.data.length - 1 };
    }
    Object.keys(it.values || {}).forEach(function (h) {
      if (tb.col[h] !== undefined) row[tb.col[h]] = it.values[h] === null || it.values[h] === undefined ? '' : String(it.values[h]);
    });
    row[tb.col.Id] = it.id;
    row[tb.col[UPDATED]] = it.updated;
    row[tb.col[CHANGED]] = now;
    tb.dirty = true;
    written++;
  });

  Object.keys(tables).forEach(function (id) {
    const tb = tables[id];
    if (!tb.dirty) return;
    const data = tb.data.filter(function (row, i) { return !tb.remove[i] && !isBlank_(row); });
    if (tb.oldRows > 0) tb.t.sh.getRange(2, 1, tb.oldRows, tb.headers.length).clearContent();
    if (data.length) {
      ensureRows_(tb.t.sh, data.length + 1);
      tb.t.sh.getRange(2, 1, data.length, tb.headers.length).setValues(data);
    }
    setProp_(ctx, 'CHANGED_' + id, now);
  });
  if (log.length) {
    const sh = deletedTab_(ctx).sh;
    ensureRows_(sh, sh.getLastRow() + log.length);
    sh.getRange(sh.getLastRow() + 1, 1, log.length, 3).setValues(log);
    setProp_(ctx, 'CHANGED_' + DELETED_TAB, now);
  }
  return written;
}

/**
 * Sheet → app: every row changed since `since` (by the hidden "Changed" column), as the text you
 * see in the sheet, plus the deletions logged since then. A tab nothing has touched since then
 * (the script notes when it, or a hand edit, last changed each tab) isn't read at all, unless the
 * app asks for a `full` look (it does on its first sync after opening, in case a hand edit's note
 * went missing).
 */
function pull_(ctx, tabs, since, full) {
  const now = nowIso_();
  const items = [];
  Object.keys(tabs).forEach(function (catId) {
    const t = tabs[catId];
    const touched = prop_(ctx, 'CHANGED_' + t.id);
    if (!full && touched !== null && touched < since) return;
    const tb = readTab_(t, true);
    const col = tb.col;
    let fixed = false;
    let newest = '';
    tb.data.forEach(function (row) {
      if (!String(row[col.Title] || '').trim()) return;
      if (!String(row[col.Id] || '').trim()) { // a row typed in by hand: give it an id so it can sync
        row[col.Id] = newId_();
        row[col[UPDATED]] = now;
        row[col[CHANGED]] = now;
        fixed = true;
      }
      const changed = toIsoTime_(row[col[CHANGED]]) || now;
      if (changed > newest) newest = changed;
      if (changed < since) return;
      const cells = {};
      tb.headers.forEach(function (h, i) { if (h) cells[h] = row[i]; });
      items.push({ id: row[col.Id], category: catId, updated: toIsoTime_(row[col[UPDATED]]) || now, cells: cells });
    });
    if (fixed && tb.data.length) {
      // tb.data lines up with the sheet's rows 2, 3…, so the three columns go back in one write each.
      [col.Id, col[UPDATED], col[CHANGED]].forEach(function (c) {
        t.sh.getRange(2, c + 1, tb.data.length, 1).setValues(tb.data.map(function (r) { return [r[c]]; }));
      });
    }
    // Remember when this tab last changed, so the next syncs can skip it while nothing happens.
    if (touched === null || newest > touched) setProp_(ctx, 'CHANGED_' + t.id, newest || now);
  });
  const deleted = [];
  const log = tabByName_(ctx, DELETED_TAB);
  const logTouched = prop_(ctx, 'CHANGED_' + DELETED_TAB);
  if (log && (full || logTouched === null || logTouched >= since) && log.sh.getLastRow() > 1) {
    log.sh.getRange(2, 1, log.sh.getLastRow() - 1, 3).getDisplayValues().forEach(function (r) {
      if (r[0] && toIsoTime_(r[2]) >= since) deleted.push({ id: r[0], updated: toIsoTime_(r[1]) });
    });
  }
  return { items: items, deleted: deleted, now: now };
}

// ---------- hand edits ----------

/** Runs when you edit the sheet by hand: marks the edited rows as changed so the app pulls them. */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() === DELETED_TAB || e.range.getRow() < 2) return;
  const headers = headers_(sh);
  const u = headers.indexOf(UPDATED);
  const id = headers.indexOf('Id');
  if (u < 0 || id < 0) return;
  const c = headers.indexOf(CHANGED);
  const first = e.range.getColumn() - 1;
  let real = false; // editing only the bookkeeping columns themselves doesn't count
  for (let i = first; i < first + e.range.getNumColumns(); i++) if (i !== id && i !== u && i !== c) real = true;
  if (!real) return;
  const n = e.range.getNumRows();
  const stamps = [];
  for (let i = 0; i < n; i++) stamps.push([nowIso_()]);
  sh.getRange(e.range.getRow(), u + 1, n, 1).setValues(stamps);
  if (c >= 0) sh.getRange(e.range.getRow(), c + 1, n, 1).setValues(stamps);
  // Tells the next sync this tab has something new (it skips tabs nothing has touched).
  PropertiesService.getScriptProperties().setProperty('CHANGED_' + sh.getSheetId(), stamps[0][0]);
}

// ---------- sheet layout ----------

function newItemTab_(ctx, name) {
  const t = insertTab_(ctx, name);
  t.sh.setFrozenRows(1);
  t.sh.setFrozenColumns(1);
  return t;
}

/** Adds any missing columns at the end (your own columns stay where they are), as plain text. */
function ensureItemColumns_(sh) {
  const headers = sh.getLastColumn() ? headers_(sh) : [];
  // "Priority" was called "Up next" before version 6: rename that column where it is.
  const old = headers.indexOf('Up next');
  if (old >= 0 && headers.indexOf('Priority') < 0) {
    sh.getRange(1, old + 1).setValue('Priority');
    headers[old] = 'Priority';
  }
  ITEM_COLS.forEach(function (h, i) {
    if (headers.indexOf(h) >= 0) return;
    const at = headers.length + 1;
    if (sh.getMaxColumns() < at) sh.insertColumnsAfter(sh.getMaxColumns(), at - sh.getMaxColumns());
    headers[at - 1] = h;
    const system = h === 'Id' || h === UPDATED || h === CHANGED || h === ORDER;
    sh.getRange(1, at).setValue(h).setFontWeight('bold').setBackground(system ? SYSTEM_COLOR : HEADER_COLOR);
    const body = sh.getRange(2, at, Math.max(sh.getMaxRows() - 1, 1), 1);
    body.setNumberFormat('@'); // text: stops Sheets turning dates and "1/2" into something else
    if (system) body.setFontColor('#888888');
    else body.setWrap(h === 'Why');
    sh.setColumnWidth(at, ITEM_WIDTHS[i]);
    if (h === 'Id') sh.getRange(1, at).setNote('Leave Id, Updated and Changed alone: the app uses them to keep this sheet and your devices in step.');
    if (h === CHANGED || h === ORDER) sh.hideColumns(at);
  });
}

function headers_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
}

function deletedTab_(ctx) {
  let t = tabByName_(ctx, DELETED_TAB);
  if (!t) {
    t = insertTab_(ctx, DELETED_TAB);
    const sh = t.sh;
    sh.getRange(1, 1, 1, 3).setValues([['Id', 'Deleted at', 'Logged']]).setFontWeight('bold');
    sh.getRange(1, 1).setNote('Recommendations deleted in the app, so your other devices delete them too. Safe to ignore.');
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 3).setNumberFormat('@');
    sh.hideSheet();
  }
  return t;
}

/** Tab names must be unique: "Poem", then "Poem (2)"… */
function uniqueName_(ctx, name) {
  let n = name;
  for (let i = 2; tabByName_(ctx, n); i++) n = name + ' (' + i + ')';
  return n;
}

function ensureRows_(sh, rows) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
}

/** A brand-new spreadsheet starts with an empty "Sheet1"; drop it once category tabs exist. */
function removeEmptyDefaultSheet_(ctx) {
  const t = tabByName_(ctx, 'Sheet1');
  if (!t || ctx.sheets.length < 2 || t.sh.getLastRow() !== 0) return;
  ctx.ss.deleteSheet(t.sh);
  ctx.sheets = ctx.sheets.filter(function (x) { return x !== t; });
}

// ---------- helpers ----------

/**
 * True when a key exists and was made for this very spreadsheet. A copy of the sheet (made from a
 * template, say) has no key of its own yet and has to run setup.
 */
function keyBelongsHere_(props) {
  if (!props.getProperty('SECRET')) return false;
  return props.getProperty('SECRET_FOR') === SpreadsheetApp.getActiveSpreadsheet().getId();
}

function secret_() {
  const props = PropertiesService.getScriptProperties();
  if (!keyBelongsHere_(props)) throw new Error('Run setup first.');
  return props.getProperty('SECRET');
}

function secretMatches_(given) {
  const props = PropertiesService.getScriptProperties();
  if (!keyBelongsHere_(props)) return false; // a copied sheet must run setup to get its own key
  const expected = props.getProperty('SECRET');
  if (!expected || typeof given !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function newKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function nowIso_() {
  return new Date().toISOString().slice(0, 19) + 'Z';
}

/** An "Updated" cell → "2026-10-21T18:30:00Z" ('' if empty) */
function toIsoTime_(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 19) + 'Z';
  return String(v || '').trim();
}

function yes_(v) {
  return v === true || /^(yes|true|x|✓)$/i.test(String(v || '').trim());
}

/** Lowercase letters and numbers only, for comparing names. */
function norm_(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
