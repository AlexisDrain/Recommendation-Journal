// Export and import.
//   .xlsx — one tab per category, like the Google Sheet. Opens in Google Sheets, Excel, Numbers.
//   .csv  — one table with a Category column, for backups and moving to a new device.
// Import reads both, and also spreadsheets made by hand: columns are matched by name ("Title" or
// "Name", "Notes", "Year read"…) and each tab without a Category column becomes a category named
// after the tab. Things already on your list (same title in the same category) are skipped.
import * as DocumentPicker from 'expo-document-picker';
import { normalize, suggestWords } from '@/lib/categories';
import { stamp, today } from '@/lib/dates';
import type { Category, Item } from '@/lib/types';
import { readPickedBytes, readPickedText, shareFile } from './files';
import { COLUMNS, itemCells, mapHeader, rowCategory, rowFields, WIDTHS } from './rowFormat';
import { allCategories, allItems, getDb, newUid, reload, writeCategory, writeItem } from './store';
import { transaction } from './transaction';
import { buildXlsx, readXlsx, type SheetTab } from './xlsx';

const fileDate = () => today();

/** The categories (not deleted) with their items, in the app's order. */
async function grouped(): Promise<{ category: Category; items: Item[] }[]> {
  const [categories, items] = await Promise.all([allCategories(), allItems()]);
  return categories
    .filter((c) => !c.deleted)
    .map((category) => ({ category, items: items.filter((i) => !i.deleted && i.categoryUid === category.uid) }));
}

// ---------- export ----------

export async function exportXlsx(): Promise<void> {
  const tabs: SheetTab[] = (await grouped())
    .filter((g) => g.items.length || !g.category.hidden)
    .map(({ category, items }) => ({
      name: category.name,
      columns: [...COLUMNS.map((h) => ({ header: h, width: WIDTHS[h] })), { header: 'Id', width: 18 }],
      rows: items.map((i) => {
        const cells = itemCells(i, category);
        return [...COLUMNS.map((h) => cells[h]), i.uid];
      }),
    }));
  await shareFile(
    `recommendations-${fileDate()}.xlsx`, buildXlsx(tabs),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'org.openxmlformats.spreadsheetml.sheet',
  );
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function buildCsv(): Promise<string> {
  const lines = [['Category', ...COLUMNS, 'Id'].map(cell).join(',')];
  for (const { category, items } of await grouped()) {
    for (const i of items) {
      const cells = itemCells(i, category);
      lines.push([category.name, ...COLUMNS.map((h) => cells[h]), i.uid].map(cell).join(','));
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n'; // the BOM tells Excel it's UTF-8 (emoji, accents)
}

export async function exportCsv(): Promise<void> {
  await shareFile(`recommendations-${fileDate()}.csv`, await buildCsv(), 'text/csv', 'public.comma-separated-values-text');
}

// ---------- import ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const sep = /^[^\n]*;/.test(text) && !/^[^\n]*,/.test(text) ? ';' : ','; // some Excels save with ;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(value);
      value = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else value += ch;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export interface ImportResult { added: number; skipped: number; categoriesAdded: string[] }

/** Tab names that say nothing about what's in them. */
const GENERIC_TAB = /^(sheet|tab|page|table|feuille|blatt|hoja)\s*\d*$/i;
const BOOKKEEPING_TABS = new Set(['categories', 'deleted']);

/**
 * Adds the tables' rows to the list. `fallback` names the category for a table that has neither a
 * Category column nor a meaningful tab name.
 */
export async function importTables(tables: { name: string; rows: string[][] }[], fallback = 'Imported'): Promise<ImportResult> {
  const categories = (await allCategories()).filter((c) => !c.deleted);
  const existing = (await allItems()).filter((i) => !i.deleted);
  const uids = new Set((await allItems()).map((i) => i.uid));
  const seen = new Set(existing.map((i) => `${i.categoryUid}\n${normalize(i.title)}`));
  const result: ImportResult = { added: 0, skipped: 0, categoriesAdded: [] };
  const now = stamp();
  let order = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0);

  const db = await getDb();
  await transaction(db, async (tx) => {
    const categoryFor = async (name: string): Promise<Category> => {
      const found = categories.find((c) => normalize(c.name) === normalize(name));
      if (found) return found;
      const c: Category = { id: 0, uid: newUid(), name, ...suggestWords(name), sortOrder: ++order, hidden: false, deleted: false, updatedAt: now };
      await writeCategory(tx, c);
      categories.push(c);
      result.categoriesAdded.push(name);
      return c;
    };

    for (const table of tables) {
      if (BOOKKEEPING_TABS.has(table.name.trim().toLowerCase())) continue;
      // The header is the first row with a Title-like column (lists often start with a heading line).
      const start = table.rows.findIndex((r) => mapHeader(r).col.Title !== undefined);
      if (start < 0) continue;
      const map = mapHeader(table.rows[start]);
      const idCol = table.rows[start].findIndex((h) => normalize(h) === 'id');
      const tabCategory = GENERIC_TAB.test(table.name.trim()) || !table.name.trim() ? fallback : table.name.trim();
      for (const row of table.rows.slice(start + 1)) {
        const category = await categoryFor(rowCategory(map, row) || tabCategory);
        const fields = rowFields(map, row, category);
        if (!fields) continue;
        const key = `${category.uid}\n${normalize(fields.title)}`;
        const id = idCol >= 0 ? String(row[idCol] ?? '').trim() : '';
        if (seen.has(key) || (id && uids.has(id))) {
          result.skipped++;
          continue;
        }
        seen.add(key);
        // A backup's own ids are kept, so restoring it doesn't duplicate rows in the Google Sheet.
        const uid = /^[\w-]{6,64}$/.test(id) ? id : newUid();
        uids.add(uid);
        await writeItem(tx, { uid, categoryUid: category.uid, deleted: false, updatedAt: now, ...fields, author: fields.author ?? '', queuePos: fields.queuePos ?? null });
        result.added++;
      }
    }
  });
  await reload();
  return result;
}

/** Asks for a .csv or .xlsx file and imports it. Null if nothing was picked. */
export async function pickAndImport(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const baseName = (asset.name ?? '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const fallback = !baseName || /^recommendations( \d{4}.*)?$/i.test(baseName) ? 'Imported' : baseName;
  if (/\.xlsx$/i.test(asset.name ?? '') || asset.mimeType?.includes('spreadsheetml')) {
    return importTables(readXlsx(await readPickedBytes(asset)), fallback);
  }
  if (/\.xls$/i.test(asset.name ?? '')) {
    throw new Error('Old .xls files can’t be read. Open it in Excel or Google Sheets and save it as .xlsx or .csv.');
  }
  const text = (await readPickedText(asset)).replace(/^﻿/, '');
  return importTables([{ name: fallback, rows: parseCsv(text) }], fallback);
}
