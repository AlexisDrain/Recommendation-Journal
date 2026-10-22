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
 *   - one tab per category ("Movie", "Fiction book", "Flash game"…), in the app's order; renaming,
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
const SCRIPT_VERSION = 1;

const CATEGORIES_TAB = 'Categories';
const DELETED_TAB = 'Deleted';
const UPDATED = 'Updated';
// "Changed": when this script or a hand edit last wrote the row (hidden). The app asks for rows
// changed since its last sync by this, so it never misses an edit another device sent late.
const CHANGED = 'Changed';
const CAT_COLS = ['Id', 'Name', 'One is called', 'On your list', 'Done', 'Order', 'Hidden', 'Deleted', UPDATED];
const ITEM_COLS = ['Title', 'Status', 'Rating', 'Recommended by', 'Why', 'Recommended on', 'Experienced on', 'Id', UPDATED, CHANGED];
const ITEM_WIDTHS = [260, 130, 130, 160, 320, 120, 120, 130, 160, 160];
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
 */
function sync_(ss, req) {
  const props = PropertiesService.getScriptProperties();
  const cats = readCategories_(ss);
  const aliases = mergeCategories_(cats, req.categories || []);
  adoptNewTabs_(ss, cats, props);
  const tabs = ensureTabs_(ss, cats, props);
  const written = applyItems_(ss, tabs, deadTabs_(ss, cats, props), req.items || [], aliases);
  removeDeletedTabs_(ss, cats, props);
  writeCategories_(ss, cats);
  orderTabs_(ss, cats, tabs);
  removeEmptyDefaultSheet_(ss);

  const out = { ok: true, written: written, aliases: aliases, categories: cats, sheet: ss.getName(), url: ss.getUrl(), version: SCRIPT_VERSION };
  if (req.pull) {
    const pulled = pull_(ss, tabs, String(req.since || ''));
    out.items = pulled.items;
    out.deleted = pulled.deleted;
    out.now = pulled.now;
  }
  return out;
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

function readCategories_(ss) {
  const sh = ss.getSheetByName(CATEGORIES_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  const cats = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, CAT_COLS.length).getValues().forEach(function (r) {
    const c = category_(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]);
    if (!c) return;
    if (!c.id) { // a row typed in by hand: give it an id so it can sync
      c.id = newId_();
      c.updated = nowIso_();
    }
    cats.push(c);
  });
  return cats;
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

/** A tab you added by hand with a "Title" header becomes a category (the app fills in its words). */
function adoptNewTabs_(ss, cats, props) {
  const claimed = {};
  cats.forEach(function (c) {
    claimed['name:' + c.name] = true;
    const id = props.getProperty('TAB_' + c.id);
    if (id) claimed['id:' + id] = true;
  });
  let order = cats.reduce(function (m, c) { return Math.max(m, c.order); }, 0);
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (name === CATEGORIES_TAB || name === DELETED_TAB || claimed['id:' + sh.getSheetId()] || claimed['name:' + name]) return;
    if (!sh.getLastColumn() || headers_(sh).indexOf('Title') < 0) return;
    cats.push({ id: newId_(), name: name, noun: '', want: '', done: '', order: ++order, hidden: false, deleted: false, updated: nowIso_() });
  });
}

/**
 * Finds (or creates) the tab of every category that isn't deleted, keeping tab and category
 * names in step: a name changed in the app renames the tab, and a tab renamed by hand renames
 * the category. Returns { categoryId: sheet }.
 */
function ensureTabs_(ss, cats, props) {
  const tabs = {};
  cats.forEach(function (c) {
    if (c.deleted) return;
    let sh = sheetById_(ss, props.getProperty('TAB_' + c.id)) || ss.getSheetByName(c.name);
    if (!sh) sh = newItemSheet_(ss, uniqueName_(ss, c.name));
    const known = props.getProperty('TABNAME_' + c.id);
    if (known && sh.getName() !== known && sh.getName() !== c.name) {
      c.name = sh.getName(); // renamed by hand in the sheet
      c.updated = nowIso_();
    } else if (sh.getName() !== c.name && !ss.getSheetByName(c.name)) {
      sh.setName(c.name);
    }
    props.setProperty('TAB_' + c.id, String(sh.getSheetId()));
    props.setProperty('TABNAME_' + c.id, sh.getName());
    ensureItemColumns_(sh);
    applyChoices_(sh, c, props);
    if (c.hidden && !sh.isSheetHidden()) sh.hideSheet();
    if (!c.hidden && sh.isSheetHidden()) sh.showSheet();
    tabs[c.id] = sh;
  });
  return tabs;
}

/** A deleted category's tab goes away once it's empty (its rows are removed as their deletions arrive). */
function removeDeletedTabs_(ss, cats, props) {
  cats.forEach(function (c) {
    if (!c.deleted) return;
    const sh = sheetById_(ss, props.getProperty('TAB_' + c.id));
    if (!sh) return;
    if (sh.getLastRow() < 2 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
      props.deleteProperty('TAB_' + c.id);
      props.deleteProperty('TABNAME_' + c.id);
    } else if (!sh.isSheetHidden()) {
      sh.hideSheet();
    }
  });
}

