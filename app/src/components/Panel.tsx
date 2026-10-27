// The pop-up panel used for adding and editing a recommendation, and for the export options.
//   Phones: slides up from the bottom (a "bottom sheet").
//   Wide screens: a dialog in the middle of the screen.
// Either way the dimmed background covers the whole screen, and tapping it closes the panel.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
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

/**
 * Closing a panel saves (×, tapping outside, Escape): the form inside registers what closing
 * should do with `useCloseHandler`, and the panel's own close goes through `requestClose`.
 * With nothing registered, the panel just closes.
 */
export function useCloseRequest(onClose: () => void) {
  const handler = useRef<(() => void) | null>(null);
  const register = useCallback((fn: (() => void) | null) => { handler.current = fn; }, []);
  const requestClose = useCallback(() => (handler.current ?? onClose)(), [onClose]);
  return { register, requestClose };
}

/**
 * For a panel's scrolling form: keeps the box you're typing in visible above the keyboard. The
 * panel shrinks to sit above the keyboard, but its content doesn't scroll by itself, so the box
 * could end up hidden below the fold. Pass `scroll` and `onScroll` to the ScrollView, and `reveal`
 * to each box's onFocus (for moving between boxes while the keyboard stays open).
 */
export function useRevealFocused() {
  const scroll = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const reveal = useCallback(() => {
    // After the panel has settled into its new size.
    setTimeout(() => {
      const input = TextInput.State?.currentlyFocusedInput?.();
      const view = scroll.current;
      if (!input || !view) return;
      input.measureInWindow((_x, top, _w, height) => view.measureInWindow((_vx, viewTop, _vw, viewHeight) => {
        const below = top + height + space.md - (viewTop + viewHeight);
        const above = viewTop + space.md - top;
        if (below > 0) view.scrollTo({ y: offset.current + below, animated: true });
        else if (above > 0) view.scrollTo({ y: Math.max(0, offset.current - above), animated: true });
      }));
    }, 60);
  }, []);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    return () => sub.remove();
  }, [reveal]);
  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => { offset.current = e.nativeEvent.contentOffset.y; }, []);
  return { scroll, onScroll, reveal };
}

/** For the form inside a panel: what closing it does (see useCloseRequest). */
export function useCloseHandler(register: ((fn: (() => void) | null) => void) | undefined, onCloseRequest: () => void) {
  useEffect(() => {
    register?.(onCloseRequest);
    return () => register?.(null);
  });
}
