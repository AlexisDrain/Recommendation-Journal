// Add a category, or change one: its name, its words, hide it, delete it.
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { store, useData } from '@/db/store';
import { confirmAction } from '@/lib/confirm';
import { colors, space } from '@/lib/theme';
import type { Category } from '@/lib/types';
import { CategoryFields, emptyCategoryDraft, type CategoryDraft } from './CategoryFields';
import { Panel, useCloseHandler, useCloseRequest, useOpening, useRevealFocused } from './Panel';
import { Button, Muted, Row } from './ui';

interface Props {
  visible: boolean;
  /** Editing this one; leave out to add a new category. */
  category?: Category | null;
  onClose: () => void;
  onSaved?: (c: Category) => void;
}

export function CategoryEditor(props: Props) {
  const opening = useOpening(props);
  const { register, requestClose } = useCloseRequest(props.onClose);
  return (
    <Panel visible={props.visible} onClose={requestClose}>
      {opening.key > 0 && <CategoryForm key={opening.key} {...opening.props} registerClose={register} />}
    </Panel>
  );
}

function CategoryForm({ category, onClose, onSaved, registerClose }: Props & {
  registerClose?: (fn: (() => void) | null) => void;
}) {
  const { items } = useData();
  const [draft, setDraft] = useState<CategoryDraft>(() => category
    ? { name: category.name, noun: category.noun, wantLabel: category.wantLabel, doneLabel: category.doneLabel }
    : emptyCategoryDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = category ? items.filter((i) => i.categoryUid === category.uid).length : 0;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (category) {
        await store.categories.update(category.uid, draft);
        onSaved?.({ ...category, ...draft });
      } else {
        onSaved?.(await store.categories.create(draft));
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useCloseHandler(registerClose, onClose); // closing without saving just closes
  const { scroll, onScroll } = useRevealFocused();

  const remove = async () => {
    if (!category) return;
    const ok = await confirmAction(
      `Delete “${category.name}” and ALL its recommendations?`,
      `${count ? `All ${count} recommendation${count === 1 ? '' : 's'} in it will be deleted` : 'It will be deleted'}, on this device and from ` +
      'your Google Sheet if one is connected. This can’t be undone. To keep them, hide the category instead.',
      'Delete all',
    );
    if (!ok) return;
    await store.categories.remove(category.uid);
    onClose();
  };

  return (
    <ScrollView ref={scroll} onScroll={onScroll} scrollEventThrottle={32} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: space.md }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{category ? 'Edit category' : 'New category'}</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: colors.muted, fontSize: 22 }}>×</Text>
        </Pressable>
      </View>
      <CategoryFields key={category?.uid ?? 'new'} value={draft} onChange={setDraft} autoFocus={!category} ideas={!category} onSubmit={save} />
      {category && (
        <Row label="Hide this category">
          <Switch value={category.hidden} trackColor={{ true: colors.accent }}
            onValueChange={(hidden) => void store.categories.update(category.uid, { hidden }).then(onClose)} />
        </Row>
      )}
      {category && <Muted>Hidden categories are left off the list and the add screen. Their recommendations are kept.</Muted>}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title={category ? 'Save' : 'Add category'} onPress={save} busy={busy} disabled={!draft.name.trim()} />
        </View>
        {category && (
          <View style={{ flex: 1 }}>
            <Button title="Delete" onPress={remove} color={colors.danger} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
