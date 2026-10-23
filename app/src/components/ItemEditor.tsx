// The add / edit panel for one recommendation. Only the title is needed: everything else has a
// sensible default (the category you're looking at, "want to", recommended today), so adding is
// type → Enter → Save.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { categoryNamed, store, useData } from '@/db/store';
import { withArticle } from '@/lib/categories';
import { today } from '@/lib/dates';
import { dropDraft, getDraft, keepDraft } from '@/lib/drafts';
import { RATINGS } from '@/lib/rating';
import { hasTitle, people } from '@/lib/search';
import { colors, radius, space } from '@/lib/theme';
import type { Item, Rating, Status } from '@/lib/types';
import { CategoryFields, emptyCategoryDraft, type CategoryDraft } from './CategoryFields';
import { DateField } from './DateField';
import { Panel, useCloseHandler, useCloseRequest, useOpening } from './Panel';
import { Button, Chip, Input, styles } from './ui';

/** Above this many categories the panel shows only the most-used ones, with a "+ N more" chip. */
const FEW_CATEGORIES = 8;
const MOST_USED = 6;

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
  /** A priority (placed last when added). */
  upNext?: boolean;
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
  const { register, requestClose } = useCloseRequest(props.onClose);
  return (
    <Panel visible={props.visible} onClose={requestClose} maxWidth={600}>
      {opening.key > 0 && <ItemForm key={opening.key} {...opening.props} registerClose={register} />}
    </Panel>
  );
}

