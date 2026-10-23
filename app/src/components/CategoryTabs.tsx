// The categories as a vertical list of tabs, one button each with how many things are in it.
// Wide screens show it as a column beside the list; phones fold it into one button that opens it.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, space } from '@/lib/theme';
import type { Category } from '@/lib/types';

interface Props {
  categories: Category[];
  /** Items per category uid, 'all' for the total and 'upnext' for Up next. */
  counts: Map<string, number>;
  selected: string | 'all';
  onSelect: (uid: string | 'all') => void;
  onNew: () => void;
  /** Leave out "Up next" and "+ New category" (the Sheet tab: All and the categories). */
  plain?: boolean;
}

function Tab({ label, count, selected, onPress, color = colors.text }: {
  label: string; count?: number; selected?: boolean; onPress: () => void; color?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40,
        paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius,
        borderLeftWidth: 3, borderLeftColor: selected ? colors.accent : 'transparent',
        backgroundColor: selected ? colors.chip : pressed || hovered ? colors.card : 'transparent',
      })}>
      <Text style={{ flex: 1, color: selected ? colors.text : color, fontSize: 15, fontWeight: selected ? '700' : '400' }} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && <Text style={{ color: colors.muted, fontSize: 13 }}>{count}</Text>}
    </Pressable>
  );
}

export function CategoryTabs({ categories, counts, selected, onSelect, onNew, plain }: Props) {
  return (
    <View accessibilityRole="tablist" style={{ gap: 2 }}>
      {!plain && <Tab label="★ Up next" count={counts.get('upnext') ?? 0} selected={selected === 'upnext'} onPress={() => onSelect('upnext')} color={colors.warm} />}
      <Tab label="All" count={counts.get('all') ?? 0} selected={selected === 'all'} onPress={() => onSelect('all')} />
      {categories.map((c) => (
        <Tab key={c.uid} label={c.name} count={counts.get(c.uid) ?? 0} selected={selected === c.uid} onPress={() => onSelect(c.uid)} />
      ))}
      {!plain && <Tab label="+ New category" color={colors.warm} onPress={onNew} />}
    </View>
  );
}

/** Phones: "Category: Movie ▾", which opens the same list of tabs. */
export function CategoryPicker(props: Props) {
  const [open, setOpen] = useState(false);
  const current = props.categories.find((c) => c.uid === props.selected);
  return (
    <View style={{ gap: space.xs }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md,
          backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder,
        }}>
        <Text style={{ color: colors.muted, fontSize: 15 }}>Category</Text>
        <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
          {current?.name ?? (props.selected === 'upnext' ? '★ Up next' : 'All')}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{props.counts.get(current?.uid ?? props.selected) ?? 0}</Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={{ backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder, padding: space.xs }}>
          <CategoryTabs {...props}
            onSelect={(uid) => { setOpen(false); props.onSelect(uid); }}
            onNew={() => { setOpen(false); props.onNew(); }} />
        </View>
      )}
    </View>
  );
}
