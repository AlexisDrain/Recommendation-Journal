import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { requestSync } from '@/db/sync';
import { useDisplayModeLoaded, useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';
import { installWebHead } from '@/lib/webHead';

installWebHead();

export default function RootLayout() {
  const theme = useThemeName();
  const displayLoaded = useDisplayModeLoaded();

  // Pick up changes from the Google Sheet (if connected) on launch and when the app comes back.
  useEffect(() => {
    requestSync(0);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') requestSync(0); });
    return () => sub.remove();
  }, []);

  if (!displayLoaded) return null; // reading the saved display setting (a few ms)

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
