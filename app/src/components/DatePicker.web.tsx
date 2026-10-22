// Web version of DatePicker: the browser's own date input.
import { useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';

export function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const theme = useThemeName();
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onChange(e.target.value);
      }}
      style={{
        background: colors.bg, color: colors.accent, border: `1px solid ${colors.cardBorder}`, borderRadius: 8,
        padding: '6px 8px', fontSize: 16, fontWeight: 600, colorScheme: theme, fontFamily: 'inherit',
      }}
    />
  );
}
