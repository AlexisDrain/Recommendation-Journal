import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text } from 'react-native';
import { useThemeName } from '@/lib/displayMode';
import { formatDate, toDate, toDateString } from '@/lib/dates';
import { colors } from '@/lib/theme';

/** Just the tappable date: iOS inline compact picker, Android dialog. (Web: DatePicker.web.tsx) */
export function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const theme = useThemeName();
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker value={toDate(value)} mode="date" display="compact" themeVariant={theme}
        accentColor={colors.accent} onValueChange={(_, d) => onChange(toDateString(d))} />
    );
  }
  return (
    <Pressable hitSlop={8}
      onPress={() => DateTimePickerAndroid.open({ value: toDate(value), mode: 'date', onValueChange: (_, d) => onChange(toDateString(d)) })}>
      <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>{formatDate(value)}</Text>
    </Pressable>
  );
}
