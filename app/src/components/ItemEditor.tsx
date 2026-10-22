// The add / edit panel for one recommendation. Only the title is needed: everything else has a
// sensible default (the category you're looking at, "want to", recommended today), so adding is
// type → Enter → Save.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { categoryNamed, store, useData } from '@/db/store';
import { withArticle } from '@/lib/categories';
import { today } from '@/lib/dates';
import { RATINGS } from '@/lib/rating';
import { hasTitle, people } from '@/lib/search';
import { colors, space } from '@/lib/theme';
import type { Item, Rating, Status } from '@/lib/types';
import { CategoryFields, emptyCategoryDraft, type CategoryDraft } from './CategoryFields';
import { DateField } from './DateField';
import { Panel, useOpening } from './Panel';
import { Button, Chip, Input, Muted, styles } from './ui';

export interface ItemDraft {
  title: string;
  author: string;
  categoryUid: string;
  status: Status;
  rating: Rating | null;
  recommendedBy: string;
  note: string;
  recommendedOn: string | null;
  doneOn: string | null;
}

interface Props {
  visible: boolean;
  /** Editing this item; leave out to add a new one. */
  item?: Item | null;
  /** For a new item: what's filled in to begin with (the title typed in the search box, the category). */
  start?: Partial<ItemDraft>;
  onClose: () => void;
  onSaved?: (item: Item | null, added: boolean) => void;
  onDeleted?: (item: Item) => void;
}

export function ItemEditor(props: Props) {
  const opening = useOpening(props);
  return (
    <Panel visible={props.visible} onClose={props.onClose} maxWidth={600}>
      {opening.key > 0 && <ItemForm key={opening.key} {...opening.props} />}
    </Panel>
  );
}

function ItemForm({ item, start, onClose, onSaved, onDeleted }: Props) {
  const { categories, items } = useData();
  const shown = categories.filter((c) => !c.hidden || c.uid === item?.categoryUid);
  const [draft, setDraft] = useState<ItemDraft>(() => item ? { ...item } : {
    title: '', author: '', categoryUid: shown[0]?.uid ?? '', status: 'want', rating: null, recommendedBy: '', note: '',
    recommendedOn: today(), doneOn: null, ...start,
  });
  const [newCategory, setNewCategory] = useState<CategoryDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const everyone = useMemo(() => people(items), [items]);

  const set = (patch: Partial<ItemDraft>) => setDraft({ ...draft, ...patch });
  const category = newCategory ? { noun: newCategory.noun || 'media', wantLabel: newCategory.wantLabel, doneLabel: newCategory.doneLabel }
    : categories.find((c) => c.uid === draft.categoryUid);
  const duplicate = !item && !newCategory && hasTitle(items, draft.title, draft.categoryUid);
  const typed = draft.recommendedBy.trim().toLowerCase();
  const suggestions = everyone.filter((p) => p.toLowerCase() !== typed && (!typed || p.toLowerCase().includes(typed))).slice(0, 8);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let categoryUid = draft.categoryUid;
      if (newCategory) {
        if (!newCategory.name.trim()) throw new Error('Give the new category a name, or pick one of yours.');
        categoryUid = (await store.categories.create(newCategory)).uid;
      }
      if (!categoryUid) throw new Error('Pick a category.');
      const fields = { ...draft, categoryUid };
      if (item) {
        await store.items.update(item.uid, fields);
        onSaved?.(null, false);
      } else {
        onSaved?.(await store.items.create(fields), true);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return; // no "are you sure?": the list offers Undo instead
    await store.items.remove(item.uid);
    onDeleted?.(item);
    onClose();
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
          {item ? 'Edit' : `Add ${withArticle(category?.noun || 'recommendation')}`}
        </Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: colors.muted, fontSize: 22 }}>×</Text>
        </Pressable>
      </View>

      <Input placeholder="Title" value={draft.title} onChangeText={(title) => set({ title })}
        autoFocus={!item && !draft.title} returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Title" />
      {duplicate && <Text style={{ color: colors.warm }}>Already on your list in this category.</Text>}
      <Input placeholder="Author (or director, artist…), like Stephen King" value={draft.author}
        onChangeText={(author) => set({ author })} returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Author" />

      <View style={styles.chips}>
        {shown.map((c) => (
          <Chip key={c.uid} label={c.name} selected={!newCategory && draft.categoryUid === c.uid}
            onPress={() => { setNewCategory(null); set({ categoryUid: c.uid }); }} />
        ))}
        <Chip label="+ New category" selected={!!newCategory} color={colors.warm}
          onPress={() => setNewCategory(newCategory ? null : emptyCategoryDraft())} />
      </View>
      {newCategory && (
        <CategoryFields value={newCategory} onChange={setNewCategory} autoFocus ideas
          onSubmit={() => {
            const existing = categoryNamed(newCategory.name);
            if (existing) { setNewCategory(null); set({ categoryUid: existing.uid }); }
          }} />
      )}

      <View style={[styles.chips, { alignItems: 'center' }]}>
        <Text style={{ color: colors.muted, marginRight: space.xs }}>Your rating</Text>
        {RATINGS.map((r) => (
          <Chip key={r.value} label={`${r.emoji} ${r.label}`} selected={draft.rating === r.value}
            onPress={() => draft.rating === r.value ? set({ rating: null })
              : set({ rating: r.value, status: 'done', doneOn: draft.doneOn ?? today() })} />
        ))}
      </View>

      <Input placeholder="Who recommended it? (my brother, a stranger in the park…)" value={draft.recommendedBy}
        onChangeText={(recommendedBy) => set({ recommendedBy })} accessibilityLabel="Recommended by" />
      {suggestions.length > 0 && (
        <View style={styles.chips}>
          {suggestions.map((p) => <Chip key={p} label={p} onPress={() => set({ recommendedBy: p })} />)}
        </View>
      )}

      <Input placeholder="Why? What did they say about it?" value={draft.note} onChangeText={(note) => set({ note })}
        multiline accessibilityLabel="Why it was recommended" />

      <View style={styles.chips}>
        <Chip label={category?.wantLabel || 'Want to'} selected={draft.status === 'want'} color={colors.warm}
          onPress={() => set({ status: 'want', rating: null })} />
        <Chip label={category?.doneLabel || 'Done'} selected={draft.status === 'done'} color={colors.success}
          onPress={() => set({ status: 'done', doneOn: draft.doneOn ?? today() })} />
      </View>

      <DateField label="Recommended on" value={draft.recommendedOn} onChange={(recommendedOn) => set({ recommendedOn })} />
      {draft.status === 'done' && (
        <DateField label={`${category?.doneLabel || 'Done'} on`} value={draft.doneOn} onChange={(doneOn) => set({ doneOn })} />
      )}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button title={item ? 'Save' : 'Add'} onPress={save} busy={busy} disabled={!draft.title.trim()} />
      {item && (
        <Button title="Delete" onPress={remove} small color={colors.chip} textColor={colors.danger} />
      )}
      {!item && <Muted>Only the title is needed. Press Enter to add it.</Muted>}
    </ScrollView>
  );
}
