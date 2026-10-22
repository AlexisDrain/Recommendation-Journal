// Dates are stored as text: "2026-10-21", or "2026-10" / "2026" when only the month or year is
// known (old lists often only say "read in 2019"). They sort correctly as plain text.

const pad = (n: number) => String(n).padStart(2, '0');

/** Today on this device, "2026-10-21". */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10-21" → a Date at local midnight (for the date pickers). Partial dates use the 1st. */
export function toDate(s: string | null): Date {
  const [y, m = 1, d = 1] = (s ?? today()).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-21" → "Oct 21, 2026"; "2026-10" → "Oct 2026"; "2026" → "2026". */
export function formatDate(s: string | null): string {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  if (!m) return y;
  if (!d) return `${MONTHS[Number(m) - 1]} ${y}`;
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/**
 * Reads a date typed into the sheet or found in an import. Understands 2026-10-21, 10/21/2026,
 * 10-21-2026, 2026-10, a lone year, "Oct 21, 2026", and spreadsheet day numbers (45951).
 * Returns null when it can't tell.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return valid(+m[3], +m[1], +m[2]) ?? valid(+m[3], +m[2], +m[1]); // US order first, then day-first
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${pad(+m[2])}`;
  m = s.match(/^(\d{4})(?:\.0)?$/);
  if (m && +m[1] >= 1900 && +m[1] <= 2100) return m[1];
  m = s.match(/^(\d{5})(?:\.\d+)?$/); // a spreadsheet's day number: days since Dec 30, 1899
  if (m) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86_400_000);
    return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /[a-z]/i.test(s)) return toDateString(new Date(t));
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** "Updated" times: UTC, to the second, "2026-10-21T18:30:00Z". They compare as plain text. */
export const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';
