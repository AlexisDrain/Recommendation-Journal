import { useLayoutEffect, useRef, type ReactNode, type Ref, type RefObject } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { onThemeChange } from '../lib/displayMode';
import { colors, radius, space } from '../lib/theme';

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.card}>
      {(title || right) && (
        <View style={styles.cardHeader}>
          {title && <Text style={styles.cardTitle}>{title}</Text>}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

export function Button({
  title,
  onPress,
  color = colors.accent,
  textColor = colors.bg,
  disabled,
  busy,
  small,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: color, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }, small && { fontSize: 14 }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color = colors.accent, grow }: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  /** Share the row's width with the other growing chips (like two halves of a switch). */
  grow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, grow && { flexGrow: 1, flexBasis: 0, alignItems: 'center' }, selected && { backgroundColor: color, borderColor: color }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.bg, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A text box. Multiline ones grow with their text up to 200 points, then scroll. With a
 * `maxLength`, a count shows once the text gets near it.
 */
export function Input(props: TextInputProps) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  // Phones grow a multiline box by themselves; a browser's doesn't. Sized here rather than with
  // onContentSizeChange and state, which on the web goes round in a loop and crashes the page.
  useLayoutEffect(() => {
    const el = box.current;
    if (Platform.OS !== 'web' || !props.multiline || !el?.style) return;
    const s = getComputedStyle(el);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth)}px`;
  }, [props.value, props.multiline]);

  const length = props.value?.length ?? 0;
  const input = (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      ref={(el) => {
        box.current = el as unknown as HTMLTextAreaElement | null; // on the web, the <textarea> itself
        const { ref } = props as { ref?: Ref<unknown> };
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as RefObject<unknown>).current = el;
      }}
      style={[styles.input, props.multiline && { minHeight: 72, maxHeight: 200, textAlignVertical: 'top' }, props.style]}
    />
  );
  if (!props.maxLength) return input;
  // Always in this View, so the box isn't rebuilt (and doesn't lose the keyboard) when the count appears.
  return (
    <View style={{ gap: space.xs }}>
      {input}
      {length >= props.maxLength * 0.9 && (
        <Text style={[styles.muted, { textAlign: 'right', color: length >= props.maxLength ? colors.danger : colors.muted }]}>
          {length.toLocaleString()} / {props.maxLength.toLocaleString()} characters
        </Text>
      )}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <Text style={{ color: colors.danger, marginBottom: onRetry ? space.md : 0 }}>{message}</Text>
      {onRetry && <Button title="Retry" onPress={onRetry} small />}
    </Card>
  );
}

// Built from the current colors, and built again when the display changes (dark / light).
const makeStyles = () => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.lg,
    marginBottom: space.md,
    gap: space.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, gap: space.md },
  rowValue: { flexShrink: 0, alignItems: 'flex-end' },
  label: { color: colors.text, fontSize: 16, flexShrink: 1 },
  button: { borderRadius: radius, paddingVertical: 14, paddingHorizontal: space.lg, alignItems: 'center' },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: space.md },
  buttonText: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.chip,
    paddingVertical: 6,
    paddingHorizontal: space.md,
  },
  chipText: { color: colors.text, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
  },
  muted: { color: colors.muted, fontSize: 14 },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: 48 },
});

export let styles = makeStyles();
onThemeChange(() => {
  styles = makeStyles();
});
