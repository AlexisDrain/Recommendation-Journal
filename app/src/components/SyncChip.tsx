// "⟳ Sync" on the list: shows when the Google Sheet is catching up (it does by itself a few
// seconds after each change), and syncs right away when tapped. Only shown when a sheet is connected.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getConnection, syncNow, useSyncStatus } from '@/db/sync';
import { colors } from '@/lib/theme';
import { Chip } from './ui';

export function SyncChip() {
  const [connected, setConnected] = useState(false);
  const { running, error } = useSyncStatus();

  // Connecting or disconnecting happens in Settings, so look again whenever this tab is shown.
  useFocusEffect(useCallback(() => {
    getConnection().then((c) => setConnected(!!c), () => setConnected(false));
  }, []));

  if (!connected) return null;
  const label = running ? 'Syncing…' : error ? '⚠ Sync failed' : '⟳ Sync';
  // The reason for a failure is shown along the bottom of the list, and in Settings → Google Sheet.
  return <Chip label={label} selected={running} color={error && !running ? colors.danger : colors.accent}
    onPress={running ? undefined : () => void syncNow().catch(() => {})} />;
}
