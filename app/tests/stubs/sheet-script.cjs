// The Google Sheet script (google-sheets/RecommendationJournalSync.gs) running against a small
// in-memory spreadsheet, so the sync can be tested end to end without Google.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

class Range {
  constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; }
  getDisplayValues() { return this.getValues().map((row) => row.map((v) => (v === '' || v == null ? '' : String(v)))); }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v))); return this; }
  setValue(v) { this.sh.set(this.r, this.c, v); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; }
  setFontWeight() { return this; }
  setFontColor() { return this; }
  setBackground() { return this; }
  setWrap() { return this; }
  setNumberFormat() { return this; }
  setDataValidation() { return this; }
  setNote() { return this; }
  getSheet() { return this.sh; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
  getNumColumns() { return this.nc; }
}

let nextSheetId = 100;
class Sheet {
  constructor(ss, name) { Object.assign(this, { ss, name, id: nextSheetId++, cells: new Map(), hidden: false, maxRows: 1000, maxCols: 26 }); }
  key(r, c) { return r + ':' + c; }
  get(r, c) { return this.cells.has(this.key(r, c)) ? this.cells.get(this.key(r, c)) : ''; }
  set(r, c, v) { if (v === '' || v == null) this.cells.delete(this.key(r, c)); else this.cells.set(this.key(r, c), v); }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getSheetId() { return this.id; }
  getIndex() { return this.ss.sheets.indexOf(this) + 1; }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  isSheetHidden() { return this.hidden; }
  getLastRow() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(':')[0]); return m; }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(':')[1]); return m; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(_, n) { this.maxRows += n; }
  insertColumnsAfter(_, n) { this.maxCols += n; }
  hideColumns() {}
  setColumnWidth() {}
  setColumnWidths() {}
  setFrozenRows() {}
  setFrozenColumns() {}
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  // Like Google's: just A1 when the sheet is empty.
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
}

function makeEnv() {
  const ss = {
    sheets: [],
    active: null,
    getName: () => 'Recommendation Journal',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/1AbC_d-9/edit',
    getId: () => 'ss1',
    getSheets: () => [...ss.sheets],
    getSheetByName: (n) => ss.sheets.find((s) => s.name === n) || null,
    insertSheet: (n, at = ss.sheets.length) => { const s = new Sheet(ss, n); ss.sheets.splice(at, 0, s); return s; },
    deleteSheet: (s) => { ss.sheets.splice(ss.sheets.indexOf(s), 1); },
    getActiveSheet: () => ss.active || ss.sheets[0],
    setActiveSheet: (s) => { ss.active = s; return s; },
    moveActiveSheet: (pos) => { const s = ss.getActiveSheet(); ss.sheets.splice(ss.sheets.indexOf(s), 1); ss.sheets.splice(pos - 1, 0, s); },
  };
  ss.sheets.push(new Sheet(ss, 'Sheet1'));
  const props = new Map();
  const validation = { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: () => validation },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: (k) => props.delete(k),
        getProperties: () => Object.fromEntries(props),
        setProperties: (o) => Object.entries(o).forEach(([k, v]) => props.set(k, String(v))),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => require('node:crypto').randomUUID() },
    Logger: { log: (m) => { ctx.lastLog = m; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../../google-sheets/RecommendationJournalSync.gs'), 'utf8'), ctx);
  return { ctx, ss, props };
}

module.exports = { makeEnv };
