// The fields of a category: its name, and the words used for its items. While you type a new
// name, the words are guessed for you ("Flash game" → game / Want to play / Played) until you
// change one of them yourself.
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { CATEGORY_IDEAS, suggestWords } from '@/lib/categories';
import { colors, space } from '@/lib/theme';
import { Chip, Input, Muted, styles } from './ui';

/** A label above its box. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text>
      {children}
    </View>
  );
}

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
      <Field label="One is called (custom noun)">
        <Input placeholder="media" value={value.noun} onChangeText={(v) => setWord('noun', v)}
          autoCapitalize="none" accessibilityLabel="One is called (custom noun)" />
      </Field>
      <Field label="If not experienced">
        <Input placeholder="Want to experience" value={value.wantLabel}
          onChangeText={(v) => setWord('wantLabel', v)} accessibilityLabel="If not experienced" />
      </Field>
      <Field label="If done">
        <Input placeholder="Experienced" value={value.doneLabel}
          onChangeText={(v) => setWord('doneLabel', v)} accessibilityLabel="If done" />
      </Field>
      <Muted>For example: one is called a “movie”, if not experienced it’s “Want to watch”, and if done it’s “Watched”.</Muted>
    </View>
  );
}
