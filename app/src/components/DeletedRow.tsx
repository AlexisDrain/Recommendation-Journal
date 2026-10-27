// One deleted recommendation in "Recently deleted": when it was deleted, how long it can still be
// brought back, and a Restore button.
import { memo } from 'react';
import { Text, View } from 'react-native';
import { DELETED_DAYS } from '@/db/store';
import { formatDate, toDateString } from '@/lib/dates';
import { colors, radius, space } from '@/lib/theme';
import type { Category, Item } from '@/lib/types';
import { Chip } from './ui';

export const DeletedRow = memo(function DeletedRow({ item, category, onRestore }: {
  item: Item;
  category?: Category;
  onRestore: (item: Item) => void;
}) {
  const deletedAt = new Date(item.updatedAt); // stamped in UTC: shown as your own date
  const left = DELETED_DAYS - Math.floor((Date.now() - deletedAt.getTime()) / 86_400_000);
  const meta = [
    item.author && `by ${item.author}`,
    category && `${category.name}${category.deleted ? ' (deleted too: restoring brings it back)' : ''}`,
    `deleted ${formatDate(toDateString(deletedAt))}`,
  ].filter(Boolean).join(' · ');
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, marginBottom: space.sm,
      borderColor: colors.cardBorder, borderWidth: 1, borderRadius: radius, padding: space.md, paddingLeft: space.lg,
      borderLeftWidth: 4, borderLeftColor: colors.danger,
    }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{item.title}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{meta}</Text>
        <Text style={{ color: left <= 3 ? colors.danger : colors.muted, fontSize: 13 }}>
          {left > 1 ? `Erased for good in ${left} days` : left === 1 ? 'Erased for good tomorrow' : 'Erased for good soon'}
        </Text>
      </View>
      <Chip label="↺ Restore" color={colors.success} onPress={() => onRestore(item)} />
    </View>
  );
});
