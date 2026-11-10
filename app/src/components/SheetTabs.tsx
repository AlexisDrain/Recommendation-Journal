// The Sheet tab's row of tabs above the table, like a spreadsheet's: All, Priority and one per category.
// Tap one to see its rows. It scrolls sideways when they don't fit. On phones (SheetTabPicker) the same
// choices fold into one button that opens them, like the List's category button.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { Tab } from '@/components/CategoryTabs';
import { colors, radius, space } from '@/lib/theme';

export interface SheetTab {
  key: string;
  label: string;
  icon?: string;
  /** Rows in it. */
  count: number;
}

export function SheetTabs({ tabs, selected, onSelect }: {
  tabs: SheetTab[];
  selected: string;
  onSelect: (uid: string) => void;
}) {
  const scroller = useRef<ScrollViewInstance>(null);
  const places = useRef(new Map<string, { x: number; width: number }>());
  const viewWidth = useRef(0);

  // Keep the chosen tab in sight (when it was chosen elsewhere, or at the start).
  useEffect(() => {
    const p = places.current.get(selected);
    if (p && viewWidth.current) scroller.current?.scrollTo({ x: Math.max(0, p.x + p.width / 2 - viewWidth.current / 2), animated: true });
  }, [selected]);

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.cardBorder, backgroundColor: colors.bg }}>
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false}
        onLayout={(e) => { viewWidth.current = e.nativeEvent.layout.width; }}
        contentContainerStyle={{ paddingHorizontal: space.sm }}>
        {tabs.map((t) => {
          const on = t.key === selected;
          return (
            <Pressable key={t.key} onPress={() => onSelect(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              onLayout={(e) => places.current.set(t.key, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44,
                paddingHorizontal: space.md, marginBottom: -1, // the chosen tab covers the line below it
                borderTopWidth: 3, borderTopColor: on ? colors.accent : 'transparent',
                borderRightWidth: 1, borderRightColor: colors.cardBorder, borderTopLeftRadius: 6, borderTopRightRadius: 6,
                backgroundColor: on ? colors.card : pressed || hovered ? colors.chip : 'transparent',
              })}>
              <Text style={{ color: on ? colors.text : colors.muted, fontSize: 14, fontWeight: on ? '700' : '400' }} numberOfLines={1}>
                {t.icon && <Text style={{ color: colors.priority, fontWeight: '900' }}>{t.icon} </Text>}
                {t.label}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{t.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Phones: "Category: All ▾", which opens the same choices as a list. */
export function SheetTabPicker({ tabs, selected, onSelect }: {
  tabs: SheetTab[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = tabs.find((t) => t.key === selected);
  return (
    <View style={{ gap: space.xs }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md,
          backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder,
        }}>
        <Text style={{ color: colors.muted, fontSize: 15 }}>Category</Text>
        <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
          {current?.icon && <Text style={{ color: colors.priority, fontWeight: '900' }}>{current.icon} </Text>}
          {current?.label}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{current?.count ?? 0}</Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View accessibilityRole="tablist" style={{ gap: 2, backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder, padding: space.xs }}>
          {tabs.map((t) => (
            <Tab key={t.key} label={t.label} icon={t.icon} iconColor={colors.priority} count={t.count} selected={t.key === selected}
              onPress={() => { setOpen(false); onSelect(t.key); }} />
          ))}
        </View>
      )}
    </View>
  );
}
