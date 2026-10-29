// The Sheet tab's table, on phones. (Web: SheetTable.web.tsx, a plain HTML table.)
//
// Every column scrolls sideways, Title too, and round edge arrows show (and jump to) the columns
// that are off screen, so it's clear there is more to the right. Sideways scrolling stops where a
// column starts, so none is left half hidden. Every other row is tinted, to follow a row across.
// The rows scroll up and down inside the sideways scroller; with touch, each swipe goes to the
// right one.
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';
import { columnWidths, HEADER_HEIGHT, jumpTarget, ROW_HEIGHT, scrollStops, type SheetColumn } from './sheetLayout';

export type { SheetColumn } from './sheetLayout';
export interface SheetRow { uid: string; cells: Partial<Record<SheetColumn, string>> }

export function SheetTable({ columns, rows }: { columns: SheetColumn[]; rows: SheetRow[] }) {
  const theme = useThemeName(); // redraw when the display changes
  const scroller = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const widthNow = useRef(0); // how wide the table's window is, for the handlers
  const [viewWidth, setViewWidth] = useState(0);
  const [more, setMore] = useState({ left: false, right: true });

  const widths = useMemo(() => columnWidths(columns, viewWidth), [columns, viewWidth]);
  const TOTAL = widths.reduce((a, b) => a + b, 0);
  const stops = useMemo(() => scrollStops(widths, viewWidth), [widths, viewWidth]);
  const scrollable = viewWidth > 0 && TOTAL > viewWidth + 1;

  const updateArrows = useCallback((x: number) => {
    offset.current = x;
    const w = widthNow.current;
    const next = { left: x > 8, right: w > 0 && x < TOTAL - w - 8 };
    setMore((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, [TOTAL]);

  /** Bring the column cut off at that edge fully into view. */
  const jump = (direction: 1 | -1) => {
    const to = jumpTarget(stops, offset.current, widthNow.current, direction);
    scroller.current?.scrollTo({ x: to, animated: true });
    updateArrows(to);
  };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => {
      widthNow.current = e.nativeEvent.layout.width;
      setViewWidth(e.nativeEvent.layout.width);
      updateArrows(offset.current);
    }}>
      <ScrollView ref={scroller} horizontal persistentScrollbar style={{ flex: 1 }} contentContainerStyle={{ width: TOTAL }}
        scrollEventThrottle={16} onScroll={(e) => updateArrows(e.nativeEvent.contentOffset.x)}
        snapToOffsets={stops} decelerationRate="fast">
        <View style={{ width: TOTAL, flex: 1 }}>
          <View style={{ flexDirection: 'row', height: HEADER_HEIGHT }}>
            {columns.map((c, i) => (
              <View key={c} style={{
                width: widths[i], backgroundColor: colors.chip, justifyContent: 'center', paddingHorizontal: 8,
                borderRightWidth: 1, borderRightColor: colors.bg,
              }}>
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{c}</Text>
              </View>
            ))}
          </View>
          <FlatList
            data={rows}
            extraData={[theme, widths]}
            keyExtractor={(r) => r.uid}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            initialNumToRender={30}
            windowSize={7}
            renderItem={({ item, index }) => (
              <View style={{ flexDirection: 'row', height: ROW_HEIGHT, backgroundColor: index % 2 ? colors.rowAlt : colors.card }}>
                {columns.map((c, i) => (
                  <View key={c} style={{
                    width: widths[i], justifyContent: 'center', paddingHorizontal: 8,
                    borderRightWidth: 1, borderRightColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.bg,
                  }}>
                    <Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, fontWeight: i === 0 ? '600' : '400' }}>{item.cells[c]}</Text>
                  </View>
                ))}
              </View>
            )}
          />
        </View>
      </ScrollView>
      {scrollable && more.right && <EdgeArrow side="right" onPress={() => jump(1)} />}
      {more.left && <EdgeArrow side="left" onPress={() => jump(-1)} />}
    </View>
  );
}

/** A round arrow on the table's edge: shows that more columns are that way, and jumps to them. */
function EdgeArrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}
      accessibilityRole="button" accessibilityLabel={side === 'right' ? 'Show more columns to the right' : 'Show columns to the left'}
      style={{
        position: 'absolute', top: HEADER_HEIGHT + 12, [side]: 8,
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.accent, opacity: 0.95,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)', elevation: 6,
      }}>
      <Text style={{ color: colors.bg, fontSize: 22, fontWeight: '800', marginTop: -2 }}>{side === 'right' ? '›' : '‹'}</Text>
    </Pressable>
  );
}
