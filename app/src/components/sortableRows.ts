/**
 * Which rows a SortableList has, ignoring their order: "a|b|c" for rows a, c, b. It changes when a
 * row is added or removed, not when one is moved, so the list can start afresh on the first two
 * without interrupting a drag. (On phones the drag-and-drop grid lays out its rows once, and a row
 * added later, like a new category made on the Categories tab, wasn't shown.)
 */
export function rowSet<T>(data: T[], keyOf: (item: T) => string): string {
  return data.map(keyOf).sort().join('|');
}
