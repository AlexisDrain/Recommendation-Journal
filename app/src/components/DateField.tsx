// A date in the editor: its label above a box with the date and a × to clear it.
//   Recommended on
//   [ Oct 21, 2026            × ]
// Two sit side by side when there's room (the editor wraps them in a row), and stack on narrow phones.
// Old entries may only know the year ("2019") or month; those show as text until you tap them.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDate, today } from '@/lib/dates';
import { colors, radius, space } from '@/lib/theme';
import { DatePicker } from './DatePicker';

/** The narrowest a date box gets; two side by side need twice this plus the gap. */
export const DATE_WIDTH = 180;

export function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (d: string | null) => void }) {
  const [picking, setPicking] = useState(false);
  const full = !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <View style={{ flexGrow: 1, flexBasis: DATE_WIDTH, gap: space.xs }}>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md,
        backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius,
      }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          {full || picking ? (
            <DatePicker value={full ? value : today()} onChange={onChange} />
          ) : (
            <Pressable onPress={() => (value ? setPicking(true) : onChange(today()))} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={value ? `${label}: ${formatDate(value)}` : `Add ${label.toLowerCase()} date`}>
              <Text style={{ color: value ? colors.accent : colors.muted, fontSize: 16, fontWeight: value ? '600' : '400' }}>
                {value ? formatDate(value) : 'Add date'}
              </Text>
            </Pressable>
          )}
        </View>
        {value && (
          <Pressable onPress={() => { setPicking(false); onChange(null); }} hitSlop={10}
            accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`}>
            <Text style={{ color: colors.muted, fontSize: 18 }}>×</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
