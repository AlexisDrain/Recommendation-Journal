// Settings → Categories: reorder, rename, hide or delete them, and add new ones.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { store, useData } from '@/db/store';
import { colors, space } from '@/lib/theme';
import type { Category } from '@/lib/types';
import { CategoryEditor } from './CategoryEditor';
import { Button, Card, Muted } from './ui';

export function CategoriesCard() {
  const { categories, items } = useData();
  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const count = (uid: string) => items.filter((i) => i.categoryUid === uid).length;

  const arrow = (c: Category, dir: -1 | 1, label: string, enabled: boolean) => (
    <Pressable onPress={() => void store.categories.move(c.uid, dir)} disabled={!enabled} hitSlop={6}
      accessibilityRole="button" accessibilityLabel={`Move ${c.name} ${dir < 0 ? 'up' : 'down'}`}
      style={{ paddingHorizontal: space.sm, opacity: enabled ? 1 : 0.25 }}>
      <Text style={{ color: colors.accent, fontSize: 18 }}>{label}</Text>
    </Pressable>
  );

  return (
    <Card title="Categories">
      <Muted>Each category is its own tab in your Google Sheet and in exports. Tap one to rename, hide or delete it.</Muted>
      <View>
        {categories.map((c, i) => (
          <View key={c.uid} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: i ? 1 : 0, borderTopColor: colors.cardBorder }}>
            <Pressable onPress={() => setEditing(c)} style={{ flex: 1, paddingVertical: space.sm }} accessibilityRole="button">
              <Text style={{ color: c.hidden ? colors.muted : colors.text, fontSize: 16 }}>
                {c.name}{c.hidden ? ' (hidden)' : ''}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {count(c.uid)} · {c.wantLabel} / {c.doneLabel}
              </Text>
            </Pressable>
            {arrow(c, -1, '↑', i > 0)}
            {arrow(c, 1, '↓', i < categories.length - 1)}
          </View>
        ))}
      </View>
      <Button title="+ New category" onPress={() => setAdding(true)} small color={colors.chip} textColor={colors.text} />
      <CategoryEditor visible={!!editing || adding} category={editing}
        onClose={() => { setEditing(null); setAdding(false); }} />
    </Card>
  );
}
