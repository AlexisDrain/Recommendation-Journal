// Web version of DatePicker: the browser's own date input, drawn plainly inside DateField's box.
// The app's font is set on it: otherwise some browsers (Edge on Windows) draw it in a serif font.
import { useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

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
        background: 'transparent', color: colors.accent, border: 'none', padding: '8px 0', width: '100%',
        fontSize: 16, fontWeight: 600, fontFamily: FONT, colorScheme: theme,
      }}
    />
  );
}
