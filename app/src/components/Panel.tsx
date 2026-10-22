// The pop-up panel used for adding and editing a recommendation, and for the export options.
//   Phones: slides up from the bottom (a "bottom sheet").
//   Wide screens: a dialog in the middle of the screen.
// Either way the dimmed background covers the whole screen, and tapping it closes the panel.
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '@/lib/theme';
import { useWide } from '@/lib/useLayout';

export function Panel({ visible, onClose, onDismiss, maxWidth = 560, children }: {
  visible: boolean;
  onClose: () => void;
  /** iOS: called once the panel has finished closing. */
  onDismiss?: () => void;
  maxWidth?: number;
  children: ReactNode;
}) {
  const wide = useWide();
  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={{ flex: 1, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center', padding: wide ? space.xl : 0 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: '#0009' }]} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', maxWidth, maxHeight: wide ? '90%' : '85%' }}>
          <View style={[
            { backgroundColor: colors.card, padding: space.xl, gap: space.md, flexShrink: 1 },
            wide
              ? { borderRadius: radius * 2, borderWidth: 1, borderColor: colors.cardBorder }
              : { borderTopLeftRadius: radius * 2, borderTopRightRadius: radius * 2, paddingBottom: space.xl * 2 },
          ]}>
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/**
 * For a form inside a Panel: a new `key` each time the panel opens (so the form starts fresh),
 * and the props it was opened with, kept while it slides closed (so it doesn't go blank or
 * change mode on the way out). `key` is 0 until the panel has opened once.
 */
export function useOpening<P extends { visible: boolean }>(props: P): { key: number; props: P } {
  const [state, setState] = useState({ visible: props.visible, key: props.visible ? 1 : 0, props });
  if (props.visible !== state.visible) {
    // Adjusting state while rendering: React's pattern for "reset when a prop changes".
    setState({ visible: props.visible, key: state.key + (props.visible ? 1 : 0), props: props.visible ? props : state.props });
  }
  return { key: state.key, props: props.visible ? props : state.props };
}
