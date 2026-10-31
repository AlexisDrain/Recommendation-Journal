import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { requestSync, syncIfWaiting } from '@/db/sync';
import { useDisplayModeLoaded, useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';
import { installWebHead } from '@/lib/webHead';
import { useWelcomeSeen } from '@/lib/welcome';

installWebHead();

export default function RootLayout() {
  const theme = useThemeName();
  const displayLoaded = useDisplayModeLoaded();
  const welcomeSeen = useWelcomeSeen();

  // Pick up changes from the Google Sheet (if connected) on launch and when the app comes back.
  useEffect(() => {
    requestSync(0);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') requestSync(0);
      else syncIfWaiting(); // leaving: don't wait out the few seconds after a change
    });
    return () => sub.remove();
  }, []);

  if (welcomeSeen === null || !displayLoaded) return null; // reading saved settings (a few ms)

  // The navigation library's own colors, from the app's: it draws things like the side rail's hover
  // highlight (8% of `text`) with them, which its light default made invisible on the dark rail.
  const base = theme === 'light' ? DefaultTheme : DarkTheme;
  const navTheme: Theme = {
    ...base,
    colors: { ...base.colors, primary: colors.accent, background: colors.bg, card: colors.card, text: colors.text, border: colors.cardBorder },
  };

  // Until the welcome is finished only the welcome screen exists; finishing it flips the guards
  // and Expo Router moves to the tabs on its own.

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <ThemeProvider value={navTheme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={welcomeSeen}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!welcomeSeen}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
      </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
