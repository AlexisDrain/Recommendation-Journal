// A list you put in order by dragging, like iOS's edit mode: each row has a ≡ grip on its right;
// hold it and drag the row up or down. The rest of the row stays tappable. Works with a finger on
// phones and with the mouse on the web. Meant for short lists (categories, Up next): every row is drawn.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Sortable from 'react-native-sortables';
import { colors, space } from '@/lib/theme';

export function SortableList<T>({ data, keyOf, renderRow, onReorder, label }: {
  data: T[];
  keyOf: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  /** The new order, after a drag. */
  onReorder: (data: T[]) => void;
  /** For screen readers: what one row is ("category"). */
  label: string;
}) {
  return (
    <Sortable.Grid
      columns={1}
      data={data}
      keyExtractor={keyOf}
      rowGap={space.sm}
      customHandle
      // Only the grip drags, so it can start at once. (The library's default waits 200 ms for a
      // long-press and cancels if you move first, which is how everyone uses a mouse.)
      dragActivationDelay={0}
      activeItemScale={1.02}
      activeItemShadowOpacity={0.3}
      inactiveItemOpacity={0.7}
      overDrag="vertical"
      onDragEnd={({ data: next }) => onReorder(next)}
      renderItem={({ item, index }) => (
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <View style={{ flex: 1 }}>{renderRow(item, index)}</View>
          <Sortable.Handle>
            <View accessibilityLabel={`Drag to move this ${label}`}
              style={{ width: 44, alignItems: 'center', justifyContent: 'center', cursor: 'grab' } as never}>
              <Text style={{ color: colors.muted, fontSize: 22 }}>≡</Text>
            </View>
          </Sortable.Handle>
        </View>
      )}
    />
  );
}
