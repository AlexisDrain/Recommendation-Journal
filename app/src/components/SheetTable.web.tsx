// The Sheet tab's table, in a browser: one plain HTML table in one scroll area, scrolling both
// ways. The header row and the Title column are pinned by the browser (CSS "sticky"), so the
// mouse wheel, Shift + wheel, a trackpad, middle-click scrolling and the scrollbars all work
// anywhere over the table. Round edge arrows show (and jump to) the columns that are off screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { WIDTHS, type Column } from '@/db/rowFormat';
import { useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';

/** A column: one of the sheet's own, or "Category" (on the All page). */
export type SheetColumn = Column | 'Category';
export interface SheetRow { uid: string; cells: Partial<Record<SheetColumn, string>> }

const widthOf = (c: SheetColumn) => Math.max(64, Math.round((c === 'Category' ? 18 : WIDTHS[c]) * 8));
const PINNED = widthOf('Title');
const HEADER_HEIGHT = 40;
// The app's own text font (React Native Web's), which plain HTML doesn't pick up by itself.
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function SheetTable({ columns, rows }: { columns: SheetColumn[]; rows: SheetRow[] }) {
  useThemeName(); // redraw when the display changes (dark / light)
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const next = { left: el.scrollLeft > 8, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 8 };
    setMore((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  useEffect(() => {
    update();
    const el = box.current;
    if (!el) return;
    const resized = new ResizeObserver(update);
    resized.observe(el);
    return () => resized.disconnect();
  }, [update, rows.length]);

  /** Jump most of a screen left or right (a little overlap keeps your place). */
  const jump = (direction: 1 | -1) => {
    const el = box.current;
    if (el) el.scrollBy({ left: direction * Math.max(120, el.clientWidth - PINNED - 40), behavior: 'smooth' });
  };

  const cell = (c: SheetColumn, header: boolean): React.CSSProperties => ({
    minWidth: widthOf(c), maxWidth: widthOf(c), width: widthOf(c), boxSizing: 'border-box',
    padding: '0 8px', height: header ? HEADER_HEIGHT : 34, textAlign: 'left',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    background: header ? colors.chip : colors.card, color: colors.text,
    fontSize: header ? 12 : 13, fontWeight: header || c === 'Title' ? 700 : 400,
    borderRight: `1px solid ${colors.bg}`, borderBottom: `1px solid ${colors.bg}`,
    // the header row stays on top, the Title column on the left, and their corner above both
    ...(header && { position: 'sticky', top: 0, zIndex: c === 'Title' ? 3 : 2 }),
    ...(c === 'Title' && { position: 'sticky', left: 0, zIndex: header ? 3 : 1, borderRight: `2px solid ${colors.cardBorder}` }),
  });

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}>
      <div ref={box} onScroll={update} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: FONT }}>
          <thead>
            <tr>{columns.map((c) => <th key={c} style={cell(c, true)}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid}>{columns.map((c) => <td key={c} style={cell(c, false)} title={r.cells[c]}>{r.cells[c]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {more.right && <EdgeArrow side="right" onPress={() => jump(1)} />}
      {more.left && <EdgeArrow side="left" inset={PINNED} onPress={() => jump(-1)} />}
    </div>
  );
}

/** A round arrow on the table's edge: shows that more columns are that way, and jumps to them. */
function EdgeArrow({ side, inset = 0, onPress }: { side: 'left' | 'right'; inset?: number; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress}
      aria-label={side === 'right' ? 'Show more columns to the right' : 'Show columns to the left'}
      style={{
        position: 'absolute', top: HEADER_HEIGHT + 12, [side]: (side === 'left' ? inset : 0) + 8, zIndex: 4,
        width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer',
        background: colors.accent, color: colors.bg, opacity: 0.95, boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
        fontSize: 22, fontWeight: 800, lineHeight: '38px', padding: 0, fontFamily: FONT,
      }}>
      {side === 'right' ? '›' : '‹'}
    </button>
  );
}
