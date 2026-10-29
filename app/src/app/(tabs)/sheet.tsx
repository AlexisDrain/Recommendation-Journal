// Sheet: your list as a spreadsheet, inside the app, for reading. One page per category, like the
// Google Sheet's tabs, plus All (every category, with a Category column). Same columns as the
// sheet and the exports, oldest row on top. Nothing here can be changed or tapped: edit on the List tab.
// The table itself is SheetTable (phones) / SheetTable.web (browsers). The Export buttons are the
// same as in Settings: everything, as an .xlsx with one tab per category or as one CSV.
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { CategoryPicker, CategoryTabs } from '@/components/CategoryTabs';
import { SheetTable, type SheetColumn, type SheetRow } from '@/components/SheetTable';
import { Button, ErrorBox, Muted, styles } from '@/components/ui';
import { exportCsv, exportXlsx } from '@/db/exchange';
import { COLUMNS, itemCells } from '@/db/rowFormat';
import { useData } from '@/db/store';
import { useThemeName } from '@/lib/displayMode';
import { space } from '@/lib/theme';
import { page, useWide, WIDE_PAGE } from '@/lib/useLayout';

const ALL_COLUMNS: SheetColumn[] = ['Title', 'Category', ...COLUMNS.slice(1)];

export default function SheetScreen() {
  useThemeName(); // redraw when the display changes
  const { categories, items } = useData();
  const wide = useWide();
  const [chosen, setChosen] = useState<string>('all');
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (what: 'xlsx' | 'csv', fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => categories.filter((c) => !c.hidden), [categories]);
  const byUid = useMemo(() => new Map(categories.map((c) => [c.uid, c])), [categories]);
  const counts = useMemo(() => {
    const m = new Map<string, number>([['all', 0]]);
    for (const i of items) {
      if (byUid.get(i.categoryUid)?.hidden) continue;
      m.set(i.categoryUid, (m.get(i.categoryUid) ?? 0) + 1);
      m.set('all', m.get('all')! + 1);
    }
    return m;
  }, [items, byUid]);
  const category = byUid.get(chosen) ?? null; // null: All

  const rows = useMemo<SheetRow[]>(() => items
    .filter((i) => (category ? i.categoryUid === category.uid : !byUid.get(i.categoryUid)?.hidden))
    .reverse() // oldest first, as in the Google Sheet
    .map((i) => ({ uid: i.uid, cells: { ...itemCells(i, byUid.get(i.categoryUid)), Category: byUid.get(i.categoryUid)?.name ?? '' } })),
  [items, category, byUid]);

  const tabProps = { categories: visible, counts, selected: category?.uid ?? 'all', onSelect: setChosen, onNew: () => {}, plain: true };

  return (
    <View style={styles.screen}>
      <View style={[{ flex: 1, flexDirection: 'row' }, wide && page(WIDE_PAGE)]}>
        {wide && (
          <ScrollView style={{ width: 240, flexGrow: 0 }} contentContainerStyle={{ padding: space.lg, paddingRight: 0 }}>
            <CategoryTabs {...tabProps} />
          </ScrollView>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ padding: space.lg, paddingBottom: space.md, gap: space.md }}>
            {!wide && <CategoryPicker {...tabProps} />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Muted>{rows.length} row{rows.length === 1 ? '' : 's'} · scroll sideways for more columns →</Muted>
              </View>
              {/* Together, so on a phone they move below the text as a pair (one above the other if
                  they don't fit side by side). */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Button title="Export .xlsx (recommended)" small onPress={() => void run('xlsx', exportXlsx)} busy={busy === 'xlsx'} />
                <Button title="Export .csv" small onPress={() => void run('csv', exportCsv)} busy={busy === 'csv'} />
              </View>
            </View>
            {error && <ErrorBox message={error} />}
          </View>
          {rows.length === 0 ? (
            <View style={{ paddingHorizontal: space.lg }}><Muted>Nothing here yet. Things you add on the List tab show up here as rows.</Muted></View>
          ) : (
            <SheetTable key={category?.uid ?? 'all'} columns={category ? [...COLUMNS] : ALL_COLUMNS} rows={rows} />
          )}
        </View>
      </View>
    </View>
  );
}
