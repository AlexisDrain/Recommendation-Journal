// What the category form's Add / Save button does, kept apart from the form so it can be tested.
import { store } from '@/db/store';
import type { Category } from '@/lib/types';
import type { CategoryDraft } from './CategoryFields';

/**
 * Saves the form: changes `category`, or makes a new one. Saves first, then tells `onSaved`.
 * (It used to be `onSaved?.(await store.categories.create(draft))`, and `?.` skips everything in
 * its brackets when there's no onSaved, the save too. The Categories tab passes none, so a new
 * category made there was never saved: the card closed and nothing appeared.)
 */
export async function saveCategory(draft: CategoryDraft, category?: Category | null, onSaved?: (c: Category) => void): Promise<Category> {
  let saved: Category;
  if (category) {
    await store.categories.update(category.uid, draft);
    saved = { ...category, ...draft };
  } else {
    saved = await store.categories.create(draft);
  }
  onSaved?.(saved);
  return saved;
}
