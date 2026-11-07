// Sheet: your list as a spreadsheet, inside the app, for reading. Tabs right above the table, like a
// spreadsheet's (on phones, a "Category" button that opens them as a list): All (every category, with a Category column), Priority (in priority order), then one
// per category. Same columns as the sheet and the exports, oldest row on top. Nothing here can be
// changed or tapped: edit on the List tab.
// The table itself is SheetTable (phones) / SheetTable.web (browsers). The Export buttons are the
// same as in Settings: everything, as an .xlsx with one tab per category or as one CSV. "Open in Google
// Sheet" shows when a Google Sheet is connected.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { SheetTable, type SheetColumn, type SheetRow } from '@/components/SheetTable';
import { SheetTabPicker, SheetTabs, type SheetTab } from '@/components/SheetTabs';
import { Button, ErrorBox, Muted, styles } from '@/components/ui';
import { exportCsv, exportXlsx } from '@/db/exchange';
import { COLUMNS, itemCells } from '@/db/rowFormat';
import { store, useData } from '@/db/store';
import { getSyncState, useSyncStatus } from '@/db/sync';
import { useThemeName } from '@/lib/displayMode';
import { colors, space } from '@/lib/theme';
import { useWide } from '@/lib/useLayout';

const ALL_COLUMNS: SheetColumn[] = ['Title', 'Category', ...COLUMNS.slice(1)];

export default function SheetScreen() {
  useThemeName(); // redraw when the display changes
  const { categories, items } = useData();
  const wide = useWide();
  const [tab, setTab] = useState<string>('all'); // 'all', 'upnext' (Priority) or a category's uid
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null); // the connected Google Sheet, if any
  const [topWidth, setTopWidth] = useState(0);
  const [topTextWidth, setTopTextWidth] = useState(0);
  const stacked = topTextWidth > 0 && topTextWidth >= topWidth - 1; // the text has the line to itself
  const { running } = useSyncStatus();

  // Connecting or disconnecting happens in Settings, and a sync can bring the address: look again
  // whenever this tab is shown and whenever a sync ends.
  const lookUpSheet = useCallback(() => {
    getSyncState().then((s) => setSheetUrl(s.sheetUrl), () => setSheetUrl(null));
  }, []);
  useFocusEffect(lookUpSheet);
  useEffect(lookUpSheet, [lookUpSheet, running]);

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
  const shown = useMemo(() => items.filter((i) => !byUid.get(i.categoryUid)?.hidden), [items, byUid]);
  const priorities = useMemo(() => store.upNext.list(shown), [shown]);
  const sheetTabs = useMemo<SheetTab[]>(() => {
    const counts = new Map<string, number>();
    for (const i of shown) counts.set(i.categoryUid, (counts.get(i.categoryUid) ?? 0) + 1);
    return [
      { key: 'all', label: 'All', count: shown.length },
      { key: 'upnext', label: 'Priority', icon: '★', count: priorities.length },
      ...visible.map((c) => ({ key: c.uid, label: c.name, count: counts.get(c.uid) ?? 0 })),
    ];
  }, [shown, priorities, visible]);
  // The tab picked, or All if that category has since been hidden or deleted.
  const selected = sheetTabs.some((t) => t.key === tab) ? tab : 'all';
  const category = byUid.get(selected) ?? null; // null: All or Priority

  const rows = useMemo<SheetRow[]>(() => {
    const list = selected === 'upnext' ? priorities // in priority order
      : (category ? items.filter((i) => i.categoryUid === category.uid) : shown).slice().reverse(); // oldest first, as in the Google Sheet
    return list.map((i) => ({ uid: i.uid, cells: { ...itemCells(i, byUid.get(i.categoryUid)), Category: byUid.get(i.categoryUid)?.name ?? '' } }));
  }, [selected, priorities, category, items, shown, byUid]);

  return (
    <View style={styles.screen}>
      <View style={{ padding: space.lg, paddingBottom: space.md, gap: space.md }}>
        <View onLayout={(e) => setTopWidth(e.nativeEvent.layout.width)}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
          {/* flexBasis 'auto': the text is never squeezed narrower to keep the buttons beside it. */}
          <View onLayout={(e) => setTopTextWidth(e.nativeEvent.layout.width)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto' }}>
            <Text style={[styles.muted, { textAlign: stacked ? 'center' : 'left' }]}>
              {rows.length} row{rows.length === 1 ? '' : 's'} · scroll sideways for more columns →
            </Text>
          </View>
          {/* Together, so when they don't all fit beside the text they go below it as a group. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, flexShrink: 1, maxWidth: '100%' }}>
            {sheetUrl && (
              <Button title="Open in Google Sheet ↗" small color={colors.chip} textColor={colors.text}
                onPress={() => Linking.openURL(sheetUrl).catch(() => {})} />
            )}
            <Button title="Export .xlsx (recommended)" small onPress={() => void run('xlsx', exportXlsx)} busy={busy === 'xlsx'} />
            <Button title="Export .csv" small onPress={() => void run('csv', exportCsv)} busy={busy === 'csv'} />
          </View>
        </View>
        {error && <ErrorBox message={error} />}
        {/* Last, right above the table it picks for (like the tabs on wide screens). */}
        {!wide && <SheetTabPicker tabs={sheetTabs} selected={selected} onSelect={setTab} />}
      </View>
      {/* Right on top of the table, like a spreadsheet's tabs. */}
      {wide && <SheetTabs tabs={sheetTabs} selected={selected} onSelect={setTab} />}
      {rows.length === 0 ? (
        <View style={{ flex: 1, paddingHorizontal: space.lg }}>
          <Muted>{selected === 'upnext'
            ? 'No priorities yet. Mark things as a priority on the List tab, and they show up here in order.'
            : 'Nothing here yet. Things you add on the List tab show up here as rows.'}</Muted>
        </View>
      ) : (
        <SheetTable key={selected} columns={category ? [...COLUMNS] : ALL_COLUMNS} rows={rows} />
      )}
    </View>
  );
}
