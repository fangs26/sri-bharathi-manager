import type {
  Bill,
  BillItem,
  BillStatus,
  BillView,
  ChargePreset,
  DateStr,
  Payment,
  Stay,
} from '@/data/types';
import {
  addDays,
  addMonthsClamped,
  dayBefore,
  daysBetween,
  daysInclusive,
  daysInMonth,
  maxDate,
  minDate,
  today as todayStr,
  toDate,
} from './dates';

/**
 * The billing engine. Pure functions only — no storage, no React — so every
 * rule here is unit-testable and a UI change can never alter what someone owes.
 *
 * House rules encoded below:
 *  - Rent is charged in advance: a period's bill is due on the day it starts.
 *  - A period is identified by (stayId, periodStart), so re-running generation
 *    can never double-charge.
 *  - The last period of a stay is always prorated on the days actually stayed.
 *    The first period is prorated only when the stay says so.
 */

export interface Period {
  start: DateStr;
  end: DateStr;
  due: DateStr;
  /** the untruncated cycle this period belongs to, used for proration */
  cycleStart: DateStr;
  cycleEnd: DateStr;
  index: number;
}

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------- periods */

/** The anchor-day occurrence on or before `d`. */
function anchorOnOrBefore(d: DateStr, anchorDay: number): DateStr {
  const dt = toDate(d);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const day = Math.min(anchorDay, daysInMonth(y, m));
  const candidate = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (candidate <= d) return candidate;
  return addMonthsClamped(candidate, -1);
}

/**
 * Every period of a stay whose start falls on or before `upTo`.
 * Periods stop once the stay has ended.
 */
export function periodsFor(stay: Stay, upTo: DateStr = todayStr()): Period[] {
  const out: Period[] = [];
  const stayEnd = stay.toDate;

  if (stay.cycle === 'short_stay') {
    const end = stayEnd ?? upTo;
    if (end < stay.fromDate) return out;
    out.push({
      start: stay.fromDate,
      end,
      due: stay.fromDate,
      cycleStart: stay.fromDate,
      cycleEnd: end,
      index: 0,
    });
    return out;
  }

  // Where the repeating cycle is anchored.
  const anchor =
    stay.cycle === 'anniversary'
      ? stay.fromDate
      : anchorOnOrBefore(stay.fromDate, stay.anchorDay ?? toDate(stay.fromDate).getUTCDate());

  let index = 0;

  // A stub first period exists when the stay starts after the cycle anchor
  // (fixed-date billing and she joined mid-month).
  // Hard stop keeps a bad date from spinning forever (100 years of months).
  for (let guard = 0; guard < 1200; guard++) {
    const cycleStart = addMonthsClamped(anchor, guard);
    const cycleEnd = dayBefore(addMonthsClamped(anchor, guard + 1));

    // Skip cycles entirely before the stay began.
    if (cycleEnd < stay.fromDate) continue;
    // Stop once cycles begin after the stay ended.
    if (stayEnd && cycleStart > stayEnd) break;
    // Only bill periods that have started.
    if (cycleStart > upTo) break;

    const start = maxDate(cycleStart, stay.fromDate);
    const end = stayEnd ? minDate(cycleEnd, stayEnd) : cycleEnd;
    if (end < start) break;

    out.push({
      start,
      end,
      due: start,
      cycleStart,
      cycleEnd,
      index: index++,
    });
  }

  return out;
}

/** What rent this period costs, applying proration where the rules say so. */
export function rentForPeriod(stay: Stay, p: Period): number {
  if (stay.cycle === 'short_stay') {
    // `||` rather than `??`: a daily rate left at zero means it was never
    // filled in, and billing her nothing per night is never what was meant.
    const rate = stay.dailyRate || Math.round(stay.agreedRent / 30);
    return Math.round(rate * daysInclusive(p.start, p.end));
  }

  const fullDays = daysInclusive(p.cycleStart, p.cycleEnd);
  const actualDays = daysInclusive(p.start, p.end);
  if (actualDays >= fullDays) return stay.agreedRent;

  const isFirst = p.index === 0 && p.start > p.cycleStart;
  const isLast = !!stay.toDate && p.end === stay.toDate && p.end < p.cycleEnd;

  // A shortened last period is always prorated; a shortened first period only
  // when the stay was set up that way.
  if (isLast || (isFirst && stay.prorateFirst)) {
    return Math.round((stay.agreedRent * actualDays) / fullDays);
  }
  return stay.agreedRent;
}

/** When her next rent falls due, for the dashboard. */
export function nextDueDate(stay: Stay, from: DateStr = todayStr()): DateStr | null {
  if (stay.toDate && stay.toDate < from) return null;
  if (stay.cycle === 'short_stay') return stay.fromDate;
  const anchor =
    stay.cycle === 'anniversary'
      ? stay.fromDate
      : anchorOnOrBefore(stay.fromDate, stay.anchorDay ?? toDate(stay.fromDate).getUTCDate());
  for (let i = 0; i < 1200; i++) {
    const start = addMonthsClamped(anchor, i);
    if (start < from) continue;
    if (start < stay.fromDate) continue;
    if (stay.toDate && start > stay.toDate) return null;
    return start;
  }
  return null;
}

