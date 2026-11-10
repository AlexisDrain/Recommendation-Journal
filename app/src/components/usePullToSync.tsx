// Pull down at the top of a list to sync (phones), when a Google Sheet is connected: the List,
// Series and Sheet tabs. Connecting happens in Settings, so it looks again whenever the tab is
// shown. A failed sync shows like any other (the Sync chip, the List's message).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';
import { getConnection, syncNow } from '@/db/sync';
import { colors } from '@/lib/theme';

/** A RefreshControl for the screen's scrolling list, or undefined (web, or no sheet connected). */
export function usePullToSync() {
  const [connected, setConnected] = useState(false);
  useFocusEffect(useCallback(() => {
    getConnection().then((c) => setConnected(!!c), () => setConnected(false));
  }, []));
  const [pulling, setPulling] = useState(false);
  const pull = useCallback(() => {
    setPulling(true);
    syncNow().catch(() => {}).finally(() => setPulling(false));
  }, []);
  return connected && Platform.OS !== 'web'
    ? <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={colors.accent} colors={[colors.accent]} />
    : undefined;
}
