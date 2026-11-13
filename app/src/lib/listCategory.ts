// Which category the list is showing: a category's uid, 'all', 'upnext' (Priority) or 'deleted'.
// Shared by the List page and, on wide screens, the Priority page (priority.tsx), so moving between
// them keeps your place: pick Priority on the List and you're on the Priority page; pick Movies there
// and you're back on the List, showing Movies.
import { useSyncExternalStore } from 'react';

let current = 'all';
const listeners = new Set<() => void>();

export const getListCategory = () => current;

export function setListCategory(uid: string) {
  if (uid === current) return;
  current = uid;
  listeners.forEach((fn) => fn());
}

export function useListCategory(): string {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getListCategory,
    getListCategory,
  );
}
