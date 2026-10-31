// The list. One box does both jobs: type to search everything you've saved; if it isn't there,
// press Enter (or tap "+ Add") to add it, already filled in with what you typed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { CategoryPicker, CategoryTabs } from '@/components/CategoryTabs';
import { CategoryEditor } from '@/components/CategoryEditor';
import { DeletedRow } from '@/components/DeletedRow';
import { ItemEditor, type ItemDraft } from '@/components/ItemEditor';
import { ItemRow } from '@/components/ItemRow';
import { SortableList } from '@/components/SortableList';
import { SyncChip } from '@/components/SyncChip';
import { Toast, type ToastMessage } from '@/components/Toast';
import { Button, Card, Chip, ErrorBox, Muted, styles } from '@/components/ui';
import { DELETED_DAYS, reload, store, useData } from '@/db/store';
import { eraseAllDeleted, getConnection, syncNow, useSyncStatus } from '@/db/sync';
import { useApkUpdate } from '@/lib/apkUpdate';
import { confirmAction } from '@/lib/confirm';
import { withArticle } from '@/lib/categories';
import { useThemeName } from '@/lib/displayMode';
import { useDrafts } from '@/lib/drafts';
import { hasTitle, search } from '@/lib/search';
import { colors, radius, space } from '@/lib/theme';
import type { Item, Status } from '@/lib/types';
import { page, useWide, WIDE_PAGE } from '@/lib/useLayout';

type Sort = 'manual' | 'newest' | 'title' | 'rating';
/** Rows you can drag at once in "My order": drawing hundreds of draggable rows makes Rearrange slow on a phone. */
const REARRANGE_PAGE = 50;
const SORTS: [Sort, string][] = [['manual', 'My order'], ['newest', 'Newest'], ['title', 'A–Z'], ['rating', 'Best rated']];

/** "Newest": when it was added, or marked done if that was later. */
const newestKey = (i: Item) => (i.doneAt && i.doneAt > i.createdAt ? i.doneAt : i.createdAt);

