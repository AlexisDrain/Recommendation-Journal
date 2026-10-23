// One recommendation in the list. Tap it to open it: that's where you mark it done and rate it.
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDate } from '@/lib/dates';
import { RATINGS, ratingEmoji } from '@/lib/rating';
import { colors, radius, space } from '@/lib/theme';
import type { Category, Item } from '@/lib/types';

export const ItemRow = memo(function ItemRow({ item, category, showCategory, onPress, flush }: {
  item: Item;
  category?: Category;
  showCategory: boolean;
  onPress: (item: Item) => void;
  /** No space below (in a list that spaces its rows itself). */
  flush?: boolean;
}) {
  const done = item.status === 'done';
  const meta = [
    item.author && `by ${item.author}`,
    showCategory && category?.name,
    done ? `${category?.doneLabel ?? 'Done'}${item.doneOn ? ` ${formatDate(item.doneOn)}` : ''}` : category?.wantLabel,
    item.recommendedBy && `from ${item.recommendedBy}`,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${meta}`}
      style={({ pressed }) => ({
        backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: radius,
        padding: space.md, paddingLeft: space.lg, marginBottom: flush ? 0 : space.sm, opacity: pressed ? 0.8 : 1,
        borderLeftWidth: 4, borderLeftColor: done ? colors.success : colors.warm,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
            {item.queuePos != null && <Text style={{ color: colors.warm }}>★ {item.queuePos}  </Text>}
            {item.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{meta}</Text>
          {item.note !== '' && (
            <Text style={{ color: colors.text, opacity: 0.8, fontSize: 14, fontStyle: 'italic' }} numberOfLines={2}>
              {item.note}
            </Text>
          )}
        </View>
        {item.rating ? <Text style={{ fontSize: 22 }} accessibilityLabel={RATINGS[item.rating - 1].label}>{ratingEmoji(item.rating)}</Text> : null}
      </View>
    </Pressable>
  );
});
