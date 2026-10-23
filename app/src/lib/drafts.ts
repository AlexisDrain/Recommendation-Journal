// Unsaved drafts: what you typed in a panel and closed without pressing Save / Add. Kept on this
// device only (never in your list or the Google Sheet) until you open it again and save it, or
// discard it. One draft per recommendation (by its uid), plus one for a new recommendation ('new').
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = 'recjournal.drafts.v1';

export interface Draft {
  /** The panel's fields as you left them. */
  fields: Record<string, unknown>;
  /** A new category you were making in the panel, if any. */
  newCategory?: Record<string, unknown> | null;
  /** When it was left, for "from before". */
  at: string;
}

let drafts: Record<string, Draft> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

AsyncStorage.getItem(KEY).then((raw) => {
  try {
    const saved = raw ? (JSON.parse(raw) as Record<string, Draft>) : {};
    drafts = { ...saved, ...drafts }; // anything left while this was loading wins
    emit();
  } catch {
    // unreadable: start without drafts
  }
}, () => {});

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(drafts)).catch(() => {});
}

export const getDraft = (key: string): Draft | null => drafts[key] ?? null;

export function keepDraft(key: string, fields: Record<string, unknown>, newCategory?: Record<string, unknown> | null) {
  drafts = { ...drafts, [key]: { fields, newCategory: newCategory ?? null, at: new Date().toISOString() } };
  emit();
  persist();
}

export function dropDraft(key: string) {
  if (!(key in drafts)) return;
  const { [key]: _gone, ...rest } = drafts;
  drafts = rest;
  emit();
  persist();
}

/** All drafts; the screen redraws when they change. */
export function useDrafts(): Record<string, Draft> {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => drafts,
    () => drafts,
  );
}