function writeCategories_(ss, cats) {
  let sh = ss.getSheetByName(CATEGORIES_TAB);
  const n = CAT_COLS.length;
  if (!sh) {
    sh = ss.insertSheet(CATEGORIES_TAB, ss.getSheets().length);
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
  const sorted = cats.slice().sort(function (a, b) {
    return a.deleted !== b.deleted ? (a.deleted ? 1 : -1) : a.order - b.order;
  });
  const old = sh.getLastRow() - 1;
  if (old > 0) sh.getRange(2, 1, old, n).clearContent();
  if (!sorted.length) return;
  ensureRows_(sh, sorted.length + 1);
  sh.getRange(2, 1, sorted.length, n).setValues(sorted.map(function (c) {
    return [c.id, c.name, c.noun, c.want, c.done, String(c.order), c.hidden ? 'yes' : '', c.deleted ? 'yes' : '', c.updated];
  }));
}

/** Visible category tabs first, in the app's order, then Categories. */
function orderTabs_(ss, cats, tabs) {
  const wanted = cats
    .filter(function (c) { return !c.deleted && !c.hidden && tabs[c.id]; })
    .sort(function (a, b) { return a.order - b.order; })
    .map(function (c) { return tabs[c.id]; });
  const list = ss.getSheetByName(CATEGORIES_TAB);
  if (list) wanted.push(list);
  const active = ss.getActiveSheet();
  let moved = false;
  wanted.forEach(function (sh, i) {
    if (sh.getIndex() !== i + 1) {
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(i + 1);
      moved = true;
    }
  });
  if (moved && active && !active.isSheetHidden()) ss.setActiveSheet(active);
}

/** Status and Rating get drop-down lists (typing something else is still allowed). */
function applyChoices_(sh, c, props) {
  const key = 'CHOICES_' + sh.getSheetId();
  const want = c.want || 'Want to experience';
  const done = c.done || 'Experienced';
  const wanted = JSON.stringify([want, done, RATINGS]);
  if (props.getProperty(key) === wanted) return;
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
  props.setProperty(key, wanted);
}

// ---------- recommendations ----------

/** The tabs of deleted categories that are still there (their rows can still be removed). */
function deadTabs_(ss, cats, props) {
  const dead = [];
  cats.forEach(function (c) {
    const sh = c.deleted && sheetById_(ss, props.getProperty('TAB_' + c.id));
    if (sh) dead.push(sh);
  });
  return dead;
}

/** App → sheet. Returns how many rows were written or removed. */
function applyItems_(ss, tabs, dead, items, aliases) {
  if (!items.length) return 0;
  const tables = {};
  const load = function (sh) {
    const id = sh.getSheetId();
    if (!tables[id]) {
      const headers = headers_(sh);
      const col = {};
      headers.forEach(function (h, i) { col[h] = i; });
      const rows = sh.getLastRow() - 1;
      tables[id] = {
        sh: sh, headers: headers, col: col, oldRows: Math.max(rows, 0),
        data: rows > 0 ? sh.getRange(2, 1, rows, headers.length).getValues() : [],
        remove: {}, dirty: false,
      };
    }
    return tables[id];
  };
  const where = {};
  Object.keys(tabs).map(function (catId) { return tabs[catId]; }).concat(dead).forEach(function (sh) {
    const t = load(sh);
    t.data.forEach(function (row, i) {
      const id = String(row[t.col.Id] || '').trim();
      if (id) where[id] = { t: t, i: i };
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
    const t = load(target);
    let row;
    if (at && at.t === t && !at.t.remove[at.i]) {
      row = t.data[at.i];
    } else {
      if (at) { // moved to another category: the row moves to that tab
        at.t.remove[at.i] = true;
        at.t.dirty = true;
      }
      row = t.headers.map(function () { return ''; });
      t.data.push(row);
      where[it.id] = { t: t, i: t.data.length - 1 };
    }
    Object.keys(it.values || {}).forEach(function (h) {
      if (t.col[h] !== undefined) row[t.col[h]] = it.values[h] === null || it.values[h] === undefined ? '' : String(it.values[h]);
    });
    row[t.col.Id] = it.id;
    row[t.col[UPDATED]] = it.updated;
    row[t.col[CHANGED]] = now;
    t.dirty = true;
    written++;
  });

  Object.keys(tables).forEach(function (id) {
    const t = tables[id];
    if (!t.dirty) return;
    const data = t.data.filter(function (_, i) { return !t.remove[i]; });
    if (t.oldRows > 0) t.sh.getRange(2, 1, t.oldRows, t.headers.length).clearContent();
    if (data.length) {
      ensureRows_(t.sh, data.length + 1);
      t.sh.getRange(2, 1, data.length, t.headers.length).setValues(data);
    }
  });
  if (log.length) {
    const sh = deletedSheet_(ss);
    ensureRows_(sh, sh.getLastRow() + log.length);
    sh.getRange(sh.getLastRow() + 1, 1, log.length, 3).setValues(log);
  }
  return written;
}

/**
 * Sheet → app: every row changed since `since` (by the hidden "Changed" column), as the text you
 * see in the sheet, plus the deletions logged since then.
 */
function pull_(ss, tabs, since) {
  const now = nowIso_();
  const items = [];
  Object.keys(tabs).forEach(function (catId) {
    const sh = tabs[catId];
    if (sh.getLastRow() < 2) return;
    const headers = headers_(sh);
    const col = {};
    headers.forEach(function (h, i) { col[h] = i; });
    const range = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length);
    const shown = range.getDisplayValues();
    let fixed = false;
    shown.forEach(function (row) {
      if (!String(row[col.Title] || '').trim()) return;
      if (!String(row[col.Id] || '').trim()) { // a row typed in by hand: give it an id so it can sync
        row[col.Id] = newId_();
        row[col[UPDATED]] = now;
        row[col[CHANGED]] = now;
        fixed = true;
      }
      const changed = toIsoTime_(row[col[CHANGED]]) || now;
      if (changed < since) return;
      const cells = {};
      headers.forEach(function (h, i) { if (h) cells[h] = row[i]; });
      items.push({ id: row[col.Id], category: catId, updated: toIsoTime_(row[col[UPDATED]]) || now, cells: cells });
    });
    if (fixed) {
      const ids = shown.map(function (r) { return [r[col.Id], r[col[UPDATED]], r[col[CHANGED]]]; });
      // Id, Updated and Changed are next to each other (ensureItemColumns_ adds them together).
      if (col[UPDATED] === col.Id + 1 && col[CHANGED] === col.Id + 2) sh.getRange(2, col.Id + 1, ids.length, 3).setValues(ids);
      else {
        [col.Id, col[UPDATED], col[CHANGED]].forEach(function (c, k) {
          sh.getRange(2, c + 1, ids.length, 1).setValues(ids.map(function (r) { return [r[k]]; }));
        });
      }
    }
  });
  const deleted = [];
  const log = ss.getSheetByName(DELETED_TAB);
  if (log && log.getLastRow() > 1) {
    log.getRange(2, 1, log.getLastRow() - 1, 3).getDisplayValues().forEach(function (r) {
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
}

// ---------- sheet layout ----------

function newItemSheet_(ss, name) {
  const sh = ss.insertSheet(name, ss.getSheets().length);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  return sh;
}

/** Adds any missing columns at the end (your own columns stay where they are), as plain text. */
function ensureItemColumns_(sh) {
  const headers = sh.getLastColumn() ? headers_(sh) : [];
  ITEM_COLS.forEach(function (h, i) {
    if (headers.indexOf(h) >= 0) return;
    const at = headers.length + 1;
    if (sh.getMaxColumns() < at) sh.insertColumnsAfter(sh.getMaxColumns(), at - sh.getMaxColumns());
    headers[at - 1] = h;
    const system = h === 'Id' || h === UPDATED || h === CHANGED;
    sh.getRange(1, at).setValue(h).setFontWeight('bold').setBackground(system ? SYSTEM_COLOR : HEADER_COLOR);
    const body = sh.getRange(2, at, Math.max(sh.getMaxRows() - 1, 1), 1);
    body.setNumberFormat('@'); // text: stops Sheets turning dates and "1/2" into something else
    if (system) body.setFontColor('#888888');
    else body.setWrap(h === 'Why');
    sh.setColumnWidth(at, ITEM_WIDTHS[i]);
    if (h === 'Id') sh.getRange(1, at).setNote('Leave Id, Updated and Changed alone: the app uses them to keep this sheet and your devices in step.');
    if (h === CHANGED) sh.hideColumns(at);
  });
}

function headers_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
}

function deletedSheet_(ss) {
  let sh = ss.getSheetByName(DELETED_TAB);
  if (!sh) {
    sh = ss.insertSheet(DELETED_TAB, ss.getSheets().length);
    sh.getRange(1, 1, 1, 3).setValues([['Id', 'Deleted at', 'Logged']]).setFontWeight('bold');
    sh.getRange(1, 1).setNote('Recommendations deleted in the app, so your other devices delete them too. Safe to ignore.');
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 3).setNumberFormat('@');
    sh.hideSheet();
  }
  return sh;
}

function sheetById_(ss, id) {
  if (!id) return null;
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (String(all[i].getSheetId()) === String(id)) return all[i];
  return null;
}

/** Tab names must be unique: "Poem", then "Poem (2)"… */
function uniqueName_(ss, name) {
  let n = name;
  for (let i = 2; ss.getSheetByName(n); i++) n = name + ' (' + i + ')';
  return n;
}

function ensureRows_(sh, rows) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
}

/** A brand-new spreadsheet starts with an empty "Sheet1"; drop it once category tabs exist. */
function removeEmptyDefaultSheet_(ss) {
  const s = ss.getSheetByName('Sheet1');
  if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
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
