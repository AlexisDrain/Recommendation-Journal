// Sheet: your list as a spreadsheet, inside the app, for reading. One page per category, like the
// Google Sheet's tabs, with the same columns as the sheet and the exports, oldest row on top.
// Nothing here can be changed or tapped: edit on the List tab.
//
// The Title column stays put while the rest scrolls sideways, and round edge arrows show (and jump
// to) the columns that are off screen, so it's clear on a phone that there is more to the right.
// On a computer, sideways wheel or trackpad scrolling works anywhere over the table.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { CategoryPicker, CategoryTabs } from '@/components/CategoryTabs';
import { Muted, styles } from '@/components/ui';
import { COLUMNS, itemCells, WIDTHS, type Column } from '@/db/rowFormat';
import { useData } from '@/db/store';
import { useThemeName } from '@/lib/displayMode';
import { colors, space } from '@/lib/theme';
import { page, useWide, WIDE_PAGE } from '@/lib/useLayout';

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 40;
const widthOf = (c: Column) => Math.max(64, Math.round(WIDTHS[c] * 8));
const TOTAL = COLUMNS.reduce((sum, c) => sum + widthOf(c), 0);
const PINNED = widthOf('Title');

export default function SheetScreen() {
  const theme = useThemeName(); // redraw when the display changes
  const { categories, items } = useData();
  const wide = useWide();
  const [chosen, setChosen] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.categoryUid, (m.get(i.categoryUid) ?? 0) + 1);
    return m;
  }, [items]);
  // Opens on the first category that has something in it.
  const category = categories.find((c) => c.uid === chosen) ?? categories.find((c) => counts.get(c.uid)) ?? categories[0];
  const rows = useMemo(() => {
    if (!category) return [];
    return items
      .filter((i) => i.categoryUid === category.uid)
      .reverse() // oldest first, as in the Google Sheet
      .map((i) => ({ uid: i.uid, cells: itemCells(i, category) }));
  }, [items, category]);

  // ---------- sideways scrolling ----------
  // The pinned Title column slides right exactly as far as the table slides left.
  const [scrollX] = useState(() => new Animated.Value(0));
  const scroller = useRef<ScrollView>(null);
  const table = useRef<View>(null);
  const offset = useRef(0);
  const widthNow = useRef(0); // how wide the table's window is, for the handlers
  const [viewWidth, setViewWidth] = useState(0);
  const [more, setMore] = useState({ left: false, right: true });
  const scrollable = viewWidth > 0 && TOTAL > viewWidth + 1;

  const updateArrows = useCallback((x: number) => {
    offset.current = x;
    const w = widthNow.current;
    const next = { left: x > 8, right: w > 0 && x < TOTAL - w - 8 };
    setMore((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  const onScroll = useMemo(() => {
    type ScrollEvent = { nativeEvent: { contentOffset: { x: number } } };
    if (Platform.OS === 'web') {
      return (e: ScrollEvent) => {
        scrollX.setValue(e.nativeEvent.contentOffset.x);
        updateArrows(e.nativeEvent.contentOffset.x);
      };
    }
    // Phones: the pinned column is driven natively, so it can't lag behind your finger. The
    // listener only reads refs when a scroll happens, not while drawing.
    // eslint-disable-next-line react-hooks/refs
    return Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
      useNativeDriver: true, listener: (e: ScrollEvent) => updateArrows(e.nativeEvent.contentOffset.x),
    });
  }, [scrollX, updateArrows]);

  /** Scroll the table sideways to x (kept within the table). */
  const scrollToX = useCallback((x: number, animated: boolean) => {
    const to = Math.max(0, Math.min(TOTAL - widthNow.current, x));
    scroller.current?.scrollTo({ x: to, animated });
    updateArrows(to);
    if (Platform.OS === 'web') scrollX.setValue(to);
  }, [scrollX, updateArrows]);

  /** Jump most of a screen left or right (a little overlap keeps your place). */
  const jump = (direction: 1 | -1) =>
    scrollToX(offset.current + direction * Math.max(120, widthNow.current - PINNED - 40), Platform.OS !== 'web');

  // Computers: the rows sit in their own up-and-down scroller, which swallows sideways wheel and
  // trackpad movement. Catch it over the whole table and move the columns instead. Shift + wheel
  // counts as sideways too.
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (Platform.OS !== 'web' || !hasRows) return;
    const el = table.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      scrollToX(offset.current + dx, false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasRows, scrollToX]);

  const pinned = (text: string, header: boolean) => (
    <Animated.View style={{
      position: 'absolute', left: 0, top: 0, width: PINNED, height: header ? HEADER_HEIGHT : ROW_HEIGHT,
      backgroundColor: header ? colors.chip : colors.card, justifyContent: 'center', paddingHorizontal: 8,
      transform: [{ translateX: scrollX }], borderRightWidth: 2, borderRightColor: colors.cardBorder,
      borderBottomWidth: 1, borderBottomColor: colors.bg,
    }}>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: header ? 12 : 13, fontWeight: header ? '700' : '600' }}>{text}</Text>
    </Animated.View>
  );

  const tabProps = { categories, counts, selected: category?.uid ?? '', onSelect: setChosen, onNew: () => {}, plain: true };

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
            <Muted>
              {rows.length} row{rows.length === 1 ? '' : 's'} · swipe sideways for more columns →
            </Muted>
          </View>
          {rows.length === 0 ? (
            <View style={{ paddingHorizontal: space.lg }}><Muted>Nothing in this category yet. Things you add on the List tab show up here as rows.</Muted></View>
          ) : (
            <View ref={table} style={{ flex: 1 }} onLayout={(e) => {
              widthNow.current = e.nativeEvent.layout.width;
              setViewWidth(e.nativeEvent.layout.width);
              updateArrows(offset.current);
            }}>
            <Animated.ScrollView ref={scroller} horizontal persistentScrollbar style={{ flex: 1 }} contentContainerStyle={{ width: TOTAL }}
              scrollEventThrottle={16} onScroll={onScroll}>
              <View style={{ width: TOTAL, flex: 1 }}>
                <View style={{ flexDirection: 'row', height: HEADER_HEIGHT, zIndex: 2 }}>
                  {COLUMNS.map((c, i) => (
                    <View key={c} style={{
                      width: widthOf(c), backgroundColor: colors.chip, justifyContent: 'center', paddingHorizontal: 8,
                      borderRightWidth: 1, borderRightColor: colors.bg,
                    }}>
                      {i > 0 && <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{c}</Text>}
                    </View>
                  ))}
                  {pinned('Title', true)}
                </View>
                <FlatList
                  data={rows}
                  extraData={theme}
                  keyExtractor={(r) => r.uid}
                  getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
                  initialNumToRender={30}
                  windowSize={7}
                  renderItem={({ item }) => (
                    <View style={{ flexDirection: 'row', height: ROW_HEIGHT }}>
                      {COLUMNS.map((c, i) => (
                        <View key={c} style={{
                          width: widthOf(c), backgroundColor: colors.card, justifyContent: 'center', paddingHorizontal: 8,
                          borderRightWidth: 1, borderRightColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.bg,
                        }}>
                          {i > 0 && <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13 }}>{item.cells[c]}</Text>}
                        </View>
                      ))}
                      {pinned(item.cells.Title, false)}
                    </View>
                  )}
                />
              </View>
            </Animated.ScrollView>
            {scrollable && more.right && <EdgeArrow side="right" onPress={() => jump(1)} />}
            {more.left && <EdgeArrow side="left" inset={PINNED} onPress={() => jump(-1)} />}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/** A round arrow on the table's edge: shows that more columns are that way, and jumps to them. */
function EdgeArrow({ side, inset = 0, onPress }: { side: 'left' | 'right'; inset?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}
      accessibilityRole="button" accessibilityLabel={side === 'right' ? 'Show more columns to the right' : 'Show columns to the left'}
      style={{
        position: 'absolute', top: HEADER_HEIGHT + 12, [side]: (side === 'left' ? inset : 0) + 8,
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.accent, opacity: 0.95,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)', elevation: 6,
      }}>
      <Text style={{ color: colors.bg, fontSize: 22, fontWeight: '800', marginTop: -2 }}>{side === 'right' ? '›' : '‹'}</Text>
    </Pressable>
  );
}
