import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { requestSync } from '@/db/sync';
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
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') requestSync(0); });
    return () => sub.remove();
  }, []);

  if (welcomeSeen === null || !displayLoaded) return null; // reading saved settings (a few ms)

  // Until the welcome is finished only the welcome screen exists; finishing it flips the guards
  // and Expo Router moves to the tabs on its own.

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={welcomeSeen}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!welcomeSeen}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}
