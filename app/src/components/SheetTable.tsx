// The Sheet tab's table, on phones. (Web: SheetTable.web.tsx, a plain HTML table.)
//
// The Title column stays put while the rest scrolls sideways, and round edge arrows show (and jump
// to) the columns that are off screen, so it's clear there is more to the right. The rows scroll
// up and down inside the sideways scroller; with touch, each swipe goes to the right one.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { WIDTHS, type Column } from '@/db/rowFormat';
import { useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';

/** A column: one of the sheet's own, or "Category" (on the All page). */
export type SheetColumn = Column | 'Category';
export interface SheetRow { uid: string; cells: Partial<Record<SheetColumn, string>> }

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 40;
const widthOf = (c: SheetColumn) => Math.max(64, Math.round((c === 'Category' ? 18 : WIDTHS[c]) * 8));
const PINNED = widthOf('Title');

export function SheetTable({ columns, rows }: { columns: SheetColumn[]; rows: SheetRow[] }) {
  const theme = useThemeName(); // redraw when the display changes
  const TOTAL = columns.reduce((sum, c) => sum + widthOf(c), 0);
  const [scrollX] = useState(() => new Animated.Value(0));
  const scroller = useRef<ScrollView>(null);
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
  }, [TOTAL]);

  // The pinned column is driven natively, so it can't lag behind your finger. The listener only
  // reads refs when a scroll happens, not while drawing.
  const onScroll = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
      useNativeDriver: true,
      listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => updateArrows(e.nativeEvent.contentOffset.x),
    }),
    [scrollX, updateArrows],
  );

  /** Jump most of a screen left or right (a little overlap keeps your place). */
  const jump = (direction: 1 | -1) => {
    const to = Math.max(0, Math.min(TOTAL - widthNow.current, offset.current + direction * Math.max(120, widthNow.current - PINNED - 40)));
    scroller.current?.scrollTo({ x: to, animated: true });
    updateArrows(to);
  };

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

  return (
    <View style={{ flex: 1 }} onLayout={(e) => {
      widthNow.current = e.nativeEvent.layout.width;
      setViewWidth(e.nativeEvent.layout.width);
      updateArrows(offset.current);
    }}>
      <Animated.ScrollView ref={scroller} horizontal persistentScrollbar style={{ flex: 1 }} contentContainerStyle={{ width: TOTAL }}
        scrollEventThrottle={16} onScroll={onScroll}>
        <View style={{ width: TOTAL, flex: 1 }}>
          <View style={{ flexDirection: 'row', height: HEADER_HEIGHT, zIndex: 2 }}>
            {columns.map((c, i) => (
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
                {columns.map((c, i) => (
                  <View key={c} style={{
                    width: widthOf(c), backgroundColor: colors.card, justifyContent: 'center', paddingHorizontal: 8,
                    borderRightWidth: 1, borderRightColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.bg,
                  }}>
                    {i > 0 && <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13 }}>{item.cells[c]}</Text>}
                  </View>
                ))}
                {pinned(item.cells.Title ?? '', false)}
              </View>
            )}
          />
        </View>
      </Animated.ScrollView>
      {scrollable && more.right && <EdgeArrow side="right" onPress={() => jump(1)} />}
      {more.left && <EdgeArrow side="left" inset={PINNED} onPress={() => jump(-1)} />}
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
