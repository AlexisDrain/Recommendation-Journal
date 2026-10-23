// First launch: a one-screen welcome, then a short overview of how the app works.
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Muted } from '@/components/ui';
import { useThemeName } from '@/lib/displayMode';
import { colors, radius, space } from '@/lib/theme';
import { page } from '@/lib/useLayout';
import { setWelcomeSeen } from '@/lib/welcome';

export default function WelcomeScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const [step, setStep] = useState<0 | 1>(0);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        ...page(520), flexGrow: 1, justifyContent: 'center', gap: space.xl,
        padding: space.xl, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl,
      }}
    >
      {step === 0 ? (
        <>
          <View style={{ alignItems: 'center', gap: space.md }}>
            <Text style={{ fontSize: 64, color: colors.warm }}>★</Text>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', textAlign: 'center' }}>Recommendation Journal</Text>
            <Text style={{ color: colors.muted, fontSize: 17, textAlign: 'center', lineHeight: 24 }}>
              Remember what people recommend to you,{'\n'}who told you, and why.
            </Text>
          </View>
          <Button title="Get started" onPress={() => setStep(1)} />
        </>
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>How it works</Text>
          <Step icon="+" color={colors.accent} title="Add it in seconds"
            body="Someone mentions a movie, a book, a game? Type the title in the box on the List tab and press Enter. Who told you and why are optional." />
          <Step icon="⌕" color={colors.accent} title="Already on your list?"
            body="The same box searches as you type: titles, authors, who recommended it and your notes." />
          <Step icon="✓" color={colors.success} title="When you've watched, read or played it"
            body="Open it, mark it done and rate it: ❌ bad, ✅ average, 👍 great, ❤️ exceptional." />
          <Step icon="⌂" color={colors.success} title="Private by design"
            body="Your list is stored only on this device. No account, no server, no tracking." />
          <Muted>Categories (Movie, Fiction book, Video game…) can be renamed, reordered or hidden in the Categories tab.</Muted>
          <Button title="Start my list" onPress={() => setWelcomeSeen(true)} />
        </>
      )}
    </ScrollView>
  );
}

function Step({ icon, color, title, body }: { icon: string; color: string; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, backgroundColor: colors.card, borderRadius: radius, padding: space.lg }}>
      <Text style={{ fontSize: 26, color, width: 30, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 21 }}>{body}</Text>
      </View>
    </View>
  );
}