/** The sort you picked last (remembered on this device). "My order" starts as newest first. */
const SORT_KEY = 'recjournal.sort.v1';
let lastSort: Sort = 'manual';
AsyncStorage.getItem(SORT_KEY).then((v) => { if (SORTS.some(([s]) => s === v)) lastSort = v as Sort; }, () => {});
function rememberSort(sort: Sort) {
  lastSort = sort;
  AsyncStorage.setItem(SORT_KEY, sort).catch(() => {});
}

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
  const { categories, items, deleted, deletedCategories, loaded, error } = useData();
  const drafts = useDrafts();
  const apkUpdate = useApkUpdate();
  const [query, setQuery] = useState('');
  /** A category's uid, 'all', 'upnext' (Priority) or 'deleted' (Recently deleted). */
  const [categoryUid, setCategoryUid] = useState<string>('all');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [sort, setSortState] = useState<Sort>(lastSort);
  /** "My order" with the ≡ grips showing (iOS-style: a button switches dragging on and off). */
  const [rearranging, setRearranging] = useState(false);
  // The button answers at once; the draggable list (slower to draw) follows a moment later.
  const listRearranging = useDeferredValue(rearranging);
  /** How many rows of "My order" are draggable: all of a long list is too slow to draw. */
  const [rearrangeCount, setRearrangeCount] = useState(REARRANGE_PAGE);
  const setSort = (next: Sort) => {
    setSortState(next);
    rememberSort(next);
  };
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState<Partial<ItemDraft> | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const input = useRef<TextInputInstance>(null);
  const wide = useWide();

  const visible = useMemo(() => categories.filter((c) => !c.hidden), [categories]);
  const byUid = useMemo(() => new Map(categories.map((c) => [c.uid, c])), [categories]);
  const selected = byUid.get(categoryUid) ?? null;
  const upNextMode = categoryUid === 'upnext';
  const deletedMode = categoryUid === 'deleted';
  /** Every category, deleted ones too: a deleted recommendation may be in one. */
  const anyCategory = useMemo(() => new Map([...categories, ...deletedCategories].map((c) => [c.uid, c])), [categories, deletedCategories]);
  const deletedShown = useMemo(() => search(deleted, categories, query), [deleted, categories, query]);
  const hiddenUids = useMemo(() => new Set(categories.filter((c) => c.hidden).map((c) => c.uid)), [categories]);

  // Searching looks through everything; the chips narrow it down.
  const inCategory = useMemo(
    () => items.filter((i) => (selected ? i.categoryUid === selected.uid : !hiddenUids.has(i.categoryUid) && (!upNextMode || i.queuePos != null))),
    [items, selected, hiddenUids, upNextMode],
  );
  const queue = useMemo(() => store.upNext.list(inCategory), [inCategory]);
  const shown = useMemo(() => {
    let list = search(inCategory, categories, query).filter((i) => status === 'all' || i.status === status);
    if (!query) {
      if (sort === 'manual') list = [...list].sort((a, b) => b.manualPos - a.manualPos);
      if (sort === 'newest') list = [...list].sort((a, b) => (newestKey(a) < newestKey(b) ? 1 : newestKey(a) > newestKey(b) ? -1 : 0));
      if (sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      if (sort === 'rating') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return list;
  }, [inCategory, categories, query, status, sort]);
  /** While searching inside one category (or Priority, or Recently deleted): matches elsewhere. */
  const matchesElsewhere = useMemo(() => {
    if (!query.trim() || categoryUid === 'all') return 0;
    const everywhere = search(items.filter((i) => !hiddenUids.has(i.categoryUid)), categories, query).length;
    return deletedMode ? everywhere : everywhere - search(inCategory, categories, query).length;
  }, [query, categoryUid, items, hiddenUids, categories, deletedMode, inCategory]);
  const perCategory = useMemo(() => {
    const m = new Map<string, number>([['all', 0], ['upnext', 0]]);
    for (const i of items) {
      if (hiddenUids.has(i.categoryUid)) continue;
      m.set(i.categoryUid, (m.get(i.categoryUid) ?? 0) + 1);
      m.set('all', m.get('all')! + 1);
      if (i.queuePos != null) m.set('upnext', m.get('upnext')! + 1);
    }
    m.set('deleted', deleted.length);
    return m;
  }, [items, hiddenUids, deleted]);
  const counts = useMemo(() => ({
    want: inCategory.filter((i) => i.status === 'want').length,
    done: inCategory.filter((i) => i.status === 'done').length,
  }), [inCategory]);

  const addTo = selected ?? byUid.get(lastCategory ?? '') ?? visible[0];
  const exists = query.trim() !== '' && hasTitle(items, query, addTo?.uid);

  const startAdd = () => setAdding({
    title: query.trim(),
    categoryUid: addTo?.uid,
    status: status === 'done' && !upNextMode ? 'done' : 'want',
    upNext: upNextMode, // added while looking at Priority: it becomes a priority
  });

  const onPress = useCallback((item: Item) => setEditing(item), []);
  const eraseAll = async () => {
    const n = deleted.length;
    const ok = await confirmAction(
      n === 1 ? 'Erase it for good?' : `Erase all ${n} for good?`,
      `Everything in Recently deleted will be erased now. It can't be restored after this.`,
      'Erase all',
    );
    if (!ok) return;
    const left = await eraseAllDeleted();
    setToast({
      text: left
        ? `Erased ${n - left}. ${left} haven't reached your Google Sheet yet: try again once it has synced.`
        : `Erased ${n} for good.`,
    });
  };
  const onRestore = useCallback((item: Item) => {
    store.items.undoRemove(item.uid).then(() => setToast({ text: `Restored “${item.title}”.` }), (e) => setToast({ text: (e as Error).message }));
  }, []);
  const hideToast = useCallback(() => setToast(null), []);

  // Pull down at the top of the list to sync (phones), when a sheet is connected. Connecting
  // happens in Settings, so look again whenever this tab is shown. A failure shows as below.
  const [connected, setConnected] = useState(false);
  useFocusEffect(useCallback(() => {
    getConnection().then((c) => setConnected(!!c), () => setConnected(false));
  }, []));
  const [pulling, setPulling] = useState(false);
  const pullToSync = useCallback(() => {
    setPulling(true);
    syncNow().catch(() => {}).finally(() => setPulling(false));
  }, []);
  const pullControl = connected && Platform.OS !== 'web'
    ? <RefreshControl refreshing={pulling} onRefresh={pullToSync} tintColor={colors.accent} colors={[colors.accent]} />
    : undefined;

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

  const pickCategory = (uid: string) => {
    setCategoryUid(uid);
    if (byUid.has(uid)) rememberCategory(uid);
  };
  const tabProps = { categories: visible, counts: perCategory, selected: categoryUid, onSelect: pickCategory, onNew: () => setNewCategory(true) };

  const statusChip = (s: Status | 'all', label: string) => (
    <Chip key={s} label={label} selected={status === s} onPress={() => setStatus(s)}
      color={s === 'want' ? colors.warm : s === 'done' ? colors.success : colors.accent} />
  );

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      {apkUpdate.release && (
        <Card title="New Android version">
          <Muted>A new version of the app is out. Installing it keeps your list.</Muted>
          <Button title="Download" small onPress={() => void Linking.openURL(apkUpdate.release!.url).catch(() => {})} />
          <Button title="Not now" small onPress={apkUpdate.dismiss} color={colors.chip} textColor={colors.text} />
        </Card>
      )}
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

      {query.trim() !== '' && categoryUid !== 'all' && (
        // Searching inside one category: say so, and offer the rest.
        <View style={[styles.chips, { alignItems: 'center' }]}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ color: colors.warm }}>
              Searching only in {selected?.name ?? (upNextMode ? '★ Priority' : 'Recently deleted')}.
              {matchesElsewhere > 0 && ` ${matchesElsewhere} more ${matchesElsewhere === 1 ? 'match' : 'matches'} in ${deletedMode ? 'your list' : 'other categories'}.`}
            </Text>
          </View>
          <Chip label="Search all categories instead" onPress={() => pickCategory('all')} />
        </View>
      )}
      {drafts.new && (
        // An unfinished new recommendation: closed before it was added.
        <Pressable onPress={() => setAdding({ title: String(drafts.new.fields.title ?? '') })} accessibilityRole="button"
          style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.warm, borderRadius: radius, padding: space.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: colors.warm }} numberOfLines={1}>
            ✎ Continue adding {drafts.new.fields.title ? `“${String(drafts.new.fields.title)}”` : 'your unsaved recommendation'}
          </Text>
        </Pressable>
      )}
      {!wide && <CategoryPicker {...tabProps} />}

      {deletedMode ? (
        <View style={[styles.chips, { alignItems: 'center' }]}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Muted>
              {`What you deleted stays here for ${DELETED_DAYS} days, then it's erased for good. Restore something to put it back on your list.`}
            </Muted>
          </View>
          {deleted.length > 0 && <Chip label="Erase all now" color={colors.danger} onPress={() => void eraseAll()} />}
          <SyncChip />
        </View>
      ) : upNextMode ? (
        <View style={[styles.chips, { alignItems: 'center' }]}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Muted>
              {queue.length
                ? 'What you want to get to soon. Drag ≡ to change the order; done things leave the list.'
                : 'Nothing here yet. Open something on your list and tap “☆ Make it a priority” to put it here.'}
            </Muted>
          </View>
          <SyncChip />
        </View>
      ) : (
      <View style={[styles.chips, { alignItems: 'center' }]}>
        {statusChip('all', 'All')}
        {statusChip('want', `${selected?.wantLabel ?? 'Not experienced yet'} ${counts.want}`)}
        {statusChip('done', `${selected?.doneLabel ?? 'Done'} ${counts.done}`)}
        <View style={{ flex: 1 }} />
        <SyncChip />
      </View>
      )}
      {!query && !upNextMode && !deletedMode && items.length > 1 && (
        <View style={[styles.chips, { alignItems: 'center' }]}>
          <Muted>Sort</Muted>
          {SORTS.map(([s, label]) => <Chip key={s} label={label} selected={sort === s} onPress={() => { setSort(s); setRearranging(false); }} />)}
          {sort === 'manual' && (
            <Chip label={rearranging ? '✓ Done' : '↕ Rearrange'} selected={rearranging} color={colors.warm}
              onPress={() => { setRearranging(!rearranging); setRearrangeCount(REARRANGE_PAGE); }} />
          )}
        </View>
      )}

      {query.trim() !== '' && !deletedMode && (
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
        {(upNextMode || (sort === 'manual' && listRearranging && !deletedMode)) && !query ? (
          // Priority, and "My order" while rearranging: drag ≡ to put in order. Not a FlatList (the rows
          // move while you drag), so every row is drawn: fine for these, too slow as the everyday view
          // of a long list.
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
            refreshControl={upNextMode ? pullControl : undefined /* rearranging: a pull would fight with dragging rows */}
            contentContainerStyle={[styles.scroll, !wide && page(760), { paddingBottom: 96 }]}>
            {header}
            <SortableList data={upNextMode ? queue : shown.slice(0, rearrangeCount)} keyOf={(i) => i.uid} label="recommendation" wholeRow={!upNextMode}
              onReorder={(next) => (upNextMode ? store.upNext.reorder : store.items.reorder)(next.map((i) => i.uid))
                .catch((e) => setToast({ text: (e as Error).message }))}
              renderRow={(item) => (
                <ItemRow item={item} category={byUid.get(item.categoryUid)} showCategory={!selected} onPress={onPress} flush hasDraft={!!drafts[item.uid]} />
              )} />
            {!upNextMode && shown.length > rearrangeCount && (
              <View style={{ paddingVertical: space.md, gap: space.sm, alignItems: 'center' }}>
                <Muted>Showing the top {rearrangeCount} of {shown.length} to rearrange.</Muted>
                <Chip label={`Show ${Math.min(REARRANGE_PAGE, shown.length - rearrangeCount)} more`}
                  onPress={() => setRearrangeCount((c) => c + REARRANGE_PAGE)} />
              </View>
            )}
            {!upNextMode && shown.length === 0 && loaded && (
              <View style={{ padding: space.xl, alignItems: 'center' }}>
                <Muted>{items.length ? 'Nothing here yet.' : 'Type a title in the box above and press Enter to add your first recommendation.'}</Muted>
              </View>
            )}
          </ScrollView>
        ) : (
        <FlatList
          style={{ flex: 1 }}
          data={deletedMode ? deletedShown : shown}
          extraData={[drafts, deletedMode]}
          refreshControl={pullControl}
          keyExtractor={(i) => i.uid}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, !wide && page(760), { paddingBottom: 96 }]}
          ListHeaderComponent={header}
          renderItem={({ item }) => deletedMode ? (
            <DeletedRow item={item} category={anyCategory.get(item.categoryUid)} onRestore={onRestore} />
          ) : (
            <ItemRow item={item} category={byUid.get(item.categoryUid)} showCategory={!selected}
              onPress={onPress} hasDraft={!!drafts[item.uid]} />
          )}
          ListEmptyComponent={!loaded ? undefined : deletedMode ? (
            <View style={{ padding: space.xl, alignItems: 'center' }}>
              <Muted>{query ? 'Nothing deleted matches.' : `Nothing deleted in the last ${DELETED_DAYS} days.`}</Muted>
            </View>
          ) : (
            <View style={{ padding: space.xl, gap: space.sm, alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 17, textAlign: 'center' }}>
                {query ? 'Nothing matches yet.' : items.length ? 'Nothing here yet.' : 'Your list is empty.'}
              </Text>
              <Muted>
                {query ? 'Press Enter to add it.' : 'Type a title in the box above and press Enter to add your first recommendation.'}
              </Muted>
            </View>
          )}
        />
        )}
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
