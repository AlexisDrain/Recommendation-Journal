// Settings → Google Sheet, once connected: the Web app URL and secret key this device uses, so
// they're easy to copy onto another device. Folded away by default, and the key stays as dots
// until you choose to show it.
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import type { Connection } from '@/db/sync';
import { colors, radius, space } from '@/lib/theme';
import { Button, Muted } from './ui';

export function ConnectionDetails({ connection }: { connection: Connection }) {
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (what: string, text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      // No clipboard here (an old browser, say): the share sheet has its own Copy.
      await Share.share({ message: text }).catch(() => {});
    }
  };
  const label = (what: string, title: string) => (copied === what ? 'Copied ✓' : title);

  if (!open) {
    return <Button title="Show connection details" small color={colors.chip} textColor={colors.text} onPress={() => setOpen(true)} />;
  }

  return (
    <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder, padding: space.md }}>
      <Muted>To set up another device. Keep these private: anyone with both can read and change your sheet.</Muted>

      <Text style={{ color: colors.text, fontWeight: '600' }}>Web app URL</Text>
      <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{connection.url}</Text>
      <Button title={label('url', 'Copy URL')} small color={colors.chip} textColor={colors.text} onPress={() => void copy('url', connection.url)} />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>Secret key</Text>
        <Pressable onPress={() => setShowKey(!showKey)} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={showKey ? 'Hide secret key' : 'Show secret key'}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>{showKey ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      <Text selectable={showKey} style={{ color: colors.muted, fontSize: 13 }}>
        {showKey ? connection.secret : '•'.repeat(24)}
      </Text>
      <Button title={label('key', 'Copy key')} small color={colors.chip} textColor={colors.text} onPress={() => void copy('key', connection.secret)} />

      <Button title={label('both', 'Copy both')} small onPress={() => void copy('both', `${connection.url}#${connection.secret}`)} />
      <Muted>“Copy both” copies one line: on the other device, paste it into the Web app URL box and leave the key box empty.</Muted>

      <Button title="Hide connection details" small color={colors.chip} textColor={colors.text}
        onPress={() => { setOpen(false); setShowKey(false); }} />
    </View>
  );
}
