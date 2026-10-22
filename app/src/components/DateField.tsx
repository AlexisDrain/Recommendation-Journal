// A date row in the editor: "Recommended on  Oct 21, 2026  ×".
// Old entries may only know the year ("2019") or month; those show as text until you tap them.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDate, today } from '@/lib/dates';
import { colors, space } from '@/lib/theme';
import { DatePicker } from './DatePicker';
import { Row } from './ui';

export function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (d: string | null) => void }) {
  const [picking, setPicking] = useState(false);
  const full = !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <Row label={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {full || picking ? (
          <DatePicker value={full ? value : today()} onChange={onChange} />
        ) : (
          <Pressable onPress={() => (value ? setPicking(true) : onChange(today()))} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: value ? colors.accent : colors.muted, fontSize: 16, fontWeight: value ? '600' : '400' }}>
              {value ? formatDate(value) : 'Add date'}
            </Text>
          </Pressable>
        )}
        {value && (
          <Pressable onPress={() => { setPicking(false); onChange(null); }} hitSlop={10}
            accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`}>
            <Text style={{ color: colors.muted, fontSize: 18 }}>×</Text>
          </Pressable>
        )}
      </View>
    </Row>
  );
}
