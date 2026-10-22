// A short message along the bottom of the list ("Deleted “Dune”. Undo"). Goes away by itself.
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, space } from '@/lib/theme';

export interface ToastMessage { text: string; action?: { label: string; run: () => void } }

export function Toast({ message, onHide }: { message: ToastMessage | null; onHide: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, 6000);
    return () => clearTimeout(t);
  }, [message, onHide]);
  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: space.lg, alignItems: 'center', paddingHorizontal: space.lg }}>
      <View accessibilityLiveRegion="polite" style={{
        flexDirection: 'row', alignItems: 'center', gap: space.lg, backgroundColor: colors.text, borderRadius: radius,
        paddingVertical: space.md, paddingHorizontal: space.lg, maxWidth: 560,
      }}>
        <Text style={{ color: colors.bg, flexShrink: 1 }}>{message.text}</Text>
        {message.action && (
          <Pressable onPress={() => { message.action!.run(); onHide(); }} hitSlop={10} accessibilityRole="button">
            <Text style={{ color: colors.bg, fontWeight: '700', textDecorationLine: 'underline' }}>{message.action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
