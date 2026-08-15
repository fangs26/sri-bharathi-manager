import type { DateStr } from '@/data/types';

/**
 * All date maths runs on 'YYYY-MM-DD' strings anchored to UTC noon, so a
 * timezone or DST shift can never move a rent due date by a day.
 */

export function toDate(d: DateStr): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
}

export function fromDate(dt: Date): DateStr {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): DateStr {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(d: DateStr, n: number): DateStr {
  const dt = toDate(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromDate(dt);
}

export function dayBefore(d: DateStr): DateStr {
  return addDays(d, -1);
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * Add months keeping the day of month, clamped to the length of the target
 * month. Always measured from the original anchor, never chained, so
 * 31 Jan → 28 Feb → 31 Mar rather than collapsing to the 28th forever.
 */
export function addMonthsClamped(d: DateStr, n: number): DateStr {
  const dt = toDate(d);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const day = dt.getUTCDate();
  const targetMonth = m + n;
  const targetYear = y + Math.floor(targetMonth / 12);
  const normMonth = ((targetMonth % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, normMonth));
  return fromDate(new Date(Date.UTC(targetYear, normMonth, clampedDay, 12)));
}

/** Whole days from a to b (b - a). Same day = 0. */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** Inclusive night count for a stay spanning a..b. */
export function daysInclusive(a: DateStr, b: DateStr): number {
  return daysBetween(a, b) + 1;
}

export function isBefore(a: DateStr, b: DateStr): boolean {
  return a < b;
}
export function isAfter(a: DateStr, b: DateStr): boolean {
  return a > b;
}
export function minDate(a: DateStr, b: DateStr): DateStr {
  return a < b ? a : b;
}
export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a > b ? a : b;
}

/** '2026-08' */
export function monthKey(d: DateStr): string {
  return d.slice(0, 7);
}

export function startOfMonth(monthKeyOrDate: string): DateStr {
  return `${monthKeyOrDate.slice(0, 7)}-01`;
}

export function endOfMonth(monthKeyOrDate: string): DateStr {
  const key = monthKeyOrDate.slice(0, 7);
  const [y, m] = key.split('-').map(Number);
  return `${key}-${String(daysInMonth(y, m - 1)).padStart(2, '0')}`;
}

export function addMonthKey(key: string, n: number): string {
  return monthKey(addMonthsClamped(`${key}-01`, n));
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '12 Aug 2026' */
export function humanDate(d?: DateStr | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** '12 Aug' */
export function shortDate(d: DateStr): string {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS_SHORT[m - 1]}`;
}

/** 'August 2026' */
export function monthLabel(key: string): string {
  const [y, m] = key.slice(0, 7).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** 'Aug 2026' */
export function monthLabelShort(key: string): string {
  const [y, m] = key.slice(0, 7).split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** '12 Aug – 11 Sep' */
export function periodLabel(start: DateStr, end: DateStr): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** Indian financial year for receipt numbers: '2026-27'. */
export function financialYear(d: DateStr): string {
  const [y, m] = d.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
