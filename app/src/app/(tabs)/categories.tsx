// Categories: put them in order (drag the ≡ grip), tap one to rename, hide or delete it, or add one.
// The order is the order of the list's category column and of the Google Sheet's tabs.
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CategoryEditor } from '@/components/CategoryEditor';
import { SortableList } from '@/components/SortableList';
import { Button, Card, Muted, styles } from '@/components/ui';
import { store, useData } from '@/db/store';
import { useThemeName } from '@/lib/displayMode';
import { colors, radius, space } from '@/lib/theme';
import type { Category } from '@/lib/types';
import { NARROW_PAGE, page } from '@/lib/useLayout';

export default function CategoriesScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const { categories, items } = useData();
  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = (uid: string) => items.filter((i) => i.categoryUid === uid).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, page(NARROW_PAGE)]}>
      <Card>
        <Muted>
          Each category is its own tab in your Google Sheet and in exports. Drag ≡ to change the order, tap a
          category to rename, hide or delete it.
        </Muted>
        <SortableList
          data={categories}
          keyOf={(c) => c.uid}
          label="category"
          onReorder={(next) => store.categories.reorder(next.map((c) => c.uid)).catch((e) => setError((e as Error).message))}
          renderRow={(c) => (
            <Pressable onPress={() => setEditing(c)} accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.chip : colors.bg, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder,
                paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 52, justifyContent: 'center',
              })}>
              <Text style={{ color: c.hidden ? colors.muted : colors.text, fontSize: 16 }}>
                {c.name}{c.hidden ? ' (hidden)' : ''}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {count(c.uid)} · {c.wantLabel} / {c.doneLabel}
              </Text>
            </Pressable>
          )}
        />
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        <View>
          <Button title="+ New category" onPress={() => setAdding(true)} small color={colors.chip} textColor={colors.text} />
        </View>
      </Card>
      <CategoryEditor visible={!!editing || adding} category={editing}
        onClose={() => { setEditing(null); setAdding(false); }} />
    </ScrollView>
  );
}
