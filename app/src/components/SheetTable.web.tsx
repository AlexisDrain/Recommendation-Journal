// The Sheet tab's table, in a browser: one plain HTML table in one scroll area, scrolling both
// ways. The header row is pinned by the browser (CSS "sticky"); every column scrolls sideways,
// Title too. The mouse wheel, Shift + wheel, a trackpad, middle-click scrolling and the scrollbars
// all work anywhere over the table. Round edge arrows show (and jump to) the columns that are off
// screen. Every other row is tinted, to follow a row across.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';
import { columnWidths, HEADER_HEIGHT, jumpTarget, ROW_HEIGHT, scrollStops, type SheetColumn } from './sheetLayout';

export type { SheetColumn } from './sheetLayout';
export interface SheetRow { uid: string; cells: Partial<Record<SheetColumn, string>> }

// The app's own text font (React Native Web's), which plain HTML doesn't pick up by itself.
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function SheetTable({ columns, rows }: { columns: SheetColumn[]; rows: SheetRow[] }) {
  useThemeName(); // redraw when the display changes (dark / light)
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const [viewWidth, setViewWidth] = useState(0);
  const widths = useMemo(() => columnWidths(columns, viewWidth), [columns, viewWidth]);

  const update = useCallback(() => {
    const el = box.current;
    if (!el) return;
    setViewWidth(el.clientWidth);
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

  /** Bring the column cut off at that edge fully into view. */
  const jump = (direction: 1 | -1) => {
    const el = box.current;
    if (!el) return;
    const to = jumpTarget(scrollStops(widths, el.clientWidth), el.scrollLeft, el.clientWidth, direction);
    el.scrollTo({ left: to, behavior: 'smooth' });
  };

  const cell = (i: number, header: boolean, alt = false): React.CSSProperties => ({
    minWidth: widths[i], maxWidth: widths[i], width: widths[i], boxSizing: 'border-box',
    padding: '0 8px', height: header ? HEADER_HEIGHT : ROW_HEIGHT, textAlign: 'left', verticalAlign: 'middle',
    whiteSpace: header ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis',
    background: header ? colors.chip : alt ? colors.rowAlt : colors.card, color: colors.text,
    fontSize: header ? 12 : 13, fontWeight: header || i === 0 ? 700 : 400,
    borderRight: `1px solid ${colors.bg}`, borderBottom: `1px solid ${colors.bg}`,
    ...(header && { position: 'sticky', top: 0, zIndex: 2 }), // the header row stays on top
  });
  // At most two lines in a cell, then "…".
  const twoLines: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '17px' };

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}>
      <div ref={box} onScroll={update} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: FONT }}>
          <thead>
            <tr>{columns.map((c, i) => <th key={c} style={cell(i, true)}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, n) => (
              <tr key={r.uid}>
                {columns.map((c, i) => (
                  <td key={c} style={cell(i, false, n % 2 === 1)} title={r.cells[c]}><div style={twoLines}>{r.cells[c]}</div></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more.right && <EdgeArrow side="right" onPress={() => jump(1)} />}
      {more.left && <EdgeArrow side="left" onPress={() => jump(-1)} />}
    </div>
  );
}

/** A round arrow on the table's edge: shows that more columns are that way, and jumps to them. */
function EdgeArrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress}
      aria-label={side === 'right' ? 'Show more columns to the right' : 'Show columns to the left'}
      style={{
        position: 'absolute', top: HEADER_HEIGHT + 12, [side]: 8, zIndex: 4,
        width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer',
        background: colors.accent, color: colors.bg, opacity: 0.95, boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
        fontSize: 22, fontWeight: 800, lineHeight: '38px', padding: 0, fontFamily: FONT,
      }}>
      {side === 'right' ? '›' : '‹'}
    </button>
  );
}