function ItemForm({ item, start, onClose, onSaved, onDeleted, registerClose }: Props & {
  registerClose?: (fn: (() => void) | null) => void;
}) {
  const { categories, items } = useData();
  const shown = categories.filter((c) => !c.hidden || c.uid === item?.categoryUid);
  // What the panel shows without a draft: the saved item, or a new one with its defaults.
  const [base] = useState<ItemDraft>(() => item ? { ...item, upNext: item.queuePos != null } : {
    title: '', author: '', categoryUid: shown[0]?.uid ?? '', status: 'want', rating: null, recommendedBy: '', note: '',
    recommendedOn: today(), doneOn: null, ...start,
  });
  // A draft left here before (closed without saving). For a new one, only if it's the same title
  // you're adding now (or you didn't type one): adding something else starts fresh.
  const draftKey = item?.uid ?? 'new';
  const [restored] = useState(() => {
    const d = getDraft(draftKey);
    return d && (item || !start?.title || d.fields.title === start.title) ? d : null;
  });
  const [draft, setDraft] = useState<ItemDraft>(() => (restored ? { ...base, ...(restored.fields as Partial<ItemDraft>) } : base));
  const [newCategory, setNewCategory] = useState<CategoryDraft | null>(() => (restored?.newCategory as CategoryDraft | null) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const everyone = useMemo(() => people(items), [items]);
  // Many categories would fill the panel with chips: past FEW_CATEGORIES, show the chosen one and
  // the most-used ones (in their usual order), and a "+ N more" chip for the rest.
  const [allCategories, setAllCategories] = useState(false);
  const fewCategories = useMemo(() => {
    if (shown.length <= FEW_CATEGORIES) return shown;
    const used = new Map<string, number>();
    for (const i of items) used.set(i.categoryUid, (used.get(i.categoryUid) ?? 0) + 1);
    const top = new Set([...shown].sort((a, b) => (used.get(b.uid) ?? 0) - (used.get(a.uid) ?? 0)).slice(0, MOST_USED).map((c) => c.uid));
    top.add(draft.categoryUid);
    return shown.filter((c) => top.has(c.uid));
  }, [shown, items, draft.categoryUid]);
  const chips = allCategories ? shown : fewCategories;

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
      const { upNext, ...rest } = draft;
      const fields = { ...rest, categoryUid, queuePos: undefined };
      const wanted = !!upNext && draft.status === 'want'; // done things stop being a priority
      if (item) {
        await store.items.update(item.uid, fields);
        if (wanted && item.queuePos == null) await store.upNext.add(item.uid);
        if (!wanted && item.queuePos != null && draft.status === 'want') await store.upNext.remove(item.uid);
        onSaved?.(null, false);
      } else {
        const created = await store.items.create(fields);
        if (wanted) await store.upNext.add(created.uid);
        onSaved?.(created, true);
      }
      dropDraft(draftKey);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Closing without saving (×, tapping outside, Escape) keeps what you changed as a draft on this
  // device; nothing is saved until you press Save / Add. Opening it again brings the draft back.
  const changed = JSON.stringify(draft) !== JSON.stringify(base) || newCategory !== null;
  const close = () => {
    if (changed) keepDraft(draftKey, draft as unknown as Record<string, unknown>, newCategory as unknown as Record<string, unknown> | null);
    else dropDraft(draftKey);
    onClose();
  };
  useCloseHandler(registerClose, close);
  /** Throw the draft away: back to the saved version (or an empty new one). */
  const discard = () => {
    dropDraft(draftKey);
    setDraft(base);
    setNewCategory(null);
    setError(null);
  };

  const remove = async () => {
    if (!item) return; // no "are you sure?": the list offers Undo instead
    await store.items.remove(item.uid);
    dropDraft(draftKey);
    onDeleted?.(item);
    onClose();
  };

  let section = 0;
  const n = () => ++section; // sections are numbered as they're drawn, so a hidden one leaves no gap

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: space.md }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', flex: 1 }}>
          {item ? 'Edit' : `Add ${withArticle(category?.noun || 'recommendation')}`}
        </Text>
        <Pressable onPress={close} style={{ marginLeft: space.md }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: colors.muted, fontSize: 22 }}>×</Text>
        </Pressable>
      </View>

      <Section n={n()} title="What is it?" />
      <Input placeholder="Title" value={draft.title} onChangeText={(title) => set({ title })}
        autoFocus={!item && !draft.title} returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Title" />
      {duplicate && <Text style={{ color: colors.warm }}>Already on your list in this category.</Text>}
      <Input placeholder="Author (or director, artist…), like Stephen King" value={draft.author}
        onChangeText={(author) => set({ author })} returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Author" />

      <Section n={n()} title="Category" />
      <View style={styles.chips}>
        {chips.map((c) => (
          <Chip key={c.uid} label={c.name} selected={!newCategory && draft.categoryUid === c.uid}
            onPress={() => { setNewCategory(null); set({ categoryUid: c.uid }); }} />
        ))}
        {shown.length > fewCategories.length && (
          <Chip label={allCategories ? 'Fewer' : `+ ${shown.length - fewCategories.length} more`}
            onPress={() => setAllCategories(!allCategories)} />
        )}
        <Chip label="+ New category" selected={!!newCategory} color={colors.warm}
          onPress={() => setNewCategory(newCategory ? null : emptyCategoryDraft())} />
      </View>
      {newCategory && (
        // A slightly darker box, so the new category's own fields read as one group.
        <View style={{ backgroundColor: colors.bg, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder, padding: space.md }}>
          <CategoryFields value={newCategory} onChange={setNewCategory} autoFocus ideas
            onSubmit={() => {
              const existing = categoryNamed(newCategory.name);
              if (existing) { setNewCategory(null); set({ categoryUid: existing.uid }); }
            }} />
        </View>
      )}

      <Section n={n()} title="Who recommended it, and why?" />
      <Input placeholder="Who? (my brother, a stranger in the park…)" value={draft.recommendedBy}
        onChangeText={(recommendedBy) => set({ recommendedBy })} accessibilityLabel="Recommended by" />
      {suggestions.length > 0 && (
        <View style={styles.chips}>
          {suggestions.map((p) => <Chip key={p} label={p} onPress={() => set({ recommendedBy: p })} />)}
        </View>
      )}
      <Input placeholder="Why? What did they say about it?" value={draft.note} onChangeText={(note) => set({ note })}
        multiline accessibilityLabel="Why it was recommended" />

      <Section n={n()} title={`${category?.doneLabel || 'Done'} it? When?`} />
      <View style={styles.chips}>
        <Chip label={category?.wantLabel || 'Want to'} selected={draft.status === 'want'} color={colors.warm}
          onPress={() => set({ status: 'want', rating: null })} />
        <Chip label={category?.doneLabel || 'Done'} selected={draft.status === 'done'} color={colors.success}
          onPress={() => set({ status: 'done', doneOn: draft.doneOn ?? today() })} />
      </View>
      <View style={[styles.chips, { alignItems: 'center' }]}>
        <Text style={{ color: colors.muted, marginRight: space.xs }}>Your rating</Text>
        {RATINGS.map((r) => (
          <Chip key={r.value} label={`${r.emoji} ${r.label}`} selected={draft.rating === r.value}
            onPress={() => draft.rating === r.value ? set({ rating: null })
              : set({ rating: r.value, status: 'done', doneOn: draft.doneOn ?? today() })} />
        ))}
      </View>
      <DateField label="Recommended on" value={draft.recommendedOn} onChange={(recommendedOn) => set({ recommendedOn })} />
      {draft.status === 'done' && (
        <DateField label={`${category?.doneLabel || 'Done'} on`} value={draft.doneOn} onChange={(doneOn) => set({ doneOn })} />
      )}

      {/* Priority: a pin on the thing itself, apart from its status. Done things aren't on it. */}
      {draft.status === 'want' && (
        <>
          <Section n={n()} title="Want to experience soon?" />
          <View style={styles.chips}>
            <Chip label={draft.upNext ? `★ Priority${item?.queuePos ? ` #${item.queuePos}` : ''}` : '☆ Make it a priority'} selected={!!draft.upNext}
              color={colors.warm} onPress={() => set({ upNext: !draft.upNext })} />
          </View>
        </>
      )}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {/* Unsaved changes (just made, or a draft kept from before): throw them away. */}
      {changed && (
        <Button title="Discard changes" onPress={discard} small color={colors.chip} textColor={colors.warm} />
      )}
      <Button title={item ? 'Save' : 'Add'} onPress={save} busy={busy} disabled={!draft.title.trim()} />
      {item && (
        <Button title="Delete" onPress={remove} small color={colors.chip} textColor={colors.danger} />
      )}
    </ScrollView>
  );
}

/** A numbered section title in the panel: "1. What is it?" */
function Section({ n, title }: { n: number; title: string }) {
  return (
    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space.sm }}>
      {n}. {title}
    </Text>
  );
}
