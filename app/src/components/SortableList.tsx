// A list you put in order by dragging, like iOS's edit mode: each row has a ≡ grip on its right;
// hold it and drag the row up or down. The rest of the row stays tappable. Works with a finger on
// phones and with the mouse on the web. Meant for short lists (categories, Priority): every row is drawn.
// With `wholeRow`, the whole row drags instead (and isn't tappable): for a list you're only rearranging.
import type { ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import Sortable from 'react-native-sortables';
import { colors, space } from '@/lib/theme';

export function SortableList<T>({ data, keyOf, renderRow, onReorder, label, wholeRow = false }: {
  data: T[];
  keyOf: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  /** The new order, after a drag. */
  onReorder: (data: T[]) => void;
  /** For screen readers: what one row is ("category"). */
  label: string;
  /** Drag by the whole row, not just the grip. */
  wholeRow?: boolean;
}) {
  const grip = (
    <View accessibilityLabel={`Drag to move this ${label}`}
      style={{ width: 44, alignItems: 'center', justifyContent: 'center', cursor: 'grab' } as never}>
      <Text style={{ color: colors.muted, fontSize: 22 }}>≡</Text>
    </View>
  );
  return (
    <Sortable.Grid
      columns={1}
      data={data}
      keyExtractor={keyOf}
      rowGap={space.sm}
      customHandle
      // With the mouse a drag starts at once. (The library's default waits 200 ms for a long-press
      // and cancels if you move first, which is how everyone uses a mouse.) On a phone, a whole row
      // waits for a short hold, so swiping over the list still scrolls it.
      dragActivationDelay={wholeRow && Platform.OS !== 'web' ? 150 : 0}
      activeItemScale={1.02}
      activeItemShadowOpacity={0.3}
      inactiveItemOpacity={0.7}
      overDrag="vertical"
      onDragEnd={({ data: next }) => onReorder(next)}
      renderItem={({ item, index }) => wholeRow ? (
        <Sortable.Handle>
          <View style={{ flexDirection: 'row', alignItems: 'stretch', cursor: 'grab' } as never}>
            {/* Not tappable while rearranging: a press here is the start of a drag. */}
            <View style={{ flex: 1 }} pointerEvents="none">{renderRow(item, index)}</View>
            {grip}
          </View>
        </Sortable.Handle>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <View style={{ flex: 1 }}>{renderRow(item, index)}</View>
          <Sortable.Handle>{grip}</Sortable.Handle>
        </View>
      )}
    />
  );
}
