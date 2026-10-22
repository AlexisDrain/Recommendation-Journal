// The fields of a category: its name, and the words used for its items. While you type a new
// name, the words are guessed for you ("Flash game" → game / Want to play / Played) until you
// change one of them yourself.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { CATEGORY_IDEAS, suggestWords } from '@/lib/categories';
import { colors, space } from '@/lib/theme';
import { Chip, Input, Muted, styles } from './ui';

export interface CategoryDraft { name: string; noun: string; wantLabel: string; doneLabel: string }

export const emptyCategoryDraft = (name = ''): CategoryDraft => ({ name, ...suggestWords(name) });

export function CategoryFields({ value, onChange, autoFocus, ideas, onSubmit }: {
  value: CategoryDraft;
  onChange: (d: CategoryDraft) => void;
  autoFocus?: boolean;
  /** Show example names to tap (for a brand-new category). */
  ideas?: boolean;
  onSubmit?: () => void;
}) {
  // Words the user typed themselves aren't replaced by guesses any more.
  const [touched, setTouched] = useState<Set<keyof CategoryDraft>>(() => new Set(ideas ? [] : ['noun', 'wantLabel', 'doneLabel']));
  const setName = (name: string) => {
    const guess = suggestWords(name);
    const next = { ...value, name };
    for (const k of ['noun', 'wantLabel', 'doneLabel'] as const) if (!touched.has(k)) next[k] = guess[k];
    onChange(next);
  };
  const setWord = (k: 'noun' | 'wantLabel' | 'doneLabel', v: string) => {
    setTouched((t) => new Set(t).add(k));
    onChange({ ...value, [k]: v });
  };

  return (
    <View style={{ gap: space.sm }}>
      <Input placeholder="Category name, like “Flash game”" value={value.name} onChangeText={setName}
        autoFocus={autoFocus} returnKeyType="done" onSubmitEditing={onSubmit} accessibilityLabel="Category name" />
      {ideas && !value.name && (
        <View style={styles.chips}>
          {CATEGORY_IDEAS.map((idea) => <Chip key={idea} label={idea} onPress={() => setName(idea)} />)}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Text style={{ color: colors.muted, width: 92 }}>One is called</Text>
        <Input style={{ flex: 1 }} placeholder="media" value={value.noun} onChangeText={(v) => setWord('noun', v)}
          autoCapitalize="none" accessibilityLabel="What one item is called" />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Text style={{ color: colors.muted, width: 92 }}>On your list</Text>
        <Input style={{ flex: 1 }} placeholder="Want to experience" value={value.wantLabel}
          onChangeText={(v) => setWord('wantLabel', v)} accessibilityLabel="Word for things you want to try" />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Text style={{ color: colors.muted, width: 92 }}>Done</Text>
        <Input style={{ flex: 1 }} placeholder="Experienced" value={value.doneLabel}
          onChangeText={(v) => setWord('doneLabel', v)} accessibilityLabel="Word for things you've done" />
      </View>
      <Muted>For example: one is called a “movie”, on your list it’s “Want to watch”, and done it’s “Watched”.</Muted>
    </View>
  );
}
