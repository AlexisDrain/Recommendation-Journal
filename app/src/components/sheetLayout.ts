// Column sizes and scroll stops for the Sheet tab's table (SheetTable.tsx on phones,
// SheetTable.web.tsx in a browser). The first column is always Title, pinned on the left.
import { WIDTHS, type Column } from '@/db/rowFormat';

/** A column: one of the sheet's own, or "Category" (on the All page). */
export type SheetColumn = Column | 'Category';

export const HEADER_HEIGHT = 40;
/** Tall enough for two lines, so long titles and notes show more. */
export const ROW_HEIGHT = 44;

const natural = (c: SheetColumn) => Math.max(64, Math.round((c === 'Category' ? 18 : WIDTHS[c]) * 8));

/** The pinned Title column: its full width on a wide screen, about 40% of a phone's. */
export function titleWidth(view: number): number {
  return view > 0 ? Math.min(natural('Title'), Math.max(140, Math.round(view * 0.4))) : natural('Title');
}

export function columnWidths(columns: SheetColumn[], view: number): number[] {
  return columns.map((c) => (c === 'Title' ? titleWidth(view) : natural(c)));
}

/**
 * The sideways scroll positions where a column starts right next to the pinned Title, plus the
 * very end: stopping only here, no column is left half hidden behind the Title.
 */
export function scrollStops(widths: number[], view: number): number[] {
  const pinned = widths[0] ?? 0;
  const max = Math.max(0, widths.reduce((a, b) => a + b, 0) - view);
  const stops: number[] = [];
  let start = 0;
  for (const w of widths) {
    if (start >= pinned && start - pinned < max) stops.push(start - pinned);
    start += w;
  }
  stops.push(max);
  return stops;
}

/** Where an edge arrow goes from `x`: the column cut off at that edge comes fully into view. */
export function jumpTarget(stops: number[], x: number, view: number, pinned: number, direction: 1 | -1): number {
  const page = view - pinned;
  if (direction === 1) {
    const ahead = stops.filter((s) => s > x + 1);
    const inPage = ahead.filter((s) => s <= x + page + 1);
    return inPage.length ? inPage[inPage.length - 1] : ahead[0] ?? x;
  }
  const behind = stops.filter((s) => s < x - 1);
  const inPage = behind.filter((s) => s >= x - page - 1);
  return inPage.length ? inPage[0] : behind[behind.length - 1] ?? 0;
}
