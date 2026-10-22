// One recommendation in the list. Tap it to edit. Things still on your list have a "✓ Watched"
// button: one tap marks it done (today), then the row asks how it was.
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDate } from '@/lib/dates';
import { RATINGS, ratingEmoji } from '@/lib/rating';
import { colors, radius, space } from '@/lib/theme';
import type { Category, Item, Rating } from '@/lib/types';
import { Chip } from './ui';

export const ItemRow = memo(function ItemRow({ item, category, showCategory, asking, onPress, onDone, onRate }: {
  item: Item;
  category?: Category;
  showCategory: boolean;
  /** Just marked done: show the rating buttons. */
  asking: boolean;
  onPress: (item: Item) => void;
  onDone: (item: Item) => void;
  onRate: (item: Item, rating: Rating) => void;
}) {
  const done = item.status === 'done';
  const meta = [
    showCategory && category?.name,
    done ? `${category?.doneLabel ?? 'Done'}${item.doneOn ? ` ${formatDate(item.doneOn)}` : ''}` : category?.wantLabel,
    item.recommendedBy && `from ${item.recommendedBy}`,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${meta}`}
      style={({ pressed }) => ({
        backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: radius,
        padding: space.md, paddingLeft: space.lg, marginBottom: space.sm, opacity: pressed ? 0.8 : 1,
        borderLeftWidth: 4, borderLeftColor: done ? colors.success : colors.warm,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{item.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{meta}</Text>
          {item.note !== '' && (
            <Text style={{ color: colors.text, opacity: 0.8, fontSize: 14, fontStyle: 'italic' }} numberOfLines={2}>
              {item.note}
            </Text>
          )}
        </View>
        {done ? (
          item.rating ? <Text style={{ fontSize: 22 }} accessibilityLabel={RATINGS[item.rating - 1].label}>{ratingEmoji(item.rating)}</Text> : null
        ) : (
          <Chip label={`✓ ${category?.doneLabel ?? 'Done'}`} onPress={() => onDone(item)} />
        )}
      </View>
      {asking && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
          <Text style={{ color: colors.muted }}>How was it?</Text>
          {RATINGS.map((r) => (
            <Chip key={r.value} label={`${r.emoji} ${r.label}`} selected={item.rating === r.value} onPress={() => onRate(item, r.value)} />
          ))}
        </View>
      )}
    </Pressable>
  );
});
