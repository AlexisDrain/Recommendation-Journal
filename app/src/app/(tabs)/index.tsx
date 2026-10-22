// The list. One box does both jobs: type to search everything you've saved; if it isn't there,
// press Enter (or tap "+ Add") to add it, already filled in with what you typed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CategoryPicker, CategoryTabs } from '@/components/CategoryTabs';
import { CategoryEditor } from '@/components/CategoryEditor';
import { ItemEditor, type ItemDraft } from '@/components/ItemEditor';
import { ItemRow } from '@/components/ItemRow';
import { SyncChip } from '@/components/SyncChip';
import { Toast, type ToastMessage } from '@/components/Toast';
import { Chip, ErrorBox, Muted, styles } from '@/components/ui';
import { reload, store, useData } from '@/db/store';
import { syncNow, useSyncStatus } from '@/db/sync';
import { withArticle } from '@/lib/categories';
import { useThemeName } from '@/lib/displayMode';
import { hasTitle, search } from '@/lib/search';
import { colors, radius, space } from '@/lib/theme';
import type { Item, Status } from '@/lib/types';
import { page, useWide, WIDE_PAGE } from '@/lib/useLayout';

type Sort = 'newest' | 'title' | 'rating';
const SORTS: [Sort, string][] = [['newest', 'Newest'], ['title', 'A–Z'], ['rating', 'Best rated']];

/** The category new things go into while "All" is showing: the one used last (remembered on this device). */
const LAST_KEY = 'recjournal.lastCategory.v1';
let lastCategory: string | null = null;
AsyncStorage.getItem(LAST_KEY).then((v) => { lastCategory ??= v; }, () => {});
function rememberCategory(uid: string) {
  lastCategory = uid;
  AsyncStorage.setItem(LAST_KEY, uid).catch(() => {});
}

