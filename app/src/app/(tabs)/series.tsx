// Series: your list grouped by the series things belong to ("Dune book series"), A–Z. Type in
// the box to find a series (or something in one); tap an entry to open it, like on the List.
// A series with more than a few entries starts folded up: tap its name to open or close it.
//
// Each series name and each entry is its own row of one long list, so only the rows on screen are
// drawn: a series of hundreds, opened, scrolls as smoothly as a short one.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { ItemEditor } from '@/components/ItemEditor';
import { ItemRow } from '@/components/ItemRow';
import { Toast, type ToastMessage } from '@/components/Toast';
import { Muted, styles } from '@/components/ui';
import { store, useData } from '@/db/store';
import { normalize } from '@/lib/categories';
import { useThemeName } from '@/lib/displayMode';
import { useDrafts } from '@/lib/drafts';
import { search, seriesGroups, type SeriesGroup } from '@/lib/search';
import { colors, radius, space } from '@/lib/theme';
import type { Item } from '@/lib/types';
import { page } from '@/lib/useLayout';

/** A series with more entries than this starts folded up. */
const OPEN_UP_TO = 5;

type Row = { key: string; group: SeriesGroup; open: boolean } | { key: string; item: Item };

export default function SeriesScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const { categories, items, loaded } = useData();
  const drafts = useDrafts();
  const [query, setQuery] = useState('');
  /** Series you opened or closed yourself (by name); the rest follow OPEN_UP_TO. */
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map());
  const [editing, setEditing] = useState<Item | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const byUid = useMemo(() => new Map(categories.map((c) => [c.uid, c])), [categories]);
  const hiddenUids = useMemo(() => new Set(categories.filter((c) => c.hidden).map((c) => c.uid)), [categories]);
  const all = useMemo(() => seriesGroups(items.filter((i) => !hiddenUids.has(i.categoryUid))), [items, hiddenUids]);

  // A series whose name matches shows whole; otherwise only its entries that match the search.
  const groups = useMemo(() => {
    const q = normalize(query);
    if (!q) return all;
    const found = new Set(search(all.flatMap((g) => g.items), categories, query).map((i) => i.uid));
    return all.flatMap((g) => {
      if (normalize(g.name).includes(q)) return [g];
      const matching = g.items.filter((i) => found.has(i.uid));
      return matching.length ? [{ ...g, items: matching }] : [];
    });
  }, [all, query, categories]);

  // Searching opens every series it finds, so the matches show.
  const isOpen = useCallback((g: SeriesGroup) => toggled.get(g.name) ?? (query.trim() !== '' || g.items.length <= OPEN_UP_TO), [toggled, query]);
  const rows = useMemo(() => groups.flatMap((g): Row[] => {
    const open = isOpen(g);
    return [{ key: `series:${g.name}`, group: g, open }, ...(open ? g.items.map((item) => ({ key: item.uid, item })) : [])];
  }), [groups, isOpen]);
  const toggle = useCallback((g: SeriesGroup, open: boolean) => setToggled((m) => new Map(m).set(g.name, !open)), []);

  const onPress = useCallback((item: Item) => setEditing(item), []);
  const hideToast = useCallback(() => setToast(null), []);

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder }}>
        <Text style={{ color: colors.muted, fontSize: 18, paddingLeft: space.md }}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholderTextColor={colors.muted} placeholder="Find a series…"
          style={{ flex: 1, color: colors.text, fontSize: 17, paddingHorizontal: space.md, paddingVertical: 14 }}
          returnKeyType="search" autoCorrect={false} accessibilityLabel="Find a series" />
        {query !== '' && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} style={{ paddingHorizontal: space.md }}
            accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={{ color: colors.muted, fontSize: 20 }}>×</Text>
          </Pressable>
        )}
      </View>
      {all.length > 0 && <Muted>{all.length === 1 ? '1 series' : `${all.length} series`}, A–Z. Tap a series to open or close it.</Muted>}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        extraData={drafts}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, page(760), { paddingBottom: 96 }]}
        ListHeaderComponent={header}
        initialNumToRender={20}
        windowSize={11}
        renderItem={({ item: r, index }) => 'group' in r ? (
          <SeriesHeader group={r.group} open={r.open} first={index === 0} onToggle={toggle} />
        ) : (
          <ItemRow item={r.item} category={byUid.get(r.item.categoryUid)} showCategory showSeries={false} onPress={onPress}
            hasDraft={!!drafts[r.item.uid]} />
        )}
        ListEmptyComponent={!loaded ? undefined : (
          <View style={{ padding: space.xl, gap: space.sm, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 17, textAlign: 'center' }}>
              {query ? 'No series matches.' : 'Nothing in a series yet.'}
            </Text>
            {!query && (
              <Muted>Open something on your List and fill in its Series (like “Dune book series”). Each series gets its own group here.</Muted>
            )}
          </View>
        )}
      />
      <ItemEditor visible={!!editing} item={editing} onClose={() => setEditing(null)}
        onDeleted={(it) => setToast({ text: `Deleted “${it.title}”.`, action: { label: 'Undo', run: () => void store.items.undoRemove(it.uid) } })} />
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

/** A series' name, how many entries and how many are done; tap to open or close it. */
function SeriesHeader({ group, open, first, onToggle }: { group: SeriesGroup; open: boolean; first: boolean; onToggle: (g: SeriesGroup, open: boolean) => void }) {
  const done = group.items.filter((i) => i.status === 'done').length;
  const n = group.items.length;
  return (
    <Pressable onPress={() => onToggle(group, open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={`${group.name}, ${n} ${n === 1 ? 'entry' : 'entries'}${done ? `, ${done} done` : ''}. ${open ? 'Close' : 'Open'}`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'baseline', gap: space.sm, opacity: pressed ? 0.7 : 1,
        marginTop: first ? 0 : open ? space.md : 0, marginBottom: space.sm, paddingVertical: space.xs,
      })}>
      <Text style={{ color: colors.muted, fontSize: 14, width: 14 }}>{open ? '▾' : '▸'}</Text>
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700', flexShrink: 1 }}>{group.name}</Text>
      <Text style={{ color: colors.muted, fontSize: 14 }}>
        {n === 1 ? '1 entry' : `${n} entries`}{done > 0 ? ` · ${done} done` : ''}
      </Text>
    </Pressable>
  );
}
