// Column sizes and scroll stops for the Sheet tab's table (SheetTable.tsx on phones,
// SheetTable.web.tsx in a browser). The first column is always Title. Every column scrolls
// sideways, Title too: pinned, it left too little room for the rest.
import { WIDTHS, type Column } from '@/db/rowFormat';

/** A column: one of the sheet's own, or "Category" (on the All page). */
export type SheetColumn = Column | 'Category';

export const HEADER_HEIGHT = 40;
/** Tall enough for two lines, so long titles and notes show more. */
export const ROW_HEIGHT = 44;

const natural = (c: SheetColumn) => Math.max(64, Math.round((c === 'Category' ? 18 : WIDTHS[c]) * 8));

/** The Title column: its full width, or about 60% of a phone's screen, the next column peeking in. */
export function titleWidth(view: number): number {
  return view > 0 ? Math.min(natural('Title'), Math.max(160, Math.round(view * 0.6))) : natural('Title');
}

export function columnWidths(columns: SheetColumn[], view: number): number[] {
  return columns.map((c) => (c === 'Title' ? titleWidth(view) : natural(c)));
}

/**
 * The sideways scroll positions where a column starts at the left edge, plus the very end:
 * stopping only here, no column is left half hidden.
 */
export function scrollStops(widths: number[], view: number): number[] {
  const max = Math.max(0, widths.reduce((a, b) => a + b, 0) - view);
  const stops: number[] = [];
  let start = 0;
  for (const w of widths) {
    if (start < max) stops.push(start);
    start += w;
  }
  stops.push(max);
  return stops;
}

/** Where an edge arrow goes from `x`: the column cut off at that edge comes fully into view. */
export function jumpTarget(stops: number[], x: number, view: number, direction: 1 | -1): number {
  if (direction === 1) {
    const ahead = stops.filter((s) => s > x + 1);
    const inPage = ahead.filter((s) => s <= x + view + 1);
    return inPage.length ? inPage[inPage.length - 1] : ahead[0] ?? x;
  }
  const behind = stops.filter((s) => s < x - 1);
  const inPage = behind.filter((s) => s >= x - view - 1);
  return inPage.length ? inPage[0] : behind[behind.length - 1] ?? 0;
}