/* --------------------------------------------------------- generation */

export interface GenerationResult {
  bills: Bill[];
  items: BillItem[];
  /** amounts corrected on bills that already existed (vacate / open short stay) */
  updatedItems: BillItem[];
}

interface GenerateInput {
  stays: Stay[];
  existingBills: Bill[];
  existingItems: BillItem[];
  payments: Payment[];
  branchOf: (stay: Stay) => string;
  presets: ChargePreset[];
  upTo?: DateStr;
}

/**
 * Work out which bills are missing (and which open ones need their rent
 * corrected) without touching storage. Safe to run on every app start.
 */
export function planBills(input: GenerateInput): GenerationResult {
  const upTo = input.upTo ?? todayStr();
  const bills: Bill[] = [];
  const items: BillItem[] = [];
  const updatedItems: BillItem[] = [];

  const byKey = new Map<string, Bill>();
  for (const b of input.existingBills) byKey.set(`${b.stayId}|${b.periodStart}`, b);

  const paidByBill = new Map<string, number>();
  for (const p of input.payments) {
    if (!p.billId) continue;
    paidByBill.set(p.billId, (paidByBill.get(p.billId) ?? 0) + p.amount);
  }

  const autoPresets = input.presets.filter((p) => p.auto);
  const now = new Date().toISOString();

  for (const stay of input.stays) {
    for (const p of periodsFor(stay, upTo)) {
      const key = `${stay.id}|${p.start}`;
      const existing = byKey.get(key);
      const rent = rentForPeriod(stay, p);

      if (!existing) {
        const billId = uid('bill');
        bills.push({
          id: billId,
          stayId: stay.id,
          tenantId: stay.tenantId,
          branchId: input.branchOf(stay),
          periodStart: p.start,
          periodEnd: p.end,
          dueDate: p.due,
          createdAt: now,
        });
        items.push({ id: uid('item'), billId, type: 'rent', label: 'Room rent', amount: rent });
        for (const preset of autoPresets) {
          items.push({
            id: uid('item'),
            billId,
            type: preset.type,
            label: preset.label,
            amount: preset.amount,
          });
        }
        continue;
      }

      // The bill exists. Its rent can still legitimately change in two cases:
      // an open short stay accruing days, and a final period that got cut
      // short when she vacated. Never touch a bill that is already settled.
      const isOpenShort = stay.cycle === 'short_stay' && !stay.toDate;
      const isFinalTruncated = !!stay.toDate && p.end === stay.toDate;
      if (!isOpenShort && !isFinalTruncated) continue;

      const rentItem = input.existingItems.find(
        (it) => it.billId === existing.id && it.type === 'rent'
      );
      if (!rentItem || rentItem.amount === rent) continue;
      const alreadyPaid = paidByBill.get(existing.id) ?? 0;
      if (alreadyPaid > 0 && rent < alreadyPaid) continue; // never push a bill negative
      updatedItems.push({ ...rentItem, amount: rent });
    }
  }

  return { bills, items, updatedItems };
}

/* ------------------------------------------------------------- views */

export function computeBillView(
  bill: Bill,
  allItems: BillItem[],
  allPayments: Payment[],
  opts: { today?: DateStr; graceDays?: number } = {}
): BillView {
  const today = opts.today ?? todayStr();
  const grace = opts.graceDays ?? 0;
  const items = allItems.filter((it) => it.billId === bill.id);
  const gross = items.reduce((s, it) => s + it.amount, 0);
  const waived = bill.waivedAmount ?? 0;
  const total = Math.max(0, gross - waived);
  const paid = allPayments
    .filter((p) => p.billId === bill.id)
    .reduce((s, p) => s + p.amount, 0);
  const balance = total - paid;

  const overdueFrom = addDays(bill.dueDate, grace);
  const daysOverdue = balance > 0 && today > overdueFrom ? daysBetween(overdueFrom, today) : 0;

  let status: BillStatus;
  if (balance <= 0) status = waived > 0 && paid === 0 ? 'waived' : 'paid';
  else if (daysOverdue > 0) status = 'overdue';
  else if (paid > 0) status = 'partial';
  else status = 'due';

  return { ...bill, items, total, paid, balance, status, daysOverdue };
}

/** Worst status wins, so a bed tile shows the most urgent thing about her. */
const SEVERITY: Record<BillStatus, number> = {
  paid: 0,
  waived: 0,
  due: 1,
  partial: 2,
  overdue: 3,
};

export function worstStatus(views: BillView[]): BillStatus {
  let worst: BillStatus = 'paid';
  for (const v of views) if (SEVERITY[v.status] > SEVERITY[worst]) worst = v.status;
  return worst;
}

export function sumBalance(views: BillView[]): number {
  return views.reduce((s, v) => s + Math.max(0, v.balance), 0);
}