export default function ListScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const { categories, items, loaded, error } = useData();
  const [query, setQuery] = useState('');
  const [categoryUid, setCategoryUid] = useState<string | 'all'>('all');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState<Partial<ItemDraft> | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const input = useRef<TextInput>(null);
  const wide = useWide();

  const visible = useMemo(() => categories.filter((c) => !c.hidden), [categories]);
  const byUid = useMemo(() => new Map(categories.map((c) => [c.uid, c])), [categories]);
  const selected = categoryUid === 'all' ? null : byUid.get(categoryUid) ?? null;
  const hiddenUids = useMemo(() => new Set(categories.filter((c) => c.hidden).map((c) => c.uid)), [categories]);

  // Searching looks through everything; the chips narrow it down.
  const inCategory = useMemo(
    () => items.filter((i) => (selected ? i.categoryUid === selected.uid : !hiddenUids.has(i.categoryUid))),
    [items, selected, hiddenUids],
  );
  const shown = useMemo(() => {
    let list = search(inCategory, categories, query).filter((i) => status === 'all' || i.status === status);
    if (!query) {
      if (sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      if (sort === 'rating') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return list;
  }, [inCategory, categories, query, status, sort]);
  const perCategory = useMemo(() => {
    const m = new Map<string, number>([['all', 0]]);
    for (const i of items) {
      if (hiddenUids.has(i.categoryUid)) continue;
      m.set(i.categoryUid, (m.get(i.categoryUid) ?? 0) + 1);
      m.set('all', m.get('all')! + 1);
    }
    return m;
  }, [items, hiddenUids]);
  const counts = useMemo(() => ({
    want: inCategory.filter((i) => i.status === 'want').length,
    done: inCategory.filter((i) => i.status === 'done').length,
  }), [inCategory]);

  const addTo = selected ?? byUid.get(lastCategory ?? '') ?? visible[0];
  const exists = query.trim() !== '' && hasTitle(items, query, addTo?.uid);

  const startAdd = () => setAdding({
    title: query.trim(),
    categoryUid: addTo?.uid,
    status: status === 'done' ? 'done' : 'want',
  });

  const onPress = useCallback((item: Item) => setEditing(item), []);
  const hideToast = useCallback(() => setToast(null), []);

  // Saving never waits for the Google Sheet. If a sync fails afterwards, say so once (a new
  // problem shows again; the Sync button keeps showing it until a sync works).
  const sync = useSyncStatus();
  const shownError = useRef<string | null>(null);
  useEffect(() => {
    if (!sync.error) {
      shownError.current = null;
      return;
    }
    if (sync.running || sync.error === shownError.current) return;
    shownError.current = sync.error;
    setToast({
      text: `Saved on this device, but the Google Sheet didn't sync: ${sync.error}`,
      action: { label: 'Retry', run: () => void syncNow().catch(() => {}) },
    });
  }, [sync.error, sync.running]);

  if (error) return <View style={[styles.screen, { padding: space.lg }]}><ErrorBox message={error} onRetry={() => void reload()} /></View>;

  const pickCategory = (uid: string | 'all') => {
    setCategoryUid(uid);
    if (uid !== 'all') rememberCategory(uid);
  };
  const tabProps = { categories: visible, counts: perCategory, selected: categoryUid, onSelect: pickCategory, onNew: () => setNewCategory(true) };

  const statusChip = (s: Status | 'all', label: string) => (
    <Chip key={s} label={label} selected={status === s} onPress={() => setStatus(s)}
      color={s === 'want' ? colors.warm : s === 'done' ? colors.success : colors.accent} />
  );

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder }}>
        <Text style={{ color: colors.muted, fontSize: 18, paddingLeft: space.md }}>⌕</Text>
        <TextInput ref={input} value={query} onChangeText={setQuery} placeholderTextColor={colors.muted}
          placeholder={selected ? `Search, or add ${withArticle(selected.noun)}…` : 'Search, or type something new to add…'}
          style={{ flex: 1, color: colors.text, fontSize: 17, paddingHorizontal: space.md, paddingVertical: 14 }}
          returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={() => query.trim() && startAdd()}
          autoCorrect={false} accessibilityLabel="Search or add" />
        {query !== '' && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} style={{ paddingHorizontal: space.md }}
            accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={{ color: colors.muted, fontSize: 20 }}>×</Text>
          </Pressable>
        )}
      </View>

      {!wide && <CategoryPicker {...tabProps} />}

      <View style={[styles.chips, { alignItems: 'center' }]}>
        {statusChip('all', 'All')}
        {statusChip('want', `${selected?.wantLabel ?? 'Not experienced yet'} ${counts.want}`)}
        {statusChip('done', `${selected?.doneLabel ?? 'Done'} ${counts.done}`)}
        <View style={{ flex: 1 }} />
        <SyncChip />
      </View>
      {!query && items.length > 1 && (
        <View style={[styles.chips, { alignItems: 'center' }]}>
          <Muted>Sort</Muted>
          {SORTS.map(([s, label]) => <Chip key={s} label={label} selected={sort === s} onPress={() => setSort(s)} />)}
        </View>
      )}

      {query.trim() !== '' && (
        <Pressable onPress={startAdd} accessibilityRole="button"
          style={({ pressed }) => ({ backgroundColor: colors.accent, borderRadius: radius, padding: space.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: colors.bg, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
            + Add “{query.trim()}”{addTo ? ` to ${addTo.name}` : ''}
          </Text>
          {exists && <Text style={{ color: colors.bg, opacity: 0.8 }}>It’s already on your list (below).</Text>}
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={[{ flex: 1, flexDirection: 'row' }, wide && page(WIDE_PAGE)]}>
        {/* Wide screens: the categories as a column of tabs beside the list. */}
        {wide && (
          <ScrollView style={{ width: 240, flexGrow: 0 }} contentContainerStyle={{ padding: space.lg, paddingRight: 0 }}>
            <CategoryTabs {...tabProps} />
          </ScrollView>
        )}
        <FlatList
          style={{ flex: 1 }}
          data={shown}
          keyExtractor={(i) => i.uid}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, !wide && page(760), { paddingBottom: 96 }]}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <ItemRow item={item} category={byUid.get(item.categoryUid)} showCategory={!selected}
              onPress={onPress} />
          )}
          ListEmptyComponent={loaded ? (
            <View style={{ padding: space.xl, gap: space.sm, alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 17, textAlign: 'center' }}>
                {query ? 'Nothing matches yet.' : items.length ? 'Nothing here yet.' : 'Your list is empty.'}
              </Text>
              <Muted>
                {query ? 'Press Enter to add it.' : 'Type a title in the box above and press Enter to add your first recommendation.'}
              </Muted>
            </View>
          ) : null}
        />
      </View>

      <ItemEditor visible={!!editing} item={editing} onClose={() => setEditing(null)}
        onDeleted={(it) => setToast({ text: `Deleted “${it.title}”.`, action: { label: 'Undo', run: () => void store.items.undoRemove(it.uid) } })} />
      <ItemEditor visible={!!adding} start={adding ?? undefined} onClose={() => setAdding(null)}
        onSaved={(it) => {
          if (!it) return;
          rememberCategory(it.categoryUid);
          setQuery('');
          setToast({ text: `Added “${it.title}”.`, action: { label: 'Undo', run: () => void store.items.remove(it.uid) } });
        }} />
      <CategoryEditor visible={newCategory} onClose={() => setNewCategory(false)}
        onSaved={(c) => pickCategory(c.uid)} />
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}
